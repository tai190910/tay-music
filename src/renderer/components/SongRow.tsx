// src/renderer/components/SongRow.tsx

import React, { useState } from "react";
import { Play, Pause, Heart, Plus, Trash2, Disc, RefreshCw } from "lucide-react";
import type { Song } from "../types.ts";
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
  const { currentSong, isPlaying, playSong, togglePlay } = usePlayer();
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [hasCheckedLike, setHasCheckedLike] = useState<boolean>(false);

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
      className={`group flex items-center gap-3.5 px-3 py-2 rounded-xs text-xs font-sans transition-all duration-150 cursor-pointer select-none border ${
        isCurrent
          ? "bg-[#161a22] text-white border-[#00f0ff]/40 shadow-[0_0_12px_rgba(0,240,255,0.08)]"
          : "bg-transparent text-[#8492a6] hover:text-white hover:bg-[#181c24] border-transparent hover:border-[#242a35]"
      }`}
    >
      {/* Monospace Index or Equalizer or Play Button */}
      <div className="w-7 flex items-center justify-center flex-shrink-0 font-mono text-[11px] text-[#444c5c]">
        {isCurrent && isPlaying ? (
          <div className="flex items-end justify-center gap-0.5 h-3.5 group-hover:hidden">
            <span className="w-0.5 bg-[#00ff9d] rounded-full animate-visualizer-1 h-full" />
            <span className="w-0.5 bg-[#00f0ff] rounded-full animate-visualizer-2 h-full" />
            <span className="w-0.5 bg-[#00ff9d] rounded-full animate-visualizer-3 h-full" />
          </div>
        ) : (
          <span className={`group-hover:hidden ${isCurrent ? "text-[#00f0ff] font-bold" : ""}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlayClick();
          }}
          className="hidden group-hover:block hover:scale-110 active:scale-95 transition-transform"
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-3.5 h-3.5 text-[#00f0ff] fill-[#00f0ff]" />
          ) : (
            <Play className="w-3.5 h-3.5 text-[#00f0ff] fill-[#00f0ff] ml-0.5" />
          )}
        </button>
      </div>

      {/* Square Thumbnail with 1px border */}
      <div className="w-9 h-9 rounded-xs overflow-hidden bg-[#181c24] flex-shrink-0 border border-[#242a35] relative group-hover:border-[#00f0ff]/40 transition-colors">
        {song.thumbnail ? (
          <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#181c24]">
            <Disc className="w-4 h-4 text-[#444c5c]" />
          </div>
        )}
      </div>

      {/* Title & Artist */}
      <div className="flex-1 min-w-0 pr-3">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-xs tracking-tight transition-colors ${
              isCurrent ? "text-[#00f0ff] font-bold" : "text-[#e2e8f0] font-medium"
            }`}
          >
            {song.title}
          </span>
          {song.explicit && (
            <span className="text-[8px] font-mono font-bold px-1 rounded-xs bg-[#242a35] text-[#8492a6] border border-[#323b4a] flex-shrink-0">
              EXP
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#8492a6] truncate block mt-0.5">
          {song.artists.map((a) => a.name).join(", ")}
        </span>
      </div>

      {/* Duration (Monospace) */}
      <div className="text-[11px] font-mono text-[#8492a6] w-12 text-right">
        {song.durationText ||
          (song.duration && song.duration > 0
            ? `${Math.floor(song.duration / 60).toString().padStart(2, "0")}:${(song.duration % 60).toString().padStart(2, "0")}`
            : "--:--")}
      </div>

      {/* Cyber Action Buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleToggleLike}
          title={isLiked ? "Bỏ thích" : "Yêu thích"}
          className="p-1 rounded-xs hover:bg-[#242a35] text-[#8492a6] hover:text-[#ff3366] transition-colors"
        >
          <Heart
            className={`w-3.5 h-3.5 ${
              isLiked ? "fill-[#ff3366] text-[#ff3366] opacity-100" : ""
            }`}
          />
        </button>

        {onAddToPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToPlaylist(song);
            }}
            title="Thêm vào playlist"
            className="p-1 rounded-xs hover:bg-[#242a35] text-[#8492a6] hover:text-[#00f0ff] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {onFixMatch && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFixMatch(song);
            }}
            title="Đổi phiên bản / Khớp lại"
            className="p-1 rounded-xs hover:bg-[#242a35] text-[#8492a6] hover:text-[#00ff9d] transition-colors"
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
            title="Xóa khỏi playlist"
            className="p-1 rounded-xs hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
