import WatchLaterContent from "@/components/ui/WatchLaterContent";
import { Suspense } from "react";

const page = () => {
  return (
    <div className="p-5">
      <h1>Watch Later</h1>
      <Suspense fallback={<div>Loading...</div>} />
      <WatchLaterContent />
    </div>
  );
};

export default page;
