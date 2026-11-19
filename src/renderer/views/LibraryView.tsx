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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans">
      {/* Library Navigation Tabs - Cyber Style */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242a35] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("liked")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xs text-xs font-mono transition-all border ${
              activeTab === "liked"
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_10px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/50 border-transparent"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeTab === "liked" ? "text-rose-500 fill-rose-500" : ""}`} />
            <span>[01] YÊU THÍCH ({likedSongs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xs text-xs font-mono transition-all border ${
              activeTab === "history"
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_10px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/50 border-transparent"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>[02] LỊCH SỬ</span>
          </button>

          <button
            onClick={() => setActiveTab("playlists")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xs text-xs font-mono transition-all border ${
              activeTab === "playlists"
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_10px_rgba(0,240,255,0.15)] font-bold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/50 border-transparent"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#14231b] hover:bg-[#183024] text-[#00ff9d] border border-[#00ff9d]/30 text-xs font-mono font-medium shadow-[0_0_8px_rgba(0,255,157,0.1)] transition-all"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>[UPLINK SPOTIFY]</span>
            </button>
          )}

          {activeTab === "playlists" && (
            <button
              onClick={onOpenCreatePlaylist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#00f0ff] hover:bg-[#33f3ff] text-black text-xs font-mono font-bold shadow-[0_0_10px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>[+ PLAYLIST MỚI]</span>
            </button>
          )}

          {activeTab === "history" && historyItems.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xs bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 text-xs font-mono transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>[XÓA LOGS]</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Liked Songs */}
      {activeTab === "liked" && (
        <div className="space-y-3">
          {likedSongs.length > 0 && (
            <div className="flex items-center justify-between bg-[#13161c] border border-[#242a35] p-3 rounded-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayAllLiked}
                  className="px-3 py-1.5 rounded-xs bg-[#00f0ff] hover:bg-[#33f3ff] text-black font-mono font-bold text-xs flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.3)] transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>PHÁT TẤT CẢ</span>
                </button>
                <span className="text-[11px] font-mono text-[#8492a6]">
                  // TOTAL: {likedSongs.length} BÀI HÁT TRONG KHO YÊU THÍCH
                </span>
              </div>
            </div>
          )}

          {likedSongs.length === 0 ? (
            <div className="text-center py-20 text-[#444c5c] font-mono text-xs">
              <Heart className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// EMPTY_SET: Chưa có bài hát nào được gắn cờ yêu thích</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider border-b border-[#242a35]/60">
                <span className="w-7 text-center">#</span>
                <span className="w-9" />
                <span className="flex-1">Track / Artist</span>
                <span className="w-12 text-right">Length</span>
                <span className="w-20 text-right">Action</span>
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
            <div className="text-center py-20 text-[#444c5c] font-mono text-xs">
              <History className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// EMPTY_LOGS: Chưa ghi nhận lịch sử phát</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider border-b border-[#242a35]/60">
                <span className="w-7 text-center">#</span>
                <span className="w-9" />
                <span className="flex-1">Track / Artist</span>
                <span className="w-12 text-right">Length</span>
                <span className="w-20 text-right">Action</span>
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

      {/* Tab 3: Playlists Grid */}
      {activeTab === "playlists" && (
        <div className="space-y-3">
          {playlists.length === 0 ? (
            <div className="text-center py-20 text-[#444c5c] font-mono text-xs">
              <ListMusic className="w-10 h-10 mx-auto mb-2 opacity-25" />
              <p>// ZERO_PLAYLISTS: Chưa có playlist nào được tạo</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {playlists.map((pl, idx) => (
                <div
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="group p-3 rounded-xs bg-[#13161c] border border-[#242a35] hover:border-[#00f0ff]/50 hover:bg-[#181c24] transition-all cursor-pointer flex flex-col relative shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
                >
                  <div className="relative w-full aspect-square rounded-xs overflow-hidden bg-[#0d0f12] mb-2.5 flex-shrink-0 border border-[#242a35] flex items-center justify-center">
                    {pl.thumbnailUrl ? (
                      <img
                        src={pl.thumbnailUrl}
                        alt={pl.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <ListMusic className="w-8 h-8 text-[#444c5c] group-hover:text-[#00f0ff] transition-colors" />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#444c5c] mb-1">
                    <span>#{String(idx + 1).padStart(2, "0")}</span>
                    <span className="text-[#00ff9d]">{pl.songCount || 0} TRK</span>
                  </div>

                  <p className="text-xs font-bold text-white truncate font-sans" title={pl.name}>
                    {pl.name}
                  </p>
                  <p className="text-[11px] text-[#8492a6] truncate font-mono mt-0.5">
                    {pl.description || "// USER_COLLECTION"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
