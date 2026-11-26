import { start, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.waitForTimeout(3000);
await page.getByRole("button",{name:"Design & download"}).click();
await page.waitForTimeout(2500);
const dlg=page.getByRole("dialog").first();
const sc = await page.evaluateHandle(()=>{const d=document.querySelector('[role=dialog]'); let best=d; d.querySelectorAll('*').forEach(e=>{if(e.scrollHeight>e.clientHeight+50 && getComputedStyle(e).overflowY!='visible') best=e}); return best;});
for (const [i,y] of [[1,700],[2,1400],[3,2100]]) { await sc.evaluate((e,y)=>e.scrollTo(0,y),y); await page.waitForTimeout(800); await shot(page,"ananya","22-dlg"+i); }
await app.close();
