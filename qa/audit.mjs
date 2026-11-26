import fs from "node:fs";
import { buildResumePdf } from "../src/resumePdf.js";
import { TEMPLATES, designFormat } from "../src/resumeTemplates.js";
import { finalResume } from "../src/tailorEdits.js";

// A resume shaped like a real one: long bullets with arrows, a typed " . " separator, a long skills list, Core Competencies.
import { resume } from "./resume-fixture.js";

if (process.argv[1].endsWith("audit.mjs")) {
  fs.mkdirSync("qa/audit", { recursive: true });
  for (const t of TEMPLATES) {
    const doc = buildResumePdf(finalResume(resume), null, designFormat(t.id, { accent: process.env.ACCENT || null }));
    const pages = doc.getNumberOfPages();
    fs.writeFileSync(`qa/audit/${t.id}-p1.pdf`, Buffer.from(doc.output("arraybuffer")));
    if (pages > 1) {
      doc.deletePage(1);
      fs.writeFileSync(`qa/audit/${t.id}-p2.pdf`, Buffer.from(doc.output("arraybuffer")));
    }
    console.log(t.id, pages);
  }
}
