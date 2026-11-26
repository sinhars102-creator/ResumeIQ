import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(2500);
await shot(p,"sana","13-design");
console.log(await p.locator("body").innerText());
await app.close();
