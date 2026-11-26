import { start, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.getByRole("button",{name:/^Improve my resume/}).last().click();
await waitIdle(page, 150000);
await shot(page,"ananya","08-improve");
const t=await page.locator("body").innerText(); console.log(t.slice(t.lastIndexOf("Improve my resume\n")));
console.log(app.calls);
await app.close();
