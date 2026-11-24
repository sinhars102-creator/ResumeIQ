// M5 paywall browser test. Needs `npm run dev:all` running. Simulates the server replies and Razorpay, so no real payment.
// Run from the project folder: OUT=/tmp node scripts/e2e/paywall.mjs
import { chromium } from "playwright-core";
import fs from "fs";
const env = fs.readFileSync(".env.local", "utf8") + fs.readFileSync(".env", "utf8");
const url = (env.match(/^VITE_SUPABASE_URL=(.+)$/m) || [])[1]?.trim();
const ref = new URL(url).host.split(".")[0];
const NOW = Date.now();
const session = { access_token: "fake.jwt.token", refresh_token: "r", token_type: "bearer", expires_in: 36000, expires_at: Math.floor(NOW / 1000) + 36000, user: { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const resumeBase = { name: "Asha Rao", title: "Product Manager", contact: "asha@example.com · Bengaluru", summary: "PM with 5 years.", experience: [{ company: "Acme", role: "PM", period: "2019-2023", bullets: ["Grew MAU by 40%", "Cut failures from 8% to 3%"] }], skills: ["SQL"], certifications: [], education: [] };
const store = { activeId: "c1", chats: [{ id: "c1", title: "Test", resume: resumeBase, jd: "", job: null, baseScore: null, suggestions: {}, queue: [], mode: "improve", messages: [{ id: "m1", role: "bot", text: "Hello" }], updatedAt: NOW }] };


const resume = { ...resumeBase,
  education: [{ degree: "MBA", school: "IIM Bangalore", year: "2016", grade: "CGPA 8.4", location: "Bengaluru", details: ["Dean's list"] }],
  certifications: ["Certified Scrum Product Owner"],
  projects: [{ name: "Demand forecaster", period: "2022", bullets: ["Built a forecasting tool used by 12 regional teams"] }],
  achievements: ["Product of the Year 2023"], languages: ["English", "Hindi"], interests: ["Chess"],
  otherSections: [{ title: "Positions of Responsibility", items: ["Class representative, MBA 2016"] }],
};
const store2 = { ...store, chats: [{ ...store.chats[0], resume }] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
await ctx.addInitScript(([ref, session, store]) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  localStorage.setItem("riq_resume_llm_v1", JSON.stringify(store));
  window.Razorpay = class { constructor(o) { this.o = o; } on() {} open() { setTimeout(() => this.o.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" }), 50); } };
}, [ref, session, store2]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", async (route) => {
  const req = route.request(); const p = new URL(req.url()).pathname;
  const json = (obj) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(obj) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (p === "/api/rllm/state") return json({ state: { chats: [] } });
  if (p === "/api/downloads/status") return json({ allowed: true, plan: "dl10", remaining: 10, unlimited: false, expiresAt: null });
  if (p === "/api/downloads/complete") return json({ counted: true, status: { allowed: true, remaining: 9 } });
  return route.continue();
});
await page.goto("http://localhost:5173/app/editor", { waitUntil: "networkidle" });
console.log("on-screen resume shows extra sections:", await page.locator(".rl-paper, .ws-paper").first().innerText().then((t) => ["Projects", "Achievements", "Languages", "Positions of Responsibility"].every((h) => new RegExp(h, "i").test(t))).catch((e) => "n/a " + e.message));
await page.getByRole("button", { name: "Download PDF" }).first().click();
await page.getByText("Choose a template").waitFor({ timeout: 5000 });
await page.locator(".rl-tpl-preview img").first().waitFor({ timeout: 15000 });
console.log("template chips:", await page.locator(".rl-tpl-chip b").allInnerTexts());
console.log("content check line:", await page.locator(".rl-tpl-ok, .rl-modal .rl-warn").first().innerText());
await page.screenshot({ path: (process.env.OUT ?? ".") + "/templates-modern.png" });
await page.getByRole("radio", { name: /Classic/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: (process.env.OUT ?? ".") + "/templates-classic.png" });
console.log("chip subtitles (page counts):", await page.locator(".rl-tpl-chip small").allInnerTexts());
await page.getByRole("button", { name: /Continue with Classic/ }).click();
const dlP = page.waitForEvent("download", { timeout: 10000 });
await page.locator(".rl-modal").getByRole("button", { name: "Download PDF" }).click();
const dl = await dlP;
const file = (process.env.OUT ?? ".") + "/templates-download.pdf";
await dl.saveAs(file);
console.log("downloaded:", dl.suggestedFilename(), "| remembered template:", await page.evaluate(() => localStorage.getItem("riq_template")));
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
