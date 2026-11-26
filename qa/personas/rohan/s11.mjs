import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
const t = await p.evaluate(()=>document.body.innerText);
console.log(t.slice(t.indexOf("EDUCATION")-100, t.indexOf("EDUCATION")+400));
await p.getByText("EDUCATION",{exact:true}).first().scrollIntoViewIfNeeded().catch(()=>{});
await shot(p,"rohan","12-edu-empty");
await app.close();
