import mongoose from "mongoose";
const historySchema = new mongoose.Schema(
  {
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "video",
      required: true,
    },
    likedon: { type: Date, default: Date.now },
    positionSeconds: { type: Number, min: 0 },
    durationSeconds: { type: Number, min: 0 },
    completed: { type: Boolean, default: false },
    progressUpdatedAt: Date,
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("history", historySchema);
