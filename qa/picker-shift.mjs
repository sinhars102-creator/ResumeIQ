import { chromium } from "playwright-core";
const browser = await chromium.launch();
const W = +(process.env.W || 1280);
const page = await browser.newPage({ viewport: { width: W, height: W < 600 ? 844 : 1000 }, hasTouch: W < 600 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173/qa/picker.html");
await page.waitForSelector(".rl-tpl-chip");
// Positions of everything on the screen, to compare before / after previews load and after a design change.
const snap = () => page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
  return {
    chips: [...document.querySelectorAll(".rl-tpl-chip")].map(r),
    details: r(document.querySelector(".rl-dz-box")),
    status: r(document.querySelector(".rl-tpl-status")),
    preview: r(document.querySelector(".rl-tpl-preview")),
    button: r(document.querySelector("#go")),
    doc: document.documentElement.scrollHeight,
  };
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const first = await snap();
// wait for the previews (page counts appear on the cards)
await page.waitForFunction(() => document.querySelectorAll(".rl-tpl-pages").length && [...document.querySelectorAll(".rl-tpl-pages")].every((e) => /page/.test(e.textContent)), null, { timeout: 90000 });
await page.waitForFunction(() => document.querySelector(".rl-tpl-preview img"), null, { timeout: 30000 });
const loaded = await snap();
console.log("1. loading -> loaded           :", same(first, loaded) ? "no shift" : "SHIFT\n   before " + JSON.stringify(first) + "\n   after  " + JSON.stringify(loaded));
// change a design option; sample the layout repeatedly while the preview rebuilds
await page.getByRole("radio", { name: "Serif", exact: true }).dispatchEvent("click"); // the harness page itself does not scroll on a phone, so click without scrolling
const during = [];
for (let i = 0; i < 12; i++) { during.push(await snap()); await page.waitForTimeout(150); }
await page.waitForFunction(() => !document.querySelector(".rl-tpl-preview.is-updating"), null, { timeout: 60000 });
const after = await snap();
const shifted = during.some((d) => !same(d, loaded)) || !same(after, loaded);
console.log("2. design change (12 samples)  :", shifted ? "SHIFT" : "no shift");
if (shifted) { const bad = [...during, after].find((d) => !same(d, loaded)); console.log("   loaded", JSON.stringify(loaded), "\n   moved ", JSON.stringify(bad)); }
// switch template and sample while it rebuilds (compared with the layout after the design change)
await page.getByRole("radio", { name: /^Grid/ }).dispatchEvent("click");
const baseline = after;
const during2 = [];
for (let i = 0; i < 12; i++) { during2.push(await snap()); await page.waitForTimeout(150); }
const shifted2 = during2.some((d) => !same(d, baseline));
console.log("3. template change (12 samples):", shifted2 ? "SHIFT" : "no shift");
if (shifted2) { const bad = during2.find((d) => !same(d, baseline)); console.log("   before", JSON.stringify(baseline), "\n   moved ", JSON.stringify(bad)); }
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await page.screenshot({ path: `qa/picker-${W}.png`, fullPage: false });
await browser.close();
