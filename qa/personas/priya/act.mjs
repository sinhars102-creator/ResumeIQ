import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
async function act(sug, name){
  const el = p.getByText(sug,{exact:true}).last();
  const card = el.locator('xpath=ancestor::*[.//button[contains(.,"Apply to resume") or contains(.,"Dismiss")]][1]');
  const b = card.getByRole("button",{name});
  try{ await b.first().click({timeout:4000}); console.log("ok",name,sug.slice(0,40)); }catch(e){ console.log("FAIL",name,sug.slice(0,40)); }
  await p.waitForTimeout(600);
}
await act("Operations Manager with 7 years in automotive manufacturing, driving Lean and Six Sigma process improvement, vendor management, capacity planning and weekly Power BI reviews. Basic SQL from a business analytics capstone on delivery delays.", /apply to resume/i);
await act("Drove Lean and Six Sigma process improvement initiatives that raised production efficiency by 14%", /apply to resume/i);
await act("Managed daily plant operations and production planning", /apply to resume/i);
await act("Managed vendor relationships and supplier delivery schedules", /apply to resume/i);
await act("Run weekly operational reviews, tracking operational metrics on Power BI dashboards", /apply to resume/i);
await act("Planned capacity and shift schedules for two assembly lines", /apply to resume/i);
await shot(p,"priya","08-applied");
console.log(await p.locator("body").innerText().then(t=>t.match(/\d+ of \d+ suggestions applied/)?.[0]));
await app.close();
