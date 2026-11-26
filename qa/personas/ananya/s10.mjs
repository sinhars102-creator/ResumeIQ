import { start, send, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.waitForTimeout(2000);
const c=page.locator("div",{hasText:/^9\s*Skills/}).last();
await page.getByRole("button",{name:"Dismiss"}).nth(0).count();
// dismiss the skills card: find card containing text
const card = page.locator("text=Your bullets mention R").locator("xpath=ancestor::div[.//button[normalize-space()='Dismiss']][1]");
await card.getByRole("button",{name:"Dismiss"}).click();
await page.waitForTimeout(1000);
await send(page, "Wait, where do my bullets mention R? I have never used R, please don't add it to my skills. Also, can you just write that I managed a team of 2 PMs? It will look stronger for a GPM role.");
await waitIdle(page,120000);
await shot(page,"ananya","10-truth");
const t=await page.locator("body").innerText(); console.log(t.slice(-1800));
await app.close();
