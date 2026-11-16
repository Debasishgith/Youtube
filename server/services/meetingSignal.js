const MAX_SDP_LENGTH = 256 * 1024;
const MAX_ICE_CANDIDATE_LENGTH = 4096;

export const isValidWebRTCDescription = (description) =>
  description &&
  (description.type === "offer" || description.type === "answer") &&
  typeof description.sdp === "string" &&
  description.sdp.length > 0 &&
  description.sdp.length <= MAX_SDP_LENGTH;

export const isValidWebRTCCandidate = (candidate) =>
  candidate &&
  typeof candidate.candidate === "string" &&
  candidate.candidate.length > 0 &&
  candidate.candidate.length <= MAX_ICE_CANDIDATE_LENGTH &&
  (candidate.sdpMid === null ||
    candidate.sdpMid === undefined ||
    (typeof candidate.sdpMid === "string" && candidate.sdpMid.length <= 256)) &&
  (candidate.sdpMLineIndex === null ||
    candidate.sdpMLineIndex === undefined ||
    (Number.isInteger(candidate.sdpMLineIndex) &&
      candidate.sdpMLineIndex >= 0)) &&
  (candidate.usernameFragment === null ||
    candidate.usernameFragment === undefined ||
    (typeof candidate.usernameFragment === "string" &&
      candidate.usernameFragment.length <= 256));
