import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import Meeting from "../models/Meeting.js";
import { hashToken } from "../services/loginSecurity.js";
import { buildIceServers } from "../services/iceServers.js";

const MEETING_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_PARTICIPANT_MS = 90 * 1000;
const MAX_PARTICIPANTS = 6;

const isValidRoomId = (roomId) =>
  typeof roomId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(roomId);

const tokenMatches = (token, tokenHash) => {
  if (typeof token !== "string" || !token || !tokenHash) return false;
  const candidate = Buffer.from(hashToken(token));
  const expected = Buffer.from(tokenHash);
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
};

const makeCredentials = (meeting, participant, participantToken) => ({
  roomId: meeting.roomId,
  title: meeting.title,
  displayName: participant.name,
  role: participant.role,
  participantId: participant.participantId,
  participantToken,
  iceServers: buildIceServers(participant.participantId),
  maxParticipants: meeting.maxParticipants,
  allowChat: meeting.allowChat,
  allowParticipantScreenShare: meeting.allowParticipantScreenShare,
  locked: meeting.locked,
});

const createParticipant = ({ name, userId, role }) => {
  const rawAccessToken = randomBytes(32).toString("base64url");
  return {
    rawAccessToken,
    participantId: randomUUID(),
    accessTokenHash: hashToken(rawAccessToken),
    userId,
    name,
    role,
    joinedAt: new Date(),
    lastSeenAt: new Date(),
    leftAt: null,
  };
};

export const createMeeting = async (req, res) => {
  const title =
    typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim().slice(0, 100)
      : `${req.appUser.name}'s meeting`;
  const inviteToken = randomBytes(32).toString("base64url");
  const host = createParticipant({
    name: req.appUser.name.trim().slice(0, 40),
    userId: req.appUser._id,
    role: "host",
  });
  try {
    buildIceServers(host.participantId);
  } catch (error) {
    console.error("Unable to create WebRTC meeting:", error);
    return res.status(503).json({
      code: "MEETING_PROVIDER_UNAVAILABLE",
      message: "Video calling is not configured. Please try again later.",
    });
  }

  const now = new Date();
  let meeting;
  try {
    meeting = await Meeting.create({
      roomId: randomBytes(12).toString("base64url"),
      title,
      hostUserId: req.appUser._id,
      hostName: host.name,
      inviteTokenHash: hashToken(inviteToken),
      expiresAt: new Date(now.getTime() + MEETING_TTL_MS),
      maxParticipants: MAX_PARTICIPANTS,
      participants: [host],
    });
  } catch (error) {
    console.error("Unable to save WebRTC meeting:", error);
    return res.status(503).json({
      code: "MEETING_CREATION_FAILED",
      message: "Could not save the meeting. Please try again.",
    });
  }

  try {
    const credentials = makeCredentials(meeting, host, host.rawAccessToken);
    return res.status(201).json({
      ...credentials,
      inviteToken,
      expiresAt: meeting.expiresAt,
    });
  } catch (error) {
    console.error("Unable to issue WebRTC meeting credentials:", error);
    return res.status(503).json({
      code: "MEETING_PROVIDER_UNAVAILABLE",
      message: "Video calling is not configured. Please try again later.",
    });
  }
};

export const joinMeeting = async (req, res) => {
  try {
    buildIceServers("configuration-check");
  } catch (error) {
    console.error("Unable to join WebRTC meeting:", error);
    return res.status(503).json({
      code: "MEETING_PROVIDER_UNAVAILABLE",
      message: "Video calling is not configured. Please try again later.",
    });
  }

  const { roomId } = req.params;
  if (!isValidRoomId(roomId)) {
    return res.status(400).json({
      code: "INVALID_MEETING",
      message: "The meeting link is invalid.",
    });
  }

  const name =
    typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 40) : "";
  const participantToken = req.body?.participantToken;
  const inviteToken = req.body?.inviteToken;
  if (!participantToken && !name) {
    return res.status(400).json({
      code: "DISPLAY_NAME_REQUIRED",
      message: "Enter a display name to join.",
    });
  }

  const meeting = await Meeting.findOne({
    roomId,
    endedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("+inviteTokenHash");
  if (!meeting) {
    return res.status(404).json({
      code: "MEETING_NOT_FOUND",
      message: "This meeting has ended or the link has expired.",
    });
  }

  let participant;
  let rawParticipantToken;
  if (participantToken) {
    participant = meeting.participants.find((item) =>
      tokenMatches(participantToken, item.accessTokenHash),
    );
    if (!participant) {
      return res.status(401).json({
        code: "INVALID_PARTICIPANT_TOKEN",
        message: "This meeting session is invalid. Use the invite link again.",
      });
    }
    participant.lastSeenAt = new Date();
    participant.leftAt = null;
    await meeting.save();
    rawParticipantToken = participantToken;
  } else {
    if (!tokenMatches(inviteToken, meeting.inviteTokenHash)) {
      return res.status(403).json({
        code: "INVALID_INVITE",
        message: "This invite link is invalid.",
      });
    }
    if (meeting.locked) {
      return res.status(423).json({
        code: "MEETING_LOCKED",
        message: "The host has locked this meeting.",
      });
    }

    const newParticipant = createParticipant({
      name,
      role: "participant",
      userId: req.appUser?._id,
    });
    const now = new Date();
    const activeSince = new Date(now.getTime() - ACTIVE_PARTICIPANT_MS);
    const updatedMeeting = await Meeting.findOneAndUpdate(
      {
        _id: meeting._id,
        locked: false,
        endedAt: null,
        expiresAt: { $gt: now },
        $expr: {
          $lt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ["$participants", []] },
                  as: "participant",
                  cond: {
                    $and: [
                      { $eq: ["$$participant.leftAt", null] },
                      { $gt: ["$$participant.lastSeenAt", activeSince] },
                    ],
                  },
                },
              },
            },
            "$maxParticipants",
          ],
        },
      },
      { $push: { participants: newParticipant } },
      { new: true },
    );
    if (!updatedMeeting) {
      return res.status(409).json({
        code: "MEETING_FULL_OR_LOCKED",
        message: "The meeting is full or the host has locked it.",
      });
    }
    participant = updatedMeeting.participants.find(
      (item) => item.participantId === newParticipant.participantId,
    );
    rawParticipantToken = newParticipant.rawAccessToken;
  }

  try {
    const credentials = makeCredentials(
      meeting,
      participant,
      rawParticipantToken,
    );
    return res.json(credentials);
  } catch (error) {
    console.error("Unable to issue WebRTC meeting credentials:", error);
    return res.status(503).json({
      code: "MEETING_PROVIDER_UNAVAILABLE",
      message: "Video calling is not configured. Please try again later.",
    });
  }
};

export const leaveMeeting = async (req, res) => {
  const participant = req.meeting.participants.find(
    (item) => item.participantId === req.participant.participantId,
  );
  if (participant) {
    participant.leftAt = new Date();
    participant.lastSeenAt = participant.leftAt;
    await req.meeting.save();
  }
  return res.json({ success: true });
};

export const updateMeetingLock = async (req, res) => {
  const locked = req.body?.locked;
  if (typeof locked !== "boolean") {
    return res.status(400).json({
      code: "INVALID_LOCK_STATE",
      message: "The locked value must be boolean.",
    });
  }
  req.meeting.locked = locked;
  await req.meeting.save();
  return res.json({ locked: req.meeting.locked });
};

export const updateMeetingPermissions = async (req, res) => {
  const { allowChat, allowParticipantScreenShare } = req.body ?? {};
  if (
    (allowChat !== undefined && typeof allowChat !== "boolean") ||
    (allowParticipantScreenShare !== undefined &&
      typeof allowParticipantScreenShare !== "boolean")
  ) {
    return res.status(400).json({
      code: "INVALID_MEETING_PERMISSIONS",
      message: "Meeting permissions must be boolean values.",
    });
  }
  if (allowChat !== undefined) req.meeting.allowChat = allowChat;
  if (allowParticipantScreenShare !== undefined) {
    req.meeting.allowParticipantScreenShare =
      allowParticipantScreenShare;
  }
  await req.meeting.save();
  return res.json({
    allowChat: req.meeting.allowChat,
    allowParticipantScreenShare: req.meeting.allowParticipantScreenShare,
  });
};

export const endMeeting = async (req, res) => {
  req.meeting.endedAt = new Date();
  await req.meeting.save();
  return res.json({ success: true });
};

export const authenticateMeetingParticipant = async (req, res, next) => {
  const { roomId } = req.params;
  const token = req.get("x-meeting-token");
  if (!isValidRoomId(roomId) || !token) {
    return res.status(401).json({
      code: "MEETING_AUTH_REQUIRED",
      message: "A valid meeting session is required.",
    });
  }
  const meeting = await Meeting.findOne({
    roomId,
    endedAt: null,
    expiresAt: { $gt: new Date() },
  });
  const participant = meeting?.participants.find((item) =>
    tokenMatches(token, item.accessTokenHash),
  );
  if (!meeting || !participant || participant.leftAt) {
    return res.status(401).json({
      code: "MEETING_SESSION_INVALID",
      message: "This meeting session is no longer active.",
    });
  }
  req.meeting = meeting;
  req.participant = participant;
  return next();
};

export const requireMeetingHost = (req, res, next) => {
  if (!["host", "cohost"].includes(req.participant?.role)) {
    return res.status(403).json({
      code: "MEETING_HOST_REQUIRED",
      message: "Only the host or a co-host can change meeting settings.",
    });
  }
  return next();
};
