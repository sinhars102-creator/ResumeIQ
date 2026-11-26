import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name:"vikram", web:5804 });
const p=app.page;
await shot(p,"vikram","04-restored");
await p.getByRole("button",{name:/Tailor it to a job/i}).last().click();
await p.waitForTimeout(3000);
await shot(p,"vikram","05-tailor-click");
console.log((await p.locator("body").innerText()).slice(-900));
await app.close();
