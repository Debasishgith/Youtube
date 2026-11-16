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
import downloadRoutes from "./routes/download.js";
import subscriptionRoutes from "./routes/subscription.js";
import meetingRoutes from "./routes/meeting.js";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { configureMeetingSockets } from "./services/meetingSocket.js";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

const app = express();

const allowedOrigins = [
  "https://youtube-chi-five-44.vercel.app",
  "http://localhost:8000",
];

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins },
  maxHttpBufferSize: 3_000_000,
});
configureMeetingSockets(io);

app.use(
  cors({
    credentials: true,
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

if (process.env.TRUST_PROXY) {
  const trustProxy = process.env.TRUST_PROXY;
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  );
}

app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));

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
app.use("/download", downloadRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/meeting", meetingRoutes);
app.get("/", (req, res) => {
  res.send("Youtube backend is working");
});

const PORT = Number(process.env.PORT) || 8001;

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

server.listen(PORT, () => console.log("server is conected"));
