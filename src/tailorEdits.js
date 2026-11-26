/**
 * Resume edits for the tailor chat, shared by the page (src/TailorChat.jsx) and the API
 * (server/tailorChat.js) so both read and change resume lines the same way.
 *
 * Line ids: C contact line · T title · S summary · E{i} a role · E{i}B{j} a bullet · D education (D{i} an entry) · K skills · Z certifications.
 * Edits: { target, op: "replace" | "add_bullet" | "remove" | "add_skills" | "set_skills" | "add_certifications",
 *          after?, skills?, items? }. set_skills only removes or reorders (it never brings in a new skill).
 * A removed bullet stays as null until finalResume(), so later bullet ids keep pointing at the same lines.
 */
import { computeLocalMatchScore } from "./matchScore.js";
import { STRING_SECTIONS, ENTRY_SECTIONS, educationLine, sectionPlan, splitLine } from "./resumeSections.js";

/**
 * Lines in the extra sections (projects, volunteering, achievements, publications, languages, interests and any other
 * section such as Core Competencies): "X:<key>:<i>" an item, "X:<key>:<i>:<j>" a bullet of an entry, "X:<key>" (or
 * "X:projects:<i>") the whole list, for adding to it. Ops on them: replace, remove, add_item, set_items (remove or reorder only), and
 * remove_section on "X:<key>" (the whole section).
 */
export const isExtraTarget = (t) => typeof t === "string" && t.startsWith("X:");
/** Where an "X:" id points inside a resume: { list, index } (index null for the whole list), or null. */
export function extraSlot(resume, target, create = false) {
  const [, key, a, b] = String(target || "").split(":");
  const num = (v) => (v != null && /^\d+$/.test(v) ? +v : null);
  const other = /^other(\d+)$/.exec(key || "");
  if (STRING_SECTIONS.includes(key)) {
    const list = resume?.[key];
    if (!Array.isArray(list) || b != null) return null;
    return a == null ? { list, index: null } : num(a) != null ? { list, index: num(a) } : null;
  }
  if (other) {
    const list = resume?.otherSections?.[+other[1]]?.items;
    if (!Array.isArray(list) || b != null) return null;
    return a == null ? { list, index: null } : num(a) != null ? { list, index: num(a) } : null;
  }
  if (ENTRY_SECTIONS.includes(key)) {
    // The whole list of entries: only "remove_section" works on it (new bullets go through one entry, X:projects:<i>).
    if (a == null) return Array.isArray(resume?.[key]) ? { list: resume[key], index: null, whole: true } : null;
    const entry = num(a) != null ? resume?.[key]?.[num(a)] : null;
    if (!entry) return null;
    if (!Array.isArray(entry.bullets)) {
      if (!create) return null;
      entry.bullets = [];
    }
    return b == null ? { list: entry.bullets, index: null } : num(b) != null ? { list: entry.bullets, index: num(b) } : null;
  }
  return null;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** The resume without removed bullets: what gets scored, saved and downloaded. */
export function finalResume(resume) {
  const r = clone(resume);
  r.experience = (r.experience || []).filter((e) => e && !e.removed).map((e) => ({ ...e, bullets: (e.bullets || []).filter((b) => b != null) }));
  if (Array.isArray(r.education)) r.education = r.education.filter((e) => e && !e.removed).map((e) => (Array.isArray(e.details) ? { ...e, details: e.details.filter((d) => d != null) } : e));
  STRING_SECTIONS.forEach((k) => Array.isArray(r[k]) && (r[k] = r[k].filter((x) => x != null)));
  ENTRY_SECTIONS.forEach((k) => Array.isArray(r[k]) && (r[k] = r[k].filter((e) => e && !e.removed).map((e) => ({ ...e, bullets: (e?.bullets || []).filter((b) => b != null) }))));
  if (Array.isArray(r.otherSections)) r.otherSections = r.otherSections.map((o) => ({ ...o, items: (o?.items || []).filter((x) => x != null) }));
  return r;
}


/** Sections are addressed as "SEC:<key>" (summary, experience, education, skills, certifications, projects, other0 ...). */
export const isSectionTarget = (t) => typeof t === "string" && t.startsWith("SEC:");
const splitList = (text) => String(text || "").split(/\s*(?:·|\n|,|;|\|)\s*/).map((x) => x.trim()).filter(Boolean);
const splitParts = (text) => splitLine(text);
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Top-level resume fields an edit can change; the undo for those edits is a snapshot of exactly these. */
function fieldsTouched(edit) {
  const t = edit.target || "";
  if (isSectionTarget(t)) {
    const key = t.slice(4);
    if (edit.op === "move_section") return ["sectionOrder"];
    if (edit.op === "rename_section") return ["sectionTitles"];
    if (edit.op === "remove_section") return [/^other\d+$/.test(key) ? "otherSections" : key, "sectionTitles"];
    if (edit.op === "add_custom_section") return ["otherSections", "sectionOrder"];
    return [/^other\d+$/.test(key) ? "otherSections" : key];
  }
  if (edit.op === "add_custom_section") return ["otherSections", "sectionOrder"];
  if (edit.op === "add_entry") return [t.split(":")[1]];
  if (t === "N") return ["name"];
  if (t === "K" && edit.op === "replace") return ["skills"];
  if (t === "Z" && (edit.op === "replace" || edit.op === "set_certifications")) return ["certifications"];
  if (/^E\d+$/.test(t) && (edit.op === "remove" || edit.op === "replace")) return ["experience"];
  if (/^D\d+(:meta|:d\d+)?$/.test(t) && (edit.op === "remove" || edit.op === "replace" || edit.op === "add_detail")) return ["education"];
  if (isExtraTarget(t) && ENTRY_SECTIONS.includes(t.split(":")[1]) && t.split(":").length === 3 && (edit.op === "remove" || edit.op === "replace")) return [t.split(":")[1]];
  if (edit.op === "add_item" && isExtraTarget(t)) return [/^X:other\d+/.test(t) ? "otherSections" : t.split(":")[1]];
  return null;
}
const snapshot = (r, fields) => ({ kind: "snap", fields: Object.fromEntries(fields.map((f) => [f, { has: f in r, value: copy(r[f]) }])) });

function clearSection(r, key) {
  const other = /^other(\d+)$/.exec(key);
  if (key === "summary") r.summary = "";
  else if (key === "experience") r.experience = [];
  else if (key === "education") r.education = [];
  else if (key === "skills") r.skills = [];
  else if (key === "certifications") r.certifications = [];
  else if (other && r.otherSections?.[+other[1]]) r.otherSections[+other[1]] = { title: "", items: [] }; // untitled and empty: not shown or printed
  else if (STRING_SECTIONS.includes(key) || ENTRY_SECTIONS.includes(key) || key === "references") r[key] = [];
  if (r.sectionTitles && key in r.sectionTitles) {
    r.sectionTitles = { ...r.sectionTitles };
    delete r.sectionTitles[key];
  }
}

/** The current text at a line id ("" for a role, which only takes new bullets), or null when it doesn't exist. */
export function textAt(resume, target) {
  if (target === "C") return resume?.contact ?? "";
  if (target === "Z") return (resume?.certifications || []).join(", ");
  // Title and summary can be written even when the resume has none yet.
  if (target === "T") return resume ? resume.title ?? "" : null;
  if (target === "S") return resume ? resume.summary ?? "" : null;
  if (target === "K") return (resume?.skills || []).join(", ");
  if (target === "N") return resume ? resume.name ?? "" : null;
  if (isSectionTarget(target)) return sectionPlan(resume || {}, { include: ["summary", "education", "skills", "certifications"] }).some((x) => x.key === target.slice(4)) ? "" : null;
  if (target === "D") return resume ? "" : null; // the education list: new entries go in here
  const eduPart = /^D(\d+):(meta|d(\d+))$/.exec(target || "");
  if (eduPart) {
    const e = resume?.education?.[+eduPart[1]];
    if (!e || e.removed) return null;
    if (eduPart[2] === "meta") return [e.grade, e.location].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
    return e.details?.[+eduPart[3]] ?? null;
  }
  const edu = /^D(\d+)$/.exec(target || "");
  if (edu) return resume?.education?.[+edu[1]] && !resume.education[+edu[1]].removed ? educationLine(resume.education[+edu[1]]) : null;
  if (isExtraTarget(target)) {
    const slot = extraSlot(resume || {}, target);
    if (!slot) return null;
    const parts = target.split(":");
    if (ENTRY_SECTIONS.includes(parts[1]) && parts.length === 3 && resume?.[parts[1]]?.[+parts[2]]?.removed) return null;
    return slot.index == null ? "" : slot.list[slot.index] ?? null;
  }
  const bullet = /^E(\d+)B(\d+)$/.exec(target || "");
  if (bullet) return resume?.experience?.[+bullet[1]]?.bullets?.[+bullet[2]] ?? null;
  const role = /^E(\d+)$/.exec(target || "");
  if (role) return resume?.experience?.[+role[1]] && !resume.experience[+role[1]].removed ? "" : null;
  return null;
}

/** A copy of the resume with one edit applied (`after` overrides the edit's text, e.g. with blanks filled). */
export function applyEdit(resume, edit, after = edit.after) {
  const r = clone(resume);
  if (isSectionTarget(edit.target)) {
    const key = edit.target.slice(4);
    if (edit.op === "remove_section") clearSection(r, key);
    else if (edit.op === "move_section") {
      const keys = sectionPlan(r).map((x) => x.key);
      const from = keys.indexOf(key);
      if (from >= 0) {
        keys.splice(from, 1);
        keys.splice(Math.max(0, Math.min(keys.length, Math.round(+edit.to) || 0)), 0, key);
        r.sectionOrder = keys;
      }
    } else if (edit.op === "rename_section" && String(after || "").trim()) r.sectionTitles = { ...(r.sectionTitles || {}), [key]: String(after).trim() };
    return r;
  }
  if (edit.op === "add_custom_section") {
    r.otherSections = [...(r.otherSections || []), { title: String(edit.title || "New section").trim(), items: [String(after || "").trim()].filter(Boolean) }];
    return r;
  }
  if (edit.op === "add_entry" && ENTRY_SECTIONS.includes((edit.target || "").split(":")[1])) {
    const key = edit.target.split(":")[1];
    r[key] = [...(r[key] || []), key === "projects" ? { name: String(after || "").trim(), period: "", bullets: [] } : { role: String(after || "").trim(), organization: "", period: "", bullets: [] }];
    return r;
  }
  if (edit.op === "add_item" && isExtraTarget(edit.target)) {
    // First item of a section that doesn't exist yet (manual "Add section").
    const [, key] = edit.target.split(":");
    if (STRING_SECTIONS.includes(key) && !Array.isArray(r[key])) r[key] = [];
  }
  if (edit.target === "N" && edit.op === "replace") {
    r.name = after;
    return r;
  }
  if (edit.target === "K" && edit.op === "replace") {
    r.skills = splitList(after);
    return r;
  }
  if (edit.target === "Z" && edit.op === "replace") {
    r.certifications = splitList(after);
    return r;
  }
  if (edit.target === "Z" && edit.op === "set_certifications") {
    r.certifications = [...(edit.items || [])];
    return r;
  }
  const roleEdit = /^E(\d+)$/.exec(edit.target || "");
  if (roleEdit && r.experience?.[+roleEdit[1]]) {
    const i = +roleEdit[1];
    if (edit.op === "remove") r.experience[i] = { ...r.experience[i], removed: true, bullets: [] };
    else if (edit.op === "replace") {
      const [role = "", company = ""] = splitParts(after);
      r.experience[i] = { ...r.experience[i], role, company, ...(edit.period != null ? { period: edit.period } : {}) };
    }
    if (edit.op === "remove" || edit.op === "replace") return r;
  }
  const eduPart = /^D(\d+):(meta|d(\d+))$/.exec(edit.target || "");
  if (eduPart && r.education?.[+eduPart[1]]) {
    const e = r.education[+eduPart[1]];
    if (eduPart[2] === "meta") {
      const [grade = "", ...rest] = edit.op === "remove" ? [] : splitParts(after);
      e.grade = grade;
      e.location = rest.join(" · ");
    } else if (edit.op === "remove") {
      e.details = [...(e.details || [])];
      e.details[+eduPart[3]] = null;
    } else if (edit.op === "replace") {
      e.details = [...(e.details || [])];
      e.details[+eduPart[3]] = after;
    }
    return r;
  }
  if (/^D(\d+)$/.test(edit.target || "") && edit.op === "add_detail" && r.education?.[+edit.target.slice(1)]) {
    const e = r.education[+edit.target.slice(1)];
    e.details = [...(e.details || []), String(after || "").trim()].filter((x) => x !== "");
    return r;
  }
  const eduEdit = /^D(\d+)$/.exec(edit.target || "");
  if (eduEdit && r.education?.[+eduEdit[1]]) {
    const i = +eduEdit[1];
    if (edit.op === "remove") r.education[i] = { ...r.education[i], removed: true };
    else if (edit.op === "replace") {
      const [degree = "", school = "", year = ""] = splitParts(after);
      r.education[i] = { ...r.education[i], degree, school, year };
    }
    if (edit.op === "remove" || edit.op === "replace") return r;
  }
  if (edit.target === "D" && edit.op === "add_education") {
    r.education = [...(r.education || []), { ...edit.entry }];
    return r;
  }
  if (/^D\d+$/.test(edit.target || "") && edit.op === "update_education") {
    const i = +edit.target.slice(1);
    if (r.education?.[i]) r.education[i] = { ...r.education[i], ...edit.entry };
    return r;
  }
  if (isExtraTarget(edit.target)) {
    const slot = extraSlot(r, edit.target, true);
    if (!slot) return r;
    if (edit.op === "remove_section") {
      const [, key] = edit.target.split(":");
      const other = /^other(\d+)$/.exec(key);
      if (other) r.otherSections[+other[1]] = { title: "", items: [] }; // an empty, untitled section is not shown or printed
      else r[key] = [];
      return r;
    }
    if (slot.whole) return r;
    // A whole project / volunteering entry ("X:projects:0"): remove it, or rename its heading.
    const parts = edit.target.split(":");
    if (ENTRY_SECTIONS.includes(parts[1]) && parts.length === 3 && slot.index == null && (edit.op === "remove" || edit.op === "replace")) {
      const entry = r[parts[1]][+parts[2]];
      if (edit.op === "remove") r[parts[1]][+parts[2]] = { ...entry, removed: true, bullets: [] };
      else if (edit.op === "replace") {
        if (parts[1] === "projects") entry.name = after;
        else {
          const [role = "", organization = ""] = splitParts(after);
          entry.role = role;
          entry.organization = organization;
        }
      }
      return r;
    }
    if (edit.op === "replace" && slot.index != null) slot.list[slot.index] = after;
    else if (edit.op === "remove" && slot.index != null) slot.list[slot.index] = null;
    else if (edit.op === "add_item" && slot.index == null) slot.list.push(after);
    else if (edit.op === "set_items" && slot.index == null) slot.list.splice(0, slot.list.length, ...(edit.items || []));
    return r;
  }
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
  const fields = fieldsTouched(edit);
  if (fields) return snapshot(resume, fields);
  if (edit.op === "add_education") return { kind: "education", value: JSON.parse(JSON.stringify(resume.education || [])) };
  if (edit.op === "update_education") return { kind: "education", value: JSON.parse(JSON.stringify(resume.education || [])) };
  if (isExtraTarget(edit.target)) {
    const slot = extraSlot(resume, edit.target);
    if (!slot) return null;
    if (edit.op === "remove_section") {
      const key = edit.target.split(":")[1];
      const other = /^other(\d+)$/.exec(key);
      return { kind: "x_section", key, value: JSON.parse(JSON.stringify(other ? resume.otherSections[+other[1]] : resume[key])) };
    }
    if (edit.op === "add_item") return { kind: "x_added", target: edit.target, index: slot.list.length };
    if (edit.op === "set_items") return { kind: "x_list", target: edit.target, value: [...slot.list] };
    return { kind: "x_item", target: edit.target, value: slot.list[slot.index] ?? null };
  }
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
  if (token.kind === "x_added" || token.kind === "x_list" || token.kind === "x_item") {
    const slot = extraSlot(r, token.target);
    if (!slot) return r;
    if (token.kind === "x_added") slot.list[token.index] = null;
    else if (token.kind === "x_list") slot.list.splice(0, slot.list.length, ...token.value);
    else slot.list[slot.index] = token.value;
    return r;
  }
  if (token.kind === "snap") {
    for (const [f, { has, value }] of Object.entries(token.fields)) {
      if (has) r[f] = copy(value);
      else delete r[f];
    }
    return r;
  }
  if (token.kind === "x_section") {
    const other = /^other(\d+)$/.exec(token.key);
    if (other) r.otherSections[+other[1]] = JSON.parse(JSON.stringify(token.value));
    else r[token.key] = JSON.parse(JSON.stringify(token.value));
    return r;
  }
  if (token.kind === "education") {
    r.education = JSON.parse(JSON.stringify(token.value));
    return r;
  }
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
  if (isSectionTarget(target)) return 9.9e5;
  if (target === "N") return -1;
  if (isExtraTarget(target)) {
    const [, key, a, b] = target.split(":");
    const other = /^other(\d+)$/.exec(key);
    const sec = other ? 10 + +other[1] : Math.max(0, [...ENTRY_SECTIONS, ...STRING_SECTIONS].indexOf(key));
    const n = (v) => (v != null && /^\d+$/.test(v) ? +v : 0);
    return 9.6e5 + sec * 1e3 + (ENTRY_SECTIONS.includes(key) ? n(a) * 20 + (b != null ? n(b) + 1 : 0) : n(a));
  }
  const base = { C: 0, T: 1, S: 2, D: 5e5, K: 9e5, Z: 9.5e5 }[target];
  if (base != null) return base;
  const edu = /^D(\d+)$/.exec(target);
  if (edu) return 5e5 + 1 + +edu[1];
  const m = /^E(\d+)(?:B(\d+))?$/.exec(target);
  return m ? 10 + +m[1] * 1000 + (m[2] != null ? +m[2] + 1 : 999) : 1e6;
}
