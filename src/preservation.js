/**
 * Module M10 – the content check.
 *
 * After a template makes the PDF, the PDF's own text is read back and compared with the approved resume:
 * every name, role, bullet, skill, certification and extra section must be in it. Missing text is reported
 * (never silently dropped). Spaces, punctuation and capitals don't count as differences, since the PDF
 * wraps lines and some characters are swapped for ones the PDF fonts can draw.
 *
 *   checkPreserved(resume, pdfText) -> { ok, total, missing: [string] }
 *   extractPdfText(data, pdfjs)     -> all text of a PDF (pdfjs = the pdf.js module, so tests can pass the Node build)
 */
import { expectedTexts } from "./resumeSections.js";
import { pdfSafeText } from "./resumePdf.js";

const squash = (s) => pdfSafeText(s).toLowerCase().replace(/[^a-z0-9]+/g, "");

export function checkPreserved(resume, pdfText) {
  const haystack = squash(pdfText);
  const wanted = expectedTexts(resume);
  const missing = wanted.filter((t) => {
    const needle = squash(t);
    return needle && !haystack.includes(needle);
  });
  return { ok: missing.length === 0, total: wanted.length, missing: missing.map((m) => (m.length > 90 ? `${m.slice(0, 87)}...` : m)) };
}

export async function extractPdfText(data, pdfjs) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => i.str).join(" "));
  }
  return pages.join("\n");
}
