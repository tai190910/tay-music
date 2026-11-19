// src/renderer/components/QueueDrawer.tsx

import React from "react";
import { X, Play, Music, ListMusic } from "lucide-react";
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
    <div className="absolute right-0 top-0 bottom-22 w-80 bg-[#13161c]/95 backdrop-blur-md border-l border-[#242a35] z-20 flex flex-col select-none shadow-[0_0_30px_rgba(0,0,0,0.6)] animate-fadeIn font-sans">
      {/* Header */}
      <div className="p-3.5 border-b border-[#242a35] flex items-center justify-between bg-[#101217]">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#00f0ff]" />
          <div>
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              // PLAYBACK_QUEUE
            </h3>
            <span className="text-[10px] font-mono text-[#8492a6]">
              [{queue.length} TRACKS LOADED]
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsQueueOpen(false)}
          className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Song List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#444c5c] font-mono p-4 text-xs">
            <Music className="w-8 h-8 mb-2 opacity-30" />
            <p>// EMPTY_QUEUE: Chưa có bài hát chờ phát</p>
          </div>
        ) : (
          queue.map((song, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song, queue)}
                className={`flex items-center gap-2.5 p-2 rounded-xs cursor-pointer transition-all border ${
                  isCurrent
                    ? "bg-[#181c24] border-[#00f0ff]/40 text-white shadow-[0_0_8px_rgba(0,240,255,0.1)]"
                    : "hover:bg-[#181c24]/60 text-[#8492a6] border-transparent hover:border-[#242a35]"
                }`}
              >
                <div className="w-8 h-8 rounded-xs bg-[#0d0f12] overflow-hidden flex-shrink-0 border border-[#242a35] relative">
                  {song.thumbnail ? (
                    <img
                      src={song.thumbnail}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-[#444c5c]" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs truncate font-medium ${
                      isCurrent ? "text-[#00f0ff] font-bold" : "text-white"
                    }`}
                  >
                    {song.title}
                  </p>
                  <p className="text-[10px] text-[#8492a6] truncate font-mono">
                    {song.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>

                {isCurrent && (
                  <span className="text-[9px] font-mono text-[#00ff9d] bg-[#00ff9d]/10 px-1 py-0.5 rounded-xs border border-[#00ff9d]/30 font-bold">
                    PLAY
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
