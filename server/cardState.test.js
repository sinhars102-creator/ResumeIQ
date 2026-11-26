import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit, captureUndo, finalResume, textAt } from "../src/tailorEdits.js";
import { recordApplied, undoStep, undoCard, canUndoCard, runManual } from "../src/editHistory.js";
import { syncCards, restoreCard, removalWarning, emptiesSection, openNotice } from "../src/cardState.js";
import { humanizeIds } from "./tailorChat.js";

const RESUME = {
  name: "Rohan", title: "AD", contact: "c", summary: "ORIG",
  experience: [{ role: "AD", company: "Halden", period: "2018 - Present", bullets: ["Managed a team of 24 people", "Cut costs by 8%"] }],
  education: [{ degree: "MBA", school: "MSMS", year: "2012" }, { degree: "B.Com", school: "Mumbai Univ", year: "2010" }],
  skills: ["FP&A"],
};
const card = (id, edit, resume = RESUME) => ({ id, status: "pending", edit, before: textAt(resume, edit.target) });
const chatWith = (cards) => ({ resume: RESUME, history: [], future: [], suggestions: Object.fromEntries(cards.map((c) => [c.id, c])) });
function apply(c, id) {
  const cur = c.suggestions[id];
  const undo = captureUndo(c.resume, cur.edit);
  return syncCards(recordApplied({ ...c, resume: applyEdit(c.resume, cur.edit, cur.edit.after), suggestions: { ...c.suggestions, [id]: { ...cur, status: "applied", undo } } }, [id]));
}

// Vikram: a correction was overwritten by an older card for the same line.
test("an open card is set aside when its line changes, so Apply all cannot revert a correction", () => {
  let c = chatWith([
    card("fix42", { target: "E0B0", op: "replace", after: "Managed a team of 42 people" }),
    card("old24", { target: "E0B0", op: "replace", after: "Led a multi-state team of 24 people" }),
  ]);
  c = apply(c, "fix42");
  assert.equal(c.suggestions.old24.status, "dismissed");
  assert.equal(c.suggestions.old24.outdated, true);
  assert.equal(textAt(c.resume, "E0B0"), "Managed a team of 42 people");
});

test("set-aside cards come back when the line is restored by Undo, and not before", () => {
  let c = chatWith([card("a", { target: "S", op: "replace", after: "A" }), card("b", { target: "S", op: "replace", after: "B" })]);
  c = apply(c, "a");
  assert.equal(c.suggestions.b.status, "dismissed");
  c = syncCards(undoStep(c));
  assert.equal(c.resume.summary, "ORIG");
  assert.equal(c.suggestions.b.status, "pending");
  assert.equal(c.suggestions.a.status, "pending");
});

test("a card the person dismissed is never brought back automatically", () => {
  let c = chatWith([card("a", { target: "S", op: "replace", after: "A" }), card("b", { target: "S", op: "replace", after: "B" })]);
  c.suggestions.b = { ...c.suggestions.b, status: "dismissed" };
  c = syncCards(undoStep(apply(c, "a")));
  assert.equal(c.suggestions.b.status, "dismissed");
});

test("the person's own edit sets aside cards on that line too, and Restore reuses a card on purpose", () => {
  let c = chatWith([card("a", { target: "S", op: "replace", after: "A" })]);
  c = syncCards(runManual(c, { target: "S", op: "replace", after: "Mine" }));
  assert.equal(c.suggestions.a.status, "dismissed");
  c = syncCards(restoreCard(c, "a"));
  assert.equal(c.suggestions.a.status, "pending");
  assert.equal(c.suggestions.a.before, "Mine");
});

test("adding ops are not set aside when the line changes", () => {
  let c = chatWith([card("k", { target: "K", op: "add_skills", skills: ["SQL"] }), card("s", { target: "K", op: "replace", after: "X" })]);
  c = syncCards({ ...c, resume: { ...c.resume, skills: ["FP&A", "Excel"] } });
  assert.equal(c.suggestions.k.status, "pending");
  assert.equal(c.suggestions.s.status, "dismissed");
});

// Rohan: undoing one card wiped a newer card's change and left it marked Applied.
test("undoing an older card is refused while a newer change sits on the same line", () => {
  let c = chatWith([card("a", { target: "S", op: "replace", after: "A" })]);
  c = apply(c, "a");
  c = apply({ ...c, suggestions: { ...c.suggestions, b: card("b", { target: "S", op: "replace", after: "B" }, c.resume) } }, "b");
  assert.equal(canUndoCard(c, "a"), false);
  assert.equal(undoCard(c, "a"), c);
  assert.equal(c.resume.summary, "B");
  assert.equal(canUndoCard(c, "b"), true);
});

test("undoing a card on its own leaves unrelated newer changes in place", () => {
  let c = chatWith([card("a", { target: "S", op: "replace", after: "A" }), card("b", { target: "E0B1", op: "replace", after: "Cut costs by 9%" })]);
  c = apply(apply(c, "a"), "b");
  assert.equal(canUndoCard(c, "a"), true);
  c = syncCards(undoCard(c, "a"));
  assert.equal(c.resume.summary, "ORIG");
  assert.equal(textAt(c.resume, "E0B1"), "Cut costs by 9%");
  assert.equal(c.suggestions.b.status, "applied");
  assert.equal(c.history.length, 1);
});

test("a role-level change blocks undoing an older bullet edit under it", () => {
  let c = chatWith([card("b", { target: "E0B0", op: "replace", after: "New bullet" })]);
  c = apply(c, "b");
  c = apply({ ...c, suggestions: { ...c.suggestions, r: card("r", { target: "E0", op: "replace", after: "Director" }, c.resume) } }, "r");
  assert.equal(canUndoCard(c, "b"), false);
});

// Rohan: two removals took out the whole Education section.
test("a single card cannot remove the last education entry; removals are flagged", () => {
  const r1 = { target: "D1", op: "remove" };
  assert.equal(emptiesSection(RESUME, r1), false);
  assert.match(removalWarning(RESUME, r1), /removes an education entry/);
  const oneLeft = applyEdit(RESUME, { target: "D0", op: "remove" });
  assert.equal(emptiesSection(oneLeft, r1), true);
  assert.match(removalWarning(oneLeft, r1), /last education entry/);
  assert.equal(finalResume(oneLeft).education.length, 1);
  assert.equal(removalWarning(RESUME, { target: "S", op: "replace", after: "x" }), null);
  assert.match(removalWarning(RESUME, { target: "SEC:skills", op: "remove_section" }), /whole section/);
});

// Everyone: [E0B4] tags leaked into chat.
test("line ids are replaced by plain descriptions, never shown", () => {
  const out = humanizeIds("Your summary [S] repeats [E0B0], and E0B1 gives no duration. [K] and [D1] fine; [E0] too.", RESUME);
  assert.doesNotMatch(out, /\[[A-Z]|E0B|D1\]/);
  assert.match(out, /your summary/);
  assert.match(out, /the bullet “Managed a team of 24 people”/);
  assert.match(out, /your B\.Com, Mumbai Univ education entry/);
  assert.match(out, /your AD at Halden role/);
  assert.equal(humanizeIds("No ids here.", RESUME), "No ids here.");
});

// Sana: the portfolio link printed in the PDF was plain text.
test("web addresses and emails in the PDF are clickable links", async () => {
  const { buildResumePdf, linksIn } = await import("../src/resumePdf.js");
  assert.deepEqual(linksIn("a@b.com · +91 98765 43210 · linkedin.com/in/sana · sanakhan.design/work, Hyderabad").map((l) => l.url), ["mailto:a@b.com", "https://linkedin.com/in/sana", "https://sanakhan.design/work"]);
  assert.deepEqual(linksIn("Led a team of 5 in 2.5 years, e.g. Q3."), []);
  const doc = buildResumePdf({ name: "Sana Khan", title: "Brand Manager", contact: "sana@example.com · linkedin.com/in/sana · https://sanakhan.design/work · Hyderabad", experience: [], education: [], skills: [] }, null);
  const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
  for (const u of ["mailto:sana@example.com", "https://linkedin.com/in/sana", "https://sanakhan.design/work"]) assert.ok(raw.includes(`/URI (${u})`), `missing link ${u}`);
});

test("a suggestion can be kept without its [number] blanks and still reads properly", async () => {
  const { withoutNumbers } = await import("../src/workspaceText.js");
  assert.equal(withoutNumbers("Cut late deliveries by [number]% across 3 plants."), "Cut late deliveries across 3 plants.");
  assert.equal(withoutNumbers("Grew revenue to Rs 310 crore, a ~[number]% CAGR."), "Grew revenue to Rs 310 crore, a CAGR.");
  assert.equal(withoutNumbers("Reduced stoppages by [number]%."), "Reduced stoppages.");
  assert.doesNotMatch(withoutNumbers("Lifted NPS from [number] to [number]."), /\[number\]/);
});

test("the open-suggestions reminder says how many and which", () => {
  assert.equal(openNotice({}), "");
  assert.equal(openNotice({ a: { status: "applied", pin: 1 } }), "");
  assert.match(openNotice({ a: { status: "pending", pin: 5 }, b: { status: "pending", pin: 3 }, c: { status: "dismissed", pin: 1 } }), /^2 suggestions are still open \(#3, #5\)\./);
  assert.match(openNotice({ a: { status: "pending", pin: 2 } }), /^1 suggestion is still open \(#2\)/);
});

// Rohan: role dates could not be edited anywhere.
test("a role's dates can be changed without touching its title, company or bullets, and undone", () => {
  const edit = { target: "E0", op: "replace", after: "AD · Halden", period: "Apr 2018 – Present" };
  const next = applyEdit(RESUME, edit, edit.after);
  assert.equal(next.experience[0].period, "Apr 2018 – Present");
  assert.equal(next.experience[0].role, "AD");
  assert.equal(next.experience[0].company, "Halden");
  assert.deepEqual(next.experience[0].bullets, RESUME.experience[0].bullets);
  const c = runManual({ resume: RESUME, history: [], future: [], suggestions: {} }, edit);
  assert.equal(undoStep(c).resume.experience[0].period, "2018 - Present");
});

test("an education entry can be added and edited field by field, and undone", () => {
  const added = applyEdit(RESUME, { target: "D", op: "add_education", entry: { degree: "PGDM", school: "XLRI", year: "2022", grade: "CGPA 8.4", location: "Jamshedpur" } });
  assert.equal(finalResume(added).education.length, 3);
  const edited = applyEdit(added, { target: "D0", op: "update_education", entry: { degree: "MBA, Finance", school: "MSMS", year: "2010 – 2012", grade: "", location: "Mumbai" } });
  assert.deepEqual(finalResume(edited).education[0], { degree: "MBA, Finance", school: "MSMS", year: "2010 – 2012", grade: "", location: "Mumbai" });
  assert.equal(finalResume(edited).education[1].degree, "B.Com");
  const c = runManual({ resume: RESUME, history: [], future: [], suggestions: {} }, { target: "D0", op: "update_education", entry: { degree: "X", school: "Y", year: "1" } });
  assert.equal(undoStep(c).resume.education[0].degree, "MBA");
});

// Design handoff, section 7: questions use the job's real terms, and held-back claims are explained in one line.
test("questions about unverified claims use real terms in plain words, never filler like 'score, implementing'", async () => {
  const { askAbout, heldBackLine, askableTerms } = await import("./tailorChat.js");
  const jd = "You will own reliability. We need hands-on incident response, post-mortems and Kubernetes experience. Implementing alerting and score cards is a plus.";
  assert.deepEqual(askableTerms(["score", "implementing"], jd), []);
  assert.match(askAbout(["score", "implementing"], jd), /^That line needs something you haven't told me yet/);
  assert.doesNotMatch(askAbout(["score", "implementing"], jd), /score|implementing/i);
  const q = askAbout(["Kubernetes", "score"], jd);
  assert.match(q, /^The job asks for Kubernetes\. Have you done this\? Tell me where, and I'll add it\.$/);
  assert.match(askAbout(["kubernetes", "alerting"], jd), /^The job asks for Kubernetes( and |, )?.*Have you done (either|this)\?/);
  assert.equal(heldBackLine(["Kubernetes"], jd), `I didn't add "Kubernetes": you haven't said you've done that.`);
  assert.match(heldBackLine(["score"], jd), /^I left that out/);
});

test("the prices shown on the home page and in the payment step match what the server charges", async () => {
  const { PLANS, PRICE_LINE } = await import("../src/pricing.js");
  const { DOWNLOAD_PLANS } = await import("./entitlements.js");
  assert.equal(PLANS.length, Object.keys(DOWNLOAD_PLANS).length);
  for (const p of PLANS) assert.equal(p.price * 100, DOWNLOAD_PLANS[p.id].amount, p.id);
  for (const p of PLANS) assert.ok(PRICE_LINE.includes(`₹${p.price}`), `${p.price} missing from the price line`);
});
