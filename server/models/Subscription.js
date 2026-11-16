import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["Bronze", "Silver", "Gold"],
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR", required: true },
    razorpayPlanId: { type: String, required: true },
    razorpaySubscriptionId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "pending",
        "halted",
        "cancelled",
        "completed",
        "expired",
        "failed",
      ],
      default: "created",
      index: true,
    },
    currentStart: Date,
    currentEnd: Date,
    nextRenewalAt: Date,
    cancelAtCycleEnd: { type: Boolean, default: false },
    cancelledAt: Date,
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);

subscriptionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true },
);

export default mongoose.model("Subscription", subscriptionSchema);
