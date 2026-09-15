"use client";
import { useRef } from "react";

const VideoPlayer = ({ video }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoData = Array.isArray(video) ? video[0] : video;
  const videoUrl = videoData?.filepath
    ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/${videoData.filepath}`
    : "/video/vdo.mp4";

  return (
    <div className="w-full aspect-video overflow-hidden rounded-xl shadow-md">
      <video
        ref={videoRef}
        className="rounded-md w-full h-full object-cove "
        controls
      >
        <source src={videoUrl} />
      </video>
    </div>
  );
};

export default VideoPlayer;
