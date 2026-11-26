import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(1500);
for (const n of ["Classic","Grid"]) {
  await p.getByText(n,{exact:true}).first().click();
  await p.waitForTimeout(1500);
  await shot(p,"sana","14-"+n);
  await p.mouse.move(720,500); await p.mouse.wheel(0,2000); await p.waitForTimeout(800);
  await shot(p,"sana","14-"+n+"-scrolled");
  await p.mouse.wheel(0,-3000);
}
await app.close();
