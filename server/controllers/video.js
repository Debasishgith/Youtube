import Videos from "../models/Video.js";
import mongoose from "mongoose";

export const uploadVideo = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "Please upload a valid video file." });
  }

  try {
    const { channelId } = req.params;
    if (!req.appUser || req.appUser._id.toString() !== channelId) {
      return res.status(403).json({ message: "Only the channel owner can upload videos." });
    }

    const file = new Videos({
      videotitle: req.body.videotitle,
      filename: req.file.originalname,
      filetype: req.file.mimetype,
      filepath: req.file.path,
      filesize: req.file.size,
      videochanel: req.appUser.channelName || req.appUser.name,
      uploader: req.appUser._id.toString(),
    });
    await file.save();
    return res.status(200).json({ message: "file uploaded successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong" });
  }
};

export const getAllVideo = async (req, res) => {
  try {
    const file = await Videos.find();
    res.status(200).send(file);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong" });
  }
};

export const getChannelVideos = async (req, res) => {
  const { channelId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(channelId)) {
    return res.status(400).json({ message: "Invalid channel ID" });
  }

  try {
    const videos = await Videos.find({ uploader: channelId }).sort({
      createdAt: -1,
    });
    return res.status(200).json(videos);
  } catch (error) {
    console.error("Unable to load channel videos:", error);
    return res.status(500).json({ message: "Unable to load channel videos" });
  }
};
