"use client";

import axiosInstance from "@/lib/axiosInstance";
import { Check, Copy } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import MeetingRoomControls from "./MeetingRoomControls";
import MeetingRoomJoinScreen from "./MeetingRoomJoinScreen";
import MeetingRoomSidePanel from "./MeetingRoomSidePanel";
import MeetingVideoGrid from "./MeetingVideoGrid";
import {
  ALLOWED_FILE_TYPES,
  formatDuration,
  getApiError,
  MAX_FILE_BYTES,
  SIGNAL_URL,
} from "./MeetingRoomHelpers";
import type {
  MeetingCredentials,
  MeetingMessage,
  MeetingModerationAction,
  MeetingSettings,
  Participant,
  PeerConnectionEntry,
  RecordingSession,
  RemoteStream,
} from "./MeetingRoomTypes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteToken = searchParams.get("invite") ?? "";
  const queryName = searchParams.get("name") ?? "";
  const [credentials, setCredentials] = useState<MeetingCredentials | null>(
    null,
  );
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [settings, setSettings] = useState<MeetingSettings | null>(null);
  const [panel, setPanel] = useState<"people" | "chat" | null>(null);
  const [draft, setDraft] = useState("");
  const [displayName, setDisplayName] = useState(queryName);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [connectionState, setConnectionState] = useState("Connecting");
  const [connectionQuality, setConnectionQuality] = useState("Checking");
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const panelRef = useRef<"people" | "chat" | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef(new Map<string, PeerConnectionEntry>());
  const joiningRef = useRef(false);
  const cameraOnRef = useRef(true);
  const videoElementsRef = useRef(new Map<string, HTMLVideoElement>());
  const recordingRef = useRef<RecordingSession | null>(null);
  const recordingFrameRef = useRef<number | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const active = Boolean(credentials);
  const self = useMemo(
    () =>
      participants.find(
        (participant) =>
          participant.participantId === credentials?.participantId,
      ),
    [credentials?.participantId, participants],
  );
  const moderator = self?.role === "host" || self?.role === "cohost";
  const isHost = self?.role === "host";
  const canShareScreen =
    Boolean(credentials) &&
    (self?.role !== "participant" ||
      Boolean(settings?.allowParticipantScreenShare));
  const updatePanel = (nextPanel: "people" | "chat" | null) => {
    panelRef.current = nextPanel;
    setPanel(nextPanel);
    if (nextPanel === "chat") setUnreadMessageCount(0);
  };
  const togglePanel = (nextPanel: "people" | "chat") => {
    updatePanel(panel === nextPanel ? null : nextPanel);
  };

  const registerVideo = useCallback(
    (videoId: string, video: HTMLVideoElement | null) => {
      if (video) videoElementsRef.current.set(videoId, video);
      else videoElementsRef.current.delete(videoId);
    },
    [],
  );

  const broadcastMediaState = useCallback(
    (nextMicOn: boolean, nextCameraOn: boolean, nextScreenOn: boolean) => {
      socketRef.current?.emit("meeting:media-state", {
        micOn: nextMicOn,
        camOn: nextCameraOn,
        screenOn: nextScreenOn,
      });
    },
    [],
  );

  const connectToMeeting = useCallback(
    async (name: string) => {
      if (!id || joiningRef.current) return;
      joiningRef.current = true;
      setJoining(true);
      setError("");
      try {
        const key = `meeting:${id}:participant-token`;
        const storedToken = sessionStorage.getItem(key) ?? "";
        if (!storedToken && !inviteToken) {
          throw new Error("Open a valid invite link to join this meeting.");
        }
        const response = await axiosInstance.post<MeetingCredentials>(
          `/meeting/${encodeURIComponent(id)}/join`,
          {
            inviteToken: inviteToken || undefined,
            participantToken: storedToken || undefined,
            name: name.trim().slice(0, 40) || undefined,
          },
        );
        sessionStorage.setItem(key, response.data.participantToken);
        sessionStorage.setItem(
          `meeting:${id}:display-name`,
          response.data.displayName,
        );
        setDisplayName(response.data.displayName);
        setSettings({
          allowChat: response.data.allowChat,
          allowParticipantScreenShare:
            response.data.allowParticipantScreenShare,
          locked: response.data.locked,
          maxParticipants: response.data.maxParticipants,
        });
        setCredentials(response.data);
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        joiningRef.current = false;
        setJoining(false);
      }
    },
    [id, inviteToken],
  );

  useEffect(() => {
    if (!id) return;
    let storedToken = "";
    let storedName = queryName;
    try {
      storedToken =
        sessionStorage.getItem(`meeting:${id}:participant-token`) ?? "";
      storedName =
        sessionStorage.getItem(`meeting:${id}:display-name`) ?? storedName;
    } catch (storageError) {
      console.warn("Meeting session storage is unavailable:", storageError);
    }

    if (!storedToken && !(storedName && inviteToken)) return;
    const timer = window.setTimeout(() => void connectToMeeting(storedName), 0);
    return () => window.clearTimeout(timer);
  }, [connectToMeeting, id, inviteToken, queryName]);

  useEffect(() => {
    if (!credentials) return;

    let disposed = false;
    const peerConnections = peerConnectionsRef.current;
    let socket: Socket | null = null;
    let heartbeat: number | null = null;
    let qualityTimer: number | null = null;

    const updateConnectionState = () => {
      if (!socket?.connected) {
        setConnectionState("Reconnecting");
        return;
      }
      const connections = [...peerConnectionsRef.current.values()].map(
        (entry) => entry.connection.connectionState,
      );
      if (
        connections.some(
          (state) => state === "failed" || state === "disconnected",
        )
      ) {
        setConnectionState("Reconnecting");
      } else if (connections.some((state) => state !== "connected")) {
        setConnectionState("Connecting");
      } else {
        setConnectionState("Connected");
      }
    };

    const closePeer = (participantId: string) => {
      const entry = peerConnectionsRef.current.get(participantId);
      if (!entry) return;
      entry.connection.ontrack = null;
      entry.connection.onicecandidate = null;
      entry.connection.onnegotiationneeded = null;
      entry.connection.close();
      peerConnectionsRef.current.delete(participantId);
      configureVideoSenders();
      setRemoteStreams((current) =>
        current.filter((item) => item.userId !== participantId),
      );
      updateConnectionState();
    };

    const configureVideoSenders = () => {
      const peerCount = peerConnectionsRef.current.size;
      if (!peerCount) return;
      const maxBitrate = Math.max(200_000, Math.floor(1_500_000 / peerCount));
      peerConnectionsRef.current.forEach(({ connection }) => {
        const sender = connection
          .getSenders()
          .find((item) => item.track?.kind === "video");
        if (!sender) return;
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings?.length) parameters.encodings = [{}];
          parameters.encodings[0].maxBitrate = maxBitrate;
          parameters.encodings[0].maxFramerate = 24;
          parameters.encodings[0].scaleResolutionDownBy =
            peerCount >= 4 ? 1.5 : 1;
          void sender.setParameters(parameters).catch((error: unknown) => {
            console.warn("Could not configure adaptive video bitrate:", error);
          });
        } catch (error) {
          console.warn("Could not configure adaptive video bitrate:", error);
        }
      });
    };

    const sendDescription = (
      participantId: string,
      description: RTCSessionDescription,
    ) => {
      socket?.emit("meeting:webrtc-signal", {
        to: participantId,
        description: {
          type: description.type,
          sdp: description.sdp,
        },
      });
    };

    const createPeer = (participant: Participant) => {
      if (participant.participantId === credentials.participantId) return null;
      const existing = peerConnectionsRef.current.get(
        participant.participantId,
      );
      if (existing) return existing;

      const connection = new RTCPeerConnection({
        iceServers: credentials.iceServers,
        bundlePolicy: "max-bundle",
      });
      const entry: PeerConnectionEntry = {
        connection,
        polite:
          credentials.participantId.localeCompare(participant.participantId) >
          0,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        pendingCandidates: [],
        remoteStream: new MediaStream(),
      };
      peerConnectionsRef.current.set(participant.participantId, entry);

      const local = localStreamRef.current;
      const screenTrack = localScreenStreamRef.current?.getVideoTracks()[0];
      local?.getTracks().forEach((track) => {
        const outgoingTrack =
          track.kind === "video" && screenTrack ? screenTrack : track;
        const outgoingStream =
          track.kind === "video" && screenTrack
            ? localScreenStreamRef.current
            : local;
        if (!outgoingStream) return;
        connection.addTrack(outgoingTrack, outgoingStream);
      });
      configureVideoSenders();

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit("meeting:webrtc-signal", {
            to: participant.participantId,
            candidate: event.candidate.toJSON(),
          });
        }
      };
      connection.ontrack = (event) => {
        if (
          !entry.remoteStream
            .getTracks()
            .some((track) => track.id === event.track.id)
        ) {
          entry.remoteStream.addTrack(event.track);
        }
        setRemoteStreams((current) => [
          ...current.filter(
            (remote) => remote.userId !== participant.participantId,
          ),
          {
            id: participant.participantId,
            userId: participant.participantId,
            name: participant.name,
            stream: entry.remoteStream,
            screen: false,
          },
        ]);
      };
      connection.onconnectionstatechange = updateConnectionState;
      connection.oniceconnectionstatechange = () => {
        if (connection.iceConnectionState === "failed") {
          connection.restartIce();
        }
        updateConnectionState();
      };
      connection.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await connection.setLocalDescription();
          if (!disposed && connection.localDescription) {
            sendDescription(
              participant.participantId,
              connection.localDescription,
            );
          }
        } catch (negotiationError) {
          if (!disposed) {
            console.error("WebRTC negotiation failed:", negotiationError);
            setError("Could not negotiate a peer connection.");
          }
        } finally {
          entry.makingOffer = false;
        }
      };
      updateConnectionState();
      return entry;
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "WebRTC requires a supported browser on HTTPS or localhost.",
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);

        socket = io(SIGNAL_URL, {
          auth: {
            roomId: credentials.roomId,
            participantToken: credentials.participantToken,
          },
        });
        socketRef.current = socket;
        socket.on("connect", () => {
          setConnectionState("Connected");
          startTimeRef.current ??= Date.now();
          const currentStream = localStreamRef.current;
          socket?.emit("meeting:media-state", {
            micOn: currentStream?.getAudioTracks()[0]?.enabled ?? false,
            camOn: currentStream?.getVideoTracks()[0]?.enabled ?? false,
            screenOn: Boolean(localScreenStreamRef.current),
          });
          socket?.emit("meeting:heartbeat");
          if (heartbeat === null) {
            heartbeat = window.setInterval(
              () => socket?.emit("meeting:heartbeat"),
              30_000,
            );
          }
        });
        socket.on("disconnect", () => {
          if (heartbeat !== null) {
            window.clearInterval(heartbeat);
            heartbeat = null;
          }
          if (!disposed) {
            for (const participantId of peerConnectionsRef.current.keys()) {
              const entry = peerConnectionsRef.current.get(participantId);
              entry?.connection.close();
            }
            peerConnectionsRef.current.clear();
            setRemoteStreams([]);
            setConnectionState("Reconnecting");
          }
        });
        socket.on("connect_error", (socketError) => {
          if (!disposed) {
            setConnectionState("Connection issue");
            setError(socketError.message);
          }
        });
        socket.on(
          "meeting:state",
          (state: {
            participants: Participant[];
            settings: MeetingSettings;
          }) => {
            setParticipants(state.participants);
            setSettings(state.settings);
            state.participants.forEach((participant) =>
              createPeer(participant),
            );
          },
        );
        socket.on(
          "meeting:participant-joined",
          (participant: Participant & { reconnected?: boolean }) => {
            setParticipants((current) => [
              ...current.filter(
                (item) => item.participantId !== participant.participantId,
              ),
              participant,
            ]);
            if (participant.reconnected) closePeer(participant.participantId);
            createPeer(participant);
          },
        );
        socket.on("meeting:participant-left", (participantId: string) => {
          closePeer(participantId);
          setParticipants((current) =>
            current.filter(
              (participant) => participant.participantId !== participantId,
            ),
          );
        });
        socket.on(
          "meeting:participant-state",
          (patch: Partial<Participant> & { participantId: string }) => {
            setParticipants((current) =>
              current.map((participant) =>
                participant.participantId === patch.participantId
                  ? { ...participant, ...patch }
                  : participant,
              ),
            );
          },
        );
        socket.on("meeting:settings", (nextSettings: MeetingSettings) =>
          setSettings(nextSettings),
        );
        const receiveChatMessage = (message: MeetingMessage) => {
          setMessages((current) => [...current, message]);
          if (
            message.participantId !== credentials.participantId &&
            panelRef.current !== "chat"
          ) {
            setUnreadMessageCount((count) => count + 1);
          }
        };
        socket.on("meeting:chat-message", receiveChatMessage);
        socket.on("meeting:file-message", receiveChatMessage);
        socket.on("meeting:error", (socketError: { message?: string }) => {
          if (socketError.message) setError(socketError.message);
        });
        socket.on(
          "meeting:webrtc-signal",
          async (message: {
            from: string;
            name: string;
            role: Participant["role"];
            description?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
          }) => {
            const participant: Participant = {
              participantId: message.from,
              name: message.name,
              role: message.role,
              micOn: true,
              camOn: true,
              screenOn: false,
              handRaised: false,
            };
            const entry = createPeer(participant);
            if (!entry) return;
            const connection = entry.connection;
            try {
              if (message.description) {
                const description = message.description;
                const readyForOffer =
                  !entry.makingOffer &&
                  (connection.signalingState === "stable" ||
                    entry.isSettingRemoteAnswerPending);
                const offerCollision =
                  description.type === "offer" && !readyForOffer;
                entry.ignoreOffer = !entry.polite && offerCollision;
                if (entry.ignoreOffer) return;
                if (offerCollision && entry.polite) {
                  await connection.setLocalDescription({ type: "rollback" });
                }
                entry.isSettingRemoteAnswerPending =
                  description.type === "answer";
                await connection.setRemoteDescription(description);
                entry.isSettingRemoteAnswerPending = false;

                for (const candidate of entry.pendingCandidates.splice(0)) {
                  await connection.addIceCandidate(candidate);
                }
                if (description.type === "offer") {
                  await connection.setLocalDescription();
                  if (connection.localDescription) {
                    sendDescription(message.from, connection.localDescription);
                  }
                }
              } else if (message.candidate) {
                if (entry.ignoreOffer) return;
                if (!connection.remoteDescription) {
                  entry.pendingCandidates.push(message.candidate);
                } else {
                  await connection.addIceCandidate(message.candidate);
                }
              }
            } catch (signalError) {
              if (!entry.ignoreOffer && !disposed) {
                console.error("WebRTC signaling failed:", signalError);
                setError("A peer connection could not be established.");
              }
            }
          },
        );
        socket.on("meeting:force-mute", () => {
          const stream = localStreamRef.current;
          if (!stream) return;
          stream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
          setMicOn(false);
          broadcastMediaState(
            false,
            cameraOnRef.current,
            Boolean(localScreenStreamRef.current),
          );
        });
        socket.on("meeting:removed", () => {
          setError("The host removed you from this meeting.");
          setTimeout(() => router.replace("/video-call"), 1500);
        });
        socket.on("meeting:ended", () => {
          setError("The host ended this meeting.");
          setTimeout(() => router.replace("/video-call"), 1500);
        });

        qualityTimer = window.setInterval(async () => {
          const entries = [...peerConnectionsRef.current.values()];
          if (!socket?.connected) {
            setConnectionQuality("Unavailable");
            return;
          }
          if (!entries.length) {
            setConnectionQuality("Waiting");
            return;
          }
          try {
            const reports = await Promise.all(
              entries.map((entry) => entry.connection.getStats()),
            );
            let received = 0;
            let lost = 0;
            let hasInboundStats = false;
            reports.forEach((report) => {
              report.forEach((stat) => {
                if (stat.type === "inbound-rtp" && !stat.isRemote) {
                  received += stat.packetsReceived ?? 0;
                  lost += stat.packetsLost ?? 0;
                  hasInboundStats = true;
                }
              });
            });
            if (!hasInboundStats || received + lost === 0) {
              setConnectionQuality("Checking");
            } else {
              const loss = (lost / (received + lost)) * 100;
              setConnectionQuality(
                loss >= 8 ? "Poor" : loss >= 3 ? "Fair" : "Good",
              );
            }
          } catch (statsError) {
            console.warn(
              "Could not read WebRTC connection quality:",
              statsError,
            );
          }
        }, 3000);
      } catch (startError) {
        if (!disposed) {
          console.error("Unable to start WebRTC call:", startError);
          const name =
            startError instanceof DOMException ? startError.name : "";
          setError(
            name === "NotAllowedError"
              ? "Camera or microphone permission was denied. Allow access in your browser settings and rejoin."
              : name === "NotFoundError"
                ? "No camera or microphone was found on this device."
                : getApiError(startError),
          );
          setConnectionState("Unable to connect");
        }
      }
    };

    void start();
    return () => {
      disposed = true;
      if (socket) {
        socket.disconnect();
      }
      if (heartbeat !== null) window.clearInterval(heartbeat);
      if (qualityTimer !== null) window.clearInterval(qualityTimer);
      peerConnections.forEach((entry) => entry.connection.close());
      peerConnections.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());
      const currentRecording = recordingRef.current;
      if (currentRecording && currentRecording.recorder.state !== "inactive") {
        currentRecording.recorder.stop();
      }
      localStreamRef.current = null;
      localScreenStreamRef.current = null;
      socketRef.current = null;
      startTimeRef.current = null;
      setLocalStream(null);
      setLocalScreenStream(null);
      setRemoteStreams([]);
    };
  }, [broadcastMediaState, credentials, router]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!localStream && remoteStreams.length === 0) return;
    const audioContext = new AudioContext();
    const sources: MediaStreamAudioSourceNode[] = [];
    const analyzers: {
      participantId: string;
      analyzer: AnalyserNode;
      values: Uint8Array<ArrayBuffer>;
    }[] = [];
    [
      ...(localStream
        ? [
            {
              participantId: credentials?.participantId ?? "",
              stream: localStream,
            },
          ]
        : []),
      ...remoteStreams.map((remote) => ({
        participantId: remote.userId,
        stream: remote.stream,
      })),
    ].forEach(({ participantId, stream }) => {
      const audioTrack = stream.getAudioTracks()[0];
      if (!participantId || !audioTrack || !audioTrack.enabled) return;
      const audioStream = new MediaStream([audioTrack]);
      const source = audioContext.createMediaStreamSource(audioStream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      sources.push(source);
      analyzers.push({
        participantId,
        analyzer,
        values: new Uint8Array(new ArrayBuffer(analyzer.fftSize)),
      });
    });
    let frame = 0;
    let lastUpdate = 0;
    const sampleAudio = (now: number) => {
      const activeSpeakers = new Set<string>();
      analyzers.forEach(({ participantId, analyzer, values }) => {
        analyzer.getByteTimeDomainData(values);
        const energy = values.reduce<number>((sum, value) => {
          const sample = (value - 128) / 128;
          return sum + sample * sample;
        }, 0);
        if (Math.sqrt(energy / values.length) > 0.025) {
          activeSpeakers.add(participantId);
        }
      });
      if (now - lastUpdate > 250) {
        setParticipants((current) =>
          current.map((participant) => {
            const speaking = activeSpeakers.has(participant.participantId);
            return participant.speaking === speaking
              ? participant
              : { ...participant, speaking };
          }),
        );
        lastUpdate = now;
      }
      frame = requestAnimationFrame(sampleAudio);
    };
    void audioContext.resume().catch((resumeError: unknown) => {
      console.warn(
        "Could not resume the speaking indicator audio context:",
        resumeError,
      );
    });
    frame = requestAnimationFrame(sampleAudio);
    return () => {
      cancelAnimationFrame(frame);
      sources.forEach((source) => source.disconnect());
      void audioContext.close();
    };
  }, [credentials?.participantId, localStream, remoteStreams]);

  useEffect(() => {
    const audioContext = recordingRef.current?.audioContext;
    const destination = recordingRef.current?.destination;
    if (!audioContext || !destination) return;
    remoteStreams.forEach(({ stream }) => {
      const current = recordingRef.current;
      if (!current || current.streams.has(stream)) return;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length) {
        audioContext
          .createMediaStreamSource(new MediaStream(audioTracks))
          .connect(destination);
        current.streams.add(stream);
      }
    });
  }, [remoteStreams]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    const audioTrack = stream?.getAudioTracks()[0];
    if (!audioTrack) return;
    if (self?.mutedByHost && !micOn) return;
    const next = !micOn;
    audioTrack.enabled = next;
    setMicOn(next);
    broadcastMediaState(next, cameraOn, screenSharing);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack) return;
    const next = !cameraOn;
    cameraOnRef.current = next;
    videoTrack.enabled = next;
    setCameraOn(next);
    broadcastMediaState(micOn, next, screenSharing);
  };

  const switchCamera = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    try {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "videoinput",
      );
      if (cameras.length < 2) {
        setError("No second camera is available on this device.");
        return;
      }
      const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
      const nextCamera =
        cameras.find((device) => device.deviceId !== currentId) ?? cameras[0];
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextCamera.deviceId } },
        audio: false,
      });
      const nextTrack = nextStream.getVideoTracks()[0];
      nextTrack.enabled = cameraOn;
      const currentScreenTrack =
        localScreenStreamRef.current?.getVideoTracks()[0];
      const oldTrack = stream.getVideoTracks()[0];
      const senders = [...peerConnectionsRef.current.values()]
        .map(({ connection }) =>
          connection.getSenders().find((item) => item.track?.kind === "video"),
        )
        .filter((sender): sender is RTCRtpSender => Boolean(sender));
      if (!currentScreenTrack) {
        try {
          await Promise.all(
            senders.map((sender) => sender.replaceTrack(nextTrack)),
          );
        } catch (replaceError) {
          await Promise.allSettled(
            senders.map((sender) => sender.replaceTrack(oldTrack ?? null)),
          );
          nextTrack.stop();
          throw replaceError;
        }
      }
      if (oldTrack) {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      stream.addTrack(nextTrack);
      setLocalStream(new MediaStream(stream.getTracks()));
      setError("");
    } catch (switchError) {
      setError(getApiError(switchError));
    }
  };

  const stopScreenShare = useCallback(() => {
    const stream = localScreenStreamRef.current;
    if (!stream) return;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    [...peerConnectionsRef.current.values()].forEach(({ connection }) => {
      const sender = connection
        .getSenders()
        .find((item) => item.track?.kind === "video");
      if (sender) {
        void sender.replaceTrack(cameraTrack).catch((replaceError: unknown) => {
          console.error(
            "Could not restore the camera after screen sharing:",
            replaceError,
          );
          setError("Could not restore the camera after screen sharing.");
        });
      }
    });
    stream.getTracks().forEach((track) => track.stop());
    localScreenStreamRef.current = null;
    setLocalScreenStream(null);
    setScreenSharing(false);
    const camera = localStreamRef.current;
    broadcastMediaState(
      camera?.getAudioTracks()[0]?.enabled ?? false,
      camera?.getVideoTracks()[0]?.enabled ?? false,
      false,
    );
  }, [broadcastMediaState]);

  useEffect(() => {
    if (
      !settings?.allowParticipantScreenShare &&
      credentials?.role === "participant"
    ) {
      stopScreenShare();
    }
  }, [
    credentials?.role,
    settings?.allowParticipantScreenShare,
    stopScreenShare,
  ]);

  const toggleScreenShare = async () => {
    if (screenSharing) {
      stopScreenShare();
      return;
    }
    if (!canShareScreen) {
      setError("The host has disabled participant screen sharing.");
      return;
    }
    if (!navigator.mediaDevices.getDisplayMedia) {
      setError("Screen sharing is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", stopScreenShare, { once: true });
      const videoSenders = [...peerConnectionsRef.current.values()]
        .map(({ connection }) =>
          connection
            .getSenders()
            .find((sender) => sender.track?.kind === "video"),
        )
        .filter((sender): sender is RTCRtpSender => Boolean(sender));
      try {
        await Promise.all(
          videoSenders.map((sender) => sender.replaceTrack(track)),
        );
      } catch (replaceError) {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
        await Promise.all(
          videoSenders.map((sender) => sender.replaceTrack(cameraTrack)),
        );
        stream.getTracks().forEach((item) => item.stop());
        throw replaceError;
      }
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setScreenSharing(true);
      broadcastMediaState(micOn, cameraOn, true);
      setError("");
    } catch (shareError) {
      setError(
        shareError instanceof DOMException &&
          shareError.name === "NotAllowedError"
          ? "Screen sharing permission was denied."
          : getApiError(shareError),
      );
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit("meeting:hand", next);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !settings?.allowChat) return;
    socketRef.current?.emit("meeting:chat", text);
    setDraft("");
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES || !ALLOWED_FILE_TYPES.has(file.type)) {
      setError("Share an image, PDF, or text file no larger than 2 MB.");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    socketRef.current?.emit("meeting:file", {
      name: file.name,
      type: file.type,
      data: window.btoa(binary),
    });
    setError("");
  };

  const startRecording = async () => {
    if (!isHost || !localStreamRef.current) return;
    if (!socketRef.current?.connected) {
      setError("Connect to the meeting before starting a recording.");
      return;
    }
    if (
      typeof MediaRecorder === "undefined" ||
      typeof HTMLCanvasElement.prototype.captureStream !== "function"
    ) {
      setError("Local call recording is not supported by this browser.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Recording could not be started in this browser.");
      return;
    }
    const captureStream = canvas.captureStream(24);
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const streams = new Set<MediaStream>();
    const attachAudio = (stream: MediaStream) => {
      if (streams.has(stream)) return;
      const tracks = stream.getAudioTracks();
      if (tracks.length) {
        audioContext
          .createMediaStreamSource(new MediaStream(tracks))
          .connect(destination);
      }
      streams.add(stream);
    };
    attachAudio(localStreamRef.current);
    remoteStreams.forEach(({ stream }) => attachAudio(stream));

    const draw = () => {
      context.fillStyle = "#0f172a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const videos = [...videoElementsRef.current.values()].filter(
        (video) => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      );
      const columns = Math.max(1, Math.ceil(Math.sqrt(videos.length)));
      const rows = Math.max(1, Math.ceil(videos.length / columns));
      const tileWidth = canvas.width / columns;
      const tileHeight = canvas.height / rows;
      videos.forEach((video, index) => {
        const x = (index % columns) * tileWidth;
        const y = Math.floor(index / columns) * tileHeight;
        try {
          context.drawImage(video, x, y, tileWidth, tileHeight);
        } catch {
          return;
        }
      });
      recordingFrameRef.current = requestAnimationFrame(draw);
    };
    draw();

    const output = new MediaStream([
      ...captureStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const recorder = new MediaRecorder(output, { mimeType });
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `meeting-${credentials?.roomId}-${Date.now()}.webm`;
      anchor.click();
      URL.revokeObjectURL(url);
      captureStream.getTracks().forEach((track) => track.stop());
      void audioContext.close();
      if (recordingFrameRef.current !== null) {
        cancelAnimationFrame(recordingFrameRef.current);
        recordingFrameRef.current = null;
      }
      recordingRef.current = null;
      setRecording(false);
      setSettings((current) =>
        current ? { ...current, recording: false } : current,
      );
      socketRef.current?.emit("meeting:recording", false);
    };
    recordingRef.current = {
      recorder,
      audioContext,
      destination,
      streams,
      captureStream,
    };
    recorder.start(1000);
    setRecording(true);
    setSettings((current) =>
      current ? { ...current, recording: true } : current,
    );
    socketRef.current?.emit("meeting:recording", true);
    setError("");
  };

  const stopRecording = () => {
    const current = recordingRef.current;
    if (current && current.recorder.state !== "inactive") {
      current.recorder.stop();
    }
  };

  const leaveMeeting = () => {
    if (isHost && !window.confirm("End the meeting for everyone?")) return;
    if (isHost) socketRef.current?.emit("meeting:moderate", { type: "end" });
    else socketRef.current?.emit("meeting:leave");
    stopRecording();
    router.replace("/video-call");
  };

  const copyInvite = async () => {
    if (!inviteToken || !id) return;
    const url = new URL(`/room/${id}`, window.location.origin);
    url.searchParams.set("invite", inviteToken);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the invite link. Copy it from the address bar.");
    }
  };

  const handleJoinForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void connectToMeeting(displayName);
  };

  const moderateMeeting = (action: MeetingModerationAction) => {
    socketRef.current?.emit("meeting:moderate", action);
  };

  const actionButton =
    "inline-flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

  if (!credentials) {
    return (
      <MeetingRoomJoinScreen
        displayName={displayName}
        inviteToken={inviteToken}
        joining={joining}
        error={error}
        onNameChange={setDisplayName}
        onSubmit={handleJoinForm}
        onBack={() => router.push("/video-call")}
      />
    );
  }

  const orderedParticipants: Participant[] = [
    self ?? {
      participantId: credentials.participantId,
      name: credentials.displayName,
      role: credentials.role,
      micOn,
      camOn: cameraOn,
      screenOn: screenSharing,
      handRaised,
      speaking: false,
    },
    ...participants.filter(
      (participant) => participant.participantId !== credentials.participantId,
    ),
  ];

  return (
    <main className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold">{credentials.title}</h1>
          <p className="text-xs text-slate-400">
            {credentials.roomId} · {formatDuration(duration)} ·{" "}
            {connectionState} · {connectionQuality} connection
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isHost && inviteToken && (
            <button type="button" onClick={copyInvite} className={actionButton}>
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Invite"}
            </button>
          )}
          <span className="rounded-full bg-slate-800 px-3 py-2 text-xs">
            {orderedParticipants.length}/{settings?.maxParticipants ?? 6} people
          </span>
        </div>
      </header>

      {settings?.recording && (
        <p
          role="status"
          className="bg-red-900/80 px-4 py-2 text-center text-sm"
        >
          The host is recording this meeting locally.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-950 px-3 py-2 text-sm text-red-200"
        >
          <span>{error}</span>
          {!localStream && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded border border-red-300/50 px-3 py-1 hover:bg-red-900"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <MeetingVideoGrid
          credentials={credentials}
          localStream={localStream}
          localScreenStream={localScreenStream}
          participants={participants}
          remoteStreams={remoteStreams}
          cameraOn={cameraOn}
          micOn={micOn}
          handRaised={handRaised}
          selfSpeaking={self?.speaking}
          connectionState={connectionState}
          registerVideo={registerVideo}
        />

        <MeetingRoomSidePanel
          panel={panel}
          participants={orderedParticipants}
          currentParticipantId={credentials.participantId}
          isModerator={moderator}
          isHost={isHost}
          messages={messages}
          chatEnabled={Boolean(settings?.allowChat)}
          draft={draft}
          onClose={() => updatePanel(null)}
          onModerate={moderateMeeting}
          onDraftChange={setDraft}
          onSendMessage={sendMessage}
          onFileSelect={(event) => void handleFile(event)}
          onAddEmoji={(emoji) => setDraft((current) => current + emoji)}
        />
      </div>

      <MeetingRoomControls
        isHost={isHost}
        isModerator={moderator}
        settings={settings}
        localStreamReady={Boolean(localStream)}
        micOn={micOn}
        cameraOn={cameraOn}
        mutedByHost={Boolean(self?.mutedByHost)}
        canShareScreen={canShareScreen}
        screenSharing={screenSharing}
        handRaised={handRaised}
        unreadMessageCount={unreadMessageCount}
        recording={recording}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onSwitchCamera={() => void switchCamera()}
        onToggleScreenShare={() => void toggleScreenShare()}
        onToggleHand={toggleHand}
        onTogglePanel={togglePanel}
        onModerate={moderateMeeting}
        onStartRecording={() => void startRecording()}
        onStopRecording={stopRecording}
        onLeave={leaveMeeting}
      />
    </main>
  );
}
