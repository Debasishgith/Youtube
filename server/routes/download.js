import express from "express";
import {
  downloadVideo,
  getDownloadAudit,
  getDownloadQuota,
  getMyDownloads,
} from "../controllers/download.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";

const routes = express.Router();

routes.get("/me", verifyFirebaseToken, getMyDownloads);
routes.get("/audit", verifyFirebaseToken, getDownloadAudit);
routes.get("/quota/:videoId", verifyFirebaseToken, getDownloadQuota);
routes.get("/:videoId/download", verifyFirebaseToken, downloadVideo);

export default routes;
