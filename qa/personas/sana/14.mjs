import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
const msgs = [
 "The templates all look like generic consulting resumes to me. I want something more editorial with a deep, muted burgundy, not the bright pink or navy in the palette. Can you set that? And bold only the metrics, not whole role titles or degrees.",
 "Does a distinctive template like the Grid one with headings in a side column actually parse correctly in an ATS? Be honest. Also please keep my portfolio link visible and clickable.",
];
for (const m of msgs){
  const b = p.getByPlaceholder(/Message/).last();
  await b.click(); await b.fill(m); await p.keyboard.press("Enter");
  await p.waitForTimeout(25000);
}
await shot(p,"sana","16-chat");
const t=(await p.locator("body").innerText());
console.log(t.slice(t.indexOf("The templates all look")));
await app.close();
