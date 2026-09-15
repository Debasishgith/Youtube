import express from "express";
import {
  getallwatchlater,
  handlewatchlater,
} from "../controllers/watchLater.js";
const routes = express.Router();

routes.get("/:userId", getallwatchlater);
routes.post("/:videoId", handlewatchlater);

export default routes;
