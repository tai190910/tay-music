// src/renderer/components/FixMatchModal.tsx

import React, { useEffect, useState } from "react";
import { X, Search, Check, RefreshCw, Disc, Terminal } from "lucide-react";
import type { Song } from "../types.ts";

interface FixMatchModalProps {
  song: Song;
  playlistId: string;
  onClose: () => void;
  onReplaced: (newSong: Song) => void;
}

export const FixMatchModal: React.FC<FixMatchModalProps> = ({
  song,
  playlistId,
  onClose,
  onReplaced,
}) => {
  const primaryArtist = song.artists[0]?.name || "";
  const [query, setQuery] = useState(`${song.title} ${primaryArtist}`.trim());
  const [candidates, setCandidates] = useState<Array<{ song: any; score: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async (searchTitle: string, searchArtist: string) => {
    if (!window.mochyApi) return;
    setLoading(true);
    setError(null);
    try {
      const results = await window.mochyApi.getTrackCandidates({
        title: searchTitle,
        artist: searchArtist,
        duration: song.duration,
      });
      setCandidates(results || []);
    } catch (err: any) {
      console.error("Failed to fetch candidates:", err);
      setError("Không thể tải danh sách gợi ý từ YouTube.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates(song.title, primaryArtist);
  }, [song.id]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    fetchCandidates(query.trim(), "");
  };

  const handleSelectCandidate = async (candidateSong: any) => {
    if (!window.mochyApi || replacingId) return;
    setReplacingId(candidateSong.id);
    try {
      const newSongData: Song = {
        id: candidateSong.id,
        title: candidateSong.title,
        artists: candidateSong.artists || [{ name: primaryArtist, id: null }],
        duration: candidateSong.duration || song.duration || 0,
        thumbnail: candidateSong.thumbnail || song.thumbnail,
        album: candidateSong.album?.name || song.album,
        explicit: candidateSong.explicit,
      };

      await window.mochyApi.replacePlaylistSong(playlistId, song.id, newSongData);
      onReplaced(newSongData);
      onClose();
    } catch (err: any) {
      console.error("Failed to replace song:", err);
      setError("Có lỗi khi thay thế bài hát. Vui lòng thử lại.");
    } finally {
      setReplacingId(null);
    }
  };

  const formatSec = (sec?: number | null) => {
    if (!sec || sec <= 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/80 animate-fadeIn select-none font-sans">
      <div className="relative bg-[#13161c] border border-[#242a35] rounded-xs w-full max-w-2xl overflow-hidden shadow-[0_0_35px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]">
        {/* Subtle corner notches */}
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#00f0ff]" />
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[#00f0ff]" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#242a35] bg-[#101217]">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-[#00f0ff]" />
            <div>
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                // FIX_TRACK_MATCH // YT_RESOLVER
              </h3>
              <p className="text-[10px] font-mono text-[#8492a6]">
                Chọn bản thu khớp chuẩn nhất trên YouTube Music để ghi đè vào SQLite
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Song Reference */}
        <div className="px-5 py-2.5 bg-[#0d0f12] border-b border-[#242a35] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 truncate pr-4">
            <span className="text-[#444c5c]">// TARGET:</span>
            <span className="font-bold text-white truncate font-sans">{song.title}</span>
            <span className="text-[#8492a6] truncate">— {song.artists.map((a) => a.name).join(", ")}</span>
          </div>
          <span className="text-[#00f0ff] font-bold flex-shrink-0">
            [{formatSec(song.duration)}]
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-[#242a35] bg-[#13161c]">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 bg-[#181c24] border border-[#242a35] rounded-xs flex items-center px-2.5">
              <Search className="w-3.5 h-3.5 text-[#444c5c] mr-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên bài hát hoặc ca sĩ để tìm kiếm ứng cử viên khác..."
                className="w-full py-1.5 bg-transparent text-xs text-white placeholder-[#444c5c] font-mono focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-1.5 bg-[#00f0ff] hover:bg-[#33f3ff] text-black rounded-xs text-xs font-mono font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-[0_0_8px_rgba(0,240,255,0.3)] cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>[ TÌM ]</span>
            </button>
          </form>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-xs font-mono text-[#00f0ff] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>SEARCHING_YOUTUBE_CANDIDATES...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400 font-mono text-xs">
              <p>// ERROR: {error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-[#444c5c] font-mono text-xs">
              <p>// ZERO_MATCHES: Không tìm thấy ứng cử viên phù hợp</p>
            </div>
          ) : (
            candidates.map(({ song: cand, score }) => {
              const deltaSec =
                cand.duration && song.duration
                  ? Math.round(cand.duration - song.duration)
                  : null;
              const isCloseDuration = deltaSec !== null && Math.abs(deltaSec) <= 4;
              const isReplacing = replacingId === cand.id;

              return (
                <div
                  key={cand.id}
                  onClick={() => handleSelectCandidate(cand)}
                  className={`p-2.5 rounded-xs border transition-all cursor-pointer flex items-center gap-3 ${
                    isReplacing
                      ? "bg-[#181c24] border-[#00f0ff] text-white"
                      : "bg-[#13161c] border-[#242a35] hover:border-[#00f0ff]/50 hover:bg-[#181c24] text-[#8492a6] hover:text-white"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xs overflow-hidden bg-[#0d0f12] border border-[#242a35] flex-shrink-0">
                    {cand.thumbnail ? (
                      <img src={cand.thumbnail} alt={cand.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-5 h-5 text-[#444c5c]" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs font-bold text-white truncate font-sans">
                      {cand.title}
                    </p>
                    <p className="text-[11px] text-[#8492a6] truncate font-mono">
                      {cand.artists?.map((a: any) => a.name).join(", ")}
                    </p>
                  </div>

                  {/* Telemetry badges */}
                  <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[10px]">
                    <span className="text-[#8492a6]">{formatSec(cand.duration)}</span>

                    {deltaSec !== null && (
                      <span
                        className={`px-1.5 py-0.5 rounded-xs font-bold border ${
                          isCloseDuration
                            ? "bg-[#14231b] text-[#00ff9d] border-[#00ff9d]/30"
                            : "bg-amber-950/30 text-amber-400 border-amber-900/30"
                        }`}
                      >
                        {deltaSec >= 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                      </span>
                    )}

                    <span className="text-[#00f0ff] font-bold">
                      [{Math.round(score * 100)}%]
                    </span>

                    <button
                      disabled={isReplacing}
                      className="px-2.5 py-1 rounded-xs bg-[#181c24] hover:bg-[#00f0ff] hover:text-black border border-[#242a35] hover:border-[#00f0ff] text-white font-mono text-xs transition-all"
                    >
                      {isReplacing ? "..." : "[ CHỌN ]"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
