import { test } from "node:test";
import assert from "node:assert/strict";
import { runManual, undoStep, redoStep, recordApplied, forgetApplied, cardAffected } from "../src/editHistory.js";
import { applyEdit, captureUndo } from "../src/tailorEdits.js";
import { sectionPlan } from "../src/resumeSections.js";

const RESUME = {
  name: "A", summary: "Old summary", skills: ["SQL", "Py"], certifications: ["PMP"],
  experience: [{ role: "PM", company: "X", period: "1", bullets: ["one", "two"] }],
  otherSections: [{ title: "Core Competencies", items: ["c1", "c2"] }],
};
const chat = (extra = {}) => ({ resume: RESUME, suggestions: {}, history: [], future: [], ...extra });
const keys = (c) => sectionPlan(c.resume).map((s) => s.key).join();

test("your own edits and suggestions share one undo and redo history", () => {
  let c = chat({ suggestions: { s1: { id: "s1", status: "pending", edit: { target: "S", op: "replace", after: "AI summary" }, target: "S" } } });
  // apply the suggestion the way the app does, then record it
  const s = c.suggestions.s1;
  c = { ...c, resume: applyEdit(c.resume, s.edit), suggestions: { s1: { ...s, status: "applied", undo: captureUndo(c.resume, s.edit), appliedText: "AI summary" } } };
  c = recordApplied(c, ["s1"]);
  c = runManual(c, { target: "SEC:skills", op: "move_section", to: 0 });
  c = runManual(c, { target: "SEC:other0", op: "remove_section" });
  assert.match(keys(c), /^skills,summary/);
  assert.ok(!keys(c).includes("other0"));
  c = undoStep(c); // brings back Core Competencies
  assert.ok(keys(c).includes("other0"));
  c = undoStep(c); // skills back where it was
  assert.match(keys(c), /^summary,experience/);
  c = undoStep(c); // the AI's summary undone, and the card is pending again
  assert.equal(c.resume.summary, "Old summary");
  assert.equal(c.suggestions.s1.status, "pending");
  assert.equal(c.history.length, 0);
  c = redoStep(c);
  assert.equal(c.resume.summary, "AI summary");
  assert.equal(c.suggestions.s1.status, "applied");
  c = redoStep(c);
  c = redoStep(c);
  assert.ok(!keys(c).includes("other0"));
  assert.match(keys(c), /^skills,summary/);
  assert.equal(redoStep(c), c, "nothing left to redo");
});

test("a new change clears Redo", () => {
  let c = runManual(chat(), { target: "S", op: "replace", after: "Mine" });
  c = undoStep(c);
  assert.equal(c.future.length, 1);
  c = runManual(c, { target: "K", op: "replace", after: "SQL" });
  assert.equal(c.future.length, 0);
});

test("editing a line dismisses the AI's pending suggestion for it, and Undo brings it back", () => {
  const card = { id: "c1", status: "pending", edit: { target: "E0B0", op: "replace", after: "Better one" }, target: "E0B0" };
  const other = { id: "c2", status: "pending", edit: { target: "E0B1", op: "replace", after: "Better two" }, target: "E0B1" };
  let c = runManual(chat({ suggestions: { c1: card, c2: other } }), { target: "E0B0", op: "replace", after: "My own wording" });
  assert.equal(c.suggestions.c1.status, "dismissed");
  assert.equal(c.suggestions.c2.status, "pending");
  c = undoStep(c);
  assert.equal(c.suggestions.c1.status, "pending");
  assert.equal(c.resume.experience[0].bullets[0], "one");
});

test("removing a role or a section dismisses the suggestions that point inside it", () => {
  assert.equal(cardAffected({ target: "E0", op: "remove" }, "E0B1"), true);
  assert.equal(cardAffected({ target: "E0", op: "remove" }, "E1B1"), false);
  assert.equal(cardAffected({ target: "E1", op: "remove" }, "E10B0"), false);
  assert.equal(cardAffected({ target: "SEC:skills", op: "remove_section" }, "K"), true);
  assert.equal(cardAffected({ target: "SEC:other0", op: "remove_section" }, "X:other0:1"), true);
  assert.equal(cardAffected({ target: "SEC:experience", op: "remove_section" }, "E0B0"), true);
  assert.equal(cardAffected({ target: "SEC:skills", op: "move_section", to: 0 }, "K"), false);
  assert.equal(cardAffected({ target: "E0", op: "add_bullet" }, "E0"), false);
});

test("a card's own Undo link removes it from the shared history", () => {
  let c = recordApplied(chat(), ["s1", "s2"]);
  c = forgetApplied(c, "s1");
  assert.deepEqual(c.history.map((h) => h.id), ["s2"]);
});
