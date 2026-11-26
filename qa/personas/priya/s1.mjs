import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
console.log((await app.page.getByRole("button").allInnerTexts()).map(t=>t.trim()).filter(Boolean).join(" | "));
console.log((await app.page.getByRole("textbox").count()), await app.page.locator("body").innerText().then(t=>t.slice(0,800)));
await shot(app.page,"priya","01-start");
await app.close();
