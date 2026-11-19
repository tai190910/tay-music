// src/renderer/views/HomeView.tsx

import React, { useEffect, useState } from "react";
import { Play, Flame, History, Disc, ListMusic, Sparkles } from "lucide-react";
import type { Song, HistoryItem, Playlist } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";
import { SongRow } from "../components/SongRow.tsx";

interface HomeViewProps {
  onAddToPlaylist: (song: Song) => void;
  onNavigateSearch: () => void;
  onSelectPlaylist?: (id: string) => void;
}

function formatSec(sec?: number | null): string {
  if (!sec || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onAddToPlaylist,
  onNavigateSearch,
  onSelectPlaylist,
}) => {
  const { playSong, resumeData, resumePlayback, isPlaying } = usePlayer();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);

  useEffect(() => {
    if (window.mochyApi) {
      // 1. Fetch recent history
      window.mochyApi
        .getHistory(10, 0)
        .then((items) => setHistoryItems(items))
        .catch(console.error);

      // 2. Fetch playlists
      window.mochyApi
        .getPlaylists()
        .then((pls) => setPlaylists(pls))
        .catch(console.error);

      // 3. Fetch popular songs from YouTube Music
      setLoadingTrending(true);
      window.mochyApi
        .searchSongs("Top V-Pop Hits 2026")
        .then((songs) => {
          if (songs && songs.length > 0) {
            setTrendingSongs(songs.slice(0, 10));
          }
        })
        .catch(console.error)
        .finally(() => setLoadingTrending(false));
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none font-sans bg-[#090d14]">
      {/* 1. Header Box: Chọn Kịch Bản & Chế Độ (Styled after Reference Image 2) */}
      <div className="p-4 rounded-md bg-[#0f151f] border border-[#1e293b] space-y-2 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">🧭</span>
          <h2 className="text-sm font-bold text-white tracking-wide uppercase font-sans">
            TÀY MUSIC // TRUNG TÂM PHÁT NHẠC & THƯ VIỆN
          </h2>
        </div>
        <p className="text-xs text-[#8492a6] font-sans leading-relaxed">
          Nghe nhạc chất lượng cao mô phỏng luồng ExoPlayer, tự động đồng bộ lời bài hát karaoke thời gian thực và quản lý thư viện cá nhân với SQLite.
        </p>

        {/* Quick Mode Tags (Styled after tension/difficulty tags in Image 2) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs font-mono">
          <span className="text-[10px] text-[#475569] uppercase font-bold mr-1">// CHẾ ĐỘ:</span>
          <button
            onClick={onNavigateSearch}
            className="px-3 py-1 rounded-xs bg-[#16202e] border border-[#2589f5] text-[#2589f5] font-semibold hover:bg-[#2589f5]/15 transition-all cursor-pointer shadow-[0_0_8px_rgba(37,137,245,0.2)]"
          >
            Tìm Kiếm Mới (Search)
          </button>
          <span className="px-3 py-1 rounded-xs bg-[#090d14] border border-[#1e293b] text-[#8492a6]">
            Lossless Audio: [OPUS 164KBPS]
          </span>
          <span className="px-3 py-1 rounded-xs bg-[#090d14] border border-[#1e293b] text-[#8492a6]">
            Karaoke Engine: [ACTIVE]
          </span>
        </div>
      </div>

      {/* 2. Banner "Tiếp tục nghe" (Styled exactly after "Tìm thấy tiến trình chơi dở dang!" in Image 2) */}
      {resumeData && resumeData.song && (
        <div className="rounded-md bg-[#0f151f] border border-[#2589f5] p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_15px_rgba(37,137,245,0.18)] animate-fadeIn">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xs bg-[#2589f5]/15 border border-[#2589f5]/40 flex items-center justify-center text-[#2589f5] flex-shrink-0 text-base">
              💾
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs text-[#2589f5]">
                  Tìm thấy tiến trình nghe dở dang!
                </span>
                <span className="text-[11px] font-mono text-[#8492a6] truncate">
                  [{resumeData.song.title}] - {formatSec(resumeData.currentTime)} / {formatSec(resumeData.duration)}
                </span>
              </div>
              <p className="text-[11px] text-[#38bdf8] font-mono truncate mt-0.5">
                Ca sĩ: {resumeData.song.artists.map((a) => a.name).join(", ")}
              </p>
            </div>
          </div>

          <button
            onClick={resumePlayback}
            className="px-4 py-2 rounded-xs bg-[#2ecc71] hover:bg-[#27ae60] text-black font-bold text-xs uppercase font-mono tracking-wider shadow-[0_0_10px_rgba(46,204,113,0.35)] transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer active:scale-95"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>Tiếp Tục Nghe</span>
          </button>
        </div>
      )}

      {/* 3. Danh sách Playlist dạng Thẻ Ngang Xếp Chồng (Styled after Scenario Cards in Image 2) */}
      {playlists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-white tracking-wider">
              <ListMusic className="w-4 h-4 text-[#e67e22]" />
              <span>// DANH SÁCH PHÁT NỔI BẬT & BỘ SƯU TẬP</span>
            </div>
            <span className="text-[10px] font-mono text-[#475569]">
              [{playlists.length} PLAYLISTS SẴN SÀNG]
            </span>
          </div>

          <div className="space-y-3">
            {playlists.slice(0, 3).map((pl, idx) => (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist?.(pl.id)}
                className="group p-4 rounded-md bg-[#0f151f] border border-[#1e293b] hover:border-[#e67e22] transition-all cursor-pointer relative shadow-sm flex flex-col justify-between gap-3"
              >
                {/* Top Row: Title + Amber Badge + Stars */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-white font-sans group-hover:text-[#e67e22] transition-colors">
                      {pl.name}
                    </h3>
                    {/* Badge styled like [CHIẾN DỊCH DÀI HẠN] in Image 2 */}
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-[#e67e22]/15 text-[#e67e22] border border-[#e67e22]/50 uppercase">
                      {idx === 0 ? "BỘ SƯU TẬP ĐẶC BIỆT" : "PLAYLIST CÁ NHÂN"}
                    </span>
                  </div>

                  {/* Star Rating (5 gold stars as shown in Image 2) */}
                  <div className="text-[#e67e22] text-xs tracking-widest flex-shrink-0" title="Đánh giá 5 sao">
                    ★★★★★
                  </div>
                </div>

                {/* Subtitle in light electric blue monospace (Styled exactly after Image 2) */}
                <p className="text-xs font-mono text-[#38bdf8] truncate">
                  // {pl.description || `Danh sách tuyển chọn bao gồm ${pl.songCount || 0} bài hát chất lượng cao`}
                </p>

                {/* Description Text */}
                <p className="text-xs text-[#8492a6] font-sans line-clamp-2 leading-relaxed">
                  Trải nghiệm âm thanh mượt mà không bị bóp băng thông, lưu trữ ngoại tuyến vào cơ sở dữ liệu SQLite và hỗ trợ tua bài tức thì.
                </p>

                {/* Bottom Row: Metadata Left + Button Right */}
                <div className="flex items-center justify-between pt-1 border-t border-[#1e293b]/50">
                  <span className="text-[11px] font-mono text-[#475569]">
                    Số lượng bài hát: <strong className="text-white">{pl.songCount || 0}</strong> bài
                  </span>

                  {/* Rectangular Amber Action Button (Styled like "Bắt Đầu Màn" in Image 2) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPlaylist?.(pl.id);
                    }}
                    className="px-3.5 py-1.5 rounded-xs bg-[#e67e22] hover:bg-[#d35400] text-black font-bold text-xs font-mono tracking-wider transition-all shadow-[0_0_8px_rgba(230,126,34,0.3)] cursor-pointer"
                  >
                    Phát Playlist
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Thịnh hành hôm nay (Song List Table) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-white tracking-wider">
            <Flame className="w-4 h-4 text-[#2ecc71]" />
            <span>// BẢNG XẾP HẠNG THỊNH HÀNH // V-POP 2026</span>
          </div>
          <span className="text-[10px] font-mono text-[#2ecc71] bg-[#2ecc71]/10 px-1.5 py-0.5 rounded-xs border border-[#2ecc71]/30 font-semibold">
            STATUS: ACTIVE
          </span>
        </div>

        {/* Table Column Header */}
        <div className="flex items-center gap-3.5 px-3 py-1 text-[10px] font-mono text-[#475569] uppercase tracking-wider border-b border-[#1e293b]/60">
          <span className="w-7 text-center">#</span>
          <span className="w-9" />
          <span className="flex-1">Tên bài hát / Ca sĩ</span>
          <span className="w-12 text-right">Thời lượng</span>
          <span className="w-20 text-right">Thao tác</span>
        </div>

        {loadingTrending ? (
          <div className="space-y-1.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-11 rounded-md bg-[#0f151f] border border-[#1e293b] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {trendingSongs
              .filter((song) => typeof song.id === "string" && song.id.trim().length === 11)
              .map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={trendingSongs}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
          </div>
        )}
      </section>
    </div>
  );
};
