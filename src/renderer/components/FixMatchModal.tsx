// src/renderer/components/FixMatchModal.tsx

import React, { useEffect, useState } from "react";
import { X, Search, RefreshCw, Disc } from "lucide-react";
import { getSourceBadge, type Song } from "../types.ts";
import { TrackThumbnail } from "./TrackThumbnail.tsx";

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
        videoId: candidateSong.id,
        title: song.title || candidateSong.title,
        artists: song.artists?.length
          ? song.artists
          : candidateSong.artists || [{ name: primaryArtist, id: null }],
        duration: candidateSong.duration || song.duration || 0,
        thumbnail: song.thumbnail || candidateSong.thumbnail,
        album: song.album || candidateSong.album?.name,
        explicit: candidateSong.explicit,
        source: candidateSong.source || null,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md bg-black/70 animate-fadeIn select-none font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Đổi phiên bản bài hát"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[#16161a]/95 backdrop-blur-2xl border border-white/[0.12] rounded-[24px] w-full max-w-2xl overflow-hidden shadow-[0_28px_80px_rgba(0,0,0,0.9)] flex flex-col max-h-[85vh] text-[#f5f5f7]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#121216]/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-[#f5f5f7]" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[#f5f5f7] tracking-tight">
                Đổi phiên bản bài hát (Fix Match)
              </h3>
              <p className="text-[12px] text-[#8e8e93]">
                Chọn bản thu khớp chuẩn nhất trên YouTube / SoundCloud để ghi đè vào thư viện
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full text-[#8e8e93] hover:text-white bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Song Reference */}
        <div className="px-6 py-3 bg-white/[0.03] border-b border-white/[0.07] flex items-center justify-between text-[12.5px]">
          <div className="flex items-center gap-2 truncate pr-4">
            <span className="text-[#8e8e93]">Mục tiêu:</span>
            <span className="font-semibold text-white truncate">{song.title}</span>
            <span className="text-[#9a9aa0] truncate">— {song.artists.map((a) => a.name).join(", ")}</span>
          </div>
          <span className="text-[#8e8e93] font-medium flex-shrink-0 tabular-nums">
            {formatSec(song.duration)}
          </span>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3.5 border-b border-white/[0.08]">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 bg-white/[0.06] border border-white/[0.1] focus-within:border-white/[0.28] rounded-xl flex items-center px-3">
              <Search className="w-4 h-4 text-[#8e8e93] mr-2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên bài hát hoặc ca sĩ để tìm kiếm ứng cử viên khác..."
                className="w-full h-9 bg-transparent text-[13px] text-white placeholder-[#6e6e73] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 h-9 bg-white hover:bg-[#e5e5ea] text-[#121216] rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tìm</span>
            </button>
          </form>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? (
            <div className="py-16 text-center text-[13px] text-[#8e8e93] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Đang tìm ứng cử viên...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400 text-[13px]">
              <p>Lỗi: {error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-[#8e8e93] text-[13px]">
              <p>Không có kết quả gợi ý nào khả thi</p>
            </div>
          ) : (
            candidates.map(({ song: cand, score }) => {
              const deltaSec =
                cand.duration && song.duration
                  ? Math.round(cand.duration - song.duration)
                  : null;
              const isCloseDuration = deltaSec !== null && Math.abs(deltaSec) <= 5;
              const isReplacing = replacingId === cand.id;
              const badge = getSourceBadge(cand);

              return (
                <div
                  key={cand.id}
                  onClick={() => handleSelectCandidate(cand)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                    isReplacing
                      ? "bg-white/[0.1] border-white/[0.3] text-white"
                      : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.16] hover:bg-white/[0.07] text-[#9a9aa0] hover:text-white"
                  }`}
                >
                  <TrackThumbnail
                    src={cand.thumbnail}
                    videoId={cand.videoId || cand.id}
                    alt={cand.title}
                    iconSize="sm"
                    className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] flex-shrink-0"
                  />

                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border flex-shrink-0 ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <p className="text-[13px] font-semibold text-white truncate">
                        {cand.title}
                      </p>
                    </div>
                    <p className="text-[12px] text-[#8e8e93] truncate mt-0.5">
                      {cand.artists?.map((a: any) => a.name).join(", ") || cand.author || "Unknown"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 text-[11.5px]">
                    <span className="text-[#8e8e93] tabular-nums">{formatSec(cand.duration)}</span>

                    {deltaSec !== null && (
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium tabular-nums ${
                          isCloseDuration
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {deltaSec >= 0 ? `+${deltaSec}s` : `${deltaSec}s`}
                      </span>
                    )}

                    <span className="text-[#8e8e93] font-medium tabular-nums">
                      {Math.round(score * 100)}%
                    </span>

                    <button
                      type="button"
                      disabled={isReplacing}
                      className="px-3.5 py-1.5 rounded-full bg-white hover:bg-[#e5e5ea] text-[#121216] font-semibold text-[12px] transition-all cursor-pointer"
                    >
                      {isReplacing ? "..." : "Chọn"}
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
