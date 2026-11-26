// src/renderer/components/LyricsView.tsx

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, Mic2, Disc } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import type { LyricsData, LyricsLine, Song } from "../types.ts";

const DEFAULT_LYRIC_LOOKAHEAD_SEC = 1.0;
const LYRIC_OFFSET_STEP_SEC = 0.5;
const LYRIC_OFFSET_STORAGE_PREFIX = "tay_music_lyric_offset:";

function getSongOffsetStorageKey(song?: Song | null): string | null {
  if (!song) return null;
  const vid = (song.videoId || song.id || "").trim();
  if (vid) return `${LYRIC_OFFSET_STORAGE_PREFIX}${vid}`;
  const artists = song.artists?.map((a) => a.name).join(",") || "";
  const fallback = `${song.title || ""}::${artists}`.trim().toLowerCase();
  return fallback ? `${LYRIC_OFFSET_STORAGE_PREFIX}${fallback}` : null;
}

function readSongOffset(song?: Song | null): number {
  const key = getSongOffsetStorageKey(song);
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

function saveSongOffset(song: Song | null | undefined, offsetSec: number): void {
  const key = getSongOffsetStorageKey(song);
  if (!key) return;
  try {
    const rounded = Math.round(offsetSec * 10) / 10;
    if (rounded === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(rounded));
    }
  } catch {}
}

function formatOffsetLabel(offsetSec: number): string {
  const rounded = Math.round(offsetSec * 10) / 10;
  if (rounded === 0) return "+0.0s";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}s`;
}

interface LyricsViewProps {
  variant?: "drawer" | "fullscreen";
  isMainStageView?: boolean;
  onClose?: () => void;
}

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * O(log N) binary search for the active lyric line matching currentTimeMs.
 */
function binarySearchLineIndex(lines: LyricsLine[], currentTimeMs: number): number {
  if (lines.length === 0) return -1;
  let low = 0;
  let high = lines.length - 1;
  let foundIdx = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].time <= currentTimeMs) {
      foundIdx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return foundIdx;
}

/**
 * Compute character reveal count for typewriter effect within the active lyric line.
 */
function computeTypedCharCount(
  lines: LyricsLine[],
  lineIdx: number,
  currentTimeMs: number
): number {
  if (lineIdx < 0 || lineIdx >= lines.length) return 0;
  const curLine = lines[lineIdx];
  const totalChars = curLine.text.length;
  if (totalChars === 0) return 0;

  const nextLine = lines[lineIdx + 1];
  const startMs = curLine.time;
  const nextMs = nextLine ? nextLine.time : startMs + 4500;
  const lineDurationMs = Math.max(800, nextMs - startMs);

  const elapsedMs = Math.max(0, currentTimeMs - startMs);
  // Finish typing 15-20% before the next line starts (82% window, capped at 4.5s)
  const typingDuration = Math.max(450, Math.min(lineDurationMs * 0.82, 4500));
  const ratio = Math.min(1, elapsedMs / typingDuration);

  return Math.max(1, Math.min(totalChars, Math.ceil(ratio * totalChars)));
}

interface LyricLineRowProps {
  line: LyricsLine;
  status: "past" | "active" | "future";
  variant: "drawer" | "fullscreen";
  showCaret: boolean;
  activeLineRef?: React.RefObject<HTMLButtonElement | null>;
  activeTextRef?: React.RefObject<HTMLSpanElement | null>;
  onLineClick: (timeMs: number) => void;
}

const LyricLineRow = React.memo<LyricLineRowProps>(
  ({ line, status, variant, showCaret, activeLineRef, activeTextRef, onLineClick }) => {
    const activeTextSize =
      variant === "fullscreen"
        ? "text-2xl lg:text-3xl xl:text-[34px] font-bold leading-[1.32]"
        : "text-[18px] sm:text-[20px] font-bold leading-[1.4]";

    const inactiveTextSize =
      variant === "fullscreen"
        ? "text-xl lg:text-2xl xl:text-[28px] font-bold leading-[1.35]"
        : "text-[16px] sm:text-[17px] font-semibold leading-[1.45]";

    if (status === "active") {
      return (
        <button
          type="button"
          ref={activeLineRef}
          onClick={() => onLineClick(line.time)}
          style={{ transform: "translate3d(0, 0, 0)", willChange: "transform, opacity" }}
          className={`w-full text-left block rounded-2xl bg-white/[0.07] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-200 cursor-pointer group ${
            variant === "fullscreen" ? "py-3.5 px-5 my-4" : "py-2.5 px-3.5 my-2.5"
          }`}
          title="Nhấp để phát lại câu này"
        >
          <div className={`relative text-white tracking-tight ${activeTextSize}`}>
            {/* Invisible spacer reserves exact final wrapped height so zero layout reflow occurs while typing */}
            <p className="invisible pointer-events-none select-none" aria-hidden="true">
              <span>{line.text || "\u00A0"}</span>
              {showCaret && <span className="blinking-block-cursor" />}
            </p>
            {/* GPU/DOM-direct typewriter layer updated via ref inside rAF */}
            <p className="absolute inset-0">
              <span ref={activeTextRef} />
              {showCaret && <span className="blinking-block-cursor" />}
            </p>
          </div>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onLineClick(line.time)}
        style={{ transform: "translate3d(0, 0, 0)" }}
        className={`w-full text-left block rounded-xl transition-all duration-150 cursor-pointer tracking-tight ${
          variant === "fullscreen" ? "py-1.5 px-3" : "py-1 px-2"
        } ${inactiveTextSize} ${
          status === "past"
            ? "text-white/30 hover:text-white/75"
            : "text-white/35 hover:text-white/80"
        }`}
        title="Nhấp để tua đến câu hát này"
      >
        <span>{line.text}</span>
      </button>
    );
  }
);

LyricLineRow.displayName = "LyricLineRow";

export const LyricsView: React.FC<LyricsViewProps> = ({
  variant = "drawer",
  isMainStageView = false,
  onClose,
}) => {
  const {
    audioRef,
    activeDeck,
    currentSong,
    lyricsData,
    seek,
    setIsLyricsOpen,
    isPlaying,
    settings,
  } = usePlayer();

  const isLyricFrameOpen = true;
  const typewriterEnabledRef = useRef<boolean>(settings.typewriterLyrics);
  useEffect(() => {
    typewriterEnabledRef.current = settings.typewriterLyrics;
    lastCharCountRef.current = -1;
    syncNowRef.current?.();
  }, [settings.typewriterLyrics]);

  const lines = useMemo(
    () => lyricsData?.parsed?.lines ?? [],
    [lyricsData?.parsed?.lines]
  );
  const isSynced = Boolean(lyricsData?.parsed?.isSynced && lines.length > 0);

  const [userOffset, setUserOffset] = useState<number>(() => readSongOffset(currentSong));
  const userOffsetRef = useRef<number>(userOffset);

  // State only changes when the active line index jumps to a new sentence (zero per-char or per-frame setState)
  const [activeLyricsIndex, setActiveLyricsIndex] = useState<number>(() => {
    if (isSynced && lines.length > 0) {
      const curSec = audioRef.current?.currentTime ?? 0;
      const effectiveMs = (curSec + DEFAULT_LYRIC_LOOKAHEAD_SEC + readSongOffset(currentSong)) * 1000;
      return binarySearchLineIndex(lines, effectiveMs);
    }
    return -1;
  });

  // DOM Refs for direct zero-re-render mutations
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const activeTextRef = useRef<HTMLSpanElement | null>(null);
  const staticTextRef = useRef<HTMLSpanElement | null>(null);
  const headerTimeRef = useRef<HTMLSpanElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement | null>(null);

  // Sync tracking refs
  const activeIndexRef = useRef<number>(activeLyricsIndex);
  const renderedActiveIndexRef = useRef<number>(activeLyricsIndex);
  const lastCharCountRef = useRef<number>(-1);
  const lastHeaderSecRef = useRef<number>(-1);
  const staticFloatIdxRef = useRef<number>(0);
  const prevSongIdRef = useRef<string | undefined>(undefined);
  const prevLyricsObjRef = useRef<LyricsData | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  // GPU Scroll coordinates (pure transform: translate3d, zero scrollTop reflows)
  const currentYRef = useRef<number>(0);
  const targetYRef = useRef<number>(0);
  const activeTargetYRef = useRef<number>(0);
  const lastAppliedYRef = useRef<number>(-1);
  const viewportHeightRef = useRef<number>(0);
  const listHeightRef = useRef<number>(0);
  const maxScrollRef = useRef<number>(0);
  const lastThumbHeightRef = useRef<number>(-1);
  const manualScrollUntilRef = useRef<number>(0);
  const snapNextScrollRef = useRef<boolean>(true);
  const settleRafIdRef = useRef<number | null>(null);
  const syncNowRef = useRef<(() => void) | null>(null);

  const applyScrollTransform = useCallback((y: number) => {
    const clampedY = Math.max(0, Math.min(maxScrollRef.current, y));
    currentYRef.current = clampedY;
    lastAppliedYRef.current = clampedY;

    if (listRef.current) {
      listRef.current.style.transform = `translate3d(0px, ${-clampedY}px, 0px)`;
    }

    if (scrollbarTrackRef.current && scrollbarThumbRef.current) {
      const maxScroll = maxScrollRef.current;
      const vh = viewportHeightRef.current;
      const lh = listHeightRef.current;

      if (maxScroll <= 0 || vh <= 0 || lh <= 0) {
        scrollbarTrackRef.current.style.opacity = "0";
        scrollbarTrackRef.current.style.pointerEvents = "none";
      } else {
        const thumbH = Math.max(28, (vh / lh) * vh);
        const maxThumbY = Math.max(0, vh - thumbH);
        const thumbY = (clampedY / maxScroll) * maxThumbY;

        scrollbarTrackRef.current.style.opacity = "1";
        scrollbarTrackRef.current.style.pointerEvents = "auto";

        if (Math.abs(thumbH - lastThumbHeightRef.current) >= 0.5) {
          lastThumbHeightRef.current = thumbH;
          scrollbarThumbRef.current.style.height = `${thumbH}px`;
        }
        scrollbarThumbRef.current.style.transform = `translate3d(0px, ${thumbY}px, 0px)`;
      }
    }
  }, []);

  const startSettleGlide = useCallback(() => {
    if (settleRafIdRef.current !== null) return;
    let lastTs = performance.now();

    const settleStep = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const diff = targetYRef.current - currentYRef.current;

      if (Math.abs(diff) < 0.35) {
        applyScrollTransform(targetYRef.current);
        settleRafIdRef.current = null;
        return;
      }

      const alpha = 1 - Math.exp(-15 * dt);
      applyScrollTransform(currentYRef.current + diff * alpha);
      settleRafIdRef.current = requestAnimationFrame(settleStep);
    };

    settleRafIdRef.current = requestAnimationFrame(settleStep);
  }, [applyScrollTransform]);

  const measureLayout = useCallback(() => {
    const vh = viewportRef.current?.clientHeight ?? 0;
    const lh = listRef.current?.scrollHeight ?? 0;
    viewportHeightRef.current = vh;
    listHeightRef.current = lh;
    maxScrollRef.current = Math.max(0, lh - vh);

    if (activeLineRef.current && vh > 0) {
      const lineTop = activeLineRef.current.offsetTop;
      const lineH = activeLineRef.current.offsetHeight;
      const rawCenterY = lineTop + lineH / 2 - vh / 2;
      activeTargetYRef.current = Math.max(0, Math.min(maxScrollRef.current, rawCenterY));
    } else {
      activeTargetYRef.current = 0;
    }

    targetYRef.current = Math.max(0, Math.min(maxScrollRef.current, targetYRef.current));
    applyScrollTransform(currentYRef.current);
  }, [applyScrollTransform]);

  // Observe viewport & list resize without polling layout dimensions inside rAF
  useEffect(() => {
    const viewportEl = viewportRef.current;
    const listEl = listRef.current;
    if (!viewportEl || !listEl) return;

    const ro = new ResizeObserver(() => {
      measureLayout();
    });
    ro.observe(viewportEl);
    ro.observe(listEl);

    return () => ro.disconnect();
  }, [measureLayout, currentSong?.id, lyricsData]);

  // Synchronously handle song/lyrics transitions, initial scroll positioning, and pre-paint active text
  useLayoutEffect(() => {
    const isInitialMount = !hasInitializedRef.current;
    hasInitializedRef.current = true;
    const songChanged = !isInitialMount && prevSongIdRef.current !== currentSong?.id;
    const lyricsChanged = !isInitialMount && prevLyricsObjRef.current !== lyricsData;

    if (isInitialMount || songChanged || lyricsChanged) {
      prevSongIdRef.current = currentSong?.id;
      prevLyricsObjRef.current = lyricsData;

      const loadedOffset = songChanged || isInitialMount ? readSongOffset(currentSong) : userOffsetRef.current;
      if (songChanged || isInitialMount) {
        userOffsetRef.current = loadedOffset;
        setUserOffset(loadedOffset);
      }

      const curSec = songChanged ? 0 : (audioRef.current?.currentTime ?? 0);
      const effectiveMs = (curSec + DEFAULT_LYRIC_LOOKAHEAD_SEC + loadedOffset) * 1000;
      const initIdx =
        isSynced && lines.length > 0 ? binarySearchLineIndex(lines, effectiveMs) : -1;

      activeIndexRef.current = initIdx;
      lastCharCountRef.current = -1;
      manualScrollUntilRef.current = 0;
      snapNextScrollRef.current = true;
      staticFloatIdxRef.current =
        !isSynced && lyricsData?.lyrics
          ? typewriterEnabledRef.current
            ? Math.min(lyricsData.lyrics.length, Math.floor(curSec * 25))
            : lyricsData.lyrics.length
          : 0;

      if (headerTimeRef.current) {
        lastHeaderSecRef.current = Math.floor(curSec);
        headerTimeRef.current.textContent = formatSeconds(curSec);
      }

      if (!isSynced && lyricsData?.lyrics && staticTextRef.current) {
        const initChars = Math.floor(staticFloatIdxRef.current);
        lastCharCountRef.current = initChars;
        staticTextRef.current.textContent = lyricsData.lyrics.slice(0, initChars);
      }

      if (initIdx !== activeLyricsIndex) {
        setActiveLyricsIndex(initIdx);
        return;
      }
    }

    renderedActiveIndexRef.current = activeLyricsIndex;
    measureLayout();

    if (performance.now() >= manualScrollUntilRef.current && isSynced) {
      targetYRef.current = activeTargetYRef.current;
    }

    if (snapNextScrollRef.current) {
      snapNextScrollRef.current = false;
      applyScrollTransform(targetYRef.current);
    } else if (!isPlaying && Math.abs(targetYRef.current - currentYRef.current) >= 0.5) {
      startSettleGlide();
    }

    if (
      isSynced &&
      activeLyricsIndex >= 0 &&
      activeLyricsIndex < lines.length &&
      activeTextRef.current
    ) {
      const curSec = songChanged ? 0 : (audioRef.current?.currentTime ?? 0);
      const effectiveMs = (curSec + DEFAULT_LYRIC_LOOKAHEAD_SEC + userOffsetRef.current) * 1000;
      const charsToShow = typewriterEnabledRef.current
        ? computeTypedCharCount(lines, activeLyricsIndex, effectiveMs)
        : lines[activeLyricsIndex].text.length;
      lastCharCountRef.current = charsToShow;
      activeTextRef.current.textContent = lines[activeLyricsIndex].text.slice(0, charsToShow);
    }
  }, [
    currentSong?.id,
    lyricsData,
    activeLyricsIndex,
    isSynced,
    lines,
    isPlaying,
    audioRef,
    measureLayout,
    applyScrollTransform,
    startSettleGlide,
  ]);

  // Cancel any paused wheel settle loop on unmount
  useEffect(() => {
    return () => {
      if (settleRafIdRef.current !== null) {
        cancelAnimationFrame(settleRafIdRef.current);
        settleRafIdRef.current = null;
      }
    };
  }, []);

  // Main 60fps requestAnimationFrame loop: runs ONLY when isPlaying === true AND lyric frame is open
  useEffect(() => {
    const audio = audioRef.current;

    const syncFrame = (nowMs: number, dtSec: number) => {
      const curSec = audioRef.current?.currentTime ?? 0;

      // Update header clock once per second via direct DOM ref
      const wholeSec = Math.floor(curSec);
      if (wholeSec !== lastHeaderSecRef.current && headerTimeRef.current) {
        lastHeaderSecRef.current = wholeSec;
        headerTimeRef.current.textContent = formatSeconds(curSec);
      }

      if (isSynced && lines.length > 0) {
        const effectiveMs = (curSec + DEFAULT_LYRIC_LOOKAHEAD_SEC + userOffsetRef.current) * 1000;
        const nextIdx = binarySearchLineIndex(lines, effectiveMs);

        if (nextIdx !== activeIndexRef.current) {
          activeIndexRef.current = nextIdx;
          lastCharCountRef.current = -1;
          setActiveLyricsIndex(nextIdx);
        } else if (
          nextIdx === renderedActiveIndexRef.current &&
          nextIdx >= 0 &&
          nextIdx < lines.length &&
          activeTextRef.current
        ) {
          const charsToShow = typewriterEnabledRef.current
            ? computeTypedCharCount(lines, nextIdx, effectiveMs)
            : lines[nextIdx].text.length;
          if (charsToShow !== lastCharCountRef.current) {
            lastCharCountRef.current = charsToShow;
            activeTextRef.current.textContent = lines[nextIdx].text.slice(0, charsToShow);
          }
        }

        // Release auto-scroll override once manual wheel cooldown expires
        if (nowMs >= manualScrollUntilRef.current) {
          targetYRef.current = activeTargetYRef.current;
        }
      } else if (!isSynced && lyricsData?.lyrics && staticTextRef.current) {
        const fullLen = lyricsData.lyrics.length;
        if (!typewriterEnabledRef.current) {
          if (lastCharCountRef.current !== fullLen) {
            staticFloatIdxRef.current = fullLen;
            lastCharCountRef.current = fullLen;
            staticTextRef.current.textContent = lyricsData.lyrics;
          }
        } else if (dtSec > 0 && staticFloatIdxRef.current < fullLen) {
          staticFloatIdxRef.current = Math.min(fullLen, staticFloatIdxRef.current + (dtSec * 1000) / 40);
          const chars = Math.floor(staticFloatIdxRef.current);
          if (chars !== lastCharCountRef.current) {
            lastCharCountRef.current = chars;
            staticTextRef.current.textContent = lyricsData.lyrics.slice(0, chars);
          }
        }
      }

      // Smooth frame-rate-independent lerp toward targetY using GPU translate3d
      const diff = targetYRef.current - currentYRef.current;
      if (Math.abs(diff) >= 0.15) {
        const lerpAlpha = dtSec > 0 ? 1 - Math.exp(-9.5 * dtSec) : 1;
        const nextY = currentYRef.current + diff * lerpAlpha;
        if (Math.abs(nextY - lastAppliedYRef.current) >= 0.08) {
          applyScrollTransform(nextY);
        }
      } else if (Math.abs(targetYRef.current - lastAppliedYRef.current) >= 0.08) {
        applyScrollTransform(targetYRef.current);
      }
    };

    const handleAudioSeek = () => {
      manualScrollUntilRef.current = 0;
      lastCharCountRef.current = -1;
      syncFrame(performance.now(), 0);
    };

    syncNowRef.current = () => {
      syncFrame(performance.now(), 0);
    };

    if (audio) {
      audio.addEventListener("seeking", handleAudioSeek);
      audio.addEventListener("seeked", handleAudioSeek);
      audio.addEventListener("loadedmetadata", handleAudioSeek);
    }

    // Sync immediately on effect setup so state stays fresh while paused
    syncFrame(performance.now(), 0);

    if (!isPlaying || !isLyricFrameOpen || !currentSong) {
      return () => {
        syncNowRef.current = null;
        if (audio) {
          audio.removeEventListener("seeking", handleAudioSeek);
          audio.removeEventListener("seeked", handleAudioSeek);
          audio.removeEventListener("loadedmetadata", handleAudioSeek);
        }
      };
    }

    // Playback started: hand off any paused settle glide to the main rAF loop
    if (settleRafIdRef.current !== null) {
      cancelAnimationFrame(settleRafIdRef.current);
      settleRafIdRef.current = null;
    }

    let rafId: number | null = null;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      if (!document.hidden) {
        syncFrame(now, dtSec);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      syncNowRef.current = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (audio) {
        audio.removeEventListener("seeking", handleAudioSeek);
        audio.removeEventListener("seeked", handleAudioSeek);
        audio.removeEventListener("loadedmetadata", handleAudioSeek);
      }
    };
  }, [
    isPlaying,
    isLyricFrameOpen,
    currentSong,
    isSynced,
    lines,
    lyricsData?.lyrics,
    audioRef,
    activeDeck,
    applyScrollTransform,
  ]);

  // Manual mouse-wheel scrolling: yields auto-scroll gracefully with zero conflict
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (maxScrollRef.current <= 0) return;

      const delta =
        e.deltaMode === 1
          ? e.deltaY * 32
          : e.deltaMode === 2
          ? e.deltaY * (viewportHeightRef.current || 400)
          : e.deltaY;

      manualScrollUntilRef.current = performance.now() + 2800;
      targetYRef.current = Math.max(
        0,
        Math.min(maxScrollRef.current, targetYRef.current + delta)
      );

      // When paused (main rAF loop inactive), run brief self-terminating coast animation
      if (!isPlaying) {
        startSettleGlide();
      }
    },
    [isPlaying, startSettleGlide]
  );

  // GPU scrollbar track click & drag handler
  const handleScrollbarPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const trackEl = scrollbarTrackRef.current;
      const thumbEl = scrollbarThumbRef.current;
      if (!trackEl || !thumbEl || maxScrollRef.current <= 0) return;

      const trackRect = trackEl.getBoundingClientRect();
      const thumbRect = thumbEl.getBoundingClientRect();
      const thumbH = thumbRect.height || 28;
      const scrollableTrack = Math.max(1, trackRect.height - thumbH);

      const grabbedThumb =
        e.clientY >= thumbRect.top && e.clientY <= thumbRect.bottom;
      const grabOffset = grabbedThumb ? e.clientY - thumbRect.top : thumbH / 2;

      const updateFromClientY = (clientY: number) => {
        manualScrollUntilRef.current = performance.now() + 2800;
        const rawThumbY = clientY - trackRect.top - grabOffset;
        const ratio = Math.max(0, Math.min(1, rawThumbY / scrollableTrack));
        const nextY = ratio * maxScrollRef.current;
        targetYRef.current = nextY;
        applyScrollTransform(nextY);
      };

      updateFromClientY(e.clientY);

      const onMove = (ev: PointerEvent) => updateFromClientY(ev.clientY);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyScrollTransform]
  );

  const updateUserOffset = useCallback(
    (nextRaw: number) => {
      const next = Math.round(nextRaw * 10) / 10;
      userOffsetRef.current = next;
      setUserOffset(next);
      saveSongOffset(currentSong, next);
      manualScrollUntilRef.current = 0;
      lastCharCountRef.current = -1;
      snapNextScrollRef.current = false;
      syncNowRef.current?.();
    },
    [currentSong]
  );

  const handleLineClick = useCallback(
    (timeMs: number) => {
      manualScrollUntilRef.current = 0;
      lastCharCountRef.current = -1;
      snapNextScrollRef.current = false;
      seek(Math.max(0, timeMs / 1000 - DEFAULT_LYRIC_LOOKAHEAD_SEC - userOffsetRef.current));
    },
    [seek]
  );

  if (!currentSong) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-white/50 font-sans select-none">
        <Disc className="w-10 h-10 mb-3 opacity-30 animate-spin" />
        <p className="text-sm font-semibold text-white">Chưa phát bài hát nào</p>
        <p className="text-xs text-white/50 mt-1">Chọn một bài hát để xem lời bài hát đồng bộ</p>
      </div>
    );
  }

  const handleClose = () => {
    if (onClose) onClose();
    setIsLyricsOpen(false);
  };

  return (
    <div
      className={`flex flex-col select-none overflow-hidden font-sans bg-transparent flex-1 min-h-0 ${
        isMainStageView ? "w-full h-full" : ""
      }`}
    >
      {/* Glass Header with Sync Offset Pill */}
      <div
        className={`flex items-center justify-between gap-2 flex-shrink-0 z-20 ${
          variant === "fullscreen" ? "px-6 pt-2 pb-3" : "px-5 pt-2 pb-2.5"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3
            className={`font-semibold text-white tracking-tight ${
              variant === "fullscreen" ? "text-base" : "text-[15px]"
            }`}
          >
            Lyrics
          </h3>
          <span
            ref={headerTimeRef}
            className="text-[11px] font-mono text-white/40 tabular-nums"
          >
            00:00
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isSynced && (
            <div
              className={`flex items-center rounded-full bg-white/[0.08] border transition-colors ${
                userOffset !== 0 ? "border-white/25" : "border-white/[0.10]"
              }`}
              title="Chỉnh độ lệch thời gian lời bài hát (Mặc định +1.0s)"
            >
              <button
                type="button"
                onClick={() => updateUserOffset(userOffset - LYRIC_OFFSET_STEP_SEC)}
                title="Lùi lời -0.5s"
                className="px-2 py-0.5 text-[11px] font-mono font-medium text-white/65 hover:text-white hover:bg-white/[0.08] rounded-l-full transition-colors cursor-pointer"
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={() => updateUserOffset(0)}
                title={
                  userOffset !== 0
                    ? "Nhấn để đặt lại độ trễ về 0s"
                    : "Độ trễ người dùng đang ở 0.0s (Bù mặc định +1.0s)"
                }
                className={`px-1.5 py-0.5 text-[11px] font-mono font-semibold tabular-nums transition-colors cursor-pointer ${
                  userOffset === 0
                    ? "text-white/45 hover:text-white/80"
                    : userOffset > 0
                    ? "text-emerald-400 hover:text-white"
                    : "text-amber-400 hover:text-white"
                }`}
              >
                {formatOffsetLabel(userOffset)}
              </button>
              <button
                type="button"
                onClick={() => updateUserOffset(userOffset + LYRIC_OFFSET_STEP_SEC)}
                title="Đẩy lời +0.5s"
                className="px-2 py-0.5 text-[11px] font-mono font-medium text-white/65 hover:text-white hover:bg-white/[0.08] rounded-r-full transition-colors cursor-pointer"
              >
                +0.5s
              </button>
            </div>
          )}

          {lyricsData?.provider && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.07] text-white/60 border border-white/[0.08] whitespace-nowrap">
              {lyricsData.provider}
            </span>
          )}

          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              title="Đóng lời bài hát (Esc)"
              className="p-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-white/70 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* GPU-Accelerated Clipped Viewport */}
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        className="flex-1 overflow-hidden relative"
      >
        {/* Lyrics Container translated strictly on GPU via transform: translate3d(...) */}
        <div
          ref={listRef}
          style={{
            transform: "translate3d(0px, 0px, 0px)",
            willChange: "transform",
          }}
          className={
            variant === "fullscreen"
              ? "px-6 md:px-10 py-14 space-y-4 relative"
              : "px-5 py-10 space-y-2.5 relative"
          }
        >
          {isSynced ? (
            /* SYNCED LRC TYPEWRITER VIEW */
            lines.map((line, idx) => {
              const status: "past" | "active" | "future" =
                idx === activeLyricsIndex
                  ? "active"
                  : idx < activeLyricsIndex
                  ? "past"
                  : "future";

              return (
                <LyricLineRow
                  key={`${line.time}-${idx}`}
                  line={line}
                  status={status}
                  variant={variant}
                  showCaret={settings.typewriterLyrics}
                  activeLineRef={status === "active" ? activeLineRef : undefined}
                  activeTextRef={status === "active" ? activeTextRef : undefined}
                  onLineClick={handleLineClick}
                />
              );
            })
          ) : lyricsData?.lyrics ? (
            /* STATIC LYRICS TYPEWRITER FALLBACK (Zero setState per char) */
            <div className="py-4 px-4 rounded-2xl bg-white/[0.05] border border-white/[0.08] space-y-2">
              <div className="relative text-white/90 text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                <p className="invisible pointer-events-none select-none" aria-hidden="true">
                  <span>{lyricsData.lyrics}</span>
                  {settings.typewriterLyrics && <span className="blinking-block-cursor" />}
                </p>
                <p className="absolute inset-0">
                  <span ref={staticTextRef} />
                  {settings.typewriterLyrics && <span className="blinking-block-cursor" />}
                </p>
              </div>
            </div>
          ) : (
            /* NO LYRICS FOUND OR LOADING */
            <div className="h-full flex flex-col items-center justify-center text-center py-20 text-white/45">
              <Mic2 className="w-9 h-9 mb-3 opacity-40" />
              <p className="text-sm font-semibold text-white/80">
                {lyricsData ? "Chưa tìm thấy lời bài hát" : "Đang tìm lời bài hát..."}
              </p>
              <p className="text-xs text-white/45 mt-1">
                Tự động đồng bộ từ LrcLib, KuGou và NetEase
              </p>
            </div>
          )}
        </div>

        {/* Custom GPU-Composited Thin macOS Scrollbar */}
        <div
          ref={scrollbarTrackRef}
          onPointerDown={handleScrollbarPointerDown}
          style={{ opacity: 0, pointerEvents: "none" }}
          className="absolute top-1 right-1 bottom-1 w-[5px] bg-transparent z-30 transition-opacity duration-150 cursor-pointer group/sb"
        >
          <div
            ref={scrollbarThumbRef}
            style={{
              height: "40px",
              transform: "translate3d(0px, 0px, 0px)",
              willChange: "transform",
            }}
            className="w-full rounded-full bg-white/25 group-hover/sb:bg-white/45 transition-colors duration-150"
          />
        </div>
      </div>
    </div>
  );
};
