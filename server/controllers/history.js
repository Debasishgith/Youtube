import History from "../models/History.js";
import Video from "../models/Video.js";
import mongoose from "mongoose";

export const handlehistory = async (req, res) => {
  const { videoId } = req.params;
  try {
    await History.create({ viewer: req.appUser._id, videoid: videoId });
    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ history: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const handleview = async (req, res) => {
  const { videoId } = req.params;
  try {
    await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;
  if (String(req.appUser._id) !== userId) {
    return res.status(403).json({ message: "You can only view your own history." });
  }
  try {
    const historyvideo = await History.find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "video",
      })
      .exec();
    return res.status(200).json(historyvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "A valid video ID is required." });
  }

  try {
    const videoExists = await Video.exists({ _id: videoId });
    if (!videoExists) {
      return res.status(404).json({ message: "Video not found." });
    }

    const progress = await History.findOne({
      viewer: req.appUser._id,
      videoid: videoId,
    })
      .sort({ progressUpdatedAt: -1, updatedAt: -1 })
      .select("positionSeconds durationSeconds completed progressUpdatedAt");

    return res.json({
      progress: progress
        ? {
            positionSeconds: progress.positionSeconds ?? 0,
            durationSeconds: progress.durationSeconds ?? 0,
            completed: progress.completed ?? false,
            updatedAt: progress.progressUpdatedAt ?? progress.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Unable to load watch progress:", error);
    return res.status(500).json({ message: "Watch progress could not be loaded." });
  }
};

export const saveWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  const { positionSeconds, durationSeconds, completed } = req.body ?? {};
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "A valid video ID is required." });
  }
  if (
    !Number.isFinite(positionSeconds) ||
    positionSeconds < 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    typeof completed !== "boolean"
  ) {
    return res.status(400).json({ message: "Valid watch progress is required." });
  }

  try {
    const videoExists = await Video.exists({ _id: videoId });
    if (!videoExists) {
      return res.status(404).json({ message: "Video not found." });
    }

    const progress = await History.findOneAndUpdate(
      { viewer: req.appUser._id, videoid: videoId },
      {
        $set: {
          positionSeconds: Math.min(positionSeconds, durationSeconds),
          durationSeconds,
          completed,
          progressUpdatedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        sort: { progressUpdatedAt: -1, updatedAt: -1 },
      },
    ).select("positionSeconds durationSeconds completed progressUpdatedAt");

    return res.json({
      progress: {
        positionSeconds: progress.positionSeconds,
        durationSeconds: progress.durationSeconds,
        completed: progress.completed,
        updatedAt: progress.progressUpdatedAt,
      },
    });
  } catch (error) {
    console.error("Unable to save watch progress:", error);
    return res.status(500).json({ message: "Watch progress could not be saved." });
  }
};
