/**
 * Rules that keep suggestion cards honest about the resume they will be applied to.
 *
 * A card is a fixed edit written against the resume as it was at that moment (card.before = the text of its line then).
 * Once that line changes (another card, the person's own edit, a correction in chat) the card no longer describes
 * what Apply would do, so it is set aside ("outdated") instead of staying open to overwrite the newer text.
 * Everything here is pure: it takes a chat object and returns the next one.
 */
import { textAt } from "./tailorEdits.js";

/** Ops that overwrite or delete the text at their line. (Adding ops still make sense after the line changes.) */
const OVERWRITES = new Set(["replace", "remove", "set_skills", "set_items", "update_education"]);

/** Has the line this card rewrites changed since the card was written? */
export function lineChanged(card, resume) {
  const edit = card?.edit;
  if (!edit || !OVERWRITES.has(edit.op) || typeof card.before !== "string" || !edit.target) return false;
  let now;
  try {
    now = textAt(resume, edit.target);
  } catch {
    return false;
  }
  return now !== card.before;
}

/**
 * Set aside open cards whose line has changed, and bring them back when the line is back as it was (after an Undo).
 * Only cards set aside here (outdated: true) are ever brought back; ones the person dismissed stay dismissed.
 */
export function syncCards(chat) {
  if (!chat?.resume || !chat.suggestions) return chat;
  let changed = false;
  const next = {};
  for (const [id, s] of Object.entries(chat.suggestions)) {
    let card = s;
    if (s && s.status === "pending" && lineChanged(s, chat.resume)) card = { ...s, status: "dismissed", outdated: true };
    else if (s && s.status === "dismissed" && s.outdated && !lineChanged(s, chat.resume)) card = { ...s, status: "pending", outdated: false };
    if (card !== s) changed = true;
    next[id] = card;
  }
  return changed ? { ...chat, suggestions: next } : chat;
}

/** Bring one set-aside card back on purpose: it now compares against the line as it is today. */
export function restoreCard(chat, id) {
  const s = chat.suggestions[id];
  if (!s) return chat;
  const before = s.edit?.target && typeof s.before === "string" ? textAt(chat.resume, s.edit.target) ?? s.before : s.before;
  return { ...chat, suggestions: { ...chat.suggestions, [id]: { ...s, status: "pending", outdated: false, before } } };
}

/**
 * What a removal would take out, for the person to confirm: a whole section, a role, or an education entry.
 * Returns null for edits that don't delete a block.
 */
export function removalWarning(resume, edit) {
  if (!edit) return null;
  const t = String(edit.target || "");
  if (edit.op === "remove_section") return "This removes the whole section from your resume. Apply only if you want it gone.";
  if (edit.op === "remove" && /^D\d+$/.test(t)) {
    return emptiesSection(resume, edit)
      ? "This would remove your last education entry. Ask for a replacement first, so nothing is lost."
      : "This removes an education entry from your resume. Apply only if you want it gone.";
  }
  if (edit.op === "remove" && /^E\d+$/.test(t)) {
    return emptiesSection(resume, edit)
      ? "This would remove your last role. Ask for a replacement first, so nothing is lost."
      : "This removes a whole role from your resume. Apply only if you want it gone.";
  }
  return null;
}

/** Would applying this leave Education or Experience with nothing in it? (Never allowed from a single card.) */
export function emptiesSection(resume, edit) {
  const t = String(edit?.target || "");
  if (edit?.op !== "remove") return false;
  const key = /^D\d+$/.test(t) ? "education" : /^E\d+$/.test(t) ? "experience" : null;
  if (!key) return false;
  const left = (resume?.[key] || []).filter((e, i) => e && !e.removed && `${key === "education" ? "D" : "E"}${i}` !== t);
  return (resume?.[key] || []).some((e) => e && !e.removed) && left.length === 0;
}

/** The reminder shown before download: which suggestions are still open (it never blocks the download). */
export function openNotice(suggestions) {
  const open = Object.values(suggestions || {}).filter((s) => s && (s.status === "pending" || s.status === "queued"));
  if (!open.length) return "";
  const pins = open.map((s) => s.pin).filter((p) => p != null).sort((a, b) => a - b);
  const list = pins.length ? ` (${pins.slice(0, 8).map((p) => `#${p}`).join(", ")}${pins.length > 8 ? ` and ${pins.length - 8} more` : ""})` : "";
  return `${open.length} suggestion${open.length === 1 ? " is" : "s are"} still open${list}. You can download now and come back to them.`;
}
