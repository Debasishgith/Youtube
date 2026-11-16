import watchlater from "../models/WatchLater.js";

export const handlewatchlater = async (req, res) => {
  const { videoId } = req.params;
  try {
    const exisitingwatchlater = await watchlater.findOne({
      viewer: req.appUser._id,
      videoid: videoId,
    });
    if (exisitingwatchlater) {
      await watchlater.findByIdAndDelete(exisitingwatchlater._id);
      return res.status(200).json({ watchlater: false });
    } else {
      await watchlater.create({ viewer: req.appUser._id, videoid: videoId });
      return res.status(200).json({ watchlater: true });
    }
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
export const getallwatchlater = async (req, res) => {
  const { userId } = req.params;
  if (String(req.appUser._id) !== userId) {
    return res.status(403).json({ message: "You can only view your own watch list." });
  }
  try {
    const watchlatervideo = await watchlater
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "video",
      })
      .exec();
    return res.status(200).json(watchlatervideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
