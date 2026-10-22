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

// Amounts in paise (₹399 / ₹799, as on the landing page's pricing section).
export const PLANS = {
  pack: { amount: 39900, name: "Job Search Pack" },
  pass: { amount: 79900, name: "Sprint Pass" },
};
const MIN_AMOUNT = 100; // Razorpay's minimum: ₹1

const configured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
let client = null;
const razorpay = () => (client ||= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }));

/** Razorpay's checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function validSignature({ orderId, paymentId, signature }, secret = process.env.RAZORPAY_KEY_SECRET) {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerPaymentRoutes(app) {
  app.post("/api/create-order", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Payments aren't set up yet" });
    const plan = PLANS[req.body?.plan];
    if (!plan) return res.status(400).json({ error: "Unknown plan" });
    if (plan.amount < MIN_AMOUNT) return res.status(400).json({ error: "Amount must be at least 100 paise" });
    try {
      const order = await razorpay().orders.create({
        amount: plan.amount,
        currency: "INR",
        receipt: `riq_${req.body.plan}_${Date.now()}`.slice(0, 40),
        notes: { plan: req.body.plan, email: String(req.body?.email || "").slice(0, 120) },
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
}
