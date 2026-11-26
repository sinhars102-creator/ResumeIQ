import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.getByText(/Skilled in capacity planning/).first().click();
await p.waitForTimeout(800);
await shot(p,"priya","13-edit");
console.log(await p.locator("textarea").count(), await p.locator("[contenteditable=true]").count());
await app.close();
