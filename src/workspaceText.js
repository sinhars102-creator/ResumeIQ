/** Text helpers for the review workspace (shared by ResumeLLM and ResumeWorkspace). */
/** The text Apply will write: the person's own edit, or the suggestion with its blanks filled in. */
export function finalText(s, values = []) {
  if (s.custom != null) return s.custom;
  if (s.edit?.after == null) return null;
  let i = 0;
  return s.edit.after.replace(/\[number\]/g, () => (values[i++] || "").trim() || "[number]");
}
export const blanksIn = (s) => (s.custom == null && s.edit?.after ? (s.edit.after.match(/\[number\]/g) || []).length : 0);
export const isReady = (s, values = []) => {
  if (!s.edit) return false;
  const n = blanksIn(s);
  return !n || values.slice(0, n).filter((v) => /^\d+(\.\d+)?$/.test(String(v || "").trim())).length === n;
};


const UPGRADE_FROM = /^(helped|assisted|supported|contributed|worked|participated|involved)/i;
const UPGRADE_TO = /^(led|owned|spearheaded|headed|drove|launched|directed|managed)/i;
/** A rewrite that turns a supporting role into an ownership claim ("Assisted" -> "Led"); the person must confirm it. */
export function ownershipWarning(before, after) {
  const verb = (String(after || "").match(UPGRADE_TO) || [])[0];
  return verb && UPGRADE_FROM.test(String(before || "").trim()) ? `Use "${verb}" only if you led this. Otherwise, dismiss.` : null;
}

/** The suggestion with its "[number]" blanks taken out ("cut delays by [number]%" -> "cut delays"), for when the person has no figure to give. */
export function withoutNumbers(text) {
  return String(text ?? "")
    .replace(/\s*(?:\b(?:by|of|to|from|about|around|approximately|roughly|up to|nearly|over)\s+|~\s*)?\[number\]\s*(?:%|percent\b|x\b)?/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}
