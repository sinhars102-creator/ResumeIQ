/**
 * Module M10 – resume templates.
 *
 * A template is only a look: fonts, sizes, spacing, colours and header style. It never rewrites or drops content;
 * the approved resume goes in unchanged and is laid out across as many pages as it needs. All of them use real text
 * (no images of text, no tables). Types: "single" column (the safest for applicant tracking systems), two-column with a
 * sidebar on the "left" or the "right", and a "grid" with the section headings in a side column. These cover the layout
 * types of the open-source Reactive Resume gallery; the designs are our own.
 *
 *   templateFormat(id)  the PDF format (see src/resumePdf.js) for a template, with every section printed
 */
import { DEFAULT_PDF_FORMAT } from "./resumePdf.js";

export const TEMPLATES = [
  {
    id: "modern",
    type: "single",
    name: "Modern",
    blurb: "Clean sans-serif with a green accent",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 10, fontSizeBullet: 9.5, marginMm: 15, lineH: 4.6, lineHSmall: 4.1, sectionGap: 5.5, accentColor: "#3F7D6E", dividerColor: "#3F7D6E", headerAlign: "left", headingUnderline: false, showDivider: true, fontColor: "#1b1f23" },
  },
  {
    id: "classic",
    type: "single",
    name: "Classic",
    blurb: "Traditional serif, centred header",
    format: { fontHeader: "times", fontBody: "times", fontBullet: "times", fontSizeName: 19, fontSizeTitle: 11, fontSizeContact: 10, fontSizeLabel: 10.5, fontSizeBody: 11, fontSizeBullet: 10.5, marginMm: 17, lineH: 4.8, lineHSmall: 4.4, sectionGap: 5, accentColor: "#000000", dividerColor: "#444444", headerAlign: "center", headingUnderline: true, showDivider: false, fontColor: "#111111" },
  },
  {
    id: "compact",
    type: "single",
    name: "Compact",
    blurb: "Tighter spacing to fit more on a page",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", fontSizeName: 16, fontSizeTitle: 9.5, fontSizeContact: 8.5, fontSizeLabel: 8.5, fontSizeBody: 9.5, fontSizeBullet: 9, marginMm: 11, lineH: 3.9, lineHSmall: 3.6, sectionGap: 3.5, accentColor: "#333333", dividerColor: "#999999", headerAlign: "left", headingUnderline: true, showDivider: false, fontColor: "#000000" },
  },
  {
    id: "executive",
    type: "single",
    name: "Executive",
    blurb: "Navy rule across every page, uppercase headings",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 21, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 10, fontSizeBullet: 9.5, marginMm: 16, lineH: 4.7, lineHSmall: 4.2, sectionGap: 5.5, accentColor: "#1F3A5F", dividerColor: "#C9D1DC", headingUnderline: true, topRule: { color: "#1F3A5F", h: 3 }, periodInline: true },
  },
  {
    id: "accent-bar",
    type: "single",
    name: "Accent bar",
    blurb: "Compact, with a coloured bar down the left edge",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 18, fontSizeTitle: 10, fontSizeContact: 9, fontSizeLabel: 9, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 17, lineH: 4.3, lineHSmall: 3.9, sectionGap: 4.5, accentColor: "#B4326E", dividerColor: "#E3C3D2", headingUnderline: false, leftBar: { color: "#B4326E", w: 1.6, x: 8 }, periodInline: true },
  },
  {
    id: "minimal",
    type: "single",
    name: "Minimal",
    blurb: "Lots of white space, quiet grey headings",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 24, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 8.5, fontSizeBody: 10, fontSizeBullet: 9.5, marginMm: 21, lineH: 5.1, lineHSmall: 4.5, sectionGap: 8, accentColor: "#6B7280", dividerColor: "#E5E7EB", headingUnderline: false },
  },
  {
    id: "sidebar",
    type: "left",
    name: "Sidebar",
    blurb: "Dark teal sidebar with skills and education",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 13, lineH: 4.5, lineHSmall: 4.0, sectionGap: 5, accentColor: "#1F4E4A", dividerColor: "#BBD3CF", headingUnderline: true, layout: "sidebar-left", sidebarWidthMm: 60, columnGapMm: 9, sidebarBg: "#1F4E4A", sidebarText: "#FFFFFF", sidebarAccent: "#BFE3DC", sidebarKeys: ["skills", "certifications", "languages", "interests", "education"], periodInline: true },
  },
  {
    id: "sidebar-light",
    type: "left",
    name: "Sidebar light",
    blurb: "Light grey sidebar, understated",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 13, lineH: 4.5, lineHSmall: 4.0, sectionGap: 5, accentColor: "#3F5870", dividerColor: "#C9D3DD", headingUnderline: true, layout: "sidebar-left", sidebarWidthMm: 58, columnGapMm: 9, sidebarBg: "#EEF1F4", sidebarText: "#1B1F23", sidebarAccent: "#3F5870", sidebarKeys: ["skills", "certifications", "languages", "interests", "education"], periodInline: true },
  },
  {
    id: "two-column",
    type: "left",
    name: "Two-column text",
    blurb: "No colour, dense text, narrow left column",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 19, fontSizeTitle: 10.5, fontSizeContact: 9, fontSizeLabel: 9, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 14, lineH: 4.4, lineHSmall: 3.9, sectionGap: 4.8, accentColor: "#111111", dividerColor: "#888888", headingUnderline: true, layout: "sidebar-left", sidebarWidthMm: 52, columnGapMm: 8, sidebarKeys: ["skills", "languages", "certifications", "education", "interests"], periodInline: true },
  },
  {
    id: "sidebar-right",
    type: "right",
    name: "Sidebar right",
    blurb: "Soft green sidebar on the right",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 13, lineH: 4.5, lineHSmall: 4.0, sectionGap: 5, accentColor: "#4C6B45", dividerColor: "#CFDBC9", headingUnderline: true, layout: "sidebar-right", sidebarWidthMm: 58, columnGapMm: 9, sidebarBg: "#E8EFE4", sidebarText: "#1B1F23", sidebarAccent: "#4C6B45", sidebarKeys: ["skills", "certifications", "education", "languages", "interests"], periodInline: true },
  },
  {
    id: "grid",
    type: "grid",
    name: "Grid",
    blurb: "Section headings in a left column, content beside them",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", showDivider: false, fontColor: "#1b1f23", headerAlign: "left", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9, fontSizeBody: 9.8, fontSizeBullet: 9.3, marginMm: 15, lineH: 4.5, lineHSmall: 4.0, sectionGap: 6, accentColor: "#2F3B4C", dividerColor: "#D5D9DF", headingUnderline: false, layout: "grid", labelWidthMm: 36, columnGapMm: 6, periodInline: true },
  },
];

export const DEFAULT_TEMPLATE = "modern";
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

/** The PDF format for a template: its look, every section printed, no bullet limit. */
export function templateFormat(id) {
  const t = templateById(id);
  return { ...DEFAULT_PDF_FORMAT, ...t.format, maxBullets: Infinity, fullContent: true, sectionOrder: [...DEFAULT_PDF_FORMAT.sectionOrder, "certifications"] };
}

/** The groups the picker shows, in order. Single column is the safest for applicant tracking systems. */
export const TEMPLATE_GROUPS = [
  { type: "single", label: "Single column", note: "Safest for applicant tracking systems" },
  { type: "left", label: "Two-column, sidebar on the left", note: "Some applicant tracking systems read these less reliably" },
  { type: "right", label: "Two-column, sidebar on the right", note: "Some applicant tracking systems read these less reliably" },
  { type: "grid", label: "Grid", note: "Headings in a side column" },
];

/**
 * The person's own adjustments on top of a template (the Design step). They change the look only, never the content:
 *   font      "helvetica" (sans-serif) | "times" (serif) | "courier" (monospace) | null = the template's own
 *   size      text size multiplier: 0.92 small, 1 as designed, 1.08 large
 *   spacing   line and section spacing multiplier: 0.9 tight, 1 as designed, 1.12 airy
 *   margins   change to the page margin in mm: -3 narrow, 0 as designed, +4 wide
 *   accent    heading / rule colour (#rrggbb) or null = the template's own
 *   underline true | false | null = the template's own (a rule under each section heading)
 */
export const DEFAULT_DESIGN = { font: null, size: 1, spacing: 1, margins: 0, accent: null, underline: null };
export const FONT_CHOICES = [
  ["helvetica", "Sans-serif"],
  ["times", "Serif"],
  ["courier", "Monospace"],
];
export const SIZE_CHOICES = [[0.92, "Small"], [1, "Medium"], [1.16, "Large"]];
export const SPACING_CHOICES = [[0.9, "Tight"], [1, "Normal"], [1.12, "Airy"]];
export const MARGIN_CHOICES = [[-3, "Narrow"], [0, "Normal"], [4, "Wide"]];
export const ACCENT_CHOICES = ["#1F3A5F", "#3F7D6E", "#B4326E", "#7A3E9D", "#C2570C", "#2F3B4C", "#111111"];

const SIZE_KEYS = ["fontSizeName", "fontSizeTitle", "fontSizeContact", "fontSizeLabel", "fontSizeBody", "fontSizeBullet"];
const SPACE_KEYS = ["lineH", "lineHSmall", "sectionGap"];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeDesign(d) {
  const x = { ...DEFAULT_DESIGN, ...(d && typeof d === "object" ? d : {}) };
  const pick = (v, list, dflt) => (list.some(([k]) => k === +v) ? +v : dflt);
  return {
    font: FONT_CHOICES.some(([k]) => k === x.font) ? x.font : null,
    size: pick(x.size, SIZE_CHOICES, 1),
    spacing: pick(x.spacing, SPACING_CHOICES, 1),
    margins: pick(x.margins, MARGIN_CHOICES, 0),
    accent: HEX.test(String(x.accent || "")) ? String(x.accent).toLowerCase() : null,
    underline: typeof x.underline === "boolean" ? x.underline : null,
  };
}

/** The PDF format for a template with the person's design applied on top. */
export function designFormat(id, design) {
  const d = normalizeDesign(design);
  const f = { ...templateFormat(id) };
  if (d.font) {
    f.fontHeader = d.font;
    f.fontBody = d.font;
    f.fontBullet = d.font;
  }
  SIZE_KEYS.forEach((k) => f[k] != null && (f[k] = Math.round(f[k] * d.size * 100) / 100));
  SPACE_KEYS.forEach((k) => f[k] != null && (f[k] = Math.round(f[k] * d.spacing * 100) / 100));
  f.marginMm = Math.max(8, (f.marginMm ?? 14) + d.margins);
  if (d.accent) {
    f.accentColor = d.accent;
    if (f.topRule) f.topRule = { ...f.topRule, color: d.accent };
    if (f.leftBar) f.leftBar = { ...f.leftBar, color: d.accent };
    // A light sidebar's headings follow the accent; a dark coloured sidebar keeps its own light headings.
    if (f.sidebarBg && f.sidebarAccent && f.sidebarText === "#1B1F23") f.sidebarAccent = d.accent;
  }
  if (d.underline != null) f.headingUnderline = d.underline;
  return f;
}

const DESIGN_KEY = "riq_design";
export function loadDesign() {
  try {
    return normalizeDesign(JSON.parse(localStorage.getItem(DESIGN_KEY) || "null"));
  } catch {
    return { ...DEFAULT_DESIGN };
  }
}
export function saveDesign(design) {
  try {
    localStorage.setItem(DESIGN_KEY, JSON.stringify(normalizeDesign(design)));
  } catch {
    // Storage blocked: the design just isn't remembered for next time.
  }
}
export const isDefaultDesign = (design) => JSON.stringify(normalizeDesign(design)) === JSON.stringify(DEFAULT_DESIGN);
