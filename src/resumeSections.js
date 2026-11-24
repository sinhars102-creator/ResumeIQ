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

export function extraSections(resume) {
  const r = resume || {};
  const out = [];
  const projects = (Array.isArray(r.projects) ? r.projects : [])
    .map((p) => ({ heading: clean(p?.name), meta: clean(p?.period), bullets: list(p?.bullets) }))
    .filter((p) => p.heading || p.bullets.length);
  if (projects.length) out.push({ key: "projects", title: "Projects", kind: "entries", items: projects });
  const volunteer = (Array.isArray(r.volunteer) ? r.volunteer : [])
    .map((v) => ({ heading: join([v?.role, v?.organization]), meta: clean(v?.period), bullets: list(v?.bullets) }))
    .filter((v) => v.heading || v.bullets.length);
  if (volunteer.length) out.push({ key: "volunteer", title: "Volunteering", kind: "entries", items: volunteer });
  if (list(r.achievements).length) out.push({ key: "achievements", title: "Achievements", kind: "bullets", items: list(r.achievements) });
  if (list(r.publications).length) out.push({ key: "publications", title: "Publications", kind: "bullets", items: list(r.publications) });
  if (list(r.languages).length) out.push({ key: "languages", title: "Languages", kind: "inline", items: list(r.languages) });
  if (list(r.interests).length) out.push({ key: "interests", title: "Interests", kind: "inline", items: list(r.interests) });
  const refs = (Array.isArray(r.references) ? r.references : []).map((x) => join([x?.name, x?.title], ", ")).filter(Boolean);
  if (refs.length) out.push({ key: "references", title: "References", kind: "bullets", items: refs });
  (Array.isArray(r.otherSections) ? r.otherSections : []).forEach((s, i) => {
    const items = list(s?.items);
    if (clean(s?.title) || items.length) out.push({ key: `other${i}`, title: clean(s?.title) || "Additional", kind: "bullets", items });
  });
  return out;
}

/** "B.Tech · Manipal Institute of Technology · 2016" */
export const educationLine = (e) => join([e?.degree, e?.school, e?.year]);
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
