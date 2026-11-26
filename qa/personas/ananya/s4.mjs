import { start, waitIdle, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await waitIdle(page);
await shot(page,"ananya","04-after-upload");
console.log(await page.locator("body").innerText());
await app.close();
