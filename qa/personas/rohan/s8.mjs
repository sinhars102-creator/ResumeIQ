import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
async function act(startsWith, btn){
  const card = p.locator("div").filter({hasText: new RegExp("^"+startsWith)}).filter({has: p.getByRole("button",{name:btn})}).last();
  await card.getByRole("button",{name:btn}).first().click(); await p.waitForTimeout(600);
}
await act("16Meridian","Apply to resume");
await act("17Education","Apply to resume");
await p.waitForTimeout(800);
await shot(p,"rohan","09-edu");
const t = await p.evaluate(()=>document.querySelector("main")?.innerText||document.body.innerText);
console.log(t.split("EDUCATION")[1]?.slice(0,500));
await app.close();
