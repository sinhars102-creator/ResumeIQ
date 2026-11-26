import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
const t = await p.evaluate(()=>document.body.innerText);
const i=t.indexOf("\n18\n"); console.log(t.slice(i-300,i+1200));
await app.close();
