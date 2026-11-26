import { openApp, shot } from "../harness.mjs";
const app = await openApp({ name: "rohan", web: 5802 });
const p = app.page;
await p.getByText("+ Add section").scrollIntoViewIfNeeded();
await p.getByText("+ Add section").click();
await p.waitForTimeout(800);
await shot(p,"rohan","14-addsection");
await app.close();
