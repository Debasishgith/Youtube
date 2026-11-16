import mongoose from "mongoose";
import { loginMetadataSchema } from "./loginMetadata.js";

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    browser: { type: String, required: true },
    os: { type: String, required: true },
    deviceType: {
      type: String,
      enum: ["Desktop", "Mobile", "Tablet"],
      required: true,
    },
    deviceModel: { type: String, default: null },
    metadata: { type: loginMetadataSchema, default: () => ({}) },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

trustedDeviceSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model("TrustedDevice", trustedDeviceSchema);
