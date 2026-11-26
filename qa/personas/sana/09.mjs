import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
const t=(await p.locator("body").innerText());
const i=t.indexOf("Fill CPA percentage");
console.log(t.slice(i-80, t.indexOf("Yes, 4 years")));
await app.close();
