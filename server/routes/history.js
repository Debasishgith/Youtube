import express from "express";
import {
  getallhistoryVideo,
  getWatchProgress,
  handlehistory,
  handleview,
  saveWatchProgress,
} from "../controllers/history.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";

const routes = express.Router();

routes.get("/progress/:videoId", verifyFirebaseToken, getWatchProgress);
routes.put("/progress/:videoId", verifyFirebaseToken, saveWatchProgress);
routes.get("/:userId", verifyFirebaseToken, getallhistoryVideo);
routes.get("/views/:userId", handleview);

routes.post("/:videoId", verifyFirebaseToken, handlehistory);

export default routes;
