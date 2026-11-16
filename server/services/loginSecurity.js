import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { open } from "maxmind";
import UAParser from "ua-parser-js";

const SESSION_COOKIE = "yt_session";
const TRUSTED_DEVICE_COOKIE = "yt_trusted";
let geoReaderPromise;

const readPositiveInteger = (name, fallback, maximum) => {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
};

export const getSessionDays = () =>
  readPositiveInteger("LOGIN_SESSION_DAYS", 10, 365);

export const getTrustedDeviceDays = () =>
  readPositiveInteger("TRUSTED_DEVICE_DAYS", 10, 365);

export const getOtpMinutes = () =>
  readPositiveInteger("LOGIN_OTP_MINUTES", 10, 60);

export const resolveThemePreference = (preference, now = new Date()) => {
  if (preference === "light" || preference === "dark") return preference;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 5 && hour < 12 ? "light" : "dark";
};

export const makeOpaqueToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

const getOtpSecret = () => {
  const secret = process.env.LOGIN_OTP_SECRET?.trim();
  if (secret) {
    if (secret.length < 32) {
      throw new Error("LOGIN_OTP_SECRET must contain at least 32 characters.");
    }
    return secret;
  }

  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (firebasePrivateKey && firebasePrivateKey.length >= 64) {
    return createHmac("sha256", firebasePrivateKey)
      .update("youtube-login-otp-v1")
      .digest();
  }

  throw new Error(
    "Set LOGIN_OTP_SECRET or configure a valid Firebase Admin private key.",
  );
};

export const isOtpSecretAvailable = () => {
  const secret = process.env.LOGIN_OTP_SECRET?.trim();
  if (secret) return secret.length >= 32;
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return Boolean(firebasePrivateKey && firebasePrivateKey.length >= 64);
};

export const makeOtp = () => String(randomInt(100000, 1000000));

export const hashOtp = (challengeId, code) =>
  createHmac("sha256", getOtpSecret())
    .update(`${challengeId}.${code}`)
    .digest("hex");

export const verifyOtp = (challengeId, code, expectedHash) => {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(expectedHash || "")) {
    return false;
  }
  const candidate = Buffer.from(hashOtp(challengeId, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

export const normalizeIpAddress = (ipAddress) => {
  if (typeof ipAddress !== "string") return null;
  const normalized = ipAddress.trim().replace(/^::ffff:/i, "").toLowerCase();
  return ["::1", "0:0:0:0:0:0:0:1"].includes(normalized)
    ? "127.0.0.1"
    : normalized;
};

const getGeoReader = async () => {
  const databasePath = process.env.GEOIP_DATABASE_PATH?.trim();
  if (!databasePath) return null;
  if (!geoReaderPromise) {
    geoReaderPromise = open(databasePath).catch((error) => {
      console.error("Unable to open the configured local GeoIP database:", error.message);
      return null;
    });
  }
  return geoReaderPromise;
};

const getLocation = async (ipAddress) => {
  if (!ipAddress || ipAddress === "127.0.0.1" || ipAddress === "::1") {
    return {};
  }
  const reader = await getGeoReader();
  if (!reader) return {};
  const result = reader.get(ipAddress);
  if (!result) return {};
  return {
    city: result.city?.names?.en ?? null,
    state: result.subdivisions?.[0]?.names?.en ?? null,
    country: result.country?.names?.en ?? result.registered_country?.names?.en ?? null,
    latitude: result.location?.latitude ?? null,
    longitude: result.location?.longitude ?? null,
  };
};

export const getRequestMetadata = async (req) => {
  const userAgent = req.get("user-agent") || "";
  const parsed = new UAParser(userAgent).getResult();
  const deviceType =
    parsed.device.type === "tablet"
      ? "Tablet"
      : parsed.device.type === "mobile"
        ? "Mobile"
        : "Desktop";
  const ipAddress = normalizeIpAddress(req.ip);
  const location = await getLocation(ipAddress);

  return {
    ipAddress,
    browser: parsed.browser.name || "Unknown",
    browserVersion: parsed.browser.version || null,
    os: parsed.os.name || "Unknown",
    osVersion: parsed.os.version || null,
    deviceType,
    deviceModel: parsed.device.model || null,
    city: location.city ?? null,
    state: location.state ?? null,
    country: location.country ?? null,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
  };
};

export const getCookie = (req, name) => {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const cookieOptions = (maxAge) => {
  const secure = process.env.NODE_ENV === "production";
  return [
    "Path=/",
    "HttpOnly",
    `SameSite=${secure ? "None" : "Lax"}`,
    ...(secure ? ["Secure"] : []),
    `Max-Age=${maxAge}`,
  ].join("; ");
};

export const setSessionCookie = (res, token) => {
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(
      getSessionDays() * 24 * 60 * 60,
    )}`,
  );
};

export const setTrustedDeviceCookie = (res, token) => {
  res.append(
    "Set-Cookie",
    `${TRUSTED_DEVICE_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(
      getTrustedDeviceDays() * 24 * 60 * 60,
    )}`,
  );
};

export const clearSessionCookie = (res) => {
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${cookieOptions(0)}`,
  );
};

export const getSessionToken = (req) => getCookie(req, SESSION_COOKIE);

export const getTrustedDeviceToken = (req) =>
  getCookie(req, TRUSTED_DEVICE_COOKIE);

export const clearTrustedDeviceCookie = (res) => {
  res.append(
    "Set-Cookie",
    `${TRUSTED_DEVICE_COOKIE}=; ${cookieOptions(0)}`,
  );
};

export const getSessionExpiry = () =>
  new Date(Date.now() + getSessionDays() * 24 * 60 * 60 * 1000);

export const getTrustedDeviceExpiry = () =>
  new Date(Date.now() + getTrustedDeviceDays() * 24 * 60 * 60 * 1000);

export const sameDeviceMetadata = (trustedDevice, metadata) =>
  trustedDevice.browser === metadata.browser &&
  trustedDevice.os === metadata.os &&
  trustedDevice.deviceType === metadata.deviceType &&
  trustedDevice.deviceModel === metadata.deviceModel &&
  trustedDevice.metadata?.ipAddress === metadata.ipAddress &&
  trustedDevice.metadata?.city === metadata.city &&
  trustedDevice.metadata?.state === metadata.state &&
  trustedDevice.metadata?.country === metadata.country;

const otpProtectedMetadataFields = [
  "browser",
  "os",
  "deviceType",
  "deviceModel",
  "ipAddress",
  "city",
  "state",
];

export const getChangedMetadataFields = (previousMetadata, metadata) =>
  otpProtectedMetadataFields.filter(
    (field) => previousMetadata?.[field] !== metadata?.[field],
  );

export const requiresOtpForMetadataChange = (previousMetadata, metadata) =>
  getChangedMetadataFields(previousMetadata, metadata).length > 0;

export const maskedEmail = (email) => {
  const [localPart, domain] = email.split("@");
  if (!domain) return email;
  const visible = localPart.length > 1 ? localPart[0] : "";
  return `${visible}${"*".repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
};
