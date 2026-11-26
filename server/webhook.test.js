import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validWebhookSignature, applyPaymentEvent } from "./payments.js";
import { DOWNLOAD_PLANS } from "./entitlements.js";

const SECRET = "whsec_test";
const sign = (body, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");
const captured = (over = {}) => ({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", status: "captured", amount: DOWNLOAD_PLANS.dl1.amount, ...over } } } });
const order = (over = {}) => ({ id: "order_1", amount: DOWNLOAD_PLANS.dl1.amount, notes: { plan: "dl1", user_id: "user_1" }, ...over });
const run = (event, ord = order(), saved = []) => applyPaymentEvent({ event, gateway: { order: async () => ord }, store: { insert: async (row) => saved.push(row) } }).then((r) => ({ r, saved }));

test("the webhook signature is checked against the raw body and the webhook secret", () => {
  const body = Buffer.from(JSON.stringify(captured()));
  assert.equal(validWebhookSignature(body, sign(body), SECRET), true);
  assert.equal(validWebhookSignature(body, sign(body, "other"), SECRET), false);
  assert.equal(validWebhookSignature(Buffer.from(body.toString() + " "), sign(body), SECRET), false); // body changed after signing
  assert.equal(validWebhookSignature(body, "", SECRET), false);
  assert.equal(validWebhookSignature(null, sign(body), SECRET), false);
  assert.equal(validWebhookSignature(body, sign(body), ""), false); // no secret configured: nothing passes
});

test("a captured payment for a download plan gives that user the plan (the tab-closed case)", async () => {
  const { r, saved } = await run(captured());
  assert.deepEqual({ result: r.result, plan: r.plan, paymentId: r.paymentId }, { result: "granted", plan: "dl1", paymentId: "pay_1" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].user_id, "user_1");
  assert.equal(saved[0].payment_id, "pay_1");
  assert.equal(saved[0].order_id, "order_1");
  assert.equal(saved[0].downloads_total, 1);
});

test("order.paid works too, and the same payment can arrive twice without harm", async () => {
  const ev = { ...captured(), event: "order.paid" };
  const store = new Map();
  const insert = async (row) => { if (!store.has(row.payment_id)) store.set(row.payment_id, row); return store.get(row.payment_id); };
  for (let i = 0; i < 2; i++) assert.equal((await applyPaymentEvent({ event: ev, gateway: { order: async () => order() }, store: { insert } })).result, "granted");
  assert.equal(store.size, 1);
});

test("anything that isn't a clean, matching, captured download payment is ignored, never granted", async () => {
  const cases = [
    [{ event: "payment.failed", payload: {} }, order(), "event"],
    [captured({ status: "authorized" }), order(), "authorized"],
    [captured({ id: undefined }), order(), "id"],
    [captured(), order({ notes: { plan: "pack", user_id: "user_1" } }), "not a download"],
    [captured(), order({ notes: { plan: "dl1" } }), "signed-in"],
    [captured({ amount: 100 }), order(), "amount"],
    [captured(), order({ amount: 100 }), "amount"],
  ];
  for (const [ev, ord, why] of cases) {
    const { r, saved } = await run(ev, ord);
    assert.equal(r.result, "ignored", why);
    assert.equal(saved.length, 0, why);
  }
});

test("when saving fails the error is raised so Razorpay retries later", async () => {
  await assert.rejects(applyPaymentEvent({ event: captured(), gateway: { order: async () => order() }, store: { insert: async () => { throw new Error("db down"); } } }), /db down/);
});
