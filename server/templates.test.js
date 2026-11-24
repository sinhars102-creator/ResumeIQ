import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildResumePdf, DEFAULT_PDF_FORMAT } from "../src/resumePdf.js";
import { TEMPLATES, templateFormat, templateById } from "../src/resumeTemplates.js";
import { extraSections, expectedTexts } from "../src/resumeSections.js";
import { checkPreserved, extractPdfText } from "../src/preservation.js";
import { finalResume } from "../src/tailorEdits.js";

const RICH = {
  name: "Asha Rao",
  title: "Senior Product Manager",
  contact: "asha.rao@example.com · +91 98765 43210 · linkedin.com/in/asharao · Bengaluru",
  summary: "Product manager with eight years in logistics technology, focused on forecasting and delivery planning.",
  experience: [
    { role: "Senior PM", company: "Acme Pay", period: "2020 - 2024", bullets: Array.from({ length: 30 }, (_, i) => `Delivered milestone ${i + 1} for the routing platform with measurable gains in cost, speed and reliability`) },
    { role: "PM", company: "Kirana Cloud", period: "2016 - 2020", bullets: ["Grew monthly active users by 40% across three regions", "Cut payment failures from 8% to 3% working with risk teams"] },
  ],
  education: [{ degree: "MBA", school: "IIM Bangalore", year: "2016", grade: "CGPA 8.4", location: "Bengaluru", details: ["Dean's list", "Finance club president"] }],
  skills: ["SQL", "Roadmapping", "Experimentation", "Tableau"],
  certifications: ["Certified Scrum Product Owner", "AWS Cloud Practitioner"],
  projects: [{ name: "Demand forecaster", period: "2022", bullets: ["Built a forecasting tool used by 12 regional teams", "Reduced stockouts by 15 points"] }],
  volunteer: [{ organization: "Code for Good", role: "Mentor", period: "2021 - 2023", bullets: ["Mentored 20 students in analytics"] }],
  achievements: ["Product of the Year 2023", "Top 1% performer, Acme Pay"],
  publications: ["Routing at scale, Journal of Logistics Tech, 2022"],
  languages: ["English", "Hindi", "Kannada"],
  interests: ["Trail running", "Chess"],
  references: [{ name: "R. Sharma", title: "VP Product, Acme Pay" }],
  otherSections: [{ title: "Positions of Responsibility", items: ["Class representative, MBA 2016", "Convenor, Logistics Summit 2015"] }],
};

async function pdfTextFor(resume, format) {
  const doc = buildResumePdf(finalResume(resume), null, format);
  return { text: await extractPdfText(doc.output("arraybuffer"), pdfjs), pages: doc.getNumberOfPages() };
}

test("extraSections finds every extra part of a resume, and nothing for an empty one", () => {
  const keys = extraSections(RICH).map((s) => s.key);
  assert.deepEqual(keys, ["projects", "volunteer", "achievements", "publications", "languages", "interests", "references", "other0"]);
  assert.deepEqual(extraSections({ name: "A" }), []);
  assert.ok(expectedTexts(RICH).length > 50);
});

for (const t of TEMPLATES) {
  test(`template ${t.id}: every part of a rich, long resume is in the PDF, and it runs to more pages instead of cutting`, async () => {
    const { text, pages } = await pdfTextFor(RICH, templateFormat(t.id));
    const check = checkPreserved(RICH, text);
    assert.deepEqual(check.missing, []);
    assert.equal(check.ok, true);
    assert.ok(pages >= 2, `${t.id} should need more than one page for 32 bullets, got ${pages}`);
  });
}

test("the old PDF format silently left content out; the content check catches that", async () => {
  const { text } = await pdfTextFor(RICH, { ...DEFAULT_PDF_FORMAT });
  const check = checkPreserved(RICH, text);
  assert.equal(check.ok, false);
  assert.ok(check.missing.some((m) => /Demand forecaster|Product of the Year|Hindi/.test(m)));
  assert.ok(check.missing.some((m) => /milestone 5 /.test(m)), "default format keeps only 3 bullets per role");
});

test("a bullet limit is caught too", async () => {
  const { text } = await pdfTextFor(RICH, { ...templateFormat("modern"), maxBullets: 5 });
  assert.equal(checkPreserved(RICH, text).ok, false);
});

test("a removed bullet (null) is neither printed nor expected", async () => {
  const r = JSON.parse(JSON.stringify(RICH));
  r.experience[1].bullets[0] = null;
  const { text } = await pdfTextFor(r, templateFormat("classic"));
  assert.ok(!/Grew monthly active users/.test(text));
  assert.equal(checkPreserved(finalResume(r), text).ok, true);
});

test("templates change the look, not the content: different layouts, same text", async () => {
  const modern = await pdfTextFor(RICH, templateFormat("modern"));
  const compact = await pdfTextFor(RICH, templateFormat("compact"));
  assert.ok(compact.pages <= modern.pages);
  assert.equal(checkPreserved(RICH, modern.text).ok && checkPreserved(RICH, compact.text).ok, true);
  assert.equal(templateById("nope").id, "modern");
});

test("a simple one-page resume still works with a centred header", async () => {
  const simple = { name: "Ravi K", title: "Analyst", contact: "ravi@example.com", summary: "Analyst.", experience: [{ role: "Analyst", company: "Foo", period: "2022", bullets: ["Built dashboards"] }], skills: ["Excel"], education: [] };
  const { text, pages } = await pdfTextFor(simple, templateFormat("classic"));
  assert.equal(pages, 1);
  assert.equal(checkPreserved(simple, text).ok, true);
});

test("rupee signs and special dashes don't trip the content check", async () => {
  const r = { name: "A", title: "T", contact: "a@b.com", summary: "Saved ₹5 Cr – a record", experience: [{ role: "R", company: "C", period: "2020", bullets: ["Reduced cost by ₹2 lakh → faster"] }], skills: [], education: [] };
  const { text } = await pdfTextFor(r, templateFormat("modern"));
  assert.equal(checkPreserved(r, text).ok, true);
});
