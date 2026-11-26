import { start, waitCall, waitIdle, shot } from "./lib.mjs";
import fs from "node:fs";
const app = await start(); const page=app.page;
await page.waitForTimeout(3000);
const card=(txt)=>page.locator(`text=${txt}`).first().locator("xpath=ancestor::div[.//button[normalize-space()='Dismiss'] or .//textarea][1]");
async function answer(txt, ans){
  const c=card(txt); const ta=c.locator("textarea").first(); await ta.scrollIntoViewIfNeeded(); await ta.fill(ans);
  const p=waitCall(page); await c.getByRole("button",{name:"Send"}).click(); await p;
}
await answer("Counting your APM role from Aug 2018","No. I'd rather keep it at 6 years. The APM role was a junior support role, so I count my real PM experience from 2019 onwards. Please don't say 7.");
await shot(page,"ananya","18a");
await answer("Since when have you mentored","About two years, since early 2023. They never reported to me. I didn't do their reviews, goals or hiring, just mentoring on discovery and prioritisation, and I reviewed their PRDs.");
await shot(page,"ananya","18b");
const t=await page.locator("body").innerText(); fs.writeFileSync("t18.txt",t);
console.log(t.slice(t.indexOf("All "), t.indexOf("All ")+3500));
await app.close();
