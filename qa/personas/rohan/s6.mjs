import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
const t = await p.evaluate(()=>document.body.innerText);
console.log(t.slice(0,200));
console.log(await p.getByRole("button",{name:/^(Apply to resume|Apply all ready)/}).count());
await shot(p,"rohan","06-state");
await app.close();
