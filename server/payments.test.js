import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { validSignature, PLANS } from "./payments.js";

test("Razorpay signature: HMAC-SHA256 of order_id|payment_id with the key secret", () => {
  const secret = "test_secret";
  const signature = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  assert.ok(validSignature({ orderId: "order_1", paymentId: "pay_1", signature }, secret));
  assert.ok(!validSignature({ orderId: "order_1", paymentId: "pay_2", signature }, secret));
  assert.ok(!validSignature({ orderId: "order_1", paymentId: "pay_1", signature: "short" }, secret));
  assert.ok(Object.values(PLANS).every((p) => p.amount >= 100));
});

import { verifyDownloadPurchase } from "./payments.js";

const sign = (orderId, paymentId, secret) => createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
const gatewayFor = ({ plan = "dl10", amount = 39900, userId = "u1", status = "captured", payOrder = "order_1" } = {}) => ({
  order: async () => ({ id: "order_1", amount, notes: { plan, user_id: userId } }),
  payment: async () => ({ id: "pay_1", order_id: payOrder, status }),
});
const args = (over = {}, g = {}) => ({ userId: "u1", orderId: "order_1", paymentId: "pay_1", signature: sign("order_1", "pay_1", "s"), secret: "s", gateway: gatewayFor(g), ...over });

test("download purchase: a genuine payment for the right plan is accepted", async () => {
  assert.deepEqual(await verifyDownloadPurchase(args()), { plan: "dl10", orderId: "order_1", paymentId: "pay_1" });
  assert.equal((await verifyDownloadPurchase(args({}, { status: "authorized" }))).plan, "dl10");
});

test("download purchase: forged signature, other account, wrong amount, other order or unpaid are refused", async () => {
  await assert.rejects(verifyDownloadPurchase(args({ signature: "bad" })), /signature/);
  await assert.rejects(verifyDownloadPurchase(args({ userId: "someone-else" })), /different account/);
  await assert.rejects(verifyDownloadPurchase(args({}, { amount: 7900 })), /amount/);
  await assert.rejects(verifyDownloadPurchase(args({}, { payOrder: "order_2" })), /different order/);
  await assert.rejects(verifyDownloadPurchase(args({}, { status: "failed" })), /hasn't gone through/);
  await assert.rejects(verifyDownloadPurchase(args({}, { plan: "pack", amount: 39900 })), /download plan/);
});

test("the three download plans are priced as decided in the payment plan table", () => {
  assert.equal(PLANS.dl1.amount, 7900);
  assert.equal(PLANS.dl10.amount, 39900);
  assert.equal(PLANS.dlunlimited.amount, 79900);
});
