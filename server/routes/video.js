import express from "express";
import {
  getAllVideo,
  getChannelVideos,
  uploadVideo,
} from "../controllers/video.js";
import upload from "../fileHelper/fileHelper.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";

const routes = express.Router();

routes.post(
  "/channel/:channelId/upload",
  verifyFirebaseToken,
  upload.single("file"),
  uploadVideo,
);
routes.get("/channel/:channelId", getChannelVideos);
routes.get("/allvideos", getAllVideo);

export default routes;
