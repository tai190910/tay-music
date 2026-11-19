// src/renderer/components/LyricsView.tsx

import React, { useEffect, useRef, useState, useMemo } from "react";
import { X, Mic2, Disc, Play, Terminal } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

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

export const LyricsView: React.FC<LyricsViewProps> = ({
  isMainStageView = false,
  onClose,
}) => {
  const {
    currentSong,
    lyricsData,
    activeLyricsIndex,
    currentTime,
    duration,
    seek,
    setIsLyricsOpen,
    isPlaying,
  } = usePlayer();

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active line into center
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLyricsIndex]);

  // Static lyrics typewriter state (for songs without timestamps)
  const [staticCharCount, setStaticCharCount] = useState(0);

  const lines = lyricsData?.parsed?.lines || [];
  const isSynced = lyricsData?.parsed?.isSynced && lines.length > 0;

  // Handle static lyrics typewriter speed when not synced
  useEffect(() => {
    if (!isSynced && lyricsData?.lyrics) {
      setStaticCharCount(0);
      const fullLen = lyricsData.lyrics.length;
      const interval = setInterval(() => {
        setStaticCharCount((prev) => {
          if (prev >= fullLen) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 40);
      return () => clearInterval(interval);
    }
  }, [isSynced, lyricsData?.lyrics]);

  // Calculate typed characters for active line in synced LRC
  const activeLineProgress = useMemo(() => {
    if (!isSynced || activeLyricsIndex < 0 || activeLyricsIndex >= lines.length) {
      return { typedText: "", isComplete: false };
    }

    const curLine = lines[activeLyricsIndex];
    const nextLine = lines[activeLyricsIndex + 1];

    const startMs = curLine.time;
    const nextMs = nextLine ? nextLine.time : startMs + 4500;
    const lineDurationMs = Math.max(800, nextMs - startMs);

    const elapsedMs = Math.max(0, currentTime * 1000 - startMs);
    // Sing typically finishes across 80% of the line duration window
    const typingDuration = Math.min(lineDurationMs * 0.85, 5000);
    const ratio = Math.min(1, elapsedMs / (typingDuration || 1000));

    const totalChars = curLine.text.length;
    const charsToShow = Math.max(1, Math.min(totalChars, Math.ceil(ratio * totalChars)));

    return {
      typedText: curLine.text.slice(0, charsToShow),
      isComplete: charsToShow >= totalChars,
    };
  }, [isSynced, activeLyricsIndex, lines, currentTime]);

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
              {formatSeconds(currentTime)}
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

      {/* Lyrics Terminal Content Body */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 md:px-12 py-10 space-y-5 scroll-smooth relative"
      >
        {isSynced ? (
          /* SYNCED LRC TYPEWRITER VIEW */
          lines.map((line, idx) => {
            const isActive = idx === activeLyricsIndex;
            const isPast = idx < activeLyricsIndex;

            if (isActive) {
              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={activeLineRef}
                  onClick={() => seek(line.time / 1000)}
                  className="py-3 px-4 rounded-md bg-[#0f151f] border border-[#2589f5] shadow-[0_0_15px_rgba(37,137,245,0.2)] my-3 transition-all cursor-pointer group"
                  title="Nhấp để phát lại câu này"
                >
                  <p className="text-white font-mono text-base sm:text-lg font-medium leading-relaxed tracking-wide">
                    <span>{activeLineProgress.typedText}</span>
                    {/* Blinking Blue Solid Block Cursor (█) as shown in Image 1 */}
                    <span className="blinking-block-cursor" />
                  </p>
                </div>
              );
            }

            return (
              <div
                key={`${line.time}-${idx}`}
                onClick={() => seek(line.time / 1000)}
                className={`py-1 px-3 rounded-md transition-all cursor-pointer font-mono text-sm sm:text-base leading-relaxed ${
                  isPast
                    ? "text-[#8492a6] opacity-40 hover:opacity-80 hover:text-white"
                    : "text-[#475569] opacity-30 hover:opacity-60 hover:text-white"
                }`}
                title="Nhấp để tua đến câu hát này"
              >
                <span>{line.text}</span>
              </div>
            );
          })
        ) : lyricsData?.lyrics ? (
          /* STATIC LYRICS TYPEWRITER FALLBACK */
          <div className="py-4 px-4 rounded-md bg-[#0f151f] border border-[#1e293b] space-y-2">
            <div className="text-[10px] font-mono text-[#38bdf8] mb-2 uppercase">
              // CHẾ ĐỘ TYPEWRITER LỜI BÀI HÁT TĨNH:
            </div>
            <p className="text-white font-mono text-base leading-relaxed whitespace-pre-wrap">
              {lyricsData.lyrics.slice(0, staticCharCount)}
              <span className="blinking-block-cursor" />
            </p>
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
    </div>
  );
};
