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
import { callLLM as callLLMRaw } from "./llm.js";

// A hung provider request shouldn't freeze the chat: give up after 40 seconds (the page offers a retry).
const LLM_TIMEOUT_MS = 40_000;
function callLLM(args) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("The AI took too long to answer. Please try again.")), LLM_TIMEOUT_MS);
  });
  return Promise.race([callLLMRaw(args), timeout]).finally(() => clearTimeout(timer));
}
import { tokenizeForMatch, buildResumeCorpus } from "../src/matchScore.js";
import { textAt, scoreImpact } from "../src/tailorEdits.js";
import { reviewResume, WEAK_START, contactParts, normalizeContactField, setContactField } from "../src/resumeReview.js";

// A suggestion that lowers the job match by more than this (it drops the job's keywords) is left out.
const MAX_SCORE_LOSS = 2;

// Rough stem, so "integrations"/"integrated"/"integrating" count as the same claim.
const stem = (w) =>
  w
    .replace(/[^a-z0-9+#]/g, "")
    .replace(/(ations|ation|ings|ing|ers|ed|es|s)$/, "")
    .replace(/([b-df-hj-np-tv-z])\1$/, "$1"); // cutting -> cutt -> cut
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
  higher lower more less over under team teams people member members part whole across time times week weeks month months
  contributed contribute contributing co-wrote cowrote co-authored drafted authored lifted lift boosted boost cut saved save
  partnered partner collaborated collaborate facilitated led spearheaded accelerated expanded grew growing increasing reducing
  per quarter quarterly year yearly percent average total overall from into while resulting result results
  implemented implement implementing implementation score scores scored project projects initiative initiatives
  work working effort efforts approach solution solutions improvement improvements change changes`);

/**
 * Job-description terms a rewrite introduces that the candidate never claimed (not in the resume, not
 * said in the chat). Writing them in would be inventing experience.
 */
function unsupportedClaims(text, ctx, { strict = false } = {}) {
  // strict (a brand-new bullet): every meaningful word must come from the resume or the candidate;
  // otherwise (rewording an existing line): only the job's own terms are checked.
  // The [number] blank is ours, not a claim. Returns the words as written (not their stems), for questions.
  const clean = String(text).replace(/\[number\]/g, " ");
  const bad = new Set([...stems(clean)].filter((w) => (strict || ctx.strict || ctx.jd.has(w)) && !ctx.supported.has(w) && !GENERIC.has(w)));
  const words = tokenizeForMatch(clean).filter((w) => bad.has(stem(w)));
  return [...new Set(words.map((w) => w.replace(/[^a-z0-9+#/-]/g, "")))].filter(Boolean);
}

/** What the candidate has claimed (resume + their own chat messages) and what the job asks for. */
export function claimContext(resume, jd, userText = "", { strict = false } = {}) {
  return {
    known: numbersIn(`${resumeLines(resume)}\n${userText}`),
    supported: stems(`${buildResumeCorpus(resume)}\n${resume?.contact || ""}\n${(resume?.education || []).map((e) => [e.degree, e.school].join(" ")).join("\n")}\n${userText}`),
    jd: stems(jd || ""),
    // No job description (improving the resume on its own): every new word must come from the candidate.
    strict,
  };
}

const MAX_SUGGESTIONS = 10;

/** At most one suggestion per resume line (must-fixes win); suggestions without a line are kept. */
function onePerLine(list) {
  const seen = new Set();
  return [...list]
    .sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1))
    .filter((x) => {
      const line = x.edit?.target || x.target;
      if (!line) return true;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}


/** The resume as numbered lines, for the prompt. */
export function resumeLines(resume) {
  const lines = [];
  if (resume?.contact) lines.push(`[C] ${resume.contact}`);
  if (resume?.title) lines.push(`[T] ${resume.title}`);
  if (resume?.summary) lines.push(`[S] ${resume.summary}`);
  (resume?.experience || []).forEach((role, i) => {
    lines.push(`[E${i}] ${[role.role, role.company, role.period].filter(Boolean).join(" · ")}`);
    (role.bullets || []).forEach((b, j) => b != null && lines.push(`  [E${i}B${j}] ${b}`));
  });
  (resume?.education || []).forEach((e) => lines.push(`(education) ${[e.degree, e.school, e.year].filter(Boolean).join(" · ")}`));
  if (resume?.skills?.length) lines.push(`[K] Skills: ${resume.skills.join(", ")}`);
  if (resume?.certifications?.length) lines.push(`[Z] Certifications: ${resume.certifications.join(", ")}`);
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
  if (!["replace", "add_bullet", "remove", "add_skills", "set_skills", "add_certifications"].includes(op)) return null;
  if (textAt(resume, target) == null) return null;
  if (op === "set_skills") {
    // Remove or reorder only: every skill must already be on the list.
    const have = new Set((resume.skills || []).map((x) => String(x).toLowerCase()));
    const skills = (Array.isArray(edit.skills) ? edit.skills : []).map((x) => String(x).trim()).filter(Boolean);
    return target === "K" && skills.length && skills.every((x) => have.has(x.toLowerCase())) ? { target, op, skills } : null;
  }
  if (op === "add_certifications") {
    const have = new Set((resume.certifications || []).map((x) => String(x).toLowerCase()));
    const items = (Array.isArray(edit.items) ? edit.items : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 120 && !have.has(x.toLowerCase()));
    const said = items.filter((x) => [...stems(x)].every((w) => ctx.supported.has(w) || GENERIC.has(w)));
    if (target !== "Z") return null;
    if (said.length) return { target, op, items: said.slice(0, 8) };
    return items.length ? { unsupported: items.slice(0, 3) } : null;
  }
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
  if (op === "replace" && !/^(C|T|S|E\d+B\d+)$/.test(target)) return null;
  const after = String(edit.after || "").trim().slice(0, 600);
  // Same words, at most a full stop or capital letter different: not worth a suggestion.
  const plain = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!after || plain(after) === plain(textAt(resume, target))) return null;
  // The contact line only holds the candidate's own details (city, links), so it isn't checked for invented
  // claims – numbers still are (a phone number must come from them).
  const unsupported = target === "C" ? [] : unsupportedClaims(after, ctx, { strict: op === "add_bullet" });
  if (unsupported.length) return { unsupported };
  let { text } = withoutInventedNumbers(after, ctx.known);
  if (target === "C") {
    // Same clean-up as a typed answer: the city's spelling corrected, city only; parts in a standard order.
    const parts = contactParts(text);
    const city = parts.location ? normalizeContactField("location", parts.location) : "";
    text = setContactField(text, "location", city);
  }
  return { target, op, after: text, blanks: (text.match(/\[number\]/g) || []).length };
}

/** "The job mentions merchant onboarding and UPI – have you done this?" for an edit that would invent it. */
/** Terms joined for a sentence: "a", "a and b", "a, b and c" (each in quotes). */
const listOf = (items) => {
  const q = items.map((x) => `"${x}"`);
  return q.length > 1 ? `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}` : q[0] || "";
};

/**
 * The question asked when a draft would have claimed something the candidate never said. Only terms the job
 * description really uses are called the job's; any other word is named as one the draft added, so the
 * candidate sees exactly what is missing (never "The job mentions score, implementing").
 */
export function askAbout(terms, jd) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fromJob = [];
  const other = [];
  [...new Set(terms.map((t) => String(t).trim()).filter((t) => t.length >= 3))].forEach((t) => {
    // The job's own wording: the first phrase in the job description containing the term.
    const m = jd ? new RegExp(`\\b[\\w/-]*${esc(t)}[\\w/-]*\\b`, "i").exec(jd) : null;
    (m ? fromJob : other).push(m ? m[0] : t);
  });
  const job = [...new Set(fromJob)].slice(0, 3);
  const extra = [...new Set(other)].slice(0, 3);
  if (job.length) {
    const tail = extra.length ? ` (I also held back ${listOf(extra)}, which you haven't mentioned.)` : "";
    return `The job asks for ${listOf(job)}, and your resume doesn't show ${job.length > 1 ? "them" : "it"} yet. Have you done ${job.length > 1 ? "any of these" : "this"}? Tell me where, and I'll add it.${tail}`;
  }
  if (extra.length) return `I held back ${listOf(extra)} because you haven't told me about ${extra.length > 1 ? "them" : "it"}. Is that accurate? Tell me what you did, and I'll write it.`;
  return "I need a bit more detail before I can write that. What exactly did you do, and what changed as a result?";
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
- Keep the candidate's level of ownership: "helped", "assisted" or "supported" may become "contributed to" or "partnered on", never "led", "owned" or "launched".
- Bullets: one line, start with a strong verb, at most about 25 words.
- Refer to resume lines only by their ids in square brackets (T, S, E0, E0B1, K).`;

const EDIT_SHAPE = `An edit is one of:
{"target":"S","op":"replace","after":"new text"}            (T, S or a bullet id like E0B1)
{"target":"E0","op":"add_bullet","after":"new bullet"}      (adds a bullet to role E0)
{"target":"E1B3","op":"remove"}                              (drops a weak or irrelevant bullet)
{"target":"K","op":"add_skills","skills":["SQL","Tableau"]} (only skills the resume already shows evidence of)
{"target":"K","op":"set_skills","skills":["SQL","Jira"]}     (the whole skills list, only removing or reordering)
{"target":"C","op":"replace","after":"email · phone · city · linkedin.com/in/…"} (the contact line)
{"target":"Z","op":"add_certifications","items":["PMP (2023)"]} (only certifications the candidate has stated)`;

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
    .filter((s, i, all) => !s.question || all.findIndex((o) => o.question === s.question) === i);
  const unique = onePerLine(suggestions).slice(0, MAX_SUGGESTIONS);
  return {
    jobTitle: String(data.jobTitle || "").slice(0, 120),
    company: String(data.company || "").slice(0, 120),
    intro: String(data.intro || "").slice(0, 500),
    suggestions: unique,
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
  ({ C: "Tidy your contact line", T: "Sharpen your headline", S: "Sharpen your summary", K: "Add skills", Z: "Add certifications" })[edit.target] || (edit.op === "add_bullet" ? "Add a bullet" : "Sharpen this bullet");

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

const RESULT_QUESTION = "What changed because of this work? A number helps most – e.g. how many users or customers, % faster, ₹ saved, team size. Tell me and I'll rewrite the line.";

/**
 * "Improve my resume" (no job description): the review's checks, with the model writing the rewrites
 * for flagged lines in one call. Every rewrite passes the strict honesty check (only the candidate's own
 * words, numbers as [number] blanks); one that can't becomes a question instead.
 */
export async function reviewForImprove({ resume, pages = null }) {
  const review = reviewResume(resume, { pages });
  const toRewrite = review.issues.filter((i) => i.fix === "rewrite");
  const ctx = claimContext(resume, "", "", { strict: true });
  let rewrites = {};
  if (toRewrite.length) {
    const user = `Improve these resume lines. Each has a problem to fix.

RESUME (line ids in brackets):
${resumeLines(resume)}

LINES TO FIX:
${toRewrite.map((i, n) => `${n + 1}. [${i.target}] ${i.hint === "summary_missing" ? "there is no summary: write one (2-3 sentences) from the resume's own facts" : String(i.hint).replace("no number or result", "no number or result – end with the outcome this work had, using a [number] blank for the figure (e.g. \"…, cutting release time by [number]%\")")}`).join("\n")}

${RULES}
- Bullets start with a strong verb (past tense for past roles); one line, at most about 25 words.
- Summary: 2-3 sentences, no "I", with years of experience, focus and one strength the resume shows.

Return JSON: {"rewrites": [{"target": "E0B1", "after": "the improved line"}, ...]} – one per line above.`;
    try {
      const data = parseJson(await callLLM({ system: "You are a senior resume writer. You improve wording without adding facts. Return ONLY JSON.", user, maxTokens: 1500, json: true }));
      for (const w of Array.isArray(data.rewrites) ? data.rewrites : []) if (w?.target && typeof w.after === "string") rewrites[w.target] = w.after;
    } catch (err) {
      console.warn("[tailor] review rewrites failed:", err.message);
      rewrites = {};
    }
  }
  const raw = toRewrite.map((i) => (rewrites[i.target] ? { target: i.target, op: "replace", after: rewrites[i.target] } : null));
  const cleaned = await cleanAll(raw, resume, ctx);
  // A rewrite must fix what it was flagged for (a "weak opening" rewrite that still opens weakly isn't one).
  const fixes = (i, e) => {
    const hint = i.hint || "";
    const after = String(e.after || "").trim();
    // "No result" is only fixed by a number (or a blank for one); otherwise we ask for the result.
    if (/no number or result/.test(hint) && !/\d|\[number\]|%|₹|\$/.test(after)) return false;
    if (/weak opening/.test(hint) && WEAK_START.test(after) && !/too long|too vague/.test(hint)) return false;
    return true;
  };
  const edits = new Map(toRewrite.map((i, n) => [i.id, cleaned[n] && !cleaned[n].unsupported && fixes(i, cleaned[n]) ? cleaned[n] : null]));

  const order = [...review.categories].sort((a, b) => a.score - b.score).map((c) => c.id);
  const suggestions = review.issues
    .map((i) => {
      let edit = i.fix === "edit" ? i.edit : i.fix === "rewrite" ? edits.get(i.id) : null;
      let question = i.question || null;
      if (i.fix === "rewrite" && !edit) {
        // No honest rewrite: ask for the missing result instead, or leave a vague-but-true line alone.
        if (!/no number or result|too vague/.test(i.hint || "")) return null;
        question = RESULT_QUESTION;
      }
      // Name the change by what the rewrite actually does.
      let title = i.title;
      if (i.fix === "rewrite" && edit && i.target !== "S") {
        title = edit.blanks ? "Show the result" : /weak opening/.test(i.hint) ? "Start with a strong verb" : /too long/.test(i.hint) ? "Tighten this bullet" : "Sharpen this bullet";
      }
      return {
        id: i.id,
        category: i.category,
        priority: i.priority,
        title,
        why: i.why,
        edit: edit || null,
        question: edit ? null : question,
        action: i.fix === "action" ? i.action : null,
        field: i.field || null,
        target: i.target || null,
        before: i.target ? textAt(resume, i.target) : null,
      };
    })
    .filter((s) => s && (s.edit || s.question || s.action))
    .filter((s, i, all) => onePerLine(all).includes(s))
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1));
  return {
    overall: review.overall,
    categories: review.categories.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    suggestions,
  };
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
  const ctx = claimContext(resume, jd, userText, { strict: !jd });
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
  // The model's reply describes its own edits; when every one was blocked, it would claim a change that didn't happen.
  if (asks.length && !edits.length) reply = "I didn't change your resume yet.";
  if (asks.length) reply = `${reply}${reply ? " " : ""}${askAbout([...new Set(asks)], jd)}`.trim();
  return { reply: reply || "Got it.", suggestions: edits };
}
