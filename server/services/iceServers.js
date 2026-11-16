import { createHmac } from "crypto";

const parseUrls = (value) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
    : [];

export const buildIceServers = (
  participantId,
  env = process.env,
  now = Date.now(),
) => {
  const stunUrls = parseUrls(env.WEBRTC_STUN_URLS);
  const turnUrls = parseUrls(env.WEBRTC_TURN_URLS);
  const turnSecret = env.WEBRTC_TURN_SHARED_SECRET;
  if (!stunUrls.length) stunUrls.push("stun:stun.l.google.com:19302");

  if (Boolean(turnUrls.length) !== Boolean(turnSecret)) {
    throw new Error(
      "WEBRTC_TURN_URLS and WEBRTC_TURN_SHARED_SECRET must be configured together.",
    );
  }

  const iceServers = [{ urls: stunUrls }];
  if (turnUrls.length) {
    const expiresAt = Math.floor(now / 1000) + 24 * 60 * 60;
    const username = `${expiresAt}:${participantId}`;
    const credential = createHmac("sha1", turnSecret)
      .update(username)
      .digest("base64");
    iceServers.push({ urls: turnUrls, username, credential });
  }

  return iceServers;
};
