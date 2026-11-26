import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
await p.getByText("✎").nth(4).click();
await p.waitForTimeout(500);
const ta = p.locator("textarea").filter({hasText:/Skilled in capacity/}).first();
console.log(await ta.count());
if(await ta.count()){
await ta.click(); await p.keyboard.press("Meta+A");
await p.keyboard.insertText("Operations Manager with 7 years in automotive manufacturing, leading a shift of about 30 and driving Lean/Six Sigma improvements that raised efficiency 14%. Experienced in capacity planning, vendor management and weekly Power BI operational reviews, with basic SQL. Now moving into business operations and programme management in e-commerce and technology.");
await p.getByRole("button",{name:"Save"}).click();
await p.waitForTimeout(800);}
await shot(p,"priya","16-summary-final");
const t = await p.locator("body").innerText();
console.log(t.slice(t.indexOf("SUMMARY"), t.indexOf("EXPERIENCE")));
await app.close();
