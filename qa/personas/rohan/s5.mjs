import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
const t = await p.evaluate(()=>document.body.innerText);
console.log(t.slice(t.indexOf("All 9")));
await app.close();
