// src/renderer/components/DownloadButton.tsx

import React from "react";
import { ArrowDownToLine, CheckCircle2, X } from "lucide-react";
import type { Song } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";

interface DownloadButtonProps {
  song: Song;
  size?: "sm" | "md";
  className?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  song,
  size = "sm",
  className = "",
}) => {
  const {
    downloadedMap,
    downloadProgressMap,
    downloadTrack,
    cancelDownload,
    deleteDownloadedTrack,
  } = usePlayer();

  const vid = (song.videoId || song.id || "").trim();
  if (!vid) return null;

  const isDownloaded = Boolean(downloadedMap[vid]);
  const progress = downloadProgressMap[vid];
  const isDownloading =
    progress?.status === "queued" || progress?.status === "downloading";

  const iconCls = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";
  const ringSize = size === "md" ? 20 : 15;
  const padCls = size === "md" ? "p-2" : "p-1.5";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) {
      cancelDownload(vid);
      return;
    }
    if (isDownloaded) {
      if (window.confirm(`Xóa file tải offline của "${song.title}" khỏi ổ cứng?`)) {
        deleteDownloadedTrack(vid);
      }
      return;
    }
    downloadTrack(song);
  };

  if (isDownloading) {
    const pct = Math.max(0, Math.min(100, progress?.percent ?? 0));
    const r = (ringSize - 2.5) / 2;
    const c = 2 * Math.PI * r;
    const dashOffset = c * (1 - pct / 100);

    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Đang tải (${pct}%) - Bấm để hủy`}
        aria-label={`Hủy tải ${song.title}`}
        className={`relative group/dl rounded-full flex items-center justify-center bg-white/[0.08] hover:bg-rose-500/20 text-white transition-colors cursor-pointer flex-shrink-0 ${padCls} ${className}`}
      >
        <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
          <svg
            width={ringSize}
            height={ringSize}
            viewBox={`0 0 ${ringSize} ${ringSize}`}
            className="-rotate-90 group-hover/dl:opacity-25 transition-opacity"
          >
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={2}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={r}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              strokeDasharray={c}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-[7px] font-bold tabular-nums text-emerald-300 group-hover/dl:hidden">
            {pct}
          </span>
          <X className="absolute w-2.5 h-2.5 text-rose-300 hidden group-hover/dl:block" />
        </div>
      </button>
    );
  }

  if (isDownloaded) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Đã tải xuống (Offline) - Bấm để xóa file cục bộ"
        aria-label={`Đã tải ${song.title}, bấm để xóa`}
        className={`rounded-full hover:bg-white/[0.10] text-emerald-400 transition-all cursor-pointer flex-shrink-0 ${padCls} ${className}`}
      >
        <CheckCircle2
          className={`${iconCls} drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]`}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Tải xuống nghe Offline (kèm ảnh bìa & lyrics)"
      aria-label={`Tải xuống ${song.title}`}
      className={`rounded-full hover:bg-white/[0.10] text-white/55 hover:text-white transition-colors cursor-pointer flex-shrink-0 ${padCls} ${className}`}
    >
      <ArrowDownToLine className={iconCls} />
    </button>
  );
};
