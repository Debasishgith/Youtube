import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import userRoutes from "./routes/auth.js";
import videoRoutes from "./routes/video.js";
import likeRoutes from "./routes/like.js";
import historyRoutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import watchLaterRoutes from "./routes/watchLater.js";

import path from "path";

dotenv.config();
const app = express();

app.use(
  cors({
    origin: ["https://youtube-chi-five-44.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
// Serve uploaded files with proper CORS headers for video streaming
app.use(
  "/uploads",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Accept-Ranges", "bytes");
    next();
  },
  express.static(path.join("uploads")),
);
app.use("/user", userRoutes);
app.use("/video", videoRoutes);
app.use("/like", likeRoutes);
app.use("/watch", watchLaterRoutes);
app.use("/history", historyRoutes);
app.use("/comment", commentroutes);

app.get("/", (req, res) => {
  res.send("Youtube backend is working");
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});

const DB = process.env.DB_URL;

if (!DB) {
  console.error("DB_URL is not configured; MongoDB connection skipped");
} else {
  mongoose
    .connect(DB)
    .then(() => {
      console.log("MongoDB connected");
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error.message);
    });
}
