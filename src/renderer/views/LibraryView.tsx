// src/renderer/views/LibraryView.tsx

import React, { useState, useEffect } from "react";
import { Heart, History, ListMusic, Plus, Trash2, Play, Disc } from "lucide-react";
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
    <div className="flex-1 overflow-y-auto p-8 space-y-6 select-none">
      {/* Library Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-mochy-border/60 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("liked")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "liked"
                ? "bg-mochy-card text-white shadow-sm border border-mochy-border"
                : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/50"
            }`}
          >
            <Heart className={`w-4 h-4 ${activeTab === "liked" ? "text-mochy-accent fill-mochy-accent" : ""}`} />
            <span>Bài hát đã thích ({likedSongs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "history"
                ? "bg-mochy-card text-white shadow-sm border border-mochy-border"
                : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/50"
            }`}
          >
            <History className={`w-4 h-4 ${activeTab === "history" ? "text-mochy-accent" : ""}`} />
            <span>Lịch sử nghe</span>
          </button>

          <button
            onClick={() => setActiveTab("playlists")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "playlists"
                ? "bg-mochy-card text-white shadow-sm border border-mochy-border"
                : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/50"
            }`}
          >
            <ListMusic className={`w-4 h-4 ${activeTab === "playlists" ? "text-mochy-accent" : ""}`} />
            <span>Danh sách phát</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSpotifyImport && (
            <button
              onClick={onOpenSpotifyImport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-[#1DB954] border border-[#1DB954]/40 text-xs font-semibold shadow-sm transition-all"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <span>Nhập từ Spotify</span>
            </button>
          )}

          {activeTab === "playlists" && (
            <button
              onClick={onOpenCreatePlaylist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mochy-accent hover:bg-mochy-accentHover text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo danh sách phát</span>
            </button>
          )}

          {activeTab === "history" && historyItems.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa lịch sử</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Liked Songs */}
      {activeTab === "liked" && (
        <div className="space-y-4">
          {likedSongs.length > 0 && (
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayAllLiked}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mochy-accent hover:bg-mochy-accentHover text-white font-semibold text-sm shadow-md transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Phát tất cả</span>
              </button>
            </div>
          )}

          {likedSongs.length > 0 ? (
            <div className="divide-y divide-mochy-border/30">
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
          ) : (
            <div className="py-16 text-center text-mochy-subtext">
              <Heart className="w-12 h-12 mb-3 mx-auto opacity-30" />
              <p className="text-sm font-medium text-mochy-muted">Chưa có bài hát yêu thích nào</p>
              <p className="text-xs text-mochy-subtext mt-1">
                Nhấn biểu tượng trái tim khi nghe một bài hát để lưu vào đây.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: History */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {historyItems.length > 0 ? (
            <div className="divide-y divide-mochy-border/30">
              {historyItems
                .filter((item) => {
                  const vid = item.song?.id || (item.song as any)?.videoId || item.songId;
                  return typeof vid === "string" && vid.trim().length === 11;
                })
                .map((item, idx) => {
                  const validId = (item.song?.id || (item.song as any)?.videoId || item.songId).trim();
                  const song: Song = {
                    ...(item.song || {}),
                    id: validId,
                    videoId: validId,
                    title: item.song?.title || "Bài hát đã lưu",
                    artists: item.song?.artists?.length ? item.song.artists : [{ name: "Nghệ sĩ" }],
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
          ) : (
            <div className="py-16 text-center text-mochy-subtext">
              <History className="w-12 h-12 mb-3 mx-auto opacity-30" />
              <p className="text-sm font-medium text-mochy-muted">Chưa có lịch sử nghe nhạc</p>
              <p className="text-xs text-mochy-subtext mt-1">
                Các bài hát bạn phát sẽ được tự động ghi lại tại đây.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Playlists */}
      {activeTab === "playlists" && (
        <div className="space-y-4">
          {playlists.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="group p-4 rounded-xl bg-mochy-card border border-mochy-border/60 hover:bg-mochy-cardHover/80 transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="w-full aspect-square rounded-lg bg-mochy-sidebar flex items-center justify-center mb-3 shadow-inner">
                    <ListMusic className="w-12 h-12 text-mochy-subtext group-hover:text-mochy-accent transition-colors" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white truncate" title={pl.name}>
                      {pl.name}
                    </h4>
                    <p className="text-xs text-mochy-muted mt-0.5 line-clamp-1">
                      {pl.description || "Danh sách phát cá nhân"}
                    </p>
                    <span className="text-[11px] font-mono text-mochy-subtext mt-2 block">
                      {pl.songCount || 0} bài hát
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-mochy-subtext">
              <ListMusic className="w-12 h-12 mb-3 mx-auto opacity-30" />
              <p className="text-sm font-medium text-mochy-muted">Chưa có danh sách phát nào</p>
              <p className="text-xs text-mochy-subtext mt-1">
                Nhấn "+ Tạo danh sách phát" để tạo danh sách tuyển chọn của riêng bạn.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
