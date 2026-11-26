import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const t = await app.page.locator("body").innerText();
console.log(t.slice(0,9000));
await app.close();
