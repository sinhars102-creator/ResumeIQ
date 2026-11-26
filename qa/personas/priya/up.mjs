import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.setInputFiles('input[type=file]', "/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/priya/old.pdf");
await p.waitForTimeout(5000);
for (let i=0;i<20;i++){ await p.waitForTimeout(3000); }
await shot(p,"priya","03-upload");
console.log((await p.locator("body").innerText()).slice(-3000));
console.log(JSON.stringify(app.calls));
await app.close();
