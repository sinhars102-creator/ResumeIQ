import { start, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await waitIdle(page);
await shot(page,"ananya","07-improve");
const t=await page.locator("body").innerText(); console.log(t.slice(t.indexOf("Improve my resume\n\nImprove")));
await app.close();
