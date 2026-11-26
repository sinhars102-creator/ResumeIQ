import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.getByRole("button",{name:/design & download/i}).click();
await p.waitForTimeout(2500);
await shot(p,"priya","17-design");
console.log((await p.locator("body").innerText()).slice(0,2500));
await app.close();
