import fs from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import Auth from "../models/Auth.js";
import Download from "../models/Download.js";
import Video from "../models/Video.js";
import UAParser from "ua-parser-js";
import { normalizeIpAddress } from "../services/loginSecurity.js";
import {
  DOWNLOAD_PLAN_LIMITS,
  DOWNLOAD_PLAN_RANKS,
  formatDownloadQuotaReset,
  getDownloadQuota as calculateDownloadQuota,
  getDownloadPlanFilter,
  getDownloadQuotaDayStart,
  getNextDownloadQuotaDayStart,
} from "../services/downloadQuota.js";

const duplicateGracePeriod = 24 * 60 * 60 * 1000;
const staleLockPeriod = duplicateGracePeriod;
const serverUploadsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads",
);

const getSubscriptionError = (user, now) => {
  if (!DOWNLOAD_PLAN_LIMITS[user.subscriptionPlan]) {
    return {
      status: 403,
      code: "INVALID_SUBSCRIPTION_PLAN",
      message: "Your subscription plan is not valid. Please contact support.",
    };
  }

  if (
    user.subscriptionPlan !== "Free" &&
    (!user.subscriptionExpiry || new Date(user.subscriptionExpiry) <= now)
  ) {
    return {
      status: 403,
      code: "SUBSCRIPTION_EXPIRED",
      message: "Your subscription has expired. Renew your plan to download.",
    };
  }

  return null;
};

const getDownloadClientMetadata = (req) => {
  const userAgent = req.get("user-agent") || "";
  const parsed = new UAParser(userAgent).getResult();
  const deviceType =
    parsed.device.type === "tablet"
      ? "Tablet"
      : parsed.device.type === "mobile"
        ? "Mobile"
        : "Desktop";
  return {
    ipAddress: normalizeIpAddress(req.ip),
    deviceInfo: req.get("x-device-id") || req.get("sec-ch-ua-platform"),
    browser: parsed.browser.name || "Unknown",
    browserVersion: parsed.browser.version || null,
    os: parsed.os.name || "Unknown",
    osVersion: parsed.os.version || null,
    deviceType,
    deviceModel: parsed.device.model || null,
    userAgent,
  };
};

const auditAttempt = (req, user, videoId, details) =>
  Download.create({
    userId: user?._id,
    videoId:
      videoId && mongoose.Types.ObjectId.isValid(videoId) ? videoId : undefined,
    firebaseUid: req.firebaseUser?.uid,
    timestamp: new Date(),
    ...getDownloadClientMetadata(req),
    subscriptionPlan: user?.subscriptionPlan,
    quotaRemaining: user ? calculateDownloadQuota(user).remaining : undefined,
    ...details,
  });

const rejectDownload = async (
  req,
  res,
  user,
  videoId,
  status,
  code,
  message,
  failureReason = message,
) => {
  await auditAttempt(req, user, videoId, {
    status: "failed",
    outcome: "rejected",
    failureReason,
  });
  return res.status(status).json({ code, message });
};

const reserveQuota = async (user, now) => {
  const limit = DOWNLOAD_PLAN_LIMITS[user.subscriptionPlan];
  const dayStart = getDownloadQuotaDayStart(now);
  const normalizedLastReset = {
    $convert: {
      input: "$lastReset",
      to: "date",
      onError: new Date(0),
      onNull: new Date(0),
    },
  };
  const normalizedDownloadCount = {
    $convert: {
      input: "$downloadsToday",
      to: "int",
      onError: 0,
      onNull: 0,
    },
  };
  const lastResetBeforeToday = { $lt: [normalizedLastReset, dayStart] };
  const quotaAvailable = {
    $or: [
      lastResetBeforeToday,
      { $lt: [normalizedDownloadCount, limit] },
    ],
  };
  const eligibility = [quotaAvailable];
  if (user.subscriptionPlan !== "Free") {
    eligibility.push({
      $gt: [
        {
          $convert: {
            input: "$subscriptionExpiry",
            to: "date",
            onError: null,
            onNull: null,
          },
        },
        now,
      ],
    });
  }

  return Auth.findOneAndUpdate(
    {
      _id: user._id,
      ...getDownloadPlanFilter(user.subscriptionPlan),
      $expr: { $and: eligibility },
    },
    [
      {
        $set: {
          subscriptionPlan: {
            $ifNull: ["$subscriptionPlan", user.subscriptionPlan],
          },
          downloadsToday: {
            $cond: [
              lastResetBeforeToday,
              1,
              { $add: [normalizedDownloadCount, 1] },
            ],
          },
          lastReset: {
            $cond: [lastResetBeforeToday, now, normalizedLastReset],
          },
        },
      },
    ],
    { new: true, updatePipeline: true },
  );
};

const getSafeFilePath = async (video) => {
  if (typeof video.filepath !== "string" || !video.filepath.trim()) {
    return null;
  }

  const uploadDirectories = [
    path.resolve(process.cwd(), "uploads"),
    serverUploadsDirectory,
  ];
  const storedPath = path.resolve(video.filepath);
  const candidates = [storedPath];
  if (!path.isAbsolute(video.filepath)) {
    candidates.push(
      path.resolve(serverUploadsDirectory, path.basename(video.filepath)),
    );
  }

  for (const filePath of [...new Set(candidates)]) {
    const isInUploadDirectory = uploadDirectories.some((directory) => {
      const relativePath = path.relative(directory, filePath);
      return (
        relativePath !== "" &&
        !relativePath.startsWith("..") &&
        !path.isAbsolute(relativePath)
      );
    });
    if (!isInUploadDirectory) continue;

    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) return { filePath, size: stats.size };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return null;
};

export const downloadVideo = async (req, res) => {
  const { videoId } = req.params;
  const user = req.appUser;
  const now = new Date();
  let downloadLockId;
  let quotaReserved = false;
  let auditRecord;
  let processingStage = "validating video";

  try {
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        400,
        "INVALID_VIDEO_ID",
        "The requested video is invalid.",
      );
    }

    const subscriptionError = getSubscriptionError(user, now);
    if (subscriptionError) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        subscriptionError.status,
        subscriptionError.code,
        subscriptionError.message,
      );
    }

    processingStage = "loading video record";
    const video = await Video.findById(videoId);
    if (!video) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        404,
        "VIDEO_NOT_FOUND",
        "This video is no longer available.",
      );
    }

    const requiredRank = DOWNLOAD_PLAN_RANKS[video.minimumSubscriptionPlan || "Free"];
    if (
      requiredRank === undefined ||
      DOWNLOAD_PLAN_RANKS[user.subscriptionPlan] < requiredRank
    ) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        403,
        "VIDEO_RESTRICTED",
        "This video is not available for your current plan.",
      );
    }

    const deviceId = req.get("x-device-id");
    if (
      user.deviceRestrictionEnabled &&
        (!deviceId || !(user.registeredDevices || []).includes(deviceId))
    ) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        403,
        "DEVICE_NOT_AUTHORIZED",
        "This device is not authorized to download from your account.",
      );
    }

    processingStage = "checking video file";
    const safeFile = await getSafeFilePath(video);
    if (!safeFile) {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        404,
        "VIDEO_FILE_NOT_FOUND",
        "The video file is currently unavailable.",
      );
    }

    processingStage = "checking duplicate download";
    const recentDownloads = await Download.find({
      userId: user._id,
      videoId,
      completedAt: { $gte: new Date(now.getTime() - duplicateGracePeriod) },
      status: { $in: ["completed", "in_progress"] },
    })
      .sort({ timestamp: -1 })
      .limit(1);
    const recentDownload = recentDownloads[0];
    if (recentDownload?.status === "in_progress") {
      return await rejectDownload(
        req,
        res,
        user,
        videoId,
        429,
        "DOWNLOAD_IN_PROGRESS",
        "This video is already being downloaded. Please wait for it to finish.",
      );
    }
    const isDuplicate = recentDownload?.status === "completed";

    if (!isDuplicate) {
      downloadLockId = new mongoose.Types.ObjectId();
      const staleBefore = new Date(now.getTime() - staleLockPeriod);
      const objectVideoId = new mongoose.Types.ObjectId(videoId);
      processingStage = "locking concurrent download";
      const lockResult = await Auth.updateOne(
        {
          _id: user._id,
          downloadLocks: {
            $not: {
              $elemMatch: {
                videoId: objectVideoId,
                createdAt: { $gte: staleBefore },
              },
            },
          },
        },
        [
          {
            $set: {
              downloadLocks: {
                $concatArrays: [
                  {
                    $filter: {
                      input: { $ifNull: ["$downloadLocks", []] },
                      as: "lock",
                      cond: {
                        $or: [
                          { $ne: ["$$lock.videoId", objectVideoId] },
                          { $gte: ["$$lock.createdAt", staleBefore] },
                        ],
                      },
                    },
                  },
                  [
                    {
                      videoId: objectVideoId,
                      lockId: downloadLockId,
                      createdAt: now,
                    },
                  ],
                ],
              },
            },
          },
        ],
        { updatePipeline: true },
      );
      if (!lockResult.matchedCount) {
        return await rejectDownload(
          req,
          res,
          user,
          videoId,
          429,
          "DOWNLOAD_IN_PROGRESS",
          "This video is already being downloaded. Please wait for it to finish.",
        );
      }
    }

    processingStage = "creating download audit record";
    auditRecord = await auditAttempt(req, user, videoId, {
      status: "in_progress",
      outcome: "accepted",
      fileSize: safeFile.size,
      quotaRemaining: calculateDownloadQuota(user, now).remaining,
      quotaDay: getDownloadQuotaDayStart(now),
    });

    if (!isDuplicate) {
      processingStage = "reserving download quota";
      const reservedUser = await reserveQuota(user, now);
      if (!reservedUser) {
        const latestUser = await Auth.findById(user._id);
        const latestSubscriptionError = latestUser
          ? getSubscriptionError(latestUser, new Date())
          : null;
        const latestQuota = latestUser
          ? calculateDownloadQuota(latestUser)
          : null;
        const quotaStateMismatch =
          Boolean(latestQuota?.remaining) && !latestSubscriptionError;
        if (quotaStateMismatch) {
          console.error("Download quota reservation did not match account state:", {
            userId: String(user._id),
            requestedPlan: user.subscriptionPlan,
            currentPlan: latestUser.subscriptionPlan,
            downloadsToday: latestUser.downloadsToday,
            lastReset: latestUser.lastReset,
            quotaDay: getDownloadQuotaDayStart(now),
            remaining: latestQuota.remaining,
          });
        }
        const rejection =
          latestSubscriptionError ||
          (quotaStateMismatch
            ? {
                status: 409,
                code: "DOWNLOAD_QUOTA_STATE_CHANGED",
                message:
                  "Your download quota changed while the request was processing. Your quota has been refreshed; please try again.",
              }
            : !latestUser
              ? {
                  status: 401,
                  code: "ACCOUNT_NOT_FOUND",
                  message: "Your account could not be verified. Please sign in again.",
                }
              : {
                  status: 429,
                  code: "DOWNLOAD_QUOTA_EXCEEDED",
                  message: `You've reached your ${latestUser.subscriptionPlan} download limit. Your quota resets at ${formatDownloadQuotaReset(latestQuota.resetsAt)}. Upgrade your plan for more downloads.`,
                });
        processingStage = "updating download audit record";
        await Download.findByIdAndUpdate(auditRecord._id, {
          $set: {
            status: "failed",
            outcome: "rejected",
            failureReason: rejection.message,
            quotaRemaining: latestQuota?.remaining ?? 0,
          },
        });
        await Auth.updateOne(
          { _id: user._id },
          { $pull: { downloadLocks: { lockId: downloadLockId } } },
        );
        return res
          .status(rejection.status)
          .json({
            code: rejection.code,
            message: rejection.message,
            ...(latestQuota ? { quota: latestQuota } : {}),
          });
      }

      try {
        const quotaDay = getDownloadQuotaDayStart(now);
        await Download.findByIdAndUpdate(auditRecord._id, {
          $set: {
            quotaDeducted: true,
            quotaDay,
            quotaRemaining: Math.max(
              0,
              DOWNLOAD_PLAN_LIMITS[reservedUser.subscriptionPlan] -
                reservedUser.downloadsToday,
            ),
          },
        });
        quotaReserved = true;
      } catch (error) {
        const quotaDay = getDownloadQuotaDayStart(now);
        const nextQuotaDay = getNextDownloadQuotaDayStart(quotaDay);
        try {
          await Auth.updateOne(
            {
              _id: reservedUser._id,
              lastReset: { $gte: quotaDay, $lt: nextQuotaDay },
            },
            { $inc: { downloadsToday: -1 } },
          );
        } catch (refundError) {
          console.error("Unable to restore quota after audit failure:", refundError);
        }
        quotaReserved = false;
        await Auth.updateOne(
          { _id: user._id },
          { $pull: { downloadLocks: { lockId: downloadLockId } } },
        );
        throw error;
      }
    } else {
      processingStage = "updating duplicate download audit record";
      await Download.findByIdAndUpdate(auditRecord._id, {
        $set: { quotaRemaining: calculateDownloadQuota(user, now).remaining },
      });
    }

    let finalized = false;
    const finalize = async (status, error) => {
      if (finalized) return;
      finalized = true;

      try {
        await Download.findByIdAndUpdate(auditRecord._id, {
          $set: {
            status,
            outcome: status,
            ...(status === "completed" ? { completedAt: new Date() } : {}),
            ...(error ? { failureReason: error.message } : {}),
          },
        });
      } finally {
        if (quotaReserved && status !== "completed") {
          const quotaDay =
            auditRecord.quotaDay || getDownloadQuotaDayStart(now);
          const nextQuotaDay = getNextDownloadQuotaDayStart(quotaDay);
          await Auth.updateOne(
            {
              _id: user._id,
              lastReset: { $gte: quotaDay, $lt: nextQuotaDay },
              downloadsToday: { $gt: 0 },
            },
            { $inc: { downloadsToday: -1 } },
          );
          quotaReserved = false;
        }
        if (downloadLockId) {
          await Auth.updateOne(
            { _id: user._id },
            { $pull: { downloadLocks: { lockId: downloadLockId } } },
          );
        }
      }
    };

    res.once("finish", () => {
      finalize("completed").catch((error) =>
        console.error("Unable to finalize download audit record:", error),
      );
    });
    res.once("close", () => {
      if (!res.writableFinished) {
        finalize("interrupted", new Error("The client interrupted the download.")).catch(
          (error) =>
            console.error("Unable to finalize interrupted download:", error),
        );
      }
    });

    processingStage = "starting video file transfer";
    const downloadName =
      typeof video.filename === "string" && video.filename.trim()
        ? path.basename(video.filename)
        : `${video.videotitle || "video"}.mp4`;
    res.download(safeFile.filePath, downloadName, (error) => {
      if (!error) return;

      finalize("failed", error).catch((finalizeError) =>
        console.error("Unable to finalize failed download:", finalizeError),
      );
      if (res.headersSent) {
        res.destroy(error);
      } else {
        res.status(500).json({
          code: "DOWNLOAD_FAILED",
          message: "The video could not be downloaded. Your quota will be restored.",
        });
      }
    });
  } catch (error) {
    console.error(`Unable to process video download during ${processingStage}:`, error);
    if (downloadLockId) {
      await Auth.updateOne(
        { _id: user._id },
        { $pull: { downloadLocks: { lockId: downloadLockId } } },
      ).catch((cleanupError) =>
        console.error("Unable to release download lock:", cleanupError),
      );
    }
    if (quotaReserved) {
      const quotaDay = getDownloadQuotaDayStart(now);
      const nextQuotaDay = getNextDownloadQuotaDayStart(quotaDay);
      await Auth.updateOne(
        {
          _id: user._id,
          lastReset: { $gte: quotaDay, $lt: nextQuotaDay },
          downloadsToday: { $gt: 0 },
        },
        { $inc: { downloadsToday: -1 } },
      ).catch((refundError) =>
        console.error("Unable to restore download quota:", refundError),
      );
    }
    if (!res.headersSent) {
      try {
        if (auditRecord) {
          await Download.findByIdAndUpdate(auditRecord._id, {
            $set: {
              status: "failed",
              outcome: "failed",
              failureReason: error.message,
            },
          });
          return res.status(500).json({
            code: "DOWNLOAD_PROCESSING_FAILED",
            message: "The download could not be processed. Please try again.",
            stage: processingStage,
          });
        }
        return await rejectDownload(
          req,
          res,
          user,
          videoId,
          500,
          "DOWNLOAD_PROCESSING_FAILED",
          "The download could not be processed. Please try again.",
        );
      } catch (auditError) {
        console.error("Unable to record failed download attempt:", auditError);
        return res.status(500).json({
          code: "DOWNLOAD_PROCESSING_FAILED",
          message: "The download could not be processed. Please try again.",
          stage: processingStage,
        });
      }
    } else {
      res.destroy(error);
    }
  }
};

export const getDownloadQuota = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({
      code: "INVALID_VIDEO_ID",
      message: "The requested video is invalid.",
    });
  }

  try {
    const now = new Date();
    const video = await Video.findById(videoId).select(
      "minimumSubscriptionPlan filepath filename videotitle",
    );
    if (!video) {
      return res.status(404).json({
        code: "VIDEO_NOT_FOUND",
        message: "This video is no longer available.",
      });
    }

    const subscriptionError = getSubscriptionError(req.appUser, now);
    const requiredPlan = video.minimumSubscriptionPlan || "Free";
    const planAllowed =
      DOWNLOAD_PLAN_RANKS[requiredPlan] !== undefined &&
      DOWNLOAD_PLAN_RANKS[req.appUser.subscriptionPlan] >=
        DOWNLOAD_PLAN_RANKS[requiredPlan];
    const deviceId = req.get("x-device-id");
    const deviceAllowed =
      !req.appUser.deviceRestrictionEnabled ||
      Boolean(
        deviceId &&
          (req.appUser.registeredDevices || []).includes(deviceId),
      );
    const videoAvailable = Boolean(await getSafeFilePath(video));
    const duplicate = await Download.exists({
      userId: req.appUser._id,
      videoId,
      completedAt: { $gte: new Date(now.getTime() - duplicateGracePeriod) },
      status: "completed",
    });
    const quota = calculateDownloadQuota(req.appUser, now);

    return res.json({
      ...quota,
      subscriptionActive: !subscriptionError,
      subscriptionMessage: subscriptionError?.message,
      requiredPlan,
      videoAllowed: planAllowed,
      videoAvailable,
      deviceAllowed,
      duplicateDownload: Boolean(duplicate),
      canDownload:
        !subscriptionError &&
        planAllowed &&
        videoAvailable &&
        deviceAllowed &&
        (quota.remaining > 0 || Boolean(duplicate)),
    });
  } catch (error) {
    console.error("Unable to load download eligibility:", error);
    return res.status(500).json({
      code: "DOWNLOAD_ELIGIBILITY_FAILED",
      message: "Download eligibility could not be loaded.",
    });
  }
};

export const getMyDownloads = async (req, res) => {
  const allowedStatuses = ["in_progress", "completed", "failed", "interrupted"];
  const { status, sort = "newest" } = req.query;
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      code: "INVALID_STATUS_FILTER",
      message: "The requested download status is invalid.",
    });
  }
  if (!["newest", "oldest"].includes(sort)) {
    return res.status(400).json({
      code: "INVALID_SORT_ORDER",
      message: "Sort order must be newest or oldest.",
    });
  }
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 50);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return res.status(400).json({
      code: "INVALID_PAGINATION",
      message: "Page must be positive and page size must be from 1 to 100.",
    });
  }

  try {
    const now = new Date();
    const filter = { userId: req.appUser._id };
    if (status) filter.status = status;
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
      if (
        Number.isNaN(filter.timestamp.$gte?.getTime()) ||
        Number.isNaN(filter.timestamp.$lte?.getTime())
      ) {
        return res.status(400).json({
          code: "INVALID_DATE_FILTER",
          message: "Enter valid download date filters.",
        });
      }
    }

    const [total, downloads] = await Promise.all([
      Download.countDocuments(filter),
      Download.find(filter)
        .populate({
          path: "videoId",
          select: "videotitle filename filepath filesize",
        })
        .sort({ timestamp: sort === "oldest" ? 1 : -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    return res.json({
      quota: calculateDownloadQuota(req.appUser, now),
      downloads,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Unable to load download history:", error);
    return res.status(500).json({
      code: "DOWNLOAD_HISTORY_FAILED",
      message: "Download history could not be loaded.",
    });
  }
};

export const getDownloadAudit = async (req, res) => {
  if (req.appUser.role !== "admin") {
    return res.status(403).json({
      code: "ADMIN_REQUIRED",
      message: "Administrator access is required.",
    });
  }

  try {
    const filter = {};
    for (const field of ["userId", "videoId", "status"]) {
      if (!req.query[field]) continue;
      if (
        ["userId", "videoId"].includes(field) &&
        !mongoose.Types.ObjectId.isValid(req.query[field])
      ) {
        return res.status(400).json({
          code: "INVALID_AUDIT_FILTER",
          message: `${field} must be a valid ID.`,
        });
      }
      if (
        field === "status" &&
        !["in_progress", "completed", "failed", "interrupted"].includes(
          req.query.status,
        )
      ) {
        return res.status(400).json({
          code: "INVALID_AUDIT_FILTER",
          message: "status must be a valid download outcome.",
        });
      }
      filter[field] = req.query[field];
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
      if (req.query.to) filter.timestamp.$lte = new Date(req.query.to);
      if (
        Number.isNaN(filter.timestamp.$gte?.getTime()) ||
        Number.isNaN(filter.timestamp.$lte?.getTime())
      ) {
        return res.status(400).json({
          code: "INVALID_DATE_FILTER",
          message: "Enter valid audit date filters.",
        });
      }
    }

    const records = await Download.find(filter)
      .populate({ path: "userId", select: "name email" })
      .populate({ path: "videoId", select: "videotitle" })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();
    return res.json(records);
  } catch (error) {
    console.error("Unable to query download audit records:", error);
    return res.status(500).json({
      code: "DOWNLOAD_AUDIT_FAILED",
      message: "Download audit records could not be loaded.",
    });
  }
};
