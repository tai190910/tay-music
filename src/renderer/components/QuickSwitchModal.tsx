// src/renderer/components/QuickSwitchModal.tsx

import React, { useEffect, useState } from "react";
import { X, Search, RefreshCw, Disc, Sparkles, Play } from "lucide-react";
import { usePlayer } from "../context/PlayerContext.tsx";
import { getSourceBadge, type Song } from "../types.ts";
import { TrackThumbnail } from "./TrackThumbnail.tsx";

function cleanInstrumentalTagsForRetry(rawTitle: string): string {
  let cleaned = rawTitle
    .replace(
      /[(\[（]\s*(?:beat(?:\s+lofi|\s+chuẩn|\s+gốc)?|karaoke|instrumental|instrument|inst|playback|không\s*lời|khong\s*loi|nhạc\s*nền|nhac\s*nen|off\s*vocal)\b[^)\]）]*[)\]）]/gi,
      " "
    )
    .replace(
      /\s[-–—|]\s*(?:beat(?:\s+lofi|\s+chuẩn|\s+gốc)?|karaoke|instrumental|instrument|playback|không\s*lời|khong\s*loi|nhạc\s*nền|nhac\s*nen|off\s*vocal)\b.*$/gi,
      ""
    )
    .replace(
      /\b(?:beat\s+chuẩn|beat\s+lofi|beat\s+gốc|không\s*lời|nhạc\s*nền|off\s*vocal|karaoke|instrumental|playback)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || rawTitle.trim();
}

export const QuickSwitchModal: React.FC = () => {
  const { quickSwitchTarget, closeQuickSwitch, replaceSongVersion } = usePlayer();
  const song = quickSwitchTarget?.song ?? null;
  const playlistId = quickSwitchTarget?.playlistId ?? null;

  const primaryArtist = song?.artists?.[0]?.name || "";
  const cleanedTitle = song ? cleanInstrumentalTagsForRetry(song.title) : "";

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Array<{ song: any; score: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [keepMetadata, setKeepMetadata] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = async (
    searchTitle: string,
    searchArtist: string,
    excludeId?: string
  ) => {
    if (!window.mochyApi || !song) return;
    setLoading(true);
    setError(null);
    setShowAll(false);
    try {
      const results = await window.mochyApi.getTrackCandidates({
        title: searchTitle,
        artist: searchArtist,
        duration: song.duration,
      });
      const filtered = (results || []).filter(
        (item: any) => item?.song?.id && item.song.id !== (excludeId || song.id)
      );
      setCandidates(filtered);
    } catch (err: any) {
      console.error("[QuickSwitchModal] Failed to fetch candidates:", err);
      setError("Không thể tải kết quả thay thế từ YouTube.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!song) return;
    const cleanQ = cleanInstrumentalTagsForRetry(song.title);
    const artist = song.artists?.[0]?.name || "";
    const initial = artist && !cleanQ.toLowerCase().includes(artist.toLowerCase())
      ? `${cleanQ} ${artist}`.trim()
      : cleanQ;
    setQuery(initial);
    fetchCandidates(cleanQ, artist, song.id);
  }, [song?.id]);

  if (!quickSwitchTarget || !song) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    fetchCandidates(query.trim(), "", song.id);
  };

  const handleSearchOfficialAudio = () => {
    const base = query.trim() || `${cleanedTitle} ${primaryArtist}`.trim();
    const nextQ = base.toLowerCase().includes("official") ? base : `${base} official audio`;
    setQuery(nextQ);
    fetchCandidates(nextQ, "", song.id);
  };

  const handleSelectCandidate = async (candidateSong: any) => {
    if (switchingId) return;
    setSwitchingId(candidateSong.id);
    setError(null);
    try {
      const preservedTitle = cleanInstrumentalTagsForRetry(song.title) || candidateSong.title;
      const preservedArtists = song.artists?.length
        ? song.artists
        : candidateSong.artists?.length
          ? candidateSong.artists
          : [{ name: primaryArtist || "Unknown", id: null }];
      const preservedThumb = song.thumbnail || candidateSong.thumbnail;
      const preservedAlbum = song.album || candidateSong.album;

      const newSongData: Song = {
        id: candidateSong.id,
        videoId: candidateSong.id,
        title: keepMetadata ? preservedTitle : candidateSong.title,
        artists: keepMetadata
          ? preservedArtists
          : candidateSong.artists?.length
            ? candidateSong.artists
            : preservedArtists,
        duration: candidateSong.duration || song.duration || 0,
        thumbnail: keepMetadata
          ? preservedThumb
          : candidateSong.thumbnail || song.thumbnail,
        album: keepMetadata ? preservedAlbum : candidateSong.album || song.album,
        explicit: Boolean(candidateSong.explicit),
        source: candidateSong.source || null,
      };
      await replaceSongVersion(song.id, newSongData, playlistId, true);
      closeQuickSwitch();
    } catch (err: any) {
      console.error("[QuickSwitchModal] Failed to switch version:", err);
      setError("Không thể chuyển sang bản phát này. Vui lòng thử lại.");
    } finally {
      setSwitchingId(null);
    }
  };

  const formatSec = (sec?: number | null) => {
    if (!sec || sec <= 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const visibleCandidates = showAll ? candidates : candidates.slice(0, 10);
  const extraCount = Math.max(0, candidates.length - 10);

  return (
    <div
      onClick={closeQuickSwitch}
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 backdrop-blur-md bg-black/70 animate-fadeIn select-none font-sans"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tìm bản phát khác"
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
                Đổi bản phát YouTube khác
              </h3>
              <p className="text-[12px] text-[#8e8e93]">
                Chọn nhanh trong Top 10 kết quả YouTube có lời để cập nhật nguồn phát cho bài hát
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeQuickSwitch}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full text-[#8e8e93] hover:text-white bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Reference */}
        <div className="px-6 py-3 bg-white/[0.03] border-b border-white/[0.07] flex items-center justify-between text-[12.5px]">
          <div className="flex items-center gap-2 truncate pr-4">
            <span className="text-[#8e8e93]">Đang chọn:</span>
            <span className="font-semibold text-white truncate">{song.title}</span>
            {song.artists.length > 0 && (
              <span className="text-[#9a9aa0] truncate">
                — {song.artists.map((a) => a.name).join(", ")}
              </span>
            )}
          </div>
          <span className="text-[#8e8e93] font-medium flex-shrink-0 tabular-nums">
            {formatSec(song.duration)}
          </span>
        </div>

        {/* Search Input + Quick Filter */}
        <div className="px-6 py-3.5 border-b border-white/[0.08] space-y-2.5">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 bg-white/[0.06] border border-white/[0.1] focus-within:border-white/[0.28] rounded-xl flex items-center px-3">
              <Search className="w-4 h-4 text-[#8e8e93] mr-2 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập từ khóa tìm bản có lời / official / remix..."
                className="w-full h-9 bg-transparent text-[13px] text-white placeholder-[#6e6e73] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchOfficialAudio}
              disabled={loading}
              title="Ưu tiên tìm bản Official Audio có lời chính thức"
              className="px-3.5 h-9 bg-white/[0.07] hover:bg-white/[0.14] text-[#f5f5f7] border border-white/[0.1] rounded-xl text-[12px] font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Official Audio</span>
            </button>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-4 h-9 bg-white hover:bg-[#e5e5ea] text-[#121216] rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tìm lại</span>
            </button>
          </form>

          <label className="flex items-center gap-2 text-[12px] text-[#9a9aa0] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepMetadata}
              onChange={(e) => setKeepMetadata(e.target.checked)}
              className="accent-[#fa243c] rounded cursor-pointer"
            />
            <span>
              Giữ nguyên tên bài hát, nghệ sĩ &amp; ảnh bìa gốc (chỉ cập nhật nguồn phát youtubeVideoId)
            </span>
          </label>
        </div>

        {/* Candidates */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? (
            <div className="py-14 text-center text-[13px] text-[#8e8e93] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Đang tìm bản phát thay thế...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400 text-[13px]">
              <p>Lỗi: {error}</p>
            </div>
          ) : visibleCandidates.length === 0 ? (
            <div className="py-12 text-center text-[#8e8e93] text-[13px] space-y-1.5">
              <p>Không tìm thấy bản phát khác phù hợp</p>
              <p className="text-[12px] text-[#6e6e73]">
                Thử sửa từ khóa hoặc bấm &ldquo;Official Audio&rdquo; ở trên.
              </p>
            </div>
          ) : (
            <>
              {visibleCandidates.map(({ song: cand, score }) => {
                const deltaSec =
                  cand.duration && song.duration
                    ? Math.round(cand.duration - song.duration)
                    : null;
                const isCloseDuration = deltaSec !== null && Math.abs(deltaSec) <= 5;
                const isSwitching = switchingId === cand.id;
                const badge = getSourceBadge(cand);

                return (
                  <div
                    key={cand.id}
                    onClick={() => handleSelectCandidate(cand)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isSwitching
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
                        disabled={isSwitching}
                        className="px-3.5 py-1.5 rounded-full bg-white hover:bg-[#e5e5ea] text-[#121216] font-semibold text-[11.5px] transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-[#121216]" />
                        <span>{isSwitching ? "..." : "Phát bản này"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {!showAll && extraCount > 0 && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#c7c7cc] hover:text-white border border-white/[0.08] text-[12px] font-medium transition-colors cursor-pointer"
                  >
                    Xem thêm (+{extraCount} kết quả)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
