import mongoose from "mongoose";
import Auth from "../models/Auth.js";
import Comment from "../models/Comment.js";
import CommentReaction from "../models/CommentReaction.js";
import CommentReport from "../models/CommentReport.js";
import { getRequestMetadata } from "../services/loginSecurity.js";
import {
  COMMENT_CAPTCHA_THRESHOLD,
  COMMENT_CAPTCHA_WINDOW_MS,
  COMMENT_HARD_RATE_LIMIT,
  validateCommentBody,
  verifyRecaptchaToken,
} from "../services/commentModeration.js";
import {
  CommentTranslationError,
  isCommentTranslationRateLimited,
  isSupportedTranslationLanguage,
  translateCommentText,
} from "../services/commentTranslation.js";

const REPORT_REASONS = new Set([
  "spam",
  "harassment",
  "offensive",
  "misinformation",
  "other",
]);
const REPORT_STATUSES = new Set(["reviewed", "dismissed", "actioned"]);
const MODERATION_ACTIONS = new Set(["none", "hide", "restore", "delete"]);

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const requireCommentAdmin = (req, res, next) => {
  if (req.appUser?.role !== "admin") {
    return res.status(403).json({ message: "Administrator access is required." });
  }
  return next();
};

const getEditWindowMinutes = () => {
  const configured = Number(process.env.COMMENT_EDIT_WINDOW_MINUTES || 15);
  if (!Number.isInteger(configured) || configured < 1 || configured > 1440) {
    throw new Error("COMMENT_EDIT_WINDOW_MINUTES must be between 1 and 1440.");
  }
  return configured;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const makeUsername = (user) => {
  const base = String(user.channelName || user.name || "user")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "")
    .slice(0, 24);
  return `${base || "user"}_${String(user._id).slice(-5).toLowerCase()}`;
};

const toPublicComment = (comment, stats, currentUserId) => {
  const populatedUser =
    comment.userid && typeof comment.userid === "object" && comment.userid._id
      ? comment.userid
      : null;
  const userId = populatedUser?._id ?? comment.userid;
  const userName = populatedUser?.name || comment.usercommented || "User";

  const editableUntil = new Date(
    new Date(comment.commentedon).getTime() + getEditWindowMinutes() * 60000,
  );
  return {
    _id: String(comment._id),
    videoid: String(comment.videoid),
    userid: String(userId),
    parentComment: comment.parentComment ? String(comment.parentComment) : null,
    commentbody: comment.deletedAt ? "" : comment.commentbody,
    usercommented: userName,
    author: {
      id: String(userId),
      name: userName,
      username: populatedUser ? makeUsername(populatedUser) : null,
      image: populatedUser?.image || "",
      location: {
        city: comment.location?.city || null,
        state: comment.location?.state || null,
        country: comment.location?.country || null,
      },
    },
    commentedon: comment.commentedon,
    editedAt: comment.editedAt || null,
    editableUntil,
    canEdit: !comment.deletedAt && Date.now() <= editableUntil.getTime(),
    deletedAt: comment.deletedAt || null,
    isDeleted: Boolean(comment.deletedAt),
    version: Number.isInteger(comment.version) ? comment.version : 0,
    likeCount: stats?.likeCount || 0,
    dislikeCount: stats?.dislikeCount || 0,
    myReaction: currentUserId ? stats?.byUser?.get(String(currentUserId)) || null : null,
  };
};

const getReactionStats = async (comments, currentUserId) => {
  const commentIds = comments.map((entry) => entry._id);
  if (commentIds.length === 0) return new Map();

  const [counts, currentReactions] = await Promise.all([
    CommentReaction.aggregate([
      { $match: { commentId: { $in: commentIds } } },
      {
        $group: {
          _id: { commentId: "$commentId", type: "$type" },
          count: { $sum: 1 },
        },
      },
    ]),
    currentUserId
      ? CommentReaction.find({
          commentId: { $in: commentIds },
          userId: currentUserId,
        })
          .select("commentId type")
          .lean()
      : [],
  ]);
  const stats = new Map(
    commentIds.map((id) => [
      String(id),
      { likeCount: 0, dislikeCount: 0, byUser: new Map() },
    ]),
  );
  for (const result of counts) {
    const entry = stats.get(String(result._id.commentId));
    if (entry && result._id.type === "like") entry.likeCount = result.count;
    if (entry && result._id.type === "dislike") entry.dislikeCount = result.count;
  }
  for (const reaction of currentReactions) {
    stats.get(String(reaction.commentId))?.byUser.set(
      String(currentUserId),
      reaction.type,
    );
  }
  return stats;
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;
  if (!isValidObjectId(videoid)) {
    return res.status(400).json({ message: "A valid video ID is required." });
  }

  const requestedSort = req.query.sort;
  const sort = ["newest", "oldest", "mostLiked", "relevant"].includes(requestedSort)
    ? requestedSort
    : "newest";
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
  const sortDirection = sort === "oldest" ? 1 : -1;

  try {
    const roots = await Comment.find({
      videoid,
      parentComment: null,
      moderationStatus: { $ne: "hidden" },
    })
      .sort({ commentedon: sortDirection, _id: sortDirection })
      .limit(limit)
      .populate("userid", "name channelName image")
      .lean();
    const rootIds = roots.map((entry) => entry._id);
    const replies = [];
    let parents = rootIds;
    for (let depth = 0; depth < 10 && parents.length && replies.length < 1000; depth += 1) {
      const batch = await Comment.find({
        videoid,
        parentComment: { $in: parents },
        moderationStatus: { $ne: "hidden" },
      })
        .sort({ commentedon: 1, _id: 1 })
        .limit(1000 - replies.length)
        .populate("userid", "name channelName image")
        .lean();
      replies.push(...batch);
      parents = batch.map((entry) => entry._id);
    }
    const allComments = [...roots, ...replies];
    const stats = await getReactionStats(allComments, req.appUser?._id);
    const serialized = allComments.map((entry) =>
      toPublicComment(entry, stats.get(String(entry._id)), req.appUser?._id),
    );
    const commentsById = new Map(serialized.map((entry) => [entry._id, entry]));
    const childrenByParent = new Map();
    for (const entry of serialized) {
      if (!entry.parentComment) continue;
      const children = childrenByParent.get(entry.parentComment) ?? [];
      children.push(entry);
      childrenByParent.set(entry.parentComment, children);
    }

    if (sort === "mostLiked" || sort === "relevant") {
      const byId = new Map(serialized.map((entry) => [entry._id, entry]));
      roots.sort((left, right) => {
        const leftComment = byId.get(String(left._id));
        const rightComment = byId.get(String(right._id));
        if (sort === "mostLiked") {
          return rightComment.likeCount - leftComment.likeCount;
        }
        const relevance = (entry) =>
          entry.likeCount * 2 -
          entry.dislikeCount +
          Math.max(0, 30 - (Date.now() - new Date(entry.commentedon).getTime()) / 3600000);
        return relevance(rightComment) - relevance(leftComment);
      });
    }

    const ordered = [];
    const appendThread = (entry) => {
      ordered.push(entry);
      for (const child of childrenByParent.get(entry._id) ?? []) {
        appendThread(child);
      }
    };
    for (const root of roots) {
      const serializedRoot = commentsById.get(String(root._id));
      if (serializedRoot) appendThread(serializedRoot);
    }
    return res.status(200).json(ordered);
  } catch (error) {
    console.error("Unable to load comments:", error);
    return res.status(500).json({ message: "Comments could not be loaded." });
  }
};

export const postcomment = async (req, res) => {
  const { videoid, commentbody, parentCommentId, captchaToken } = req.body ?? {};
  if (!isValidObjectId(videoid)) {
    return res.status(400).json({ message: "A valid video ID is required." });
  }
  const validation = validateCommentBody(commentbody);
  if (validation.error) return res.status(400).json({ message: validation.error });

  try {
    const now = new Date();
    const recentCount = await Comment.countDocuments({
      userid: req.appUser._id,
      createdAt: { $gte: new Date(now.getTime() - COMMENT_CAPTCHA_WINDOW_MS) },
    });
    if (recentCount >= COMMENT_HARD_RATE_LIMIT) {
      return res.status(429).json({
        message: "You are commenting too quickly. Please wait before posting again.",
      });
    }
    if (recentCount >= COMMENT_CAPTCHA_THRESHOLD) {
      const captcha = await verifyRecaptchaToken(captchaToken);
      if (!captcha.configured) {
        return res.status(503).json({
          code: "CAPTCHA_NOT_CONFIGURED",
          message: "Comment CAPTCHA is not configured on the server.",
        });
      }
      if (!captcha.success) {
        return res.status(400).json({
          code: "CAPTCHA_REQUIRED",
          captchaRequired: true,
          message: "Complete the CAPTCHA before posting another comment.",
        });
      }
    }

    const duplicate = await Comment.exists({
      userid: req.appUser._id,
      videoid,
      commentbody: validation.body,
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    });
    if (duplicate) {
      return res.status(409).json({
        message: "You have already posted this comment on this video.",
      });
    }

    let parentComment = null;
    if (parentCommentId !== undefined && parentCommentId !== null) {
      if (!isValidObjectId(parentCommentId)) {
        return res.status(400).json({ message: "The reply target is invalid." });
      }
      parentComment = await Comment.findOne({
        _id: parentCommentId,
        videoid,
        moderationStatus: { $ne: "hidden" },
      }).select("_id parentComment");
      if (!parentComment) {
        return res.status(404).json({ message: "The comment you are replying to was not found." });
      }
    }

    const metadata = await getRequestMetadata(req);
    const created = await Comment.create({
      userid: req.appUser._id,
      usercommented: req.appUser.name,
      videoid,
      parentComment: parentComment?._id ?? null,
      commentbody: validation.body,
      location: {
        city: metadata.city,
        state: metadata.state,
        country: metadata.country,
      },
      history: [
        {
          action: "created",
          actorId: req.appUser._id,
          nextBody: validation.body,
        },
      ],
    });
    const populated = await Comment.findById(created._id)
      .populate("userid", "name channelName image")
      .lean();
    return res.status(201).json({
      comment: toPublicComment(populated, null, req.appUser._id),
    });
  } catch (error) {
    console.error("Unable to create comment:", error);
    return res.status(500).json({ message: "The comment could not be posted." });
  }
};

export const editcomment = async (req, res) => {
  const { id } = req.params;
  const { commentbody, version } = req.body ?? {};
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: "Comment unavailable." });
  }
  if (!Number.isInteger(version) || version < 0) {
    return res.status(400).json({ message: "A valid comment version is required." });
  }
  const validation = validateCommentBody(commentbody);
  if (validation.error) return res.status(400).json({ message: validation.error });

  try {
    const existing = await Comment.findOne({ _id: id, userid: req.appUser._id });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ message: "Comment unavailable." });
    }
    if (Date.now() - existing.commentedon.getTime() > getEditWindowMinutes() * 60000) {
      return res.status(403).json({ message: "The comment edit window has expired." });
    }
    const currentVersion = Number.isInteger(existing.version) ? existing.version : 0;
    if (version !== currentVersion) {
      return res.status(409).json({
        code: "COMMENT_VERSION_CONFLICT",
        message: "This comment changed elsewhere. Reload it before editing again.",
      });
    }

    const versionFilter =
      currentVersion === 0
        ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
        : { version };
    const updated = await Comment.findOneAndUpdate(
      {
        _id: id,
        userid: req.appUser._id,
        deletedAt: null,
        ...versionFilter,
      },
      {
        $set: { commentbody: validation.body, editedAt: new Date() },
        $inc: { version: 1 },
        $push: {
          history: {
            action: "edited",
            actorId: req.appUser._id,
            previousBody: existing.commentbody,
            nextBody: validation.body,
          },
        },
      },
      { new: true, runValidators: true },
    )
      .populate("userid", "name channelName image")
      .lean();
    if (!updated) {
      return res.status(409).json({
        code: "COMMENT_VERSION_CONFLICT",
        message: "This comment changed elsewhere. Reload it before editing again.",
      });
    }
    return res.json({ comment: toPublicComment(updated, null, req.appUser._id) });
  } catch (error) {
    console.error("Unable to edit comment:", error);
    return res.status(500).json({ message: "The comment could not be edited." });
  }
};

export const deletecomment = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    return res.status(404).json({ message: "Comment unavailable." });
  }

  try {
    const existing = await Comment.findOne({ _id: id, userid: req.appUser._id });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ message: "Comment unavailable." });
    }
    const currentVersion = Number.isInteger(existing.version) ? existing.version : 0;
    const versionFilter =
      currentVersion === 0
        ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
        : { version: currentVersion };
    const updated = await Comment.findOneAndUpdate(
      {
        _id: id,
        userid: req.appUser._id,
        deletedAt: null,
        ...versionFilter,
      },
      {
        $set: { commentbody: "", deletedAt: new Date() },
        $inc: { version: 1 },
        $push: {
          history: {
            action: "deleted",
            actorId: req.appUser._id,
            previousBody: existing.commentbody,
            nextBody: null,
          },
        },
      },
      { new: true },
    );
    if (!updated) {
      return res.status(409).json({
        code: "COMMENT_VERSION_CONFLICT",
        message: "This comment changed elsewhere. Reload it before deleting again.",
      });
    }
    return res.json({ comment: true });
  } catch (error) {
    console.error("Unable to delete comment:", error);
    return res.status(500).json({ message: "The comment could not be deleted." });
  }
};

export const reactToComment = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body ?? {};
  if (!isValidObjectId(id) || !["like", "dislike", null].includes(type)) {
    return res.status(400).json({ message: "Choose like, dislike, or remove your reaction." });
  }

  try {
    const target = await Comment.findOne({
      _id: id,
      deletedAt: null,
      moderationStatus: { $ne: "hidden" },
    }).select("_id");
    if (!target) return res.status(404).json({ message: "Comment unavailable." });

    const existing = await CommentReaction.findOne({
      commentId: id,
      userId: req.appUser._id,
    });
    if (type === null || existing?.type === type) {
      await CommentReaction.deleteOne({ commentId: id, userId: req.appUser._id });
    } else {
      await CommentReaction.findOneAndUpdate(
        { commentId: id, userId: req.appUser._id },
        { $set: { type } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    const counts = await CommentReaction.aggregate([
      { $match: { commentId: target._id } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);
    const result = { likeCount: 0, dislikeCount: 0, myReaction: null };
    for (const entry of counts) {
      if (entry._id === "like") result.likeCount = entry.count;
      if (entry._id === "dislike") result.dislikeCount = entry.count;
    }
    const current = await CommentReaction.findOne({
      commentId: id,
      userId: req.appUser._id,
    }).select("type");
    result.myReaction = current?.type || null;
    return res.json(result);
  } catch (error) {
    console.error("Unable to update comment reaction:", error);
    return res.status(500).json({ message: "The reaction could not be saved." });
  }
};

export const reportComment = async (req, res) => {
  const { id } = req.params;
  const { reason, details = "" } = req.body ?? {};
  if (!isValidObjectId(id) || !REPORT_REASONS.has(reason)) {
    return res.status(400).json({ message: "Choose a valid reason for reporting this comment." });
  }
  if (typeof details !== "string" || details.length > 500) {
    return res.status(400).json({ message: "Report details must be 500 characters or fewer." });
  }

  try {
    const target = await Comment.findOne({
      _id: id,
      deletedAt: null,
      moderationStatus: { $ne: "hidden" },
    });
    if (!target) return res.status(404).json({ message: "Comment unavailable." });
    if (String(target.userid) === String(req.appUser._id)) {
      return res.status(400).json({ message: "You cannot report your own comment." });
    }

    const report = await CommentReport.create({
      commentId: target._id,
      reporterId: req.appUser._id,
      reason,
      details: details.trim(),
      history: [
        {
          actorId: req.appUser._id,
          action: "reported",
          toStatus: "open",
        },
      ],
    });
    await Comment.updateOne(
      { _id: target._id, moderationStatus: "visible" },
      {
        $set: { moderationStatus: "flagged" },
        $push: {
          history: {
            action: "flagged",
            actorId: req.appUser._id,
            note: reason,
          },
        },
      },
    );
    return res.status(201).json({ reportId: report._id, status: report.status });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "You have already reported this comment." });
    }
    console.error("Unable to report comment:", error);
    return res.status(500).json({ message: "The report could not be submitted." });
  }
};

export const searchMentionUsers = async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().replace(/^@/, "") : "";
  if (query.length < 2) return res.json([]);
  try {
    const expression = new RegExp(escapeRegex(query), "iu");
    const users = await Auth.find({
      $or: [{ name: expression }, { channelName: expression }],
    })
      .select("_id name channelName image")
      .limit(10)
      .lean();
    return res.json(
      users.map((entry) => ({
        id: String(entry._id),
        name: entry.name,
        username: makeUsername(entry),
        image: entry.image || "",
      })),
    );
  } catch (error) {
    console.error("Unable to search mention users:", error);
    return res.status(500).json({ message: "Users could not be searched." });
  }
};

export const translateComment = async (req, res) => {
  const { text, targetLanguage } = req.body ?? {};
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    return res.status(400).json({
      message: "Comment text must contain 1 to 2000 characters.",
    });
  }
  if (!isSupportedTranslationLanguage(targetLanguage)) {
    return res.status(400).json({ message: "The target language is not supported." });
  }
  if (isCommentTranslationRateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
    return res.status(429).json({
      message: "Too many translation requests. Please wait before trying again.",
    });
  }

  try {
    const translation = await translateCommentText(text, targetLanguage);
    return res.json(translation);
  } catch (error) {
    if (error instanceof CommentTranslationError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Unable to translate comment:", error);
    return res.status(502).json({
      message: "The comment could not be translated. Try again shortly.",
    });
  }
};

export const listCommentReports = async (req, res) => {
  const requestedStatus = req.query.status;
  const filter = REPORT_STATUSES.has(requestedStatus) || requestedStatus === "open"
    ? { status: requestedStatus }
    : {};
  try {
    const reports = await CommentReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("reporterId", "name image")
      .populate("reviewedBy", "name image")
      .populate({
        path: "commentId",
        populate: { path: "userid", select: "name channelName image" },
      })
      .lean();
    return res.json(reports);
  } catch (error) {
    console.error("Unable to load comment reports:", error);
    return res.status(500).json({ message: "Moderation reports could not be loaded." });
  }
};

export const reviewCommentReport = async (req, res) => {
  const { reportId } = req.params;
  const { status, action = "none", note = "" } = req.body ?? {};
  if (
    !isValidObjectId(reportId) ||
    !REPORT_STATUSES.has(status) ||
    !MODERATION_ACTIONS.has(action) ||
    typeof note !== "string" ||
    note.length > 500
  ) {
    return res.status(400).json({ message: "The moderation decision is invalid." });
  }

  try {
    const report = await CommentReport.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report unavailable." });
    const comment = await Comment.findById(report.commentId);
    if (!comment) return res.status(404).json({ message: "Comment unavailable." });
    const now = new Date();

    if (action === "hide") {
      comment.moderationStatus = "hidden";
      comment.history.push({
        action: "hidden",
        actorId: req.appUser._id,
        note: note.trim() || `Report ${report._id} reviewed.`,
        createdAt: now,
      });
    } else if (action === "restore") {
      comment.moderationStatus = "visible";
      comment.history.push({
        action: "restored",
        actorId: req.appUser._id,
        note: note.trim() || `Report ${report._id} reviewed.`,
        createdAt: now,
      });
    } else if (action === "delete" && !comment.deletedAt) {
      comment.history.push({
        action: "deleted",
        actorId: req.appUser._id,
        previousBody: comment.commentbody,
        note: note.trim() || `Report ${report._id} reviewed.`,
        createdAt: now,
      });
      comment.commentbody = "";
      comment.deletedAt = now;
      comment.version = (comment.version || 0) + 1;
    }
    await comment.save();

    const oldStatus = report.status;
    report.status = status;
    report.reviewedBy = req.appUser._id;
    report.history.push({
      actorId: req.appUser._id,
      action: "reviewed",
      fromStatus: oldStatus,
      toStatus: status,
      commentAction: action,
      note: note.trim() || null,
      createdAt: now,
    });
    await report.save();
    return res.json({ report });
  } catch (error) {
    console.error("Unable to review comment report:", error);
    return res.status(500).json({ message: "The moderation decision could not be saved." });
  }
};

export const getCommentModerationHistory = async (req, res) => {
  const { commentId } = req.params;
  if (!isValidObjectId(commentId)) {
    return res.status(400).json({ message: "A valid comment ID is required." });
  }
  try {
    const [comment, reports] = await Promise.all([
      Comment.findById(commentId).select("history moderationStatus deletedAt"),
      CommentReport.find({ commentId }).sort({ createdAt: -1 }).lean(),
    ]);
    if (!comment) return res.status(404).json({ message: "Comment unavailable." });
    return res.json({
      moderationStatus: comment.moderationStatus,
      deletedAt: comment.deletedAt,
      history: comment.history,
      reports,
    });
  } catch (error) {
    console.error("Unable to load comment moderation history:", error);
    return res.status(500).json({ message: "Comment history could not be loaded." });
  }
};
