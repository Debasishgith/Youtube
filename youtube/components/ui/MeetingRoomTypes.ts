export interface MeetingCredentials {
  roomId: string;
  title: string;
  displayName: string;
  role: "host" | "cohost" | "participant";
  participantId: string;
  participantToken: string;
  iceServers: RTCIceServer[];
  maxParticipants: number;
  allowChat: boolean;
  allowParticipantScreenShare: boolean;
  locked: boolean;
}

export interface Participant {
  participantId: string;
  name: string;
  role: "host" | "cohost" | "participant";
  micOn: boolean;
  camOn: boolean;
  screenOn?: boolean;
  handRaised: boolean;
  mutedByHost?: boolean;
  speaking?: boolean;
}

export interface MeetingMessage {
  id: string;
  participantId: string;
  name: string;
  text?: string;
  fileName?: string;
  fileType?: string;
  data?: string;
  at: number;
}

export interface RemoteStream {
  id: string;
  userId: string;
  name: string;
  stream: MediaStream;
  screen: boolean;
}

export interface MeetingSettings {
  allowChat: boolean;
  allowParticipantScreenShare: boolean;
  locked: boolean;
  recording?: boolean;
  maxParticipants: number;
}

export interface RecordingSession {
  recorder: MediaRecorder;
  audioContext: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  streams: Set<MediaStream>;
  captureStream: MediaStream;
}

export interface PeerConnectionEntry {
  connection: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  remoteStream: MediaStream;
}

export type MeetingModerationAction =
  | {
      type: "mute" | "unmute" | "assign-cohost" | "remove";
      participantId: string;
    }
  | { type: "lock" | "unlock" | "end" }
  | {
      type: "permissions";
      allowChat?: boolean;
      allowParticipantScreenShare?: boolean;
    };
