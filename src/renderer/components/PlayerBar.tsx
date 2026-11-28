// src/renderer/components/PlayerBar.tsx

import React, { useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  MessageSquareQuote,
  ListMusic,
  Heart,
  Loader2,
  RefreshCw,
  Maximize2,
  Plus,
  WifiOff,
} from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import { TrackThumbnail } from "./TrackThumbnail.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { usePlaylistPicker } from "./PlaylistPickerPopover.tsx";
import appIcon from "../assets/app-icon.png";

interface PlayerBarProps {
  sidebarExpanded?: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ sidebarExpanded = false }) => {
  const {
    audioRef,
    activeDeck,
    currentSong,
    isPlaying,
    duration,
    repeatMode,
    isShuffle,
    isLiked,
    isLoadingStream,
    isOnline,
    rightDrawerTab,
    activePlaylistId,
    togglePlay,
    nextSong,
    prevSong,
    seek,
    toggleRepeat,
    toggleShuffle,
    toggleLikeCurrent,
    toggleRightDrawer,
    setIsFullscreenPlayerOpen,
    openQuickSwitch,
  } = usePlayer();
  const { openPlaylistPicker } = usePlaylistPicker();

  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const rangeInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const prevSongIdRef = useRef<string | undefined>(currentSong?.id);

  const syncProgressUI = useCallback(
    (timeSec: number, fromUserInput = false) => {
      const dur = duration || audioRef.current?.duration || 0;
      const ratio = dur > 0 ? Math.max(0, Math.min(1, timeSec / dur)) : 0;

      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${ratio})`;
      }
      if (rangeInputRef.current && !isDraggingRef.current && !fromUserInput) {
        rangeInputRef.current.value = String(timeSec);
      }
    },
    [audioRef, duration]
  );

  // Sync progress bar directly from HTMLAudioElement events without triggering React re-renders
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioProgress = () => {
      syncProgressUI(audio.currentTime || 0);
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
      }
    };

    audio.addEventListener("timeupdate", handleAudioProgress);
    audio.addEventListener("seeking", handleAudioProgress);
    audio.addEventListener("seeked", handleAudioProgress);
    audio.addEventListener("loadedmetadata", handleAudioProgress);
    audio.addEventListener("ended", handleAudioProgress);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    if (prevSongIdRef.current !== currentSong?.id) {
      prevSongIdRef.current = currentSong?.id;
      syncProgressUI(0);
    } else {
      handleAudioProgress();
    }

    return () => {
      audio.removeEventListener("timeupdate", handleAudioProgress);
      audio.removeEventListener("seeking", handleAudioProgress);
      audio.removeEventListener("seeked", handleAudioProgress);
      audio.removeEventListener("loadedmetadata", handleAudioProgress);
      audio.removeEventListener("ended", handleAudioProgress);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [audioRef, syncProgressUI, currentSong?.id, activeDeck]);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    syncProgressUI(val, true);
    seek(val);
  };

  return (
    <div
      className={`pointer-events-none absolute top-3.5 inset-x-0 z-40 flex justify-center transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        sidebarExpanded ? "pl-[284px] pr-4" : "pl-[88px] pr-4"
      }`}
    >
      <header
        aria-label="Dynamic Island Player"
        className="max-w-full select-none pointer-events-auto"
      >
      <div className="relative rounded-full bg-[#202025]/82 backdrop-blur-2xl border border-white/[0.11] shadow-[0_14px_45px_rgba(0,0,0,0.68)] px-3 py-1.5 flex items-center gap-2.5 sm:gap-3">
        {/* Track Thumbnail + Metadata (opens Fullscreen Player) */}
        {currentSong ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsFullscreenPlayerOpen(true)}
              title="Mở trình phát toàn màn hình"
              className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer rounded-full focus:outline-none"
            >
              <TrackThumbnail
                src={currentSong.thumbnail}
                videoId={currentSong.videoId || currentSong.id}
                alt={currentSong.title}
                iconSize="sm"
                className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.10] flex-shrink-0 shadow-sm relative"
                imgClassName="group-hover:scale-105 transition-transform duration-200"
              />

              <div className="flex flex-col min-w-0 max-w-[140px] sm:max-w-[175px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-white truncate group-hover:text-white/90">
                    {currentSong.title}
                  </span>
                  {isPlaying && (
                    <span className="flex items-end gap-[2px] h-2.5 flex-shrink-0" aria-hidden="true">
                      <span className="w-[2px] bg-white/80 rounded-full animate-visualizer-1 h-full" />
                      <span className="w-[2px] bg-white/60 rounded-full animate-visualizer-2 h-full" />
                      <span className="w-[2px] bg-white/80 rounded-full animate-visualizer-3 h-full" />
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-white/55 truncate">
                  {currentSong.artists.map((a) => a.name).join(", ") || "Nghệ sĩ chưa rõ"}
                </span>
              </div>
            </button>

            {/* Like + Add to Playlist + Quick Switch micro buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                type="button"
                onClick={toggleLikeCurrent}
                title={isLiked ? "Bỏ thích" : "Yêu thích"}
                aria-label={isLiked ? "Bỏ thích" : "Yêu thích"}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  isLiked
                    ? "text-[#fa233b] hover:bg-white/[0.08]"
                    : "text-white/50 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <Heart
                  className="w-3.5 h-3.5"
                  style={{ fill: isLiked ? "currentColor" : "transparent" }}
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPlaylistPicker(currentSong, e.currentTarget.getBoundingClientRect());
                }}
                title="Thêm bài đang phát vào playlist"
                aria-label="Thêm vào playlist"
                className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              <DownloadButton song={currentSong} size="sm" />

              <button
                type="button"
                onClick={() => openQuickSwitch(currentSong, activePlaylistId)}
                title="Tìm bản phát khác (YouTube)"
                aria-label="Tìm bản phát khác"
                className="hidden sm:flex p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 pr-1 min-w-0">
            <img
              src={appIcon}
              alt="Tày Music"
              decoding="async"
              className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-white/[0.12] shadow-sm"
            />
            <div className="flex flex-col min-w-0 pr-1">
              <span className="text-[13px] font-semibold text-white/85 truncate">Tày Music</span>
              <span className="text-[11px] text-white/45 truncate">Chọn bài hát để phát</span>
            </div>
          </div>
        )}

        {/* Primary Transport Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={prevSong}
            disabled={!currentSong}
            title="Bài trước"
            aria-label="Bài trước"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={!currentSong && !isLoadingStream}
            title={isPlaying ? "Tạm dừng" : "Phát"}
            aria-label={isPlaying ? "Tạm dừng" : "Phát"}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.14] hover:bg-white/[0.24] text-white disabled:opacity-35 transition-all active:scale-95 cursor-pointer"
          >
            {isLoadingStream ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={nextSong}
            disabled={!currentSong}
            title="Bài tiếp theo"
            aria-label="Bài tiếp theo"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Hairline Vertical Divider */}
        <div className="w-px h-4 bg-white/[0.12] flex-shrink-0" />

        {/* Secondary Controls: Shuffle, Repeat, Queue Drawer, Lyrics Drawer, Fullscreen */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {!isOnline && (
            <span
              title="Mất kết nối mạng: Chỉ phát được các bài đã tải Offline"
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 mr-1 rounded-full bg-amber-500/15 border border-amber-400/35 text-amber-200 text-[10.5px] font-medium"
            >
              <WifiOff className="w-3 h-3" />
              <span>Chế độ Offline</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleShuffle}
            title={isShuffle ? "Tắt trộn bài" : "Bật trộn bài"}
            aria-label="Trộn bài"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isShuffle
                ? "bg-white/[0.16] text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleRepeat}
            title={
              repeatMode === "one"
                ? "Lặp lại 1 bài"
                : repeatMode === "all"
                ? "Lặp lại danh sách"
                : "Không lặp lại"
            }
            aria-label="Lặp lại"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              repeatMode !== "off"
                ? "bg-white/[0.16] text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-3.5 h-3.5" />
            ) : (
              <Repeat className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleRightDrawer("queue")}
            title="Danh sách chờ (Up Next)"
            aria-label="Danh sách chờ"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              rightDrawerTab === "queue"
                ? "bg-white/[0.18] text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => toggleRightDrawer("lyrics")}
            title="Lời bài hát (Lyrics)"
            aria-label="Lời bài hát"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              rightDrawerTab === "lyrics"
                ? "bg-white/[0.18] text-white"
                : "text-white/55 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
          </button>

          {currentSong && (
            <button
              type="button"
              onClick={() => setIsFullscreenPlayerOpen(true)}
              title="Mở toàn màn hình Now Playing"
              aria-label="Mở toàn màn hình"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Integrated Thin Seek Bar along bottom edge of Pill */}
        <div
          className="group/seek absolute bottom-0 left-5 right-5 h-[3px] hover:h-[5px] transition-all flex items-center"
          title="Kéo hoặc nhấp để tua bài"
        >
          <div className="w-full h-full bg-white/[0.10] rounded-full overflow-hidden pointer-events-none">
            <div
              ref={progressFillRef}
              className="h-full w-full origin-left bg-white/85 rounded-full"
              style={{ transform: "scaleX(0)", willChange: "transform" }}
            />
          </div>
          <input
            ref={rangeInputRef}
            type="range"
            aria-label="Thanh tiến trình bài hát"
            min={0}
            max={duration || 100}
            step={0.5}
            defaultValue={0}
            onPointerDown={() => {
              isDraggingRef.current = true;
            }}
            onChange={handleSeekChange}
            disabled={!currentSong}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
      </header>
    </div>
  );
};
