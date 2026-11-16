import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  channelName: { type: String },
  description: { type: String },
  image: { type: String },
  subscriptionPlan: {
    type: String,
    enum: ["Free", "Bronze", "Silver", "Gold"],
    default: "Free",
  },
  subscriptionExpiry: { type: Date },
  activeSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subscription",
  },
  downloadsToday: { type: Number, default: 0 },
  lastReset: { type: Date },
  downloadLocks: [
    {
      videoId: { type: mongoose.Schema.Types.ObjectId, required: true },
      lockId: { type: mongoose.Schema.Types.ObjectId, required: true },
      createdAt: { type: Date, required: true },
    },
  ],
  registeredDevices: { type: [String], default: [] },
  deviceRestrictionEnabled: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  themePreference: {
    type: String,
    enum: ["auto", "light", "dark"],
    default: "auto",
  },
  joinedOn: { type: Date, default: Date.now },
});

export default mongoose.model("user", userSchema);