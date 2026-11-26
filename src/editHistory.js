/**
 * One undo/redo history for everything that changes the resume: the person's own edits and suggestions they applied.
 * Both go through the same actions (tailorEdits.js), so the resume, the highlights and the PDF always agree.
 *
 *   chat.history: [{ kind: "manual", edit, undo, dismissed: [ids] } | { kind: "suggestion", id }]   (newest last)
 *   chat.future:  the undone entries, for Redo (cleared by any new change)
 *
 * All functions take the chat object and return the next one; none touch the screen.
 */
import { applyEdit, applyUndo, captureUndo, isSectionTarget, isExtraTarget } from "./tailorEdits.js";

const MAX_HISTORY = 60;
const trim = (list) => list.slice(-MAX_HISTORY);

/** Which resume lines a section holds, as a test on a suggestion's target. */
function sectionOwns(key, target) {
  if (!target) return false;
  if (target === `SEC:${key}` || target === `X:${key}` || target.startsWith(`X:${key}:`)) return true;
  const map = { summary: /^S$/, experience: /^E\d+(B\d+)?$/, education: /^D\d*$/, skills: /^K$/, certifications: /^Z$/ };
  return !!map[key]?.test(target);
}

/** Would this pending suggestion no longer make sense after the person's edit? */
export function cardAffected(edit, cardTarget) {
  if (!cardTarget) return false;
  const t = edit.target || "";
  if (isSectionTarget(t)) return edit.op === "remove_section" && sectionOwns(t.slice(4), cardTarget);
  if (edit.op === "remove" && /^E\d+$/.test(t)) return new RegExp(`^${t}(B\\d+)?$`).test(cardTarget);
  if (edit.op === "add_bullet" || edit.op === "add_item" || edit.op === "add_entry" || edit.op === "add_custom_section" || edit.op === "add_education") return false;
  return cardTarget === t || (isExtraTarget(t) && cardTarget === t);
}

function dismissAffected(chat, edit) {
  const suggestions = { ...chat.suggestions };
  const dismissed = [];
  for (const [id, s] of Object.entries(suggestions)) {
    if (s.status === "pending" && s.edit && cardAffected(edit, s.edit.target || s.target)) {
      suggestions[id] = { ...s, status: "dismissed" };
      dismissed.push(id);
    }
  }
  return { suggestions, dismissed };
}

/** The person changes the resume themselves. */
export function runManual(chat, edit) {
  const undo = captureUndo(chat.resume, edit);
  const resume = applyEdit(chat.resume, edit, edit.after);
  const { suggestions, dismissed } = dismissAffected(chat, edit);
  return { ...chat, resume, suggestions, history: trim([...(chat.history || []), { kind: "manual", edit, undo, dismissed }]), future: [] };
}

/** A suggestion was applied (its resume change is made elsewhere): remember it so Undo can find it. */
export function recordApplied(chat, ids) {
  return { ...chat, history: trim([...(chat.history || []), ...ids.map((id) => ({ kind: "suggestion", id }))]), future: [] };
}

/** Forget an entry (the card's own Undo link, or a reset). */
export function forgetApplied(chat, id) {
  return { ...chat, history: (chat.history || []).filter((h) => !(h.kind === "suggestion" && h.id === id)), future: (chat.future || []).filter((h) => !(h.kind === "suggestion" && h.id === id)) };
}

/**
 * Which parts of the resume an undo token puts back, as tags: "f:<field>" a whole top-level field, "b:<role>:<i>" one
 * bullet, "x:<field>:<target>" one line of an extra section. Two changes conflict when undoing the older one would also
 * overwrite what the newer one did.
 */
function footprint(token) {
  if (!token) return [];
  const fieldOf = (key) => (/^other\d+$/.test(key) ? "otherSections" : key);
  if (token.kind === "snap") return Object.keys(token.fields).map((f) => `f:${f}`);
  if (token.kind === "field") return [`f:${token.field}`];
  if (token.kind === "skills" || token.kind === "certifications" || token.kind === "education") return [`f:${token.kind}`];
  if (token.kind === "bullet" || token.kind === "added_bullet") return [`b:${token.role}:${token.index}`];
  if (token.kind === "x_section") return [`f:${fieldOf(token.key)}`];
  if (token.kind?.startsWith("x_")) return [`x:${fieldOf(String(token.target).split(":")[1])}:${token.target}`];
  return ["f:*"]; // unknown kind: treat as touching everything
}
function tagsConflict(p, q) {
  if (p === q || p === "f:*" || q === "f:*") return true;
  const [a, b] = p.startsWith("f:") ? [p, q] : [q, p];
  if (!a.startsWith("f:")) return false;
  if (a === "f:experience" && b.startsWith("b:")) return true;
  return b.startsWith("x:") && b.split(":")[1] === a.slice(2);
}
const conflicts = (t1, t2) => footprint(t1).some((p) => footprint(t2).some((q) => tagsConflict(p, q)));

/** Later history entries (after `id`'s own) whose changes overlap what undoing `id` would put back. */
function laterConflicts(chat, id) {
  const history = chat.history || [];
  const at = history.findIndex((h) => h.kind === "suggestion" && h.id === id);
  if (at < 0) return [];
  const mine = chat.suggestions[id]?.undo;
  return history.slice(at + 1).filter((h) => conflicts(mine, h.kind === "manual" ? h.undo : chat.suggestions[h.id]?.undo));
}

/** Can this applied card be undone on its own without wiping out a newer change to the same part of the resume? */
export function canUndoCard(chat, id) {
  const s = chat.suggestions?.[id];
  return !!s && s.status === "applied" && !!s.undo && laterConflicts(chat, id).length === 0;
}

/** Undo one applied card exactly (resume and card together). A card with newer changes on top of it is left alone: use Undo in the toolbar. */
export function undoCard(chat, id) {
  if (!canUndoCard(chat, id)) return chat;
  const s = chat.suggestions[id];
  const next = { ...chat, resume: applyUndo(chat.resume, s.undo), suggestions: { ...chat.suggestions, [id]: { ...s, status: "pending", undo: null } } };
  return forgetApplied(next, id);
}

export function undoStep(chat) {
  const history = [...(chat.history || [])];
  const entry = history.pop();
  if (!entry) return chat;
  if (entry.kind === "manual") {
    const suggestions = { ...chat.suggestions };
    (entry.dismissed || []).forEach((id) => suggestions[id]?.status === "dismissed" && (suggestions[id] = { ...suggestions[id], status: "pending" }));
    return { ...chat, resume: applyUndo(chat.resume, entry.undo), suggestions, history, future: trim([...(chat.future || []), entry]) };
  }
  const s = chat.suggestions[entry.id];
  if (!s || s.status !== "applied") return { ...chat, history };
  return {
    ...chat,
    resume: applyUndo(chat.resume, s.undo),
    suggestions: { ...chat.suggestions, [entry.id]: { ...s, status: "pending", undo: null } },
    history,
    future: trim([...(chat.future || []), { kind: "suggestion", id: entry.id, text: s.appliedText ?? null }]),
  };
}

export function redoStep(chat) {
  const future = [...(chat.future || [])];
  const entry = future.pop();
  if (!entry) return chat;
  if (entry.kind === "manual") {
    const undo = captureUndo(chat.resume, entry.edit);
    const resume = applyEdit(chat.resume, entry.edit, entry.edit.after);
    const { suggestions, dismissed } = dismissAffected(chat, entry.edit);
    return { ...chat, resume, suggestions, future, history: trim([...(chat.history || []), { ...entry, undo, dismissed }]) };
  }
  const s = chat.suggestions[entry.id];
  if (!s?.edit || s.status !== "pending") return { ...chat, future };
  const undo = captureUndo(chat.resume, s.edit);
  return {
    ...chat,
    resume: applyEdit(chat.resume, s.edit, entry.text ?? s.edit.after),
    suggestions: { ...chat.suggestions, [entry.id]: { ...s, status: "applied", undo, appliedText: entry.text ?? s.edit.after ?? null } },
    future,
    history: trim([...(chat.history || []), { kind: "suggestion", id: entry.id }]),
  };
}
