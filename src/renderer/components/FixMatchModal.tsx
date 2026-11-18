// src/renderer/components/FixMatchModal.tsx

import React, { useEffect, useState } from "react";
import { X, Search, Check, RefreshCw, Music2, ExternalLink, Disc } from "lucide-react";
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
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-mochy-accent/20 flex items-center justify-center text-mochy-accent">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Đổi phiên bản bài hát</h3>
              <p className="text-xs text-mochy-muted">
                Chọn phiên bản khớp chuẩn nhất trên YouTube Music để thay thế
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-mochy-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Song Reference */}
        <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate pr-4">
            <span className="text-mochy-subtext">Bài hiện tại:</span>
            <span className="font-semibold text-white truncate">{song.title}</span>
            <span className="text-mochy-muted truncate">— {song.artists.map((a) => a.name).join(", ")}</span>
          </div>
          <span className="font-mono text-mochy-subtext flex-shrink-0">
            {formatSec(song.duration)}
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-white/5">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-mochy-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên bài hát hoặc ca sĩ để tìm kiếm lại..."
                className="w-full pl-9 pr-3 py-2 bg-mochy-bg border border-white/10 rounded-xl text-sm text-white placeholder-mochy-subtext focus:outline-none focus:border-mochy-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tìm lại</span>
            </button>
          </form>
        </div>

        {/* Candidates List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-mochy-muted gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-mochy-accent" />
              <p className="text-xs">Đang tìm các phiên bản bài hát trên YouTube...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-rose-400 text-xs">
              <p>{error}</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-mochy-subtext text-xs">
              <Music2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Không tìm thấy kết quả phù hợp trên YouTube.</p>
              <p className="mt-1">Hãy thử chỉnh sửa từ khóa ở thanh tìm kiếm phía trên.</p>
            </div>
          ) : (
            candidates.map(({ song: cand, score }) => {
              const candDuration = cand.duration || 0;
              const durationDiff =
                song.duration && candDuration ? Math.abs(song.duration - candDuration) : null;
              const isCurrentMatch = cand.id === song.id;
              const scorePercent = Math.round(score * 100);
              const isTopic =
                cand.artists?.some((a: any) => a.name.toLowerCase().includes("- topic")) ||
                (cand.author && cand.author.toLowerCase().includes("- topic"));

              return (
                <div
                  key={cand.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isCurrentMatch
                      ? "bg-mochy-accent/10 border-mochy-accent/40"
                      : "bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/15"
                  }`}
                >
                  {/* Thumbnail & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-mochy-card flex-shrink-0 border border-white/10">
                      {cand.thumbnail ? (
                        <img
                          src={cand.thumbnail}
                          alt={cand.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-5 h-5 text-mochy-subtext" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {cand.title}
                        </span>
                        {isTopic && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
                            Topic
                          </span>
                        )}
                        {scorePercent >= 80 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0">
                            {scorePercent}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-mochy-muted mt-0.5 truncate">
                        <span className="truncate">
                          {cand.artists?.map((a: any) => a.name).join(", ") || cand.author || "YouTube"}
                        </span>
                        <span className="font-mono text-mochy-subtext flex-shrink-0">
                          {formatSec(candDuration)}
                        </span>
                        {durationDiff !== null && (
                          <span
                            className={`font-mono text-[11px] flex-shrink-0 ${
                              durationDiff <= 4
                                ? "text-emerald-400"
                                : durationDiff <= 10
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            (±{durationDiff}s)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex-shrink-0">
                    {isCurrentMatch ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-mochy-accent bg-mochy-accent/15 border border-mochy-accent/30">
                        <Check className="w-3.5 h-3.5" />
                        Đang chọn
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSelectCandidate(cand)}
                        disabled={replacingId !== null}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-mochy-accent hover:bg-mochy-accentHover shadow-sm transition-all active:scale-95 disabled:opacity-50"
                      >
                        {replacingId === cand.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Chọn</span>
                      </button>
                    )}
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
