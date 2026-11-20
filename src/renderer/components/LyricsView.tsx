// src/renderer/components/LyricsView.tsx

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { X, Mic2, Disc } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import type { LyricsData, LyricsLine } from "../types.ts";

interface LyricsViewProps {
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
  // Singing typically finishes across 85% of the line duration window (capped at 5s)
  const typingDuration = Math.min(lineDurationMs * 0.85, 5000);
  const ratio = Math.min(1, elapsedMs / (typingDuration || 1000));

  return Math.max(1, Math.min(totalChars, Math.ceil(ratio * totalChars)));
}

interface LyricLineRowProps {
  line: LyricsLine;
  status: "past" | "active" | "future";
  activeLineRef?: React.RefObject<HTMLDivElement | null>;
  activeTextRef?: React.RefObject<HTMLSpanElement | null>;
  onLineClick: (timeMs: number) => void;
}

const LyricLineRow = React.memo<LyricLineRowProps>(
  ({ line, status, activeLineRef, activeTextRef, onLineClick }) => {
    if (status === "active") {
      return (
        <div
          ref={activeLineRef}
          onClick={() => onLineClick(line.time)}
          style={{ transform: "translate3d(0, 0, 0)", willChange: "transform, opacity" }}
          className="py-3 px-4 rounded-md bg-[#0f151f] border border-[#2589f5] shadow-[0_0_15px_rgba(37,137,245,0.2)] my-3 transition-[opacity,transform] duration-200 cursor-pointer group"
          title="Nhấp để phát lại câu này"
        >
          <div className="relative text-white font-mono text-base sm:text-lg font-medium leading-relaxed tracking-wide">
            {/* Invisible spacer reserves exact final wrapped height so zero layout reflow occurs while typing */}
            <p className="invisible pointer-events-none select-none" aria-hidden="true">
              <span>{line.text || "\u00A0"}</span>
              <span className="blinking-block-cursor" />
            </p>
            {/* GPU/DOM-direct typewriter layer updated via ref inside rAF */}
            <p className="absolute inset-0">
              <span ref={activeTextRef} />
              <span className="blinking-block-cursor" />
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={() => onLineClick(line.time)}
        style={{ transform: "translate3d(0, 0, 0)" }}
        className={`py-1 px-3 rounded-md transition-opacity duration-150 cursor-pointer font-mono text-sm sm:text-base leading-relaxed ${
          status === "past"
            ? "text-[#8492a6] opacity-40 hover:opacity-80 hover:text-white"
            : "text-[#475569] opacity-30 hover:opacity-60 hover:text-white"
        }`}
        title="Nhấp để tua đến câu hát này"
      >
        <span>{line.text}</span>
      </div>
    );
  }
);

LyricLineRow.displayName = "LyricLineRow";

export const LyricsView: React.FC<LyricsViewProps> = ({
  isMainStageView = false,
  onClose,
}) => {
  const {
    audioRef,
    currentSong,
    lyricsData,
    seek,
    isLyricsOpen,
    setIsLyricsOpen,
    isPlaying,
  } = usePlayer();

  const isLyricFrameOpen = isMainStageView || isLyricsOpen;

  const lines = useMemo(
    () => lyricsData?.parsed?.lines ?? [],
    [lyricsData?.parsed?.lines]
  );
  const isSynced = Boolean(lyricsData?.parsed?.isSynced && lines.length > 0);

  // State only changes when the active line index jumps to a new sentence (zero per-char or per-frame setState)
  const [activeLyricsIndex, setActiveLyricsIndex] = useState<number>(() => {
    if (isSynced && lines.length > 0) {
      const curMs = (audioRef.current?.currentTime ?? 0) * 1000;
      return binarySearchLineIndex(lines, curMs);
    }
    return -1;
  });

  // DOM Refs for direct zero-re-render mutations
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
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

      const curSec = songChanged ? 0 : (audioRef.current?.currentTime ?? 0);
      const initIdx =
        isSynced && lines.length > 0 ? binarySearchLineIndex(lines, curSec * 1000) : -1;

      activeIndexRef.current = initIdx;
      lastCharCountRef.current = -1;
      manualScrollUntilRef.current = 0;
      snapNextScrollRef.current = true;
      staticFloatIdxRef.current =
        !isSynced && lyricsData?.lyrics
          ? Math.min(lyricsData.lyrics.length, Math.floor(curSec * 25))
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
      const charsToShow = computeTypedCharCount(lines, activeLyricsIndex, curSec * 1000);
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
      const curSec = audio?.currentTime ?? 0;

      // Update header clock once per second via direct DOM ref
      const wholeSec = Math.floor(curSec);
      if (wholeSec !== lastHeaderSecRef.current && headerTimeRef.current) {
        lastHeaderSecRef.current = wholeSec;
        headerTimeRef.current.textContent = formatSeconds(curSec);
      }

      if (isSynced && lines.length > 0) {
        const curMs = curSec * 1000;
        const nextIdx = binarySearchLineIndex(lines, curMs);

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
          const charsToShow = computeTypedCharCount(lines, nextIdx, curMs);
          if (charsToShow !== lastCharCountRef.current) {
            lastCharCountRef.current = charsToShow;
            activeTextRef.current.textContent = lines[nextIdx].text.slice(0, charsToShow);
          }
        }

        // Release auto-scroll override once manual wheel cooldown expires
        if (nowMs >= manualScrollUntilRef.current) {
          targetYRef.current = activeTargetYRef.current;
        }
      } else if (!isSynced && lyricsData?.lyrics && staticTextRef.current && dtSec > 0) {
        const fullLen = lyricsData.lyrics.length;
        if (staticFloatIdxRef.current < fullLen) {
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

    if (audio) {
      audio.addEventListener("seeking", handleAudioSeek);
      audio.addEventListener("seeked", handleAudioSeek);
      audio.addEventListener("loadedmetadata", handleAudioSeek);
    }

    // Sync immediately on effect setup so state stays fresh while paused
    syncFrame(performance.now(), 0);

    if (!isPlaying || !isLyricFrameOpen || !currentSong) {
      return () => {
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

  const handleLineClick = useCallback(
    (timeMs: number) => {
      manualScrollUntilRef.current = 0;
      lastCharCountRef.current = -1;
      snapNextScrollRef.current = false;
      seek(timeMs / 1000);
    },
    [seek]
  );

  if (!currentSong) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#090d14] text-[#475569] font-mono select-none">
        <Disc className="w-12 h-12 mb-3 opacity-30 animate-spin" />
        <p className="text-sm text-white font-bold">// CHƯA PHÁT BÀI HÁT NÀO</p>
        <p className="text-xs text-[#8492a6] mt-1">Chọn một bài hát trong danh sách để xem lời bài hát chạy chữ</p>
      </div>
    );
  }

  const handleClose = () => {
    if (onClose) onClose();
    setIsLyricsOpen(false);
  };

  return (
    <div
      className={`flex flex-col select-none overflow-hidden font-mono bg-[#090d14] ${
        isMainStageView
          ? "w-full h-full"
          : "absolute inset-0 z-40 backdrop-blur-md bg-[#090d14]/95 animate-fadeIn"
      }`}
    >
      {/* Terminal Titlebar (Styled exactly after Reference Image 1) */}
      <div className="px-6 pt-5 pb-3 bg-[#090d14] flex-shrink-0 z-20">
        <div className="flex items-center justify-between">
          {/* Header Line in Terminal Green (#2ecc71) font monospace */}
          <div className="flex items-center gap-2 text-xs sm:text-sm font-mono font-semibold text-[#2ecc71]">
            <span>📍</span>
            <span className="truncate">
              Đang phát: {currentSong.title}
              {currentSong.artists.length > 0 && ` - ${currentSong.artists.map((a) => a.name).join(", ")}`}
              {" - "}
              <span ref={headerTimeRef}>00:00</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {lyricsData?.provider && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-[#0f151f] text-[#38bdf8] border border-[#1e293b]">
                NGUỒN: {lyricsData.provider.toUpperCase()}
              </span>
            )}
            <button
              onClick={handleClose}
              title="Đóng lời bài hát (Esc)"
              className="p-1 rounded-xs bg-[#0f151f] border border-[#1e293b] hover:border-[#2589f5] text-[#8492a6] hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Thin Divider Line (1px #1e293b) as seen in Reference Image 1 */}
        <div className="border-b border-[#1e293b] mt-3" />
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
          className="px-6 md:px-12 py-10 space-y-5 relative"
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
                  activeLineRef={status === "active" ? activeLineRef : undefined}
                  activeTextRef={status === "active" ? activeTextRef : undefined}
                  onLineClick={handleLineClick}
                />
              );
            })
          ) : lyricsData?.lyrics ? (
            /* STATIC LYRICS TYPEWRITER FALLBACK (Zero setState per char) */
            <div className="py-4 px-4 rounded-md bg-[#0f151f] border border-[#1e293b] space-y-2">
              <div className="text-[10px] font-mono text-[#38bdf8] mb-2 uppercase">
                // CHẾ ĐỘ TYPEWRITER LỜI BÀI HÁT TĨNH:
              </div>
              <div className="relative text-white font-mono text-base leading-relaxed whitespace-pre-wrap">
                <p className="invisible pointer-events-none select-none" aria-hidden="true">
                  <span>{lyricsData.lyrics}</span>
                  <span className="blinking-block-cursor" />
                </p>
                <p className="absolute inset-0">
                  <span ref={staticTextRef} />
                  <span className="blinking-block-cursor" />
                </p>
              </div>
            </div>
          ) : (
            /* NO LYRICS FOUND OR LOADING */
            <div className="h-full flex flex-col items-center justify-center text-center py-20 text-[#475569]">
              <Mic2 className="w-10 h-10 mb-3 opacity-30 text-[#2ecc71] animate-pulse" />
              <p className="text-sm font-bold text-white font-mono">
                {lyricsData ? "// 404_KHÔNG_TÌM_THẤY_LỜI_BÀI_HÁT" : "// ĐANG_TRUY_VẤN_LỜI_BÀI_HÁT..."}
              </p>
              <p className="text-xs text-[#8492a6] mt-1 font-mono">
                Tự động đối soát từ LrcLib, KuGou và NetEase
              </p>
            </div>
          )}
        </div>

        {/* Custom GPU-Composited 5px HUD Scrollbar */}
        <div
          ref={scrollbarTrackRef}
          onPointerDown={handleScrollbarPointerDown}
          style={{ opacity: 0, pointerEvents: "none" }}
          className="absolute top-0 right-0 bottom-0 w-[5px] bg-[#090d14] z-30 transition-opacity duration-150 cursor-pointer group/sb"
        >
          <div
            ref={scrollbarThumbRef}
            style={{
              height: "40px",
              transform: "translate3d(0px, 0px, 0px)",
              willChange: "transform",
            }}
            className="w-full rounded-[4px] bg-[#1e293b] group-hover/sb:bg-[#2589f5] group-hover/sb:shadow-[0_0_8px_rgba(37,137,245,0.4)] transition-colors duration-150"
          />
        </div>
      </div>
    </div>
  );
};
