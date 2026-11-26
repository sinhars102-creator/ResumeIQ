import { openApp, shot, savePdfDownload } from "../harness.mjs";
const app = await openApp({ name: "sana", web: 5805 });
const p = app.page;
await shot(p,"sana","19-state");
console.log((await p.locator("button").allInnerTexts()).join("|"));
await app.close();
