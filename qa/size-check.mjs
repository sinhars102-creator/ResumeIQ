import { buildResumePdf } from "../src/resumePdf.js";
import { designFormat } from "../src/resumeTemplates.js";
import { finalResume } from "../src/tailorEdits.js";
import { resume } from "./resume-fixture.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
async function stats(design) {
  const doc = buildResumePdf(finalResume(resume), null, designFormat("executive", design));
  const data = doc.output("arraybuffer");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const heights = []; let lowest = 0; const pages = pdf.numPages;
  for (let n = 1; n <= pages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter((i) => i.str.trim());
    items.forEach((i) => heights.push(i.height));
    if (n === pages) lowest = Math.min(...items.map((i) => i.transform[5]));
  }
  return { pages, bodyMedianPt: Math.round(med(heights) * 100) / 100, lastPageTextReachesPt: Math.round(842 - lowest) };
}
console.log("default      ", JSON.stringify(await stats({})));
console.log("Large size   ", JSON.stringify(await stats({ size: 1.08 })));
console.log("Airy spacing ", JSON.stringify(await stats({ spacing: 1.12 })));
console.log("Large + Airy ", JSON.stringify(await stats({ size: 1.08, spacing: 1.12 })));
console.log("Small + Tight", JSON.stringify(await stats({ size: 0.92, spacing: 0.9 })));
