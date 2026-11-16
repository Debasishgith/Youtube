import { createHmac, timingSafeEqual } from "crypto";
import Razorpay from "razorpay";

let client;

export const getRazorpayKeyId = () => process.env.RAZORPAY_KEY_ID?.trim();
export const getRazorpayKeySecret = () => process.env.RAZORPAY_KEY_SECRET?.trim();

export const getRazorpayClient = () => {
  if (client) return client;

  const key_id = getRazorpayKeyId();
  const key_secret = getRazorpayKeySecret();
  if (!key_id || !key_secret) {
    throw new Error("Razorpay API credentials are not configured.");
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
};

export const getRazorpayErrorStatus = (error) =>
  error?.statusCode ?? error?.response?.status;

export const getRazorpayErrorMessage = (error) =>
  error?.error?.description || error?.message || "Razorpay API request failed.";

export const getSafeRazorpayError = (error) =>
  error?.isAxiosError
    ? { message: error.message, statusCode: error.response?.status }
    : error;

export const verifyStandardPaymentSignature = (
  orderId,
  paymentId,
  signature,
  keySecret,
) => {
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
