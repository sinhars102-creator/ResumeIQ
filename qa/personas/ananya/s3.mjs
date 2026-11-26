import { start, send, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.locator("input[type=file]").first().setInputFiles("/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/ananya/old-resume.pdf");
await page.waitForTimeout(2000);
await shot(page,"ananya","03-attached");
console.log(await page.locator("body").innerText());
await app.close();
