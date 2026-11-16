import mongoose from "mongoose";

const billingTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    paymentId: { type: String, unique: true, sparse: true },
    orderId: { type: String, sparse: true },
    razorpaySubscriptionId: { type: String },
    invoiceNumber: { type: String, required: true, unique: true },
    idempotencyKey: { type: String },
    plan: { type: String, enum: ["Bronze", "Silver", "Gold"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    paymentStatus: {
      type: String,
      enum: [
        "created",
        "authorized",
        "captured",
        "failed",
        "cancelled",
        "refunded",
      ],
      required: true,
    },
    subscriptionStart: Date,
    subscriptionExpiry: Date,
    renewal: { type: Boolean, default: false },
    receiptEmailSentAt: Date,
    failureReason: String,
  },
  { timestamps: true },
);

billingTransactionSchema.index({ userId:  1, createdAt: -1 });
billingTransactionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export default mongoose.model("BillingTransaction", billingTransactionSchema);
