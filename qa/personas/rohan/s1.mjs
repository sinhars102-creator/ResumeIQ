import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
await shot(app.page,"rohan","01-start");
console.log((await app.page.getByRole("button").allInnerTexts()).map(t=>t.trim()).filter(Boolean).join(" | "));
await app.close();
