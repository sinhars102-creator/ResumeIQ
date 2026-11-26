import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805, device: "laptop" });
await shot(app.page, "sana", "01-start");
console.log(await app.page.locator("body").innerText());
await app.close();
