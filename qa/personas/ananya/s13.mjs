import { start, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.waitForTimeout(2500);
const t=await page.locator("body").innerText();
for (const k of ["Mentored","self-serve sign-ups"]) { let i=-1; while((i=t.indexOf(k,i+1))>=0) console.log("---",k,"\n",t.slice(Math.max(0,i-200),i+300)); }
await app.close();
