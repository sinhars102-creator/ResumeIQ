import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
const t = await p.evaluate(()=>document.body.innerText);
console.log(t.match(/\d+ of \d+ suggestions applied/)?.[0]);
const i=t.indexOf("Orbit"); console.log(t.slice(i,i+500));
await app.close();
