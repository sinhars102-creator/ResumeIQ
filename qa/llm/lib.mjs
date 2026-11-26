// Output-quality checks (7b). Pure functions: used by the real-model run and by the replay/regression specs.
import { wordDiff } from "../../src/wordDiff.js";
import { tokenizeForMatch } from "../../src/matchScore.js";
import { textAt } from "../../src/tailorEdits.js";

export const norm = (t) => String(t ?? "").normalize("NFKC")
  .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-").replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'").replace(/[\u201C-\u201F\u2033]/g, '"')
  .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const TRIVIAL = new Set(["a", "an", "the", "and", "of", "to", "in", "for", "on", "with", "by", "at", "as", "or", "s"]);
export const cps = (s) => [...new Set([...String(s)].filter((c) => c.codePointAt(0) > 126 || /[\u0000-\u001f]/.test(c)))].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"));

/** Resume text of every section, flattened (for "is this word already on the resume"). */
export function resumeText(r) {
  const out = [];
  const walk = (v) => { if (v == null) return; if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === "object") Object.values(v).forEach(walk); };
  walk(r); return out.join("\n");
}
const stem1 = (w) => w.replace(/(ations|ation|ings|ing|ers|ed|es|s)$/, "");
const wordSet = (t) => new Set(norm(t).split(" ").filter(Boolean).map(stem1));

/** What a card shows: text before and after for a suggestion (null when it is not a text change). */
export function pairOf(resume, s) {
  const e = s.edit; if (!e) return null;
  const before = s.before ?? textAt(resume, e.target) ?? "";
  if (["replace", "add_bullet"].includes(e.op)) return { before: e.op === "add_bullet" ? "" : before, after: e.after };
  if (e.op === "set_skills") return { before: (resume.skills || []).join(", "), after: (e.skills || []).join(", "), list: true };
  return null;
}
// Inv 1
export function noop(before, after, list = false) {
  if (list) { const a = (before || "").split(", "), b = (after || "").split(", "); return a.length === b.length && a.every((x, i) => norm(x) === norm(b[i])); }
  return norm(before) === norm(after);
}
export function lowValue(before, after) {
  const a = norm(before).split(" ").filter(Boolean), b = norm(after).split(" ").filter(Boolean);
  const cnt = (arr) => arr.reduce((m, w) => (m.set(w, (m.get(w) || 0) + 1), m), new Map());
  const ca = cnt(a), cb = cnt(b); const diff = [];
  for (const [w, n] of ca) if ((cb.get(w) || 0) < n) diff.push(w);
  for (const [w, n] of cb) if ((ca.get(w) || 0) < n) diff.push(w);
  return diff.length === 1 && TRIVIAL.has(diff[0]) ? diff[0] : null;
}
// Inv 2: struck and re-added words that look the same once normalised
export const fold = (t) => String(t ?? "").normalize("NFKC").replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-").replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'").replace(/[\u201C-\u201F\u2033]/g, '"').replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ");
export function diffLies(before, after) {
  const d = wordDiff(before, after); const found = [];
  const struck = d.filter((x) => x.t === "-"), added = d.filter((x) => x.t === "+");
  const pairWords = (txt) => txt.split(/\s+/);
  for (const s of struck) for (const w of pairWords(s.text)) for (const a of added) for (const v of pairWords(a.text)) if (w !== v && fold(w) === fold(v)) found.push({ struck: w, readded: v, codepointsStruck: cps(w), codepointsAdded: cps(v) });
  return found;
}
// Inv 3 (verbatim logic of wsKeywords in src/ResumeLLM.jsx)
export function chips(jd, before, text) {
  if (!jd || !text) return [];
  const jdTerms = new Set(tokenizeForMatch(jd)); const had = new Set(tokenizeForMatch(before || ""));
  return [...new Set(tokenizeForMatch(text).filter((w) => jdTerms.has(w) && !had.has(w) && w.length > 3))].slice(0, 4);
}
export function falseChips(chipList, resume, before) {
  const have = wordSet(resumeText(resume) + "\n" + (before || ""));
  return chipList.filter((c) => norm(c).split(" ").filter(Boolean).every((w) => have.has(stem1(w))));
}
// Inv 9 (heuristic): numbers / capitalised names / seniority words that neither the resume nor the user's chat showed
export function newFacts(resume, afterText, userText = "") {
  const raw = (resumeText(resume) + "\n" + userText).replace(/(\d),(\d)/g, "$1$2");
  const have = norm(resumeText(resume) + "\n" + userText); const haveWords = new Set(have.split(" "));
  const nums = (afterText.replace(/\[number\]/g, " ").replace(/(\d),(\d)/g, "$1$2").match(/\d+(?:\.\d+)?/g) || []).filter((n) => !new RegExp(`(^|[^0-9.])${n.replace(".", "\\.")}([^0-9]|$)`).test(raw));
  const names = [...new Set((afterText.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).filter((w) => !haveWords.has(w.toLowerCase())))];
  const sen = (afterText.match(/\b(senior|principal|director|vp|head of|lead|chief)\b/gi) || []).filter((w) => !have.includes(w.toLowerCase()));
  return { numbers: nums, capitalised: names, seniority: [...new Set(sen)] };
}

/** Section name for a line id */
export const sectionOfTarget = (t) => (!t ? null : t === "K" ? "skills" : t === "S" ? "summary" : t === "T" ? "title" : t === "C" ? "contact" : t === "Z" ? "certifications" : /^E\d+B\d+$/.test(t) ? "experience bullets" : /^E\d+$/.test(t) ? "experience" : t);
/** Which sections of the resume differ between two versions */
export function changedSections(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); const out = [];
  for (const k of keys) {
    if (k === "otherSections") {
      const A = a?.otherSections || [], B = b?.otherSections || [];
      for (let i = 0; i < Math.max(A.length, B.length); i++) if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) out.push(`otherSections:${(A[i] || B[i])?.title}`);
    } else if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out.push(k);
  }
  return out;
}
const SECTION_WORDS = [
  ["core competencies", /core competenc/i], ["skills", /\bskills?\b/i], ["summary", /\bsummary|profile\b/i], ["projects", /\bprojects?\b/i], ["volunteer", /volunteer/i],
  ["achievements", /achievement|awards?\b/i], ["languages", /\blanguages?\b/i], ["interests", /\binterests?\b|hobbies/i], ["publications", /publication/i], ["references", /\breferences?\b/i],
  ["certifications", /certification/i], ["positions of responsibility", /positions? of responsibility/i], ["experience", /\bbullets?|experience|work history/i], ["title", /\bheadline|\btitle\b/i], ["contact", /\bcontact/i],
];
export const sectionsMentioned = (text) => SECTION_WORDS.filter(([, re]) => re.test(text)).map(([n]) => n);
const sectionKeyOfRequest = (n) => ({ "core competencies": "core competencies", skills: "skills", summary: "summary", projects: "projects", volunteer: "volunteer", achievements: "achievements", languages: "languages", interests: "interests", publications: "publications", references: "references", certifications: "certifications" })[n] || n;
/** Section a suggestion card touches (null for text we cannot place) */
export function sectionOfCard(s) {
  const t = s.edit?.target || s.target; return sectionOfTarget(t);
}
const CLAIM = /\b(I(?:'ve| have)?\s+(?:trimmed|shortened|removed|restored|reduced|cut|reordered|reorganised|reorganized|condensed|tightened|added|replaced|rewritten|rewrote|updated|streamlined)|(?:trimmed|shortened|removed|restored|reduced|condensed|streamlined)\b)/i;
/** Inv 4 / 5 / 6: does the reply claim a change to a section no new card touches? */
export function claimCheck(replyText, newCards) {
  const mentioned = sectionsMentioned(replyText).filter((n) => !["experience"].includes(n) || /bullets?/.test(replyText));
  const claims = CLAIM.test(replyText);
  const touched = new Set(newCards.map(sectionOfCard).filter(Boolean));
  const missing = mentioned.filter((n) => !(touched.has(n) || (n === "experience" && [...touched].some((x) => x.startsWith("experience")))));
  return { claims, mentioned, touched: [...touched], falseClaim: claims && missing.length > 0 ? missing : [] };
}
/** wordDiff over normalised tokens (what a user would call "really changed") */
export function wordDiffNorm(before, after) { return wordDiff(norm(before), norm(after)); }
