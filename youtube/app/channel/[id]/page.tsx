"use client";

import ChannelHeader from "@/components/ui/ChannelHeader";
import ChannelTabs from "@/components/ui/ChannelTabs";
import ChannelVideoes from "@/components/ui/ChannelVideoes";
import VideoUploader from "@/components/ui/VideoUploader";
import { useUser } from "@/lib/authContext";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";

const page = () => {
  const { user } = useUser();
  const params = useParams<{ id: string }>();
  const [channel, setChannel] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchChannelAndVideos = async () => {
      try {
        // Fetch all users to find the channel owner
        const userRes = await axiosInstance.get(`/user/${params.id}`);
        if (isMounted && userRes.data) {
          setChannel(userRes.data);
        }

        // Fetch videos for this channel
        const videoRes = await axiosInstance.get("/video/allvideos");
        if (isMounted && videoRes.data) {
          const channelVideos = videoRes.data.filter(
            (video: any) => video.uploader === params.id,
          );
          setVideos(channelVideos || []);
        }
      } catch (error) {
        console.log("Error fetching channel or videos:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchChannelAndVideos();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  if (loading) {
    return <div className="p-4">Loading channel...</div>;
  }

  if (!channel) {
    return <div className="p-4">Channel not found.</div>;
  }

  return (
    <div>
      <ChannelHeader user={user} channel={channel} />
      <ChannelTabs />
      <div>
        <VideoUploader channel={channel} id={params.id} />
        <ChannelVideoes videos={videos} />
      </div>
    </div>
  );
};

export default page;
