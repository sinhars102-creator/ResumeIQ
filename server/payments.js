/**
 * Razorpay Standard Checkout for the landing page's one-time packs.
 *
 *   POST /api/create-order    { plan } → a Razorpay order for that plan's price: { order_id, amount, currency, key_id }
 *   POST /api/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature } → { verified: true }
 *
 * Prices live here, not in the browser: the client names a plan and the server sets the amount.
 * Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET; the secret never leaves the server.
 */
import { createHmac, timingSafeEqual } from "crypto";
import Razorpay from "razorpay";
import { DOWNLOAD_PLANS, isDownloadPlan, entitlementRow, statusOf, completeDownload } from "./entitlements.js";
import { jobStoreConfigured, userFromToken, listEntitlements, insertEntitlement, incrementEntitlement, hasDownloadLog, addDownloadLog } from "./jobStore.js";

// Amounts in paise (₹399 / ₹799, as on the landing page's pricing section).
export const PLANS = {
  pack: { amount: 39900, name: "Job Search Pack" },
  pass: { amount: 79900, name: "Sprint Pass" },
  // Resume LLM downloads (module M4): paid at the first download, tied to the signed-in user.
  ...Object.fromEntries(Object.values(DOWNLOAD_PLANS).map((p) => [p.id, { amount: p.amount, name: p.name }])),
};
const MIN_AMOUNT = 100; // Razorpay's minimum: ₹1

const configured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
let client = null;
const razorpay = () => (client ||= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }));

/**
 * Check a finished Resume LLM payment against what Razorpay itself says: the signature is genuine, the order
 * was made for this user and a download plan, the amount matches that plan, and the payment is for that order
 * and went through. `gateway` = { order(id), payment(id) } so tests don't need Razorpay.
 * Returns { plan, orderId, paymentId }; throws an Error with a message safe to show.
 */
export async function verifyDownloadPurchase({ userId, orderId, paymentId, signature, gateway, secret = process.env.RAZORPAY_KEY_SECRET }) {
  if (!validSignature({ orderId, paymentId, signature }, secret)) throw new Error("Payment signature didn't match");
  const [order, payment] = await Promise.all([gateway.order(orderId), gateway.payment(paymentId)]);
  const plan = order?.notes?.plan;
  if (!isDownloadPlan(plan)) throw new Error("This payment wasn't for a download plan");
  if (order.notes.user_id !== userId) throw new Error("This payment belongs to a different account");
  if (Number(order.amount) !== DOWNLOAD_PLANS[plan].amount) throw new Error("The paid amount doesn't match the plan");
  if (payment?.order_id !== orderId) throw new Error("This payment is for a different order");
  if (!["captured", "authorized"].includes(payment?.status)) throw new Error("The payment hasn't gone through");
  return { plan, orderId, paymentId };
}

const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
/** The signed-in user, or null. */
async function signedInUser(req) {
  const token = bearer(req);
  return token && jobStoreConfigured() ? userFromToken(token).catch(() => null) : null;
}
const entitlementStore = {
  list: listEntitlements,
  hasLog: hasDownloadLog,
  increment: incrementEntitlement,
  addLog: addDownloadLog,
};

/** Razorpay's checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function validSignature({ orderId, paymentId, signature }, secret = process.env.RAZORPAY_KEY_SECRET) {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay's webhook signature: HMAC-SHA256 of the raw request body with the webhook secret (a different secret from the key secret). */
export function validWebhookSignature(rawBody, signature, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A payment Razorpay says went through (webhook "payment.captured" / "order.paid"): add the plan to the account the order
 * was made for. This is the safety net for a customer who paid and closed the tab before the page confirmed. Safe to run
 * twice (a payment is stored once). `gateway.order(id)` reads the order from Razorpay; `store.insert(row)` saves the purchase.
 * Returns { result: "granted" | "ignored", reason? }; throws when saving fails so Razorpay retries later.
 */
export async function applyPaymentEvent({ event, gateway, store, now = new Date() }) {
  const name = event?.event;
  if (!["payment.captured", "order.paid"].includes(name)) return { result: "ignored", reason: `event ${name || "unknown"}` };
  const payment = event?.payload?.payment?.entity;
  const paymentId = payment?.id;
  const orderId = payment?.order_id || event?.payload?.order?.entity?.id;
  if (!paymentId || !orderId) return { result: "ignored", reason: "no payment or order id" };
  if (payment.status !== "captured") return { result: "ignored", reason: `payment is ${payment.status}` };
  const order = await gateway.order(orderId);
  const plan = order?.notes?.plan;
  const userId = order?.notes?.user_id;
  if (!isDownloadPlan(plan) || !userId) return { result: "ignored", reason: "not a download plan bought by a signed-in user" };
  if (Number(order.amount) !== DOWNLOAD_PLANS[plan].amount || Number(payment.amount) !== DOWNLOAD_PLANS[plan].amount) {
    console.warn(`[payments] captured payment ${paymentId} does not match plan ${plan}: needs a manual look`);
    return { result: "ignored", reason: "amount does not match the plan" };
  }
  await store.insert(entitlementRow({ userId, plan, paymentId, orderId, now }));
  return { result: "granted", plan, paymentId };
}

export function registerPaymentRoutes(app) {
  // Razorpay calls this by itself after a payment is captured (Dashboard → Settings → Webhooks). It needs the raw request body
  // (server/index.js keeps it for this path) and RAZORPAY_WEBHOOK_SECRET.
  app.post("/api/razorpay-webhook", async (req, res) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET || !configured()) return res.status(503).json({ error: "Webhook isn't set up" });
    if (!validWebhookSignature(req.rawBody, req.headers["x-razorpay-signature"])) return res.status(400).json({ error: "Bad signature" });
    try {
      const out = await applyPaymentEvent({
        event: JSON.parse(req.rawBody.toString("utf8")),
        gateway: { order: (id) => razorpay().orders.fetch(id) },
        store: { insert: insertEntitlement },
      });
      console.log(`[payments] webhook: ${out.result}${out.reason ? ` (${out.reason})` : ""}${out.paymentId ? ` ${out.paymentId}` : ""}`);
      return res.json({ ok: true, ...out });
    } catch (err) {
      console.warn("[payments] webhook failed:", err?.error?.description || err.message);
      return res.status(500).json({ error: "Couldn't record the payment yet" }); // Razorpay tries again later
    }
  });

  app.post("/api/create-order", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Payments aren't set up yet" });
    const plan = PLANS[req.body?.plan];
    if (!plan) return res.status(400).json({ error: "Unknown plan" });
    let userId = "";
    if (isDownloadPlan(req.body.plan)) {
      const user = await signedInUser(req);
      if (!user) return res.status(401).json({ error: "Sign in first so your download is saved to your account" });
      userId = user.id;
    }
    if (plan.amount < MIN_AMOUNT) return res.status(400).json({ error: "Amount must be at least 100 paise" });
    try {
      const order = await razorpay().orders.create({
        amount: plan.amount,
        currency: "INR",
        receipt: `riq_${req.body.plan}_${Date.now()}`.slice(0, 40),
        notes: { plan: req.body.plan, email: String(req.body?.email || "").slice(0, 120), ...(userId ? { user_id: userId } : {}) },
      });
      return res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID, name: plan.name });
    } catch (err) {
      const status = err?.statusCode === 401 ? 401 : 500;
      console.warn("[payments] create order failed:", err?.error?.description || err?.message);
      return res.status(status).json({ error: status === 401 ? "Payment gateway authentication failed" : "Couldn't start the payment – please try again" });
    }
  });

  app.post("/api/verify-payment", (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Payments aren't set up yet" });
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!orderId || !paymentId || !signature) return res.status(400).json({ error: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
    if (!validSignature({ orderId, paymentId, signature })) return res.status(400).json({ verified: false, error: "Payment signature didn't match" });
    return res.json({ verified: true, order_id: orderId, payment_id: paymentId });
  });

  // ---- Resume LLM downloads (module M4) ----
  app.get("/api/downloads/plans", (_req, res) => {
    res.json({ plans: Object.values(DOWNLOAD_PLANS).map(({ id, name, amount, blurb }) => ({ id, name, amount, blurb })) });
  });

  app.get("/api/downloads/status", async (req, res) => {
    const user = await signedInUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to download" });
    try {
      res.set("Cache-Control", "no-store");
      // DOWNLOADS_FREE=1 turns the paywall off (testing, or a free launch period); downloads then aren't counted.
      if (process.env.DOWNLOADS_FREE === "1") return res.json({ allowed: true, free: true, plan: null, remaining: null, unlimited: true, expiresAt: null });
      res.json(statusOf(await listEntitlements(user.id)));
    } catch (err) {
      console.warn("[downloads] status failed:", err.message);
      res.status(500).json({ error: "Couldn't check your downloads" });
    }
  });

  // After the Razorpay modal succeeds: confirm the payment with Razorpay and add the plan to this account.
  app.post("/api/downloads/purchase", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Payments aren't set up yet" });
    const user = await signedInUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to save your purchase" });
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!orderId || !paymentId || !signature) return res.status(400).json({ error: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
    try {
      const { plan } = await verifyDownloadPurchase({
        userId: user.id, orderId, paymentId, signature,
        gateway: { order: (id) => razorpay().orders.fetch(id), payment: (id) => razorpay().payments.fetch(id) },
      });
      await insertEntitlement(entitlementRow({ userId: user.id, plan, paymentId, orderId }));
      res.json({ purchased: plan, ...statusOf(await listEntitlements(user.id)) });
    } catch (err) {
      console.warn("[downloads] purchase check failed:", err?.error?.description || err.message);
      res.status(400).json({ error: `We couldn't confirm your payment (${err.message}). If money was taken, write to rahul@myresumeiq.io with payment ID ${paymentId}.` });
    }
  });

  // Count a finished PDF download (the page sends one downloadId per download).
  app.post("/api/downloads/complete", async (req, res) => {
    const user = await signedInUser(req);
    if (!user) return res.status(401).json({ error: "Sign in to download" });
    if (process.env.DOWNLOADS_FREE === "1") return res.json({ counted: false, free: true });
    try {
      const result = await completeDownload({ store: entitlementStore, userId: user.id, downloadId: String(req.body?.downloadId || "").slice(0, 80) });
      res.status(result.counted ? 200 : result.reason === "not_entitled" ? 402 : 400).json(result);
    } catch (err) {
      console.warn("[downloads] complete failed:", err.message);
      res.status(500).json({ error: "Couldn't count that download" });
    }
  });
}
