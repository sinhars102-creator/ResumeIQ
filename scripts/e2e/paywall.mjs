// M5 paywall browser test. Needs `npm run dev:all` running. Simulates the server replies and Razorpay, so no real payment.
// Run from the project folder: OUT=/tmp node scripts/e2e/paywall.mjs
import { chromium } from "playwright-core";
import fs from "fs";
const env = fs.readFileSync(".env.local", "utf8") + fs.readFileSync(".env", "utf8");
const url = (env.match(/^VITE_SUPABASE_URL=(.+)$/m) || [])[1]?.trim();
const ref = new URL(url).host.split(".")[0];
const NOW = Date.now();
const session = { access_token: "fake.jwt.token", refresh_token: "r", token_type: "bearer", expires_in: 36000, expires_at: Math.floor(NOW / 1000) + 36000, user: { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const resume = { name: "Asha Rao", title: "Product Manager", contact: "asha@example.com · Bengaluru", summary: "PM with 5 years.", experience: [{ company: "Acme", role: "PM", period: "2019-2023", bullets: ["Grew MAU by 40%", "Cut failures from 8% to 3%"] }], skills: ["SQL"], certifications: [], education: [] };
const store = { activeId: "c1", chats: [{ id: "c1", title: "Test", resume, jd: "", job: null, baseScore: null, suggestions: {}, queue: [], mode: "improve", messages: [{ id: "m1", role: "bot", text: "Hello" }], updatedAt: NOW }] };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
await ctx.addInitScript(([ref, session, store]) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  localStorage.setItem("riq_resume_llm_v1", JSON.stringify(store));
  window.__rzp = [];
  window.Razorpay = class { constructor(o) { this.o = o; window.__rzp.push(o); } on() {} open() { setTimeout(() => this.o.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" }), 50); } };
}, [ref, session, store]);
const page = await ctx.newPage();
const calls = [];
let entitled = false, used = 0;
await page.route("**/api/**", async (route) => {
  const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
  if (!p.startsWith("/api/")) return route.continue();
  calls.push(`${req.method()} ${p}${req.method() === "POST" ? " " + (req.postData() || "").slice(0, 80) : ""}`);
  const json = (obj, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(obj) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (p === "/api/rllm/state") return json({ state: { chats: [] } });
  if (p === "/api/downloads/status") return json(entitled ? { allowed: used < 1, plan: "dl1", remaining: 1 - used, unlimited: false, expiresAt: null } : { allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null });
  if (p === "/api/create-order") return json({ order_id: "order_1", amount: 7900, currency: "INR", key_id: "rzp_test", name: "1 resume download" });
  if (p === "/api/downloads/purchase") { entitled = true; return json({ purchased: "dl1", allowed: true, plan: "dl1", remaining: 1, unlimited: false, expiresAt: null }); }
  if (p === "/api/downloads/complete") { used = 1; return json({ counted: true, status: { allowed: false, plan: null, remaining: 0, unlimited: false, expiresAt: null } }); }
  return route.continue();
});
const errors = []; const consoleMsgs = []; const S0 = process.env.OUT ?? ".";
page.on("console", (m) => consoleMsgs.push(m.type() + ": " + m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173/app/editor", { waitUntil: "networkidle" });
const chip = page.getByRole("button", { name: "Download PDF" }).first();
console.log("download chip visible:", await chip.isVisible().catch(() => false));
if (!(await chip.isVisible().catch(() => false))) { console.log(await page.locator("body").innerText().then((t) => t.slice(0, 400))); }
await chip.click();
await page.getByRole("button", { name: /Continue with/ }).click();
await page.getByText("Choose how many PDFs you need").waitFor({ timeout: 5000 });
console.log("paywall shown: true; plans:", await page.locator(".rl-plan").count());
await page.screenshot({ path: `${process.env.OUT ?? "."}/m5-paywall.png` });
await page.locator(".rl-plan").nth(0).click();
await page.getByRole("button", { name: /Pay ₹79/ }).click();
await page.locator(".rl-modal").getByRole("button", { name: "Download PDF" }).waitFor({ timeout: 5000 });
console.log("after payment: ready state with Download button");
const dlP = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
await page.locator(".rl-modal").getByRole("button", { name: "Download PDF" }).click();
await page.waitForTimeout(1500);
console.log("modal text after click:", (await page.locator(".rl-modal").innerText()).replace(/\n+/g, " | "));
console.log("errors:", errors);
console.log("consoles:", consoleMsgs.slice(-5));
const dl = await dlP;
if (!dl) { await page.screenshot({ path: S0 + "/m5-after.png" }); process.exit(1); }
console.log("downloaded file:", dl.suggestedFilename());
await page.getByText("Your PDF has been saved").waitFor({ timeout: 5000 });
console.log("done state shown");
const dl2P = page.waitForEvent("download", { timeout: 8000 });
await page.getByRole("button", { name: /Download again/ }).click();
await dl2P;
console.log("second download ok; calls:");
console.log(calls.filter((c) => c.includes("downloads") || c.includes("create-order")).join("\n"));
console.log("page errors:", errors.length ? errors : "none");
await browser.close();
