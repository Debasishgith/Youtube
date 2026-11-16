import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    videotitle: { type: "string", required: true },
    filename: { type: "string", required: true },
    filetype: { type: "string", required: true },
    filepath: { type: "string", required: true },
    filesize: { type: "string", required: true },
    videochanel: { type: "string", required: true },
    Like: { type: "Number", default: 0 },
    views: { type: "Number", default: 0 },
    uploader: { type: "string" },
    minimumSubscriptionPlan: {
      type: String,
      enum: ["Free", "Bronze", "Silver", "Gold"],
      default: "Free",
    },
    captionTracks: [
      {
        src: { type: String, required: true },
        label: String,
        srclang: String,
        kind: {
          type: String,
          enum: ["captions", "subtitles"],
          default: "subtitles",
        },
        default: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("video", videoSchema);
