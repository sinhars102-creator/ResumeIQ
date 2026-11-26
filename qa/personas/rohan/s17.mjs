import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
p.on("dialog", d=>d.accept());
for (const h of ["PROJECTS","CERTIFICATIONS"]) {
  const row = p.locator("div").filter({hasText: new RegExp("^"+h+"\\s*↑?\\s*↓?\\s*Rename\\s*Remove")}).last();
  try { await row.getByRole("button",{name:"Remove"}).click({timeout:3000}); await p.waitForTimeout(600);} catch(e){console.log("fail",h)}
}
await p.getByText("+ Add education").click({timeout:3000}).catch(e=>console.log("noadd"));
await p.waitForTimeout(700);
await shot(p,"rohan","17-clean");
await app.close();
