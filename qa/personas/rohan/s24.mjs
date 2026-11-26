import { openApp, shot } from "../harness.mjs";
import { savePdfDownload } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
await p.getByRole("button",{name:/Design & download/}).click();
await p.waitForTimeout(1500);
await p.getByText("Executive",{exact:true}).first().click(); await p.waitForTimeout(800);
for (const t of ["Serif","Large","Airy"]) { await p.getByText(t,{exact:true}).first().click(); await p.waitForTimeout(900);}
await p.mouse.move(720,500); await p.mouse.wheel(0,700); await p.waitForTimeout(800);
await p.mouse.click(706,314); await p.waitForTimeout(1200); // black
await shot(p,"rohan","24a-settings");
await p.mouse.wheel(0,600); await p.waitForTimeout(800); await shot(p,"rohan","24b-preview");
await p.mouse.wheel(0,700); await p.waitForTimeout(800); await shot(p,"rohan","24c-preview2");
await p.mouse.wheel(0,1500); await p.waitForTimeout(800); await shot(p,"rohan","24d-bottom");
console.log((await p.getByRole("button").allInnerTexts()).slice(-8).join(" | "));
await app.close();
