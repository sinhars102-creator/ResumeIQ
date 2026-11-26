import { start, shot } from "./lib.mjs";
const app = await start(); const page=app.page;
await page.waitForTimeout(3000);
await page.getByRole("button",{name:"Design & download"}).click();
await page.waitForTimeout(2000);
for (const n of ["Executive","Minimal"]) {
  await page.getByText(n,{exact:true}).first().click();
  await page.waitForTimeout(2500);
  await page.mouse.move(720,500); await page.mouse.wheel(0,900); await page.waitForTimeout(1500);
  await shot(page,"ananya","24-"+n);
  await page.mouse.wheel(0,-2000); await page.waitForTimeout(500);
}
await app.close();
