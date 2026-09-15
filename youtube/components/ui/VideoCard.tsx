"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "./avatar";
import { formatDistanceToNow } from "date-fns";

const VideoCard = ({ video }: any) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <Link href={`/watch/${video._id}`} className="group">
      <div>
        <div className="relative rounded-md aspect-video overflow-hidden">
          <video
            src={
              `${process.env.NEXT_PUBLIC_BACKEND_URL}/${video.filepath}` ||
              "/video/vdo.mp4"
            }
            className="object-cover group-hover:scale-105 w-100 transition-transform duration-200 ease-in"
          />
          <div className="absolute right-0 bottom-0 bg-black/75 text-sm text-white px-2">
            10:24
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <Avatar>
            <AvatarFallback>{video.videochanel?.[0] ?? "V"}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-bold">{video.videotitle}</h2>
            <p>{video.videochanel}</p>
            <p>
              {video.views?.toLocaleString() ?? 0} views .
              {isMounted
                ? formatDistanceToNow(new Date(video.createdAt))
                : "recently"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default VideoCard;
