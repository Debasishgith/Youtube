import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import Auth from "../models/Auth.js";
import BillingTransaction from "../models/BillingTransaction.js";
import Subscription from "../models/Subscription.js";
import {
  getRazorpayClient,
  getRazorpayErrorMessage,
  getRazorpayErrorStatus,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getSafeRazorpayError,
  verifyStandardPaymentSignature,
} from "../services/razorpay.js";

const plans = {
  Bronze: { amount: 10000, downloadsPerDay: 5 },
  Silver: { amount: 20000, downloadsPerDay: 15 },
  Gold: { amount: 30000, downloadsPerDay: 30 },
};
const currency = "INR";
const billingPeriodDays = 30;

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const cancelRazorpaySubscription = (subscriptionId, atCycleEnd) =>
  getRazorpayClient().subscriptions.cancel(subscriptionId, atCycleEnd);

const makeInvoiceNumber = () =>
  `YT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

const sendReceiptEmail = async (user, transaction) => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    console.error("Subscription receipt email skipped: SMTP is not configured.");
    return false;
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: transaction.currency,
  }).format(transaction.amount / 100);
  const start = transaction.subscriptionStart?.toLocaleString("en-IN") || "Pending";
  const expiry = transaction.subscriptionExpiry?.toLocaleString("en-IN") || "Pending";
  const supportEmail = process.env.SUPPORT_EMAIL || SMTP_FROM;
  const paymentReference = transaction.orderId
    ? `Order ID: ${transaction.orderId}`
    : `Subscription ID: ${transaction.razorpaySubscriptionId}`;

  const invoiceHtml = `<h2>Plan payment receipt</h2>
    <p>Hello ${escapeHtml(user.name)},</p>
    <p>Your <strong>${escapeHtml(transaction.plan)}</strong> plan payment has been verified.</p>
    <table>
      <tr><td>Invoice</td><td>${escapeHtml(transaction.invoiceNumber)}</td></tr>
      <tr><td>Amount</td><td>${escapeHtml(amount)}</td></tr>
      <tr><td>Payment ID</td><td>${escapeHtml(transaction.paymentId)}</td></tr>
      <tr><td>Payment reference</td><td>${escapeHtml(paymentReference)}</td></tr>
      <tr><td>Valid from</td><td>${escapeHtml(start)}</td></tr>
      <tr><td>Valid through</td><td>${escapeHtml(expiry)}</td></tr>
    </table>
    <p>For support, contact ${escapeHtml(supportEmail)}.</p>`;
  await transport.sendMail({
    from: SMTP_FROM,
    to: user.email,
    subject: `${transaction.plan} plan receipt - ${transaction.invoiceNumber}`,
    text: [
      `Hello ${user.name},`,
      `Your ${transaction.plan} subscription payment is ${transaction.paymentStatus}.`,
      `Invoice: ${transaction.invoiceNumber}`,
      `Amount: ${amount}`,
      `Payment ID: ${transaction.paymentId}`,
      paymentReference,
      `Valid from: ${start}`,
      `Valid through: ${expiry}`,
      `Support: ${supportEmail}`,
    ].join("\n"),
    html: invoiceHtml,
    attachments: [
      {
        filename: `${transaction.invoiceNumber}.html`,
        content: invoiceHtml,
        contentType: "text/html",
      },
    ],
  });
  return true;
};

const activateVerifiedOrder = async ({ transaction, payment }) => {
  const user = await Auth.findById(transaction.userId);
  if (!user) throw new Error("Subscription user account was not found.");

  const alreadyProcessed = transaction.paymentStatus === "captured";
  if (alreadyProcessed && transaction.paymentId !== payment.id) {
    throw new Error("This order was already paid with a different payment.");
  }

  if (!alreadyProcessed) {
    const now = new Date();
    const subscriptionStart =
      user.subscriptionExpiry && user.subscriptionExpiry > now
        ? user.subscriptionExpiry
        : now;
    const subscriptionExpiry = new Date(
      subscriptionStart.getTime() + billingPeriodDays * 86400000,
    );
    const renewal = Boolean(
      await BillingTransaction.exists({
        userId: user._id,
        paymentStatus: "captured",
      }),
    );
    Object.assign(transaction, {
      paymentId: payment.id,
      paymentStatus: "captured",
      subscriptionStart,
      subscriptionExpiry,
      renewal,
    });
    await transaction.save();
  }

  user.subscriptionPlan = transaction.plan;
  user.subscriptionExpiry = transaction.subscriptionExpiry;
  await user.save();

  if (
    user.activeSubscriptionId &&
    transaction.subscriptionExpiry > new Date()
  ) {
    const previous = await Subscription.findById(user.activeSubscriptionId);
    if (
      previous?.razorpaySubscriptionId &&
      ["active", "authenticated"].includes(previous.status) &&
      !previous.cancelAtCycleEnd
    ) {
      try {
        await cancelRazorpaySubscription(previous.razorpaySubscriptionId, true);
        previous.cancelAtCycleEnd = true;
        previous.nextRenewalAt = undefined;
        await previous.save();
      } catch (error) {
        console.error(
          "Unable to stop legacy subscription renewal:",
          getSafeRazorpayError(error),
        );
      }
    }
  }

  if (!transaction.receiptEmailSentAt) {
    try {
      if (await sendReceiptEmail(user, transaction)) {
        transaction.receiptEmailSentAt = new Date();
        await transaction.save();
      }
    } catch (error) {
      console.error("Unable to send subscription receipt email:", error);
    }
  }

  return { transaction, alreadyProcessed };
};

export const getSubscriptionDashboard = async (req, res) => {
  try {
    const user = await Auth.findById(req.appUser._id);
    const now = new Date();
    if (
      user.subscriptionPlan !== "Free" &&
      (!user.subscriptionExpiry || user.subscriptionExpiry <= now)
    ) {
      const expiredSubscriptionId = user.activeSubscriptionId;
      user.subscriptionPlan = "Free";
      user.subscriptionExpiry = undefined;
      user.activeSubscriptionId = undefined;
      await user.save();
      if (expiredSubscriptionId) {
        await Subscription.updateOne(
          { _id: expiredSubscriptionId },
          { $set: { status: "expired" } },
        );
      }
    }

    const activeSubscription = user.activeSubscriptionId
      ? await Subscription.findById(user.activeSubscriptionId).lean()
      : null;
    const billingHistory = await BillingTransaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const endDate = user.subscriptionExpiry || null;
    const remainingDays = endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000))
      : 0;

    return res.json({
      plan: user.subscriptionPlan,
      status: user.subscriptionPlan === "Free" ? "free" : "active",
      subscriptionExpiry: endDate,
      remainingDays,
      nextRenewalAt: activeSubscription?.nextRenewalAt || null,
      cancelAtCycleEnd: activeSubscription?.cancelAtCycleEnd || false,
      canCancelRenewal: Boolean(
        activeSubscription?.razorpaySubscriptionId &&
          ["active", "authenticated"].includes(activeSubscription.status) &&
          !activeSubscription.cancelAtCycleEnd,
      ),
      billingHistory,
    });
  } catch (error) {
    console.error("Unable to load subscription dashboard:", error);
    return res.status(500).json({
      message: "Subscription details could not be loaded.",
    });
  }
};

export const createOrder = async (req, res) => {
  const { plan } = req.body ?? {};
  const idempotencyKey = req.get("Idempotency-Key");
  const planDetails = Object.hasOwn(plans, plan) ? plans[plan] : null;
  if (!getRazorpayKeyId() || !getRazorpayKeySecret()) {
    return res.status(503).json({
      message:
        "Razorpay credentials are not loaded by the backend. Check server/.env and restart the backend.",
    });
  }
  if (!planDetails) {
    return res.status(400).json({ message: "Choose a valid paid plan." });
  }
  if (!Number.isInteger(planDetails.amount) || planDetails.amount < 100) {
    return res.status(400).json({ message: "The order amount must be at least 100 paise." });
  }
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return res.status(400).json({ message: "A valid checkout key is required." });
  }

  try {
    const existing = await BillingTransaction.findOne({
      userId: req.appUser._id,
      idempotencyKey,
    });
    if (existing) {
      if (!existing.orderId) {
        return res.status(409).json({ message: "This checkout is already being created." });
      }
      return res.json({
        order_id: existing.orderId,
        amount: existing.amount,
        currency: existing.currency,
      });
    }

    const invoiceNumber = makeInvoiceNumber();
    const order = await getRazorpayClient().orders.create({
      amount: planDetails.amount,
      currency,
      receipt: invoiceNumber,
      notes: {
        userId: req.appUser._id.toString(),
        plan,
        idempotencyKey,
      },
    });

    await BillingTransaction.create({
      userId: req.appUser._id,
      orderId: order.id,
      invoiceNumber,
      idempotencyKey,
      plan,
      amount: order.amount,
      currency,
      paymentStatus: "created",
      renewal: false,
    });

    return res.status(201).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    const status = getRazorpayErrorStatus(error);
    console.error(
      "Unable to create Razorpay order:",
      getSafeRazorpayError(error),
    );
    if (error?.code === 11000) {
      const existing = await BillingTransaction.findOne({
        userId: req.appUser._id,
        idempotencyKey,
      });
      if (existing?.orderId) {
        return res.json({
          order_id: existing.orderId,
          amount: existing.amount,
          currency: existing.currency,
        });
      }
    }
    return res.status(500).json({
      message: status
        ? `Razorpay could not create the order: ${getRazorpayErrorMessage(error)}`
        : "Could not create the Razorpay order.",
    });
  }
};

export const verifyOrderPayment = async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body ?? {};
  if (
    typeof orderId !== "string" ||
    !orderId ||
    typeof paymentId !== "string" ||
    !paymentId ||
    typeof signature !== "string" ||
    !signature
  ) {
    return res.status(400).json({ message: "Payment verification data is incomplete." });
  }

  const keySecret = getRazorpayKeySecret();
  if (!keySecret) {
    return res.status(503).json({ message: "Razorpay credentials are not configured." });
  }
  if (!verifyStandardPaymentSignature(orderId, paymentId, signature, keySecret)) {
    return res.status(400).json({ message: "Payment signature is invalid." });
  }

  try {
    const transaction = await BillingTransaction.findOne({
      orderId,
      userId: req.appUser._id,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Payment order was not found." });
    }
    if (transaction.paymentStatus === "cancelled") {
      return res.status(409).json({ message: "This checkout was cancelled." });
    }

    const payment = await getRazorpayClient().payments.fetch(paymentId);
    if (
      payment.order_id !== orderId ||
      payment.amount !== transaction.amount ||
      payment.currency !== transaction.currency
    ) {
      return res.status(400).json({
        message: "The payment does not match this order.",
      });
    }
    if (payment.status !== "captured") {
      return res.status(402).json({ message: "The payment has not been captured." });
    }

    const result = await activateVerifiedOrder({ transaction, payment });
    return res.json({
      verified: true,
      alreadyProcessed: result.alreadyProcessed,
      invoiceNumber: result.transaction.invoiceNumber,
      plan: transaction.plan,
      subscriptionExpiry: result.transaction.subscriptionExpiry,
    });
  } catch (error) {
    console.error(
      "Unable to verify Razorpay subscription payment:",
      getSafeRazorpayError(error),
    );
    return res.status(502).json({
      message: "Payment verification is temporarily unavailable.",
    });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const user = await Auth.findById(req.appUser._id);
    if (!user.activeSubscriptionId) {
      return res.status(400).json({ message: "There is no active paid subscription to cancel." });
    }

    const subscription = await Subscription.findOne({
      _id: user.activeSubscriptionId,
      userId: user._id,
    });
    if (!subscription || !["active", "authenticated"].includes(subscription.status)) {
      return res.status(400).json({ message: "The active subscription cannot be cancelled." });
    }

    const result = await cancelRazorpaySubscription(
      subscription.razorpaySubscriptionId,
      true,
    );
    subscription.cancelAtCycleEnd = true;
    subscription.nextRenewalAt = undefined;
    subscription.status = result.status || subscription.status;
    await subscription.save();
    return res.json({
      message: "Auto-renewal is cancelled. Your plan stays active until its expiry date.",
      subscriptionExpiry: user.subscriptionExpiry,
    });
  } catch (error) {
    console.error("Unable to cancel Razorpay subscription:", getSafeRazorpayError(error));
    return res.status(502).json({
      message: "Subscription cancellation could not be completed.",
    });
  }
};

export const recordPaymentFailure = async (req, res) => {
  const { orderId, paymentId, reason } = req.body ?? {};
  if (typeof orderId !== "string" || !orderId) {
    return res.status(400).json({ message: "Order ID is required." });
  }

  try {
    const transaction = await BillingTransaction.findOne({
      orderId,
      userId: req.appUser._id,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Payment order was not found." });
    }
    if (transaction.paymentStatus === "captured") {
      return res.status(409).json({ message: "This payment is already complete." });
    }

    let failedPayment;
    if (typeof paymentId === "string") {
      failedPayment = await getRazorpayClient().payments.fetch(paymentId);
      if (
        failedPayment.order_id !== orderId ||
        failedPayment.status !== "failed" ||
        failedPayment.amount !== transaction.amount ||
        failedPayment.currency !== transaction.currency
      ) {
        return res.status(400).json({
          message: "The failed payment could not be verified.",
        });
      }
      transaction.paymentId = paymentId;
      transaction.paymentStatus = "failed";
    }
    transaction.failureReason =
        typeof reason === "string"
          ? reason.slice(0, 300)
          : failedPayment?.error_description || "Payment failed";
    await transaction.save();
    return res.json({ recorded: Boolean(failedPayment) });
  } catch (error) {
    console.error(
      "Unable to record payment failure:",
      getSafeRazorpayError(error),
    );
    return res.status(500).json({ message: "Payment failure could not be recorded." });
  }
};

export const abandonOrderCheckout = async (req, res) => {
  const { orderId } = req.body ?? {};
  if (typeof orderId !== "string" || !orderId) {
    return res.status(400).json({ message: "Order ID is required." });
  }

  try {
    const transaction = await BillingTransaction.findOne({
      orderId,
      userId: req.appUser._id,
    });
    if (!transaction) {
      return res.status(404).json({ message: "Payment order was not found." });
    }

    if (transaction.paymentStatus === "created") {
      transaction.paymentStatus = "cancelled";
      transaction.failureReason = "Checkout was dismissed before payment.";
      await transaction.save();
    }
    return res.json({ cancelled: transaction.paymentStatus === "cancelled" });
  } catch (error) {
    console.error(
      "Unable to record dismissed checkout:",
      error,
    );
    return res.status(500).json({ message: "Checkout cancellation could not be recorded." });
  }
};
