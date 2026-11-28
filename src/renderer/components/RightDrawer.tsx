// src/renderer/components/RightDrawer.tsx

import React from "react";
import { X, Maximize2, ListMusic, MessageSquareQuote, Music, Play, Infinity as InfinityIcon, Loader2 } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import { LyricsView } from "./LyricsView.tsx";
import { TrackThumbnail } from "./TrackThumbnail.tsx";

function formatDur(sec?: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const RightDrawer: React.FC = () => {
  const {
    rightDrawerTab,
    setRightDrawerTab,
    setFullscreenTab,
    setIsFullscreenPlayerOpen,
    queue,
    queueIndex,
    playSong,
    settings,
    updateSettings,
    isFetchingAutoplay,
  } = usePlayer();

  if (!rightDrawerTab) return null;

  const handleOpenFullscreen = () => {
    setFullscreenTab(rightDrawerTab);
    setIsFullscreenPlayerOpen(true);
  };

  return (
    <aside
      aria-label={rightDrawerTab === "lyrics" ? "Bảng lời bài hát" : "Danh sách chờ"}
      className="w-[340px] lg:w-[380px] h-full flex-shrink-0 bg-[#121216]/90 backdrop-blur-2xl border-l border-white/[0.08] flex flex-col select-none z-30 animate-fadeIn"
    >
      {/* Top Bar: Segmented Toggle (Up Next | Lyrics) + Expand + Close */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.06] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setRightDrawerTab("queue")}
            title="Danh sách chờ (Up Next)"
            aria-label="Danh sách chờ"
            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              rightDrawerTab === "queue"
                ? "bg-white/[0.16] text-white shadow-sm"
                : "text-white/55 hover:text-white"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Up Next</span>
          </button>

          <button
            type="button"
            onClick={() => setRightDrawerTab("lyrics")}
            title="Lời bài hát (Lyrics)"
            aria-label="Lời bài hát"
            className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              rightDrawerTab === "lyrics"
                ? "bg-white/[0.16] text-white shadow-sm"
                : "text-white/55 hover:text-white"
            }`}
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
            <span>Lyrics</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpenFullscreen}
            title="Mở toàn màn hình Now Playing"
            aria-label="Mở toàn màn hình"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setRightDrawerTab(null)}
            title="Đóng bảng bên phải"
            aria-label="Đóng bảng bên phải"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      {rightDrawerTab === "lyrics" ? (
        <LyricsView variant="drawer" />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 pb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-white tracking-tight">Up Next</h3>
            <span className="text-xs text-white/45">{queue.length} bài</span>
          </div>

          {/* Smart Autoplay Quick Switch */}
          <div className="mx-3 mb-2 px-3 py-2 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <InfinityIcon className="w-4 h-4 text-white/75 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-medium text-white/90 block truncate">
                  Tự động phát nhạc tương tự
                </span>
                {isFetchingAutoplay && (
                  <span className="text-[10.5px] text-white/50 flex items-center gap-1 mt-0.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Đang tìm gợi ý...</span>
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.autoplayEnabled}
              aria-label="Tự động phát nhạc tương tự (Autoplay)"
              onClick={() => updateSettings({ autoplayEnabled: !settings.autoplayEnabled })}
              className={`relative w-10 h-6 rounded-full shrink-0 transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                settings.autoplayEnabled ? "bg-[#fa243c]" : "bg-white/[0.16]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  settings.autoplayEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-16 text-white/45 px-4">
                <Music className="w-9 h-9 mb-2.5 opacity-35" />
                <p className="text-sm font-medium text-white/75">Hàng đợi đang trống</p>
                <p className="text-xs text-white/45 mt-1">
                  Phát một bài hát hoặc playlist để hiển thị danh sách phát tiếp theo.
                </p>
              </div>
            ) : (
              queue.map((song, idx) => {
                const isCurrent = idx === queueIndex;
                const showAutoplayDivider =
                  Boolean(song.isAutoplay) && (idx === 0 || !queue[idx - 1]?.isAutoplay);
                return (
                  <React.Fragment key={`${song.id}-${idx}`}>
                    {showAutoplayDivider && (
                      <div className="pt-3 pb-1.5 px-2 flex items-center gap-2">
                        <div className="h-px flex-1 bg-white/[0.10]" />
                        <span className="text-[10px] font-semibold tracking-[0.11em] uppercase text-white/45 whitespace-nowrap">
                          TỰ ĐỘNG PHÁT CÙNG CHỦ ĐỀ
                        </span>
                        <div className="h-px flex-1 bg-white/[0.10]" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => playSong(song, queue)}
                      className={`w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all cursor-pointer group ${
                        isCurrent
                          ? "bg-white/[0.12] border border-white/[0.10]"
                          : "hover:bg-white/[0.06] border border-transparent"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-white/[0.06] overflow-hidden flex-shrink-0 relative">
                        <TrackThumbnail
                          src={song.thumbnail}
                          videoId={song.videoId || song.id}
                          alt={song.title}
                          iconSize="sm"
                          className="w-full h-full"
                        />
                        {isCurrent && (
                          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 text-white fill-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {song.title}
                        </p>
                        <p className="text-xs text-white/55 truncate mt-0.5">
                          {song.artists.map((a) => a.name).join(", ")}
                          {song.autoplayVibe ? ` • ${song.autoplayVibe}` : ""}
                        </p>
                      </div>

                      <span className="text-xs text-white/40 tabular-nums flex-shrink-0">
                        {formatDur(song.duration)}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
