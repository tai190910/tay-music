// src/renderer/views/LibraryView.tsx

import React, { useState, useEffect } from "react";
import { Heart, History, ListMusic, Plus, Trash2, Play, Disc, Terminal } from "lucide-react";
import type { Song, Playlist, HistoryItem } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";
import { usePlayer } from "../context/PlayerContext.tsx";

interface LibraryViewProps {
  onAddToPlaylist: (song: Song) => void;
  onOpenCreatePlaylist: () => void;
  onOpenSpotifyImport?: () => void;
  onSelectPlaylist: (id: string) => void;
  playlistRefreshKey: number;
}

type TabType = "liked" | "history" | "playlists";

export const LibraryView: React.FC<LibraryViewProps> = ({
  onAddToPlaylist,
  onOpenCreatePlaylist,
  onOpenSpotifyImport,
  onSelectPlaylist,
  playlistRefreshKey,
}) => {
  const { playSong } = usePlayer();
  const [activeTab, setActiveTab] = useState<TabType>("liked");
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!window.mochyApi) return;
    setLoading(true);
    try {
      if (activeTab === "liked") {
        const songs = await window.mochyApi.getLikedSongs();
        setLikedSongs(songs || []);
      } else if (activeTab === "history") {
        const hist = await window.mochyApi.getHistory(50, 0);
        setHistoryItems(hist || []);
      } else if (activeTab === "playlists") {
        const pls = await window.mochyApi.getPlaylists();
        setPlaylists(pls || []);
      }
    } catch (err) {
      console.error("Failed to load library data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, playlistRefreshKey]);

  const handleClearHistory = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử nghe nhạc không?")) {
      if (window.mochyApi) {
        await window.mochyApi.clearHistory();
        setHistoryItems([]);
      }
    }
  };

  const handlePlayAllLiked = () => {
    if (likedSongs.length > 0) {
      playSong(likedSongs[0], likedSongs);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans bg-[#090d14]">
      {/* Library Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e293b] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("liked")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all border ${
              activeTab === "liked"
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_10px_rgba(37,137,245,0.2)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/50 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeTab === "liked" ? "text-[#e74c3c] fill-[#e74c3c]" : ""}`} />
            <span>[01] BÀI HÁT YÊU THÍCH ({likedSongs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all border ${
              activeTab === "history"
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_10px_rgba(37,137,245,0.2)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/50 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>[02] LỊCH SỬ PHÁT</span>
          </button>

          <button
            onClick={() => setActiveTab("playlists")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono transition-all border ${
              activeTab === "playlists"
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_10px_rgba(37,137,245,0.2)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/50 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>[03] DANH SÁCH PHÁT ({playlists.length})</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onOpenSpotifyImport && (
            <button
              onClick={onOpenSpotifyImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#090d14] hover:bg-[#16202e] text-[#2ecc71] border border-[#2ecc71]/40 text-xs font-mono font-medium shadow-xs transition-all cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>[NHẬP SPOTIFY]</span>
            </button>
          )}

          {activeTab === "playlists" && (
            <button
              onClick={onOpenCreatePlaylist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2ecc71] hover:bg-[#27ae60] text-black text-xs font-mono font-bold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>[+ PLAYLIST MỚI]</span>
            </button>
          )}

          {activeTab === "history" && historyItems.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-950/20 hover:bg-rose-950/40 text-[#e74c3c] border border-rose-900/40 text-xs font-mono transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>[XÓA LỊCH SỬ]</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Liked Songs */}
      {activeTab === "liked" && (
        <div className="space-y-3">
          {likedSongs.length > 0 && (
            <div className="flex items-center justify-between bg-[#0f151f] border border-[#1e293b] p-3 rounded-md">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayAllLiked}
                  className="px-3.5 py-1.5 rounded-xs bg-[#2ecc71] hover:bg-[#27ae60] text-black font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_10px_rgba(46,204,113,0.3)] transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>PHÁT TẤT CẢ</span>
                </button>
                <span className="text-[11px] font-mono text-[#8492a6]">
                  // {likedSongs.length} BÀI HÁT TRONG DANH SÁCH YÊU THÍCH
                </span>
              </div>
            </div>
          )}

          {likedSongs.length === 0 ? (
            <div className="text-center py-20 text-[#475569] font-mono text-xs">
              <Heart className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// CHƯA CÓ BÀI HÁT NÀO ĐƯỢC THÊM VÀO MỤC YÊU THÍCH</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#475569] uppercase tracking-wider border-b border-[#1e293b]/60">
                <span className="w-7 text-center">#</span>
                <span className="w-9" />
                <span className="flex-1">Tên bài hát / Ca sĩ</span>
                <span className="w-12 text-right">Thời lượng</span>
                <span className="w-20 text-right">Thao tác</span>
              </div>
              {likedSongs.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={likedSongs}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Listening History */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {historyItems.length === 0 ? (
            <div className="text-center py-20 text-[#475569] font-mono text-xs">
              <History className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// CHƯA CÓ LỊCH SỬ NGHE NHẠC</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#475569] uppercase tracking-wider border-b border-[#1e293b]/60">
                <span className="w-7 text-center">#</span>
                <span className="w-9" />
                <span className="flex-1">Tên bài hát / Ca sĩ</span>
                <span className="w-12 text-right">Thời lượng</span>
                <span className="w-20 text-right">Thao tác</span>
              </div>
              {historyItems
                .filter((item) => {
                  const vid = item.song?.id || (item.song as any)?.videoId || item.songId;
                  return typeof vid === "string" && vid.trim().length === 11;
                })
                .map((item, idx) => {
                  const validId = (item.song?.id || (item.song as any)?.videoId || item.songId).trim();
                  const song: Song = {
                    id: validId,
                    videoId: validId,
                    title: item.song?.title || "Unknown Track",
                    artists: item.song?.artists?.length ? item.song.artists : [{ name: "Unknown" }],
                    thumbnail: item.song?.thumbnail || (item.song as any)?.thumbnailUrl,
                    duration: item.song?.duration,
                  };
                  return (
                    <SongRow
                      key={`${item.id}-${idx}`}
                      song={song}
                      index={idx}
                      onAddToPlaylist={onAddToPlaylist}
                    />
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Playlists (Styled like Scenario Cards in Image 2) */}
      {activeTab === "playlists" && (
        <div className="space-y-3">
          {playlists.length === 0 ? (
            <div className="text-center py-20 text-[#475569] font-mono text-xs">
              <ListMusic className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// CHƯA CÓ PLAYLIST NÀO ĐƯỢC TẠO</p>
            </div>
          ) : (
            <div className="space-y-3">
              {playlists.map((pl, idx) => (
                <div
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="group p-4 rounded-md bg-[#0f151f] border border-[#1e293b] hover:border-[#e67e22] transition-all cursor-pointer relative shadow-sm flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-sm text-white font-sans group-hover:text-[#e67e22] transition-colors">
                        {pl.name}
                      </h3>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-[#e67e22]/15 text-[#e67e22] border border-[#e67e22]/50 uppercase">
                        #{String(idx + 1).padStart(2, "0")} PLAYLIST
                      </span>
                    </div>

                    <div className="text-[#e67e22] text-xs tracking-widest flex-shrink-0">
                      ★★★★★
                    </div>
                  </div>

                  <p className="text-xs font-mono text-[#38bdf8] truncate">
                    // {pl.description || "Danh sách phát tuyển chọn lưu trong cơ sở dữ liệu SQLite"}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-[#1e293b]/50">
                    <span className="text-[11px] font-mono text-[#475569]">
                      Số lượng bài: <strong className="text-white">{pl.songCount || 0}</strong> bài
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlaylist(pl.id);
                      }}
                      className="px-3.5 py-1.5 rounded-xs bg-[#e67e22] hover:bg-[#d35400] text-black font-bold text-xs font-mono tracking-wider transition-all shadow-[0_0_8px_rgba(230,126,34,0.3)] cursor-pointer"
                    >
                      Mở Playlist
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
