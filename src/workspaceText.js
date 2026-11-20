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

