"use client";

import {
  Camera,
  CameraOff,
  Hand,
  Mic,
  MicOff,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { EMOJIS } from "./MeetingRoomHelpers";
import type {
  MeetingMessage,
  MeetingModerationAction,
  Participant,
} from "./MeetingRoomTypes";

interface MeetingRoomSidePanelProps {
  panel: "people" | "chat" | null;
  participants: Participant[];
  currentParticipantId: string;
  isModerator: boolean;
  isHost: boolean;
  messages: MeetingMessage[];
  chatEnabled: boolean;
  draft: string;
  onClose: () => void;
  onModerate: (action: MeetingModerationAction) => void;
  onDraftChange: (draft: string) => void;
  onSendMessage: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddEmoji: (emoji: string) => void;
}

export default function MeetingRoomSidePanel({
  panel,
  participants,
  currentParticipantId,
  isModerator,
  isHost,
  messages,
  chatEnabled,
  draft,
  onClose,
  onModerate,
  onDraftChange,
  onSendMessage,
  onFileSelect,
  onAddEmoji,
}: MeetingRoomSidePanelProps) {
  if (!panel) return null;

  const isPeoplePanel = panel === "people";

  return (
    <aside className="flex w-full max-w-sm shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="font-semibold">
          {isPeoplePanel ? `People (${participants.length})` : "In-call chat"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded p-1 hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isPeoplePanel ? (
        <div className="flex-1 divide-y divide-slate-800 overflow-y-auto">
          {participants.map((participant) => {
            const isCurrentParticipant =
              participant.participantId === currentParticipantId;
            const canModerateParticipant =
              isModerator &&
              !isCurrentParticipant &&
              participant.role !== "host";

            return (
              <div
                key={participant.participantId}
                className="flex items-center gap-2 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {participant.name}
                  {isCurrentParticipant && " (You)"}
                  <span className="ml-2 text-xs text-slate-400">
                    {participant.role}
                  </span>
                </span>
                {participant.handRaised && (
                  <Hand className="h-4 w-4 text-yellow-300" />
                )}
                {participant.micOn ? (
                  <Mic className="h-4 w-4 text-slate-300" />
                ) : (
                  <MicOff className="h-4 w-4 text-red-300" />
                )}
                {participant.camOn ? (
                  <Camera className="h-4 w-4 text-slate-300" />
                ) : (
                  <CameraOff className="h-4 w-4 text-red-300" />
                )}
                {canModerateParticipant && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        onModerate({
                          type: participant.mutedByHost ? "unmute" : "mute",
                          participantId: participant.participantId,
                        })
                      }
                      title={
                        participant.mutedByHost
                          ? "Allow participant to unmute"
                          : "Mute participant"
                      }
                      className="rounded p-1 hover:bg-slate-800"
                    >
                      {participant.mutedByHost ? (
                        <Mic className="h-4 w-4" />
                      ) : (
                        <MicOff className="h-4 w-4" />
                      )}
                    </button>
                    {isHost && participant.role !== "cohost" && (
                      <button
                        type="button"
                        onClick={() =>
                          onModerate({
                            type: "assign-cohost",
                            participantId: participant.participantId,
                          })
                        }
                        title="Assign co-host"
                        className="rounded p-1 hover:bg-slate-800"
                      >
                        <UserPlus className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onModerate({
                          type: "remove",
                          participantId: participant.participantId,
                        })
                      }
                      title="Remove participant"
                      className="rounded p-1 text-red-300 hover:bg-slate-800"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-sm text-slate-400">No messages yet.</p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="break-words">
                <p className="text-xs text-slate-400">
                  {message.name} ·{" "}
                  {new Date(message.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {message.text && <p className="text-sm">{message.text}</p>}
                {message.data && message.fileType && (
                  <a
                    href={`data:${message.fileType};base64,${message.data}`}
                    download={message.fileName}
                    className="text-sm text-sky-300 underline"
                  >
                    Download {message.fileName}
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 p-3">
            {chatEnabled ? (
              <>
                <div className="mb-2 flex gap-1">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onAddEmoji(emoji)}
                      className="rounded px-1 hover:bg-slate-800"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSendMessage();
                    }}
                    maxLength={500}
                    className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                    placeholder="Send a message"
                  />
                  <button
                    type="button"
                    onClick={onSendMessage}
                    className="rounded-md bg-blue-600 px-3 text-sm"
                  >
                    Send
                  </button>
                  <label className="grid cursor-pointer place-items-center rounded-md border border-slate-700 px-3">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                      className="sr-only"
                      onChange={onFileSelect}
                    />
                    <span className="text-sm" aria-label="Attach file">
                      📎
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">The host disabled chat.</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
