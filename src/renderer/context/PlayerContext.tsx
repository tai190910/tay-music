// src/renderer/context/PlayerContext.tsx

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { isValidTrackId, type Song, type LyricsData, type RepeatMode, type StreamInfo } from "../types.ts";
import { extractDominantColor, DEFAULT_COLOR, type ExtractedColor } from "../utils/colorExtractor.ts";

export type DeckId = "A" | "B";

export interface AppSettings {
  saveLastState: boolean;
  pauseWhenMuted: boolean;
  keepShuffleOn: boolean;
  dontSkipOnFailure: boolean;
  evenOutVolume: boolean;
  streamQuality: "HIGH" | "MEDIUM" | "LOW";
  ambientBackground: boolean;
  typewriterLyrics: boolean;
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  saveLastState: true,
  pauseWhenMuted: false,
  keepShuffleOn: true,
  dontSkipOnFailure: false,
  evenOutVolume: false,
  streamQuality: "HIGH",
  ambientBackground: true,
  typewriterLyrics: true,
  crossfadeEnabled: true,
  crossfadeDuration: 6,
};

const SETTINGS_STORAGE_KEY = "tay_music_settings";
const PRELOAD_LEAD_SECONDS = 15;

function clampCrossfadeDuration(val: unknown, fallback = DEFAULT_APP_SETTINGS.crossfadeDuration): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(12, Math.round(num)));
}

function readAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      crossfadeDuration: clampCrossfadeDuration(parsed?.crossfadeDuration),
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

function buildStreamInfo(playback: any): StreamInfo | null {
  if (!playback?.format) return null;
  const mime = playback.format.mimeType || "";
  const isSc = playback.streamClient === "SOUNDCLOUD";
  const codec = isSc
    ? mime.includes("mpeg")
      ? "SC-MP3"
      : mime.includes("mp4")
        ? "SC-AAC"
        : "SC"
    : mime.includes("opus")
      ? "OPUS"
      : mime.includes("mp4a")
        ? "AAC"
        : "AUDIO";
  const kbps = playback.format.bitrate ? Math.round(playback.format.bitrate / 1000) : 160;
  return {
    bitrate: kbps,
    mimeType: mime,
    client: playback.streamClient || "VISIONOS",
    codec,
    badgeText: `${codec} ${kbps}KBPS`,
  };
}

function resolveNextQueueTarget(
  fromIndex: number,
  curQueue: Song[],
  curRepeat: RepeatMode,
  curShuffle: boolean
): { song: Song; nextIndex: number } | null {
  if (curRepeat === "one" || curQueue.length === 0) return null;

  if (curShuffle) {
    if (curQueue.length === 1) {
      return curRepeat === "all" ? { song: curQueue[0], nextIndex: 0 } : null;
    }
    let nextIdx = Math.floor(Math.random() * curQueue.length);
    if (nextIdx === fromIndex) {
      nextIdx = (fromIndex + 1 + Math.floor(Math.random() * (curQueue.length - 1))) % curQueue.length;
    }
    return { song: curQueue[nextIdx], nextIndex: nextIdx };
  }

  if (fromIndex < curQueue.length - 1) {
    const nextIdx = fromIndex + 1;
    return { song: curQueue[nextIdx], nextIndex: nextIdx };
  }

  if (curRepeat === "all") {
    return { song: curQueue[0], nextIndex: 0 };
  }

  return null;
}

interface DeckSlot {
  id: DeckId;
  audio: HTMLAudioElement;
  hls: Hls | null;
}

interface PreloadedTrack {
  gen: number;
  forSongId: string;
  song: Song;
  nextIndex: number;
  streamInfo: StreamInfo | null;
  standbyDeckId: DeckId;
  status: "loading" | "ready" | "error";
  lyricsPromise: Promise<LyricsData | null>;
}

interface CrossfadeRuntime {
  active: boolean;
  outgoingDeckId: DeckId;
  incomingDeckId: DeckId;
  rafId: number | null;
  durationMs: number;
  elapsedMs: number;
  lastFrameMs: number | null;
  paused: boolean;
  preload: PreloadedTrack | null;
}

export type RightDrawerTab = "lyrics" | "queue" | null;
export type FullscreenTab = "lyrics" | "queue";

interface PlayerContextType {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  activeDeck: DeckId;
  isCrossfading: boolean;
  currentSong: Song | null;
  isPlaying: boolean;
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
  isLyricsOpen: boolean;
  isQueueOpen: boolean;
  rightDrawerTab: RightDrawerTab;
  isFullscreenPlayerOpen: boolean;
  fullscreenTab: FullscreenTab;
  settings: AppSettings;
  error: string | null;
  accentColor: ExtractedColor;
  streamInfo: StreamInfo | null;
  resumeData: { song: Song; currentTime: number; duration: number; timestamp: number } | null;
  quickSwitchTarget: { song: Song; playlistId?: string | null } | null;
  lastSwitchedVersion: { oldId: string; newSong: Song; playlistId?: string | null; ts: number } | null;
  activePlaylistId: string | null;

  getCurrentTime: () => number;
  playSong: (song: Song, newQueue?: Song[], sourcePlaylistId?: string | null) => Promise<void>;
  resumePlayback: () => Promise<void>;
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
  setRightDrawerTab: (tab: RightDrawerTab | ((prev: RightDrawerTab) => RightDrawerTab)) => void;
  toggleRightDrawer: (tab: "lyrics" | "queue") => void;
  setIsFullscreenPlayerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setFullscreenTab: (tab: FullscreenTab) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  addToQueue: (song: Song) => void;
  setActivePlaylistId: (playlistId: string | null) => void;
  openQuickSwitch: (song: Song, playlistId?: string | null) => void;
  closeQuickSwitch: () => void;
  replaceSongVersion: (
    oldSongId: string,
    newSong: Song,
    playlistId?: string | null,
    autoPlay?: boolean
  ) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const decksRef = useRef<{ A: DeckSlot; B: DeckSlot } | null>(null);
  const activeDeckRef = useRef<DeckId>("A");
  const [activeDeck, setActiveDeck] = useState<DeckId>("A");
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
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
  const [rightDrawerTab, setRightDrawerTab] = useState<RightDrawerTab>(null);
  const [isFullscreenPlayerOpen, setIsFullscreenPlayerOpen] = useState<boolean>(false);
  const [fullscreenTab, setFullscreenTab] = useState<FullscreenTab>("lyrics");
  const [settings, setSettings] = useState<AppSettings>(() => readAppSettings());
  const isLyricsOpen = rightDrawerTab === "lyrics";
  const isQueueOpen = rightDrawerTab === "queue";

  const toggleRightDrawer = useCallback((tab: "lyrics" | "queue") => {
    setRightDrawerTab((prev) => (prev === tab ? null : tab));
  }, []);

  const setIsLyricsOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setRightDrawerTab((prev) => {
        const nextVal = typeof open === "function" ? open(prev === "lyrics") : open;
        return nextVal ? "lyrics" : prev === "lyrics" ? null : prev;
      });
    },
    []
  );

  const setIsQueueOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setRightDrawerTab((prev) => {
        const nextVal = typeof open === "function" ? open(prev === "queue") : open;
        return nextVal ? "queue" : prev === "queue" ? null : prev;
      });
    },
    []
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const merged: AppSettings = {
        ...prev,
        ...patch,
      };
      if (patch.crossfadeDuration !== undefined) {
        merged.crossfadeDuration = clampCrossfadeDuration(patch.crossfadeDuration, prev.crossfadeDuration);
      }
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<ExtractedColor>(DEFAULT_COLOR);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>({
    bitrate: 160,
    codec: "OPUS",
    client: "VISIONOS",
    badgeText: "OPUS 160KBPS",
  });
  const [resumeData, setResumeData] = useState<{
    song: Song;
    currentTime: number;
    duration: number;
    timestamp: number;
  } | null>(null);
  const [quickSwitchTarget, setQuickSwitchTarget] = useState<{
    song: Song;
    playlistId?: string | null;
  } | null>(null);
  const [lastSwitchedVersion, setLastSwitchedVersion] = useState<{
    oldId: string;
    newSong: Song;
    playlistId?: string | null;
    ts: number;
  } | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  // Load saved resume progress on launch (respecting settings.saveLastState)
  useEffect(() => {
    if (!settings.saveLastState) return;
    try {
      const raw = localStorage.getItem("tay_music_resume");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.song?.id) {
          setResumeData(parsed);
        }
      }
    } catch {}
  }, [settings.saveLastState]);

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

  // Playback timer & state refs
  const playedSecondsRef = useRef<number>(0);
  const lastRecordedSongIdRef = useRef<string | null>(null);
  const lastSavedResumeSecRef = useRef<number>(-1);

  const queueRef = useRef<Song[]>([]);
  const queueIndexRef = useRef<number>(-1);
  const repeatModeRef = useRef<RepeatMode>("off");
  const isShuffleRef = useRef<boolean>(false);
  const currentSongRef = useRef<Song | null>(null);
  const activePlaylistIdRef = useRef<string | null>(null);
  const settingsRef = useRef<AppSettings>(settings);
  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);
  const pausedByMuteRef = useRef<boolean>(false);
  const consecutiveFailuresRef = useRef<number>(0);

  const loadGenRef = useRef<number>(0);
  const preloadGenRef = useRef<number>(0);
  const preloadRef = useRef<PreloadedTrack | null>(null);
  const crossfadeRef = useRef<CrossfadeRuntime>({
    active: false,
    outgoingDeckId: "A",
    incomingDeckId: "B",
    rafId: null,
    durationMs: 6000,
    elapsedMs: 0,
    lastFrameMs: null,
    paused: false,
    preload: null,
  });

  const getMasterGain = useCallback(() => {
    if (isMutedRef.current) return 0;
    return Math.max(
      0,
      Math.min(1, volumeRef.current * (settingsRef.current.evenOutVolume ? 0.88 : 1))
    );
  }, []);

  const getEffectiveCrossfadeSec = useCallback(() => {
    const s = settingsRef.current;
    if (!s.crossfadeEnabled) return 0;
    return clampCrossfadeDuration(s.crossfadeDuration, 0);
  }, []);

  const resetDeck = useCallback((deck: DeckSlot) => {
    deck.audio.pause();
    deck.audio.currentTime = 0;
    deck.audio.volume = 0;
    if (deck.hls) {
      deck.hls.destroy();
      deck.hls = null;
    }
    if (deck.audio.hasAttribute("src") || deck.audio.src) {
      deck.audio.removeAttribute("src");
      deck.audio.load();
    }
  }, []);

  const attachStreamToDeck = useCallback(
    async (
      deck: DeckSlot,
      streamUrl: string,
      isHls: boolean,
      targetVolume: number,
      autoPlay: boolean,
      isStale?: () => boolean
    ) => {
      if (deck.hls) {
        deck.hls.destroy();
        deck.hls = null;
      }

      deck.audio.pause();
      deck.audio.currentTime = 0;
      deck.audio.volume = Math.max(0, Math.min(1, targetVolume));
      deck.audio.muted = isMutedRef.current;

      if (isHls) {
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: false });
          deck.hls = hls;

          await new Promise<void>((resolve, reject) => {
            let settled = false;
            const onParsed = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            const onHlsError = (_event: any, data: any) => {
              if (data?.fatal && !settled) {
                settled = true;
                hls.destroy();
                if (deck.hls === hls) {
                  deck.hls = null;
                }
                reject(new Error(data?.details || "HLS stream error"));
              }
            };
            hls.once(Hls.Events.MANIFEST_PARSED, onParsed);
            hls.on(Hls.Events.ERROR, onHlsError);
            hls.loadSource(streamUrl);
            hls.attachMedia(deck.audio);
          });

          if (deck.hls !== hls || isStale?.()) {
            hls.destroy();
            if (deck.hls === hls) deck.hls = null;
            return;
          }
        } else if (deck.audio.canPlayType("application/vnd.apple.mpegurl")) {
          deck.audio.src = streamUrl;
          deck.audio.load();
        } else {
          throw new Error("Trình phát không hỗ trợ định dạng HLS");
        }
      } else {
        deck.audio.src = streamUrl;
        deck.audio.load();
      }

      if (isStale?.()) {
        resetDeck(deck);
        return;
      }

      if (autoPlay) {
        const playPromise = deck.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    },
    [resetDeck]
  );

  const clearStandbyPreload = useCallback(() => {
    preloadGenRef.current += 1;
    const prev = preloadRef.current;
    preloadRef.current = null;
    if (prev && decksRef.current && !crossfadeRef.current.active) {
      const standbyDeck = decksRef.current[prev.standbyDeckId];
      if (standbyDeck.id !== activeDeckRef.current) {
        resetDeck(standbyDeck);
      }
    }
  }, [resetDeck]);

  const cancelCrossfade = useCallback(() => {
    const cf = crossfadeRef.current;
    if (!cf.active) return;

    if (cf.rafId !== null) {
      window.cancelAnimationFrame(cf.rafId);
      cf.rafId = null;
    }
    cf.active = false;
    cf.paused = false;
    cf.lastFrameMs = null;
    cf.preload = null;

    if (decksRef.current) {
      const outgoing = decksRef.current[cf.outgoingDeckId];
      const incoming = decksRef.current[cf.incomingDeckId];
      resetDeck(incoming);
      outgoing.audio.volume = getMasterGain();
      outgoing.audio.muted = isMutedRef.current;
    }
    setIsCrossfading(false);
  }, [getMasterGain, resetDeck]);

  const cancelCrossfadeAndPreload = useCallback(() => {
    cancelCrossfade();
    clearStandbyPreload();
  }, [cancelCrossfade, clearStandbyPreload]);

  const applyCrossfadeVolumes = useCallback(
    (progress: number) => {
      const cf = crossfadeRef.current;
      if (!cf.active || !decksRef.current) return;
      const clamped = Math.max(0, Math.min(1, progress));
      const gain = getMasterGain();
      const outgoing = decksRef.current[cf.outgoingDeckId];
      const incoming = decksRef.current[cf.incomingDeckId];

      // Equal-Power Crossfade curve: preserves perceived loudness at midpoint (~0.707 * gain each)
      outgoing.audio.volume = Math.max(0, Math.min(1, Math.cos((clamped * Math.PI) / 2) * gain));
      outgoing.audio.muted = isMutedRef.current;
      incoming.audio.volume = Math.max(0, Math.min(1, Math.sin((clamped * Math.PI) / 2) * gain));
      incoming.audio.muted = isMutedRef.current;
    },
    [getMasterGain]
  );

  // Sync volume & mute changes smoothly across active deck and active crossfade pair
  useEffect(() => {
    settingsRef.current = settings;
    volumeRef.current = volume;
    isMutedRef.current = isMuted;

    if (!decksRef.current) return;
    if (crossfadeRef.current.active) {
      const cf = crossfadeRef.current;
      const progress = cf.durationMs > 0 ? cf.elapsedMs / cf.durationMs : 0;
      applyCrossfadeVolumes(progress);
    } else {
      const activeAudio = decksRef.current[activeDeckRef.current].audio;
      activeAudio.volume = getMasterGain();
      activeAudio.muted = isMuted;
    }
  }, [settings, volume, isMuted, applyCrossfadeVolumes, getMasterGain]);

  // Cancel active crossfade or stale preload when crossfade settings / repeat mode disable it
  useEffect(() => {
    if (!settings.crossfadeEnabled || settings.crossfadeDuration <= 0 || repeatMode === "one") {
      cancelCrossfadeAndPreload();
    }
  }, [settings.crossfadeEnabled, settings.crossfadeDuration, repeatMode, cancelCrossfadeAndPreload]);

  // Invalidate non-active standby preload if queue order or shuffle state changes
  useEffect(() => {
    if (!crossfadeRef.current.active) {
      clearStandbyPreload();
    }
  }, [queue, isShuffle, clearStandbyPreload]);

  useEffect(() => {
    activePlaylistIdRef.current = activePlaylistId;
  }, [activePlaylistId]);

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

  const recordHistory = useCallback(() => {
    const song = currentSongRef.current;
    if (song && playedSecondsRef.current >= 5) {
      if (window.mochyApi) {
        window.mochyApi.addHistory(song.id, playedSecondsRef.current, song);
      }
      lastRecordedSongIdRef.current = song.id;
    }
  }, []);

  const finishCrossfade = useCallback(() => {
    const cf = crossfadeRef.current;
    if (!cf.active || !decksRef.current) return;

    if (cf.rafId !== null) {
      window.cancelAnimationFrame(cf.rafId);
      cf.rafId = null;
    }
    cf.active = false;
    cf.paused = false;
    cf.lastFrameMs = null;

    const preload = cf.preload;
    cf.preload = null;
    preloadRef.current = null;

    const outgoing = decksRef.current[cf.outgoingDeckId];
    const incoming = decksRef.current[cf.incomingDeckId];

    recordHistory();
    resetDeck(outgoing);

    incoming.audio.volume = getMasterGain();
    incoming.audio.muted = isMutedRef.current;

    activeDeckRef.current = incoming.id;
    audioRef.current = incoming.audio;
    setActiveDeck(incoming.id);
    setIsCrossfading(false);

    if (!preload) return;

    const myGen = ++loadGenRef.current;
    const promotedSong = preload.song;
    const nextAudioDur =
      Number.isFinite(incoming.audio.duration) && incoming.audio.duration > 0
        ? incoming.audio.duration
        : promotedSong.duration || 0;

    playedSecondsRef.current = Math.floor(incoming.audio.currentTime || 0);
    lastSavedResumeSecRef.current = -1;
    consecutiveFailuresRef.current = 0;

    setCurrentSong(promotedSong);
    setQueueIndex(preload.nextIndex);
    setDuration(nextAudioDur);
    if (preload.streamInfo) {
      setStreamInfo(preload.streamInfo);
    }
    setLyricsData(null);
    setIsLoadingStream(false);
    setError(null);
    setIsPlaying(!incoming.audio.paused);

    if (window.mochyApi) {
      window.mochyApi.upsertSong(promotedSong);
      window.mochyApi.isLiked(promotedSong.id).then((liked) => {
        if (loadGenRef.current === myGen) {
          setIsLiked(liked);
        }
      });
    }

    preload.lyricsPromise
      .then((res) => {
        if (loadGenRef.current === myGen && res) {
          setLyricsData(res);
        }
      })
      .catch((err) => {
        console.warn("[Crossfade] Lyrics resolve warning:", err);
      });
  }, [getMasterGain, recordHistory, resetDeck]);

  const startCrossfade = useCallback(
    async (remainingSec: number) => {
      if (!decksRef.current) return;
      const cf = crossfadeRef.current;
      const preload = preloadRef.current;

      if (
        cf.active ||
        !preload ||
        preload.status !== "ready" ||
        preload.forSongId !== currentSongRef.current?.id
      ) {
        return;
      }

      const outgoing = decksRef.current[activeDeckRef.current];
      const incoming = decksRef.current[preload.standbyDeckId];
      if (outgoing.id === incoming.id || outgoing.audio.paused) return;

      const cfSec = getEffectiveCrossfadeSec();
      if (cfSec <= 0) return;

      const fadeDurationSec = Math.max(0.8, Math.min(cfSec, remainingSec));

      cf.active = true;
      cf.outgoingDeckId = outgoing.id;
      cf.incomingDeckId = incoming.id;
      cf.durationMs = fadeDurationSec * 1000;
      cf.elapsedMs = 0;
      cf.lastFrameMs = performance.now();
      cf.paused = false;
      cf.preload = preload;
      setIsCrossfading(true);

      incoming.audio.currentTime = 0;
      incoming.audio.volume = 0;
      incoming.audio.muted = isMutedRef.current;

      try {
        const playPromise = incoming.audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      } catch (err) {
        console.error("[Crossfade] Failed to start incoming deck:", err);
        cancelCrossfade();
        clearStandbyPreload();
        return;
      }

      // Guard against cancellation while await resolved
      if (!cf.active || cf.preload !== preload) {
        resetDeck(incoming);
        return;
      }

      const step = (now: number) => {
        const runtime = crossfadeRef.current;
        if (!runtime.active) return;

        if (!runtime.paused) {
          const prev = runtime.lastFrameMs ?? now;
          const dt = Math.max(0, Math.min(100, now - prev));
          runtime.elapsedMs += dt;
          runtime.lastFrameMs = now;

          const progress = Math.min(1, runtime.elapsedMs / runtime.durationMs);
          applyCrossfadeVolumes(progress);

          if (progress >= 1) {
            finishCrossfade();
            return;
          }
        } else {
          runtime.lastFrameMs = now;
        }

        runtime.rafId = window.requestAnimationFrame(step);
      };

      cf.rafId = window.requestAnimationFrame(step);
    },
    [
      applyCrossfadeVolumes,
      cancelCrossfade,
      clearStandbyPreload,
      finishCrossfade,
      getEffectiveCrossfadeSec,
      resetDeck,
    ]
  );

  const preloadNextTrackOnStandby = useCallback(
    async (forSongId: string) => {
      if (!decksRef.current || !window.mochyApi) return;
      if (crossfadeRef.current.active) return;

      const target = resolveNextQueueTarget(
        queueIndexRef.current,
        queueRef.current,
        repeatModeRef.current,
        isShuffleRef.current
      );
      if (!target) return;

      const nextRawId = (target.song as any)?.videoId || target.song?.id || (target.song as any)?.browseId;
      if (!isValidTrackId(nextRawId)) return;

      const cleanNextId = nextRawId.trim();
      const nextSongObj: Song = {
        ...target.song,
        id: cleanNextId,
        videoId: cleanNextId,
      };

      const standbyDeckId: DeckId = activeDeckRef.current === "A" ? "B" : "A";
      const standbyDeck = decksRef.current[standbyDeckId];
      const gen = ++preloadGenRef.current;

      const artist = nextSongObj.artists[0]?.name || "";
      const lyricsPromise = window.mochyApi
        .getLyrics(nextSongObj.title, artist, nextSongObj.duration ?? undefined, cleanNextId)
        .catch(() => null);

      const entry: PreloadedTrack = {
        gen,
        forSongId,
        song: nextSongObj,
        nextIndex: target.nextIndex,
        streamInfo: null,
        standbyDeckId,
        status: "loading",
        lyricsPromise,
      };
      preloadRef.current = entry;

      const isStale = () =>
        preloadGenRef.current !== gen ||
        crossfadeRef.current.active ||
        currentSongRef.current?.id !== forSongId;

      try {
        const playback = await window.mochyApi.getStream(
          cleanNextId,
          settingsRef.current.streamQuality || "HIGH"
        );
        if (isStale() || !playback?.streamUrl) {
          if (preloadRef.current === entry) preloadRef.current = null;
          return;
        }

        entry.streamInfo = buildStreamInfo(playback);
        const isHls = Boolean(playback?.format?.isHls) || playback.streamUrl.includes("/hls?");

        await attachStreamToDeck(standbyDeck, playback.streamUrl, isHls, 0, false, isStale);

        if (isStale()) {
          resetDeck(standbyDeck);
          if (preloadRef.current === entry) preloadRef.current = null;
          return;
        }

        entry.status = "ready";
        console.log("[Crossfade] Preloaded next track on Deck", standbyDeckId, ":", nextSongObj.title);
      } catch (err) {
        console.warn("[Crossfade] Standby preload failed (will fall back to standard transition):", err);
        if (preloadRef.current === entry) {
          entry.status = "error";
        }
      }
    },
    [attachStreamToDeck, resetDeck]
  );

  // Use ref bridges so listeners bound once on Deck A & Deck B always invoke latest handlers
  const handleSongEndedRef = useRef<() => void>(() => {});
  const onActiveTimeUpdateRef = useRef<(deck: DeckSlot) => void>(() => {});

  const loadAndPlay = useCallback(
    async (song: Song) => {
      cancelCrossfadeAndPreload();

      const targetVideoId = (song as any)?.videoId || song?.id || (song as any)?.browseId;
      if (!isValidTrackId(targetVideoId)) {
        console.warn("[PlayerContext] Cannot play song without valid trackId:", song);
        setError(`Mã bài hát không hợp lệ (${targetVideoId || "undefined"}).`);
        setIsLoadingStream(false);
        return;
      }

      const myGen = ++loadGenRef.current;
      const cleanId = targetVideoId.trim();
      const validSong: Song = {
        ...song,
        id: cleanId,
        videoId: cleanId,
      };

      recordHistory();
      playedSecondsRef.current = 0;
      lastSavedResumeSecRef.current = -1;
      setCurrentSong(validSong);
      setError(null);
      setIsLoadingStream(true);
      setLyricsData(null);
      setDuration(validSong.duration || 0);

      if (window.mochyApi) {
        window.mochyApi.upsertSong(validSong);
        window.mochyApi.isLiked(cleanId).then((liked) => {
          if (loadGenRef.current === myGen) {
            setIsLiked(liked);
          }
        });
      }

      // 1. Fetch stream URL for active deck
      try {
        const playback = await window.mochyApi.getStream(
          cleanId,
          settingsRef.current.streamQuality || "HIGH"
        );
        if (loadGenRef.current !== myGen) return;

        const info = buildStreamInfo(playback);
        if (info) setStreamInfo(info);

        const activeSlot = decksRef.current?.[activeDeckRef.current];
        if (activeSlot && playback?.streamUrl) {
          const isHls = Boolean(playback?.format?.isHls) || playback.streamUrl.includes("/hls?");

          await attachStreamToDeck(
            activeSlot,
            playback.streamUrl,
            isHls,
            getMasterGain(),
            true,
            () => loadGenRef.current !== myGen
          );

          if (loadGenRef.current !== myGen) return;

          setIsPlaying(true);
          consecutiveFailuresRef.current = 0;
          console.log("[PlayerContext] audio.play() succeeded on Deck", activeSlot.id);
        }
      } catch (err: any) {
        if (loadGenRef.current !== myGen) return;
        console.error("Stream extraction failed:", err);
        setIsPlaying(false);
        setError("Lỗi tải luồng nhạc: " + (err.message || "403 Forbidden"));
        if (
          !settingsRef.current.dontSkipOnFailure &&
          queueRef.current.length > 1 &&
          consecutiveFailuresRef.current < 3
        ) {
          consecutiveFailuresRef.current += 1;
          setTimeout(() => {
            if (loadGenRef.current === myGen) {
              handleSongEndedRef.current();
            }
          }, 1200);
        }
      } finally {
        if (loadGenRef.current === myGen) {
          setIsLoadingStream(false);
        }
      }

      // 2. Fetch lyrics concurrently
      try {
        const artist = validSong.artists[0]?.name || "";
        const result = await window.mochyApi.getLyrics(
          validSong.title,
          artist,
          validSong.duration ?? undefined,
          cleanId
        );
        if (loadGenRef.current === myGen && result) {
          setLyricsData(result);
        }
      } catch (err) {
        console.warn("Failed to load lyrics:", err);
      }
    },
    [attachStreamToDeck, cancelCrossfadeAndPreload, getMasterGain, recordHistory]
  );

  const handleSongEnded = useCallback(() => {
    const curRepeat = repeatModeRef.current;
    const curQueue = queueRef.current;
    const curIdx = queueIndexRef.current;
    const curShuffle = isShuffleRef.current;

    if (curRepeat === "one") {
      const activeAudio = decksRef.current?.[activeDeckRef.current].audio;
      if (activeAudio) {
        activeAudio.currentTime = 0;
        activeAudio.volume = getMasterGain();
        activeAudio.play().catch((err) => console.error("[AudioPlayError]", err));
      }
      return;
    }

    const nextTarget = resolveNextQueueTarget(curIdx, curQueue, curRepeat, curShuffle);
    if (!nextTarget) {
      setIsPlaying(false);
      return;
    }

    setQueueIndex(nextTarget.nextIndex);
    loadAndPlay(nextTarget.song);
  }, [getMasterGain, loadAndPlay]);

  handleSongEndedRef.current = handleSongEnded;

  onActiveTimeUpdateRef.current = (deck: DeckSlot) => {
    const audio = deck.audio;
    const cur = audio.currentTime;
    const curFloor = Math.floor(cur);
    playedSecondsRef.current = curFloor;

    // Persist resume position silently every 5s WITHOUT setting React state
    if (
      settingsRef.current.saveLastState &&
      currentSongRef.current &&
      cur > 3 &&
      curFloor % 5 === 0 &&
      curFloor !== lastSavedResumeSecRef.current
    ) {
      lastSavedResumeSecRef.current = curFloor;
      const item = {
        song: currentSongRef.current,
        currentTime: cur,
        duration: audio.duration || 0,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem("tay_music_resume", JSON.stringify(item));
      } catch {}
    }

    // Crossfade scheduling (preload ~15s ahead, fade inside remaining <= cfSec)
    const cfSec = getEffectiveCrossfadeSec();
    const dur = audio.duration;
    const song = currentSongRef.current;

    if (
      cfSec <= 0 ||
      !song ||
      repeatModeRef.current === "one" ||
      !Number.isFinite(dur) ||
      dur < cfSec * 2 ||
      audio.paused
    ) {
      return;
    }

    const remaining = dur - cur;

    if (
      !crossfadeRef.current.active &&
      remaining <= cfSec + PRELOAD_LEAD_SECONDS &&
      remaining > cfSec * 0.45 &&
      (!preloadRef.current || preloadRef.current.forSongId !== song.id)
    ) {
      preloadNextTrackOnStandby(song.id);
    }

    if (
      !crossfadeRef.current.active &&
      remaining <= cfSec &&
      remaining > 0.2 &&
      preloadRef.current?.status === "ready" &&
      preloadRef.current.forSongId === song.id
    ) {
      startCrossfade(remaining);
    }
  };

  // Initialize Dual Decks (Deck A & Deck B) ONCE for the app lifetime
  useEffect(() => {
    const createDeck = (id: DeckId): DeckSlot => {
      const audio = new Audio();
      audio.volume = id === "A" ? getMasterGain() : 0;
      audio.preload = "auto";
      return { id, audio, hls: null };
    };

    const deckA = createDeck("A");
    const deckB = createDeck("B");
    decksRef.current = { A: deckA, B: deckB };
    activeDeckRef.current = "A";
    audioRef.current = deckA.audio;

    const bindDeckEvents = (deck: DeckSlot) => {
      const { audio } = deck;

      const onPlay = () => {
        if (activeDeckRef.current !== deck.id) return;
        setIsPlaying(true);
      };

      const onPause = () => {
        if (activeDeckRef.current !== deck.id) return;
        if (crossfadeRef.current.active && !crossfadeRef.current.paused) {
          // Outgoing deck finished playing naturally? Handled by onEnded.
          return;
        }
        setIsPlaying(false);
        if (settingsRef.current.saveLastState && currentSongRef.current && audio.currentTime > 2) {
          const item = {
            song: currentSongRef.current,
            currentTime: audio.currentTime,
            duration: audio.duration || 0,
            timestamp: Date.now(),
          };
          setResumeData(item);
          try {
            localStorage.setItem("tay_music_resume", JSON.stringify(item));
          } catch {}
        }
      };

      const onTimeUpdate = () => {
        if (activeDeckRef.current !== deck.id) return;
        onActiveTimeUpdateRef.current(deck);
      };

      const onLoadedMetadata = () => {
        if (activeDeckRef.current !== deck.id) return;
        setDuration(audio.duration || 0);
      };

      const onEnded = () => {
        if (crossfadeRef.current.active && crossfadeRef.current.outgoingDeckId === deck.id) {
          finishCrossfade();
          return;
        }
        if (activeDeckRef.current !== deck.id) return;
        console.log("[Audio] Track ended on Deck", deck.id);
        recordHistory();
        handleSongEndedRef.current();
      };

      const onError = () => {
        // Ignore standby preload errors cleanly so active playback never breaks
        if (activeDeckRef.current !== deck.id) {
          if (crossfadeRef.current.active && crossfadeRef.current.incomingDeckId === deck.id) {
            cancelCrossfade();
            clearStandbyPreload();
          }
          return;
        }
        // Ignore expected error after removing src attribute during reset
        if (!audio.currentSrc) return;
        const err = audio.error;
        console.error("[HTML5 Audio Error]", {
          deck: deck.id,
          code: err?.code,
          message: err?.message,
          networkState: audio.networkState,
          readyState: audio.readyState,
        });
        setIsLoadingStream(false);
        setIsPlaying(false);
        setError(
          `Lỗi phát âm thanh [Mã ${err?.code || 0}]: ${err?.message || "Không thể giải mã dữ liệu"}`
        );
      };

      const onWaiting = () => {
        if (activeDeckRef.current !== deck.id) return;
        setIsLoadingStream(true);
      };

      const onCanPlay = () => {
        if (activeDeckRef.current !== deck.id) return;
        setIsLoadingStream(false);
      };

      const onPlaying = () => {
        if (activeDeckRef.current !== deck.id) return;
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
      };
    };

    const unbindA = bindDeckEvents(deckA);
    const unbindB = bindDeckEvents(deckB);

    return () => {
      if (crossfadeRef.current.rafId !== null) {
        window.cancelAnimationFrame(crossfadeRef.current.rafId);
        crossfadeRef.current.rafId = null;
      }
      crossfadeRef.current.active = false;
      unbindA();
      unbindB();
      resetDeck(deckA);
      resetDeck(deckB);
      decksRef.current = null;
      audioRef.current = null;
    };
  }, [cancelCrossfade, clearStandbyPreload, finishCrossfade, getMasterGain, recordHistory, resetDeck]);

  const playSong = async (
    rawSong: Song,
    newQueue?: Song[],
    sourcePlaylistId?: string | null
  ) => {
    if (!rawSong) return;

    const rawId = (rawSong as any)?.videoId || rawSong?.id || (rawSong as any)?.browseId;
    if (!isValidTrackId(rawId)) {
      console.warn("[PlayerContext] playSong rejected invalid trackId:", rawId, rawSong);
      setError(`Mã bài hát không hợp lệ (${rawId || "undefined"}).`);
      return;
    }

    if (sourcePlaylistId !== undefined) {
      setActivePlaylistId(sourcePlaylistId);
    }

    const cleanSong: Song = {
      ...rawSong,
      id: rawId.trim(),
      videoId: rawId.trim(),
    };

    let targetQueue = queue;

    if (newQueue && newQueue.length > 0) {
      targetQueue = newQueue
        .map((s) => {
          const sid = (s as any)?.videoId || s?.id;
          return { ...s, id: sid, videoId: sid };
        })
        .filter((s) => isValidTrackId(s.id));

      let targetIndex = targetQueue.findIndex((s) => s.id === cleanSong.id);
      if (targetIndex === -1) {
        targetQueue = [cleanSong, ...targetQueue];
        targetIndex = 0;
      }
      setQueue(targetQueue);
      setQueueIndex(targetIndex);
      if (!settingsRef.current.keepShuffleOn) {
        setIsShuffle(false);
      }
    } else {
      const existingIdx = queue.findIndex((s) => s.id === cleanSong.id);
      if (existingIdx !== -1) {
        setQueueIndex(existingIdx);
      } else {
        const updated = [cleanSong, ...queue];
        setQueue(updated);
        setQueueIndex(0);
      }
    }

    await loadAndPlay(cleanSong);
  };

  const togglePlay = () => {
    if (!decksRef.current || !currentSong) return;
    const cf = crossfadeRef.current;

    if (cf.active) {
      const outgoing = decksRef.current[cf.outgoingDeckId];
      const incoming = decksRef.current[cf.incomingDeckId];
      if (!cf.paused) {
        cf.paused = true;
        cf.lastFrameMs = null;
        outgoing.audio.pause();
        incoming.audio.pause();
        setIsPlaying(false);
      } else {
        cf.paused = false;
        cf.lastFrameMs = performance.now();
        outgoing.audio.play().catch(console.error);
        incoming.audio.play().catch(console.error);
        setIsPlaying(true);
      }
      return;
    }

    const activeAudio = decksRef.current[activeDeckRef.current].audio;
    if (isPlaying) {
      activeAudio.pause();
    } else {
      activeAudio.play().catch(console.error);
    }
  };

  const nextSong = () => {
    cancelCrossfadeAndPreload();
    if (queue.length === 0) return;

    let nextIdx = queueIndex + 1;
    if (isShuffle) {
      if (queue.length > 1) {
        nextIdx = Math.floor(Math.random() * queue.length);
        if (nextIdx === queueIndex) {
          nextIdx = (queueIndex + 1) % queue.length;
        }
      } else {
        nextIdx = 0;
      }
    } else if (nextIdx >= queue.length) {
      nextIdx = 0;
    }

    setQueueIndex(nextIdx);
    loadAndPlay(queue[nextIdx]);
  };

  const prevSong = () => {
    cancelCrossfadeAndPreload();
    if (!decksRef.current || queue.length === 0) return;

    const activeAudio = decksRef.current[activeDeckRef.current].audio;
    if (activeAudio.currentTime > 3) {
      activeAudio.currentTime = 0;
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }
    setQueueIndex(prevIdx);
    loadAndPlay(queue[prevIdx]);
  };

  const getCurrentTime = useCallback(() => {
    return audioRef.current?.currentTime ?? 0;
  }, []);

  const seek = useCallback(
    (timeSec: number) => {
      if (!decksRef.current) return;
      const activeAudio = decksRef.current[activeDeckRef.current].audio;

      if (crossfadeRef.current.active) {
        cancelCrossfade();
      }

      activeAudio.currentTime = timeSec;
      activeAudio.volume = getMasterGain();

      const dur = activeAudio.duration;
      const cfSec = getEffectiveCrossfadeSec();
      if (Number.isFinite(dur) && (dur - timeSec > cfSec + PRELOAD_LEAD_SECONDS + 1 || dur - timeSec <= 0.4)) {
        clearStandbyPreload();
      }
    },
    [cancelCrossfade, clearStandbyPreload, getEffectiveCrossfadeSec, getMasterGain]
  );

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    volumeRef.current = clamped;
    isMutedRef.current = clamped === 0;
    setVolumeState(clamped);
    setIsMuted(clamped === 0);

    if (!decksRef.current) return;

    if (crossfadeRef.current.active) {
      const cf = crossfadeRef.current;
      const progress = cf.durationMs > 0 ? cf.elapsedMs / cf.durationMs : 0;
      applyCrossfadeVolumes(progress);

      if (settingsRef.current.pauseWhenMuted) {
        const outgoing = decksRef.current[cf.outgoingDeckId];
        const incoming = decksRef.current[cf.incomingDeckId];
        if (clamped === 0 && !cf.paused) {
          pausedByMuteRef.current = true;
          cf.paused = true;
          cf.lastFrameMs = null;
          outgoing.audio.pause();
          incoming.audio.pause();
          setIsPlaying(false);
        } else if (clamped > 0 && pausedByMuteRef.current && cf.paused) {
          pausedByMuteRef.current = false;
          cf.paused = false;
          cf.lastFrameMs = performance.now();
          outgoing.audio.play().catch(console.error);
          incoming.audio.play().catch(console.error);
          setIsPlaying(true);
        }
      }
      return;
    }

    const activeAudio = decksRef.current[activeDeckRef.current].audio;
    activeAudio.volume = getMasterGain();
    activeAudio.muted = clamped === 0;
    if (settingsRef.current.pauseWhenMuted) {
      if (clamped === 0 && !activeAudio.paused) {
        pausedByMuteRef.current = true;
        activeAudio.pause();
      } else if (clamped > 0 && pausedByMuteRef.current) {
        pausedByMuteRef.current = false;
        activeAudio.play().catch(console.error);
      }
    }
  };

  const toggleMute = () => {
    if (!decksRef.current) return;
    const newMuted = !isMuted;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    if (crossfadeRef.current.active) {
      const cf = crossfadeRef.current;
      const progress = cf.durationMs > 0 ? cf.elapsedMs / cf.durationMs : 0;
      applyCrossfadeVolumes(progress);

      if (settingsRef.current.pauseWhenMuted) {
        const outgoing = decksRef.current[cf.outgoingDeckId];
        const incoming = decksRef.current[cf.incomingDeckId];
        if (newMuted && !cf.paused) {
          pausedByMuteRef.current = true;
          cf.paused = true;
          cf.lastFrameMs = null;
          outgoing.audio.pause();
          incoming.audio.pause();
          setIsPlaying(false);
        } else if (!newMuted && pausedByMuteRef.current && cf.paused) {
          pausedByMuteRef.current = false;
          cf.paused = false;
          cf.lastFrameMs = performance.now();
          outgoing.audio.play().catch(console.error);
          incoming.audio.play().catch(console.error);
          setIsPlaying(true);
        }
      }
      return;
    }

    const activeAudio = decksRef.current[activeDeckRef.current].audio;
    activeAudio.muted = newMuted;
    activeAudio.volume = getMasterGain();
    if (settingsRef.current.pauseWhenMuted) {
      if (newMuted && !activeAudio.paused) {
        pausedByMuteRef.current = true;
        activeAudio.pause();
      } else if (!newMuted && pausedByMuteRef.current) {
        pausedByMuteRef.current = false;
        activeAudio.play().catch(console.error);
      }
    }
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
    window.dispatchEvent(new CustomEvent("tay-likes-changed"));
  };

  const addToQueue = (song: Song) => {
    setQueue((prev) => [...prev, song]);
  };

  const resumePlayback = async () => {
    if (resumeData?.song) {
      const targetTime = resumeData.currentTime;
      await loadAndPlay(resumeData.song);
      if (targetTime > 0) {
        setTimeout(() => seek(targetTime), 300);
      }
    }
  };

  const openQuickSwitch = useCallback((song: Song, playlistId?: string | null) => {
    setQuickSwitchTarget({ song, playlistId });
  }, []);

  const closeQuickSwitch = useCallback(() => {
    setQuickSwitchTarget(null);
  }, []);

  const replaceSongVersion = useCallback(
    async (
      oldSongId: string,
      rawNewSong: Song,
      playlistId?: string | null,
      autoPlay = true
    ) => {
      const targetId = ((rawNewSong as any)?.videoId || rawNewSong?.id || "").trim();
      if (!isValidTrackId(targetId)) {
        throw new Error(`Invalid replacement trackId: "${targetId}"`);
      }
      const newSong: Song = {
        ...rawNewSong,
        id: targetId,
        videoId: targetId,
      };
      const effectivePlaylistId = playlistId ?? activePlaylistIdRef.current;

      if (window.mochyApi) {
        await window.mochyApi.upsertSong(newSong);
        if (effectivePlaylistId) {
          try {
            await window.mochyApi.replacePlaylistSong(effectivePlaylistId, oldSongId, newSong);
          } catch (err) {
            console.warn("[PlayerContext] replacePlaylistSong warning:", err);
          }
        }
        try {
          const wasLiked = await window.mochyApi.isLiked(oldSongId);
          if (wasLiked) {
            await window.mochyApi.setLiked(newSong.id, true, newSong);
          }
        } catch (err) {
          console.warn("[PlayerContext] preserve liked warning:", err);
        }
      }

      setQueue((prev) => prev.map((s) => (s.id === oldSongId ? newSong : s)));
      setLastSwitchedVersion({
        oldId: oldSongId,
        newSong,
        playlistId: effectivePlaylistId,
        ts: Date.now(),
      });

      if (autoPlay || currentSongRef.current?.id === oldSongId) {
        await loadAndPlay(newSong);
      }
    },
    [loadAndPlay]
  );

  const contextValue = useMemo<PlayerContextType>(
    () => ({
      audioRef,
      activeDeck,
      isCrossfading,
      currentSong,
      isPlaying,
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
      isLyricsOpen,
      isQueueOpen,
      rightDrawerTab,
      isFullscreenPlayerOpen,
      fullscreenTab,
      settings,
      error,
      accentColor,
      streamInfo,
      resumeData,
      quickSwitchTarget,
      lastSwitchedVersion,
      activePlaylistId,

      getCurrentTime,
      playSong,
      resumePlayback,
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
      setRightDrawerTab,
      toggleRightDrawer,
      setIsFullscreenPlayerOpen,
      setFullscreenTab,
      updateSettings,
      addToQueue,
      setActivePlaylistId,
      openQuickSwitch,
      closeQuickSwitch,
      replaceSongVersion,
    }),
    [
      activeDeck,
      isCrossfading,
      currentSong,
      isPlaying,
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
      isLyricsOpen,
      isQueueOpen,
      rightDrawerTab,
      isFullscreenPlayerOpen,
      fullscreenTab,
      settings,
      error,
      accentColor,
      streamInfo,
      resumeData,
      quickSwitchTarget,
      lastSwitchedVersion,
      activePlaylistId,
      getCurrentTime,
      seek,
      setIsLyricsOpen,
      setIsQueueOpen,
      toggleRightDrawer,
      updateSettings,
      openQuickSwitch,
      closeQuickSwitch,
      replaceSongVersion,
    ]
  );

  return (
    <PlayerContext.Provider value={contextValue}>
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
