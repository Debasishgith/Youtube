import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    participantId: { type: String, required: true },
    accessTokenHash: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    name: { type: String, required: true, maxlength: 40 },
    role: {
      type: String,
      enum: ["host", "cohost", "participant"],
      default: "participant",
    },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
  },
  { _id: false },
);

const meetingSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 100 },
    hostUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    hostName: { type: String, required: true },
    inviteTokenHash: { type: String, required: true, select: false },
    locked: { type: Boolean, default: false },
    endedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    maxParticipants: { type: Number, default: 6 },
    allowChat: { type: Boolean, default: true },
    allowParticipantScreenShare: { type: Boolean, default: false },
    participants: { type: [participantSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("Meeting", meetingSchema);
