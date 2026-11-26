import { openApp, shot } from "../harness.mjs";
const [,, label, ...rest] = process.argv;
const msg = rest.join(" ");
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
if (msg) {
  const box = p.getByRole("textbox").last();
  await box.click();
  await p.keyboard.insertText(msg);
  await p.keyboard.press("Enter");
}
await p.waitForTimeout(4000);
for (let i=0;i<30;i++){ // wait until quiet
  const busy = await p.locator('[class*="typing"], [aria-busy="true"], [class*="dots"]').count();
  if(!busy && i>2) break; await p.waitForTimeout(2000);
}
await p.waitForTimeout(2500);
await shot(p,"priya",label,{full:false});
console.log((await p.locator("main, body").first().innerText()).slice(-3500));
console.log("calls",JSON.stringify(app.calls));
await app.close();
