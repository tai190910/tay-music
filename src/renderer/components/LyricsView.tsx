// src/renderer/components/LyricsView.tsx

import React, { useEffect, useRef } from "react";
import { X, Mic2, Music, Disc } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

export const LyricsView: React.FC = () => {
  const {
    currentSong,
    lyricsData,
    activeLyricsIndex,
    seek,
    setIsLyricsOpen,
    isPlaying,
    accentColor,
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
    <div
      className="absolute inset-0 z-20 flex flex-col select-none overflow-hidden animate-fadeIn"
      style={{
        background: `radial-gradient(circle at 25% 30%, rgba(${accentColor.rgbString}, 0.22) 0%, rgba(13, 14, 21, 0.96) 65%, #07080c 100%)`,
      }}
    >
      {/* Top Header Bar */}
      <div className="h-16 px-8 flex items-center justify-between border-b border-white/5 flex-shrink-0 relative z-20">
        <div className="flex items-center gap-3">
          <div
            className="p-1.5 rounded-lg border border-white/10"
            style={{ backgroundColor: `rgba(${accentColor.rgbString}, 0.15)` }}
          >
            <Mic2 className="w-4 h-4" style={{ color: accentColor.hex }} />
          </div>
          <div>
            <span className="text-sm font-bold text-white tracking-wide uppercase">
              Tày Music • Lời bài hát
            </span>
          </div>
          {lyricsData?.provider && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-white/5 text-neutral-300 border border-white/10">
              Nguồn: {lyricsData.provider.toUpperCase()}
            </span>
          )}
        </div>

        <button
          onClick={() => setIsLyricsOpen(false)}
          title="Đóng giao diện lời bài hát (Esc)"
          className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Split Body: Left Info / Right Lyrics */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Side: Spinning Vinyl Record + Album Cover & Audio Wave Visualizer */}
        <div className="w-5/12 p-8 flex flex-col justify-center items-center text-center border-r border-white/5 relative z-10">
          <div className="relative flex items-center justify-center">
            {/* Spinning Vinyl Record behind artwork */}
            <div
              className={`w-64 h-64 rounded-full bg-gradient-to-br from-neutral-900 via-black to-neutral-900 border-4 border-neutral-800 shadow-2xl absolute flex items-center justify-center transition-all duration-700 ${
                isPlaying ? "translate-x-12 rotate-45" : "translate-x-0"
              }`}
              style={{
                boxShadow: `0 10px 40px -10px rgba(${accentColor.rgbString}, 0.35)`,
              }}
            >
              {/* Vinyl grooves */}
              <div className="w-56 h-56 rounded-full border border-neutral-700/30 flex items-center justify-center">
                <div className="w-48 h-48 rounded-full border border-neutral-700/20 flex items-center justify-center">
                  <div className="w-36 h-36 rounded-full border border-neutral-700/30 flex items-center justify-center">
                    {/* Vinyl Center Label */}
                    <div
                      className="w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-600 shadow-inner relative flex items-center justify-center animate-vinyl"
                      style={{
                        animationPlayState: isPlaying ? "running" : "paused",
                      }}
                    >
                      {currentSong.thumbnail ? (
                        <img
                          src={currentSong.thumbnail}
                          alt="Vinyl Center"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Disc className="w-10 h-10 text-neutral-400" />
                      )}
                      {/* Spindle hole */}
                      <div className="w-3.5 h-3.5 rounded-full bg-neutral-900 border border-neutral-500 absolute" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Front Square Album Cover */}
            <div className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-neutral-900 flex-shrink-0 relative z-10 group">
              {currentSong.thumbnail ? (
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                  <Music className="w-20 h-20 text-neutral-500" />
                </div>
              )}
            </div>
          </div>

          {/* Song Metadata */}
          <div className="mt-8 max-w-sm">
            <h2 className="text-2xl font-black text-white tracking-tight line-clamp-2 drop-shadow-md">
              {currentSong.title}
            </h2>
            <p className="text-sm font-semibold text-neutral-300 mt-1.5">
              {currentSong.artists.map((a) => a.name).join(", ")}
            </p>
            {currentSong.album?.name && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 mt-2 font-medium">
                <Disc className="w-3.5 h-3.5" />
                <span className="truncate">{currentSong.album.name}</span>
              </div>
            )}

            {/* Real-time simulated Audio Wave Visualizer */}
            <div className="flex items-end justify-center gap-1.5 h-6 mt-5">
              {[0.35, 0.9, 0.6, 1.0, 0.75, 0.85, 0.45, 0.7].map((scale, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: accentColor.hex,
                    height: isPlaying ? `${Math.max(20, scale * 100)}%` : "20%",
                    animation: isPlaying
                      ? `visualizerBounce ${0.8 + (i % 4) * 0.2}s ease-in-out infinite alternate`
                      : "none",
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Flowing Karaoke Lyrics */}
        <div
          ref={containerRef}
          className="w-7/12 h-full overflow-y-auto px-12 py-36 space-y-6 scroll-smooth relative z-10"
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
                  className={`cursor-pointer transition-all duration-300 py-2.5 px-4 rounded-xl flex items-center gap-3 select-text group ${
                    isActive
                      ? "text-white font-black text-3xl tracking-tight opacity-100 scale-[1.03] origin-left bg-white/5 shadow-sm"
                      : isPast
                      ? "text-neutral-400/80 text-xl font-medium hover:text-white/90 hover:opacity-100"
                      : "text-neutral-500/60 text-xl font-medium hover:text-white/80 hover:opacity-90"
                  }`}
                  title="Nhấp để phát từ đoạn này"
                >
                  {/* Active Line Accent Pill */}
                  {isActive && (
                    <span
                      className="w-1.5 h-8 rounded-full flex-shrink-0 animate-pulse"
                      style={{ backgroundColor: accentColor.hex }}
                    />
                  )}
                  <span className="leading-snug">{line.text}</span>
                </div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 py-20">
              <Mic2 className="w-14 h-14 mb-4 opacity-40 animate-pulse text-white" />
              <p className="text-xl font-bold text-white">
                {lyricsData ? "Không tìm thấy lời bài hát" : "Đang tìm kiếm lời bài hát..."}
              </p>
              <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
                Lời bài hát được tự động truy vấn từ hệ thống LrcLib, NetEase và KuGou.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
