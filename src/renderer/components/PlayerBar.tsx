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
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
    accentColor,
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
    <footer
      className="h-22 border-t px-4 py-2 flex items-center justify-between select-none z-30 flex-shrink-0 transition-colors duration-700"
      style={{
        backgroundColor: "#0c0d13",
        borderTopColor: `rgba(${accentColor.rgbString}, 0.22)`,
        boxShadow: `0 -4px 24px -6px rgba(${accentColor.rgbString}, 0.15)`,
      }}
    >
      {/* 1. Left Section: Song Info & Like */}
      <div className="flex items-center gap-3 w-1/4 min-w-[200px]">
        {currentSong ? (
          <>
            <div
              onClick={() => setIsLyricsOpen((prev) => !prev)}
              className="relative w-12 h-12 rounded-lg overflow-hidden bg-mochy-card border border-mochy-border/60 flex-shrink-0 cursor-pointer group shadow-sm"
              title="Nhấn để xem lời bài hát"
            >
              {currentSong.thumbnail ? (
                <img
                  src={currentSong.thumbnail}
                  alt={currentSong.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-mochy-card">
                  <Mic2 className="w-5 h-5 text-mochy-subtext" />
                </div>
              )}
            </div>

            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span
                  onClick={() => setIsLyricsOpen((prev) => !prev)}
                  className="text-sm font-semibold text-white truncate cursor-pointer hover:underline"
                  title={currentSong.title}
                >
                  {currentSong.title}
                </span>

                {/* Animated mini sound wave when playing */}
                {isPlaying && (
                  <div className="flex items-end gap-0.5 h-3 flex-shrink-0">
                    <span
                      className="w-0.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: accentColor.hex,
                        height: "100%",
                        animation: "visualizerBounce 0.6s ease-in-out infinite alternate",
                      }}
                    />
                    <span
                      className="w-0.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: accentColor.hex,
                        height: "60%",
                        animation: "visualizerBounce 0.8s ease-in-out infinite alternate",
                        animationDelay: "0.15s",
                      }}
                    />
                    <span
                      className="w-0.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: accentColor.hex,
                        height: "80%",
                        animation: "visualizerBounce 0.5s ease-in-out infinite alternate",
                        animationDelay: "0.3s",
                      }}
                    />
                  </div>
                )}
              </div>
              <span className="text-xs text-mochy-muted truncate">
                {currentSong.artists.map((a) => a.name).join(", ") || "Nghệ sĩ chưa rõ"}
              </span>
            </div>

            <button
              onClick={toggleLikeCurrent}
              title={isLiked ? "Bỏ thích" : "Yêu thích"}
              className="p-1.5 rounded-full text-mochy-muted hover:text-white hover:bg-mochy-cardHover transition-colors flex-shrink-0"
            >
              <Heart
                className="w-5 h-5 transition-transform active:scale-125"
                style={{
                  color: isLiked ? accentColor.hex : undefined,
                  fill: isLiked ? accentColor.hex : "transparent",
                }}
              />
            </button>
          </>
        ) : (
          <div className="text-xs text-mochy-subtext italic">Chưa phát bài hát nào</div>
        )}
      </div>

      {/* 2. Center Section: Playback Controls & Progress Bar */}
      <div className="flex flex-col items-center justify-center max-w-xl w-2/4 px-4">
        {/* Buttons */}
        <div className="flex items-center gap-4 mb-1">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            title={isShuffle ? "Tắt trộn bài" : "Bật trộn bài"}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: isShuffle ? accentColor.hex : undefined }}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Previous */}
          <button
            onClick={prevSong}
            title="Bài trước"
            disabled={!currentSong}
            className="p-1.5 rounded-md text-mochy-muted hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-mochy-muted"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play / Pause / Loading */}
          <button
            onClick={togglePlay}
            disabled={!currentSong && !isLoadingStream}
            title={isPlaying ? "Tạm dừng" : "Phát"}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md disabled:opacity-40 text-black font-bold"
            style={{
              backgroundColor: accentColor.hex,
              boxShadow: isPlaying ? `0 0 18px rgba(${accentColor.rgbString}, 0.5)` : undefined,
            }}
          >
            {isLoadingStream ? (
              <Loader2 className="w-5 h-5 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-black" />
            ) : (
              <Play className="w-5 h-5 fill-black ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={nextSong}
            title="Bài tiếp theo"
            disabled={!currentSong}
            className="p-1.5 rounded-md text-mochy-muted hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-mochy-muted"
          >
            <SkipForward className="w-5 h-5" />
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
            className="p-1.5 rounded-md transition-colors relative"
            style={{ color: repeatMode !== "off" ? accentColor.hex : undefined }}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Timeline Bar */}
        <div className="w-full flex items-center gap-2.5 text-xs text-mochy-muted">
          <span className="w-9 text-right font-mono">{formatSeconds(currentTime)}</span>
          <div className="relative flex-1 flex items-center group py-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeekChange}
              disabled={!currentSong}
              className="w-full h-1 bg-mochy-border group-hover:h-1.5 rounded-lg appearance-none cursor-pointer transition-all"
              style={{ accentColor: accentColor.hex }}
            />
          </div>
          <span className="w-9 text-left font-mono">{formatSeconds(duration)}</span>
        </div>
      </div>

      {/* 3. Right Section: Lyrics, Queue, Volume */}
      <div className="flex items-center justify-end gap-2 w-1/4 min-w-[200px]">
        {/* Karaoke Lyrics Button */}
        <button
          onClick={() => setIsLyricsOpen((prev) => !prev)}
          title="Lời bài hát Karaoke"
          className="p-2 rounded-lg transition-colors"
          style={{
            backgroundColor: isLyricsOpen ? `rgba(${accentColor.rgbString}, 0.2)` : undefined,
            color: isLyricsOpen ? accentColor.hex : undefined,
          }}
        >
          <Mic2 className="w-4 h-4" />
        </button>

        {/* Queue Drawer Button */}
        <button
          onClick={() => setIsQueueOpen((prev) => !prev)}
          title="Hàng đợi phát nhạc"
          className="p-2 rounded-lg transition-colors"
          style={{
            backgroundColor: isQueueOpen ? `rgba(${accentColor.rgbString}, 0.2)` : undefined,
            color: isQueueOpen ? accentColor.hex : undefined,
          }}
        >
          <ListMusic className="w-4 h-4" />
        </button>

        {/* Volume controls */}
        <div className="flex items-center gap-1.5 pl-2">
          <button
            onClick={toggleMute}
            title={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
            className="p-1.5 rounded-md text-mochy-muted hover:text-white transition-colors"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-mochy-subtext" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-mochy-border hover:h-1.5 rounded-lg appearance-none cursor-pointer transition-all"
            style={{ accentColor: accentColor.hex }}
          />
        </div>
      </div>
    </footer>
  );
};
