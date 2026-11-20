/**
 * Resume edits for the tailor chat, shared by the page (src/TailorChat.jsx) and the API
 * (server/tailorChat.js) so both read and change resume lines the same way.
 *
 * Line ids: C contact line · T title · S summary · E{i} a role · E{i}B{j} a bullet · K skills · Z certifications.
 * Edits: { target, op: "replace" | "add_bullet" | "remove" | "add_skills" | "set_skills" | "add_certifications",
 *          after?, skills?, items? }. set_skills only removes or reorders (it never brings in a new skill).
 * A removed bullet stays as null until finalResume(), so later bullet ids keep pointing at the same lines.
 */
import { computeLocalMatchScore } from "./matchScore.js";

const clone = (o) => JSON.parse(JSON.stringify(o));

/** The resume without removed bullets: what gets scored, saved and downloaded. */
export function finalResume(resume) {
  const r = clone(resume);
  r.experience = (r.experience || []).map((e) => ({ ...e, bullets: (e.bullets || []).filter((b) => b != null) }));
  return r;
}

/** The current text at a line id ("" for a role, which only takes new bullets), or null when it doesn't exist. */
export function textAt(resume, target) {
  if (target === "C") return resume?.contact ?? "";
  if (target === "Z") return (resume?.certifications || []).join(", ");
  // Title and summary can be written even when the resume has none yet.
  if (target === "T") return resume ? resume.title ?? "" : null;
  if (target === "S") return resume ? resume.summary ?? "" : null;
  if (target === "K") return (resume?.skills || []).join(", ");
  const bullet = /^E(\d+)B(\d+)$/.exec(target || "");
  if (bullet) return resume?.experience?.[+bullet[1]]?.bullets?.[+bullet[2]] ?? null;
  const role = /^E(\d+)$/.exec(target || "");
  if (role) return resume?.experience?.[+role[1]] ? "" : null;
  return null;
}

/** A copy of the resume with one edit applied (`after` overrides the edit's text, e.g. with blanks filled). */
export function applyEdit(resume, edit, after = edit.after) {
  const r = clone(resume);
  const bullet = /^E(\d+)B(\d+)$/.exec(edit.target || "");
  if (edit.op === "replace") {
    if (edit.target === "C") r.contact = after;
    else if (edit.target === "T") r.title = after;
    else if (edit.target === "S") r.summary = after;
    else if (bullet) r.experience[+bullet[1]].bullets[+bullet[2]] = after;
  } else if (edit.op === "add_bullet") {
    const i = +/^E(\d+)$/.exec(edit.target)[1];
    r.experience[i].bullets = [...(r.experience[i].bullets || []), after];
  } else if (edit.op === "remove" && bullet) {
    r.experience[+bullet[1]].bullets[+bullet[2]] = null;
  } else if (edit.op === "set_skills") {
    r.skills = [...(edit.skills || [])];
  } else if (edit.op === "add_certifications") {
    const have = new Set((r.certifications || []).map((c) => c.toLowerCase()));
    r.certifications = [...(r.certifications || []), ...(edit.items || []).filter((c) => !have.has(c.toLowerCase()))];
  } else if (edit.op === "add_skills") {
    const have = new Set((r.skills || []).map((s) => s.toLowerCase()));
    r.skills = [...(r.skills || []), ...(edit.skills || []).filter((s) => !have.has(s.toLowerCase()))];
  }
  return r;
}

/** The quick match estimate (keywords, skills, experience, impact) for this resume and job. */
export function matchScore(resume, job) {
  return computeLocalMatchScore(finalResume(resume), { role: job?.title || "", jd: job?.jd || "" })?.score ?? null;
}

/** How many points of match an edit adds (negative: it loses job keywords). Blanks count as filled. */
export function scoreImpact(resume, edit, job) {
  const now = matchScore(resume, job);
  const after = edit.after != null ? edit.after.replace(/\[number\]/g, "10") : undefined;
  const next = matchScore(applyEdit(resume, edit, after), job);
  return now == null || next == null ? 0 : next - now;
}

/**
 * What an edit is about to overwrite, so Undo can put back exactly that (and nothing else): the old text of
 * the line, the old skills/certifications list, or the index of a bullet being added.
 */
export function captureUndo(resume, edit) {
  const bullet = /^E(\d+)B(\d+)$/.exec(edit.target || "");
  if (edit.op === "add_bullet") {
    const i = +/^E(\d+)$/.exec(edit.target)[1];
    return { kind: "added_bullet", role: i, index: (resume.experience?.[i]?.bullets || []).length };
  }
  if (edit.op === "add_skills" || edit.op === "set_skills") return { kind: "skills", value: [...(resume.skills || [])] };
  if (edit.op === "add_certifications") return { kind: "certifications", value: [...(resume.certifications || [])] };
  if (bullet) return { kind: "bullet", role: +bullet[1], index: +bullet[2], value: resume.experience?.[+bullet[1]]?.bullets?.[+bullet[2]] ?? null };
  const field = { C: "contact", T: "title", S: "summary" }[edit.target];
  return field ? { kind: "field", field, value: resume[field] ?? "" } : null;
}

/** A copy of the resume with one change undone (see captureUndo). */
export function applyUndo(resume, token) {
  if (!token) return resume;
  const r = clone(resume);
  if (token.kind === "added_bullet") {
    if (r.experience?.[token.role]?.bullets) r.experience[token.role].bullets[token.index] = null;
  } else if (token.kind === "bullet") {
    if (r.experience?.[token.role]?.bullets) r.experience[token.role].bullets[token.index] = token.value;
  } else if (token.kind === "skills") r.skills = [...token.value];
  else if (token.kind === "certifications") r.certifications = [...token.value];
  else if (token.kind === "field") r[token.field] = token.value;
  return r;
}

/** Reading order of a line on the page, for numbering pins top to bottom. */
export function lineOrder(target) {
  if (!target) return 1e6;
  const base = { C: 0, T: 1, S: 2, K: 9e5, Z: 9.5e5 }[target];
  if (base != null) return base;
  const m = /^E(\d+)(?:B(\d+))?$/.exec(target);
  return m ? 10 + +m[1] * 1000 + (m[2] != null ? +m[2] + 1 : 999) : 1e6;
}
