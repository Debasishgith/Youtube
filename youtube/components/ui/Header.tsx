"use client";

import { Bell, Menu, Mic, Search, User, VideoIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import ChannelDialogue from "./ChannelDialogue";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/authContext";

const Header = () => {
  const { user, logOut, handleGoogleSignIn } = useUser();

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDialogueOpen, setIsDialogueOpen] = useState(false);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  const handleKeypress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(e as any);
    }
  };

  return (
    <header className="flex items-center gap-4 py-3 px-5 border-b">
      <Button variant="ghost" size="icon">
        <Menu />
      </Button>
      <Link href="/" className="flex items-center gap-2">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M23.498 6.186a2.94 2.94 0 0 0-2.071-2.076C19.49 3.5 12 3.5 12 3.5s-7.49 0-9.427.61A2.94 2.94 0 0 0 .502 6.186 30.3 30.3 0 0 0 0 12a30.3 30.3 0 0 0 .502 5.814 2.94 2.94 0 0 0 2.071 2.076C4.51 20.5 12 20.5 12 20.5s7.49 0 9.427-.61a2.94 2.94 0 0 0 2.071-2.076A30.3 30.3 0 0 0 24 12a30.3 30.3 0 0 0-.502-5.814Z"
            fill="#FF0000"
          />
          <path d="M10 15.397V8.603L15.5 12l-5.5 3.397Z" fill="#fff" />
        </svg>

        <span className="font-medium text-2xl">YouTube</span>
        <span className="text-xs text-gray-500">IN</span>
      </Link>
      <form
        onSubmit={handleSearch}
        className="flex gap-2 items-center flex-1 justify-center"
      >
        <div className="flex items-center border rounded-md shadow-2xs ">
          <input
            onKeyPress={handleKeypress}
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-gray-600 w-md px-3 outline-none text-sm py-1  "
          />
          <Button
            variant="ghost"
            size="icon"
            type="submit"
            className="text-gray-600 bg-gray-50 hover:bg-gray-100 border-2 border-l-0 px-6 rounded-r-md rounded-l-none"
          >
            <Search width="20" height="20" />
          </Button>
        </div>

        <Button variant="ghost" size="icon">
          <Mic className="text-gray-600" />
        </Button>
      </form>
      {user ? (
        <>
          <Button variant="ghost" size="icon">
            <VideoIcon className="text-gray-600" />
          </Button>
          <Button variant="ghost" size="icon">
            <Bell className="text-gray-600" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="rounded-full h-8 w-8">
                  <Avatar>
                    <AvatarImage src={user.image} />
                    <AvatarFallback>
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <DropdownMenuContent className="w-56 " align="end">
              {user?.channelName ? (
                <DropdownMenuItem>
                  <Link href={`/channel/${user._id}`}>Your Channel</Link>
                </DropdownMenuItem>
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

              <DropdownMenuItem>
                <Link href="/history">History</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/liked">Liked videos</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Link href="/watchLater">Watch Later</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logOut}>Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <>
          <Button onClick={handleGoogleSignIn}>
            <User />
            Sign In
          </Button>
        </>
      )}
      <ChannelDialogue
        isOpen={isDialogueOpen}
        onClose={() => setIsDialogueOpen(false)}
        mode="create"
      />
    </header>
  );
};

export default Header;
