// src/renderer/components/FullscreenPlayer.tsx

import React, { useEffect, useRef, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  VolumeX,
  MessageSquareQuote,
  ListMusic,
  RefreshCw,
  Disc,
  Loader2,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import { LyricsView } from "./LyricsView.tsx";
import { TrackThumbnail } from "./TrackThumbnail.tsx";
import { usePlaylistPicker } from "./PlaylistPickerPopover.tsx";

function formatSec(sec: number): string {
  if (isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const FullscreenPlayer: React.FC = () => {
  const {
    audioRef,
    activeDeck,
    currentSong,
    isPlaying,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    isLiked,
    isLoadingStream,
    accentColor,
    settings,
    queue,
    queueIndex,
    isFullscreenPlayerOpen,
    setIsFullscreenPlayerOpen,
    fullscreenTab,
    setFullscreenTab,
    activePlaylistId,
    togglePlay,
    nextSong,
    prevSong,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleLikeCurrent,
    playSong,
    openQuickSwitch,
  } = usePlayer();
  const { openPlaylistPicker } = usePlaylistPicker();

  const curTimeTextRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const rangeInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);

  const syncProgress = useCallback(
    (timeSec: number, fromUserInput = false) => {
      const dur = duration || audioRef.current?.duration || 0;
      const ratio = dur > 0 ? Math.max(0, Math.min(1, timeSec / dur)) : 0;

      if (curTimeTextRef.current) {
        curTimeTextRef.current.textContent = formatSec(timeSec);
      }
      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${ratio})`;
      }
      if (rangeInputRef.current && !isDraggingRef.current && !fromUserInput) {
        rangeInputRef.current.value = String(timeSec);
      }
    },
    [audioRef, duration]
  );

  useEffect(() => {
    if (!isFullscreenPlayerOpen) return;
    const audio = audioRef.current;
    if (!audio) return;

    const handleProgress = () => syncProgress(audio.currentTime || 0);
    const handleUp = () => {
      isDraggingRef.current = false;
    };

    audio.addEventListener("timeupdate", handleProgress);
    audio.addEventListener("seeking", handleProgress);
    audio.addEventListener("seeked", handleProgress);
    audio.addEventListener("loadedmetadata", handleProgress);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    handleProgress();

    return () => {
      audio.removeEventListener("timeupdate", handleProgress);
      audio.removeEventListener("seeking", handleProgress);
      audio.removeEventListener("seeked", handleProgress);
      audio.removeEventListener("loadedmetadata", handleProgress);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isFullscreenPlayerOpen, audioRef, syncProgress, currentSong?.id, activeDeck]);

  if (!isFullscreenPlayerOpen) return null;

  const [r, g, b] = accentColor.rgb;
  const ambientBgStyle = settings.ambientBackground
    ? {
        background: `radial-gradient(circle at 24% 35%, rgba(${r}, ${g}, ${b}, 0.34), rgba(14, 14, 18, 0.94) 68%), #0a0a0c`,
      }
    : { background: "#0d0d10" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trình phát toàn màn hình"
      style={ambientBgStyle}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none animate-fadeIn text-white"
    >
      {/* Subtle Blurred Artwork Ambient Layer */}
      {settings.ambientBackground && currentSong && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none overflow-hidden"
        >
          <TrackThumbnail
            src={currentSong.thumbnail}
            videoId={currentSong.videoId || currentSong.id}
            isAmbient
            imgClassName="w-full h-full object-cover blur-3xl opacity-20 scale-125"
          />
          <div className="absolute inset-0 bg-black/55" />
        </div>
      )}

      {/* Top Header Controls */}
      <div className="relative z-20 px-6 pt-5 pb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setFullscreenTab("lyrics")}
          title="Lời bài hát (Lyrics)"
          aria-label="Lời bài hát"
          className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            fullscreenTab === "lyrics"
              ? "bg-white/[0.16] text-white"
              : "bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10]"
          }`}
        >
          <MessageSquareQuote className="w-3.5 h-3.5" />
          <span>Lyrics</span>
          {fullscreenTab === "lyrics" && (
            <span className="w-1 h-1 rounded-full bg-white" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setFullscreenTab("queue")}
          title="Danh sách chờ (Up Next)"
          aria-label="Danh sách chờ"
          className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
            fullscreenTab === "queue"
              ? "bg-white/[0.16] text-white"
              : "bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10]"
          }`}
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span>Up Next</span>
          {fullscreenTab === "queue" && (
            <span className="w-1 h-1 rounded-full bg-white" />
          )}
        </button>

        {currentSong && (
          <button
            type="button"
            onClick={() => openQuickSwitch(currentSong, activePlaylistId)}
            title="Tìm bản phát khác (Đổi nguồn phát YouTube)"
            aria-label="Tìm bản phát khác"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/65 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsFullscreenPlayerOpen(false)}
          title="Thu nhỏ trình phát (Esc)"
          aria-label="Đóng toàn màn hình"
          className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.18] text-white/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2-Column Content */}
      <div className="relative z-10 flex-1 min-h-0 px-8 lg:px-14 pb-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Column: Square Artwork + Track Meta + Seek + Controls + Volume */}
        <div className="md:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full max-w-[330px] flex flex-col">
            {/* Artwork */}
            <TrackThumbnail
              src={currentSong?.thumbnail}
              videoId={currentSong ? currentSong.videoId || currentSong.id : null}
              alt={currentSong?.title || "Tày Music"}
              iconSize="xl"
              className="aspect-square w-full rounded-[22px] bg-white/[0.06] border border-white/[0.10] shadow-[0_24px_60px_rgba(0,0,0,0.65)] mb-6"
            />

            {/* Title, Artist & Like */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-white truncate">
                  {currentSong?.title || "Chưa phát bài hát"}
                </h2>
                <p className="text-sm text-white/60 truncate mt-0.5">
                  {currentSong?.artists.map((a) => a.name).join(", ") || "Tày Music"}
                </p>
              </div>
              {currentSong && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlaylistPicker(currentSong, e.currentTarget.getBoundingClientRect());
                    }}
                    title="Thêm vào playlist"
                    aria-label="Thêm vào playlist"
                    className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleLikeCurrent}
                    title={isLiked ? "Bỏ thích" : "Yêu thích"}
                    aria-label={isLiked ? "Bỏ thích" : "Yêu thích"}
                    className={`p-2 rounded-full hover:bg-white/[0.08] transition-colors cursor-pointer ${
                      isLiked ? "text-[#fa233b]" : "text-white/55 hover:text-white"
                    }`}
                  >
                    <Heart
                      className="w-5 h-5"
                      style={{ fill: isLiked ? "currentColor" : "transparent" }}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Seek Slider */}
            <div className="space-y-1.5 mb-4">
              <div className="relative h-2 flex items-center group">
                <div className="w-full h-1.5 bg-white/[0.16] rounded-full overflow-hidden pointer-events-none">
                  <div
                    ref={progressFillRef}
                    className="h-full w-full origin-left bg-white/90 rounded-full"
                    style={{ transform: "scaleX(0)", willChange: "transform" }}
                  />
                </div>
                <input
                  ref={rangeInputRef}
                  type="range"
                  aria-label="Tua thời gian phát"
                  min={0}
                  max={duration || 100}
                  step={0.5}
                  defaultValue={0}
                  onPointerDown={() => {
                    isDraggingRef.current = true;
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    syncProgress(val, true);
                    seek(val);
                  }}
                  disabled={!currentSong}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-white/55 tabular-nums">
                <span ref={curTimeTextRef}>0:00</span>
                <span>{formatSec(duration)}</span>
              </div>
            </div>

            {/* Main Transport Buttons */}
            <div className="flex items-center justify-between px-3 mb-5">
              <button
                type="button"
                onClick={toggleShuffle}
                title={isShuffle ? "Tắt trộn bài" : "Bật trộn bài"}
                aria-label="Trộn bài"
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  isShuffle ? "text-white bg-white/[0.14]" : "text-white/50 hover:text-white"
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={prevSong}
                disabled={!currentSong}
                title="Bài trước"
                aria-label="Bài trước"
                className="p-2 rounded-full text-white/80 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                disabled={!currentSong && !isLoadingStream}
                title={isPlaying ? "Tạm dừng" : "Phát"}
                aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                className="w-12 h-12 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg disabled:opacity-40 cursor-pointer"
              >
                {isLoadingStream ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={nextSong}
                disabled={!currentSong}
                title="Bài tiếp theo"
                aria-label="Bài tiếp theo"
                className="p-2 rounded-full text-white/80 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>

              <button
                type="button"
                onClick={toggleRepeat}
                title="Lặp lại"
                aria-label="Lặp lại"
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  repeatMode !== "off"
                    ? "text-white bg-white/[0.14]"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {repeatMode === "one" ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
                aria-label={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
                className="text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                aria-label="Âm lượng"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-white"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Large Lyrics (60fps) OR Up Next Queue */}
        <div className="md:col-span-7 h-full min-h-0 flex flex-col">
          {fullscreenTab === "lyrics" ? (
            <LyricsView variant="fullscreen" />
          ) : (
            <div className="flex-1 flex flex-col min-h-0 pt-2">
              <div className="px-4 pb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Up Next</h3>
                <span className="text-xs text-white/50">{queue.length} bài hát</span>
              </div>

              <div className="flex-1 overflow-y-auto px-2 space-y-1.5">
                {queue.length === 0 ? (
                  <div className="py-24 text-center text-white/45 text-sm">
                    Hàng đợi đang trống
                  </div>
                ) : (
                  queue.map((song, idx) => {
                    const isCurrent = idx === queueIndex;
                    return (
                      <div
                        key={`${song.id}-${idx}`}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all group ${
                          isCurrent
                            ? "bg-white/[0.14] border border-white/[0.10]"
                            : "hover:bg-white/[0.08] border border-transparent"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => playSong(song, queue)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/[0.08] flex-shrink-0 relative">
                            <TrackThumbnail
                              src={song.thumbnail}
                              videoId={song.videoId || song.id}
                              alt={song.title}
                              iconSize="sm"
                              className="w-full h-full"
                            />
                            {isCurrent && (
                              <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                                <Play className="w-4 h-4 text-white fill-white" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">
                              {song.title}
                            </p>
                            <p className="text-xs text-white/55 truncate mt-0.5">
                              {song.artists.map((a) => a.name).join(", ")}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => openQuickSwitch(song, activePlaylistId)}
                          title="Tìm bản phát khác (YouTube)"
                          aria-label="Tìm bản phát khác"
                          className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/[0.10] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        <span className="text-xs text-white/50 tabular-nums w-10 text-right flex-shrink-0">
                          {song.duration ? formatSec(song.duration) : "--:--"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
