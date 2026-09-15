"use client";
import { useEffect, useState } from "react";
import VideoCard from "./VideoCard";
import axiosInstance from "@/lib/axiosInstance";

const VideoGrid = () => {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchVideos = async () => {
      try {
        const res = await axiosInstance.get("/video/allvideos");
        if (isMounted) {
          setVideos(res.data || []);
        }
      } catch (error) {
        console.log(error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchVideos();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex gap-4 flex-wrap">
      {loading ? (
        <div>Loading videos...</div>
      ) : videos.length === 0 ? (
        <div>No videos available.</div>
      ) : (
        videos.map((video: any) => <VideoCard key={video._id} video={video} />)
      )}
    </div>
  );
};

export default VideoGrid;
