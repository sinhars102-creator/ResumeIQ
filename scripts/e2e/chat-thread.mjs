// Workspace conversation test (laptop and phone). Needs `npm run dev:all`. Run from the project folder: OUT=/tmp node scripts/e2e/chat-thread.mjs
import { chromium } from "playwright-core";
import fs from "fs";
const env = fs.readFileSync(".env.local", "utf8") + fs.readFileSync(".env", "utf8");
const ref = new URL(env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim()).host.split(".")[0];
const NOW = Date.now();
const session = { access_token: "fake.jwt.token", refresh_token: "r", token_type: "bearer", expires_in: 36000, expires_at: Math.floor(NOW / 1000) + 36000, user: { id: "00000000-0000-0000-0000-000000000001", email: "test@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
const resume = { name: "Asha Rao", title: "Product Manager", contact: "asha@example.com · Bengaluru", summary: "PM with 5 years.", experience: [{ company: "Acme", role: "PM", period: "2019-2023", bullets: ["Grew MAU by 40%", "Cut failures from 8% to 3%"] }], skills: ["SQL"], certifications: [], education: [] };
const sugg = { id: "s1", status: "pending", priority: "must", title: "Sharpen this bullet", why: "Clearer", where: "Acme · bullet 1", pin: 1, category: "experience", source: "job", edit: { target: "E0B0", op: "replace", after: "Grew monthly active users by 40%" }, before: "Grew MAU by 40%", target: "E0B0" };
const store = { activeId: "c1", chats: [{ id: "c1", title: "Test", resume, jd: "About the job ".repeat(30), job: { title: "PM", company: "X" }, baseScore: 50, suggestions: { s1: sugg }, queue: [], mode: "tailor", workspace: true, thread: [], messages: [{ id: "m1", role: "bot", text: "Hello" }], updatedAt: NOW }] };
const bodies = [];
async function run(label, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(([ref, session, store]) => { localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)); localStorage.setItem("riq_resume_llm_v1", JSON.stringify(store)); }, [ref, session, store]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let n = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const json = (obj) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(obj) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p === "/api/rllm/state") return json({ state: { chats: [] } });
    if (p === "/api/tailor/chat") { bodies.push(req.postDataJSON()); n++; await new Promise((r) => setTimeout(r, 700)); return json({ reply: n === 1 ? "Got it. Which role was that at?" : "Thanks, I've noted Amazon.", suggestions: [] }); }
    return route.continue();
  });
  await page.goto("http://localhost:5173/app/editor", { waitUntil: "networkidle" });
  const phone = viewport.width < 900;
  if (phone) await page.getByRole("button", { name: /Ask for a change/ }).first().click();
  const box = page.locator(phone ? ".ws-chatform textarea" : ".ws-askbox textarea");
  await box.fill("I led a team of 6 on a forecasting project");
  await box.press("Enter");
  await page.waitForTimeout(150);
  const typing = await page.locator(".ws-typing").count();
  await page.locator(".ws-bub-bot", { hasText: "Which role" }).waitFor({ timeout: 8000 });
  await box.fill("At Amazon");
  await box.press("Enter");
  await page.locator(".ws-bub-bot", { hasText: "noted Amazon" }).waitFor({ timeout: 8000 });
  const texts = await page.locator(".ws-bub").allInnerTexts();
  console.log(label, "| typing indicator while waiting:", typing > 0, "| bubbles:", JSON.stringify(texts.filter((t) => t.trim())));
  console.log(label, "| page errors:", errors.length ? errors : "none");
  await page.screenshot({ path: process.env.OUT + `/thread-${label}.png` });
  await browser.close();
}
await run("laptop", { width: 1280, height: 800 });
await run("phone", { width: 390, height: 844 });
console.log("history sent with the second message:", JSON.stringify(bodies[1].history));
