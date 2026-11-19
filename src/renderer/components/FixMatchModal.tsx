// src/renderer/components/FixMatchModal.tsx

import React, { useEffect, useState } from "react";
import { X, Search, RefreshCw, Disc } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-[#090d14]/80 animate-fadeIn select-none font-sans">
      <div className="relative bg-[#0f151f] border border-[#1e293b] rounded-md w-full max-w-2xl overflow-hidden shadow-[0_0_35px_rgba(0,0,0,0.85)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e293b] bg-[#090d14]">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 text-[#2589f5]" />
            <div>
              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                // ĐỔI PHIÊN BẢN BÀI HÁT (FIX MATCH)
              </h3>
              <p className="text-[10px] font-mono text-[#8492a6]">
                Chọn bản thu khớp chuẩn nhất trên YouTube Music để ghi đè vào SQLite
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Song Reference */}
        <div className="px-5 py-2.5 bg-[#090d14] border-b border-[#1e293b] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 truncate pr-4">
            <span className="text-[#475569]">// MỤC TIÊU:</span>
            <span className="font-bold text-white truncate font-sans">{song.title}</span>
            <span className="text-[#38bdf8] truncate">— {song.artists.map((a) => a.name).join(", ")}</span>
          </div>
          <span className="text-[#2589f5] font-bold flex-shrink-0">
            [{formatSec(song.duration)}]
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3.5 border-b border-[#1e293b] bg-[#0f151f]">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 bg-[#090d14] border border-[#1e293b] rounded-xs flex items-center px-2.5">
              <Search className="w-3.5 h-3.5 text-[#475569] mr-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên bài hát hoặc ca sĩ để tìm kiếm ứng cử viên khác..."
                className="w-full py-1.5 bg-transparent text-xs text-white placeholder-[#475569] font-mono focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-3.5 py-1.5 bg-[#2589f5] hover:bg-[#1d70cb] text-white rounded-xs text-xs font-mono font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>[ TÌM ]</span>
            </button>
          </form>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-xs font-mono text-[#2589f5] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>ĐANG_TÌM_ỨNG_CỬ_VIÊN_YOUTUBE...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-[#e74c3c] font-mono text-xs">
              <p>// LỖI: {error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-[#475569] font-mono text-xs">
              <p>// KHÔNG CÓ KẾT QUẢ GỢI Ý NÀO KHẢ THI</p>
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
                  className={`p-2.5 rounded-md border transition-all cursor-pointer flex items-center gap-3 ${
                    isReplacing
                      ? "bg-[#16202e] border-[#2589f5] text-white"
                      : "bg-[#090d14] border-[#1e293b] hover:border-[#2589f5] hover:bg-[#16202e] text-[#8492a6] hover:text-white"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xs overflow-hidden bg-[#090d14] border border-[#1e293b] flex-shrink-0">
                    {cand.thumbnail ? (
                      <img src={cand.thumbnail} alt={cand.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-5 h-5 text-[#475569]" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs font-bold text-white truncate font-sans">
                      {cand.title}
                    </p>
                    <p className="text-[11px] text-[#38bdf8] truncate font-mono">
                      {cand.artists?.map((a: any) => a.name).join(", ")}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[10px]">
                    <span className="text-[#8492a6]">{formatSec(cand.duration)}</span>

                    {deltaSec !== null && (
                      <span
                        className={`px-1.5 py-0.5 rounded-xs font-bold border ${
                          isCloseDuration
                            ? "bg-[#2ecc71]/15 text-[#2ecc71] border-[#2ecc71]/40"
                            : "bg-[#e67e22]/15 text-[#e67e22] border-[#e67e22]/40"
                        }`}
                      >
                        {deltaSec >= 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                      </span>
                    )}

                    <span className="text-[#2589f5] font-bold">
                      [{Math.round(score * 100)}%]
                    </span>

                    <button
                      disabled={isReplacing}
                      className="px-2.5 py-1 rounded-xs bg-[#2ecc71] hover:bg-[#27ae60] text-black font-mono font-bold text-xs transition-all shadow-xs"
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
