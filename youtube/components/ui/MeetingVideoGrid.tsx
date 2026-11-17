"use client";

import VideoTile from "./VideoTile";
import type {
  MeetingCredentials,
  Participant,
  RemoteStream,
} from "./MeetingRoomTypes";

interface MeetingVideoGridProps {
  credentials: MeetingCredentials;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  participants: Participant[];
  remoteStreams: RemoteStream[];
  cameraOn: boolean;
  micOn: boolean;
  handRaised: boolean;
  selfSpeaking?: boolean;
  connectionState: string;
  registerVideo: (id: string, video: HTMLVideoElement | null) => void;
}

export default function MeetingVideoGrid({
  credentials,
  localStream,
  localScreenStream,
  participants,
  remoteStreams,
  cameraOn,
  micOn,
  handRaised,
  selfSpeaking,
  connectionState,
  registerVideo,
}: MeetingVideoGridProps) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <VideoTile
          id={credentials.participantId}
          name={`${credentials.displayName} (You)`}
          stream={localStream}
          muted
          cameraOn={cameraOn}
          micOn={micOn}
          handRaised={handRaised}
          speaking={selfSpeaking}
          registerVideo={registerVideo}
        />
        {localScreenStream && (
          <VideoTile
            id={`${credentials.participantId}_screen`}
            name={`${credentials.displayName} (You)`}
            stream={localScreenStream}
            muted
            screen
            registerVideo={registerVideo}
          />
        )}
        {remoteStreams.map((remote) => {
          const participant = participants.find(
            (item) => item.participantId === remote.userId,
          );
          return (
            <VideoTile
              key={remote.id}
              id={remote.id}
              name={remote.name}
              stream={remote.stream}
              screen={participant?.screenOn ?? remote.screen}
              cameraOn={
                participant?.camOn !== false ||
                participant?.screenOn === true
              }
              micOn={participant?.micOn !== false}
              handRaised={participant?.handRaised}
              speaking={participant?.speaking}
              registerVideo={registerVideo}
            />
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        Connection status: {connectionState}. Calls reconnect automatically
        when the network returns.
      </p>
    </section>
  );
}
