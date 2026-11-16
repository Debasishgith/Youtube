import express from "express";
import {
  getallwatchlater,
  handlewatchlater,
} from "../controllers/watchLater.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";
const routes = express.Router();

routes.get("/:userId", verifyFirebaseToken, getallwatchlater);
routes.post("/:videoId", verifyFirebaseToken, handlewatchlater);

export default routes;
