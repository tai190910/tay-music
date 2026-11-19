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
  Activity,
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
    <footer className="h-22 bg-[#101217] border-t border-[#242a35] px-4 py-2.5 flex items-center justify-between select-none z-30 flex-shrink-0 relative shadow-[0_-4px_20px_rgba(0,0,0,0.5)] font-sans">
      {/* 1. Left Section: RPG Character Card / Song Info */}
      <div className="flex items-center gap-3 w-1/4 min-w-[220px]">
        {currentSong ? (
          <>
            {/* Square Album Cover with 1px Cyber Border */}
            <div
              onClick={() => setIsLyricsOpen((prev) => !prev)}
              className="relative w-12 h-12 rounded-sm overflow-hidden bg-[#181c24] border border-[#242a35] hover:border-[#00f0ff]/70 flex-shrink-0 cursor-pointer group shadow-[0_0_8px_rgba(0,0,0,0.4)] transition-all"
              title="Nhấn để xem lời bài hát"
            >
              {currentSong.thumbnail ? (
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#181c24]">
                  <Disc className="w-5 h-5 text-[#444c5c]" />
                </div>
              )}
              {/* Corner highlight indicator */}
              <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00f0ff]/60" />
            </div>

            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span
                  onClick={() => setIsLyricsOpen((prev) => !prev)}
                  className="text-xs font-bold text-white truncate cursor-pointer hover:text-[#00f0ff] transition-colors"
                  title={currentSong.title}
                >
                  {currentSong.title}
                </span>

                {/* Cyber Audio Waveform Indicator */}
                {isPlaying && (
                  <div className="flex items-end gap-0.5 h-3 flex-shrink-0" title="Audio Stream Active">
                    <span className="w-0.5 bg-[#00ff9d] rounded-full animate-visualizer-1 h-full" />
                    <span className="w-0.5 bg-[#00f0ff] rounded-full animate-visualizer-2 h-full" />
                    <span className="w-0.5 bg-[#00ff9d] rounded-full animate-visualizer-3 h-full" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-[#8492a6] truncate">
                  {currentSong.artists.map((a) => a.name).join(", ") || "Unknown Artist"}
                </span>
                <span className="text-[9px] font-mono text-[#00ff9d] bg-[#00ff9d]/10 px-1 rounded-xs border border-[#00ff9d]/30 font-semibold">
                  LIVE
                </span>
              </div>
            </div>

            <button
              onClick={toggleLikeCurrent}
              title={isLiked ? "Bỏ thích" : "Yêu thích"}
              className="p-1.5 rounded-sm text-[#8492a6] hover:text-[#00f0ff] hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all flex-shrink-0 ml-auto"
            >
              <Heart
                className="w-4 h-4 transition-transform active:scale-125"
                style={{
                  color: isLiked ? "#ff3366" : undefined,
                  fill: isLiked ? "#ff3366" : "transparent",
                }}
              />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#444c5c]">
            <Activity className="w-4 h-4 opacity-40" />
            <span>// AUDIO_CORE: STANDBY</span>
          </div>
        )}
      </div>

      {/* 2. Center Section: RPG HUD Resource Gauge & Controls */}
      <div className="flex flex-col items-center justify-center max-w-xl w-2/4 px-4">
        {/* Cyber Buttons Row */}
        <div className="flex items-center gap-3 mb-1.5">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            title={isShuffle ? "Tắt trộn bài" : "Bật trộn bài"}
            className={`p-1.5 rounded-sm transition-all border ${
              isShuffle
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                : "text-[#8492a6] hover:text-white border-transparent hover:bg-[#181c24]"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Previous */}
          <button
            onClick={prevSong}
            title="Bài trước"
            disabled={!currentSong}
            className="p-1.5 rounded-sm text-[#8492a6] hover:text-white transition-all disabled:opacity-30 border border-transparent hover:border-[#242a35] hover:bg-[#181c24]"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play / Pause with Cyber Neon Ring */}
          <button
            onClick={togglePlay}
            disabled={!currentSong && !isLoadingStream}
            title={isPlaying ? "Tạm dừng" : "Phát"}
            className="w-9 h-9 rounded-sm bg-[#00f0ff] text-black hover:bg-[#33f3ff] active:scale-95 transition-all shadow-[0_0_14px_rgba(0,240,255,0.45)] flex items-center justify-center disabled:opacity-40 disabled:shadow-none font-bold cursor-pointer"
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
            className="p-1.5 rounded-sm text-[#8492a6] hover:text-white transition-all disabled:opacity-30 border border-transparent hover:border-[#242a35] hover:bg-[#181c24]"
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
            className={`p-1.5 rounded-sm transition-all border ${
              repeatMode !== "off"
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
                : "text-[#8492a6] hover:text-white border-transparent hover:bg-[#181c24]"
            }`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* RPG Timeline Resource Gauge (HP / Stamina Bar Style) */}
        <div className="w-full flex items-center gap-2.5 text-xs">
          <span className="w-10 text-right font-mono text-[10px] text-[#8492a6] font-semibold">
            {formatSeconds(currentTime)}
          </span>

          <div className="relative flex-1 flex items-center group py-1">
            {/* Custom Background Gauge */}
            <div className="absolute inset-x-0 h-1.5 bg-[#181c24] border border-[#242a35] rounded-xs overflow-hidden pointer-events-none">
              <div
                className="h-full bg-gradient-to-r from-[#00ff9d] to-[#00f0ff] transition-all duration-100"
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

          <span className="w-10 text-left font-mono text-[10px] text-[#444c5c] font-semibold">
            {formatSeconds(duration)}
          </span>
        </div>
      </div>

      {/* 3. Right Section: Telemetry, Audio Quality Badge & Volume */}
      <div className="flex items-center justify-end gap-2.5 w-1/4 min-w-[220px]">
        {/* Audio Quality Badge (OPUS 160KBPS) */}
        <div
          className="px-2 py-0.5 rounded-xs bg-[#14231b] border border-[#00ff9d]/40 text-[#00ff9d] text-[10px] font-mono font-bold tracking-wider shadow-[0_0_8px_rgba(0,255,157,0.15)] flex items-center gap-1.5"
          title="Codec & Bitrate Telemetry"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
          <span>{streamInfo?.badgeText || "OPUS 160KBPS"}</span>
        </div>

        {/* Karaoke Lyrics Button [LRC] */}
        <button
          onClick={() => setIsLyricsOpen((prev) => !prev)}
          title="Lời bài hát Karaoke"
          className={`px-2 py-1 rounded-sm text-xs font-mono transition-all border flex items-center gap-1 ${
            isLyricsOpen
              ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
              : "text-[#8492a6] hover:text-white border-transparent hover:border-[#242a35] hover:bg-[#181c24]"
          }`}
        >
          <Mic2 className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">LRC</span>
        </button>

        {/* Queue Drawer Button [QUEUE] */}
        <button
          onClick={() => setIsQueueOpen((prev) => !prev)}
          title="Hàng đợi phát nhạc"
          className={`p-1.5 rounded-sm transition-all border ${
            isQueueOpen
              ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_8px_rgba(0,240,255,0.2)]"
              : "text-[#8492a6] hover:text-white border-transparent hover:border-[#242a35] hover:bg-[#181c24]"
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" />
        </button>

        {/* Volume controls with Monospace Percentage */}
        <div className="flex items-center gap-1.5 pl-1.5 border-l border-[#242a35]">
          <button
            onClick={toggleMute}
            title={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
            className="p-1 rounded-sm text-[#8492a6] hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-[#ff3366]" />
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
            className="w-16 h-1 bg-[#242a35] rounded-xs appearance-none cursor-pointer accent-[#00f0ff]"
          />
          <span className="text-[9px] font-mono text-[#444c5c] w-6 text-right">
            {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
          </span>
        </div>
      </div>
    </footer>
  );
};
