"use client";

import {
  Camera,
  CameraOff,
  Circle,
  Hand,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RotateCcw,
  Shield,
  StopCircle,
  Unlock,
  Users,
} from "lucide-react";
import type {
  MeetingModerationAction,
  MeetingSettings,
} from "./MeetingRoomTypes";

const buttonStyle =
  "inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

interface MeetingRoomControlsProps {
  isHost: boolean;
  isModerator: boolean;
  settings: MeetingSettings | null;
  localStreamReady: boolean;
  micOn: boolean;
  cameraOn: boolean;
  mutedByHost: boolean;
  canShareScreen: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  unreadMessageCount: number;
  recording: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onTogglePanel: (panel: "people" | "chat") => void;
  onModerate: (action: MeetingModerationAction) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onLeave: () => void;
}

export default function MeetingRoomControls({
  isHost,
  isModerator,
  settings,
  localStreamReady,
  micOn,
  cameraOn,
  mutedByHost,
  canShareScreen,
  screenSharing,
  handRaised,
  unreadMessageCount,
  recording,
  onToggleMic,
  onToggleCamera,
  onSwitchCamera,
  onToggleScreenShare,
  onToggleHand,
  onTogglePanel,
  onModerate,
  onStartRecording,
  onStopRecording,
  onLeave,
}: MeetingRoomControlsProps) {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-800 bg-slate-950 px-3 py-3">
      <button
        type="button"
        onClick={onToggleMic}
        className={buttonStyle}
        disabled={!localStreamReady || mutedByHost}
      >
        {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        {micOn ? "Mute" : "Unmute"}
      </button>
      <button
        type="button"
        onClick={onToggleCamera}
        className={buttonStyle}
        disabled={!localStreamReady}
      >
        {cameraOn ? (
          <Camera className="h-4 w-4" />
        ) : (
          <CameraOff className="h-4 w-4" />
        )}
        {cameraOn ? "Camera off" : "Camera on"}
      </button>
      <button
        type="button"
        onClick={onSwitchCamera}
        className={buttonStyle}
        disabled={!localStreamReady}
        title="Switch camera"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="hidden sm:inline">Switch camera</span>
      </button>
      <button
        type="button"
        onClick={onToggleScreenShare}
        className={buttonStyle}
        disabled={!canShareScreen}
      >
        <MonitorUp className="h-4 w-4" />
        {screenSharing ? "Stop sharing" : "Share screen"}
      </button>
      <button type="button" onClick={onToggleHand} className={buttonStyle}>
        <Hand className="h-4 w-4" />
        {handRaised ? "Lower hand" : "Raise hand"}
      </button>
      <button
        type="button"
        onClick={() => onTogglePanel("people")}
        className={buttonStyle}
      >
        <Users className="h-4 w-4" />
        People
      </button>
      <button
        type="button"
        onClick={() => onTogglePanel("chat")}
        className={`${buttonStyle} relative`}
        aria-label={
          unreadMessageCount > 0
            ? `Chat, ${unreadMessageCount} unread messages`
            : "Chat"
        }
      >
        <MessageCircle className="h-4 w-4" />
        Chat
        {unreadMessageCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
          >
            {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
          </span>
        )}
      </button>
      {isModerator && (
        <>
          <button
            type="button"
            onClick={() =>
              onModerate({ type: settings?.locked ? "unlock" : "lock" })
            }
            className={buttonStyle}
          >
            {settings?.locked ? (
              <Unlock className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {settings?.locked ? "Unlock" : "Lock"}
          </button>
          {isHost && (
            <>
              <button
                type="button"
                onClick={() =>
                  onModerate({
                    type: "permissions",
                    allowChat: !settings?.allowChat,
                  })
                }
                className={buttonStyle}
                title="Toggle chat permission"
              >
                <Shield className="h-4 w-4" />
                {settings?.allowChat ? "Disable chat" : "Enable chat"}
              </button>
              <button
                type="button"
                onClick={() =>
                  onModerate({
                    type: "permissions",
                    allowParticipantScreenShare:
                      !settings?.allowParticipantScreenShare,
                  })
                }
                className={buttonStyle}
                title="Toggle participant screen-sharing permission"
              >
                <MonitorUp className="h-4 w-4" />
                {settings?.allowParticipantScreenShare
                  ? "Disable participant sharing"
                  : "Allow participant sharing"}
              </button>
            </>
          )}
        </>
      )}
      {isHost && (
        <button
          type="button"
          onClick={recording ? onStopRecording : onStartRecording}
          className={`${buttonStyle} ${recording ? "bg-red-700 hover:bg-red-600" : ""}`}
        >
          {recording ? (
            <StopCircle className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          {recording ? "Stop recording" : "Record locally"}
        </button>
      )}
      <button
        type="button"
        onClick={onLeave}
        className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500"
      >
        <PhoneOff className="h-4 w-4" />
        {isHost ? "End for everyone" : "Leave"}
      </button>
    </footer>
  );
}
