import LikedContent from "@/components/ui/LikedContent";
import { Suspense } from "react";

const page = () => {
  return (
    <div className="p-5">
      <h1>Liked Videos</h1>
      <Suspense fallback={<div>Loading...</div>} />
      <LikedContent />
    </div>
  );
};

export default page;
