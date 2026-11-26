import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(3000);
await shot(p,"rohan","21-design");
console.log((await p.getByRole("button").allInnerTexts()).map(s=>s.trim()).filter(Boolean).join(" | "));
await app.close();
