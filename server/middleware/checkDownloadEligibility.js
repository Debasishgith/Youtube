import User from "../models/User.js";
import Download from "../models/Download.js";

const planLimits = { Free: 1, Bronze: 5, Silver: 15, Gold: 30 };

export const checkDownloadEligibility = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ message: "User account not found" });
    }

    // Reset quota daily
    if (
      !user.lastReset ||
      new Date(user.lastReset).toDateString() !== new Date().toDateString()
    ) {
      user.downloadsToday = 0;
      user.lastReset = new Date();
      await user.save();
    }

    // Subscription expiry check
    if (user.subscriptionExpiry && user.subscriptionExpiry < new Date()) {
      return res.status(403).json({ message: "Subscription expired" });
    }

    // Quota check
    const downloadLimit = planLimits[user.subscriptionPlan];
    if (downloadLimit === undefined) {
      return res.status(403).json({ message: "Invalid subscription plan" });
    }

    if (user.downloadsToday >= downloadLimit) {
      return res.status(403).json({ message: "Download limit reached" });
    }

    // Duplicate prevention (same video within 24h)
    const duplicate = await Download.findOne({
      userId: user._id,
      videoId: req.params.videoId,
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      status: "completed",
    });
    if (duplicate) {
      return res
        .status(403)
        .json({ message: "Already downloaded this video today" });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
