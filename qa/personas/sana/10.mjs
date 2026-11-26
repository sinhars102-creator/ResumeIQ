import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
// dismiss stale duplicates #1 and #4
for (const re of [/Sharpen the summary/, /Quantify the cut in cost/]) {
  const card = p.locator("div").filter({ hasText: re }).filter({ has: p.getByRole("button",{name:"Dismiss"}) }).last();
  await card.getByRole("button",{name:"Dismiss"}).first().click(); await p.waitForTimeout(800);
}
for (let k=0;k<8;k++){
  const b = p.getByRole("button",{name:"Apply to resume"});
  if (!(await b.count())) break;
  await b.first().click(); await p.waitForTimeout(1000);
}
await shot(p,"sana","12-applied");
const t=(await p.locator("body").innerText());
console.log(t.slice(0,3500));
await app.close();
