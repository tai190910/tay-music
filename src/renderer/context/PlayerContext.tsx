// src/renderer/context/PlayerContext.tsx

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { Song, LyricsData, RepeatMode, StreamInfo } from "../types.ts";
import { extractDominantColor, DEFAULT_COLOR, type ExtractedColor } from "../utils/colorExtractor.ts";

interface PlayerContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Song[];
  queueIndex: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  isLiked: boolean;
  isLoadingStream: boolean;
  lyricsData: LyricsData | null;
  activeLyricsIndex: number;
  isLyricsOpen: boolean;
  isQueueOpen: boolean;
  error: string | null;
  accentColor: ExtractedColor;
  streamInfo: StreamInfo | null;

  playSong: (song: Song, newQueue?: Song[]) => Promise<void>;
  togglePlay: () => void;
  nextSong: () => void;
  prevSong: () => void;
  seek: (timeSec: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  toggleLikeCurrent: () => Promise<void>;
  setIsLyricsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setIsQueueOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  addToQueue: (song: Song) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [activeLyricsIndex, setActiveLyricsIndex] = useState<number>(-1);
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<ExtractedColor>(DEFAULT_COLOR);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>({
    bitrate: 160,
    codec: "OPUS",
    client: "VISIONOS",
    badgeText: "OPUS 160KBPS",
  });

  // Dynamic dominant color extraction from current song thumbnail
  useEffect(() => {
    if (currentSong?.thumbnail) {
      extractDominantColor(currentSong.thumbnail).then((color) => {
        setAccentColor(color);
        document.documentElement.style.setProperty("--dynamic-accent", color.hex);
        document.documentElement.style.setProperty("--dynamic-accent-rgb", color.rgbString);
        document.documentElement.style.setProperty("--dynamic-glow", `rgba(${color.rgbString}, 0.35)`);
        document.documentElement.style.setProperty("--dynamic-bg", `rgba(${color.rgbString}, 0.08)`);
      });
    } else {
      setAccentColor(DEFAULT_COLOR);
      document.documentElement.style.setProperty("--dynamic-accent", DEFAULT_COLOR.hex);
      document.documentElement.style.setProperty("--dynamic-accent-rgb", DEFAULT_COLOR.rgbString);
      document.documentElement.style.setProperty("--dynamic-glow", `rgba(${DEFAULT_COLOR.rgbString}, 0.35)`);
      document.documentElement.style.setProperty("--dynamic-bg", `rgba(${DEFAULT_COLOR.rgbString}, 0.08)`);
    }
  }, [currentSong?.thumbnail]);

  // Playback timer ref to record history when appropriate
  const playedSecondsRef = useRef<number>(0);
  const lastRecordedSongIdRef = useRef<string | null>(null);

  // Synchronized refs to avoid recreation of Audio element and event listener churn
  const lyricsDataRef = useRef<LyricsData | null>(null);
  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef<number>(-1);
  const repeatModeRef = useRef<RepeatMode>("off");
  const isShuffleRef = useRef<boolean>(false);
  const currentSongRef = useRef<Song | null>(null);

  useEffect(() => {
    lyricsDataRef.current = lyricsData;
  }, [lyricsData]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    queueIndexRef.current = queueIndex;
  }, [queueIndex]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  // Initialize audio element ONCE for the app lifetime
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audio.preload = "auto";
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    const onTimeUpdate = () => {
      const cur = audio.currentTime;
      setCurrentTime(cur);
      playedSecondsRef.current = Math.floor(cur);

      // Update lyrics sync from ref
      const lines = lyricsDataRef.current?.parsed?.lines;
      if (lines?.length) {
        const curMs = cur * 1000;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].time <= curMs) {
            idx = i;
          } else {
            break;
          }
        }
        setActiveLyricsIndex(idx);
      }
    };

    const onLoadedMetadata = () => {
      console.log("[Audio] loadedmetadata: duration =", audio.duration);
      setDuration(audio.duration || 0);
    };

    const onEnded = () => {
      console.log("[Audio] Track ended, advancing to next song");
      recordHistory();
      handleSongEnded();
    };

    const onError = (e: any) => {
      const err = audio.error;
      console.error("[HTML5 Audio Error]", {
        code: err?.code,
        message: err?.message,
        networkState: audio.networkState,
        readyState: audio.readyState,
        currentSrc: audio.currentSrc,
      });
      setIsLoadingStream(false);
      setIsPlaying(false);
      setError(`Lỗi phát âm thanh [Mã ${err?.code || 0}]: ${err?.message || "Không thể giải mã dữ liệu"}`);
    };

    const onWaiting = () => {
      console.log("[Audio] Buffering data...");
      setIsLoadingStream(true);
    };

    const onCanPlay = () => {
      console.log("[Audio] canplay event fired");
      setIsLoadingStream(false);
    };

    const onPlaying = () => {
      console.log("[Audio] playing event fired");
      setIsLoadingStream(false);
      setIsPlaying(true);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, []);

  const recordHistory = () => {
    const song = currentSongRef.current;
    if (song && playedSecondsRef.current >= 5) {
      if (window.mochyApi) {
        window.mochyApi.addHistory(song.id, playedSecondsRef.current, song);
      }
      lastRecordedSongIdRef.current = song.id;
    }
  };

  const handleSongEnded = () => {
    const curRepeat = repeatModeRef.current;
    const curQueue = queueRef.current;
    const curIdx = queueIndexRef.current;
    const curShuffle = isShuffleRef.current;

    if (curRepeat === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => console.error("[AudioPlayError]", err));
      }
      return;
    }

    if (curQueue.length === 0) return;

    if (curShuffle) {
      const nextIdx = Math.floor(Math.random() * curQueue.length);
      setQueueIndex(nextIdx);
      loadAndPlay(curQueue[nextIdx]);
      return;
    }

    if (curIdx < curQueue.length - 1) {
      const nextIdx = curIdx + 1;
      setQueueIndex(nextIdx);
      loadAndPlay(curQueue[nextIdx]);
    } else if (curRepeat === "all") {
      setQueueIndex(0);
      loadAndPlay(curQueue[0]);
    } else {
      setIsPlaying(false);
    }
  };

  const loadAndPlay = async (song: Song) => {
    const targetVideoId = (song as any)?.videoId || song?.id || (song as any)?.browseId;
    if (
      !targetVideoId ||
      typeof targetVideoId !== "string" ||
      targetVideoId === "undefined" ||
      targetVideoId.trim().length !== 11
    ) {
      console.warn("[PlayerContext] Cannot play song without valid 11-char videoId:", song);
      setError(`Mã bài hát không hợp lệ (${targetVideoId || "undefined"}). Cần đúng 11 ký tự.`);
      setIsLoadingStream(false);
      return;
    }

    const cleanId = targetVideoId.trim();
    const validSong: Song = {
      ...song,
      id: cleanId,
      videoId: cleanId,
    };

    recordHistory();
    setCurrentSong(validSong);
    setError(null);
    setIsLoadingStream(true);
    setLyricsData(null);
    setActiveLyricsIndex(-1);
    setCurrentTime(0);
    setDuration(validSong.duration || 0);

    // Save song to SQLite
    if (window.mochyApi) {
      window.mochyApi.upsertSong(validSong);
      window.mochyApi.isLiked(cleanId).then((liked) => setIsLiked(liked));
    }

    // 1. Fetch stream URL
    try {
      const playback = await window.mochyApi.getStream(cleanId, "HIGH");
      if (playback?.format) {
        const mime = playback.format.mimeType || "";
        const codec = mime.includes("opus") ? "OPUS" : mime.includes("mp4a") ? "AAC" : "AUDIO";
        const kbps = playback.format.bitrate ? Math.round(playback.format.bitrate / 1000) : 160;
        setStreamInfo({
          bitrate: kbps,
          mimeType: mime,
          client: playback.streamClient || "VISIONOS",
          codec,
          badgeText: `${codec} ${kbps}KBPS`,
        });
      }
      if (audioRef.current && playback?.streamUrl) {
        const audio = audioRef.current;
        console.log("[PlayerContext] Preparing audio playback:", {
          streamUrl: playback.streamUrl,
          client: playback.streamClient,
          mime: playback.format.mimeType,
        });

        // Strict lifecycle sequence requested by user
        audio.pause();
        audio.currentTime = 0;
        audio.src = playback.streamUrl;
        audio.load();

        try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
          setIsPlaying(true);
          console.log("[PlayerContext] audio.play() succeeded!");
        } catch (playErr: any) {
          console.error("[AudioPlayError]", playErr);
          setIsPlaying(false);
        }
      }
    } catch (err: any) {
      console.error("Stream extraction failed:", err);
      setError("Lỗi tải luồng nhạc: " + (err.message || "403 Forbidden"));
    } finally {
      setIsLoadingStream(false);
    }

    // 2. Fetch lyrics concurrently
    try {
      const artist = validSong.artists[0]?.name || "";
      const result = await window.mochyApi.getLyrics(validSong.title, artist, validSong.duration ?? undefined, cleanId);
      if (result) {
        setLyricsData(result);
      }
    } catch (err) {
      console.warn("Failed to load lyrics:", err);
    }
  };

  const playSong = async (rawSong: Song, newQueue?: Song[]) => {
    if (!rawSong) return;

    const rawId = (rawSong as any)?.videoId || rawSong?.id || (rawSong as any)?.browseId;
    if (
      !rawId ||
      typeof rawId !== "string" ||
      rawId === "undefined" ||
      rawId.trim().length !== 11
    ) {
      console.warn("[PlayerContext] playSong rejected invalid videoId (must be 11 chars):", rawId, rawSong);
      setError(`Mã bài hát không hợp lệ (${rawId || "undefined"}).`);
      return;
    }

    const cleanSong: Song = {
      ...rawSong,
      id: rawId.trim(),
      videoId: rawId.trim(),
    };

    let targetQueue = queue;
    let targetIndex = 0;

    if (newQueue && newQueue.length > 0) {
      targetQueue = newQueue
        .map((s) => {
          const sid = (s as any)?.videoId || s?.id;
          return { ...s, id: sid, videoId: sid };
        })
        .filter((s) => typeof s.id === "string" && s.id.length === 11);

      targetIndex = targetQueue.findIndex((s) => s.id === cleanSong.id);
      if (targetIndex === -1) {
        targetQueue = [cleanSong, ...targetQueue];
        targetIndex = 0;
      }
      setQueue(targetQueue);
      setQueueIndex(targetIndex);
    } else {
      const existingIdx = queue.findIndex((s) => s.id === cleanSong.id);
      if (existingIdx !== -1) {
        targetIndex = existingIdx;
        setQueueIndex(existingIdx);
      } else {
        const updated = [cleanSong, ...queue];
        setQueue(updated);
        setQueueIndex(0);
        targetIndex = 0;
      }
    }

    await loadAndPlay(cleanSong);
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const nextSong = () => {
    if (queue.length === 0) return;
    let nextIdx = queueIndex + 1;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else if (nextIdx >= queue.length) {
      nextIdx = 0;
    }
    setQueueIndex(nextIdx);
    loadAndPlay(queue[nextIdx]);
  };

  const prevSong = () => {
    if (!audioRef.current || queue.length === 0) return;
    // If more than 3 seconds into song, restart song
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }
    setQueueIndex(prevIdx);
    loadAndPlay(queue[prevIdx]);
  };

  const seek = (timeSec: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = timeSec;
    setCurrentTime(timeSec);
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = clamped === 0;
    }
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioRef.current.muted = newMuted;
  };

  const toggleRepeat = () => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle);
  };

  const toggleLikeCurrent = async () => {
    if (!currentSong || !window.mochyApi) return;
    const newLiked = await window.mochyApi.toggleLike(currentSong.id, currentSong);
    setIsLiked(newLiked);
  };

  const addToQueue = (song: Song) => {
    setQueue((prev) => [...prev, song]);
  };

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        queue,
        queueIndex,
        repeatMode,
        isShuffle,
        isLiked,
        isLoadingStream,
        lyricsData,
        activeLyricsIndex,
        isLyricsOpen,
        isQueueOpen,
        error,
        accentColor,
        streamInfo,

        playSong,
        togglePlay,
        nextSong,
        prevSong,
        seek,
        setVolume,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        toggleLikeCurrent,
        setIsLyricsOpen,
        setIsQueueOpen,
        addToQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = (): PlayerContextType => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
};
