import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidWebRTCCandidate,
  isValidWebRTCDescription,
} from "../services/meetingSignal.js";

test("accepts bounded offer and answer descriptions", () => {
  assert.equal(isValidWebRTCDescription({ type: "offer", sdp: "v=0" }), true);
  assert.equal(isValidWebRTCDescription({ type: "answer", sdp: "v=0" }), true);
  assert.equal(isValidWebRTCDescription({ type: "pranswer", sdp: "v=0" }), false);
  assert.equal(isValidWebRTCDescription({ type: "offer", sdp: "" }), false);
  assert.equal(
    isValidWebRTCDescription({ type: "offer", sdp: "x".repeat(256 * 1024 + 1) }),
    false,
  );
});

test("accepts ICE candidates but rejects malformed or oversized fields", () => {
  assert.equal(
    isValidWebRTCCandidate({
      candidate: "candidate:1 1 UDP 1 192.0.2.1 5000 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    }),
    true,
  );
  assert.equal(isValidWebRTCCandidate({ candidate: "" }), false);
  assert.equal(
    isValidWebRTCCandidate({ candidate: "x".repeat(4097) }),
    false,
  );
  assert.equal(
    isValidWebRTCCandidate({ candidate: "candidate", sdpMLineIndex: -1 }),
    false,
  );
});
