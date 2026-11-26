import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.getByText("✎").nth(3).click().catch(()=>{});
await p.waitForTimeout(600);
await shot(p,"priya","15-pencil");
console.log(await p.locator("textarea").count());
await app.close();
