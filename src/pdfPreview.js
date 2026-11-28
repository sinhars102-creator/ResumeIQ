// Module M10 – pdf.js in the browser: read a PDF's text back (content check) and draw its pages as images (template preview).
import { loadPdfjs } from "./pdfjs.js";

export { loadPdfjs };

/** Every page of a PDF as a JPEG data URL, `width` pixels wide (drawn at the screen's pixel density for sharpness). */
export async function renderPdfPages(data, width = 600) {
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const images = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width * ratio) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.88));
  }
  return images;
}
