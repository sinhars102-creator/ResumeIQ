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
