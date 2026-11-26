import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
await p.getByText("June 2012 - 2015").click();
await p.waitForTimeout(500);
await shot(p,"rohan","19a-dateclick");
console.log(await p.evaluate(()=>document.activeElement.tagName+"|"+(document.activeElement.value||"")));
await app.close();
