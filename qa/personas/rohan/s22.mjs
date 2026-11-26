import { openApp, shot } from "../harness.mjs";
const [,, tpl, label] = process.argv;
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(1500);
await p.getByText(tpl,{exact:true}).first().click();
await p.waitForTimeout(2000);
const dlg = p.locator('[role=dialog]').first();
const sc = await p.evaluateHandle(()=>{ let best=null; document.querySelectorAll("*").forEach(e=>{ if(e.scrollHeight>e.clientHeight+50 && getComputedStyle(e).overflowY.match(/auto|scroll/) && e.clientHeight>300 && (!best||e.scrollHeight>best.scrollHeight)) best=e;}); return best;});
for (let k=0;k<4;k++){ await shot(p,"rohan",`${label}-${k}`); await sc.evaluate(e=>e.scrollBy(0,650)); await p.waitForTimeout(700);}
await app.close();
