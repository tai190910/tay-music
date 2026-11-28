// src/renderer/components/SongRow.tsx

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Pause,
  Heart,
  Plus,
  Trash2,
  Disc,
  RefreshCw,
  ListPlus,
  MoreHorizontal,
  ArrowDownToLine,
  Trash,
} from "lucide-react";
import type { Song } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";
import { TrackThumbnail } from "./TrackThumbnail.tsx";
import { DownloadButton } from "./DownloadButton.tsx";
import { usePlaylistPicker } from "./PlaylistPickerPopover.tsx";

interface SongRowProps {
  song: Song;
  index: number;
  playlistId?: string;
  playlistContext?: Song[];
  onAddToPlaylist?: (song: Song) => void;
  onRemoveFromPlaylist?: (songId: string) => void;
  onFixMatch?: (song: Song) => void;
  showRemoveOption?: boolean;
}

export const SongRow: React.FC<SongRowProps> = ({
  song,
  index,
  playlistId,
  playlistContext,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  showRemoveOption,
}) => {
  const {
    currentSong,
    isPlaying,
    isOnline,
    downloadedMap,
    playSong,
    togglePlay,
    addToQueue,
    openQuickSwitch,
    showInfoToast,
    downloadTrack,
    deleteDownloadedTrack,
  } = usePlayer();
  const { openPlaylistPicker } = usePlaylistPicker();
  const trackVid = (song.videoId || song.id || "").trim();
  const isDownloaded = Boolean(downloadedMap[trackVid]);
  const isUnavailableOffline = !isOnline && !isDownloaded;
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [hasCheckedLike, setHasCheckedLike] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("tay-close-context-menus", closeMenu);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("tay-close-context-menus", closeMenu);
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const checkLike = async () => {
    if (!hasCheckedLike && window.mochyApi) {
      const liked = await window.mochyApi.isLiked(song.id);
      setIsLiked(liked);
      setHasCheckedLike(true);
    }
  };

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.mochyApi) {
      const newLiked = await window.mochyApi.toggleLike(song.id, song);
      setIsLiked(newLiked);
      window.dispatchEvent(new CustomEvent("tay-likes-changed"));
    }
  };

  const isCurrent = currentSong?.id === song.id;

  const handlePlayClick = () => {
    if (isUnavailableOffline) {
      showInfoToast("Bài hát này chưa được tải xuống, cần kết nối mạng để phát");
      return;
    }
    if (isCurrent) {
      togglePlay();
    } else {
      playSong(song, playlistContext, playlistId ?? null);
    }
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    window.dispatchEvent(new CustomEvent("tay-close-context-menus"));
    const menuWidth = 260;
    const menuHeight = 225;
    const x = Math.max(8, Math.min(clientX, window.innerWidth - menuWidth));
    const y = Math.max(8, Math.min(clientY, window.innerHeight - menuHeight));
    setContextMenu({ x, y });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenuAt(e.clientX, e.clientY);
  };

  return (
    <>
      <div
        onMouseEnter={checkLike}
        onContextMenu={handleContextMenu}
        className={`group flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-sans transition-all duration-150 select-none border ${
          isCurrent
            ? "bg-white/[0.11] text-white border-white/[0.12] shadow-sm"
            : isUnavailableOffline
              ? "bg-transparent text-white/40 opacity-50 hover:opacity-75 hover:bg-white/[0.03] border-transparent"
              : "bg-transparent text-white/70 hover:text-white hover:bg-white/[0.06] border-transparent"
        }`}
      >
        {/* Main clickable area for playing track */}
        <button
          type="button"
          onClick={handlePlayClick}
          className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer focus:outline-none"
        >
          {/* Index or Equalizer or Play Hover */}
          <div className="w-7 flex items-center justify-center flex-shrink-0 text-xs tabular-nums text-white/40">
            {isCurrent && isPlaying ? (
              <span className="flex items-end justify-center gap-[2px] h-3.5 group-hover:hidden">
                <span className="w-[2.5px] bg-white rounded-full animate-visualizer-1 h-full" />
                <span className="w-[2.5px] bg-white/75 rounded-full animate-visualizer-2 h-full" />
                <span className="w-[2.5px] bg-white rounded-full animate-visualizer-3 h-full" />
              </span>
            ) : (
              <span className={`group-hover:hidden ${isCurrent ? "text-white font-semibold" : ""}`}>
                {index + 1}
              </span>
            )}
            <span className="hidden group-hover:flex items-center justify-center text-white">
              {isCurrent && isPlaying ? (
                <Pause className="w-4 h-4 fill-white" />
              ) : (
                <Play className="w-4 h-4 fill-white ml-0.5" />
              )}
            </span>
          </div>

          {/* Rounded Square Artwork */}
          <TrackThumbnail
            src={song.thumbnail}
            videoId={song.videoId || song.id}
            alt={song.title}
            iconSize="sm"
            className="w-10 h-10 rounded-lg bg-white/[0.06] flex-shrink-0 border border-white/[0.08]"
          />

          {/* Title & Artist */}
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-white">
                {song.title}
              </span>
              {song.id.startsWith("sc:") && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 flex-shrink-0">
                  SC
                </span>
              )}
              {song.explicit && (
                <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-white/[0.12] text-white/70 flex-shrink-0">
                  E
                </span>
              )}
            </div>
            <span className="text-xs text-white/55 truncate block mt-0.5">
              {song.artists.map((a) => a.name).join(", ")}
            </span>
          </div>
        </button>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
          <button
            type="button"
            onClick={handleToggleLike}
            title={isLiked ? "Bỏ thích" : "Yêu thích"}
            aria-label={isLiked ? "Bỏ thích" : "Yêu thích"}
            className={`p-1.5 rounded-full hover:bg-white/[0.10] transition-colors cursor-pointer ${
              isLiked ? "text-[#fa233b]" : "text-white/55 hover:text-white"
            }`}
          >
            <Heart className="w-3.5 h-3.5" style={{ fill: isLiked ? "currentColor" : "transparent" }} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openPlaylistPicker(song, e.currentTarget.getBoundingClientRect());
            }}
            title="Thêm vào playlist"
            aria-label="Thêm vào playlist"
            className="p-1.5 rounded-full hover:bg-white/[0.10] text-white/55 hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <DownloadButton song={song} size="sm" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openQuickSwitch(song, playlistId ?? null);
            }}
            title="Tìm bản phát khác (Đổi nguồn phát YouTube)"
            aria-label="Tìm bản phát khác"
            className="p-1.5 rounded-full hover:bg-white/[0.10] text-white/55 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {showRemoveOption && onRemoveFromPlaylist && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromPlaylist(song.id);
              }}
              title="Xóa khỏi playlist"
              aria-label="Xóa khỏi playlist"
              className="p-1.5 rounded-full hover:bg-rose-500/20 text-white/55 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMenuAt(rect.right - 250, rect.bottom + 6);
            }}
            title="Tùy chọn khác"
            aria-label="Tùy chọn khác"
            className="p-1.5 rounded-full hover:bg-white/[0.10] text-white/55 hover:text-white transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Duration */}
        <div className="text-xs tabular-nums text-white/45 w-11 text-right flex-shrink-0">
          {song.durationText ||
            (song.duration && song.duration > 0
              ? `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, "0")}`
              : "--:--")}
        </div>
      </div>

      {contextMenu &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[70] w-[256px] bg-[#1c1c22]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_18px_50px_rgba(0,0,0,0.85)] p-1.5 text-[13px] font-sans select-none animate-fadeIn"
          >
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                openQuickSwitch(song, playlistId ?? null);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl text-white hover:bg-white/[0.10] font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="truncate">Tìm bản phát khác (YouTube)</span>
            </button>

            <div className="my-1 h-px bg-white/[0.08]" />

            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                handlePlayClick();
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl text-white/85 hover:bg-white/[0.10] hover:text-white transition-colors cursor-pointer"
            >
              {isCurrent && isPlaying ? (
                <>
                  <Pause className="w-4 h-4 flex-shrink-0" />
                  <span>Tạm dừng</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 flex-shrink-0" />
                  <span>Phát ngay</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                addToQueue(song);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl text-white/85 hover:bg-white/[0.10] hover:text-white transition-colors cursor-pointer"
            >
              <ListPlus className="w-4 h-4 flex-shrink-0" />
              <span>Thêm vào hàng đợi</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu(null);
                openPlaylistPicker(song, rect);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl text-white/85 hover:bg-white/[0.10] hover:text-white transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              <span>Thêm vào playlist...</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                if (isDownloaded) {
                  if (window.confirm(`Xóa file tải offline của "${song.title}" khỏi ổ cứng?`)) {
                    deleteDownloadedTrack(trackVid);
                  }
                } else {
                  downloadTrack(song);
                }
              }}
              className={`w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl transition-colors cursor-pointer ${
                isDownloaded
                  ? "text-emerald-300 hover:bg-rose-500/15 hover:text-rose-300"
                  : "text-white/85 hover:bg-white/[0.10] hover:text-white"
              }`}
            >
              {isDownloaded ? (
                <>
                  <Trash className="w-4 h-4 flex-shrink-0" />
                  <span>Xóa file tải Offline</span>
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-4 h-4 flex-shrink-0" />
                  <span>Tải xuống nghe Offline</span>
                </>
              )}
            </button>

            {showRemoveOption && onRemoveFromPlaylist && (
              <>
                <div className="my-1 h-px bg-white/[0.08]" />
                <button
                  type="button"
                  onClick={() => {
                    setContextMenu(null);
                    onRemoveFromPlaylist(song.id);
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2.5 rounded-xl text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  <span>Xóa khỏi playlist</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
};
