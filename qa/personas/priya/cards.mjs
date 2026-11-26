import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "priya", web: 5803 });
const p = app.page;
const btns = p.getByRole("button",{name:/apply to resume/i});
console.log("apply buttons", await btns.count());
const t = await p.locator("body").innerText();
const i = t.indexOf("\n10\nSummary\nReframe summary for ops");
console.log(t.slice(i, i+6000).split("\n").filter(x=>x.trim()&&!/^(Apply to resume|Edit|Dismiss|↻ Another version)$/.test(x)).join("\n"));
await app.close();
