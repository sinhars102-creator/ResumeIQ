import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const t = await app.page.locator("body").innerText();
const i = t.lastIndexOf("Something like Program");
console.log(t.slice(i, i+5000));
await app.close();
