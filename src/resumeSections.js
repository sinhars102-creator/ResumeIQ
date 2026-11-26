/**
 * Module M10 – every part of the resume, in one place.
 *
 * The resume reader extracts more than the headline sections: projects, volunteering, achievements, publications,
 * languages, interests, references and any other section the file had. The screen, the PDF and the content check
 * all read them through this file, so none of them can forget one.
 *
 *   extraSections(resume) -> [{ key, title, kind, items }]   sections beyond summary/experience/education/skills/certifications
 *       kind "entries": items = [{ heading, meta, bullets }]   (projects, volunteering)
 *       kind "bullets": items = [string]                       (achievements, publications, other sections)
 *       kind "inline":  items = [string]                       (languages, interests)
 *   educationLine(entry) / educationDetails(entry)             the education text, with grade and location
 *   expectedTexts(resume) -> [string]                          every piece of text the finished PDF must contain
 */

const clean = (v) => String(v ?? "").trim();
const list = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
const join = (parts, sep = " · ") => parts.map(clean).filter(Boolean).join(sep);

export const EXTRA_SECTION_KEYS = ["projects", "volunteer", "achievements", "publications", "languages", "interests", "references", "otherSections"];

/**
 * Every extra section with an id on every editable line. This is the single source: extraSections() (screen, PDF, content
 * check) and the AI's view of the resume (server/tailorChat.js resumeLines) both read it, so a section that is
 * on the page is always visible to the AI and can be edited.
 *
 * Ids: "X:<key>:<i>" an item of a list section · "X:<key>:<i>:<j>" a bullet of a project/volunteering entry.
 * Indexes are positions in the stored arrays (removed items stay as null), so ids keep pointing at the same line.
 * References are shown but not editable (no ids).
 */
export const STRING_SECTIONS = ["achievements", "publications", "languages", "interests"];
export const ENTRY_SECTIONS = ["projects", "volunteer"];
const strItems = (arr, key) => (Array.isArray(arr) ? arr : []).map((v, i) => ({ id: `X:${key}:${i}`, text: clean(v) })).filter((x) => x.text);

export function extraLines(resume) {
  const r = resume || {};
  const out = [];
  const titled = (key, fallback) => clean(r.sectionTitles?.[key]) || fallback;
  const entries = (key, title, head) => {
    const items = (Array.isArray(r[key]) ? r[key] : [])
      .map((e, i) => (e && e.removed ? { id: "", heading: "", meta: "", bullets: [] } : e))
      .map((e, i) => ({ id: `X:${key}:${i}`, heading: head(e), meta: clean(e?.period), bullets: strItems(e?.bullets, `${key}:${i}`) }))
      .filter((e) => e.heading || e.bullets.length);
    if (items.length) out.push({ key, title: titled(key, title), kind: "entries", items });
  };
  entries("projects", "Projects", (p) => clean(p?.name));
  entries("volunteer", "Volunteering", (v) => join([v?.role, v?.organization]));
  const strings = (key, title, kind) => {
    const items = strItems(r[key], key);
    if (items.length) out.push({ key, title: titled(key, title), kind, items });
  };
  strings("achievements", "Achievements", "bullets");
  strings("publications", "Publications", "bullets");
  strings("languages", "Languages", "inline");
  strings("interests", "Interests", "inline");
  const refs = (Array.isArray(r.references) ? r.references : []).map((x) => join([x?.name, x?.title], ", ")).filter(Boolean);
  if (refs.length) out.push({ key: "references", title: titled("references", "References"), kind: "bullets", readOnly: true, items: refs.map((text) => ({ id: null, text })) });
  (Array.isArray(r.otherSections) ? r.otherSections : []).forEach((sec, i) => {
    const items = strItems(sec?.items, `other${i}`);
    if (clean(sec?.title) || items.length) out.push({ key: `other${i}`, title: titled(`other${i}`, clean(sec?.title) || "Additional"), kind: "bullets", items });
  });
  return out;
}

/** The same sections in the plain shape the PDF and the content check use (texts only). */
export function extraSections(resume) {
  return extraLines(resume).map((s) => ({
    key: s.key,
    title: s.title,
    kind: s.kind,
    items: s.kind === "entries" ? s.items.map((e) => ({ heading: e.heading, meta: e.meta, bullets: e.bullets.map((b) => b.text) })) : s.items.map((x) => x.text),
  }));
}

/**
 * The order of sections on the page, top to bottom, for the screen, the PDF and the AI. Each entry is
 * { key, title, core, readOnly }. Core keys: summary, experience, education, skills, certifications; the rest come from
 * extraLines. The person's own order (resume.sectionOrder) wins; sections not in it follow in the default order.
 * Titles can be renamed (resume.sectionTitles). `include` forces sections to show even when empty (a card is pinned there).
 */
export const CORE_SECTIONS = [
  ["summary", "Summary"],
  ["experience", "Experience"],
  ["education", "Education"],
  ["skills", "Skills"],
  ["certifications", "Certifications"],
];
export const STANDARD_ADDABLE = [
  ["projects", "Projects"],
  ["volunteer", "Volunteering"],
  ["achievements", "Achievements"],
  ["publications", "Publications"],
  ["languages", "Languages"],
  ["interests", "Interests"],
];
const alive = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && !x.removed);
const coreHas = {
  summary: (r) => !!clean(r.summary),
  experience: (r) => alive(r.experience).length > 0,
  education: (r) => alive(r.education).length > 0,
  skills: (r) => list(r.skills).length > 0,
  certifications: (r) => list(r.certifications).length > 0,
};
export function sectionPlan(resume, { include = [] } = {}) {
  const r = resume || {};
  const base = [
    ...CORE_SECTIONS.filter(([key]) => coreHas[key](r) || include.includes(key)).map(([key, title]) => ({ key, title: clean(r.sectionTitles?.[key]) || title, core: true })),
    ...extraLines(r).map((s) => ({ key: s.key, title: s.title, core: false, readOnly: !!s.readOnly })),
  ];
  const order = Array.isArray(r.sectionOrder) ? r.sectionOrder : [];
  const rank = (k) => (order.indexOf(k) < 0 ? 1e6 : order.indexOf(k));
  return base.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.key) - rank(b.x.key) || a.i - b.i).map(({ x }) => x);
}
/** Standard sections the resume doesn't have yet (what "Add section" offers). */
export function addableSections(resume) {
  const have = new Set(sectionPlan(resume).map((s) => s.key));
  return STANDARD_ADDABLE.filter(([key]) => !have.has(key));
}

/**
 * Splits a typed line such as "MBA · IIM Ahmedabad · 2023" into its parts. Accepts the separators people really type:
 * a middle dot, a bullet, a bar, or a spaced full stop / hyphen / dash ("MBA . IIM Ahmedabad", "MBA - IIM"). A full stop or
 * hyphen inside a word ("B.Tech", "Ph.D.", "Hewlett-Packard") is never a separator because only spaced ones count.
 */
export const splitLine = (text) =>
  String(text ?? "")
    .split(/\s*[·•|]\s*|\s+[.\-–—]\s+/)
    .map((x) => x.trim());

/** "B.Tech · Manipal Institute of Technology · 2016" */
const dotted = (v) => clean(v).replace(/\s+\.\s+/g, " · ");
export const educationLine = (e) => (e?.removed ? "" : join([dotted(e?.degree), dotted(e?.school), e?.year]));
/** "Product Manager · Acme" (the role heading as one editable line, period kept apart). */
export const roleLine = (e) => (e?.removed ? "" : join([dotted(e?.role), dotted(e?.company)]));
/** Grade, place and any detail lines under an education entry. */
export const educationDetails = (e) => [join([e?.grade, e?.location]), ...list(e?.details)].filter(Boolean);

/** Every piece of resume text a downloaded PDF must contain (used by the content check). */
export function expectedTexts(resume) {
  const r = resume || {};
  const t = [];
  const add = (v) => clean(v) && t.push(clean(v));
  add(r.name);
  add(r.title);
  add(r.contact);
  add(r.summary);
  (r.experience || []).forEach((e) => {
    add(e.role);
    add(e.company);
    (e.bullets || []).forEach((b) => b != null && add(b));
  });
  (r.education || []).forEach((e) => {
    add(e.degree);
    add(e.school);
    educationDetails(e).forEach(add);
  });
  list(r.skills).forEach(add);
  list(r.certifications).forEach(add);
  extraSections(r).forEach((s) => {
    s.items.forEach((it) => {
      if (typeof it === "string") add(it);
      else {
        add(it.heading);
        it.bullets.forEach(add);
      }
    });
  });
  return t;
}
