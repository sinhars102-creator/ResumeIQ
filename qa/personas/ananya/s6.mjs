import { start, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.getByRole("button",{name:/^Improve my resume/}).last().click();
await waitIdle(page);
await shot(page,"ananya","06-improve");
const t=await page.locator("body").innerText(); console.log(t.slice(t.indexOf("What would you like")));
await app.close();
