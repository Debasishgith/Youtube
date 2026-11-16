import express from "express";
import {
  deletecomment,
  getCommentModerationHistory,
  getallcomment,
  listCommentReports,
  postcomment,
  editcomment,
  reactToComment,
  reportComment,
  translateComment,
  requireCommentAdmin,
  reviewCommentReport,
  searchMentionUsers,
} from "../controllers/comment.js";
import {
  verifyFirebaseToken,
  verifyFirebaseTokenOptional,
} from "../middleware/authFirebase.js";

const routes = express.Router();
routes.get("/mentions/search", searchMentionUsers);
routes.get(
  "/admin/reports",
  verifyFirebaseToken,
  requireCommentAdmin,
  listCommentReports,
);
routes.patch(
  "/admin/reports/:reportId",
  verifyFirebaseToken,
  requireCommentAdmin,
  reviewCommentReport,
);
routes.post("/translate", translateComment);
routes.get(
  "/admin/history/:commentId",
  verifyFirebaseToken,
  requireCommentAdmin,
  getCommentModerationHistory,
);
routes.get("/:videoid", verifyFirebaseTokenOptional, getallcomment);
routes.post("/postcomment", verifyFirebaseToken, postcomment);
routes.delete("/deletecomment/:id", verifyFirebaseToken, deletecomment);
routes.post("/editcomment/:id", verifyFirebaseToken, editcomment);
routes.post("/reaction/:id", verifyFirebaseToken, reactToComment);
routes.post("/report/:id", verifyFirebaseToken, reportComment);
export default routes;
