"use client";
import Link from "next/link";
import React, { useState } from "react";
import { Button } from "./button";
import {
  Clock,
  Compass,
  History,
  Home,
  PlaySquare,
  ThumbsUp,
  User,
} from "lucide-react";
import ChannelDialogue from "./ChannelDialogue";
import { useUser } from "@/lib/authContext";

const Sidebar = () => {
  const { user } = useUser();

  const [isDialogueOpen, setIsDialogueOpen] = useState(false);

  return (
    <aside className="min-h-screen w-64 bg-white border-r p-2">
      <nav className="flex flex-col gap-2">
        <Link href="/">
          <Button variant="ghost" className="w-full justify-start">
            <Home className="w-5 h-5 mr-3" />
            Home
          </Button>
        </Link>
        <Link href="/explore">
          <Button variant="ghost" className="w-full justify-start">
            <Compass className="w-5 h-5 mr-3" />
            Explore
          </Button>
        </Link>
        <Link href="/subscriptions">
          <Button variant="ghost" className="w-full justify-start">
            <PlaySquare className="w-5 h-5 mr-3" />
            Subscriptions
          </Button>
        </Link>
        {user && (
          <>
            <div className="border-t pt-4">
              <Link href="/history">
                <Button variant="ghost" className="w-full justify-start">
                  <History className="w-5 h-5 mr-3" />
                  History
                </Button>
              </Link>
              <Link href="/liked">
                <Button variant="ghost" className="w-full justify-start">
                  <ThumbsUp className="w-5 h-5 mr-3" />
                  Liked videos
                </Button>
              </Link>
              <Link href="/watch-later">
                <Button variant="ghost" className="w-full justify-start">
                  <Clock className="w-5 h-5 mr-3" />
                  Watch later
                </Button>
              </Link>
              <Link href={`/channel/${user._id}`}>
                {user.channelName ? (
                  <Button variant="ghost" className="w-full justify-start">
                    <User className="w-5 h-5 mr-3" />
                    Your channel
                  </Button>
                ) : (
                  <div>
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() => setIsDialogueOpen(true)}
                    >
                      Create a channel
                    </Button>
                  </div>
                )}
              </Link>
            </div>
          </>
        )}
      </nav>
      <ChannelDialogue
        isOpen={isDialogueOpen}
        onClose={() => setIsDialogueOpen(false)}
        mode="create"
      />
    </aside>
  );
};

export default Sidebar;
