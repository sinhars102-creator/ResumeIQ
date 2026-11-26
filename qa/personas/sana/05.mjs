import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
const answers = [
 "Yes, 4 years is right. Please keep it short and lead with the Zestly result, I don't want a long paragraph.",
 "No, we never ran a brand-lift study. We only had app orders and engagement numbers, so please don't claim brand awareness tracking.",
 "Yes, I did a quarterly spend and results review with our VP Marketing. But I don't have an ROI figure, so don't add one.",
];
for (let i=0;i<answers.length;i++){
  const ta = p.getByPlaceholder("Your answer").nth(i);
  await ta.click(); await ta.fill(answers[i]);
  await ta.locator("xpath=following-sibling::button").click();
  await p.waitForTimeout(20000);
  await shot(p,"sana","09-ans"+i);
}
await app.close();
