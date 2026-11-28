// A PDF's text in reading order. Shared by the browser and the server (the fallback for browsers that can't
// read a PDF themselves), so both give the same result. `pdfjs` is passed in: each side loads its own copy.

/**
 * Rebuild a PDF page's reading order from text positions. Design tools (Canva
 * etc.) store text in arbitrary order – a job's bullets can come before its
 * title line – so trusting the stored order files bullets under the wrong job.
 * Detects a column gutter (a vertical strip no text crosses), then reads each
 * column top-to-bottom, line by line.
 */
function pageTextInReadingOrder(items, pageWidth) {
  const words = items
    .filter((it) => typeof it.str === "string" && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: Math.abs(it.height || it.transform[3] || 10),
    }));
  if (!words.length) return "";

  // Coverage of each 2pt-wide vertical strip; full-width text (headers) is ignored so it can't hide a gutter.
  const step = 2;
  const coverage = new Array(Math.ceil(pageWidth / step) + 1).fill(0);
  words
    .filter((wd) => wd.w < pageWidth * 0.5)
    .forEach((wd) => {
      for (let x = Math.max(0, Math.floor(wd.x / step)); x <= Math.min(coverage.length - 1, Math.ceil((wd.x + wd.w) / step)); x++) coverage[x]++;
    });
  // Widest empty strip between 20% and 75% of the page width is the gutter.
  let best = null;
  let runStart = null;
  for (let i = 0; i <= coverage.length; i++) {
    const empty = i < coverage.length && coverage[i] === 0 && i * step > pageWidth * 0.2 && i * step < pageWidth * 0.75;
    if (empty && runStart === null) runStart = i;
    if (!empty && runStart !== null) {
      if (!best || i - runStart > best.len) best = { start: runStart, len: i - runStart };
      runStart = null;
    }
  }
  const gutterX = best && best.len * step >= 8 ? (best.start + best.len / 2) * step : null;

  const columns = gutterX == null ? [words] : [words.filter((wd) => wd.x < gutterX), words.filter((wd) => wd.x >= gutterX)];
  return columns
    .filter((col) => col.length)
    .map((col) => {
      // Group into lines (PDF y grows upward), then read lines top-to-bottom and words left-to-right.
      const sorted = [...col].sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const wd of sorted) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(line.y - wd.y) <= Math.max(2, Math.min(line.h, wd.h) * 0.5)) line.words.push(wd);
        else lines.push({ y: wd.y, h: wd.h, words: [wd] });
      }
      return lines
        .map((line) => line.words.sort((a, b) => a.x - b.x).map((wd) => wd.str).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** Every page's text, in reading order. `options` go to pdf.js's getDocument. */
export async function readPdfText(pdfjs, data, { maxPages = Infinity, ...options } = {}) {
  const task = pdfjs.getDocument({ ...options, data });
  try {
    const pdf = await task.promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += pageTextInReadingOrder(content.items, page.getViewport({ scale: 1 }).width) + "\n\n";
    }
    return text.trim();
  } finally {
    task.destroy?.()?.catch?.(() => {});
  }
}
