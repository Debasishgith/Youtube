import assert from "node:assert/strict";
import { createHmac } from "crypto";
import test from "node:test";
import { verifyStandardPaymentSignature } from "./razorpay.js";

const keySecret = "test-key-secret";
const orderId = "order_test_123";
const paymentId = "pay_test_456";
const signature = createHmac("sha256", keySecret)
  .update(`${orderId}|${paymentId}`)
  .digest("hex");

test("accepts a matching Standard Checkout signature", () => {
  assert.equal(
    verifyStandardPaymentSignature(orderId, paymentId, signature, keySecret),
    true,
  );
});

test("rejects a signature for a different order or payment", () => {
  assert.equal(
    verifyStandardPaymentSignature("order_other", paymentId, signature, keySecret),
    false,
  );
  assert.equal(
    verifyStandardPaymentSignature(orderId, "pay_other", signature, keySecret),
    false,
  );
});

test("rejects malformed or wrong signatures", () => {
  assert.equal(
    verifyStandardPaymentSignature(orderId, paymentId, "not-a-signature", keySecret),
    false,
  );
});
