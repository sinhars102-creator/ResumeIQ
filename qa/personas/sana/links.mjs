import fs from "node:fs";
const pdfjs = await import("/Users/rahulsinha/ResumeIQ/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])) }).promise;
for (let n=1;n<=doc.numPages;n++){ const a=await (await doc.getPage(n)).getAnnotations(); console.log(n, a.map(x=>x.url||x.unsafeUrl)); }
