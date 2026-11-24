// M8 follow-up: the chat page must send the sign-in token with job-description requests. Needs `npm run dev:all`. Run from the project folder.
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
const store = { activeId: "c1", chats: [{ id: "c1", title: "Test", resume, jd: "", job: null, baseScore: null, suggestions: {}, queue: [], mode: "tailor", messages: [{ id: "m1", role: "bot", text: "Hello" }], updatedAt: NOW }] };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
await ctx.addInitScript(([ref, session, store]) => {
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
  localStorage.setItem("riq_resume_llm_v1", JSON.stringify(store));
  window.__rzp = [];
  window.Razorpay = class { constructor(o) { this.o = o; window.__rzp.push(o); } on() {} open() { setTimeout(() => this.o.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" }), 50); } };
}, [ref, session, store]);
const page = await ctx.newPage();
const calls = []; const seen = [];
let entitled = false, used = 0;
await page.route("**/api/**", async (route) => {
  const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
  if (!p.startsWith("/api/")) return route.continue();
  calls.push(`${req.method()} ${p}${req.method() === "POST" ? " " + (req.postData() || "").slice(0, 80) : ""}`);
  const json = (obj, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(obj) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (p === "/api/tailor/suggest") { seen.push(req.headers()["authorization"] || "NONE"); return json({ jobTitle: "PM", company: "X", suggestions: [] }); }
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
const ta = page.locator("textarea").first();

await page.waitForTimeout(500);
const box = page.locator("textarea, [contenteditable=true]").first();
await box.fill("About the job. We need a product manager with SQL and stakeholder management experience for our logistics technology team. You will own the roadmap, work with engineering and operations, define metrics, run experiments, and communicate with senior leaders across the business every week.");
await page.keyboard.press("Enter");
await page.waitForTimeout(2500);
console.log("Authorization header seen by /api/tailor/suggest:", seen.length ? (seen[0].startsWith("Bearer ") ? "Bearer <token> sent" : seen[0]) : "request not made");
await browser.close();
