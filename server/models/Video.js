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
  },
  { timestamps: true },
);

export default mongoose.model("video", videoSchema);
