/**
 * Module M10 – resume templates.
 *
 * A template is only a look: fonts, sizes, spacing, colours and header style. It never rewrites or drops content;
 * the approved resume goes in unchanged and is laid out across as many pages as it needs. All three are single
 * column with real text (no images of text, no tables), so applicant tracking systems read them.
 *
 *   templateFormat(id)  the PDF format (see src/resumePdf.js) for a template, with every section printed
 */
import { DEFAULT_PDF_FORMAT } from "./resumePdf.js";

export const TEMPLATES = [
  {
    id: "modern",
    name: "Modern",
    blurb: "Clean sans-serif with a green accent",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", fontSizeName: 20, fontSizeTitle: 11, fontSizeContact: 9, fontSizeLabel: 9.5, fontSizeBody: 10, fontSizeBullet: 9.5, marginMm: 15, lineH: 4.6, lineHSmall: 4.1, sectionGap: 5.5, accentColor: "#3F7D6E", dividerColor: "#3F7D6E", headerAlign: "left", headingUnderline: false, showDivider: true, fontColor: "#1b1f23" },
  },
  {
    id: "classic",
    name: "Classic",
    blurb: "Traditional serif, centred header",
    format: { fontHeader: "times", fontBody: "times", fontBullet: "times", fontSizeName: 19, fontSizeTitle: 11, fontSizeContact: 10, fontSizeLabel: 10.5, fontSizeBody: 11, fontSizeBullet: 10.5, marginMm: 17, lineH: 4.8, lineHSmall: 4.4, sectionGap: 5, accentColor: "#000000", dividerColor: "#444444", headerAlign: "center", headingUnderline: true, showDivider: false, fontColor: "#111111" },
  },
  {
    id: "compact",
    name: "Compact",
    blurb: "Tighter spacing to fit more on a page",
    format: { fontHeader: "helvetica", fontBody: "helvetica", fontBullet: "helvetica", fontSizeName: 16, fontSizeTitle: 9.5, fontSizeContact: 8.5, fontSizeLabel: 8.5, fontSizeBody: 9.5, fontSizeBullet: 9, marginMm: 11, lineH: 3.9, lineHSmall: 3.6, sectionGap: 3.5, accentColor: "#333333", dividerColor: "#999999", headerAlign: "left", headingUnderline: true, showDivider: false, fontColor: "#000000" },
  },
];

export const DEFAULT_TEMPLATE = "modern";
export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

/** The PDF format for a template: its look, every section printed, no bullet limit. */
export function templateFormat(id) {
  const t = templateById(id);
  return { ...DEFAULT_PDF_FORMAT, ...t.format, maxBullets: Infinity, fullContent: true, sectionOrder: [...DEFAULT_PDF_FORMAT.sectionOrder, "certifications"] };
}
