import { test } from "node:test";
import assert from "node:assert/strict";
import { resumeLines, claimContext, cleanEdit, plainText, CLAIMS_A_CHANGE } from "./tailorChat.js";
import { extraLines, extraSections, expectedTexts } from "../src/resumeSections.js";
import { textAt, applyEdit, captureUndo, applyUndo, finalResume, lineOrder } from "../src/tailorEdits.js";

// A resume with every section type, including a Core Competencies section the parser files under otherSections.
const FULL = {
  name: "Rahul Sinha",
  title: "Senior Product Manager | 0→1 & Growth",
  contact: "r@example.com · +91 98 · Bangalore",
  summary: "Product manager with nine years building marketplace products.",
  experience: [{ role: "Manager", company: "Blinkit", period: "2015 - 2018", bullets: ["Built supply‑side systems for a high‑scale marketplace", "Cut wastage from 30% to 4%"] }],
  education: [{ degree: "B.Tech", school: "Manipal", year: "2016" }],
  skills: ["SQL", "Experimentation"],
  certifications: ["PMP (2022)"],
  projects: [{ name: "Demand model", period: "2021", bullets: ["Forecast demand for perishables", "Reduced stockouts"] }],
  volunteer: [{ role: "Mentor", organization: "ADPList", period: "2020", bullets: ["Mentored 20 PMs"] }],
  achievements: ["Top performer 2019", "Promoted in 14 months"],
  publications: ["Forecasting at scale, Medium"],
  languages: ["English", "Hindi"],
  interests: ["Chess"],
  references: [{ name: "A. Rao", title: "VP" }],
  otherSections: [{ title: "Core Competencies", items: ["Product Strategy", "Roadmapping", "Data & AI Systems", "Growth", "Execution"] }],
};
const ctx = (r = FULL, jd = "", chat = "") => claimContext(r, jd, chat, {});

test("the AI is shown every section the screen and PDF show", () => {
  const lines = resumeLines(FULL);
  const seen = (t) => lines.toLowerCase().includes(String(t).toLowerCase());
  for (const t of expectedTexts(FULL)) assert.ok(seen(t), `AI view is missing: ${t}`);
  for (const sec of extraSections(FULL)) assert.ok(seen(sec.title), `AI view is missing the section heading: ${sec.title}`);
});

test("every editable id shown to the AI resolves to the text shown beside it", () => {
  const lines = resumeLines(FULL).split("\n");
  const ids = lines.map((l) => /\[(X:[^\]]+)\]/.exec(l)?.[1]).filter(Boolean);
  assert.ok(ids.length >= 12);
  for (const id of ids) assert.notEqual(textAt(FULL, id), null, id);
  assert.ok(!ids.includes("X:projects") && !ids.includes("X:volunteer"), "entry sections are addressed through their entries");
  for (const sec of extraLines(FULL)) sec.items.forEach((x) => x.id && assert.ok(ids.includes(x.id), x.id));
});

test("the AI is told which sections the resume does not have", () => {
  const bare = { name: "A", title: "PM", summary: "x", experience: [{ role: "PM", company: "Co", bullets: ["did a thing"] }], skills: ["SQL"] };
  const out = resumeLines(bare);
  assert.match(out, /NOT ON THIS RESUME: .*Publications/);
  assert.match(out, /SECTIONS ON THIS RESUME, top to bottom: Summary \[SEC:summary\], Experience \[SEC:experience\], Skills \[SEC:skills\]/);
  assert.doesNotMatch(resumeLines(FULL), /NOT ON THIS RESUME: .*Publications/);
});

test("trim Core Competencies: set_items removes items and keeps only what was there", () => {
  const e = cleanEdit({ target: "X:other0", op: "set_items", items: ["Product Strategy", "Roadmapping", "Growth"] }, FULL, ctx());
  assert.deepEqual(e.items, ["Product Strategy", "Roadmapping", "Growth"]);
  assert.equal(cleanEdit({ target: "X:other0", op: "set_items", items: ["Product Strategy", "Blockchain"] }, FULL, ctx()), null, "never brings in a new item");
  assert.equal(cleanEdit({ target: "X:other0", op: "set_items", items: ["Growth", "growth"] }, FULL, ctx()), null, "no repeats");
  const out = applyEdit(FULL, e);
  assert.deepEqual(finalResume(out).otherSections[0].items, ["Product Strategy", "Roadmapping", "Growth"]);
  assert.deepEqual(applyUndo(out, captureUndo(FULL, e)).otherSections[0].items, FULL.otherSections[0].items);
});

test("every extra section can be edited: replace, remove, add", () => {
  const targets = ["X:other0:1", "X:achievements:0", "X:publications:0", "X:languages:1", "X:interests:0", "X:projects:0:1", "X:volunteer:0:0"];
  for (const t of targets) {
    assert.notEqual(textAt(FULL, t), null, t);
    const rm = cleanEdit({ target: t, op: "remove" }, FULL, ctx());
    assert.deepEqual(rm, { target: t, op: "remove" }, t);
    assert.equal(textAt(applyEdit(FULL, rm), t), null, t);
  }
  const rep = cleanEdit({ target: "X:achievements:1", op: "replace", after: "Promoted within 14 months" }, FULL, ctx());
  assert.equal(applyEdit(FULL, rep).achievements[1], "Promoted within 14 months");
  const add = cleanEdit({ target: "X:projects:0", op: "add_item", after: "Reduced stockouts for perishables" }, FULL, ctx());
  assert.equal(add?.op, "add_item");
  assert.equal(applyEdit(FULL, add).projects[0].bullets.length, 3);
  assert.equal(cleanEdit({ target: "X:references:0", op: "remove" }, FULL, ctx()), null, "references are read only");
  assert.equal(cleanEdit({ target: "X:nothing:0", op: "remove" }, FULL, ctx()), null, "unknown section");
  assert.equal(cleanEdit({ target: "X:other9:0", op: "remove" }, FULL, ctx()), null, "unknown section");
});

test("a new item in an extra section can't invent claims", () => {
  const e = cleanEdit({ target: "X:other0", op: "add_item", after: "Kubernetes and Terraform" }, FULL, ctx(FULL, "We need Kubernetes and Terraform"));
  assert.ok(e.unsupported?.length);
});

test("removed items keep later ids stable until the resume is finalised", () => {
  const once = applyEdit(FULL, { target: "X:other0:0", op: "remove" });
  assert.equal(textAt(once, "X:other0:1"), "Roadmapping");
  assert.equal(finalResume(once).otherSections[0].items[0], "Roadmapping");
  assert.ok(lineOrder("X:other0:1") > lineOrder("Z"));
  assert.ok(lineOrder("X:projects:0:1") < lineOrder("X:other0:0"));
});

test("look-alike characters do not make a suggestion; non-Latin lines are told apart", () => {
  assert.equal(plainText("Built supply‑side systems for high‑scale"), plainText("Built supply-side systems for high-scale"));
  assert.equal(plainText("data‐driven  “growth”"), plainText('data-driven "growth"'));
  assert.notEqual(plainText("आशा राव प्रोडक्ट मैनेजर"), plainText("राहुल सिन्हा डेटा विश्लेषक"));
  const same = cleanEdit({ target: "E0B0", op: "replace", after: "Built supply-side systems for a high-scale marketplace" }, FULL, ctx());
  assert.equal(same, null);
});

test("education can be edited: the AI is told the candidate's MBA and it lands on the resume", () => {
  assert.match(resumeLines(FULL), /\[D0\] B\.Tech/);
  const chat = ctx(FULL, "MBA preferred", "MBA from IIM Ahmedabad");
  const add = cleanEdit({ target: "D", op: "add_education", entry: { degree: "MBA", school: "IIM Ahmedabad" } }, FULL, chat);
  assert.equal(add.op, "add_education");
  const out = applyEdit(FULL, add);
  assert.equal(out.education.length, 2);
  assert.equal(out.education[1].school, "IIM Ahmedabad");
  assert.equal(textAt(out, "D1"), "MBA · IIM Ahmedabad");
  assert.equal(applyUndo(out, captureUndo(FULL, add)).education.length, 1);
});

test("education is never invented: a degree or year the candidate didn't state is refused", () => {
  const none = ctx(FULL, "MBA preferred", "");
  assert.ok(cleanEdit({ target: "D", op: "add_education", entry: { degree: "MBA", school: "IIM Ahmedabad" } }, FULL, none).unsupported?.length);
  const noYear = ctx(FULL, "", "MBA from IIM Ahmedabad");
  assert.ok(cleanEdit({ target: "D", op: "add_education", entry: { degree: "MBA", school: "IIM Ahmedabad", year: "2021" } }, FULL, noYear).unsupported?.length);
  assert.equal(cleanEdit({ target: "D", op: "add_education", entry: { degree: "B.Tech", school: "Manipal" } }, FULL, ctx()), null, "already there");
  const upd = cleanEdit({ target: "D0", op: "update_education", entry: { year: "2017" } }, FULL, ctx(FULL, "", "I finished in 2017"));
  assert.equal(applyEdit(FULL, upd).education[0].year, "2017");
  assert.equal(cleanEdit({ target: "D0", op: "replace", after: "x" }, FULL, ctx()), null, "education takes only its own ops");
});

test("a whole extra section can be removed, shown and printed nowhere afterwards, and undone", () => {
  for (const key of ["other0", "achievements", "publications", "languages", "interests", "projects", "volunteer"]) {
    const e = cleanEdit({ target: `X:${key}`, op: "remove_section" }, FULL, ctx());
    assert.deepEqual(e, { target: `X:${key}`, op: "remove_section" }, key);
    const out = finalResume(applyEdit(FULL, e));
    assert.ok(!extraLines(out).some((s) => s.key === key || (key === "other0" && s.title === "Core Competencies")), `${key} is still on the resume`);
    assert.deepEqual(extraSections(applyUndo(applyEdit(FULL, e), captureUndo(FULL, e))), extraSections(FULL), `undo ${key}`);
  }
  assert.ok(!extraSections(finalResume(applyEdit(FULL, { target: "X:other0", op: "remove_section" }))).some((s) => s.title === "Core Competencies"));
  assert.equal(cleanEdit({ target: "X:references", op: "remove_section" }, FULL, ctx()), null, "references are read only");
  assert.equal(cleanEdit({ target: "X:other7", op: "remove_section" }, FULL, ctx()), null, "no such section");
  assert.equal(cleanEdit({ target: "X:projects", op: "add_item", after: "x" }, FULL, ctx()), null, "entry lists only take remove_section");
  assert.equal(cleanEdit({ target: "K", op: "remove_section" }, FULL, ctx()), null);
});

test("a reply that claims a change is recognised, so it can be blocked when no change was produced", () => {
  for (const r of ["Core competencies section removed as requested.", "I've trimmed your skills.", "Added the MBA.", "Done, I dropped the weakest bullets."]) assert.match(r, CLAIMS_A_CHANGE, r);
  for (const r of ["Which section do you mean?", "Your summary is 3 sentences.", "Sure, tell me the year."]) assert.doesNotMatch(r, CLAIMS_A_CHANGE, r);
});

// ---- Every section can take every action (the guard against "the AI/user can't do X to section Y") ----
import { sectionPlan, addableSections } from "../src/resumeSections.js";

const sameKeys = (r) => sectionPlan(finalResume(r)).map((s) => s.key);

test("every section can be moved, renamed and removed, and each can be undone", () => {
  const keys = sameKeys(FULL);
  assert.deepEqual(keys.slice(0, 5), ["summary", "experience", "education", "skills", "certifications"]);
  assert.ok(keys.includes("other0") && keys.includes("projects") && keys.includes("languages"));
  for (const key of keys) {
    const target = `SEC:${key}`;
    // move to the top, then to the bottom
    for (const to of [0, keys.length - 1]) {
      const mv = { target, op: "move_section", to };
      const out = applyEdit(FULL, mv);
      assert.equal(sameKeys(out).indexOf(key), to, `${key} -> ${to}`);
      assert.deepEqual(sameKeys(applyUndo(out, captureUndo(FULL, mv))), keys, `undo move ${key}`);
    }
    // rename
    const rn = { target, op: "rename_section", after: "Renamed" };
    assert.equal(sectionPlan(applyEdit(FULL, rn)).find((s) => s.key === key).title, "Renamed", `rename ${key}`);
    assert.deepEqual(sectionPlan(applyUndo(applyEdit(FULL, rn), captureUndo(FULL, rn))).map((s) => s.title), sectionPlan(FULL).map((s) => s.title), `undo rename ${key}`);
    // remove
    if (key === "references") continue; // read only
    const rm = { target, op: "remove_section" };
    const gone = applyEdit(FULL, rm);
    assert.ok(!sameKeys(gone).includes(key), `remove ${key}`);
    assert.deepEqual(sameKeys(applyUndo(gone, captureUndo(FULL, rm))), keys, `undo remove ${key}`);
  }
});

test("the AI is allowed to do the same section actions", () => {
  for (const key of sameKeys(FULL).filter((k) => k !== "references")) {
    assert.equal(cleanEdit({ target: `SEC:${key}`, op: "remove_section" }, FULL, ctx())?.op, "remove_section", `AI remove ${key}`);
    assert.equal(cleanEdit({ target: `SEC:${key}`, op: "rename_section", after: "Strengths" }, FULL, ctx())?.op, "rename_section", `AI rename ${key}`);
  }
  assert.equal(cleanEdit({ target: "SEC:skills", op: "move_section", to: 0 }, FULL, ctx())?.to, 0);
  assert.equal(cleanEdit({ target: "SEC:summary", op: "move_section", to: 0 }, FULL, ctx()), null, "already there");
  assert.equal(cleanEdit({ target: "SEC:nothing", op: "remove_section" }, FULL, ctx()), null);
  assert.equal(cleanEdit({ target: "SEC:references", op: "remove_section" }, FULL, ctx()), null);
});

test("every kind of line can be edited by the person: text, list, role, education, name", () => {
  const cases = [
    [{ target: "N", op: "replace", after: "Rahul K Sinha" }, (r) => r.name === "Rahul K Sinha"],
    [{ target: "T", op: "replace", after: "Product Lead" }, (r) => r.title === "Product Lead"],
    [{ target: "C", op: "replace", after: "x@y.com" }, (r) => r.contact === "x@y.com"],
    [{ target: "S", op: "replace", after: "New summary." }, (r) => r.summary === "New summary."],
    [{ target: "E0B0", op: "replace", after: "Rewrote it" }, (r) => r.experience[0].bullets[0] === "Rewrote it"],
    [{ target: "E0B1", op: "remove" }, (r) => finalResume(r).experience[0].bullets.length === 1],
    [{ target: "E0", op: "add_bullet", after: "New bullet" }, (r) => r.experience[0].bullets.at(-1) === "New bullet"],
    [{ target: "E0", op: "replace", after: "Director · Blinkit" }, (r) => r.experience[0].role === "Director" && r.experience[0].company === "Blinkit"],
    [{ target: "E0", op: "remove" }, (r) => finalResume(r).experience.length === 0],
    [{ target: "D0", op: "replace", after: "BE · Manipal · 2017" }, (r) => r.education[0].degree === "BE" && r.education[0].year === "2017"],
    [{ target: "D0", op: "remove" }, (r) => finalResume(r).education.length === 0],
    [{ target: "D", op: "add_education", entry: { degree: "MBA", school: "IIM" } }, (r) => r.education.length === 2],
    [{ target: "K", op: "replace", after: "SQL · Python, Excel" }, (r) => r.skills.join() === "SQL,Python,Excel"],
    [{ target: "Z", op: "replace", after: "PMP · CSM" }, (r) => r.certifications.join() === "PMP,CSM"],
    [{ target: "Z", op: "set_certifications", items: [] }, (r) => r.certifications.length === 0],
    [{ target: "X:achievements:0", op: "replace", after: "Top performer" }, (r) => r.achievements[0] === "Top performer"],
    [{ target: "X:achievements:0", op: "remove" }, (r) => finalResume(r).achievements.length === 1],
    [{ target: "X:achievements", op: "add_item", after: "New one" }, (r) => r.achievements.at(-1) === "New one"],
    [{ target: "X:projects:0:0", op: "replace", after: "Changed" }, (r) => r.projects[0].bullets[0] === "Changed"],
    [{ target: "X:other0:0", op: "replace", after: "Strategy" }, (r) => r.otherSections[0].items[0] === "Strategy"],
  ];
  for (const [edit, ok] of cases) {
    const out = applyEdit(FULL, edit);
    assert.ok(ok(out), `${edit.target} ${edit.op}`);
    const back = applyUndo(out, captureUndo(FULL, edit));
    assert.equal(JSON.stringify(finalResume(back)), JSON.stringify(finalResume(FULL)), `undo ${edit.target} ${edit.op}`);
  }
});

test("adding a section: standard sections that are missing can be added, and a custom one", () => {
  const bare = { name: "A", summary: "x", experience: [{ role: "PM", company: "Co", bullets: ["did it"] }], skills: ["SQL"] };
  const offered = addableSections(bare).map(([k]) => k);
  assert.ok(["projects", "achievements", "languages", "publications"].every((k) => offered.includes(k)));
  const withLang = applyEdit(bare, { target: "X:languages", op: "add_item", after: "English" });
  assert.deepEqual(extraLines(withLang).map((s) => s.key), ["languages"]);
  assert.ok(!addableSections(withLang).some(([k]) => k === "languages"));
  const withProject = applyEdit(bare, { target: "X:projects", op: "add_entry", after: "Demand model" });
  assert.equal(withProject.projects[0].name, "Demand model");
  const custom = applyEdit(bare, { op: "add_custom_section", title: "Strengths", after: "Roadmapping" });
  assert.equal(extraLines(custom)[0].title, "Strengths");
  assert.equal(JSON.stringify(applyUndo(custom, captureUndo(bare, { op: "add_custom_section", title: "Strengths", after: "Roadmapping" }))), JSON.stringify(bare));
});

test("a removed role or education entry is never shown to the AI, and its ids stay stable", () => {
  const two = { ...FULL, experience: [...FULL.experience, { role: "Dev", company: "Zed", period: "2020", bullets: ["Shipped it"] }] };
  const out = applyEdit(two, { target: "E0", op: "remove" });
  assert.doesNotMatch(resumeLines(out), /Blinkit/);
  assert.match(resumeLines(out), /\[E1B0\] Shipped it/);
  assert.equal(textAt(out, "E1B0"), "Shipped it");
  assert.equal(textAt(out, "E0B0"), null);
  assert.doesNotMatch(resumeLines(applyEdit(FULL, { target: "D0", op: "remove" })), /Manipal/);
});

test("a whole project or volunteering entry can be removed or renamed by the person, with undo", () => {
  const rm = { target: "X:projects:0", op: "remove" };
  const out = applyEdit(FULL, rm);
  assert.ok(!extraLines(finalResume(out)).some((s) => s.key === "projects"));
  assert.equal(textAt(out, "X:projects:0"), null);
  assert.equal(JSON.stringify(finalResume(applyUndo(out, captureUndo(FULL, rm)))), JSON.stringify(finalResume(FULL)));
  const rn = { target: "X:projects:0", op: "replace", after: "Demand forecasting model" };
  assert.equal(extraLines(applyEdit(FULL, rn)).find((s) => s.key === "projects").items[0].heading, "Demand forecasting model");
  const vol = applyEdit(FULL, { target: "X:volunteer:0", op: "replace", after: "Lead mentor · ADPList" });
  assert.equal(extraLines(vol).find((s) => s.key === "volunteer").items[0].heading, "Lead mentor · ADPList");
});

test("the grade and detail lines under a degree can be edited, removed and added, with undo", () => {
  const R = { ...FULL, education: [{ degree: "B. Tech", school: "Manipal", year: "", grade: "9.92/10 (final semester)", location: "", details: ["Engineering 2012 to 2016"] }] };
  assert.equal(textAt(R, "D0:meta"), "9.92/10 (final semester)");
  assert.equal(textAt(R, "D0:d0"), "Engineering 2012 to 2016");
  const cases = [
    [{ target: "D0:meta", op: "replace", after: "9.9/10 · Manipal" }, (r) => r.education[0].grade === "9.9/10" && r.education[0].location === "Manipal"],
    [{ target: "D0:meta", op: "remove" }, (r) => !r.education[0].grade && !textAt(r, "D0:meta")],
    [{ target: "D0:d0", op: "replace", after: "Mechanical, 2012 to 2016" }, (r) => r.education[0].details[0] === "Mechanical, 2012 to 2016"],
    [{ target: "D0:d0", op: "remove" }, (r) => finalResume(r).education[0].details.length === 0],
    [{ target: "D0", op: "add_detail", after: "Dean's list" }, (r) => r.education[0].details.at(-1) === "Dean's list"],
  ];
  for (const [edit, ok] of cases) {
    const out = applyEdit(R, edit);
    assert.ok(ok(out), `${edit.target} ${edit.op}`);
    assert.equal(JSON.stringify(applyUndo(out, captureUndo(R, edit))), JSON.stringify(R), `undo ${edit.target} ${edit.op}`);
  }
  assert.doesNotMatch(expectedTexts(applyEdit(R, { target: "D0:d0", op: "remove" })).join("|"), /Engineering 2012/);
});
