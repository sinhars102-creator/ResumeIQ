import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
p.on("dialog", d=>d.accept());
await p.getByText("+ Add education").click();
await p.keyboard.type("B.Com · University of Mumbai · 2010");
await p.getByRole("button",{name:"Save"}).click();
await p.waitForTimeout(800);
const removes = p.getByRole("button",{name:"Remove",exact:true});
console.log(await removes.count());
// order: Summary, Experience, Education, Skills, Certifications, Projects  (last two)
await removes.last().click(); await p.waitForTimeout(700);
await removes.last().click(); await p.waitForTimeout(700);
console.log(await removes.count());
await shot(p,"rohan","18-clean");
const t = await p.evaluate(()=>document.body.innerText);
const i=t.indexOf("EDUCATION"); console.log(t.slice(i,i+500));
await app.close();
