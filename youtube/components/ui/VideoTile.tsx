"use client";

import { Hand, MicOff } from "lucide-react";
import { useEffect, useRef } from "react";

interface VideoTileProps {
  id: string;
  name: string;
  stream: MediaStream | null;
  muted?: boolean;
  cameraOn?: boolean;
  micOn?: boolean;
  handRaised?: boolean;
  speaking?: boolean;
  screen?: boolean;
  registerVideo: (id: string, video: HTMLVideoElement | null) => void;
}

export default function VideoTile({
  id,
  name,
  stream,
  muted = false,
  cameraOn = true,
  micOn = true,
  handRaised = false,
  speaking = false,
  screen = false,
  registerVideo,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    registerVideo(id, videoRef.current);
    return () => registerVideo(id, null);
  }, [id, registerVideo]);

  return (
    <div
      className={`relative aspect-video min-w-0 overflow-hidden rounded-xl border bg-slate-900 ${
        speaking
          ? "border-emerald-400 ring-2 ring-emerald-400/40"
          : "border-slate-700"
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${
          cameraOn || screen ? "" : "invisible"
        }`}
      />
      {!cameraOn && !screen && (
        <div className="absolute inset-0 grid place-items-center bg-slate-800">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-slate-600 text-3xl font-semibold">
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-sm">
        <span className="max-w-[65%] truncate font-medium">{name}</span>
        {screen && (
          <span className="text-xs text-slate-300">Sharing screen</span>
        )}
        {!micOn && (
          <MicOff className="h-4 w-4 text-red-300" aria-label="Muted" />
        )}
        {handRaised && (
          <Hand className="h-4 w-4 text-yellow-300" aria-label="Hand raised" />
        )}
      </div>
    </div>
  );
}
