import mongoose from "mongoose";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    plan: { type: String, enum: ["Bronze", "Silver", "Gold"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR", required: true },
    billingPeriod: { type: String, enum: ["monthly"], default: "monthly" },
    razorpayPlanId: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export default mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
