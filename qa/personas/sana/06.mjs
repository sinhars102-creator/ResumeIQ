import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
const t = await p.locator("body").innerText();
console.log(t.split("To review")[1]);
await app.close();
