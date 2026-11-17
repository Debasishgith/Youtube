"use client";

import { ArrowLeft } from "lucide-react";
import type { FormEvent } from "react";

interface MeetingRoomJoinScreenProps {
  displayName: string;
  inviteToken: string;
  joining: boolean;
  error: string;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export default function MeetingRoomJoinScreen({
  displayName,
  inviteToken,
  joining,
  error,
  onNameChange,
  onSubmit,
  onBack,
}: MeetingRoomJoinScreenProps) {
  return (
    <main className="fixed inset-0 z-50 grid place-items-center bg-slate-950 p-4 text-white">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6"
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div>
          <h1 className="text-2xl font-semibold">Join meeting</h1>
          <p className="mt-1 text-sm text-slate-400">
            {joining
              ? "Checking the invite and connecting…"
              : "Choose the name participants will see."}
          </p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={40}
            required
            autoComplete="name"
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={joining || !inviteToken}
          className="w-full rounded-md bg-red-600 px-4 py-2 font-medium disabled:opacity-50"
        >
          {joining ? "Joining…" : "Join"}
        </button>
        {!inviteToken && (
          <p className="text-sm text-amber-300">
            This link is missing its invite credential.
          </p>
        )}
      </form>
    </main>
  );
}
