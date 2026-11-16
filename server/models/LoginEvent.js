import mongoose from "mongoose";
import { loginMetadataSchema } from "./loginMetadata.js";

const loginEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    email: { type: String, lowercase: true, trim: true, default: null },
    firebaseUid: { type: String, default: null },
    eventType: {
      type: String,
      enum: [
        "login_attempt",
        "login_rejected",
        "otp_sent",
        "otp_delivery_failed",
        "otp_failed",
        "otp_expired",
        "login_success",
        "session_restored",
        "logout",
        "session_revoked",
      ],
      required: true,
    },
    outcome: { type: String, required: true },
    metadata: { type: loginMetadataSchema, default: () => ({}) },
    sessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

loginEventSchema.index({ userId: 1, createdAt: -1 });
loginEventSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model("LoginEvent", loginEventSchema);
