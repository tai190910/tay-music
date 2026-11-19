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
    <div className="absolute right-0 top-0 bottom-20 w-80 bg-[#0f151f]/95 backdrop-blur-md border-l border-[#1e293b] z-20 flex flex-col select-none shadow-[0_0_30px_rgba(0,0,0,0.7)] animate-fadeIn font-sans">
      {/* Header */}
      <div className="p-3.5 border-b border-[#1e293b] flex items-center justify-between bg-[#090d14]">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-[#2589f5]" />
          <div>
            <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              // DANH SÁCH CHỜ PHÁT
            </h3>
            <span className="text-[10px] font-mono text-[#8492a6]">
              [{queue.length} BÀI HÁT TRONG HÀNG ĐỢI]
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsQueueOpen(false)}
          className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Song List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-[#475569] font-mono p-4 text-xs">
            <Music className="w-8 h-8 mb-2 opacity-30" />
            <p>// HÀNG ĐỢI ĐANG TRỐNG</p>
          </div>
        ) : (
          queue.map((song, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song, queue)}
                className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-all border ${
                  isCurrent
                    ? "bg-[#16202e] border-[#2589f5] text-white shadow-[0_0_8px_rgba(37,137,245,0.2)]"
                    : "hover:bg-[#16202e]/60 text-[#8492a6] border-transparent hover:border-[#1e293b]"
                }`}
              >
                <div className="w-8 h-8 rounded-xs bg-[#090d14] overflow-hidden flex-shrink-0 border border-[#1e293b] relative">
                  {song.thumbnail ? (
                    <img
                      src={song.thumbnail}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-[#475569]" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs truncate font-medium ${
                      isCurrent ? "text-[#2589f5] font-bold" : "text-white"
                    }`}
                  >
                    {song.title}
                  </p>
                  <p className="text-[10px] text-[#38bdf8] truncate font-mono">
                    {song.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>

                {isCurrent && (
                  <span className="text-[9px] font-mono text-[#2ecc71] bg-[#2ecc71]/10 px-1 py-0.5 rounded-xs border border-[#2ecc71]/40 font-bold">
                    PLAYING
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
