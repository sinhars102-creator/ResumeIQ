import { start, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
for(let i=0;i<20;i++){ await page.waitForTimeout(6000); if(await page.getByText(/Tailoring/).count()) break; }
await shot(page,"ananya","16-tailor");
const t=await page.locator("body").innerText(); console.log(t.slice(0,600)); console.log(t.slice(-900));
await app.close();
