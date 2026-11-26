/**
 * Resume PDF (jsPDF): one builder shared by the app (download, Easy Apply) and the server
 * (the Chrome extension's autofill attaches the same PDF). Single column: photo top-left,
 * name/title/contact to the right, then Summary, Experience, Education, Skills.
 */
import { jsPDF } from "jspdf";
import { extraSections, educationDetails, educationLine, sectionPlan } from "./resumeSections.js";

export const MAX_BULLETS_PER_EXPERIENCE = 3;

/** Photo size in PDF: 3:4 aspect ratio (same as on-screen). */
export const PHOTO_WIDTH_MM = 28;
export const PHOTO_HEIGHT_MM = Math.round(PHOTO_WIDTH_MM * (4 / 3) * 10) / 10;

export const DEFAULT_SECTION_ORDER = ["summary", "experience", "education", "skills"];
export const DEFAULT_PDF_FORMAT = {
  marginMm: 14,
  lineH: 4.2,
  lineHSmall: 3.8,
  sectionGap: 5,
  fontSizeName: 16,
  fontSizeTitle: 10,
  fontSizeContact: 9,
  fontSizeLabel: 9,
  fontSizeBody: 10,
  fontSizeBullet: 9,
  photoWidthMm: 28,
  photoGapMm: 10,
  showDivider: true,
  dividerColor: "#c8d0da",
  fontHeader: "helvetica",
  fontBody: "helvetica",
  fontBullet: "helvetica",
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  skillsInHeader: false,
  singlePage: false,
  fontColor: "#000000",
  backgroundColor: "#ffffff",
  // Template options (src/resumeTemplates.js). The defaults give the look the PDF always had.
  accentColor: "#5a6b8a", // section headings
  headerAlign: "left", // "left" | "center" (centred only when there is no photo)
  headingUnderline: false, // a thin rule under each section heading
  fullContent: false, // also print every other part of the resume (projects, achievements, languages...) and education details
};

export function parseColor(hexOrRgb, fallbackR, fallbackG, fallbackB) {
  const def = { r: fallbackR ?? 0, g: fallbackG ?? 0, b: fallbackB ?? 0 };
  if (!hexOrRgb || typeof hexOrRgb !== "string") return def;
  const hex = hexOrRgb.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = hexOrRgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return def;
}

export function parseDividerColor(hexOrRgb) {
  if (!hexOrRgb || typeof hexOrRgb !== "string") return { r: 200, g: 208, b: 218 };
  const hex = hexOrRgb.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = hexOrRgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 200, g: 208, b: 218 };
}

// Characters the standard PDF fonts can draw (WinAnsi): ASCII, Latin-1 and Windows-1252's extras.
const PDF_SAFE = /[\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]/;

/**
 * Text the standard PDF fonts can draw. One character outside their set (₹, a non-breaking hyphen,
 * →) makes jsPDF letter-space the whole line and print junk for the character, so swap those for
 * safe equivalents and drop what has none.
 */
export function pdfSafeText(text) {
  return String(text ?? "")
    .replace(/₹\s*/g, "INR ")
    .replace(/[\u2010\u2011\u2012\u2212\uFE63\uFF0D]/g, "-")
    .replace(/[\u2192\u27F6\u279D]/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2713\u2714\u2705\u2611]\s*/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2000-\u200A\u202F\u205F\u3000\t]/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("")
    .map((ch) => (PDF_SAFE.test(ch) ? ch : ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split("").filter((c) => PDF_SAFE.test(c)).join("")))
    .join("");
}

/** The resume with every piece of text made safe for the PDF fonts. */
function pdfSafeResume(value) {
  if (typeof value === "string") return pdfSafeText(value);
  if (Array.isArray(value)) return value.map(pdfSafeResume);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pdfSafeResume(v)]));
  return value;
}

/**
 * Single-column resume PDF: photo top-left, name/title/contact to the right, then Summary, Experience, Education, Skills.
 * Uses format options so it matches the on-screen PDF preview.
 */
/** Web addresses and emails inside a printed line: https://…, www.…, name@site.com, linkedin.com/in/name, site.in/path. */
const LINK_RE = /(?:https?:\/\/|www\.)[^\s·|,;]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[a-z0-9-]+\.)+(?:com|in|io|co|me|net|org|app|dev|design|page|ai|xyz)\b(?:\/[^\s·|,;]*)?/gi;
export function linksIn(text) {
  const out = [];
  String(text || "").replace(LINK_RE, (m, at) => {
    const raw = m.replace(/[.,;:)\]]+$/, "");
    out.push({ at, text: raw, url: raw.includes("@") && !/^https?:/i.test(raw) ? `mailto:${raw}` : /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
    return m;
  });
  return out;
}

/** Makes every web address or email the PDF prints a clickable link (the text itself is drawn as before). */
function makeLinksClickable(doc) {
  const draw = doc.text.bind(doc);
  doc.text = function (text, x, y, opts, ...rest) {
    const result = draw(text, x, y, opts, ...rest);
    if (typeof text !== "string" || typeof x !== "number" || typeof y !== "number") return result;
    try {
      const found = linksIn(text);
      if (!found.length) return result;
      const total = doc.getTextWidth(text);
      const left = opts?.align === "right" ? x - total : opts?.align === "center" ? x - total / 2 : x;
      const h = (doc.getFontSize() * 0.3528) * 1.05;
      found.forEach((l) => {
        const lead = doc.getTextWidth(text.slice(0, l.at));
        const w = doc.getTextWidth(l.text);
        if (w > 0) doc.link(left + lead, y - h * 0.8, w, h, { url: l.url });
      });
    } catch {
      /* a link is a bonus: never let it break the PDF */
    }
    return result;
  };
  return doc;
}

/**
 * The PDF for a resume. If the last page would hold only a few lines (a resume that runs just over a page), the line and
 * section spacing is tightened a little, step by step, to bring those lines back onto the page before; text is never
 * cut or shrunk, and if tightening doesn't save a page the normal spacing is kept.
 */
export function buildResumePdf(resumeData, photoDataUrl, format = DEFAULT_PDF_FORMAT) {
  const first = buildOnce(resumeData, photoDataUrl, format);
  if (!first) return null;
  if (format.singlePage || first.pages < 2 || first.lastFill >= 0.2) return first.doc;
  for (const m of [0.96, 0.92, 0.88]) {
    const tighter = buildOnce(resumeData, photoDataUrl, { ...format, lineH: (format.lineH ?? 4.2) * m, lineHSmall: (format.lineHSmall ?? 3.8) * m, sectionGap: (format.sectionGap ?? 5) * m });
    if (tighter && tighter.pages < first.pages) return tighter.doc;
  }
  return first.doc;
}

function buildOnce(resumeData, photoDataUrl, format) {
  if (!resumeData || typeof resumeData !== "object") return null;
  resumeData = pdfSafeResume(resumeData);
  let doc = makeLinksClickable(new jsPDF({ format: "a4", unit: "mm" }));
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const singlePage = format.singlePage === true;
  const scale = singlePage ? 0.78 : 1;
  let margin = (format.marginMm ?? 14) * scale;
  const hasPhoto = typeof photoDataUrl === "string" && photoDataUrl.length > 0;
  const centered = format.headerAlign === "center" && !hasPhoto;
  const photoGap = hasPhoto ? (format.photoGapMm ?? 10) * scale : 0;
  const photoW = hasPhoto ? (format.photoWidthMm ?? PHOTO_WIDTH_MM) * scale : 0;
  const photoH = Math.round(photoW * (4 / 3) * 10) / 10;
  const headerTextX = margin + photoW + photoGap;
  const headX = () => (centered ? pageW / 2 : headerTextX);
  const headOpts = () => (centered ? { align: "center" } : undefined);
  const contentW = pageW - margin * 2;
  const headerTextW = centered ? contentW : pageW - headerTextX - margin;
  let lineH = (format.lineH ?? 4.2) * scale;
  let lineHSmall = (format.lineHSmall ?? 3.8) * scale;
  let sectionGap = (format.sectionGap ?? 5) * scale;
  let y = margin;

  const bg = parseColor(format.backgroundColor, 255, 255, 255);
  doc.setFillColor(bg.r, bg.g, bg.b);
  doc.rect(0, 0, pageW, pageH, "F");

  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal");

  let fc = parseColor(format.fontColor, 0, 0, 0);
  let ac = parseColor(format.accentColor, 90, 107, 138);
  const baseFc = fc;
  const baseAc = ac;
  const fs = (v, d) => Math.max(1, ((v ?? d) * scale));
  // The column being drawn into. Single column: the whole page width. Sidebar and grid layouts move these (see below).
  let colX = margin;
  let colW = contentW;
  let colRight = pageW - margin;
  let gridLabelW = 0; // grid layout: width of the heading column (0 = headings above their content)
  let measuring = false; // true while a section is drawn onto a scratch page just to learn its height
  let sidebarBg = null; // { x, w, color } once a sidebar is in use: repeated on every new page
  // Marks every page carries: a rule across the top, a bar down the left edge, the sidebar band.
  const decoratePage = (first) => {
    if (format.topRule) {
      const c = parseColor(format.topRule.color, 0, 0, 0);
      doc.setFillColor(c.r, c.g, c.b);
      doc.rect(0, 0, pageW, format.topRule.h ?? 2, "F");
    }
    if (format.leftBar) {
      const c = parseColor(format.leftBar.color, 0, 0, 0);
      doc.setFillColor(c.r, c.g, c.b);
      doc.rect(format.leftBar.x ?? Math.max(2, margin - 6), 0, format.leftBar.w ?? 1.4, pageH, "F");
    }
    if (sidebarBg && !first) {
      doc.setFillColor(sidebarBg.color.r, sidebarBg.color.g, sidebarBg.color.b);
      doc.rect(sidebarBg.x, 0, sidebarBg.w, pageH, "F");
    }
  };
  const checkPage = (yVal) => {
    if (measuring) return yVal;
    if (singlePage) return yVal;
    if (yVal > pageH - margin - 10) {
      doc.addPage();
      doc.setFillColor(bg.r, bg.g, bg.b);
      doc.rect(0, 0, pageW, pageH, "F");
      decoratePage(false);
      return margin;
    }
    return yVal;
  };

  /**
   * Lines of `text` that fit `width` in the current font. Words wrap as usual; a single unbroken word wider than the
   * column (a long link) is broken by characters, so nothing is ever drawn past the edge of its column.
   */
  const fitLines = (text, width) => {
    const out = [];
    doc.splitTextToSize(String(text ?? ""), Math.max(width, 5)).forEach((line) => {
      if (doc.getTextWidth(line) <= width) return out.push(line);
      let cur = "";
      for (const ch of line) {
        if (cur && doc.getTextWidth(cur + ch) > width) {
          out.push(cur);
          cur = ch;
        } else cur += ch;
      }
      if (cur) out.push(cur);
    });
    return out.length ? out : [""];
  };

  const drawWrappedText = (text, x, maxWidth, lineHeight) => {
    doc.setCharSpace(0);
    const lines = fitLines(text, maxWidth);
    lines.forEach((line) => {
      y = checkPage(y); // a long paragraph continues on the next page instead of running off the bottom
      doc.text(line, x, y);
      y += lineHeight;
    });
  };

  const fontH = format.fontHeader || "helvetica";
  const fontB = format.fontBody || "helvetica";
  const fontBul = format.fontBullet || "helvetica";
  const bulletIndentMm = 4;
  const sectionOrder = Array.isArray(format.sectionOrder) && format.sectionOrder.length
    ? format.sectionOrder
    : DEFAULT_SECTION_ORDER;

  decoratePage(true);

  // —— Photo top-left ——
  if (hasPhoto) {
    try {
      doc.addImage(photoDataUrl, "PNG", margin, margin, photoW, photoH);
    } catch (e) {
      console.warn("PDF photo failed", e);
    }
  }

  // —— Name, title, contact: align name top with photo top (baseline = margin + ascent) ——
  const ascentMm = (format.fontSizeName ?? 16) * 0.3528 * scale;
  let yHeader = margin + ascentMm;
  doc.setFont(fontH, "bold");
  doc.setFontSize(fs(format.fontSizeName, 16));
  doc.setCharSpace(0);
  doc.setTextColor(fc.r, fc.g, fc.b);
  const nameLines = fitLines(resumeData.name || "Resume", headerTextW);
  nameLines.forEach((line, i) => {
    doc.text(line, headX(), yHeader, headOpts());
    if (i < nameLines.length - 1) yHeader += fs(format.fontSizeName, 16) * 0.3528 * 1.2;
  });
  yHeader += 6;

  doc.setFont(fontB, "normal");
  doc.setFontSize(fs(format.fontSizeTitle, 10));
  doc.setCharSpace(0);
  const titleLines = fitLines(resumeData.title || "", headerTextW);
  titleLines.forEach((line) => {
    doc.text(line, headX(), yHeader, headOpts());
    yHeader += lineHSmall;
  });
  yHeader += 3;

  doc.setFontSize(fs(format.fontSizeContact, 9));
  doc.setCharSpace(0);
  const contactLines = fitLines(resumeData.contact || "", headerTextW);
  contactLines.forEach((line) => {
    doc.text(line, headX(), yHeader, headOpts());
    yHeader += lineHSmall;
  });

  if (format.skillsInHeader && (resumeData.skills || []).length > 0) {
    yHeader += lineHSmall;
    doc.setFont(fontB, "normal");
    doc.setFontSize(fs(format.fontSizeBody, 10));
    doc.setCharSpace(0);
    doc.setTextColor(fc.r, fc.g, fc.b);
    const skillLines = fitLines((resumeData.skills || []).join(" | "), headerTextW);
    skillLines.forEach((line) => {
      doc.text(line, headerTextX, yHeader);
      yHeader += lineHSmall;
    });
    doc.setTextColor(fc.r, fc.g, fc.b);
  }

  y = Math.max(margin + photoH, yHeader) + 5;
  if (format.showDivider !== false) {
    const dc = parseDividerColor(format.dividerColor);
    doc.setDrawColor(dc.r, dc.g, dc.b);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 1, pageW - margin, y - 1);
  }
  y += 3;

  // The person's own order (and renamed headings) win over the template's default order.
  const userOrder = Array.isArray(resumeData.sectionOrder) ? resumeData.sectionOrder : null;
  const printable = (k) => format.fullContent || sectionOrder.includes(k) || DEFAULT_SECTION_ORDER.includes(k);
  const orderedKeys = userOrder ? [...userOrder.filter(printable), ...sectionOrder.filter((k) => !userOrder.includes(k))] : [...sectionOrder];
  const heading = (key, fallback) => String(resumeData.sectionTitles?.[key] || fallback).toUpperCase();
  if (format.fullContent) {
    if ((resumeData.certifications || []).length && !orderedKeys.includes("certifications")) orderedKeys.push("certifications");
    extraSections(resumeData).forEach((x) => !orderedKeys.includes(x.key) && orderedKeys.push(x.key));
  }
  // Only sections that have content are printed, so a removed section leaves no empty heading behind.
  const present = new Set(sectionPlan(resumeData).map((x) => x.key));
  const bodySectionOrder = (format.skillsInHeader ? orderedKeys.filter((k) => k !== "skills") : orderedKeys).filter((k, i, all) => present.has(k) && all.indexOf(k) === i);

  // A section heading in the accent colour, with an optional rule under it.
  const drawHeading = (label) => {
    doc.setFont(fontH, "bold");
    doc.setFontSize(fs(format.fontSizeLabel, 9));
    doc.setCharSpace(0);
    doc.setTextColor(ac.r, ac.g, ac.b);
    if (gridLabelW) {
      // Grid layout: the heading sits in a narrow column on the left, the content starts on the same line to its right.
      fitLines(label, gridLabelW).forEach((l, n) => doc.text(l, margin, y + n * lineH));
      doc.setTextColor(fc.r, fc.g, fc.b);
      return;
    }
    const lines = fitLines(label, colW);
    lines.forEach((l, n) => doc.text(l, colX, y + n * lineH));
    y += (lines.length - 1) * lineH;
    doc.setTextColor(fc.r, fc.g, fc.b);
    if (format.headingUnderline) {
      const dc = parseDividerColor(format.dividerColor);
      doc.setDrawColor(dc.r, dc.g, dc.b);
      doc.setLineWidth(0.25);
      doc.line(colX, y + 1.2, colRight, y + 1.2);
    }
    y += lineH;
  };
  // One bullet, wrapped, continuing onto the next page when needed.
  const drawBullet = (b) => {
    y = checkPage(y);
    const textW = colW - bulletIndentMm - 2;
    const lines = fitLines(b, textW);
    doc.text("• ", colX, y);
    const textX = colX + bulletIndentMm;
    if (lines.length) {
      doc.text(lines[0], textX, y);
      y += lineHSmall;
      for (let i = 1; i < lines.length; i++) {
        y = checkPage(y);
        doc.text(lines[i], textX, y);
        y += lineHSmall;
      }
    }
  };

  const renderSection = (key) => {
    if (key === "summary") {
      drawHeading(heading("summary", "Summary"));
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      if (resumeData.summary) {
        drawWrappedText(resumeData.summary, colX, colW, lineHSmall);
      }
      return;
    }
    if (key === "experience") {
      y = checkPage(y);
      drawHeading(heading("experience", "Experience"));
      (resumeData.experience || []).forEach((exp) => {
        y = checkPage(y);
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        doc.setCharSpace(0);
        const roleText = `${exp.role || ""} · ${exp.company || ""}`;
        const period = exp.period || "";
        doc.setFont(fontBul, "normal");
        doc.setFontSize(fs(format.fontSizeBullet, 9));
        const periodW = period ? doc.getTextWidth(period) : 0;
        const inline = !!period && !!format.periodInline;
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        // The role line wraps to the column; with the date on the same line it wraps in the room the date leaves.
        const roleLines = fitLines(roleText, inline ? colW - periodW - 4 : colW);
        // Keep a wrapped heading together on one page, and draw the date after the whole heading (so the heading's own
        // text stays in one piece for the content check), back on the first line.
        const roomNeeded = (roleLines.length - 1) * lineHSmall;
        const moved = checkPage(y + roomNeeded);
        if (moved !== y + roomNeeded) y = moved;
        const firstY = y;
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        roleLines.forEach((line) => {
          doc.text(line, colX, y);
          y += lineHSmall;
        });
        if (inline) {
          doc.setFont(fontBul, "normal");
          doc.setFontSize(fs(format.fontSizeBullet, 9));
          doc.text(period, colRight, firstY, { align: "right" });
        }
        doc.setFont(fontBul, "normal");
        doc.setFontSize(fs(format.fontSizeBullet, 9));
        doc.setCharSpace(0);
        if (period && !inline) {
          doc.text(period, colX, y);
          y += lineHSmall;
        }
        // format.maxBullets: the editor prints every bullet; elsewhere the first few per role.
        (exp.bullets || []).slice(0, format.maxBullets ?? MAX_BULLETS_PER_EXPERIENCE).forEach((b) => b != null && drawBullet(b));
        y += lineHSmall;
      });
      return;
    }
    if (key === "education") {
      y = checkPage(y);
      drawHeading(heading("education", "Education"));
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      (resumeData.education || []).forEach((ed, n) => {
        y = checkPage(y);
        if (n > 0) y += lineHSmall * 0.45; // a clear gap between two degrees
        // Wrapped to the column (a long school name in a narrow sidebar must not run into the next column), no empty "· ·".
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        drawWrappedText(educationLine(ed), colX, colW, lineHSmall);
        if (format.fullContent) {
          // Grade, place and detail lines sit under the degree at the same left edge, in the lighter bullet style.
          doc.setFont(fontBul, "normal");
          doc.setFontSize(fs(format.fontSizeBullet, 9));
          educationDetails(ed).forEach((line) => {
            y = checkPage(y);
            drawWrappedText(line, colX, colW, lineHSmall);
          });
        }
      });
      return;
    }
    if (key === "skills") {
      y = checkPage(y);
      drawHeading(heading("skills", "Skills"));
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      const skills = resumeData.skills || [];
      if (skills.length) {
        drawWrappedText(skills.join(" · "), colX, colW, lineHSmall);
      }
    }
    const extra = extraSections(resumeData).find((x) => x.key === key);
    if (extra) {
      y = checkPage(y);
      drawHeading(extra.title.toUpperCase());
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      if (extra.kind === "inline") {
        drawWrappedText(extra.items.join(" · "), colX, colW, lineHSmall);
      } else if (extra.kind === "bullets") {
        doc.setFont(fontBul, "normal");
        doc.setFontSize(fs(format.fontSizeBullet, 9));
        extra.items.forEach(drawBullet);
      } else {
        extra.items.forEach((it) => {
          y = checkPage(y);
          doc.setFont(fontB, "bold");
          doc.setFontSize(fs(format.fontSizeBody, 10));
          const metaW = it.meta ? doc.getTextWidth(it.meta) : 0;
          const headLines = fitLines(it.heading || "", it.meta ? colW - metaW - 4 : colW);
          const need = (headLines.length - 1) * lineHSmall;
          const shifted = checkPage(y + need);
          if (shifted !== y + need) y = shifted;
          const headY = y;
          headLines.forEach((line) => {
            doc.text(line, colX, y);
            y += lineHSmall;
          });
          if (it.meta) doc.text(it.meta, colRight, headY, { align: "right" });
          doc.setFont(fontBul, "normal");
          doc.setFontSize(fs(format.fontSizeBullet, 9));
          it.bullets.forEach(drawBullet);
          y += lineHSmall / 2;
        });
      }
      return;
    }
    // Opt-in (add "certifications" to format.sectionOrder): one certification per line.
    if (key === "certifications" && (resumeData.certifications || []).length) {
      y = checkPage(y);
      drawHeading(heading("certifications", "Certifications"));
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      resumeData.certifications.forEach((c) => {
        y = checkPage(y);
        drawWrappedText(String(c), colX, colW, lineHSmall);
      });
    }
  };

  // ---- Layout: one column, a sidebar (left or right), or a grid with the headings in a left column ----
  const layout = format.layout || "single";
  const yBody = y;
  const useColors = (textColor, accentColor) => {
    fc = textColor ? parseColor(textColor, 0, 0, 0) : baseFc;
    ac = accentColor ? parseColor(accentColor, 90, 107, 138) : baseAc;
    doc.setTextColor(fc.r, fc.g, fc.b);
  };
  /** How tall a section is in a column of this width, learned by drawing it on a scratch page. */
  const measure = (key, x, w) => {
    const real = { doc, y, colX, colW, colRight };
    measuring = true;
    doc = new jsPDF({ format: "a4", unit: "mm" });
    colX = x;
    colW = w;
    colRight = x + w;
    y = 0;
    renderSection(key);
    const h = y;
    ({ doc, y, colX, colW, colRight } = real);
    measuring = false;
    return h;
  };
  let mainKeys = bodySectionOrder;
  if ((layout === "sidebar-left" || layout === "sidebar-right") && bodySectionOrder.length > 1) {
    const sideW = format.sidebarWidthMm ?? 58;
    const gap = format.columnGapMm ?? 9;
    const mainW = contentW - sideW - gap;
    const sideX = layout === "sidebar-left" ? margin : pageW - margin - sideW;
    const mainX = layout === "sidebar-left" ? margin + sideW + gap : margin;
    // Sidebar sections that fit on the first page go in the sidebar; any that don't flow into the main column, so nothing is cut.
    const room = pageH - margin - 10 - yBody;
    const wanted = (format.sidebarKeys || []).filter((k) => bodySectionOrder.includes(k));
    const inSide = [];
    let used = 0;
    wanted.forEach((k) => {
      const h = measure(k, sideX, sideW) + sectionGap;
      if (used + h <= room && inSide.length < bodySectionOrder.length - 1) {
        inSide.push(k);
        used += h;
      }
    });
    if (inSide.length) {
      mainKeys = bodySectionOrder.filter((k) => !inSide.includes(k));
      if (format.sidebarBg) {
        const bandX = layout === "sidebar-left" ? 0 : sideX - gap / 2;
        const bandW = layout === "sidebar-left" ? margin + sideW + gap / 2 : pageW - bandX;
        sidebarBg = { x: bandX, w: bandW, color: parseColor(format.sidebarBg, 240, 240, 240) };
        doc.setFillColor(sidebarBg.color.r, sidebarBg.color.g, sidebarBg.color.b);
        doc.rect(bandX, yBody - 2, bandW, pageH - (yBody - 2), "F");
      }
      colX = sideX;
      colW = sideW;
      colRight = sideX + sideW;
      y = yBody + (format.sidebarBg ? 4 : 0);
      useColors(format.sidebarText, format.sidebarAccent);
      inSide.forEach((k, i) => {
        renderSection(k);
        if (i < inSide.length - 1) y += sectionGap;
      });
      useColors(null, null);
      colX = mainX;
      colW = mainW;
      colRight = mainX + mainW;
      y = yBody;
    }
  } else if (layout === "grid") {
    gridLabelW = format.labelWidthMm ?? 34;
    const gap = format.columnGapMm ?? 6;
    colX = margin + gridLabelW + gap;
    colW = contentW - gridLabelW - gap;
    colRight = pageW - margin;
  }
  mainKeys.forEach((key, i) => {
    if (gridLabelW && i > 0) {
      const dc = parseDividerColor(format.dividerColor);
      doc.setDrawColor(dc.r, dc.g, dc.b);
      doc.setLineWidth(0.2);
      doc.line(margin, y - sectionGap / 2, pageW - margin, y - sectionGap / 2);
    }
    renderSection(key);
    if (i < mainKeys.length - 1) y += sectionGap;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("ResumeIQ", margin, pageH - 6);
  doc.setTextColor(0, 0, 0);

  return { doc, pages: doc.getNumberOfPages(), lastFill: Math.max(0, (y - margin) / (pageH - margin * 2)) };
}

