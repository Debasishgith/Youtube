import Category from "@/components/ui/Category";
import VideoGrid from "@/components/ui/VideoGrid";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="flex-1 p-4">
      <Category />
      <Suspense fallback={<div>Loading vidoes...</div>}>
        <VideoGrid />
      </Suspense>
    </main>
  );
}
