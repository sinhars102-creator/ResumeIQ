import { openApp, shot, textToPdf } from "../harness.mjs";
import fs from "node:fs";
await textToPdf(fs.readFileSync("resume.txt","utf8"), "/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/vikram/resume.pdf");
const app = await openApp({ name:"vikram", web:5804 });
const p=app.page;
await shot(p,"vikram","01-start");
console.log(await p.locator("body").innerText());
console.log(await p.locator("input[type=file]").count());
await app.close();
