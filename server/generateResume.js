/**
 * "Generate resume" (extension match card): the candidate's resume reworded for one job in a
 * single pass, for them to review before it's used.
 *
 * Wording only: the candidate isn't there to answer questions, so every edit must be supported by
 * the resume as it stands. Edits go through the tailoring assistant's checks (exact original line,
 * no new numbers, no upgraded ownership, no borrowed JD claims, no filler); failing edits get one
 * repair pass and are otherwise dropped. Requirements the candidate lacks are returned as real gaps,
 * never written into the resume.
 */
import { callLLM } from "./llm.js";
import { checkEdit, formatResume } from "./assistant.js";

const MAX_JD_CHARS = 8000;
const MAX_EDITS = 8;

const GENERATE_PROMPT = `You tailor one candidate's resume to one job in a single pass. The candidate reviews the result afterwards.
Change wording only. The candidate can't answer questions now, so use only facts already in the resume.

What to do:
- Rewrite summary sentences, bullets and skills where the resume already shows what the job asks for but undersells it or uses different terms.
- Every edit must bring its line closer to a specific requirement in the job description. Don't make edits that only fix spacing, punctuation or grammar.
- Make the edits with the most impact on this application, up to ${MAX_EDITS}. Leave lines that already fit alone. Fewer, meaningful edits beat many small ones.
- Separately, list the real gaps: requirements the candidate lacks (years, certifications, domains, tools) that rewording can't fix. Never paper over a real gap in an edit.

Hard rules for every edit:
1. "original" must be copied EXACTLY from the resume: the whole summary or one full sentence of it, one bullet, or for Skills one existing skill. For an Addition, original is "".
2. Never upgrade the candidate's role: don't turn "implemented", "developed" or "worked on" into "led", "owned", "architected" or "end-to-end".
3. Keep every specific in the original: tools, versions, product names, certifications, clients, numbers. You may reorder and sharpen, never generalise.
4. Never invent facts. Every number must already be in the resume. No [placeholders].
5. No filler: never "results-driven", "track record", "proven ability", "passionate", "dynamic", "team player", "self-starter".
6. Mirror the JD's exact terminology only where the resume genuinely supports it.
7. A Skills Addition must be a single skill the resume already shows evidence of. An Experience Addition must restate something the resume already shows for that role.
8. One edit per original line.

Respond with ONLY a JSON object:
{
  "edits": [
    {
      "section": "Summary" | "Experience" | "Skills",
      "type": "Rewrite" | "Addition",
      "experienceIndex": number (Experience only; index from the resume listing),
      "original": "exact existing text, or \\"\\" for Addition",
      "proposed": "new text",
      "jdRequirement": "the JD requirement this targets, quoted",
      "why": "one sentence: the evidence-based reason"
    }
  ],
  "realGaps": ["short and specific, e.g. 'Asks 8+ years in payments; your resume shows 5'", ...up to 5]
}`;

function parse(text) {
  const parsed = JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
  return {
    edits: (Array.isArray(parsed.edits) ? parsed.edits : []).filter((e) => e && typeof e === "object").slice(0, MAX_EDITS),
    realGaps: (Array.isArray(parsed.realGaps) ? parsed.realGaps : []).filter((g) => typeof g === "string" && g.trim()).slice(0, 5).map((g) => g.trim().slice(0, 200)),
  };
}

const words = (text) => String(text || "").toLowerCase().match(/[a-z0-9]+/g)?.join(" ") || "";

/**
 * The assistant's checks, plus what only matters without a conversation: no removals, no
 * placeholders, and no "edits" that only change punctuation (they'd be highlighted as tailoring).
 */
function problemsWith(edit, context) {
  if (edit.type === "Removal") return ["removals aren't allowed here – rewrite the line instead"];
  // Models like non-breaking hyphens ("Day‑7"); the resume has plain ones, and checks compare text.
  edit.proposed = String(edit.proposed || "").replace(/[\u2010\u2011]/g, "-");
  const problems = checkEdit(edit, context);
  if (/\[[^\]]*\]/.test(String(edit.proposed || ""))) problems.push("uses a [placeholder] – use only facts in the resume, or skip this edit");
  if (edit.type === "Rewrite" && words(edit.original) === words(edit.proposed)) problems.push("only changes spacing or punctuation – make a change that targets the job, or skip this edit");
  return problems;
}

/**
 * Text read out of PDFs comes with stray spaces around hyphens and before punctuation
 * ("Day - 7", "buy - box", "analysts ."). Tidied before generating, so the highlighted changes are
 * only the ones made for the job.
 */
function tidy(text) {
  return String(text)
    .replace(/(\w) - (?=\w)/g, "$1-")
    .replace(/ +([.,;:%)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/ {2,}/g, " ")
    .trim();
}

function tidyResume(resume) {
  const out = structuredClone(resume);
  if (typeof out.summary === "string") out.summary = tidy(out.summary);
  if (typeof out.title === "string") out.title = tidy(out.title);
  out.experience = (out.experience || []).map((e) => ({
    ...e,
    ...(typeof e.role === "string" ? { role: tidy(e.role) } : {}),
    bullets: (e.bullets || []).map((b) => (typeof b === "string" ? tidy(b) : b)),
  }));
  out.skills = (out.skills || []).map((s) => (typeof s === "string" ? tidy(s) : s));
  return out;
}

const sameText = (a, b) => String(a || "").replace(/\s+/g, " ").trim().toLowerCase() === String(b || "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Apply checked edits to a copy of the resume. Returns the new resume and where each change landed,
 * so the reviewer can see it: summary changes by their new text, bullets and skills by position.
 */
function applyEdits(resume, edits) {
  const out = structuredClone(resume);
  out.experience = (out.experience || []).map((e) => ({ ...e, bullets: [...(e.bullets || [])] }));
  out.skills = [...(out.skills || [])];
  const changes = [];
  for (const edit of edits) {
    const change = { section: edit.section, type: edit.type, original: edit.original, proposed: edit.proposed, why: edit.why, jdRequirement: edit.jdRequirement };
    if (edit.section === "Summary") {
      const summary = String(out.summary || "");
      if (edit.type === "Addition") out.summary = `${summary.trim()} ${edit.proposed}`.trim();
      else if (sameText(summary, edit.original)) out.summary = edit.proposed;
      else if (summary.includes(edit.original)) out.summary = summary.replace(edit.original, edit.proposed);
      else continue; // an earlier edit already rewrote this text
      changes.push(change);
    } else if (edit.section === "Experience") {
      const role = out.experience[edit.experienceIndex];
      if (!role) continue;
      if (edit.type === "Addition") {
        role.bullets.push(edit.proposed);
        changes.push({ ...change, experienceIndex: edit.experienceIndex, bulletIndex: role.bullets.length - 1 });
      } else {
        const b = role.bullets.findIndex((x) => sameText(x, edit.original));
        if (b < 0) continue;
        role.bullets[b] = edit.proposed;
        changes.push({ ...change, experienceIndex: edit.experienceIndex, bulletIndex: b });
      }
    } else if (edit.section === "Skills") {
      if (edit.type === "Addition") {
        if (out.skills.some((s) => sameText(s, edit.proposed))) continue;
        out.skills.push(edit.proposed);
        changes.push({ ...change, skillIndex: out.skills.length - 1 });
      } else {
        const s = out.skills.findIndex((x) => sameText(x, edit.original));
        if (s < 0) continue;
        out.skills[s] = edit.proposed;
        changes.push({ ...change, skillIndex: s });
      }
    }
  }
  return { resume: out, changes };
}

/**
 * @param resume the candidate's parsed resume (profile.resume)
 * @param job    { role, company, jd }
 * @returns {{ resume, changes, realGaps }}
 */
export async function generateResume({ resume: original, job }) {
  const resume = tidyResume(original);
  const jd = String(job?.jd || "").slice(0, MAX_JD_CHARS);
  const user = `JOB: ${job?.role || ""} at ${job?.company || ""}
JOB DESCRIPTION:
${jd}

CANDIDATE RESUME:
${formatResume(resume)}

Return ONLY the JSON object.`;
  let reply = parse(await callLLM({ system: GENERATE_PROMPT, user, maxTokens: 3000, json: true }));
  const context = { resume, jd, candidateText: "", decisions: [] };
  let checked = reply.edits.map((edit) => ({ edit, problems: problemsWith(edit, context) }));

  // One repair pass: tell the model exactly which rules each edit broke.
  if (checked.some((c) => c.problems.length)) {
    const feedback = checked
      .map((c, i) => (c.problems.length ? `Edit ${i + 1} ("${String(c.edit.proposed).slice(0, 80)}") was rejected: ${c.problems.join("; ")}.` : `Edit ${i + 1} passed.`))
      .join("\n");
    try {
      const repaired = parse(await callLLM({
        system: GENERATE_PROMPT,
        user: `${user}\n\nYour previous reply:\n${JSON.stringify(reply)}\n\nAutomatic checks failed:\n${feedback}\nFix or drop the failing edits (keep passing ones unchanged) and return the full JSON object again.`,
        maxTokens: 3000,
        json: true,
      }));
      reply = { edits: repaired.edits, realGaps: repaired.realGaps.length ? repaired.realGaps : reply.realGaps };
      checked = reply.edits.map((edit) => ({ edit, problems: problemsWith(edit, context) }));
    } catch (e) {
      console.warn("[generate] repair pass failed:", e.message);
    }
  }

  const dropped = checked.filter((c) => c.problems.length);
  if (dropped.length) console.log("[generate] dropped edits:", dropped.map((c) => c.problems.join("; ")));

  const passing = checked
    .filter((c) => !c.problems.length)
    .map(({ edit }) => ({
      section: edit.section,
      type: edit.type,
      experienceIndex: edit.section === "Experience" ? Number(edit.experienceIndex) : undefined,
      original: String(edit.original || "").trim(),
      proposed: String(edit.proposed || "").trim(),
      jdRequirement: String(edit.jdRequirement || "").trim(),
      why: String(edit.why || "").trim(),
    }));
  return { ...applyEdits(resume, passing), realGaps: reply.realGaps };
}
