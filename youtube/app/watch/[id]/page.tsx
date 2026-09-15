"use client";
import Comments from "@/components/ui/Comments";
import RelatedVideos from "@/components/ui/RelatedVideos";
import VideoInfo from "@/components/ui/VideoInfo";
import VideoPlayer from "@/components/ui/VideoPlayer";
import axiosInstance from "@/lib/axiosInstance";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

const index = () => {
  const { id } = useParams();
  const [video, setVideo] = useState<any>(null);
  const [relatedVideos, setRelatedVideos] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchVideo = async () => {
      if (!id || typeof id !== "string") return;
      try {
        const res = await axiosInstance.get("/video/allvideos");
        const foundVideo = res.data?.find((vid: any) => vid._id === id);
        setVideo(foundVideo);
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
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer video={video} />
            <VideoInfo video={video} />
            <Comments videoId={id} />
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={relatedVideos} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default index;
