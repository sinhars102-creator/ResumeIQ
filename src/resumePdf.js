/**
 * Resume PDF (jsPDF): one builder shared by the app (download, Easy Apply) and the server
 * (the Chrome extension's autofill attaches the same PDF). Single column: photo top-left,
 * name/title/contact to the right, then Summary, Experience, Education, Skills.
 */
import { jsPDF } from "jspdf";

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
export function buildResumePdf(resumeData, photoDataUrl, format = DEFAULT_PDF_FORMAT) {
  if (!resumeData || typeof resumeData !== "object") return null;
  resumeData = pdfSafeResume(resumeData);
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const singlePage = format.singlePage === true;
  const scale = singlePage ? 0.78 : 1;
  let margin = (format.marginMm ?? 14) * scale;
  const hasPhoto = typeof photoDataUrl === "string" && photoDataUrl.length > 0;
  const photoGap = hasPhoto ? (format.photoGapMm ?? 10) * scale : 0;
  const photoW = hasPhoto ? (format.photoWidthMm ?? PHOTO_WIDTH_MM) * scale : 0;
  const photoH = Math.round(photoW * (4 / 3) * 10) / 10;
  const headerTextX = margin + photoW + photoGap;
  const contentW = pageW - margin * 2;
  const headerTextW = pageW - headerTextX - margin;
  let lineH = (format.lineH ?? 4.2) * scale;
  let lineHSmall = (format.lineHSmall ?? 3.8) * scale;
  let sectionGap = (format.sectionGap ?? 5) * scale;
  let y = margin;

  const bg = parseColor(format.backgroundColor, 255, 255, 255);
  doc.setFillColor(bg.r, bg.g, bg.b);
  doc.rect(0, 0, pageW, pageH, "F");

  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal");

  const fc = parseColor(format.fontColor, 0, 0, 0);
  const fs = (v, d) => Math.max(1, ((v ?? d) * scale));
  const checkPage = (yVal) => {
    if (singlePage) return yVal;
    if (yVal > pageH - margin - 10) {
      doc.addPage();
      doc.setFillColor(bg.r, bg.g, bg.b);
      doc.rect(0, 0, pageW, pageH, "F");
      return margin;
    }
    return yVal;
  };

  const drawWrappedText = (text, x, maxWidth, lineHeight) => {
    doc.setCharSpace(0);
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    lines.forEach((line) => {
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
  doc.text(resumeData.name || "Resume", headerTextX, yHeader);
  yHeader += 6;

  doc.setFont(fontB, "normal");
  doc.setFontSize(fs(format.fontSizeTitle, 10));
  doc.setCharSpace(0);
  const titleLines = doc.splitTextToSize(resumeData.title || "", headerTextW);
  titleLines.forEach((line) => {
    doc.text(line, headerTextX, yHeader);
    yHeader += lineHSmall;
  });
  yHeader += 3;

  doc.setFontSize(fs(format.fontSizeContact, 9));
  doc.setCharSpace(0);
  const contactLines = doc.splitTextToSize(resumeData.contact || "", headerTextW);
  contactLines.forEach((line) => {
    doc.text(line, headerTextX, yHeader);
    yHeader += lineHSmall;
  });

  if (format.skillsInHeader && (resumeData.skills || []).length > 0) {
    yHeader += lineHSmall;
    doc.setFont(fontB, "normal");
    doc.setFontSize(fs(format.fontSizeBody, 10));
    doc.setCharSpace(0);
    doc.setTextColor(fc.r, fc.g, fc.b);
    const skillLines = doc.splitTextToSize((resumeData.skills || []).join(" | "), headerTextW);
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

  const bodySectionOrder = format.skillsInHeader
    ? sectionOrder.filter((k) => k !== "skills")
    : sectionOrder;

  const renderSection = (key) => {
    if (key === "summary") {
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("SUMMARY", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      if (resumeData.summary) {
        drawWrappedText(resumeData.summary, margin, contentW, lineHSmall);
      }
      return;
    }
    if (key === "experience") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("EXPERIENCE", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      (resumeData.experience || []).forEach((exp) => {
        y = checkPage(y);
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        doc.setCharSpace(0);
        doc.text(`${exp.role || ""} · ${exp.company || ""}`, margin, y);
        y += lineHSmall;
        doc.setFont(fontBul, "normal");
        doc.setFontSize(fs(format.fontSizeBullet, 9));
        doc.setCharSpace(0);
        if (exp.period) {
          doc.text(exp.period, margin, y);
          y += lineHSmall;
        }
        (exp.bullets || []).slice(0, MAX_BULLETS_PER_EXPERIENCE).forEach((b) => {
          y = checkPage(y);
          const textW = contentW - bulletIndentMm - 2;
          const lines = doc.splitTextToSize(String(b), textW);
          const bulletPrefix = "• ";
          doc.text(bulletPrefix, margin, y);
          const textX = margin + bulletIndentMm;
          if (lines.length) {
            doc.text(lines[0], textX, y);
            y += lineHSmall;
            for (let i = 1; i < lines.length; i++) {
              y = checkPage(y);
              doc.text(lines[i], textX, y);
              y += lineHSmall;
            }
          }
        });
        y += lineHSmall;
      });
      return;
    }
    if (key === "education") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("EDUCATION", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      (resumeData.education || []).forEach((ed) => {
        y = checkPage(y);
        doc.text(`${ed.degree || ""} · ${ed.school || ""} · ${ed.year || ""}`, margin, y);
        y += lineHSmall + 1;
      });
      return;
    }
    if (key === "skills") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("SKILLS", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      const skills = resumeData.skills || [];
      if (skills.length) {
        drawWrappedText(skills.join(" · "), margin, contentW, lineHSmall);
      }
    }
  };

  bodySectionOrder.forEach((key, i) => {
    renderSection(key);
    if (i < bodySectionOrder.length - 1) y += sectionGap;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("ResumeIQ", margin, pageH - 6);
  doc.setTextColor(0, 0, 0);

  return doc;
}

