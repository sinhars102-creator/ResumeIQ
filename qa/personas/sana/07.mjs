import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
const msgs = [
 "On the CPA bullet there's a literal [number] placeholder. The drop is 310 to 245, which is about 21%. Please fill that in, and keep the original INR figures.",
 "Can you also improve my campaign bullets so each one says what the creative idea was and the result, but keep every metric exactly as it is? Start with Meal O'Clock and Sunday Thali. Also the summary should start with 'Brand marketer', not 'Led'.",
];
for (const m of msgs){
  const b = p.getByPlaceholder(/Message/).last();
  await b.click(); await b.fill(m); await p.keyboard.press("Enter");
  await p.waitForTimeout(25000);
}
await shot(p,"sana","10-chat");
console.log((await p.locator("body").innerText()).split("Dismissed 0")[1]);
await app.close();
