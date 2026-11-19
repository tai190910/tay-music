// src/renderer/components/PlayerBar.tsx

import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  Mic2,
  ListMusic,
  Heart,
  Loader2,
  Disc,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const PlayerBar: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    isLiked,
    isLoadingStream,
    isLyricsOpen,
    isQueueOpen,
    streamInfo,
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
  } = usePlayer();

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
  };

  return (
    <footer className="h-20 bg-[#0f151f] border-t border-[#1e293b] px-4 py-2 flex items-center justify-between select-none z-30 flex-shrink-0 relative shadow-[0_-4px_20px_rgba(0,0,0,0.6)] font-sans">
      {/* 1. Left Section: Song Info & Like */}
      <div className="flex items-center gap-3 w-1/4 min-w-[210px]">
        {currentSong ? (
          <>
            {/* Square Album Cover with 1px border */}
            <div
              onClick={() => setIsLyricsOpen((prev) => !prev)}
              className="relative w-12 h-12 rounded-md overflow-hidden bg-[#090d14] border border-[#1e293b] hover:border-[#2589f5] flex-shrink-0 cursor-pointer group shadow-sm transition-all"
              title="Nhấn để xem lời bài hát"
            >
              {currentSong.thumbnail ? (
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#090d14]">
                  <Disc className="w-5 h-5 text-[#475569]" />
                </div>
              )}
            </div>

            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span
                  onClick={() => setIsLyricsOpen((prev) => !prev)}
                  className="text-xs font-bold text-white truncate cursor-pointer hover:text-[#2589f5] transition-colors"
                  title={currentSong.title}
                >
                  {currentSong.title}
                </span>

                {/* Equalizer Bars */}
                {isPlaying && (
                  <div className="flex items-end gap-0.5 h-3 flex-shrink-0">
                    <span className="w-0.5 bg-[#2ecc71] rounded-full animate-visualizer-1 h-full" />
                    <span className="w-0.5 bg-[#2589f5] rounded-full animate-visualizer-2 h-full" />
                    <span className="w-0.5 bg-[#2ecc71] rounded-full animate-visualizer-3 h-full" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#8492a6] truncate font-mono">
                  {currentSong.artists.map((a) => a.name).join(", ") || "Nghệ sĩ chưa rõ"}
                </span>
              </div>
            </div>

            <button
              onClick={toggleLikeCurrent}
              title={isLiked ? "Bỏ thích" : "Yêu thích"}
              className="p-1.5 rounded-md text-[#8492a6] hover:text-[#e74c3c] hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all flex-shrink-0 ml-auto cursor-pointer"
            >
              <Heart
                className="w-4 h-4 transition-transform active:scale-125"
                style={{
                  color: isLiked ? "#e74c3c" : undefined,
                  fill: isLiked ? "#e74c3c" : "transparent",
                }}
              />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#475569]">
            <Disc className="w-4 h-4 opacity-40" />
            <span>// CHƯA PHÁT NHẠC</span>
          </div>
        )}
      </div>

      {/* 2. Center Section: Playback Controls & Electric Blue Seek Bar */}
      <div className="flex flex-col items-center justify-center max-w-xl w-2/4 px-4">
        {/* Buttons */}
        <div className="flex items-center gap-3 mb-1">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            title={isShuffle ? "Tắt trộn bài" : "Bật trộn bài"}
            className={`p-1.5 rounded-md transition-all border ${
              isShuffle
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_8px_rgba(37,137,245,0.25)]"
                : "text-[#8492a6] hover:text-white border-transparent hover:border-[#1e293b] hover:bg-[#16202e]"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Previous */}
          <button
            onClick={prevSong}
            title="Bài trước"
            disabled={!currentSong}
            className="p-1.5 rounded-md text-[#8492a6] hover:text-white transition-all disabled:opacity-30 border border-transparent hover:border-[#1e293b] hover:bg-[#16202e]"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play / Pause button in Terminal Green (#2ecc71) */}
          <button
            onClick={togglePlay}
            disabled={!currentSong && !isLoadingStream}
            title={isPlaying ? "Tạm dừng" : "Phát"}
            className="w-8 h-8 rounded-md bg-[#2ecc71] text-black hover:bg-[#27ae60] active:scale-95 transition-all shadow-[0_0_12px_rgba(46,204,113,0.35)] flex items-center justify-center disabled:opacity-40 disabled:shadow-none font-bold cursor-pointer"
          >
            {isLoadingStream ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={nextSong}
            title="Bài tiếp theo"
            disabled={!currentSong}
            className="p-1.5 rounded-md text-[#8492a6] hover:text-white transition-all disabled:opacity-30 border border-transparent hover:border-[#1e293b] hover:bg-[#16202e]"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* Repeat */}
          <button
            onClick={toggleRepeat}
            title={
              repeatMode === "one"
                ? "Lặp lại 1 bài"
                : repeatMode === "all"
                ? "Lặp lại danh sách"
                : "Không lặp lại"
            }
            className={`p-1.5 rounded-md transition-all border ${
              repeatMode !== "off"
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_8px_rgba(37,137,245,0.25)]"
                : "text-[#8492a6] hover:text-white border-transparent hover:border-[#1e293b] hover:bg-[#16202e]"
            }`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Sharp Electric Blue Seek Bar (#2589f5) */}
        <div className="w-full flex items-center gap-2.5 text-xs">
          <span className="w-10 text-right font-mono text-[10px] text-[#8492a6] font-semibold">
            {formatSeconds(currentTime)}
          </span>

          <div className="relative flex-1 flex items-center group py-1">
            {/* Background seek track */}
            <div className="absolute inset-x-0 h-1.5 bg-[#090d14] border border-[#1e293b] rounded-xs overflow-hidden pointer-events-none">
              <div
                className="h-full bg-[#2589f5] transition-all duration-100 shadow-[0_0_8px_rgba(37,137,245,0.5)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeekChange}
              disabled={!currentSong}
              className="w-full h-2 opacity-0 cursor-pointer z-10"
            />
          </div>

          <span className="w-10 text-left font-mono text-[10px] text-[#475569] font-semibold">
            {formatSeconds(duration)}
          </span>
        </div>
      </div>

      {/* 3. Right Section: Technical Quality Badge & Volume */}
      <div className="flex items-center justify-end gap-2.5 w-1/4 min-w-[210px]">
        {/* Quality Badge: [OPUS 164KBPS] - 03:45 */}
        <div
          className="px-2 py-0.5 rounded-md bg-[#090d14] border border-[#1e293b] text-[#38bdf8] text-[10px] font-mono font-semibold tracking-wider flex items-center gap-1.5 shadow-xs"
          title="Thông số kỹ thuật luồng phát"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#2ecc71] animate-pulse" />
          <span>
            [{streamInfo?.badgeText || "OPUS 164KBPS"}] - {formatSeconds(duration)}
          </span>
        </div>

        {/* Lyrics Button [LRC] */}
        <button
          onClick={() => setIsLyricsOpen((prev) => !prev)}
          title="Lời bài hát Karaoke"
          className={`px-2 py-1 rounded-md text-xs font-mono transition-all border flex items-center gap-1 ${
            isLyricsOpen
              ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_8px_rgba(37,137,245,0.25)]"
              : "text-[#8492a6] hover:text-white border-[#1e293b] hover:border-[#2589f5] bg-[#090d14]"
          }`}
        >
          <Mic2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">LRC</span>
        </button>

        {/* Volume controls */}
        <div className="flex items-center gap-1.5 pl-1.5 border-l border-[#1e293b]">
          <button
            onClick={toggleMute}
            title={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-[#e74c3c]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 bg-[#1e293b] rounded-xs appearance-none cursor-pointer accent-[#2589f5]"
          />
          <span className="text-[9px] font-mono text-[#475569] w-6 text-right">
            {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      </div>
    </footer>
  );
};
