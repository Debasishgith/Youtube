import mongoose from "mongoose";
import { loginMetadataSchema } from "./loginMetadata.js";

const loginChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    firebaseUid: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    otpHash: { type: String, required: true, select: false },
    metadata: { type: loginMetadataSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ["pending", "verified", "failed", "expired", "cancelled"],
      default: "pending",
      required: true,
    },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

loginChallengeSchema.index({ firebaseUid: 1, status: 1, createdAt: -1 });
loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model("LoginChallenge", loginChallengeSchema);
