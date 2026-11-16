import mongoose from "mongoose";
import { loginMetadataSchema } from "./loginMetadata.js";

const loginSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    firebaseUid: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    metadata: { type: loginMetadataSchema, default: () => ({}) },
    trustedDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrustedDevice",
      default: null,
    },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

loginSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export default mongoose.model("LoginSession", loginSessionSchema);
