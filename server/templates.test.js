import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildResumePdf, DEFAULT_PDF_FORMAT } from "../src/resumePdf.js";
import { TEMPLATES, templateFormat, templateById, designFormat, normalizeDesign, DEFAULT_DESIGN, isDefaultDesign } from "../src/resumeTemplates.js";
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

test("text the PDF fonts cannot draw (Hindi) is reported missing, never silently passed", () => {
  const hindi = { name: "आशा राव", title: "Product Manager", contact: "asha@example.com", summary: "Five years in logistics.", experience: [], skills: ["SQL"], education: [], certifications: [] };
  const check = checkPreserved(hindi, "Product Manager asha@example.com Five years in logistics. SQL");
  assert.equal(check.ok, false);
  assert.ok(check.missing.some((m) => m.includes("आशा")));
  const latin = { ...hindi, name: "Asha Rao" };
  assert.equal(checkPreserved(latin, "Asha Rao Product Manager asha@example.com Five years in logistics. SQL").ok, true);
});

test("the person's section order, renamed headings and removed sections carry into the PDF", async () => {
  const base = { ...RICH, summary: "Product manager with eight years in logistics.", skills: ["SQL", "Roadmapping"] };
  const fmt = templateFormat("modern");
  const find = (text, w) => text.toUpperCase().indexOf(w);
  const normal = (await pdfTextFor(base, fmt)).text;
  assert.ok(find(normal, "SUMMARY") < find(normal, "EXPERIENCE"));
  const moved = (await pdfTextFor({ ...base, sectionOrder: ["skills", "summary", "experience", "education"] }, fmt)).text;
  assert.ok(find(moved, "SKILLS") < find(moved, "SUMMARY"), "skills printed first");
  assert.ok(find(moved, "SUMMARY") < find(moved, "EXPERIENCE"));
  const renamed = (await pdfTextFor({ ...base, sectionTitles: { experience: "Work history" } }, fmt)).text;
  assert.ok(find(renamed, "WORK HISTORY") >= 0 && find(renamed, "EXPERIENCE") < 0);
  const noSummary = (await pdfTextFor({ ...base, summary: "" }, fmt)).text;
  assert.equal(find(noSummary, "SUMMARY"), -1, "a removed section leaves no empty heading");
});

test("every template keeps all its text on the page, even when a sidebar can't hold its sections", async () => {
  const heavy = {
    ...RICH,
    skills: Array.from({ length: 90 }, (_, i) => `Skill number ${i + 1} with a longer name`),
    certifications: Array.from({ length: 25 }, (_, i) => `Certification ${i + 1} from a long-named institute (2020)`),
    languages: ["English", "Hindi", "Kannada"],
    interests: ["Chess", "Running"],
  };
  for (const t of TEMPLATES) {
    const doc = buildResumePdf(finalResume(heavy), null, templateFormat(t.id));
    const data = doc.output("arraybuffer");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      for (const it of content.items) {
        if (!it.str.trim()) continue;
        assert.ok(it.transform[4] >= 0 && it.transform[4] + it.width <= 595.5, `${t.id} p${n}: "${it.str.slice(0, 30)}" runs off the page (x=${Math.round(it.transform[4])}, w=${Math.round(it.width)})`);
      }
    }
    const text = await extractPdfText(data.slice(0), pdfjs);
    const check = checkPreserved(finalResume(heavy), text);
    assert.equal(check.ok, true, `${t.id}: missing ${check.missing.slice(0, 3).join("; ")}`);
  }
});

test("there is at least one template of each layout type, and every template says which type it is", () => {
  const types = new Set(TEMPLATES.map((t) => t.type));
  for (const need of ["single", "left", "right", "grid"]) assert.ok(types.has(need), `no ${need} template`);
  assert.ok(TEMPLATES.every((t) => ["single", "left", "right", "grid"].includes(t.type)));
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

// ---- Layout integrity on realistic, awkward resumes: long role lines, long names, a URL with no spaces ----
const AWKWARD = {
  name: "Dr. Venkata Subramanyam Ramachandran Narayanaswamy Iyer",
  title: "Lead Product Manager | AI-Led Omni-channel Marketplace Products | First-Principles Problem Solving | Experimentation & Data-Driven Growth | Platform Strategy",
  contact: "sinha.rs102@gmail.com · +91-9886977808 · Bangalore, Karnataka · https://www.linkedin.com/in/rahul-sinha-product-manager-bangalore-marketplace-growth-0123456789abcdef",
  summary: "Customer-first product leader with 9+ years of experience building and scaling 0→1 and growth-stage marketplace products across B2C and B2B commerce, with deep experience in seller ranking, pricing optimization, inventory matching, and buy-box logic.",
  experience: [
    { role: "Lead Product Manager - AI-Led Omni-channel Marketplace Optimization and Seller Experience", company: "TATA Digital - BigBasket | TATA CliQ | Tata Neu Super App Group", period: "Aug 2021 to Sept 2022", bullets: ["Led AI-driven marketplace optimization, owning buy-box logic, seller ranking, and fulfillment reliability systems across three regions with engineering, design, and operations teams", "Reduced cancellations (35%) by redesigning buy-box algorithm (price vs reliability trade-off) using multi-factor scoring -> Improved repeat purchases by 32%"] },
    { role: "Manager - Supply Chain Products", company: "Blinkit (formerly Grofers)", period: "Dec 2015 to Dec 2018", bullets: ["Built supply-side systems for a high-scale grocery marketplace", "Improved availability (60% -> 89%)"] },
  ],
  education: [
    { degree: "Masters In Business Administration (Full Time Programme in General Management)", school: "Indian Institute of Management Ahmedabad", year: "2023", grade: "CGPA 3.4/4.0 (top quartile of the batch)", details: ["General Management, Strategy and Operations; Dean's list in two terms"] },
    { degree: "B. Tech", school: "Manipal Institute of Technology", year: "2016" },
  ],
  skills: ["Product Strategy & Roadmapping", "Scalable System Design & Decisioning", "0→1 Product Development & PMF", "ML Recommendation Systems", "Predictive Modeling & Forecasting"],
  certifications: ["Certified Scrum Product Owner (CSPO) from the Scrum Alliance, 2022", "Google Analytics"],
  languages: ["English", "Hindi", "Kannada"], interests: ["Chess", "Running"],
  projects: [{ name: "Demand forecasting and replenishment platform for perishables at national scale", period: "2021 to 2022", bullets: ["Forecast demand for perishables across 400 dark stores"] }],
  volunteer: [{ role: "Product mentor", organization: "ADPList (a global mentorship platform for designers and PMs)", period: "2020 to Present", bullets: ["Mentored 40 product managers"] }],
  achievements: ["Top performer, 2019 and 2021, out of a product organisation of more than two hundred people"],
  otherSections: [{ title: "Core Competencies", items: ["Product & System Leadership – Expert", "Data & AI Systems – Expert"] }],
};

async function layoutProblems(resume, id, design = DEFAULT_DESIGN) {
  const doc = buildResumePdf(finalResume(resume), null, designFormat(id, design));
  const data = doc.output("arraybuffer");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const problems = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter((i) => i.str.trim());
    const boxes = items.map((i) => ({ s: i.str, x: i.transform[4], x2: i.transform[4] + i.width, y: i.transform[5], h: Math.max(i.height, 6) }));
    for (const b of boxes) if (b.x < 0 || b.x2 > 595.5) problems.push(`${id} ${JSON.stringify(design)} p${n}: "${b.s.slice(0, 40)}" runs off the page`);
    for (let a = 0; a < boxes.length; a++) {
      for (let c = a + 1; c < boxes.length; c++) {
        const A = boxes[a], B = boxes[c];
        const ox = Math.min(A.x2, B.x2) - Math.max(A.x, B.x);
        const oy = Math.min(A.y + A.h * 0.8, B.y + B.h * 0.8) - Math.max(A.y - A.h * 0.2, B.y - B.h * 0.2);
        if (ox > 1 && oy > Math.min(A.h, B.h) * 0.5) problems.push(`${id} ${JSON.stringify(design)} p${n}: "${A.s.slice(0, 30)}" overlaps "${B.s.slice(0, 30)}"`);
      }
    }
  }
  const check = checkPreserved(finalResume(resume), await extractPdfText(data.slice(0), pdfjs));
  if (!check.ok) problems.push(`${id} ${JSON.stringify(design)}: missing from the PDF: ${check.missing.slice(0, 3).join("; ")}`);
  return problems;
}

test("every template lays out an awkward real-world resume without cutting, overflowing or overlapping anything", async () => {
  const all = [];
  for (const t of TEMPLATES) all.push(...(await layoutProblems(AWKWARD, t.id)));
  assert.deepEqual(all, []);
});

test("the person's own order, removed sections and long edits still lay out cleanly in every template", async () => {
  const edited = { ...AWKWARD, sectionOrder: ["skills", "education", "summary", "experience"], sectionTitles: { experience: "Professional experience and leadership roles" }, summary: "" };
  const all = [];
  for (const t of TEMPLATES) all.push(...(await layoutProblems(edited, t.id)));
  assert.deepEqual(all, []);
});

const DESIGNS = [
  { font: "courier", size: 1.16, spacing: 1.12, margins: 4, accent: "#7a3e9d", underline: true },
  { font: "times", size: 0.92, spacing: 0.9, margins: -3, accent: "#b4326e", underline: false },
  { font: "helvetica", size: 1.16, spacing: 0.9, margins: 4 },
];

test("every template fits every design the person can choose, on an awkward resume", async () => {
  const all = [];
  for (const t of TEMPLATES) for (const d of DESIGNS) all.push(...(await layoutProblems(AWKWARD, t.id, d)));
  assert.deepEqual(all, []);
});

test("the design changes the look and nothing else: font, size, spacing, margins, colour, rules", () => {
  assert.ok(isDefaultDesign(DEFAULT_DESIGN));
  const own = designFormat("sidebar", DEFAULT_DESIGN);
  assert.deepEqual(own, templateFormat("sidebar"), "no design = the template as designed");
  const f = designFormat("sidebar", { font: "times", size: 1.16, spacing: 1.12, margins: 4, accent: "#B4326E", underline: false });
  assert.equal(f.fontBody, "times");
  assert.equal(f.fontHeader, "times");
  assert.ok(f.fontSizeBody > own.fontSizeBody && f.lineH > own.lineH && f.marginMm === own.marginMm + 4);
  assert.equal(f.accentColor, "#b4326e");
  assert.equal(f.headingUnderline, false);
  assert.equal(f.sidebarBg, own.sidebarBg, "a coloured sidebar keeps its own colour");
  assert.equal(designFormat("executive", { accent: "#111111" }).topRule.color, "#111111");
  assert.equal(designFormat("accent-bar", { accent: "#111111" }).leftBar.color, "#111111");
  // anything unexpected falls back to the template's own value
  assert.deepEqual(normalizeDesign({ font: "comic-sans", size: 9, spacing: "x", margins: 99, accent: "red", underline: "yes" }), DEFAULT_DESIGN);
  assert.ok(designFormat("modern", { margins: -3 }).marginMm >= 8);
});
