import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name:"vikram", web:5804 });
const p=app.page;
const t=await p.locator("body").innerText();
const i=t.indexOf("All 16");
console.log(t.slice(i, i+9000));
await app.close();
