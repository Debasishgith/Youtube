"use client";

import {
  Captions,
  Check,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  PictureInPicture,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import axiosInstance from "@/lib/axiosInstance";
import { useUser } from "@/lib/authContext";

interface SubtitleTrack {
  src: string;
  label?: string;
  srclang?: string;
  language?: string;
  kind?: "captions" | "subtitles";
  default?: boolean;
}

interface PlayerVideo {
  _id: string;
  filepath?: string;
  videotitle?: string;
  captionTracks?: SubtitleTrack[];
  subtitles?: SubtitleTrack[] | string;
  captions?: SubtitleTrack[] | string;
}

interface WatchProgress {
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number;
}

interface VideoPlayerProps {
  video: PlayerVideo | PlayerVideo[];
  nextVideo?: PlayerVideo | null;
  onNextVideo?: () => void;
  theaterMode?: boolean;
  onToggleTheater?: () => void;
  completionThreshold?: number;
}

interface WatchProgressResponse {
  progress: {
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
    updatedAt?: string;
  } | null;
}

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];
const DEFAULT_COMPLETION_THRESHOLD = 0.9;
const PROGRESS_SAVE_INTERVAL_MS = 10_000;
const AUTOPLAY_COUNTDOWN_SECONDS = 10;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${formattedSeconds}`
    : `${minutes}:${formattedSeconds}`;
};

const readStoredProgress = (key: string): WatchProgress | null => {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const progress = JSON.parse(stored) as Partial<WatchProgress>;
    if (
      !Number.isFinite(progress.positionSeconds) ||
      !Number.isFinite(progress.durationSeconds) ||
      typeof progress.completed !== "boolean" ||
      !Number.isFinite(progress.updatedAt)
    ) {
      return null;
    }

    return {
      positionSeconds: Math.max(0, progress.positionSeconds as number),
      durationSeconds: Math.max(0, progress.durationSeconds as number),
      completed: progress.completed,
      updatedAt: progress.updatedAt as number,
    };
  } catch (error) {
    console.warn("Unable to read saved video progress:", error);
    return null;
  }
};

const VideoPlayer = ({
  video,
  nextVideo = null,
  onNextVideo,
  theaterMode = false,
  onToggleTheater,
  completionThreshold = DEFAULT_COMPLETION_THRESHOLD,
}: VideoPlayerProps) => {
  const { user } = useUser();
  const videoData = Array.isArray(video) ? video[0] : video;
  const videoId = videoData?._id;
  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, "") ??
    "http://localhost:8001";
  const videoUrl = videoData?.filepath
    ? `${backendBase}/${videoData.filepath.replace(/^\/+/, "")}`
    : "/video/vdo.mp4";
  const captionTracks = useMemo<SubtitleTrack[]>(() => {
    const rawTracks =
      videoData?.captionTracks ?? videoData?.captions ?? videoData?.subtitles;
    if (typeof rawTracks === "string") {
      return [{ src: rawTracks, label: "English", srclang: "en" }];
    }
    return Array.isArray(rawTracks) ? rawTracks : [];
  }, [videoData?.captionTracks, videoData?.captions, videoData?.subtitles]);
  const progressKey = `watch-progress:${user?._id ?? "guest"}:${videoId}`;
  const completionRatio =
    Number.isFinite(completionThreshold) &&
    completionThreshold > 0 &&
    completionThreshold <= 1
      ? completionThreshold
      : DEFAULT_COMPLETION_THRESHOLD;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previousVolumeRef = useRef(1);
  const controlsTimerRef = useRef<number | null>(null);
  const lastProgressSaveRef = useRef(0);
  const progressLoadedRef = useRef(false);
  const metadataReadyRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const resumePositionRef = useRef(0);
  const completedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingProgressRef = useRef<WatchProgress | null>(null);
  const autoplayRequestedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [quality, setQuality] = useState("");
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [resumeNotice, setResumeNotice] = useState("");
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    x: number;
    time: number;
  } | null>(null);
  const progressPercent =
    duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const remainingTime = Math.max(duration - currentTime, 0);

  const subtitleUrls = useMemo(
    () =>
      captionTracks.map((track) => ({
        ...track,
        src: /^https?:\/\//i.test(track.src)
          ? track.src
          : `${backendBase}/${track.src.replace(/^\/+/, "")}`,
      })),
    [backendBase, captionTracks],
  );

  const sendProgress = useCallback(
    async (progress: WatchProgress) => {
      try {
        window.localStorage.setItem(progressKey, JSON.stringify(progress));
      } catch (error) {
        console.warn("Unable to store video progress locally:", error);
      }

      pendingProgressRef.current = progress;
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;

      try {
        while (pendingProgressRef.current) {
          const nextProgress = pendingProgressRef.current;
          pendingProgressRef.current = null;
          const firebaseUser = auth.currentUser;
          if (!firebaseUser || !videoId) continue;

          try {
            const token = await firebaseUser.getIdToken();
            await axiosInstance.put(
              `/history/progress/${videoId}`,
              {
                positionSeconds: nextProgress.positionSeconds,
                durationSeconds: nextProgress.durationSeconds,
                completed: nextProgress.completed,
              },
              { headers: { Authorization: `Bearer ${token}` } },
            );
          } catch (error) {
            console.error(
              "Unable to save video progress to your account:",
              error,
            );
          }
        }
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [progressKey, videoId],
  );

  const saveCurrentProgress = useCallback(
    (completed = completedRef.current) => {
      const media = videoRef.current;
      if (!media || !Number.isFinite(media.duration) || media.duration <= 0) {
        return;
      }

      const progress: WatchProgress = {
        positionSeconds: Math.min(media.currentTime, media.duration),
        durationSeconds: media.duration,
        completed,
        updatedAt: Date.now(),
      };
      lastProgressSaveRef.current = Date.now();
      void sendProgress(progress);
    },
    [sendProgress],
  );

  const applyInitialPlaybackState = useCallback(() => {
    if (
      !metadataReadyRef.current ||
      !progressLoadedRef.current ||
      resumeAppliedRef.current
    ) {
      return;
    }

    const media = videoRef.current;
    if (!media) return;
    resumeAppliedRef.current = true;

    const resumeAt = resumePositionRef.current;
    if (resumeAt >= 5 && resumeAt < media.duration - 5) {
      media.currentTime = resumeAt;
      setCurrentTime(resumeAt);
      setResumeNotice(`Resuming from ${formatTime(resumeAt)}`);
      window.setTimeout(() => setResumeNotice(""), 4000);
    }

    if (autoplayRequestedRef.current) {
      autoplayRequestedRef.current = false;
      void media.play().catch((error: unknown) => {
        console.warn("The browser blocked autoplay for the next video:", error);
        setResumeNotice("Autoplay was blocked. Press play to continue.");
        window.setTimeout(() => setResumeNotice(""), 5000);
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    progressLoadedRef.current = false;
    metadataReadyRef.current = false;
    resumeAppliedRef.current = false;
    resumePositionRef.current = 0;
    completedRef.current = false;
    autoplayRequestedRef.current = false;
    try {
      autoplayRequestedRef.current =
        window.sessionStorage.getItem("youtube-autoplay-next") === videoId;
      if (autoplayRequestedRef.current) {
        window.sessionStorage.removeItem("youtube-autoplay-next");
      }
    } catch (error) {
      console.warn("Unable to read next-video autoplay state:", error);
    }

    const loadProgress = async () => {
      let savedProgress = readStoredProgress(progressKey);
      const firebaseUser = auth.currentUser;

      if (firebaseUser && videoId) {
        try {
          const token = await firebaseUser.getIdToken();
          const response = await axiosInstance.get<WatchProgressResponse>(
            `/history/progress/${videoId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const remoteProgress = response.data.progress;
          if (remoteProgress) {
            const remoteUpdatedAt = remoteProgress.updatedAt
              ? new Date(remoteProgress.updatedAt).getTime()
              : 0;
            const normalizedRemote: WatchProgress = {
              positionSeconds: remoteProgress.positionSeconds,
              durationSeconds: remoteProgress.durationSeconds,
              completed: remoteProgress.completed,
              updatedAt: Number.isFinite(remoteUpdatedAt)
                ? remoteUpdatedAt
                : Date.now(),
            };
            if (
              !savedProgress ||
              normalizedRemote.updatedAt >= savedProgress.updatedAt
            ) {
              savedProgress = normalizedRemote;
            }
          }
        } catch (error) {
          console.error("Unable to load saved video progress:", error);
        }
      }

      if (cancelled) return;
      if (savedProgress) {
        resumePositionRef.current = savedProgress.positionSeconds;
        completedRef.current = savedProgress.completed;
        setIsCompleted(savedProgress.completed);
        try {
          window.localStorage.setItem(
            progressKey,
            JSON.stringify(savedProgress),
          );
        } catch (error) {
          console.warn("Unable to update local video progress:", error);
        }
      }
      progressLoadedRef.current = true;
      applyInitialPlaybackState();
    };

    void loadProgress();
    return () => {
      cancelled = true;
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [applyInitialPlaybackState, progressKey, videoId]);

  useEffect(() => {
    const handlePlay = (event: Event) => {
      const playingVideo = event.target;
      if (!(playingVideo instanceof HTMLVideoElement)) return;
      document.querySelectorAll("video").forEach((otherVideo) => {
        if (otherVideo !== playingVideo && !otherVideo.paused) {
          otherVideo.pause();
        }
      });
    };

    document.addEventListener("play", handlePlay, true);
    return () => document.removeEventListener("play", handlePlay, true);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    const handlePictureInPictureChange = () => {
      setIsPictureInPicture(
        document.pictureInPictureElement === videoRef.current,
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener(
      "enterpictureinpicture",
      handlePictureInPictureChange,
      true,
    );
    document.addEventListener(
      "leavepictureinpicture",
      handlePictureInPictureChange,
      true,
    );
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "enterpictureinpicture",
        handlePictureInPictureChange,
        true,
      );
      document.removeEventListener(
        "leavepictureinpicture",
        handlePictureInPictureChange,
        true,
      );
    };
  }, []);

  useEffect(() => {
    if (autoplayCountdown === null) return;
    if (autoplayCountdown <= 0) {
      onNextVideo?.();
      return;
    }

    const timer = window.setTimeout(
      () => setAutoplayCountdown((current) => (current ?? 1) - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [autoplayCountdown, onNextVideo]);

  useEffect(() => {
    if (isPlaying) {
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2500,
      );
    } else {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    }

    return () => {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [isPlaying]);

  useEffect(
    () => () => {
      saveCurrentProgress();
    },
    [saveCurrentProgress],
  );

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
    }
    if (isPlaying) {
      controlsTimerRef.current = window.setTimeout(
        () => setControlsVisible(false),
        2500,
      );
    }
  }, [isPlaying]);

  const togglePlayback = () => {
    const media = videoRef.current;
    if (!media) return;
    if (media.paused) {
      void media.play().catch((error: unknown) => {
        console.error("Unable to play video:", error);
        setResumeNotice("Playback could not start. Press play to retry.");
        window.setTimeout(() => setResumeNotice(""), 5000);
      });
    } else {
      media.pause();
    }
  };

  const updatePlaybackRate = useCallback((rate: number) => {
    const media = videoRef.current;
    if (!media) return;
    media.playbackRate = rate;
    setPlaybackRate(rate);
    setSettingsOpen(false);
  }, []);

  const toggleVolume = useCallback(() => {
    const media = videoRef.current;
    if (!media) return;
    if (media.muted || media.volume === 0) {
      media.volume = previousVolumeRef.current || 0.5;
      media.muted = false;
    } else {
      previousVolumeRef.current = media.volume;
      media.muted = true;
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    const media = videoRef.current;
    if (!media) return;
    const nextEnabled = !captionsEnabled;
    const textTracks = Array.from(media.textTracks);
    const activeIndex = textTracks.findIndex(
      (track) => track.mode === "showing",
    );
    const chosenIndex =
      activeIndex >= 0
        ? activeIndex
        : Math.max(
            0,
            subtitleUrls.findIndex((track) => track.default),
          );
    textTracks.forEach((track, index) => {
      track.mode =
        nextEnabled && index === chosenIndex ? "showing" : "disabled";
    });
    setCaptionsEnabled(nextEnabled);
  }, [captionsEnabled, subtitleUrls]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error("Unable to change fullscreen mode:", error);
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const media = videoRef.current;
    if (!media) return;
    if (!document.pictureInPictureEnabled) {
      setResumeNotice("Picture-in-Picture is not available in this browser.");
      window.setTimeout(() => setResumeNotice(""), 4000);
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await media.requestPictureInPicture();
      }
    } catch (error) {
      console.error("Unable to change Picture-in-Picture mode:", error);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, select, textarea, [contenteditable='true'], [role='menu']",
        )
      ) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      const playerFocused =
        containerRef.current?.contains(document.activeElement) ?? false;
      const pageUnfocused =
        document.activeElement === document.body ||
        document.activeElement === document.documentElement;
      if (
        (key === "f" || key === "t") &&
        (playerFocused || pageUnfocused) &&
        !event.repeat
      ) {
        event.preventDefault();
        if (key === "f") {
          void toggleFullscreen();
        } else {
          onToggleTheater?.();
        }
        setControlsVisible(true);
        return;
      }

      if (!playerFocused) return;
      if (
        (event.key === " " || event.key === "Enter") &&
        target?.closest("button")
      ) {
        return;
      }

      const media = videoRef.current;
      if (!media) return;
      const seekInterval = event.shiftKey ? 30 : 10;

      if (key === " " || key === "k") {
        event.preventDefault();
        if (media.paused) {
          void media.play().catch((error: unknown) => {
            console.error("Unable to play video:", error);
            setResumeNotice("Playback could not start. Press play to retry.");
            window.setTimeout(() => setResumeNotice(""), 5000);
          });
        } else {
          media.pause();
        }
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        media.currentTime = Math.max(
          0,
          Math.min(
            media.duration,
            media.currentTime + direction * seekInterval,
          ),
        );
        setCurrentTime(media.currentTime);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        media.volume = Math.min(
          1,
          Math.max(0, media.volume + direction * (event.shiftKey ? 0.1 : 0.05)),
        );
        media.muted = direction < 0 && media.volume === 0;
      } else if (key === "m") {
        toggleVolume();
      } else if (key === "p") {
        void togglePictureInPicture();
      } else if (key === "c" && captionsAvailable) {
        toggleCaptions();
      } else if (
        (event.key === ">" || event.key === ".") &&
        media.playbackRate < 2
      ) {
        const index = PLAYBACK_RATES.indexOf(media.playbackRate);
        updatePlaybackRate(
          PLAYBACK_RATES[Math.min(index + 1, PLAYBACK_RATES.length - 1)],
        );
      } else if (
        (event.key === "<" || event.key === ",") &&
        media.playbackRate > 0.5
      ) {
        const index = PLAYBACK_RATES.indexOf(media.playbackRate);
        updatePlaybackRate(PLAYBACK_RATES[Math.max(index - 1, 0)]);
      } else if (key === "n" && nextVideo && onNextVideo) {
        onNextVideo();
      }

      setControlsVisible(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    captionsAvailable,
    nextVideo,
    onNextVideo,
    onToggleTheater,
    toggleCaptions,
    toggleFullscreen,
    togglePictureInPicture,
    toggleVolume,
    updatePlaybackRate,
  ]);

  const seekBy = (seconds: number) => {
    const media = videoRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.max(
      0,
      Math.min(media.duration, media.currentTime + seconds),
    );
    setCurrentTime(media.currentTime);
  };

  const updateBufferedProgress = (media: HTMLVideoElement) => {
    if (!Number.isFinite(media.duration) || media.duration <= 0) return;
    let bufferedEnd = 0;
    for (let index = 0; index < media.buffered.length; index += 1) {
      bufferedEnd = Math.max(bufferedEnd, media.buffered.end(index));
    }
    setBufferedPercent(Math.min((bufferedEnd / media.duration) * 100, 100));
  };

  const handleTimeUpdate = () => {
    const media = videoRef.current;
    if (!media) return;
    setCurrentTime(media.currentTime);
    updateBufferedProgress(media);

    if (
      !completedRef.current &&
      media.duration > 0 &&
      media.currentTime / media.duration >= completionRatio
    ) {
      completedRef.current = true;
      setIsCompleted(true);
      saveCurrentProgress(true);
      return;
    }

    if (Date.now() - lastProgressSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS) {
      saveCurrentProgress();
    }
  };

  const handleLoadedMetadata = () => {
    const media = videoRef.current;
    if (!media) return;
    metadataReadyRef.current = true;
    setDuration(media.duration);
    setQuality(
      media.videoHeight > 0
        ? `${media.videoHeight}p`
        : media.videoWidth > 0
          ? `${media.videoWidth} × ${media.videoHeight}`
          : "Auto",
    );
    setCaptionsAvailable(
      media.textTracks.length > 0 || subtitleUrls.length > 0,
    );
    setCaptionsEnabled(
      Array.from(media.textTracks).some((track) => track.mode === "showing"),
    );
    updateBufferedProgress(media);
    applyInitialPlaybackState();
  };

  const handleVolumeChange = () => {
    const media = videoRef.current;
    if (!media) return;
    if (!media.muted && media.volume > 0) {
      previousVolumeRef.current = media.volume;
    }
    setVolume(media.volume);
    setIsMuted(media.muted);
  };

  const handleSeekPreview = (event: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const percentage = Math.max(
      0,
      Math.min((event.clientX - rect.left) / rect.width, 1),
    );
    const time = percentage * duration;
    setPreview({ x: percentage * 100, time });

    const previewVideo = previewVideoRef.current;
    if (
      previewVideo &&
      Number.isFinite(previewVideo.duration) &&
      Math.abs(previewVideo.currentTime - time) > 0.5
    ) {
      previewVideo.currentTime = time;
    }
  };

  const seekTo = (value: string) => {
    const media = videoRef.current;
    if (!media) return;
    const time = Number(value);
    if (!Number.isFinite(time)) return;
    media.currentTime = Math.min(Math.max(time, 0), media.duration);
    setCurrentTime(media.currentTime);
  };

  const handleEnded = () => {
    const media = videoRef.current;
    if (media) {
      completedRef.current = true;
      setIsCompleted(true);
      saveCurrentProgress(true);
    }
    if (nextVideo && onNextVideo) {
      setAutoplayCountdown(AUTOPLAY_COUNTDOWN_SECONDS);
    }
  };

  const cancelAutoplay = () => setAutoplayCountdown(null);

  const handlePlayerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target === videoRef.current ||
      event.target === containerRef.current
    ) {
      containerRef.current?.focus({ preventScroll: true });
    }
    showControls();
  };

  const seekInputBackground = useMemo(
    () =>
      `linear-gradient(to right, #ef4444 ${progressPercent}%, transparent ${progressPercent}%), linear-gradient(to right, rgba(255,255,255,.38) ${bufferedPercent}%, rgba(255,255,255,.18) ${bufferedPercent}%)`,
    [bufferedPercent, progressPercent],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label={`${videoData?.videotitle ?? "Video"} player`}
      className={`group/video relative w-full overflow-hidden rounded-xl bg-black text-white shadow-xl outline-none ${
        theaterMode
          ? "h-[60vh] aspect-auto ring-1 ring-white/10"
          : "aspect-video"
      }`}
      onPointerMove={showControls}
      onPointerLeave={() => {
        if (controlsTimerRef.current !== null) {
          window.clearTimeout(controlsTimerRef.current);
        }
        if (isPlaying) {
          controlsTimerRef.current = window.setTimeout(
            () => setControlsVisible(false),
            900,
          );
        }
        setPreview(null);
      }}
      onFocusCapture={showControls}
      onBlurCapture={() => {
        if (isPlaying) {
          controlsTimerRef.current = window.setTimeout(
            () => setControlsVisible(false),
            2500,
          );
        }
      }}
      onClick={handlePlayerClick}
      onDoubleClick={(event) => {
        if (
          event.target === videoRef.current ||
          event.target === containerRef.current
        ) {
          void toggleFullscreen();
        }
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        playsInline
        className="absolute inset-0 h-full w-full object-contain"
        onLoadStart={() => {
          setIsLoading(true);
          setHasError(false);
        }}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
          setHasError(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          setControlsVisible(true);
          saveCurrentProgress();
        }}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={(event) => updateBufferedProgress(event.currentTarget)}
        onVolumeChange={handleVolumeChange}
        onEnded={handleEnded}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      >
        {subtitleUrls.map((track, index) => (
          <track
            key={`${track.src}-${index}`}
            kind={track.kind ?? "subtitles"}
            src={track.src}
            srcLang={track.srclang ?? track.language ?? "en"}
            label={track.label ?? `Subtitles ${index + 1}`}
            default={track.default}
            onLoad={() => {
              const media = videoRef.current;
              setCaptionsAvailable(true);
              if (media) {
                setCaptionsEnabled(
                  Array.from(media.textTracks).some(
                    (textTrack) => textTrack.mode === "showing",
                  ),
                );
              }
            }}
          />
        ))}
      </video>

      {isLoading && !hasError && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-label="Video is loading"
        >
          <Loader2 className="h-10 w-10 animate-spin text-white" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-4 text-center">
          <p className="text-sm font-medium">This video couldn't be loaded.</p>
          <button
            type="button"
            className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"
            onClick={() => {
              setHasError(false);
              setIsLoading(true);
              videoRef.current?.load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!isPlaying && !hasError && !isLoading && (
        <button
          type="button"
          aria-label="Play video"
          title="Play (Space)"
          onClick={togglePlayback}
          className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition hover:scale-105 hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-white"
        >
          <Play className="ml-1 h-8 w-8 fill-current" />
        </button>
      )}

      {resumeNotice && (
        <div className="absolute left-4 top-4 rounded-lg bg-black/75 px-3 py-2 text-sm shadow-lg">
          {resumeNotice}
        </div>
      )}

      {isCompleted && (
        <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold shadow-lg">
          <Check className="h-3.5 w-3.5" />
          Completed
        </div>
      )}

      {autoplayCountdown !== null && nextVideo && (
        <div className="absolute bottom-20 right-4 z-20 w-64 rounded-xl border border-white/15 bg-black/85 p-4 shadow-xl">
          <button
            type="button"
            aria-label="Cancel autoplay"
            title="Cancel autoplay"
            onClick={cancelAutoplay}
            className="absolute right-2 top-2 rounded p-1 text-white/70 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-xs text-white/70">
            Up next in {autoplayCountdown}s
          </p>
          <p className="mt-1 line-clamp-2 pr-4 text-sm font-semibold">
            {nextVideo.videotitle ?? "Next video"}
          </p>
          <button
            type="button"
            onClick={onNextVideo}
            className="mt-3 w-full rounded-md bg-red-600 px-3 py-2 text-sm font-semibold hover:bg-red-500"
          >
            Play next
          </button>
          <button
            type="button"
            onClick={cancelAutoplay}
            className="mt-2 w-full rounded-md bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        aria-hidden="true"
        className={`pointer-events-none absolute z-20 overflow-hidden rounded-md border border-white/30 bg-black shadow-xl ${
          preview && duration > 0 ? "" : "h-px w-px opacity-0"
        }`}
        style={
          preview && duration > 0
            ? {
                left: `${preview.x}%`,
                bottom: "4.5rem",
                transform: "translateX(-50%)",
              }
            : { left: 0, bottom: 0 }
        }
      >
        <div
          className={`relative bg-black ${
            preview && duration > 0 ? "h-24 w-40" : "h-px w-px"
          }`}
        >
          <video
            ref={previewVideoRef}
            src={videoUrl}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-contain"
            tabIndex={-1}
          />
        </div>
        {preview && duration > 0 && (
          <div className="bg-black/90 px-2 py-1 text-center text-xs">
            {formatTime(preview.time)}
          </div>
        )}
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/95 via-black/55 to-transparent px-3 pb-3 pt-12 transition-opacity duration-200 sm:px-4 ${
          controlsVisible || !isPlaying
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="group/timeline relative mb-2 flex h-4 cursor-pointer items-center"
          onMouseMove={handleSeekPreview}
          onMouseLeave={() => setPreview(null)}
        >
          <div className="absolute inset-x-0 h-1 rounded-full bg-white/20" />
          <div
            className="absolute left-0 h-1 rounded-full bg-white/40"
            style={{ width: `${bufferedPercent}%` }}
          />
          <div
            className="absolute left-0 h-1 rounded-full bg-red-500"
            style={{ width: `${progressPercent}%` }}
          />
          <input
            aria-label="Seek video"
            title="Seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seekTo(event.target.value)}
            className="absolute inset-x-0 h-4 w-full cursor-pointer appearance-none bg-transparent accent-red-500 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
            style={{ background: seekInputBackground }}
            disabled={!duration}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              aria-label={isPlaying ? "Pause video" : "Play video"}
              aria-keyshortcuts="Space"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              onClick={togglePlayback}
              className="rounded p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="Seek backward 10 seconds"
              title="Back 10 seconds (←)"
              onClick={() => seekBy(-10)}
              className="hidden rounded p-1.5 hover:bg-white/15 sm:inline-flex"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Seek forward 10 seconds"
              title="Forward 10 seconds (→)"
              onClick={() => seekBy(10)}
              className="hidden rounded p-1.5 hover:bg-white/15 sm:inline-flex"
            >
              <SkipForward className="h-5 w-5" />
            </button>
            <div className="group/volume flex items-center">
              <button
                type="button"
                aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                aria-keyshortcuts="M"
                title="Mute or unmute (M)"
                onClick={toggleVolume}
                className="rounded p-1.5 hover:bg-white/15"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <input
                aria-label="Volume"
                title="Volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(event) => {
                  const media = videoRef.current;
                  if (!media) return;
                  media.volume = Number(event.target.value);
                  media.muted = media.volume === 0;
                }}
                className="w-12 cursor-pointer accent-white sm:w-16"
              />
            </div>
            <span className="whitespace-nowrap text-xs tabular-nums sm:text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
              <span className="hidden text-white/65 sm:inline">
                {" "}
                (−{formatTime(remainingTime)})
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {quality && (
              <span
                className="hidden rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold sm:inline"
                title="Current video resolution"
              >
                {quality}
              </span>
            )}
            {captionsAvailable && (
              <button
                type="button"
                aria-label={
                  captionsEnabled ? "Turn captions off" : "Turn captions on"
                }
                aria-pressed={captionsEnabled}
                aria-keyshortcuts="C"
                title="Toggle captions (C)"
                onClick={toggleCaptions}
                className={`rounded p-1.5 hover:bg-white/15 ${
                  captionsEnabled ? "text-red-400" : ""
                }`}
              >
                <Captions className="h-5 w-5" />
              </button>
            )}
            {nextVideo && onNextVideo && (
              <button
                type="button"
                aria-label="Play next video"
                aria-keyshortcuts="N"
                title="Next video (N)"
                onClick={onNextVideo}
                className="rounded p-1.5 hover:bg-white/15"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              aria-label="Playback settings"
              aria-expanded={settingsOpen}
              title="Playback speed"
              onClick={() => setSettingsOpen((open) => !open)}
              className="rounded p-1.5 hover:bg-white/15"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={
                theaterMode ? "Exit theater mode" : "Enter theater mode"
              }
              aria-keyshortcuts="T"
              title="Toggle theater mode (T)"
              onClick={onToggleTheater}
              className="hidden rounded p-1.5 hover:bg-white/15 sm:inline-flex"
            >
              <Monitor className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={
                isPictureInPicture
                  ? "Exit Picture-in-Picture"
                  : "Enter Picture-in-Picture"
              }
              aria-keyshortcuts="P"
              title="Picture-in-Picture (P)"
              onClick={() => void togglePictureInPicture()}
              className="hidden rounded p-1.5 hover:bg-white/15 sm:inline-flex"
            >
              <PictureInPicture className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-keyshortcuts="F"
              title="Toggle fullscreen (F)"
              onClick={() => void toggleFullscreen()}
              className="rounded p-1.5 hover:bg-white/15"
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div
            role="menu"
            aria-label="Playback speed"
            className="absolute bottom-16 right-3 z-30 min-w-36 rounded-lg border border-white/10 bg-zinc-950/95 p-2 shadow-xl"
          >
            <p className="px-2 pb-1 text-xs font-semibold text-white/60">
              Playback speed
            </p>
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                role="menuitemradio"
                aria-checked={playbackRate === rate}
                onClick={() => updatePlaybackRate(rate)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-white/10"
              >
                {rate}×{playbackRate === rate && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
