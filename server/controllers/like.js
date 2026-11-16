import Video from "../models/Video.js";
import Like from "../models/Like.js";

export const handleLike = async (req, res) => {
  const { videoId } = req.params;
  try {
    const existingLike = await Like.findOne({
      viewer: req.appUser._id,
      videoid: videoId,
    });
    if (existingLike) {
      await Like.findByIdAndDelete(existingLike._id);
      await Video.findByIdAndUpdate(videoId, { $inc: { Like: -1 } });
      return res.status(200).json({ liked: false });
    } else {
      await Like.create({
        viewer: req.appUser._id,
        videoid: videoId,
      });
      await Video.findByIdAndUpdate(videoId, { $inc: { Like: 1 } });
      return res.status(200).json({ liked: true });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong" });
  }
};

export const getallLikedVideo = async (req, res) => {
  const { userId } = req.params;
  if (String(req.appUser._id) !== userId) {
    return res.status(403).json({ message: "You can only view your own likes." });
  }
  try {
    const likevideo = await Like.find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "video",
      })
      .exec();
    return res.status(200).json(likevideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
