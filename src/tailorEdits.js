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
