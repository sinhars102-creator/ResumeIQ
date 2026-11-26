// Helpers for the persona bots. Import from a script that lives anywhere under qa/personas/<name>/:
//   import { openApp, shot, textToPdf, savePdfDownload } from "../harness.mjs";
//
// openApp() opens the app in a PERSISTENT browser profile, so the chat, the resume and the sign-in survive between your scripts
// (each script run is a new process; the app restores your chat from the browser's storage, as it would for a real person).
// You start signed in as a test user (real email sign-in is not possible here). Payments and the real database are not connected.
import { chromium, devices } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas";

/** { name, web, api, device: "laptop" | "phone" } -> { ctx, page, log, close } */
export async function openApp({ name, web, device = "laptop", email }) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "screens"), { recursive: true });
  const base = device === "phone" ? devices["iPhone 14"] : { viewport: { width: 1440, height: 900 } };
  const ctx = await chromium.launchPersistentContext(path.join(dir, "profile"), { headless: true, acceptDownloads: true, ...base });
  const user = { id: "00000000-0000-0000-0000-0000000000aa", email: email || `${name}@example.com`, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const session = { access_token: "fake.jwt.token", refresh_token: "r", token_type: "bearer", expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user };
  await ctx.addInitScript(([s]) => {
    localStorage.setItem("sb-qafake-auth-token", JSON.stringify(s));
    localStorage.setItem("riq_cookie_ok", "1");
  }, [session]);
  await ctx.route("**/*.supabase.co/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const calls = [];
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    // The real server answers the AI calls (resume reading, suggestions, chat). Everything else is simulated.
    if (p.startsWith("/api/tailor") || p.startsWith("/api/llm")) return route.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (p === "/api/rllm/state") return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ state: { chats: [] } }) });
    if (p.startsWith("/api/downloads/status")) return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ allowed: true, plan: "unl", remaining: null, unlimited: true, expiresAt: null }) });
    return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: '{"error":"not connected in this test"}' });
  });
  const log = [];
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && log.push(`console: ${m.text().slice(0, 200)}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/tailor") || u.pathname.startsWith("/api/llm")) calls.push({ path: u.pathname, status: r.status() });
  });
  await page.goto(`http://127.0.0.1:${web}/app/editor`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return {
    ctx,
    page,
    log,
    calls,
    async close() {
      if (log.length) fs.appendFileSync(path.join(dir, "console.log"), log.join("\n") + "\n");
      await ctx.close();
    },
  };
}

/** A screenshot of what is on screen now, saved as <persona>/screens/<label>.png (open it with the Read tool). Returns the path. */
export async function shot(page, persona, label, { full = false } = {}) {
  const dir = path.join(ROOT, persona, "screens");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(label).replace(/[^a-z0-9-_]/gi, "_")}.png`);
  await page.screenshot({ path: file, fullPage: full });
  return file;
}

/**
 * Writes `text` as a plain PDF, line by line, exactly as given (to make the "old resume" you upload, with whatever
 * formatting quirks your persona's resume has). Needs no app code.
 */
export async function textToPdf(text, outPath) {
  const { jsPDF } = await import("/Users/rahulsinha/ResumeIQ/node_modules/jspdf/dist/jspdf.node.min.js");
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 15;
  for (const raw of String(text).split("\n")) {
    for (const line of doc.splitTextToSize(raw || " ", 180)) {
      if (y > 282) { doc.addPage(); y = 15; }
      doc.text(line, 15, y);
      y += 4.8;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
  return outPath;
}

/**
 * Runs `trigger()` (the click that downloads the PDF) and saves the file. Returns { file, pages, text }.
 * Open `file` page 1 as an image with:  sips -s format png <file> --out <png>   then Read the png.
 */
export async function savePdfDownload(page, name, trigger) {
  const dir = path.join(ROOT, name, "downloads");
  fs.mkdirSync(dir, { recursive: true });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), trigger()]);
  const file = path.join(dir, `${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  const pdfjs = await import("/Users/rahulsinha/ResumeIQ/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(" "));
  return { file, pages: doc.numPages, text: pages };
}
