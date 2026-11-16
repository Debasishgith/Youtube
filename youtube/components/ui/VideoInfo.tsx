"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Download,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import axios from "axios";
import { useUser } from "@/lib/authContext";
import axiosInstance from "@/lib/axiosInstance";
import { auth } from "@/lib/firebase";
import { Avatar, AvatarFallback } from "./avatar";
import { Button } from "./button";

interface VideoInfoData {
  _id: string;
  videotitle: string;
  videochanel: string;
  views: number;
  createdAt: string;
  filename?: string;
  minimumSubscriptionPlan?: string;
  Like?: number;
  Dislike?: number;
}

interface DownloadEligibility {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string;
  subscriptionActive: boolean;
  subscriptionMessage?: string;
  requiredPlan: string;
  videoAllowed: boolean;
  videoAvailable: boolean;
  deviceAllowed: boolean;
  duplicateDownload: boolean;
  canDownload: boolean;
}

const getDeviceId = () => {
  const deviceStorageKey = "youtube-device-id";
  let deviceId = window.localStorage.getItem(deviceStorageKey);
  if (!deviceId) {
    deviceId = window.crypto.randomUUID();
    window.localStorage.setItem(deviceStorageKey, deviceId);
  }
  return deviceId;
};

const formatQuotaReset = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

const VideoInfo = ({ video }: { video: VideoInfoData }) => {
  const [likes, setlikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useUser();
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadQuota, setDownloadQuota] =
    useState<DownloadEligibility | null>(null);
  const [isCheckingQuota, setIsCheckingQuota] = useState(false);
  const [quotaCheckError, setQuotaCheckError] = useState("");
  const downloadInFlight = useRef(false);

  const loadDownloadQuota = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setDownloadQuota(null);
      return null;
    }

    setIsCheckingQuota(true);
    setQuotaCheckError("");
    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.get<DownloadEligibility>(
        `/download/quota/${video._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Device-Id": getDeviceId(),
          },
        },
      );
      setDownloadQuota(response.data);
      return response.data;
    } catch (error) {
      console.error("Unable to check download eligibility:", error);
      setDownloadQuota(null);
      setQuotaCheckError(
        "Could not check your download quota. The server will still verify access when you download.",
      );
      return null;
    } finally {
      setIsCheckingQuota(false);
    }
  }, [video._id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDownloadQuota();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDownloadQuota, user]);

  useEffect(() => {
    const handleviews = async () => {
      if (user) {
        try {
          return await axiosInstance.post(`/history/${video._id}`, {
            userId: user?._id,
          });
        } catch (error) {
          return console.log(error);
        }
      } else {
        return await axiosInstance.post(`/history/views/${video?._id}`);
      }
    };
    handleviews();
  }, [user, video._id]);

  const handleLike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.liked) {
        if (isLiked) {
          setlikes((prev) => prev - 1);
          setIsLiked(false);
        } else {
          setlikes((prev) => prev + 1);
          setIsLiked(true);
          if (isDisliked) {
            setDislikes((prev) => prev - 1);
            setIsDisliked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleWatchLater = async () => {
    try {
      const res = await axiosInstance.post(`/watch/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.watchlater) {
        setIsWatchLater(!isWatchLater);
      } else {
        setIsWatchLater(false);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDislike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
      });
      if (!res.data.liked) {
        if (isDisliked) {
          setDislikes((prev) => prev - 1);
          setIsDisliked(false);
        } else {
          setDislikes((prev) => prev + 1);
          setIsDisliked(true);
          if (isLiked) {
            setlikes((prev) => prev - 1);
            setIsLiked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDownload = async () => {
    if (downloadInFlight.current) return;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setDownloadError("Sign in to download this video.");
      return;
    }

    downloadInFlight.current = true;
    setIsDownloading(true);
    setDownloadError("");

    try {
      const currentEligibility = await loadDownloadQuota();
      if (!currentEligibility) {
        setDownloadError(
          "Could not verify your download access. Please try again.",
        );
        return;
      }
      if (!currentEligibility.canDownload) return;

      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.get<Blob>(
        `/download/${video._id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Device-Id": getDeviceId(),
          },
          responseType: "blob",
        },
      );

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = video.filename || `${video.videotitle}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: unknown) {
      let message = "Unable to download this video.";
      const responseData = axios.isAxiosError(error)
        ? error.response?.data
        : undefined;

      if (responseData instanceof Blob) {
        try {
          const parsed = JSON.parse(await responseData.text()) as {
            message?: string;
            stage?: string;
          };
          message = [
            parsed.message || message,
            parsed.stage ? `Failed during: ${parsed.stage}.` : "",
          ]
            .filter(Boolean)
            .join(" ");
        } catch {
          message = "Unable to download this video.";
        }
      } else if (
        typeof responseData === "object" &&
        responseData !== null &&
        "message" in responseData &&
        typeof responseData.message === "string"
      ) {
        message = responseData.message;
      }

      setDownloadError(message);
    } finally {
      downloadInFlight.current = false;
      setIsDownloading(false);
      await loadDownloadQuota();
    }
  };

  const downloadUnavailableMessage = !downloadQuota
    ? ""
    : !downloadQuota.subscriptionActive
      ? downloadQuota.subscriptionMessage ||
        "Your subscription is not active. Renew to download."
      : !downloadQuota.videoAllowed
        ? `This video requires the ${downloadQuota.requiredPlan} plan or higher.`
        : !downloadQuota.videoAvailable
          ? "The video file is currently unavailable."
          : !downloadQuota.deviceAllowed
            ? "This device is not authorized to download from your account."
            : downloadQuota.remaining === 0 && !downloadQuota.duplicateDownload
              ? `You've used today's ${downloadQuota.plan} download quota. It resets at ${formatQuotaReset(downloadQuota.resetsAt)}.`
              : "";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{video.videotitle}</h1>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{video.videochanel}</h3>
            <p className="text-sm text-gray-600">1.2M subscribers</p>
          </div>
          <Button className="ml-4">Subscribe</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-full">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-l-full"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 ${
                  isLiked ? "fill-black text-black" : ""
                }`}
              />
              {likes.toLocaleString()}
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button
              variant="ghost"
              size="sm"
              className="rounded-r-full"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 ${
                  isDisliked ? "fill-black text-black" : ""
                }`}
              />
              {dislikes.toLocaleString()}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`bg-gray-100 rounded-full ${
              isWatchLater ? "text-primary" : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
            onClick={handleDownload}
            disabled={
              isDownloading ||
              isCheckingQuota ||
              (Boolean(downloadQuota) && !downloadQuota?.canDownload)
            }
          >
            <Download className="w-5 h-5 mr-2" />
            {isDownloading
              ? "Preparing..."
              : isCheckingQuota
                ? "Checking..."
                : !user
                  ? "Sign in to download"
                  : downloadQuota?.duplicateDownload &&
                      downloadQuota.remaining === 0
                    ? "Download again"
                    : downloadQuota?.remaining !== undefined
                      ? `Download (${downloadQuota.remaining} left)`
                      : "Download"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 rounded-full"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>
      {downloadQuota && (
        <p className="text-sm text-gray-600" aria-live="polite">
          {downloadQuota.plan} plan: {downloadQuota.remaining} of{" "}
          {downloadQuota.limit} downloads remaining today.
        </p>
      )}
      {downloadUnavailableMessage && (
        <p className="text-sm text-amber-700" role="status">
          {downloadUnavailableMessage}{" "}
          {downloadUnavailableMessage.includes("quota") && (
            <Link className="underline" href="/subscription">
              View plans
            </Link>
          )}
        </p>
      )}
      {quotaCheckError && (
        <p className="text-sm text-gray-600" role="status">
          {quotaCheckError}
        </p>
      )}
      {downloadError && (
        <p className="text-sm text-red-600" role="alert">
          {downloadError}
        </p>
      )}
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex gap-4 text-sm font-medium mb-2">
          <span>{video.views} views</span>
          <span>{video.createdAt} ago</span>
        </div>
        <div className={`text-sm ${showFullDescription ? "" : "line-clamp-3"}`}>
          <p>Video description.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>
    </div>
  );
};

export default VideoInfo;
