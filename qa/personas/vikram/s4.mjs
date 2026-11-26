import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name:"vikram", web:5804 });
const p=app.page;
const a=`National Sales Manager - Consumer Products
Company: Everbright Consumer Brands Ltd, Mumbai (FMCG, 4,500 crore turnover)

About the role
We are looking for a National Sales Manager to own our India revenue and drive profitable growth across general trade, modern trade and e-commerce. Reporting to the Chief Commercial Officer, you will lead a field organisation of regional sales heads and own the national P&L for the sales function.

Key responsibilities
- Own national revenue targets and deliver double-digit year-on-year growth
- Define and execute channel strategy across general trade, modern trade and distributor-led networks
- Lead, coach and develop regional sales managers and a field team of 40+`;
const b=`- Drive market expansion into new territories and under-penetrated states
- Build accurate sales forecasts and annual operating plans with finance and supply chain
- Own trade marketing budgets, pricing and promotion effectiveness
- Manage key national accounts and negotiate commercial terms
- Improve distributor ROI, receivables discipline and sales productivity

Requirements
- 12+ years in FMCG / consumer goods sales with at least 5 years leading multi-state teams
- MBA in Marketing or equivalent
- Proven record of revenue growth and P&L ownership
- Strong in forecasting, distributor management and commercial negotiation
- Experience with SAP and sales analytics tools is a plus
- Willingness to travel extensively`;
const box=p.locator("textarea").last();
await box.click();
await p.evaluate(()=>{const t=document.querySelector("textarea"); });
await box.fill("");
await p.keyboard.insertText(a);
await shot(p,"vikram","06-jd-part1-typed");
await p.keyboard.press("Enter");
await p.waitForTimeout(25000);
await shot(p,"vikram","07-jd-part1-sent");
console.log((await p.locator("body").innerText()).slice(-1500));
await app.close();
