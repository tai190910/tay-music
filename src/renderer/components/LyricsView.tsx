// src/renderer/components/LyricsView.tsx

import React, { useEffect, useRef } from "react";
import { X, Mic2, Disc, Terminal, Activity } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

function formatMsToLrc(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const LyricsView: React.FC = () => {
  const {
    currentSong,
    lyricsData,
    activeLyricsIndex,
    seek,
    setIsLyricsOpen,
    isPlaying,
  } = usePlayer();

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when active line changes
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeLyricsIndex]);

  if (!currentSong) return null;

  const lines = lyricsData?.parsed?.lines || [];

  return (
    <div className="absolute inset-0 z-30 flex flex-col select-none overflow-hidden animate-fadeIn backdrop-blur-md bg-[#0d0f12]/92 font-sans border border-[#242a35]">
      {/* Top Header Bar - Cyber Telemetry Style */}
      <div className="h-12 px-6 flex items-center justify-between border-b border-[#242a35] bg-[#101217] flex-shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-[#181c24] border border-[#00f0ff]/40 text-[#00f0ff] text-[10px] font-mono font-bold">
            <Mic2 className="w-3 h-3 text-[#00f0ff]" />
            <span>// TELEMETRY: KARAOKE_HUD</span>
          </div>

          {lyricsData?.provider && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xs bg-[#14231b] text-[#00ff9d] border border-[#00ff9d]/30">
              PROVIDER: {lyricsData.provider.toUpperCase()}
            </span>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-[#444c5c]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
            <span>SYNC: MILLISECOND_EXACT</span>
          </div>
        </div>

        <button
          onClick={() => setIsLyricsOpen(false)}
          title="Đóng giao diện lời bài hát (Esc)"
          className="px-2.5 py-1 rounded-xs bg-[#181c24] hover:bg-[#242a35] border border-[#242a35] text-[#8492a6] hover:text-white font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>[ESC / CLOSE]</span>
        </button>
      </div>

      {/* Main Split Body: Left Info / Right Lyrics */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Side: Artwork & Equalizer Bar */}
        <div className="w-5/12 p-8 flex flex-col justify-center items-center text-center border-r border-[#242a35] relative z-10 bg-[#0d0f12]/50">
          {/* Album Cover with Cyber Border */}
          <div className="relative w-56 h-56 rounded-xs overflow-hidden bg-[#181c24] border border-[#242a35] shadow-[0_0_20px_rgba(0,0,0,0.6)] flex-shrink-0 group">
            {currentSong.thumbnail ? (
              <img
                src={currentSong.thumbnail}
                alt={currentSong.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#181c24]">
                <Disc className="w-16 h-16 text-[#444c5c]" />
              </div>
            )}
            {/* Corner Bracket Accents */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00f0ff]" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00f0ff]" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00f0ff]" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00f0ff]" />
          </div>

          {/* Song Metadata */}
          <div className="mt-6 max-w-sm">
            <h2 className="text-xl font-bold text-white tracking-tight line-clamp-2">
              {currentSong.title}
            </h2>
            <p className="text-xs font-mono text-[#00f0ff] mt-1 font-semibold">
              {currentSong.artists.map((a) => a.name).join(", ")}
            </p>

            {/* Audio Wave Visualizer */}
            <div className="flex items-end justify-center gap-1 h-5 mt-4">
              {[0.4, 0.9, 0.6, 1.0, 0.75, 0.85, 0.5, 0.7, 0.95, 0.35].map((scale, i) => (
                <span
                  key={i}
                  className="w-1 rounded-xs transition-all duration-300"
                  style={{
                    backgroundColor: i % 2 === 0 ? "#00f0ff" : "#00ff9d",
                    height: isPlaying ? `${Math.max(20, scale * 100)}%` : "20%",
                    animation: isPlaying
                      ? `visualizerBounce ${0.6 + (i % 4) * 0.15}s ease-in-out infinite alternate`
                      : "none",
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Flowing Karaoke Lyrics with Timestamp Tags */}
        <div
          ref={containerRef}
          className="w-7/12 h-full overflow-y-auto px-8 py-32 space-y-4 scroll-smooth relative z-10"
        >
          {lines.length > 0 ? (
            lines.map((line, idx) => {
              const isActive = idx === activeLyricsIndex;
              const isPast = idx < activeLyricsIndex;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seek(line.time / 1000)}
                  className={`cursor-pointer transition-all duration-200 py-2 px-3 rounded-xs flex items-center gap-3 select-text group border ${
                    isActive
                      ? "text-[#00f0ff] font-bold text-2xl tracking-tight bg-[#181c24] border-[#00f0ff]/40 shadow-[0_0_15px_rgba(0,240,255,0.1)] font-sans"
                      : isPast
                      ? "text-[#8492a6] text-lg font-medium border-transparent hover:text-white hover:bg-[#181c24]/50"
                      : "text-[#444c5c] text-lg font-medium border-transparent hover:text-[#8492a6] hover:bg-[#181c24]/30"
                  }`}
                  title="Nhấp để tua đến câu hát này"
                >
                  {/* Monospace Timestamp Pill */}
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-xs flex-shrink-0 ${
                      isActive
                        ? "bg-[#00f0ff] text-black font-bold"
                        : "bg-[#181c24] text-[#444c5c] border border-[#242a35]"
                    }`}
                  >
                    {formatMsToLrc(line.time)}
                  </span>

                  <span className="leading-snug">{line.text}</span>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#8492a6] py-16 font-mono text-xs">
              <Mic2 className="w-10 h-10 mb-3 opacity-30 text-[#00f0ff] animate-pulse" />
              <p className="text-sm font-bold text-white">
                {lyricsData ? "// 404_LYRICS_NOT_FOUND" : "// FETCHING_LYRICS_STREAM..."}
              </p>
              <p className="text-[11px] text-[#444c5c] mt-1 max-w-sm">
                Tự động tìm kiếm qua LrcLib, KuGou và NetEase
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
