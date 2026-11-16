import mongoose from "mongoose";

const downloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      immutable: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "video",
      immutable: true,
    },
    timestamp: { type: Date, default: Date.now, immutable: true },
    completedAt: Date,
    ipAddress: { type: String, immutable: true },
    deviceInfo: { type: String, immutable: true },
    browser: { type: String, immutable: true },
    browserVersion: { type: String, default: null, immutable: true },
    os: { type: String, default: null, immutable: true },
    osVersion: { type: String, default: null, immutable: true },
    deviceType: {
      type: String,
      enum: ["Desktop", "Mobile", "Tablet"],
      default: "Desktop",
      immutable: true,
    },
    deviceModel: { type: String, default: null, immutable: true },
    userAgent: { type: String, immutable: true },
    firebaseUid: { type: String, immutable: true },
    subscriptionPlan: { type: String, immutable: true },
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed", "interrupted"],
      default: "in_progress",
    },
    fileSize: Number,
    quotaRemaining: Number,
    quotaDay: { type: Date, immutable: true },
    outcome: String,
    failureReason: String,
    quotaDeducted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    strict: true,
  },
);

downloadSchema.index({ userId: 1, timestamp: -1 });
downloadSchema.index({ videoId: 1, timestamp: -1 });
downloadSchema.index({ status: 1, timestamp: -1 });
downloadSchema.index({ userId: 1, videoId: 1, completedAt: -1 });
downloadSchema.index(
  { userId: 1, videoId: 1, timestamp: -1 },
  { partialFilterExpression: { status: "completed" } },
);

export default mongoose.model("Download", downloadSchema);
