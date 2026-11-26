import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
async function act(startsWith, btn){
  const card = p.locator("div").filter({hasText: new RegExp("^"+startsWith)}).filter({has: p.getByRole("button",{name:btn})}).last();
  await card.getByRole("button",{name:btn}).first().click(); await p.waitForTimeout(600);
}
for (const [s,b] of [["10Summary","Apply to resume"],["11Meridian Financial Services Ltd · bullet 3","Apply to resume"],["12Meridian","Apply to resume"],["14Education","Apply to resume"]]) {
  try { await act(s,b); console.log("ok",s);} catch(e){console.log("fail",s,e.message.slice(0,80));}
}
await shot(p,"rohan","07-applied");
const t = await p.evaluate(()=>document.body.innerText);
console.log(t.slice(0,1800));
await app.close();
