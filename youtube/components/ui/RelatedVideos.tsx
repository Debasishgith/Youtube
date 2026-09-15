import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

const RelatedVideos = ({ videos }: any) => {
  return (
    <div className="w-full mt-3 space-y-4 ">
      {videos?.map((video: any) => (
        <Link
          key={video._id}
          href={`/watch/${video._id}`}
          className="flex gap-4 hover:bg-gray-100/75 rounded-xl "
        >
          <video
            src={
              `${process.env.NEXT_PUBLIC_BACKEND_URL}/${video.filepath}` ||
              "/video/vdo.mp4"
            }
            className="h-30 max-w-md aspect-video overflow-hidden rounded-xl shadow-md"
          />
          <div className="flex flex-col py-3">
            <h3>{video.videotitle}</h3>
            <p className="text-sm text-gray-500">{video.videochanel}</p>
            <p className="text-sm text-gray-500">
              {video.views?.toLocaleString() ?? 0} views{" • "}
              {formatDistanceToNow(new Date(video.createdAt))}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default RelatedVideos;
