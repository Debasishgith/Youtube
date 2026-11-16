import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { buildIceServers } from "../services/iceServers.js";

test("uses a public STUN server when none is configured", () => {
  assert.deepEqual(buildIceServers("participant-1", {}), [
    { urls: ["stun:stun.l.google.com:19302"] },
  ]);
});

test("issues expiring TURN REST credentials for the participant", () => {
  const now = 1_800_000_000_000;
  const secret = "local-coturn-shared-secret";
  const servers = buildIceServers(
    "participant-1",
    {
      WEBRTC_STUN_URLS: "stun:stun.local:3478",
      WEBRTC_TURN_URLS:
        "turn:turn.local:3478?transport=udp,turns:turn.local:5349?transport=tcp",
      WEBRTC_TURN_SHARED_SECRET: secret,
    },
    now,
  );
  const username = `${Math.floor(now / 1000) + 86400}:participant-1`;
  const credential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  assert.deepEqual(servers, [
    { urls: ["stun:stun.local:3478"] },
    {
      urls: [
        "turn:turn.local:3478?transport=udp",
        "turns:turn.local:5349?transport=tcp",
      ],
      username,
      credential,
    },
  ]);
});

test("rejects incomplete TURN configuration", () => {
  assert.throws(
    () =>
      buildIceServers("participant-1", {
        WEBRTC_TURN_URLS: "turn:turn.local:3478",
      }),
    /must be configured together/,
  );
  assert.throws(
    () =>
      buildIceServers("participant-1", {
        WEBRTC_TURN_SHARED_SECRET: "secret",
      }),
    /must be configured together/,
  );
});
