const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DOWNLOAD_PLAN_LIMITS = Object.freeze({
  Free: 1,
  Bronze: 5,
  Silver: 15,
  Gold: 30,
});

export const DOWNLOAD_PLAN_RANKS = Object.freeze({
  Free: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
});

export const getDownloadPlanFilter = (plan) =>
  plan === "Free"
    ? {
        $or: [
          { subscriptionPlan: "Free" },
          { subscriptionPlan: { $exists: false } },
        ],
      }
    : { subscriptionPlan: plan };

export const getDownloadQuotaDayStart = (date) => {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
};

export const getNextDownloadQuotaDayStart = (dayStart) =>
  new Date(dayStart.getTime() + DAY_MS);

export const getDownloadQuota = (user, now = new Date()) => {
  const limit = DOWNLOAD_PLAN_LIMITS[user.subscriptionPlan];
  const dayStart = getDownloadQuotaDayStart(now);
  const used =
    user.lastReset && new Date(user.lastReset) >= dayStart
      ? user.downloadsToday || 0
      : 0;

  return {
    plan: user.subscriptionPlan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: getNextDownloadQuotaDayStart(dayStart),
  };
};

export const formatDownloadQuotaReset = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
