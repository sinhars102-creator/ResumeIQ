import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(1500);
for (const [n,d] of [["Grid","Section headings in a left column"],["Executive","Navy rule across"],["Minimal","Lots of white space"]]) {
  await p.getByText(d).first().click();
  await p.waitForTimeout(1500);
  await p.mouse.move(720,500); await p.mouse.wheel(0,3000); await p.waitForTimeout(800);
  await shot(p,"sana","15-"+n);
  await p.mouse.wheel(0,-4000); await p.waitForTimeout(300);
}
await app.close();
