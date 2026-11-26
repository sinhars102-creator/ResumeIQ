import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "ananya", web: 5801, device: "laptop" });
await shot(app.page, "ananya", "01-start");
console.log(await app.page.locator("body").innerText());
console.log(await app.page.locator("button, input, textarea").evaluateAll(e=>e.map(x=>x.tagName+":"+(x.innerText||x.placeholder||x.ariaLabel||x.type||"").slice(0,40))));
await app.close();
