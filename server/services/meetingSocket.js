import { timingSafeEqual } from "crypto";
import Meeting from "../models/Meeting.js";
import { hashToken } from "./loginSecurity.js";
import {
  isValidWebRTCCandidate,
  isValidWebRTCDescription,
} from "./meetingSignal.js";

const MAX_CHAT_LENGTH = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

const tokenMatches = (token, tokenHash) => {
  if (typeof token !== "string" || !token || !tokenHash) return false;
  const candidate = Buffer.from(hashToken(token));
  const expected = Buffer.from(tokenHash);
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
};

const getParticipants = (room) =>
  [...room.participants.values()].map(
    ({ socketId: _socketId, ...participant }) => participant,
  );

const isHost = (participant) => participant.role === "host";
const canModerate = (participant) =>
  participant.role === "host" || participant.role === "cohost";

export const configureMeetingSockets = (io) => {
  const rooms = new Map();

  io.use(async (socket, next) => {
    try {
      const { roomId, participantToken } = socket.handshake.auth ?? {};
      if (
        typeof roomId !== "string" ||
        typeof participantToken !== "string"
      ) {
        return next(new Error("A valid meeting session is required."));
      }

      const meeting = await Meeting.findOne({
        roomId,
        endedAt: null,
        expiresAt: { $gt: new Date() },
      });
      const participant = meeting?.participants.find((item) =>
        tokenMatches(participantToken, item.accessTokenHash),
      );
      if (!meeting || !participant || participant.leftAt) {
        return next(new Error("This meeting session is no longer active."));
      }

      socket.data.meeting = {
        roomId,
        meetingId: meeting._id,
        participantId: participant.participantId,
        participantToken,
        name: participant.name,
        role: participant.role,
        allowChat: meeting.allowChat,
        allowParticipantScreenShare: meeting.allowParticipantScreenShare,
        locked: meeting.locked,
        maxParticipants: meeting.maxParticipants,
      };
      return next();
    } catch (error) {
      console.error("Unable to authenticate meeting socket:", error);
      return next(new Error("Meeting authentication is temporarily unavailable."));
    }
  });

  io.on("connection", (socket) => {
    const identity = socket.data.meeting;
    let room = rooms.get(identity.roomId);
    if (!room) {
      room = {
        participants: new Map(),
        settings: {
          allowChat: identity.allowChat,
          allowParticipantScreenShare:
            identity.allowParticipantScreenShare,
          locked: identity.locked,
          maxParticipants: identity.maxParticipants,
        },
      };
      rooms.set(identity.roomId, room);
    }

    const previous = room.participants.get(identity.participantId);
    if (
      !previous &&
      room.participants.size >= room.settings.maxParticipants
    ) {
      socket.emit("meeting:error", {
        code: "MEETING_FULL",
        message: "This meeting is full.",
      });
      socket.disconnect(true);
      return;
    }

    if (previous) {
      io.sockets.sockets.get(previous.socketId)?.disconnect(true);
    }

    const participant = {
      participantId: identity.participantId,
      name: identity.name,
      role: identity.role,
      micOn: true,
      camOn: true,
      screenOn: false,
      handRaised: false,
      mutedByHost: false,
      socketId: socket.id,
    };
    room.participants.set(identity.participantId, participant);
    socket.join(identity.roomId);
    void Meeting.updateOne(
      { _id: identity.meetingId, "participants.participantId": identity.participantId },
      { $set: { "participants.$.lastSeenAt": new Date() } },
    ).catch((error) =>
      console.error("Unable to update meeting participant activity:", error),
    );

    socket.emit("meeting:state", {
      participants: getParticipants(room),
      settings: room.settings,
    });
    socket.to(identity.roomId).emit("meeting:participant-joined", {
      ...participant,
      socketId: undefined,
      reconnected: Boolean(previous),
    });

    let lastChatAt = 0;
    let signalWindowStart = Date.now();
    let signalCount = 0;
    socket.on("meeting:heartbeat", () => {
      void Meeting.updateOne(
        {
          _id: identity.meetingId,
          "participants.participantId": identity.participantId,
        },
        { $set: { "participants.$.lastSeenAt": new Date() } },
      ).catch((error) =>
        console.error("Unable to refresh meeting activity:", error),
      );
    });

    socket.on("meeting:media-state", (state = {}) => {
      const current = room.participants.get(identity.participantId);
      if (!current || current.socketId !== socket.id) return;
      current.micOn = current.mutedByHost ? false : Boolean(state.micOn);
      current.camOn = Boolean(state.camOn);
      current.screenOn = Boolean(state.screenOn);
      io.to(identity.roomId).emit("meeting:participant-state", {
        participantId: current.participantId,
        micOn: current.micOn,
        camOn: current.camOn,
        screenOn: current.screenOn,
        mutedByHost: current.mutedByHost,
      });
    });

    socket.on("meeting:webrtc-signal", (packet = {}) => {
      const current = room.participants.get(identity.participantId);
      const target = room.participants.get(packet.to);
      const now = Date.now();
      if (now - signalWindowStart >= 1000) {
        signalWindowStart = now;
        signalCount = 0;
      }
      signalCount += 1;
      if (
        !current ||
        current.socketId !== socket.id ||
        !target ||
        target.socketId === socket.id ||
        signalCount > 120
      ) {
        return;
      }

      if (isValidWebRTCDescription(packet.description)) {
        io.to(target.socketId).emit("meeting:webrtc-signal", {
          from: current.participantId,
          name: current.name,
          role: current.role,
          description: packet.description,
        });
        return;
      }

      if (isValidWebRTCCandidate(packet.candidate)) {
        io.to(target.socketId).emit("meeting:webrtc-signal", {
          from: current.participantId,
          name: current.name,
          role: current.role,
          candidate: packet.candidate,
        });
      }
    });

    socket.on("meeting:hand", (raised) => {
      const current = room.participants.get(identity.participantId);
      if (!current || current.socketId !== socket.id) return;
      current.handRaised = Boolean(raised);
      io.to(identity.roomId).emit("meeting:participant-state", {
        participantId: current.participantId,
        handRaised: current.handRaised,
      });
    });

    socket.on("meeting:recording", (recording) => {
      const current = room.participants.get(identity.participantId);
      if (!current || current.socketId !== socket.id || !isHost(current)) return;
      room.settings.recording = Boolean(recording);
      io.to(identity.roomId).emit("meeting:settings", room.settings);
    });

    socket.on("meeting:chat", (text) => {
      const current = room.participants.get(identity.participantId);
      const now = Date.now();
      if (
        !current ||
        current.socketId !== socket.id ||
        !room.settings.allowChat ||
        typeof text !== "string" ||
        now - lastChatAt < 500
      ) {
        return;
      }
      const clean = text.trim().slice(0, MAX_CHAT_LENGTH);
      if (!clean) return;
      lastChatAt = now;
      io.to(identity.roomId).emit("meeting:chat-message", {
        id: `${socket.id}-${now}`,
        participantId: current.participantId,
        name: current.name,
        text: clean,
        at: now,
      });
    });

    socket.on("meeting:file", (file = {}) => {
      const current = room.participants.get(identity.participantId);
      if (
        !current ||
        current.socketId !== socket.id ||
        !room.settings.allowChat ||
        typeof file.name !== "string" ||
        typeof file.type !== "string" ||
        typeof file.data !== "string" ||
        !ALLOWED_FILE_TYPES.has(file.type) ||
        Buffer.byteLength(file.data, "base64") > MAX_FILE_BYTES
      ) {
        socket.emit("meeting:error", {
          code: "FILE_NOT_ALLOWED",
          message: "This file type or size is not allowed.",
        });
        return;
      }
      const cleanName = file.name
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .slice(0, 120);
      io.to(identity.roomId).emit("meeting:file-message", {
        id: `${socket.id}-${Date.now()}`,
        participantId: current.participantId,
        name: current.name,
        fileName: cleanName || "shared-file",
        fileType: file.type,
        data: file.data,
        at: Date.now(),
      });
    });

    socket.on("meeting:moderate", async (action = {}) => {
      const actor = room.participants.get(identity.participantId);
      if (!actor || actor.socketId !== socket.id) return;
      if (!canModerate(actor)) {
        socket.emit("meeting:error", {
          code: "MEETING_HOST_REQUIRED",
          message: "Only the host or a co-host can moderate this meeting.",
        });
        return;
      }

      try {
        if (action.type === "mute" || action.type === "unmute") {
          const target = room.participants.get(action.participantId);
          if (!target || target.role === "host") return;
          target.mutedByHost = action.type === "mute";
          if (target.mutedByHost) {
            target.micOn = false;
            io.to(target.socketId).emit("meeting:force-mute");
          }
          io.to(identity.roomId).emit("meeting:participant-state", {
            participantId: target.participantId,
            micOn: target.micOn,
            mutedByHost: target.mutedByHost,
          });
          return;
        }

        if (action.type === "remove") {
          const target = room.participants.get(action.participantId);
          if (!target || target.role === "host") return;
          await Meeting.updateOne(
            {
              _id: identity.meetingId,
              "participants.participantId": target.participantId,
            },
            { $set: { "participants.$.leftAt": new Date() } },
          );
          io.to(target.socketId).emit("meeting:removed");
          io.sockets.sockets.get(target.socketId)?.disconnect(true);
          return;
        }

        if (action.type === "assign-cohost" && isHost(actor)) {
          const target = room.participants.get(action.participantId);
          if (!target || target.role === "host") return;
          await Meeting.updateOne(
            {
              _id: identity.meetingId,
              "participants.participantId": target.participantId,
              "participants.role": { $ne: "host" },
            },
            { $set: { "participants.$.role": "cohost" } },
          );
          target.role = "cohost";
          io.to(identity.roomId).emit("meeting:participant-state", {
            participantId: target.participantId,
            role: target.role,
          });
          return;
        }

        if (action.type === "lock" || action.type === "unlock") {
          const locked = action.type === "lock";
          await Meeting.updateOne(
            { _id: identity.meetingId },
            { $set: { locked } },
          );
          room.settings.locked = locked;
          io.to(identity.roomId).emit("meeting:settings", room.settings);
          return;
        }

        if (action.type === "permissions" && isHost(actor)) {
          const { allowChat, allowParticipantScreenShare } = action;
          if (
            (allowChat !== undefined && typeof allowChat !== "boolean") ||
            (allowParticipantScreenShare !== undefined &&
              typeof allowParticipantScreenShare !== "boolean")
          ) {
            return;
          }
          if (allowChat !== undefined) room.settings.allowChat = allowChat;
          if (allowParticipantScreenShare !== undefined) {
            room.settings.allowParticipantScreenShare =
              allowParticipantScreenShare;
          }
          await Meeting.updateOne(
            { _id: identity.meetingId },
            {
              $set: {
                allowChat: room.settings.allowChat,
                allowParticipantScreenShare:
                  room.settings.allowParticipantScreenShare,
              },
            },
          );
          io.to(identity.roomId).emit("meeting:settings", room.settings);
          return;
        }

        if (action.type === "end" && isHost(actor)) {
          await Meeting.updateOne(
            { _id: identity.meetingId },
            { $set: { endedAt: new Date() } },
          );
          io.to(identity.roomId).emit("meeting:ended");
          for (const member of room.participants.values()) {
            io.sockets.sockets.get(member.socketId)?.disconnect(true);
          }
        }
      } catch (error) {
        console.error("Unable to apply meeting moderation action:", error);
        socket.emit("meeting:error", {
          code: "MEETING_ACTION_FAILED",
          message: "The meeting action could not be completed.",
        });
      }
    });

    socket.on("meeting:leave", async () => {
      await Meeting.updateOne(
        {
          _id: identity.meetingId,
          "participants.participantId": identity.participantId,
        },
        { $set: { "participants.$.leftAt": new Date() } },
      ).catch((error) =>
        console.error("Unable to record meeting departure:", error),
      );
      socket.disconnect(true);
    });

    socket.on("disconnect", () => {
      const current = room.participants.get(identity.participantId);
      if (current?.socketId !== socket.id) return;
      room.participants.delete(identity.participantId);
      if (current.role === "host" && room.settings.recording) {
        room.settings.recording = false;
        io.to(identity.roomId).emit("meeting:settings", room.settings);
      }
      if (room.participants.size === 0) {
        rooms.delete(identity.roomId);
      } else {
        socket.to(identity.roomId).emit(
          "meeting:participant-left",
          identity.participantId,
        );
      }
      void Meeting.updateOne(
        {
          _id: identity.meetingId,
          "participants.participantId": identity.participantId,
        },
        { $set: { "participants.$.lastSeenAt": new Date() } },
      ).catch((error) =>
        console.error("Unable to update meeting disconnect time:", error),
      );
    });
  });
};
