import HistoryContent from "@/components/ui/HistoryContent";
import { Suspense } from "react";

const page = () => {
  return (
    <div className="p-5">
      <h1>Watch History</h1>
      <Suspense fallback={<div>Loading...</div>} />
      <HistoryContent />
    </div>
  );
};

export default page;
