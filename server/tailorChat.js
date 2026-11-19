/**
 * Tailor chat (prototype, /app/tailor): suggestions for one resume against one job description, each
 * tied to an exact line of the resume so the page can mark it, and free-text chat that returns edits
 * in the same shape.
 *
 * Every line the model may touch has an id:
 *   T title · S summary · E{i} a role (for adding a bullet) · E{i}B{j} a bullet · K the skills list
 * Edits: { target, op: "replace" | "add_bullet" | "remove" | "add_skills", after?, skills? }
 *
 * Honesty rule, enforced here as well as in the prompt: a number the resume (or the user's own message)
 * doesn't contain is never written into the resume – it becomes a "[number]" blank for the user to fill.
 */
import { callLLM } from "./llm.js";
import { tokenizeForMatch, buildResumeCorpus } from "../src/matchScore.js";
import { textAt, scoreImpact } from "../src/tailorEdits.js";

// A suggestion that lowers the job match by more than this (it drops the job's keywords) is left out.
const MAX_SCORE_LOSS = 2;

// Rough stem, so "integrations"/"integrated"/"integrating" count as the same claim.
const stem = (w) => w.replace(/[^a-z0-9+#]/g, "").replace(/(ations|ation|ings|ing|ers|ed|es|s)$/, "");
const stems = (text) => new Set(tokenizeForMatch(text).map(stem).filter((w) => w.length >= 3));
// Ordinary resume wording a rewrite may use freely, even when the job description also says it.
const GENERIC = stems(`led lead managed manage owned own drove drive built build shipped ship launched launch delivered deliver
  improved improve increased increase reduced reduce grew grow scaled scale created create designed design developed develop
  defined define tracked track analysed analyzed analyze used using worked collaborated partnered aligned align coordinated
  executed execute supported support helped help ran run prioritised prioritized prioritize translated translate wrote write
  product products feature features customer customers user users business company companies cross-functional functional
  data driven decisions decision adoption growth impact results outcomes quality process processes requirements roadmap
  strategy planning plan stakeholders stakeholder end-to-end experience skilled strong excellent proven track record
  turned turn converted made make set setup established introduced streamlined simplified clarified enabled ensured gathered
  identified researched tested validated measured monitored reviewed presented communicated documented maintained organised
  organized facilitated mentored coached trained hired onboarded negotiated resolved handled achieved reached completed
  every each per daily weekly monthly quarterly annual annually two three four five several multiple first key core main
  major new existing internal external within through via based throughout ongoing regular consistent clear faster better
  higher lower more less over under team teams people member members part whole across time times week weeks month months`);

/**
 * Job-description terms a rewrite introduces that the candidate never claimed (not in the resume, not
 * said in the chat). Writing them in would be inventing experience.
 */
function unsupportedClaims(text, ctx, { strict = false } = {}) {
  // strict (a brand-new bullet): every meaningful word must come from the resume or the candidate;
  // otherwise (rewording an existing line): only the job's own terms are checked.
  return [...stems(text)].filter((w) => (strict || ctx.jd.has(w)) && !ctx.supported.has(w) && !GENERIC.has(w));
}

/** What the candidate has claimed (resume + their own chat messages) and what the job asks for. */
export function claimContext(resume, jd, userText = "") {
  return {
    known: numbersIn(`${resumeLines(resume)}\n${userText}`),
    supported: stems(`${buildResumeCorpus(resume)}\n${userText}`),
    jd: stems(jd || ""),
  };
}

const MAX_SUGGESTIONS = 10;

/** The resume as numbered lines, for the prompt. */
export function resumeLines(resume) {
  const lines = [];
  if (resume?.title) lines.push(`[T] ${resume.title}`);
  if (resume?.summary) lines.push(`[S] ${resume.summary}`);
  (resume?.experience || []).forEach((role, i) => {
    lines.push(`[E${i}] ${[role.role, role.company, role.period].filter(Boolean).join(" · ")}`);
    (role.bullets || []).forEach((b, j) => b != null && lines.push(`  [E${i}B${j}] ${b}`));
  });
  (resume?.education || []).forEach((e) => lines.push(`(education) ${[e.degree, e.school, e.year].filter(Boolean).join(" · ")}`));
  if (resume?.skills?.length) lines.push(`[K] Skills: ${resume.skills.join(", ")}`);
  return lines.join("\n");
}

const numbersIn = (text) => new Set((String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "")));

/** Replace numbers the resume and the user never gave with a [number] blank. */
function withoutInventedNumbers(after, known) {
  let blanks = 0;
  const text = String(after || "").replace(/(?:₹|\$|Rs\.?\s?)?\d+(?:[.,]\d+)?\s?(?:%|\+|x|k|K|M|L|lakh|crore|cr)?/g, (match) => {
    const digits = (match.match(/\d+(?:[.,]\d+)?/) || [""])[0].replace(",", "");
    if (known.has(digits)) return match;
    blanks++;
    return "[number]";
  });
  return { text, blanks };
}

/**
 * Keep only well-formed edits on lines that exist; strip invented numbers. An edit that brings in job
 * terms the candidate never claimed comes back as { unsupported: [...] } so the caller asks instead.
 */
export function cleanEdit(edit, resume, ctx) {
  if (!edit || typeof edit !== "object") return null;
  const { target, op } = edit;
  if (!["replace", "add_bullet", "remove", "add_skills"].includes(op)) return null;
  if (textAt(resume, target) == null) return null;
  if (op === "add_skills") {
    if (target !== "K") return null;
    const have = new Set((resume.skills || []).map((s) => s.toLowerCase()));
    const wanted = (Array.isArray(edit.skills) ? edit.skills : []).map((s) => String(s).trim()).filter((s) => s && s.length <= 40 && !have.has(s.toLowerCase()));
    // A skill goes in only when the resume or the chat already shows it.
    const shown = wanted.filter((s) => [...stems(s)].every((w) => ctx.supported.has(w)));
    const unshown = wanted.filter((s) => !shown.includes(s));
    if (shown.length) return { target, op, skills: shown.slice(0, 8) };
    return unshown.length ? { unsupported: unshown.slice(0, 4) } : null;
  }
  if (op === "remove") return /^E\d+B\d+$/.test(target) ? { target, op } : null;
  if (op === "add_bullet" && !/^E\d+$/.test(target)) return null;
  if (op === "replace" && !/^(T|S|E\d+B\d+)$/.test(target)) return null;
  const after = String(edit.after || "").trim().slice(0, 600);
  // Same words, at most a full stop or capital letter different: not worth a suggestion.
  const plain = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!after || plain(after) === plain(textAt(resume, target))) return null;
  const unsupported = unsupportedClaims(after, ctx, { strict: op === "add_bullet" });
  if (unsupported.length) return { unsupported };
  const { text } = withoutInventedNumbers(after, ctx.known);
  return { target, op, after: text, blanks: (text.match(/\[number\]/g) || []).length };
}

/** "The job mentions merchant onboarding and UPI – have you done this?" for an edit that would invent it. */
function askAbout(terms, jd) {
  // Show the job's own wording: the first phrase in the job description containing each term.
  const phrases = terms.map((t) => {
    const m = new RegExp(`\\b[\\w/-]*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\w/-]*\\b`, "i").exec(jd || "");
    return m ? m[0] : t;
  });
  const list = [...new Set(phrases)].slice(0, 3).join(", ");
  return `The job mentions ${list}. Have you worked with ${phrases.length > 1 ? "any of these" : "this"}? Tell me where, and I'll add it.`;
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
}

const RULES = `Rules:
- Never invent experience, employers, tools, certifications or numbers. If the job asks for something the resume does not show, ask the candidate a question instead of writing it in.
- If a stronger bullet needs a metric you don't have, write "[number]" where it goes (e.g. "cut onboarding time by [number]%").
- Keep the candidate's facts; change wording, order of emphasis, and the job's own terms where the resume already supports them.
- A rewritten line may only mention teams, tools, domains and results that the same line (or the candidate in this chat) already states. To add something new, ask a question instead.
- Never change job titles or seniority (no "Senior", "Lead" or "Head" the resume doesn't already use for that person).
- Bullets: one line, start with a strong verb, at most about 25 words.
- Refer to resume lines only by their ids in square brackets (T, S, E0, E0B1, K).`;

const EDIT_SHAPE = `An edit is one of:
{"target":"S","op":"replace","after":"new text"}            (T, S or a bullet id like E0B1)
{"target":"E0","op":"add_bullet","after":"new bullet"}      (adds a bullet to role E0)
{"target":"E1B3","op":"remove"}                              (drops a weak or irrelevant bullet)
{"target":"K","op":"add_skills","skills":["SQL","Tableau"]} (only skills the resume already shows evidence of)`;

/** Suggestions for the resume against a job description. */
export async function suggestForJob({ resume, jd }) {
  const system = "You are a senior recruiter helping a candidate tailor their resume to one job. Return ONLY JSON.";
  const user = `JOB DESCRIPTION:
${jd.slice(0, 12000)}

RESUME (line ids in brackets):
${resumeLines(resume)}

${RULES}

${EDIT_SHAPE}

Return JSON:
{
  "jobTitle": "the job's title",
  "company": "the company, or empty",
  "intro": "one or two sentences: how well this resume fits the job and the biggest thing to fix",
  "suggestions": [
    {
      "priority": "must" | "nice",
      "title": "short label, e.g. 'Lead with stakeholder management'",
      "why": "one sentence tied to a specific requirement in the job description",
      "edit": <an edit, or null when you need to ask first>,
      "question": "a question for the candidate when the job needs something the resume doesn't show (else null)",
      "target": "for a question: the id of the line it is about (e.g. S or E0B2), or null"
    }
  ]
}
Give 4 to ${MAX_SUGGESTIONS} suggestions, most important first, "must" for gaps that would get the resume rejected.`;
  const raw = await callLLM({ system, user, maxTokens: 3500, json: true });
  const data = parseJson(raw);
  const ctx = claimContext(resume, jd);
  const job = { title: String(data.jobTitle || ""), jd };
  const raws = Array.isArray(data.suggestions) ? data.suggestions : [];
  const cleanedEdits = await cleanAll(raws.map((s) => (s?.edit && typeof s.edit === "object" ? s.edit : null)), resume, ctx);
  const suggestions = raws
    .map((s, i) => {
      const cleaned = cleanedEdits[i];
      const edit = cleaned && !cleaned.unsupported ? cleaned : null;
      let question = typeof s?.question === "string" && s.question.trim() ? s.question.trim().slice(0, 300) : null;
      if (cleaned?.unsupported) question = askAbout(cleaned.unsupported, jd);
      if (!edit && !question) return null;
      const impact = edit ? scoreImpact(resume, edit, job) : 0;
      if (impact < -MAX_SCORE_LOSS) return null;
      // A question still points at the line it's about, so the resume can mark it.
      const target = edit?.target || [s.edit?.target, s.target].find((t) => typeof t === "string" && textAt(resume, t) != null) || null;
      return {
        id: `s${i + 1}`,
        priority: s.priority === "must" ? "must" : "nice",
        // A rewritten edit dropped terms the model's own title and reason may still mention.
        title: edit?.rewritten ? neutralTitle(edit) : String(s.title || "Suggestion").slice(0, 90),
        why: edit?.rewritten ? "Reworded towards this job, without claiming anything you haven't said." : String(s.why || "").slice(0, 300),
        edit,
        question: edit ? null : question,
        target,
        before: target ? textAt(resume, target) : null,
        impact,
      };
    })
    .filter(Boolean)
    // One card per question and one per line: the model sometimes repeats itself.
    .filter((s, i, all) => {
      if (s.edit?.op === "add_bullet") return true;
      const same = (o) => (s.question ? o.question === s.question : o.edit?.target === s.edit.target && o.edit?.op === s.edit.op);
      return all.findIndex(same) === i;
    })
    .slice(0, MAX_SUGGESTIONS);
  return {
    jobTitle: String(data.jobTitle || "").slice(0, 120),
    company: String(data.company || "").slice(0, 120),
    intro: String(data.intro || "").slice(0, 500),
    suggestions,
  };
}

/**
 * One more try for edits that brought in job terms the candidate never claimed: the model rewrites each
 * without those terms. Returns the cleaned edits in the same order (null, or still { unsupported }, when
 * the rewrite didn't work).
 */
async function rewriteWithoutUnclaimed(blocked, resume, ctx) {
  if (!blocked.length) return [];
  const user = `These resume edits mention things the candidate has NOT claimed. Rewrite each "after" so it no longer mentions the listed terms (or anything else the candidate hasn't said), keeping the rest of its meaning and the candidate's own facts. Return null for an edit that would be pointless without them.

RESUME (line ids in brackets):
${resumeLines(resume)}

EDITS:
${blocked.map((b, i) => `${i + 1}. ${b.edit.target} (${b.edit.op}): "${b.edit.after}" – must not mention: ${b.unsupported.join(", ")}`).join("\n")}

Return JSON: {"edits": ["rewritten text" or null, ...]} – one entry per edit, same order.`;
  try {
    const data = parseJson(await callLLM({ system: "You edit resume lines precisely and never add facts. Return ONLY JSON.", user, maxTokens: 1200, json: true }));
    return blocked.map((b, i) => {
      const after = data.edits?.[i];
      return typeof after === "string" && after.trim() ? cleanEdit({ ...b.edit, after }, resume, ctx) : null;
    });
  } catch (err) {
    console.warn("[tailor] rewrite without unclaimed terms failed:", err.message);
    return blocked.map(() => null);
  }
}

const neutralTitle = (edit) =>
  ({ T: "Sharpen your headline", S: "Sharpen your summary", K: "Add skills" })[edit.target] || (edit.op === "add_bullet" ? "Add a bullet" : "Sharpen this bullet");

/** First pass over the model's edits; edits with unclaimed terms get one rewrite before giving up. */
async function cleanAll(rawEdits, resume, ctx) {
  const first = rawEdits.map((e) => (e ? cleanEdit(e, resume, ctx) : null));
  const blocked = first.map((c, i) => (c?.unsupported && rawEdits[i]?.after ? { i, edit: rawEdits[i], unsupported: c.unsupported } : null)).filter(Boolean);
  const retried = await rewriteWithoutUnclaimed(blocked, resume, ctx);
  blocked.forEach((b, k) => {
    if (retried[k] && !retried[k].unsupported) first[b.i] = { ...retried[k], rewritten: true };
  });
  return first;
}

/** One chat turn: a reply, plus edits the candidate can apply. */
export async function chatTurn({ resume, jd, jobTitle = "", history = [], message, answerTo = "" }) {
  // What the candidate has said: their own messages, never the job description they pasted.
  const own = history.filter((m) => m.role === "user" && String(m.text || "").trim() !== String(jd || "").trim()).map((m) => String(m.text || ""));
  const system = "You are a friendly, precise resume coach working inside a chat next to the candidate's resume. Return ONLY JSON.";
  const convo = history
    .slice(-10)
    .map((m) => (m.role === "user" && jd && String(m.text || "").trim() === jd.trim() ? "Candidate: (pasted the job description above)" : `${m.role === "user" ? "Candidate" : "Coach"}: ${String(m.text || "").slice(0, 1200)}`))
    .join("\n");
  const user = `${jd ? `JOB DESCRIPTION:\n${jd.slice(0, 8000)}\n\n` : ""}RESUME (line ids in brackets):
${resumeLines(resume)}

${convo ? `CONVERSATION SO FAR:\n${convo}\n\n` : ""}${answerTo ? `COACH ASKED: ${String(answerTo).slice(0, 400)}\n` : ""}CANDIDATE NOW SAYS: ${message.slice(0, 2000)}

${RULES}
- Facts and numbers the candidate states in this conversation may be used.

${EDIT_SHAPE}

Return JSON: {"reply": "short answer (1-3 sentences)", "edits": [{"title": "short label", "edit": <an edit>}]}
Return an empty "edits" list when no change to the resume is needed.`;
  const raw = await callLLM({ system, user, maxTokens: 2500, json: true });
  const data = parseJson(raw);
  const userText = `${message}\n${own.join("\n")}`;
  const ctx = claimContext(resume, jd, userText);
  const asks = [];
  const raws = Array.isArray(data.edits) ? data.edits : [];
  const cleanedEdits = await cleanAll(raws.map((e) => (e?.edit && typeof e.edit === "object" ? e.edit : e && typeof e === "object" ? e : null)), resume, ctx);
  const edits = raws
    .map((e, i) => {
      const edit = cleanedEdits[i];
      if (edit?.unsupported) {
        asks.push(...edit.unsupported);
        return null;
      }
      if (!edit) return null;
      return {
        id: `c${Date.now().toString(36)}${i}`,
        priority: "nice",
        title: edit.rewritten ? neutralTitle(edit) : String(e?.title || "Suggested change").slice(0, 90),
        why: "",
        edit,
        question: null,
        target: edit.target,
        before: textAt(resume, edit.target),
        impact: jd ? scoreImpact(resume, edit, { title: jobTitle, jd }) : 0,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  let reply = String(data.reply || "").slice(0, 800) || (edits.length ? "Here's the change – tap Apply to use it." : "");
  if (asks.length) reply = `${reply}${reply ? " " : ""}${askAbout([...new Set(asks)], jd)}`.trim();
  return { reply: reply || "Got it.", suggestions: edits };
}
