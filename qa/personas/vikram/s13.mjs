import { openApp, shot } from "../harness.mjs";
let app = await openApp({ name:"vikram", web:5804 });
let p=app.page;
const b=p.getByRole("button",{name:/Apply to resume/i});
console.log(await b.count());
await b.last().click(); await p.waitForTimeout(1000);
await b.last().click(); await p.waitForTimeout(1500);
await shot(p,"vikram","23-applied-both");
let t=await p.locator("body").innerText();
console.log(t.match(/(Sales leader|Launched 3)[^\n]*/g));
await app.close();
// phone
app = await openApp({ name:"vikram", web:5804, device:"phone" });
p=app.page; await p.waitForTimeout(2000);
await shot(p,"vikram","24-phone",{full:false});
await p.mouse.wheel(0,900); await p.waitForTimeout(500);
await shot(p,"vikram","25-phone-scroll");
await app.close();
