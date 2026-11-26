import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleList, counts, stepId, nextTodoId, keyAction, layoutPins, snapTo, progressSegments, fitChip, isWholeResumeRequest, threadFor, placeholderFor } from "../src/workspaceNav.js";

const S = (id, pin, status = "pending") => ({ id, pin, status });
const LIST = [S("a", 1, "applied"), S("b", 2), S("c", 3, "dismissed"), S("d", 4), S("e", 5, "done")];

test("filters show the right suggestions and keep dismissed ones out by default", () => {
  assert.deepEqual(visibleList(LIST, "all").map((s) => s.id), ["a", "b", "d", "e"]);
  assert.deepEqual(visibleList(LIST, "todo").map((s) => s.id), ["b", "d"]);
  assert.deepEqual(visibleList(LIST, "applied").map((s) => s.id), ["a", "e"]);
  assert.deepEqual(visibleList(LIST, "all", { showDismissed: true }).map((s) => s.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(counts(LIST), { all: 4, todo: 2, applied: 2 });
});

test("stepping wraps, starts sensibly, and survives an empty list", () => {
  const v = visibleList(LIST, "all");
  assert.equal(stepId(v, "b", 1), "d");
  assert.equal(stepId(v, "e", 1), "a");
  assert.equal(stepId(v, "a", -1), "e");
  assert.equal(stepId(v, null, 1), "a");
  assert.equal(stepId(v, null, -1), "e");
  assert.equal(stepId(v, "gone", 1), "a");
  assert.equal(stepId([], "a", 1), null);
});

test("after a decision it moves to the next suggestion still to review, or says none is left", () => {
  assert.equal(nextTodoId(LIST, "b"), "d");
  assert.equal(nextTodoId(LIST, "d"), "b");
  assert.equal(nextTodoId([S("x", 1, "applied"), S("y", 2, "applied")], "x"), null);
  assert.equal(nextTodoId([S("x", 1)], "x"), null); // only itself left
});

test("keyboard shortcuts work outside fields and never inside them", () => {
  const key = (k, tag = "BODY", extra = {}) => keyAction({ key: k, target: { tagName: tag }, ...extra });
  assert.equal(key("j"), "next");
  assert.equal(key("ArrowDown"), "next");
  assert.equal(key("k"), "prev");
  assert.equal(key("ArrowUp"), "prev");
  assert.equal(key("a"), "accept");
  assert.equal(key("S"), "skip");
  assert.equal(key("x"), null);
  for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(key("a", tag), null, tag);
  assert.equal(keyAction({ key: "a", target: { tagName: "DIV", isContentEditable: true } }), null);
  assert.equal(key("a", "BODY", { metaKey: true }), null); // Cmd+A is select all
  assert.equal(key("s", "BODY", { ctrlKey: true }), null);
  assert.equal(key("Enter", "BUTTON"), null);
});

test("pins line up with their targets, never overlap, and stay inside the rail", () => {
  const out = layoutPins([{ id: "a", top: 100 }, { id: "b", top: 104 }, { id: "c", top: 110 }, { id: "d", top: 400 }], { size: 28, gap: 8 });
  assert.deepEqual(out, { a: 100, b: 136, c: 172, d: 400 });
  const tops = Object.values(out).sort((x, y) => x - y);
  tops.slice(1).forEach((t, i) => assert.ok(t - tops[i] >= 36));
  // a crowd at the bottom is pulled back up into the rail
  const crowd = layoutPins([{ id: "a", top: 480 }, { id: "b", top: 485 }, { id: "c", top: 490 }], { size: 28, gap: 8, max: 520 });
  assert.ok(Object.values(crowd).every((t) => t >= 0 && t + 28 <= 520), JSON.stringify(crowd));
  const ct = Object.values(crowd).sort((x, y) => x - y);
  ct.slice(1).forEach((t, i) => assert.ok(t - ct[i] >= 36));
  assert.deepEqual(layoutPins([], {}), {});
});

test("the phone sheet settles on the nearest snap, carried by how fast it was flicked", () => {
  const snaps = [170, 560, 700];
  assert.equal(snapTo(180, 0, snaps), 170);
  assert.equal(snapTo(400, 0, snaps), 560);
  assert.equal(snapTo(200, 1.5, snaps), 560); // a brisk upward flick from near the peek
  assert.equal(snapTo(560, -2.5, snaps), 170); // a fast downward flick
  assert.equal(snapTo(690, 0.1, snaps), 700);
});

test("progress segments show applied, active and to-review, without dismissed ones", () => {
  assert.deepEqual(progressSegments(LIST, "b").map((s) => s.state), ["applied", "active", "todo", "applied"]);
  assert.deepEqual(progressSegments(LIST, null).map((s) => s.state), ["applied", "todo", "todo", "applied"]);
});

test("the page chip says whether it fits", () => {
  assert.deepEqual(fitChip(1), { ok: true, label: "Fits 1 page" });
  assert.deepEqual(fitChip(2), { ok: false, label: "2 pages" });
  assert.equal(fitChip(null), null);
});

test("whole-resume requests are told apart from talk about one suggestion", () => {
  for (const t of ["Can you make it within 1 page", "keep it to one page", "make it shorter", "tighten every bullet", "shorten the resume", "apply this everywhere"]) assert.equal(isWholeResumeRequest(t), true, t);
  for (const t of ["At Blinkit we built dashboards for warehouse stock-outs", "I led a team of 6", "add a metric to this", "yes, since 2019"]) assert.equal(isWholeResumeRequest(t), false, t);
});

test("each suggestion keeps its own conversation; general talk stays separate", () => {
  const thread = [{ id: 1, text: "hi" }, { id: 2, sid: "a", text: "about a" }, { id: 3, sid: "b", text: "about b" }, { id: 4, sid: "a", text: "more a" }];
  assert.deepEqual(threadFor(thread, "a").map((m) => m.id), [2, 4]);
  assert.deepEqual(threadFor(thread, "b").map((m) => m.id), [3]);
  assert.deepEqual(threadFor(thread, null).map((m) => m.id), [1]);
  assert.match(placeholderFor({ pin: 2 }), /^Reply about #2, or ask anything$/);
  assert.equal(placeholderFor(null), "Ask anything about your resume");
});
