"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ChannelHeader from "@/components/ui/ChannelHeader";
import ChannelTabs from "@/components/ui/ChannelTabs";
import ChannelVideos from "@/components/ui/ChannelVideoes";
import VideoUploader from "@/components/ui/VideoUploader";
import { useUser } from "@/lib/authContext";
import axiosInstance from "@/lib/axiosInstance";

interface Channel {
  _id: string;
  name: string;
  channelName?: string;
  description?: string;
  image?: string;
}

interface ChannelVideo {
  _id: string;
  videotitle: string;
  filename: string;
  filetype: string;
  filepath: string;
  filesize: number | string;
  videochanel: string;
  Like: number;
  views: number;
  uploader: string;
  createdAt: string;
}

export default function ChannelPage() {
  const params = useParams();
  const channelId = typeof params.id === "string" ? params.id : "";
  const { user } = useUser();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!channelId) return;

    let active = true;
    const loadChannel = async () => {
      setLoading(true);
      setError("");
      try {
        const [channelResponse, videosResponse] = await Promise.all([
          axiosInstance.get<Channel>(`/user/${channelId}`),
          axiosInstance.get<ChannelVideo[]>(`/video/channel/${channelId}`),
        ]);
        if (!active) return;
        setChannel(channelResponse.data);
        setVideos(videosResponse.data);
      } catch (requestError) {
        console.error("Unable to load channel:", requestError);
        if (active) {
          setError("This channel could not be loaded. Please try again later.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadChannel();
    return () => {
      active = false;
    };
  }, [channelId]);

  if (loading) {
    return (
      <main className="flex-1 p-8 text-center" aria-live="polite">
        Loading channel…
      </main>
    );
  }

  if (error || !channel) {
    return (
      <main className="flex-1 p-8 text-center" role="alert">
        {error || "Channel not found."}
      </main>
    );
  }

  const isChannelOwner = user?._id === channel._id;

  return (
    <main className="min-h-screen flex-1 bg-white">
      <ChannelHeader channel={channel} user={user} />
      <ChannelTabs />
      {isChannelOwner && (
        <div className="px-4 pb-8">
          <VideoUploader
            channelId={channel._id}
          />
        </div>
      )}
      <div className="px-4 pb-8">
        <ChannelVideos videos={videos} />
      </div>
    </main>
  );
}
