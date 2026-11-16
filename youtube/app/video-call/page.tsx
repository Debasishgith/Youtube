"use client";

import axiosInstance from "@/lib/axiosInstance";
import { auth } from "@/lib/firebase";
import { useUser } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface MeetingCredentials {
  roomId: string;
  inviteToken: string;
  participantToken: string;
  displayName: string;
}

const getApiError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "response" in error &&
  typeof error.response === "object" &&
  error.response !== null &&
  "data" in error.response &&
  typeof error.response.data === "object" &&
  error.response.data !== null &&
  "message" in error.response.data &&
  typeof error.response.data.message === "string"
    ? error.response.data.message
    : "The meeting request could not be completed.";

export default function VideoCallPage() {
  const { user, handleGoogleSignIn, authPending } = useUser();
  const [title, setTitle] = useState("");
  const [inviteValue, setInviteValue] = useState("");
  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const saveMeetingSession = (credentials: MeetingCredentials) => {
    sessionStorage.setItem(
      `meeting:${credentials.roomId}:participant-token`,
      credentials.participantToken,
    );
    sessionStorage.setItem(
      `meeting:${credentials.roomId}:display-name`,
      credentials.displayName,
    );
  };

  const createMeeting = async () => {
    if (!user || !auth.currentUser) {
      setError("Sign in with a verified account to create a meeting.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await axiosInstance.post<MeetingCredentials>(
        "/meeting",
        { title },
        { headers: { Authorization: `Bearer ${idToken}` } },
      );
      saveMeetingSession(response.data);
      router.push(
        `/room/${response.data.roomId}?invite=${encodeURIComponent(response.data.inviteToken)}`,
      );
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  };

  const joinMeeting = () => {
    const name = displayName.trim().slice(0, 40);
    if (!name) {
      setError("Enter the name you want other participants to see.");
      return;
    }

    let inviteUrl: URL;
    try {
      inviteUrl = new URL(inviteValue.trim(), window.location.origin);
    } catch {
      setError("Paste the complete invite link from the host.");
      return;
    }

    const roomMatch = inviteUrl.pathname.match(/^\/room\/([A-Za-z0-9_-]+)\/?$/);
    const inviteToken = inviteUrl.searchParams.get("invite");
    if (
      !roomMatch ||
      !/^[A-Za-z0-9_-]{8,64}$/.test(roomMatch[1]) ||
      !inviteToken
    ) {
      setError("Paste a complete invite link from the host.");
      return;
    }

    router.push(
      `/room/${roomMatch[1]}?invite=${encodeURIComponent(inviteToken)}&name=${encodeURIComponent(name)}`,
    );
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Video meetings</h1>
      </header>

      <section className="space-y-4 rounded-xl border p-5 ">
        <h2 className="text-xl font-medium">Start a meeting</h2>
        {user ? (
          <>
            <label className="block space-y-1 text-sm">
              <span>Meeting title (optional)</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={100}
                className="w-full rounded-md border px-3 py-2"
                placeholder="My meeting"
              />
            </label>
            <button
              type="button"
              onClick={createMeeting}
              disabled={busy || authPending}
              className="rounded-md bg-red-600 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {busy ? "Creating meeting…" : "Create meeting"}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Hosts must sign in. Guests can join with an invite link.
            </p>
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={authPending}
              className="rounded-md border px-4 py-2 disabled:opacity-50"
            >
              {authPending ? "Signing in…" : "Sign in to create a meeting"}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border p-5">
        <h2 className="text-xl font-medium">Join a meeting</h2>
        <label className="block space-y-1 text-sm">
          <span>Your display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            className="w-full rounded-md border px-3 py-2"
            placeholder="Enter your name"
            autoComplete="name"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Invite link</span>
          <input
            value={inviteValue}
            onChange={(event) => setInviteValue(event.target.value)}
            className="w-full rounded-md border px-3 py-2"
            placeholder="Paste the meeting link from the host"
          />
        </label>
        <button
          type="button"
          onClick={joinMeeting}
          disabled={busy}
          className="rounded-md border px-4 py-2 font-medium disabled:opacity-50"
        >
          Join meeting
        </button>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </main>
  );
}
