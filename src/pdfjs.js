// The one place the browser loads pdf.js. The "legacy" build carries fallbacks for features older browsers lack:
// the standard build failed on them with errors such as "toHex is not a function". The library and its worker
// must both come from legacy/. Loaded on first use, so a browser that can't run it still opens the site.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

let loading = null;

export function loadPdfjs() {
  loading ||= import("pdfjs-dist/legacy/build/pdf.mjs").then(
    (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    },
    (error) => {
      loading = null; // a dropped connection shouldn't break every later try
      throw error;
    }
  );
  return loading;
}
