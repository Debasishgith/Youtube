import mongoose from "mongoose";

const reportHistorySchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    action: { type: String, required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    commentAction: { type: String, default: null },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const commentReportSchema = new mongoose.Schema(
  {
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    reason: {
      type: String,
      enum: ["spam", "harassment", "offensive", "misinformation", "other"],
      required: true,
    },
    details: { type: String, maxlength: 500, default: "" },
    status: {
      type: String,
      enum: ["open", "reviewed", "dismissed", "actioned"],
      default: "open",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    history: { type: [reportHistorySchema], default: [] },
  },
  { timestamps: true },
);

commentReportSchema.index(
  { commentId: 1, reporterId: 1 },
  { unique: true },
);
commentReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("CommentReport", commentReportSchema);
