import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name:"vikram", web:5804 });
const p=app.page;
await p.getByRole("button",{name:/Design & download/i}).click();
await p.waitForTimeout(3000);
await shot(p,"vikram","16-design");
console.log((await p.locator("body").innerText()).slice(0,1500));
await app.close();
