import express from "express";
import {
  getallhistoryVideo,
  handlehistory,
  handleview,
} from "../controllers/history.js";

const routes = express.Router();

routes.get("/:userId", getallhistoryVideo);
routes.get("/views/:userId", handleview);

routes.post("/:videoId", handlehistory);

export default routes;
