#!/usr/bin/env node
/**
 * Checks that the Razorpay webhook endpoint is reachable and that its secret matches, without moving any money.
 *
 *   node scripts/test-webhook.mjs                       # the live site
 *   node scripts/test-webhook.mjs http://localhost:3001 # your own computer
 *
 * It reads RAZORPAY_WEBHOOK_SECRET from .env (never printed), then sends three harmless requests:
 *   1. no signature          -> expect 400
 *   2. a wrong signature     -> expect 400
 *   3. a correctly signed "payment.failed" event -> expect 200 "ignored" (proves the secret on the server matches yours)
 * A real captured payment is the only way to test the "plan granted" step: pay ₹79 yourself, then refund it.
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || "https://www.myresumeiq.io").replace(/\/$/, "");
const url = `${base}/api/razorpay-webhook`;

let secret = "";
try {
  const m = readFileSync(resolve(here, "../.env"), "utf8").match(/^RAZORPAY_WEBHOOK_SECRET=(.+)$/m);
  secret = (m?.[1] || "").trim();
} catch { /* handled below */ }
if (!secret) { console.error("RAZORPAY_WEBHOOK_SECRET is not set in .env"); process.exit(2); }

const body = JSON.stringify({ event: "payment.failed", payload: {} });
const sign = (b) => createHmac("sha256", secret).update(b).digest("hex");
async function post(label, expect, signature) {
  let line;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(signature ? { "x-razorpay-signature": signature } : {}) }, body });
    const text = (await r.text()).slice(0, 90);
    line = `${r.status === expect ? "PASS" : "FAIL"}  ${label}: got ${r.status}, expected ${expect}  ${text}`;
    if (r.status !== expect) process.exitCode = 1;
    if (r.status === 503) line += "\n      -> the server has no RAZORPAY_WEBHOOK_SECRET (set it in Vercel and redeploy)";
    if (r.status === 400 && expect === 200) line += "\n      -> the secret on the server is different from the one in your .env";
    if (r.status === 404) line += "\n      -> this address has no webhook route: the new code isn't deployed yet";
  } catch (e) { line = `FAIL  ${label}: couldn't reach ${url} (${e.message})`; process.exitCode = 1; }
  console.log(line);
}
console.log(`Testing ${url}\n`);
await post("no signature      ", 400);
await post("wrong signature   ", 400, "deadbeef");
await post("signed correctly  ", 200, sign(body));
