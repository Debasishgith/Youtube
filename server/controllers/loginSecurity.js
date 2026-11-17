import mongoose from "mongoose";
import nodemailer from "nodemailer";
import Auth from "../models/Auth.js";
import LoginChallenge from "../models/LoginChallenge.js";
import LoginEvent from "../models/LoginEvent.js";
import LoginSession from "../models/LoginSession.js";
import TrustedDevice from "../models/TrustedDevice.js";
import { getAdminAuth } from "../middleware/authFirebase.js";
import {
  clearSessionCookie,
  clearTrustedDeviceCookie,
  getOtpMinutes,
  getRequestMetadata,
  getSessionExpiry,
  getSessionToken,
  getTrustedDeviceExpiry,
  getTrustedDeviceToken,
  hashOtp,
  hashToken,
  isOtpSecretAvailable,
  makeOpaqueToken,
  makeOtp,
  maskedEmail,
  requiresOtpForMetadataChange,
  resolveThemePreference,
  sameDeviceMetadata,
  setSessionCookie,
  setTrustedDeviceCookie,
  verifyOtp,
} from "../services/loginSecurity.js";

const OTP_MAX_ATTEMPTS = 5;

const getBearerToken = (req) => {
  const authorization = req.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
};

const getFirebaseIdentity = async (req) => {
  const token = getBearerToken(req);
  if (!token) {
    return {
      error: {
        status: 401,
        code: "missing_firebase_token",
        message: "Sign in with Google to continue.",
      },
    };
  }

  try {
    const identity = await getAdminAuth().verifyIdToken(token);
    if (!identity.email || identity.email_verified !== true) {
      return {
        error: {
          status: 403,
          code: "email_not_verified",
          message: "Verify your Google account email before continuing.",
        },
      };
    }
    return { identity };
  } catch (error) {
    if (
      ["auth/argument-error", "auth/id-token-expired", "auth/invalid-id-token"].includes(
        error.code,
      )
    ) {
      return {
        error: {
          status: 401,
          code: "invalid_firebase_token",
          message: "Your sign-in has expired. Please sign in again.",
        },
      };
    }
    console.error("Firebase identity verification failed during login:", error);
    return {
      error: {
        status: 503,
        code: "firebase_verification_unavailable",
        message: "Sign-in verification is temporarily unavailable.",
      },
    };
  }
};

const getOrCreateUser = async (identity) => {
  const email = identity.email.toLowerCase();
  let user = await Auth.findOne({ email });
  if (!user) {
    user = await Auth.create({
      email,
      name: identity.name || email.split("@")[0],
      image: identity.picture || "",
      themePreference: "auto",
    });
  }
  return user;
};

const serializeUser = (user) => ({
  _id: user._id,
  email: user.email,
  name: user.name,
  image: user.image,
  channelName: user.channelName,
  description: user.description,
  role: user.role || "user",
  subscriptionPlan: user.subscriptionPlan,
  subscriptionExpiry: user.subscriptionExpiry,
  themePreference: user.themePreference || "auto",
  joinedOn: user.joinedOn,
});

const sendOtpEmail = async (email, name, code, expiresAt) => {
  const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
  const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
  if (!SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("Email OTP is unavailable because SMTP is not configured.");
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const safeName = String(name || "there").replace(/[&<>"']/g, "");
  const expiresInMinutes = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - Date.now()) / 60000),
  );

  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Your sign-in verification code",
    text: `Hello ${safeName}, your sign-in verification code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html: `<p>Hello ${safeName},</p><p>Your sign-in verification code is <strong>${code}</strong>.</p><p>It expires in ${expiresInMinutes} minutes. If you did not request this, you can ignore this message.</p>`,
  });
};

const createSession = async ({
  user,
  identity,
  metadata,
  res,
  trustedDevice,
  trustedDeviceToken,
  eventType = "login_success",
  outcome = "success",
}) => {
  const token = makeOpaqueToken();
  const session = await LoginSession.create({
    userId: user._id,
    firebaseUid: identity.uid,
    tokenHash: hashToken(token),
    metadata,
    trustedDeviceId: trustedDevice?._id ?? null,
    expiresAt: getSessionExpiry(),
  });
  await LoginEvent.create({
    userId: user._id,
    email: user.email,
    firebaseUid: identity.uid,
    eventType,
    outcome,
    metadata,
    sessionId: session._id,
  });
  setSessionCookie(res, token);
  if (trustedDeviceToken) setTrustedDeviceCookie(res, trustedDeviceToken);

  return res.json({
    result: serializeUser(user),
    effectiveTheme: resolveThemePreference(user.themePreference || "auto"),
    sessionExpiresAt: session.expiresAt,
  });
};

const createTrustedDevice = async ({ user, metadata }) => {
  const token = makeOpaqueToken();
  const device = await TrustedDevice.create({
    userId: user._id,
    tokenHash: hashToken(token),
    browser: metadata.browser,
    os: metadata.os,
    deviceType: metadata.deviceType,
    deviceModel: metadata.deviceModel,
    metadata,
    expiresAt: getTrustedDeviceExpiry(),
  });
  return { device, token };
};

export const loginStart = async (req, res) => {
  const { identity, error } = await getFirebaseIdentity(req);
  if (error) {
    try {
      const email = identity?.email?.toLowerCase();
      const [metadata, user] = await Promise.all([
        getRequestMetadata(req),
        email ? Auth.findOne({ email }).select("_id") : null,
      ]);
      await LoginEvent.create({
        userId: user?._id ?? null,
        email: email || null,
        firebaseUid: identity?.uid || null,
        eventType: "login_rejected",
        outcome: error.code,
        metadata,
      });
    } catch (auditError) {
      console.error("Unable to record rejected login attempt:", auditError);
    }
    return res.status(error.status).json({ message: error.message });
  }

  try {
    const metadata = await getRequestMetadata(req);
    const user = await getOrCreateUser(identity);
    await LoginEvent.create({
      userId: user._id,
      email: user.email,
      firebaseUid: identity.uid,
      eventType: "login_attempt",
      outcome: "started",
      metadata,
    });

    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      const currentSession = await LoginSession.findOne({
        tokenHash: hashToken(sessionToken),
        userId: user._id,
        firebaseUid: identity.uid,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (currentSession) {
        if (!requiresOtpForMetadataChange(currentSession.metadata, metadata)) {
          currentSession.lastUsedAt = new Date();
          await currentSession.save();
          await LoginEvent.create({
            userId: user._id,
            email: user.email,
            firebaseUid: identity.uid,
            eventType: "session_restored",
            outcome: "existing_session",
            metadata,
            sessionId: currentSession._id,
          });
          return res.json({
            result: serializeUser(user),
            effectiveTheme: resolveThemePreference(user.themePreference || "auto"),
            sessionExpiresAt: currentSession.expiresAt,
          });
        }

        currentSession.revokedAt = new Date();
        await currentSession.save();
        await LoginEvent.create({
          userId: user._id,
          email: user.email,
          firebaseUid: identity.uid,
          eventType: "session_revoked",
          outcome: "login_context_changed",
          metadata,
          sessionId: currentSession._id,
        });
        clearSessionCookie(res);
      } else {
        clearSessionCookie(res);
      }
    }

    const trustedToken = getTrustedDeviceToken(req);
    if (trustedToken) {
      const trustedDevice = await TrustedDevice.findOne({
        tokenHash: hashToken(trustedToken),
        userId: user._id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (trustedDevice && sameDeviceMetadata(trustedDevice, metadata)) {
        trustedDevice.lastUsedAt = new Date();
        await trustedDevice.save();
        return createSession({
          user,
          identity,
          metadata,
          res,
          trustedDevice,
          outcome: "trusted_device",
        });
      }
    }

    const pendingChallenge = await LoginChallenge.findOne({
      userId: user._id,
      firebaseUid: identity.uid,
      status: "pending",
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (pendingChallenge) {
      return res.json({
        requiresOtp: true,
        challengeId: pendingChallenge._id,
        email: maskedEmail(user.email),
        expiresAt: pendingChallenge.expiresAt,
      });
    }

    const sentInLastMinute = await LoginEvent.exists({
      userId: user._id,
      eventType: "otp_sent",
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });
    if (sentInLastMinute) {
      return res.status(429).json({
        message: "A verification email was sent recently. Wait a minute before trying again.",
      });
    }
    const sentInLastHour = await LoginEvent.countDocuments({
      userId: user._id,
      eventType: "otp_sent",
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (sentInLastHour >= 5) {
      return res.status(429).json({
        message: "Too many verification emails were requested. Try again in an hour.",
      });
    }

    if (!isOtpSecretAvailable()) {
      await LoginEvent.create({
        userId: user._id,
        email: user.email,
        firebaseUid: identity.uid,
        eventType: "otp_delivery_failed",
        outcome: "otp_secret_not_configured",
        metadata,
      });
      return res.status(503).json({
        message:
          "Email verification signing is unavailable. Configure LOGIN_OTP_SECRET or Firebase Admin credentials.",
      });
    }

    const expiresAt = new Date(Date.now() + getOtpMinutes() * 60 * 1000);
    const challengeId = new mongoose.Types.ObjectId();
    const code = makeOtp();
    const challenge = await LoginChallenge.create({
      _id: challengeId,
      userId: user._id,
      firebaseUid: identity.uid,
      email: user.email,
      otpHash: hashOtp(challengeId.toString(), code),
      metadata,
      expiresAt,
    });

    try {
      await sendOtpEmail(user.email, user.name, code, expiresAt);
    } catch (deliveryError) {
      challenge.status = "failed";
      await challenge.save();
      await LoginEvent.create({
        userId: user._id,
        email: user.email,
        firebaseUid: identity.uid,
        eventType: "otp_delivery_failed",
        outcome: "delivery_failed",
        metadata,
      });
      console.error("Unable to deliver login OTP:", deliveryError.message);
      return res.status(503).json({
        message: deliveryError.message.includes("SMTP is not configured")
          ? "Gmail SMTP needs SMTP_USER and SMTP_PASSWORD. SMTP_HOST defaults to smtp.gmail.com; SMTP_FROM defaults to SMTP_USER."
          : "The verification email could not be delivered. Check the backend SMTP settings and try again.",
      });
    }

    await LoginEvent.create({
      userId: user._id,
      email: user.email,
      firebaseUid: identity.uid,
      eventType: "otp_sent",
      outcome: "sent",
      metadata,
    });
    return res.json({
      requiresOtp: true,
      challengeId: challenge._id,
      email: maskedEmail(user.email),
      expiresAt: challenge.expiresAt,
    });
  } catch (caughtError) {
    console.error("Unable to start secure login:", caughtError);
    return res.status(500).json({ message: "Secure sign-in could not be started." });
  }
};

export const verifyLoginOtp = async (req, res) => {
  const { identity, error } = await getFirebaseIdentity(req);
  if (error) return res.status(error.status).json({ message: error.message });

  const { challengeId, code, trustDevice = false } = req.body ?? {};
  if (
    typeof challengeId !== "string" ||
    !mongoose.Types.ObjectId.isValid(challengeId) ||
    typeof code !== "string"
  ) {
    return res.status(400).json({ message: "A valid challenge and 6-digit code are required." });
  }
  if (typeof trustDevice !== "boolean") {
    return res.status(400).json({ message: "Trust-device selection must be true or false." });
  }

  try {
    const challenge = await LoginChallenge.findOne({
      _id: challengeId,
      firebaseUid: identity.uid,
      status: "pending",
    }).select("+otpHash");
    if (!challenge) {
      return res.status(400).json({ message: "This verification request is no longer valid." });
    }
    if (challenge.expiresAt <= new Date()) {
      challenge.status = "expired";
      await challenge.save();
      await LoginEvent.create({
        userId: challenge.userId,
        email: challenge.email,
        firebaseUid: identity.uid,
        eventType: "otp_expired",
        outcome: "expired",
        metadata: challenge.metadata,
      });
      return res.status(400).json({ message: "The verification code expired. Sign in again." });
    }

    if (!verifyOtp(challenge._id.toString(), code, challenge.otpHash)) {
      challenge.attempts += 1;
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) challenge.status = "failed";
      await challenge.save();
      await LoginEvent.create({
        userId: challenge.userId,
        email: challenge.email,
        firebaseUid: identity.uid,
        eventType: "otp_failed",
        outcome:
          challenge.status === "failed" ? "attempt_limit_reached" : "invalid_code",
        metadata: challenge.metadata,
      });
      return res.status(400).json({
        message:
          challenge.status === "failed"
            ? "Too many incorrect codes. Sign in again to request a new code."
            : "The verification code is incorrect.",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts),
      });
    }

    challenge.status = "verified";
    await challenge.save();
    const user = await Auth.findById(challenge.userId);
    if (!user || user.email !== identity.email.toLowerCase()) {
      return res.status(403).json({ message: "The account for this verification request is unavailable." });
    }

    const metadata = await getRequestMetadata(req);
    const newTrustedDevice = trustDevice
      ? await createTrustedDevice({ user, metadata })
      : null;
    return createSession({
      user,
      identity,
      metadata,
      res,
      trustedDevice: newTrustedDevice?.device,
      trustedDeviceToken: newTrustedDevice?.token,
      outcome: trustDevice ? "otp_verified_trusted_device" : "otp_verified",
    });
  } catch (caughtError) {
    console.error("Unable to verify login OTP:", caughtError);
    return res.status(500).json({ message: "The verification code could not be checked." });
  }
};

export const logout = async (req, res) => {
  try {
    const token = getSessionToken(req);
    if (token) {
      const session = await LoginSession.findOne({
        tokenHash: hashToken(token),
        revokedAt: null,
      });
      if (session) {
        session.revokedAt = new Date();
        await session.save();
        await LoginEvent.create({
          userId: session.userId,
          firebaseUid: session.firebaseUid,
          eventType: "logout",
          outcome: "signed_out",
          metadata: session.metadata,
          sessionId: session._id,
        });
      }
    }
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (caughtError) {
    console.error("Unable to revoke sign-in session during logout:", caughtError);
    return res.status(500).json({ message: "Sign-out could not be completed securely." });
  }
};

export const getSecurityOverview = async (req, res) => {
  try {
    const now = new Date();
    const [events, sessions, devices] = await Promise.all([
      LoginEvent.find({ userId: req.appUser._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      LoginSession.find({
        userId: req.appUser._id,
        revokedAt: null,
        expiresAt: { $gt: now },
      })
        .sort({ lastUsedAt: -1 })
        .select("-tokenHash")
        .lean(),
      TrustedDevice.find({
        userId: req.appUser._id,
        revokedAt: null,
        expiresAt: { $gt: now },
      })
        .sort({ lastUsedAt: -1 })
        .select("-tokenHash")
        .lean(),
    ]);
    return res.json({
      events,
      sessions,
      devices,
      currentSessionId: String(req.loginSession._id),
    });
  } catch (caughtError) {
    console.error("Unable to load account security activity:", caughtError);
    return res.status(500).json({ message: "Account security activity could not be loaded." });
  }
};

export const revokeLoginSession = async (req, res) => {
  const { sessionId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ message: "A valid session ID is required." });
  }
  try {
    const session = await LoginSession.findOne({
      _id: sessionId,
      userId: req.appUser._id,
      revokedAt: null,
    });
    if (!session) return res.status(404).json({ message: "Session not found." });

    session.revokedAt = new Date();
    await session.save();
    await LoginEvent.create({
      userId: req.appUser._id,
      email: req.appUser.email,
      firebaseUid: session.firebaseUid,
      eventType: "session_revoked",
      outcome: "revoked_by_user",
      metadata: session.metadata,
      sessionId: session._id,
    });
    const currentSessionRevoked =
      String(req.loginSession?._id) === String(session._id);
    if (currentSessionRevoked) clearSessionCookie(res);
    return res.json({ revoked: true, currentSessionRevoked });
  } catch (caughtError) {
    console.error("Unable to revoke login session:", caughtError);
    return res.status(500).json({ message: "The session could not be revoked." });
  }
};

export const revokeTrustedDevice = async (req, res) => {
  const { deviceId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(deviceId)) {
    return res.status(400).json({ message: "A valid device ID is required." });
  }
  try {
    const device = await TrustedDevice.findOne({
      _id: deviceId,
      userId: req.appUser._id,
      revokedAt: null,
    }).select("+tokenHash");
    if (!device) return res.status(404).json({ message: "Trusted device not found." });

    device.revokedAt = new Date();
    await device.save();
    const sessions = await LoginSession.find({
      trustedDeviceId: device._id,
      revokedAt: null,
    }).select("_id firebaseUid metadata");
    const revokedAt = new Date();
    await LoginSession.updateMany(
      { _id: { $in: sessions.map((session) => session._id) } },
      { $set: { revokedAt } },
    );
    if (sessions.length) {
      await LoginEvent.insertMany(
        sessions.map((session) => ({
          userId: req.appUser._id,
          email: req.appUser.email,
          firebaseUid: session.firebaseUid,
          eventType: "session_revoked",
          outcome: "trusted_device_revoked",
          metadata: session.metadata,
          sessionId: session._id,
          createdAt: revokedAt,
        })),
      );
    }
    const currentSessionRevoked =
      String(req.loginSession?.trustedDeviceId) === String(device._id);
    if (currentSessionRevoked) clearSessionCookie(res);
    const trustedToken = getTrustedDeviceToken(req);
    if (trustedToken && hashToken(trustedToken) === device.tokenHash) {
      clearTrustedDeviceCookie(res);
    }
    return res.json({ revoked: true, currentSessionRevoked });
  } catch (caughtError) {
    console.error("Unable to revoke trusted device:", caughtError);
    return res.status(500).json({ message: "The trusted device could not be revoked." });
  }
};

export const updateThemePreference = async (req, res) => {
  const { themePreference } = req.body ?? {};
  if (!["auto", "light", "dark"].includes(themePreference)) {
    return res.status(400).json({ message: "Theme must be auto, light, or dark." });
  }
  try {
    req.appUser.themePreference = themePreference;
    await req.appUser.save();
    return res.json({
      result: serializeUser(req.appUser),
      effectiveTheme: resolveThemePreference(themePreference),
    });
  } catch (caughtError) {
    console.error("Unable to save theme preference:", caughtError);
    return res.status(500).json({ message: "Theme preference could not be saved." });
  }
};
