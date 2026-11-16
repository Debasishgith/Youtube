import express from "express";
import { getallLikedVideo, handleLike } from "../controllers/like.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";
const routes = express.Router();

routes.get("/:userId", verifyFirebaseToken, getallLikedVideo);
routes.post("/:videoId", verifyFirebaseToken, handleLike);

export default routes;
