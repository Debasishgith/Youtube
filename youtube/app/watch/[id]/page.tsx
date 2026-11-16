"use client";
import Comments from "@/components/ui/Comments";
import RelatedVideos from "@/components/ui/RelatedVideos";
import VideoInfo from "@/components/ui/VideoInfo";
import VideoPlayer from "@/components/ui/VideoPlayer";
import axiosInstance from "@/lib/axiosInstance";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const VIDEO_COMPLETION_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_VIDEO_COMPLETION_THRESHOLD ?? "0.9",
);

interface WatchVideo {
  _id: string;
  filepath: string;
  videotitle: string;
  videochanel: string;
  views: number;
  createdAt: string;
  Like?: number;
  Dislike?: number;
  minimumSubscriptionPlan?: string;
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [video, setVideo] = useState<WatchVideo | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<WatchVideo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);
  const nextVideo = useMemo(
    () => relatedVideos?.find((item) => item._id !== video?._id) ?? null,
    [relatedVideos, video?._id],
  );

  const playNextVideo = useCallback(() => {
    if (!nextVideo) return;
    try {
      window.sessionStorage.setItem("youtube-autoplay-next", nextVideo._id);
    } catch (error) {
      console.warn("Unable to set next-video autoplay state:", error);
    }
    router.push(`/watch/${nextVideo._id}`);
  }, [nextVideo, router]);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const res = await axiosInstance.get<WatchVideo[]>("/video/allvideos");
        const foundVideo = res.data?.find((vid) => vid._id === id);
        setVideo(foundVideo ?? null);
        setRelatedVideos(res.data);
      } catch (error) {
        console.error("Error fetching video:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading video...
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        Video not found
      </div>
    );
  }

  const player = (
    <VideoPlayer
      key={`player-${video._id}`}
      video={video}
      nextVideo={nextVideo}
      onNextVideo={playNextVideo}
      theaterMode={theaterMode}
      onToggleTheater={() => setTheaterMode((current) => !current)}
      completionThreshold={VIDEO_COMPLETION_THRESHOLD}
    />
  );

  return (
    <div className="min-h-screen min-w-0 flex-1 bg-white">
      <div
        className={`mx-auto w-full p-4 ${
          theaterMode ? "max-w-none" : "max-w-7xl"
        }`}
      >
        <div
          className={`grid grid-cols-1 gap-6 ${
            theaterMode
              ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]"
              : "lg:grid-cols-3"
          }`}
        >
          {theaterMode && (
            <div className="min-w-0 lg:col-span-2">{player}</div>
          )}
          <div
            className={`min-w-0 space-y-4 ${
              theaterMode ? "" : "lg:col-span-2"
            }`}
          >
            {!theaterMode && player}
            <VideoInfo key={`info-${video._id}`} video={video} />
            <Comments videoId={id} />
          </div>
          <div
            className={`min-w-0 space-y-4 ${
              theaterMode ? "lg:border-l lg:border-gray-200 lg:pl-6" : ""
            }`}
          >
            <RelatedVideos
              videos={relatedVideos?.filter((item) => item._id !== video._id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
