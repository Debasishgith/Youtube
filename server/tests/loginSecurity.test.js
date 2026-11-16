import assert from "node:assert/strict";
import test from "node:test";
import {
  hashOtp,
  getChangedMetadataFields,
  getRequestMetadata,
  isOtpSecretAvailable,
  normalizeIpAddress,
  requiresOtpForMetadataChange,
  resolveThemePreference,
  sameDeviceMetadata,
  verifyOtp,
} from "../services/loginSecurity.js";

const originalOtpSecret = process.env.LOGIN_OTP_SECRET;
process.env.LOGIN_OTP_SECRET = "test-only-login-otp-secret-at-least-32-chars";

test("OTP hashes verify only the matching challenge and code", () => {
  const challengeId = "challenge-123";
  const code = "123456";
  const hash = hashOtp(challengeId, code);

  assert.notEqual(hash, code);
  assert.equal(verifyOtp(challengeId, code, hash), true);
  assert.equal(verifyOtp(challengeId, "654321", hash), false);
  assert.equal(verifyOtp("another-challenge", code, hash), false);
  assert.equal(verifyOtp(challengeId, "12", hash), false);
});

test("OTP signing derives a stable secret from Firebase Admin credentials", () => {
  const originalOtpSecret = process.env.LOGIN_OTP_SECRET;
  const originalFirebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  delete process.env.LOGIN_OTP_SECRET;
  process.env.FIREBASE_PRIVATE_KEY =
    "test-only-private-key-material-that-is-long-enough-for-this-test-0123456789";

  try {
    const firstHash = hashOtp("challenge-456", "123456");
    const secondHash = hashOtp("challenge-456", "123456");
    assert.equal(isOtpSecretAvailable(), true);
    assert.equal(firstHash, secondHash);
    assert.equal(verifyOtp("challenge-456", "123456", firstHash), true);
  } finally {
    if (originalOtpSecret === undefined) delete process.env.LOGIN_OTP_SECRET;
    else process.env.LOGIN_OTP_SECRET = originalOtpSecret;
    if (originalFirebasePrivateKey === undefined) delete process.env.FIREBASE_PRIVATE_KEY;
    else process.env.FIREBASE_PRIVATE_KEY = originalFirebasePrivateKey;
  }
});

test("new browser, operating system, device, IP, or location requires OTP", () => {
  const known = {
    browser: "Chrome",
    browserVersion: "130.0",
    os: "Windows",
    osVersion: "10",
    deviceType: "Desktop",
    deviceModel: null,
    ipAddress: "203.0.113.1",
    city: "Pune",
    state: "Maharashtra",
  };

  assert.equal(
    requiresOtpForMetadataChange(known, { ...known, browserVersion: "131.0" }),
    false,
  );
  assert.deepEqual(
    getChangedMetadataFields(known, { ...known, ipAddress: "203.0.113.2" }),
    ["ipAddress"],
  );
  for (const change of [
    { browser: "Firefox" },
    { os: "macOS" },
    { deviceType: "Mobile" },
    { deviceModel: "Phone" },
    { ipAddress: "203.0.113.2" },
    { city: "Mumbai" },
    { state: "Goa" },
  ]) {
    assert.equal(
      requiresOtpForMetadataChange(known, { ...known, ...change }),
      true,
    );
  }
});

test("normalizes IPv4 and IPv6 loopback addresses consistently", () => {
  assert.equal(normalizeIpAddress("::1"), "127.0.0.1");
  assert.equal(normalizeIpAddress("0:0:0:0:0:0:0:1"), "127.0.0.1");
  assert.equal(normalizeIpAddress("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeIpAddress(" 203.0.113.1 "), "203.0.113.1");
  assert.equal(normalizeIpAddress(null), null);
});

test("uses stable null location fields when GeoIP data is unavailable", async () => {
  const originalGeoIpPath = process.env.GEOIP_DATABASE_PATH;
  delete process.env.GEOIP_DATABASE_PATH;

  try {
    const metadata = await getRequestMetadata({
      ip: "127.0.0.1",
      get: (name) =>
        name.toLowerCase() === "user-agent"
          ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"
          : undefined,
    });

    assert.equal(metadata.city, null);
    assert.equal(metadata.state, null);
    assert.equal(metadata.country, null);
    assert.equal(metadata.latitude, null);
    assert.equal(metadata.longitude, null);
  } finally {
    if (originalGeoIpPath === undefined) delete process.env.GEOIP_DATABASE_PATH;
    else process.env.GEOIP_DATABASE_PATH = originalGeoIpPath;
  }
});

test("trusted devices require the same browser, device, IP, and location", () => {
  const device = {
    browser: "Chrome",
    os: "Windows",
    deviceType: "Desktop",
    deviceModel: null,
    metadata: {
      ipAddress: "203.0.113.1",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
    },
  };
  const current = {
    browser: "Chrome",
    os: "Windows",
    deviceType: "Desktop",
    deviceModel: null,
    ipAddress: "203.0.113.1",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
  };

  assert.equal(sameDeviceMetadata(device, current), true);
  assert.equal(
    sameDeviceMetadata(device, { ...current, ipAddress: "203.0.113.2" }),
    false,
  );
});

test("automatic theme uses the 05:00 inclusive and 12:00 exclusive IST window", () => {
  assert.equal(resolveThemePreference("auto", new Date("2025-01-02T23:29:00Z")), "dark");
  assert.equal(resolveThemePreference("auto", new Date("2025-01-02T23:30:00Z")), "light");
  assert.equal(resolveThemePreference("auto", new Date("2025-01-03T06:29:00Z")), "light");
  assert.equal(resolveThemePreference("auto", new Date("2025-01-03T06:30:00Z")), "dark");
  assert.equal(resolveThemePreference("light", new Date("2025-01-03T06:30:00Z")), "light");
  assert.equal(resolveThemePreference("dark", new Date("2025-01-02T23:30:00Z")), "dark");
});

test.after(() => {
  if (originalOtpSecret === undefined) delete process.env.LOGIN_OTP_SECRET;
  else process.env.LOGIN_OTP_SECRET = originalOtpSecret;
});
