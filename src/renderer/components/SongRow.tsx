// src/renderer/components/SongRow.tsx

import React, { useState } from "react";
import { Play, Pause, Heart, Plus, MoreHorizontal, Disc, RefreshCw } from "lucide-react";
import type { Song, Playlist } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";

interface SongRowProps {
  song: Song;
  index: number;
  playlistContext?: Song[];
  onAddToPlaylist?: (song: Song) => void;
  onRemoveFromPlaylist?: (songId: string) => void;
  onFixMatch?: (song: Song) => void;
  showRemoveOption?: boolean;
}

export const SongRow: React.FC<SongRowProps> = ({
  song,
  index,
  playlistContext,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onFixMatch,
  showRemoveOption,
}) => {
  const { currentSong, isPlaying, playSong, togglePlay, accentColor } = usePlayer();
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [hasCheckedLike, setHasCheckedLike] = useState<boolean>(false);

  // Check like state on hover or mount
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
    }
  };

  const isCurrent = currentSong?.id === song.id;

  const handlePlayClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playSong(song, playlistContext);
    }
  };

  return (
    <div
      onMouseEnter={checkLike}
      onClick={handlePlayClick}
      className={`group flex items-center gap-4 px-3 py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer select-none ${
        isCurrent
          ? "bg-white/5 font-medium border border-white/10 shadow-sm"
          : "hover:bg-white/5 text-mochy-muted hover:text-white"
      }`}
    >
      {/* Index or Play/Pause Button or Animated Equalizer */}
      <div className="w-6 flex items-center justify-center flex-shrink-0 text-xs text-mochy-subtext font-mono">
        {isCurrent && isPlaying ? (
          <div className="flex items-end justify-center gap-0.5 h-3.5 group-hover:hidden">
            <span
              className="w-0.5 rounded-full"
              style={{
                backgroundColor: accentColor.hex,
                height: "100%",
                animation: "visualizerBounce 0.6s ease-in-out infinite alternate",
              }}
            />
            <span
              className="w-0.5 rounded-full"
              style={{
                backgroundColor: accentColor.hex,
                height: "60%",
                animation: "visualizerBounce 0.8s ease-in-out infinite alternate",
                animationDelay: "0.15s",
              }}
            />
            <span
              className="w-0.5 rounded-full"
              style={{
                backgroundColor: accentColor.hex,
                height: "80%",
                animation: "visualizerBounce 0.5s ease-in-out infinite alternate",
                animationDelay: "0.3s",
              }}
            />
          </div>
        ) : (
          <span className={`group-hover:hidden ${isCurrent ? "hidden" : "block"}`}>
            {index + 1}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlayClick();
          }}
          className={`hover:scale-110 active:scale-95 transition-transform ${
            isCurrent ? "hidden group-hover:block" : "hidden group-hover:block"
          }`}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" style={{ fill: accentColor.hex, color: accentColor.hex }} />
          ) : (
            <Play
              className="w-4 h-4 ml-0.5"
              style={{
                fill: isCurrent ? accentColor.hex : "#ffffff",
                color: isCurrent ? accentColor.hex : "#ffffff",
              }}
            />
          )}
        </button>
      </div>

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-mochy-card flex-shrink-0 border border-mochy-border/40 relative shadow-sm group-hover:scale-105 transition-transform">
        {song.thumbnail ? (
          <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-mochy-card">
            <Disc className="w-5 h-5 text-mochy-subtext" />
          </div>
        )}
      </div>

      {/* Title & Artist */}
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-sm font-medium transition-colors"
            style={{
              color: isCurrent ? accentColor.hex : undefined,
              fontWeight: isCurrent ? 700 : 500,
            }}
          >
            {song.title}
          </span>
          {song.explicit && (
            <span className="text-[9px] font-bold px-1 rounded bg-mochy-card text-mochy-subtext border border-mochy-border flex-shrink-0">
              E
            </span>
          )}
        </div>
        <span className="text-xs text-mochy-muted truncate block">
          {song.artists.map((a) => a.name).join(", ")}
        </span>
      </div>

      {/* Duration */}
      <div className="text-xs font-mono text-mochy-subtext w-12 text-right">
        {song.durationText ||
          (song.duration && song.duration > 0
            ? `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, "0")}`
            : "--:--")}
      </div>

      {/* Action Buttons: Like, Add to Playlist */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleToggleLike}
          title={isLiked ? "Bỏ thích" : "Yêu thích"}
          className={`p-1.5 rounded-full hover:bg-mochy-card transition-colors ${
            isLiked ? "text-mochy-accent opacity-100" : "opacity-0 group-hover:opacity-100 text-mochy-subtext hover:text-white"
          }`}
        >
          <Heart className={`w-4 h-4 ${isLiked ? "fill-mochy-accent text-mochy-accent" : ""}`} />
        </button>

        {onAddToPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToPlaylist(song);
            }}
            title="Thêm vào playlist"
            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 text-mochy-subtext hover:text-white hover:bg-mochy-card transition-all"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}

        {onFixMatch && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFixMatch(song);
            }}
            title="Đổi phiên bản / Khớp lại"
            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 text-mochy-subtext hover:text-mochy-accent hover:bg-mochy-card transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {showRemoveOption && onRemoveFromPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFromPlaylist(song.id);
            }}
            title="Xóa khỏi playlist này"
            className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-all"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
