import assert from "node:assert/strict";
import test from "node:test";
import {
  DOWNLOAD_PLAN_LIMITS,
  getDownloadPlanFilter,
  getDownloadQuota,
  getDownloadQuotaDayStart,
  getNextDownloadQuotaDayStart,
} from "../services/downloadQuota.js";

test("Free quota reservation matches legacy accounts without a stored plan", () => {
  assert.deepEqual(getDownloadPlanFilter("Free"), {
    $or: [
      { subscriptionPlan: "Free" },
      { subscriptionPlan: { $exists: false } },
    ],
  });
  assert.deepEqual(getDownloadPlanFilter("Gold"), {
    subscriptionPlan: "Gold",
  });
});

test("daily quota boundaries use IST midnight regardless of server timezone", () => {
  const beforeMidnightIST = new Date("2026-11-14T18:29:59.999Z");
  const atMidnightIST = new Date("2026-11-14T18:30:00.000Z");

  assert.equal(
    getDownloadQuotaDayStart(beforeMidnightIST).toISOString(),
    "2026-11-13T18:30:00.000Z",
  );
  assert.equal(
    getDownloadQuotaDayStart(atMidnightIST).toISOString(),
    "2026-11-14T18:30:00.000Z",
  );
  assert.equal(
    getNextDownloadQuotaDayStart(getDownloadQuotaDayStart(atMidnightIST)).toISOString(),
    "2026-11-15T18:30:00.000Z",
  );
});

test("uses the established plan quotas and resets usage on the next IST day", () => {
  assert.deepEqual(DOWNLOAD_PLAN_LIMITS, {
    Free: 1,
    Bronze: 5,
    Silver: 15,
    Gold: 30,
  });

  const user = {
    subscriptionPlan: "Free",
    downloadsToday: 1,
    lastReset: new Date("2026-11-14T18:29:59.999Z"),
  };
  const quota = getDownloadQuota(user, new Date("2026-11-14T18:30:00.000Z"));

  assert.equal(quota.used, 0);
  assert.equal(quota.remaining, 1);
  assert.equal(quota.resetsAt.toISOString(), "2026-11-15T18:30:00.000Z");
});
