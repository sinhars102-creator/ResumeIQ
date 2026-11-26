import { start, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.waitForTimeout(3000);
await page.getByRole("button",{name:"Design & download"}).click();
await page.waitForTimeout(2500);
await page.mouse.move(720,500);
await page.mouse.wheel(0,900); await page.waitForTimeout(800); await shot(page,"ananya","23a");
await page.mouse.wheel(0,900); await page.waitForTimeout(800); await shot(page,"ananya","23b");
await app.close();
