// src/renderer/components/QueueDrawer.tsx

import React from "react";
import { X, Play, Music, Trash2 } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";

export const QueueDrawer: React.FC = () => {
  const {
    queue,
    queueIndex,
    isQueueOpen,
    setIsQueueOpen,
    playSong,
  } = usePlayer();

  if (!isQueueOpen) return null;

  return (
    <div className="absolute right-0 top-0 bottom-22 w-80 bg-mochy-sidebar border-l border-mochy-border z-20 flex flex-col select-none shadow-2xl animate-fadeIn">
      {/* Header */}
      <div className="p-4 border-b border-mochy-border/60 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Danh sách chờ phát
          </h3>
          <span className="text-xs text-mochy-subtext">
            {queue.length} bài hát
          </span>
        </div>
        <button
          onClick={() => setIsQueueOpen(false)}
          className="p-1 rounded-md text-mochy-muted hover:text-white hover:bg-mochy-cardHover transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Song List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-mochy-subtext p-4">
            <Music className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">Chưa có bài hát trong danh sách chờ</p>
          </div>
        ) : (
          queue.map((song, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song, queue)}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors group ${
                  isCurrent
                    ? "bg-mochy-card border border-mochy-border/80 text-white"
                    : "hover:bg-mochy-cardHover/60 text-mochy-muted"
                }`}
              >
                <div className="w-9 h-9 rounded bg-mochy-card overflow-hidden flex-shrink-0 relative">
                  {song.thumbnail ? (
                    <img
                      src={song.thumbnail}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-mochy-card">
                      <Music className="w-4 h-4 text-mochy-subtext" />
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-mochy-accent animate-ping" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-medium truncate ${
                      isCurrent ? "text-mochy-accent font-semibold" : "text-white"
                    }`}
                  >
                    {song.title}
                  </p>
                  <p className="text-[11px] text-mochy-subtext truncate">
                    {song.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
