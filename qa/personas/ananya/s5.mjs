import { start, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.locator("input[type=file]").first().setInputFiles("/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/ananya/old-resume.pdf");
await page.waitForTimeout(20000);
await waitIdle(page);
await shot(page,"ananya","05-parsed");
console.log(await page.locator("body").innerText());
console.log(app.calls, app.log);
await app.close();
