import { openApp, shot } from "../harness.mjs";
export async function start(){ return await openApp({ name:"ananya", web:5801, device:"laptop" }); }
export async function send(page, text){
  const ta = page.locator("textarea").first();
  await ta.click(); await ta.fill(text); await page.keyboard.press("Enter");
}
export async function waitIdle(page, ms=120000){
  await page.waitForTimeout(8000);
  const t0=Date.now(); let last="", stable=0;
  while(Date.now()-t0<ms){ await page.waitForTimeout(3000); const b=await page.locator("body").innerText(); if(b===last){stable++; if(stable>=4)break;} else {stable=0; last=b;} }
}
export {shot};
export async function waitCall(page, ms=180000){
  try{ await page.waitForResponse(r=>/\/api\/(tailor|llm)/.test(r.url()), {timeout:ms}); }catch(e){}
  await page.waitForTimeout(6000);
}
