import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getFirebaseAuth } from "firebase-admin/auth";
import mongoose from "mongoose";
import Auth from "../models/Auth.js";
import Download from "../models/Download.js";
import LoginEvent from "../models/LoginEvent.js";
import LoginSession from "../models/LoginSession.js";
import Subscription from "../models/Subscription.js";
import {
  clearSessionCookie,
  getChangedMetadataFields,
  getRequestMetadata,
  getSessionToken,
  hashToken,
} from "../services/loginSecurity.js";
import { getDownloadQuota } from "../services/downloadQuota.js";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const getAdminAuth = () => {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });

  return getFirebaseAuth(app);
};

const recordRejectedAttempt = async (
  req,
  firebaseUid,
  user = null,
  email = null,
) => {
  if (req.method !== "GET" || !req.params.videoId) return;

  const videoId = isValidObjectId(req.params.videoId)
    ? req.params.videoId
    : undefined;
  const auditedUser =
    user ||
    (email
      ? await Auth.findOne({ email: email.toLowerCase() }).select(
          "_id subscriptionPlan downloadsToday lastReset",
        )
      : null);
  const metadata = await getRequestMetadata(req);
  await Download.create({
    userId: auditedUser?._id,
    videoId,
    firebaseUid,
    timestamp: new Date(),
    ipAddress: metadata.ipAddress,
    deviceInfo: req.get("x-device-id") || req.get("sec-ch-ua-platform"),
    browser: metadata.browser,
    browserVersion: metadata.browserVersion,
    os: metadata.os,
    osVersion: metadata.osVersion,
    deviceType: metadata.deviceType,
    deviceModel: metadata.deviceModel,
    userAgent: req.get("user-agent"),
    subscriptionPlan: auditedUser?.subscriptionPlan,
    quotaRemaining: auditedUser
      ? getDownloadQuota(auditedUser).remaining
      : undefined,
    status: "failed",
    outcome: "rejected",
    failureReason: "Authentication failed",
  });
};

export const verifyFirebaseToken = async (req, res, next) => {
  const authorization = req.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;

  if (!token) {
    try {
      await recordRejectedAttempt(req);
    } catch (error) {
      console.error("Unable to record rejected download attempt:", error);
    }
    return res.status(401).json({
      code: "AUTH_REQUIRED",
      message: "Sign in to continue.",
    });
  }

  try {
    const firebaseUser = await getAdminAuth().verifyIdToken(token);
    if (!firebaseUser.email || firebaseUser.email_verified !== true) {
      await recordRejectedAttempt(req, firebaseUser.uid, null, firebaseUser.email);
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your account email before continuing.",
      });
    }

    const user = await Auth.findOne({
      email: firebaseUser.email.toLowerCase(),
    });
    if (!user) {
      await recordRejectedAttempt(req, firebaseUser.uid);
      return res.status(403).json({
        code: "ACCOUNT_NOT_FOUND",
        message: "Your account is not registered on this platform.",
      });
    }

    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      await recordRejectedAttempt(req, firebaseUser.uid, user);
      return res.status(401).json({
        code: "APP_SESSION_REQUIRED",
        message: "Complete email verification to access your account.",
      });
    }
    const loginSession = await LoginSession.findOne({
      tokenHash: hashToken(sessionToken),
      userId: user._id,
      firebaseUid: firebaseUser.uid,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!loginSession) {
      clearSessionCookie(res);
      await recordRejectedAttempt(req, firebaseUser.uid, user);
      return res.status(401).json({
        code: "APP_SESSION_INVALID",
        message: "Your secure session expired. Sign in again.",
      });
    }
    const requestMetadata = await getRequestMetadata(req);
    const changedMetadataFields = getChangedMetadataFields(
      loginSession.metadata,
      requestMetadata,
    );
    if (changedMetadataFields.length > 0) {
      loginSession.revokedAt = new Date();
      await loginSession.save();
      await LoginEvent.create({
        userId: user._id,
        email: user.email,
        firebaseUid: firebaseUser.uid,
        eventType: "session_revoked",
        outcome: "login_context_changed",
        metadata: requestMetadata,
        sessionId: loginSession._id,
      });
      await recordRejectedAttempt(req, firebaseUser.uid, user);
      clearSessionCookie(res);
      const fieldLabels = {
        browser: "browser",
        os: "operating system",
        deviceType: "device type",
        deviceModel: "device model",
        ipAddress: "IP address",
        city: "city",
        state: "state",
      };

      return res.status(401).json({
        code: "APP_SESSION_REVERIFY",
        message: `Your sign-in context changed (${changedMetadataFields
          .map((field) => fieldLabels[field])
          .join(", ")}). Verify your email again.`,
        changedFields: changedMetadataFields,
      });
    }
    loginSession.lastUsedAt = new Date();
    await loginSession.save();

    if (
      user.subscriptionPlan !== "Free" &&
      (!user.subscriptionExpiry || user.subscriptionExpiry <= new Date())
    ) {
      const expiredSubscriptionId = user.activeSubscriptionId;
      user.subscriptionPlan = "Free";
      user.subscriptionExpiry = undefined;
      user.activeSubscriptionId = undefined;
      await user.save();
      if (expiredSubscriptionId) {
        await Subscription.updateOne(
          { _id: expiredSubscriptionId },
          { $set: { status: "expired" } },
        );
      }
    }

    req.firebaseUser = firebaseUser;
    req.appUser = user;
    req.loginSession = loginSession;
    return next();
  } catch (error) {
    if (error.code === "auth/argument-error" || error.code === "auth/id-token-expired" || error.code === "auth/invalid-id-token") {
      try {
        await recordRejectedAttempt(req);
      } catch (auditError) {
        console.error("Unable to record rejected download attempt:", auditError);
      }
      return res.status(401).json({
        code: "INVALID_AUTH_TOKEN",
        message: "Your sign-in has expired. Please sign in again.",
      });
    }

    try {
      await recordRejectedAttempt(req);
    } catch (auditError) {
      console.error("Unable to record unauthorized download attempt:", auditError);
    }
    console.error("Firebase token verification failed:", error);
    return res.status(503).json({
      code: "AUTH_SERVICE_UNAVAILABLE",
      message: "Download authorization is temporarily unavailable.",
    });
  }
};

export const verifyFirebaseTokenOptional = async (req, _res, next) => {
  const authorization = req.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  if (!token) return next();

  try {
    const identity = await getAdminAuth().verifyIdToken(token);
    if (identity.email && identity.email_verified === true) {
      req.appUser = await Auth.findOne({
        email: identity.email.toLowerCase(),
      });
    }
  } catch (error) {
    if (
      !["auth/argument-error", "auth/id-token-expired", "auth/invalid-id-token"].includes(
        error.code,
      )
    ) {
      console.error("Optional Firebase identity lookup failed:", error);
    }
  }
  return next();
};
