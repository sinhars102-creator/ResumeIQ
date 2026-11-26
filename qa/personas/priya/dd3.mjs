import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.getByRole("button",{name:/design & download/i}).click();
await p.waitForTimeout(1500);
for (const [n,label] of [["Executive","exec"],["Sidebar","sidebar"],["Modern","modern"]]) {
  await p.locator("[role=dialog]").getByText(n,{exact:true}).first().click();
  await p.waitForTimeout(1500);
  await p.locator('[role=dialog]').first().evaluate(e=>{[...e.querySelectorAll("*")].forEach(x=>{if(x.scrollHeight>x.clientHeight+50&&getComputedStyle(x).overflowY!="visible") x.scrollTop=x.scrollHeight})});
  await p.waitForTimeout(600);
  await shot(p,"priya","19-"+label);
  const pv = await p.locator('[role=dialog] [class*=preview], [role=dialog] img, [role=dialog] canvas, [role=dialog] iframe').count();
  console.log(n, "preview elements", pv);
}
await app.close();
