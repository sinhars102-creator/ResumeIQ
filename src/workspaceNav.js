/**
 * The logic behind the review screen's navigation, kept free of the screen so it can be tested:
 * which suggestions a filter shows, stepping through them, keyboard shortcuts, where margin pins sit,
 * where the phone sheet settles, and which messages belong to which suggestion.
 */

/** Filter names on screen: "all" | "todo" (to review) | "applied". */
export const FILTERS = ["all", "todo", "applied"];

const isApplied = (s) => s.status === "applied" || s.status === "done";
/** A suggestion's state as the screen shows it. */
export const stateOf = (s) => (isApplied(s) ? "applied" : s.status === "dismissed" ? "dismissed" : "todo");

/** Suggestions a filter shows. Dismissed ones are hidden by default and only appear under "all" when asked for. */
export function visibleList(list, filter = "all", { showDismissed = false } = {}) {
  return list.filter((s) => {
    const st = stateOf(s);
    if (st === "dismissed") return showDismissed && filter === "all";
    return filter === "all" || filter === st;
  });
}

export const counts = (list) => ({
  all: list.filter((s) => stateOf(s) !== "dismissed").length,
  todo: list.filter((s) => stateOf(s) === "todo").length,
  applied: list.filter((s) => stateOf(s) === "applied").length,
});

/** The id one step from `fromId` in `dir` (+1 / -1), wrapping around. null when the list is empty. */
export function stepId(visible, fromId, dir) {
  if (!visible.length) return null;
  const at = visible.findIndex((s) => s.id === fromId);
  if (at < 0) return visible[dir < 0 ? visible.length - 1 : 0].id;
  return visible[(at + dir + visible.length) % visible.length].id;
}

/** The next suggestion still to review after `fromId` (wrapping), or null when none is left. */
export function nextTodoId(list, fromId) {
  const at = Math.max(0, list.findIndex((s) => s.id === fromId));
  for (let k = 1; k <= list.length; k++) {
    const s = list[(at + k) % list.length];
    if (s && s.id !== fromId && stateOf(s) === "todo") return s.id;
  }
  return null;
}

/** What a key press means on the review screen, or null. Never while typing in a field. */
export function keyAction(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return null;
  const t = e.target;
  const tag = t?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return null;
  if (tag === "BUTTON" && (e.key === "Enter" || e.key === " ")) return null; // let a focused button do its own thing
  switch (e.key) {
    case "j":
    case "J":
    case "ArrowDown":
      return "next";
    case "k":
    case "K":
    case "ArrowUp":
      return "prev";
    case "a":
    case "A":
      return "accept";
    case "s":
    case "S":
      return "skip";
    default:
      return null;
  }
}

/**
 * Where pins sit in the margin rail: each wants to line up with its target (`top`), none may overlap (at least `gap`
 * between neighbours), and none may leave the rail. Input: [{ id, top }]. Output: { id: top } in the same order of ids.
 */
export function layoutPins(wants, { size = 28, gap = 8, max = Infinity } = {}) {
  const sorted = [...wants].sort((a, b) => a.top - b.top || String(a.id).localeCompare(String(b.id)));
  const out = {};
  let floor = 0;
  for (const p of sorted) {
    const top = Math.max(p.top, floor);
    out[p.id] = top;
    floor = top + size + gap;
  }
  // If the last pins were pushed past the end of the rail, pull the whole run back up (keeping the gaps).
  const ids = sorted.map((p) => p.id);
  let limit = max - size;
  for (let i = ids.length - 1; i >= 0; i--) {
    if (out[ids[i]] > limit) out[ids[i]] = Math.max(0, limit);
    limit = out[ids[i]] - size - gap;
  }
  return out;
}

/** Where the phone sheet settles when let go: the snap point nearest the height it would reach, given its speed. */
export function snapTo(height, velocity, snaps, { projectMs = 180 } = {}) {
  const sorted = [...snaps].sort((a, b) => a - b);
  const projected = height + velocity * projectMs; // velocity in px/ms, positive = growing taller
  return sorted.reduce((best, s) => (Math.abs(s - projected) < Math.abs(best - projected) ? s : best), sorted[0]);
}

/** One segment per suggestion for the progress bar: applied (green), the active one (blue), the rest to review (grey). */
export function progressSegments(list, activeId) {
  return list
    .filter((s) => stateOf(s) !== "dismissed")
    .map((s) => ({ id: s.id, state: stateOf(s) === "applied" ? "applied" : s.id === activeId ? "active" : "todo" }));
}

/** The header's page chip. */
export function fitChip(pages) {
  if (!pages) return null;
  return pages <= 1 ? { ok: true, label: "Fits 1 page" } : { ok: false, label: `${pages} pages` };
}

const WHOLE = /\b(1|one)\s*page\b|\bwithin\s+(1|one)\s+page\b|\bfit\b.*\bpage\b|\bwhole\s+resume\b|\bentire\s+resume\b|\bevery\s+(bullet|role|section)\b|\ball\s+(the\s+)?(bullets|roles|sections)\b|\beverywhere\b|\bthroughout\b|\bshorten\s+(it|the\s+resume)\b|\bmake\s+it\s+shorter\b|\btrim\s+(it|the\s+resume)\b/i;
/** Does this message ask for something about the whole resume (not the suggestion being looked at)? */
export const isWholeResumeRequest = (text) => WHOLE.test(String(text || ""));

/**
 * The messages shown for the active suggestion (or, with none active, the general ones). A message belongs to the
 * suggestion it was sent about (`sid`); whole-resume requests and their replies carry no `sid`.
 */
export function threadFor(thread, activeId) {
  return (thread || []).filter((m) => (activeId ? m.sid === activeId : !m.sid));
}

/** The composer's placeholder. */
export const placeholderFor = (active) => (active ? `Reply about #${active.pin}, or ask anything` : "Ask anything about your resume");
