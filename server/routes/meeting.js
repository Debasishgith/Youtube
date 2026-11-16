import express from "express";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";
import {
  authenticateMeetingParticipant,
  createMeeting,
  endMeeting,
  leaveMeeting,
  joinMeeting,
  requireMeetingHost,
  updateMeetingLock,
  updateMeetingPermissions,
} from "../controllers/meeting.js";

const routes = express.Router();

routes.post("/", verifyFirebaseToken, createMeeting);
routes.post("/:roomId/join", joinMeeting);
routes.post(
  "/:roomId/leave",
  authenticateMeetingParticipant,
  leaveMeeting,
);
routes.patch(
  "/:roomId/lock",
  authenticateMeetingParticipant,
  requireMeetingHost,
  updateMeetingLock,
);
routes.patch(
  "/:roomId/permissions",
  authenticateMeetingParticipant,
  requireMeetingHost,
  updateMeetingPermissions,
);
routes.post(
  "/:roomId/end",
  authenticateMeetingParticipant,
  requireMeetingHost,
  endMeeting,
);

export default routes;
