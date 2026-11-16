import mongoose from "mongoose";

const commentHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["created", "edited", "deleted", "flagged", "hidden", "restored"],
      required: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    previousBody: { type: String, default: null },
    nextBody: { type: String, default: null },
    note: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const commentschema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "video",
      required: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    commentbody: { type: String, required: true, maxlength: 2000 },
    usercommented: { type: String },
    commentedon: { type: Date, default: Date.now },
    location: {
      city: { type: String, default: null },
      state: { type: String, default: null },
      country: { type: String, default: null },
    },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    moderationStatus: {
      type: String,
      enum: ["visible", "flagged", "hidden"],
      default: "visible",
    },
    version: { type: Number, default: 0 },
    history: { type: [commentHistorySchema], default: [] },
  },
  {
    timestamps: true,
  },
);

commentschema.index({ videoid: 1, parentComment: 1, commentedon: -1 });
commentschema.index({ userid: 1, commentedon: -1 });

export default mongoose.model("comment", commentschema);
