// src/renderer/views/LibraryView.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  Heart,
  History,
  ListMusic,
  Plus,
  Trash2,
  Play,
  Disc,
  Search,
  X,
  ChevronRight,
  ArrowDownToLine,
} from "lucide-react";
import { isValidTrackId, type Song, type Playlist, type HistoryItem } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";
import { TrackThumbnail } from "../components/TrackThumbnail.tsx";
import { usePlayer } from "../context/PlayerContext.tsx";

export type LibraryTab = "all" | "songs" | "playlists" | "liked" | "downloaded" | "history";

interface LibraryViewProps {
  onAddToPlaylist: (song: Song) => void;
  onOpenCreatePlaylist: () => void;
  onOpenSpotifyImport?: () => void;
  onSelectPlaylist: (id: string) => void;
  playlistRefreshKey: number;
  initialTab?: LibraryTab;
  tabRequestKey?: number;
  onActiveTabChange?: (tab: LibraryTab) => void;
  sidebarExpanded?: boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onAddToPlaylist,
  onOpenCreatePlaylist,
  onOpenSpotifyImport,
  onSelectPlaylist,
  playlistRefreshKey,
  initialTab = "all",
  tabRequestKey = 0,
  onActiveTabChange,
  sidebarExpanded = false,
}) => {
  const { playSong, lastSwitchedVersion, downloadedMap } = usePlayer();
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialTab);
  const [likedSongs, setLikedSongs] = useState<Song[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, tabRequestKey]);

  const handleSelectTab = (tab: LibraryTab) => {
    setActiveTab(tab);
    onActiveTabChange?.(tab);
  };

  useEffect(() => {
    if (!lastSwitchedVersion) return;
    setLikedSongs((prev) =>
      prev.map((s) => (s.id === lastSwitchedVersion.oldId ? lastSwitchedVersion.newSong : s))
    );
  }, [lastSwitchedVersion]);

  const loadData = async () => {
    if (!window.mochyApi) return;
    setLoading(true);
    try {
      const [liked, hist, pls] = await Promise.all([
        window.mochyApi.getLikedSongs(),
        window.mochyApi.getHistory(60, 0),
        window.mochyApi.getPlaylists(),
      ]);
      setLikedSongs(liked || []);
      setHistoryItems(hist || []);
      setPlaylists(pls || []);
    } catch (err) {
      console.error("Failed to load library data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [playlistRefreshKey]);

  const handleClearHistory = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử nghe nhạc không?")) {
      if (window.mochyApi) {
        await window.mochyApi.clearHistory();
        setHistoryItems([]);
      }
    }
  };

  const normalizedHistorySongs = useMemo<Song[]>(() => {
    const out: Song[] = [];
    for (const item of historyItems) {
      const vid = item.song?.id || (item.song as any)?.videoId || item.songId;
      if (!isValidTrackId(vid)) continue;
      out.push({
        id: vid.trim(),
        videoId: vid.trim(),
        title: item.song?.title || "Unknown Track",
        artists: item.song?.artists?.length ? item.song.artists : [{ name: "Unknown" }],
        thumbnail: item.song?.thumbnail || (item.song as any)?.thumbnailUrl || null,
        duration: item.song?.duration,
      });
    }
    return out;
  }, [historyItems]);

  const allLibrarySongs = useMemo<Song[]>(() => {
    const seen = new Set<string>();
    const combined: Song[] = [];
    for (const s of [...likedSongs, ...normalizedHistorySongs]) {
      if (!isValidTrackId(s.id) || seen.has(s.id)) continue;
      seen.add(s.id);
      combined.push(s);
    }
    return combined;
  }, [likedSongs, normalizedHistorySongs]);

  const filterTerm = filterText.trim().toLowerCase();

  const matchesSong = (song: Song) => {
    if (!filterTerm) return true;
    const artistsStr = song.artists.map((a) => a.name).join(" ").toLowerCase();
    return song.title.toLowerCase().includes(filterTerm) || artistsStr.includes(filterTerm);
  };

  const downloadedSongs = useMemo<Song[]>(() => {
    return Object.values(downloadedMap)
      .sort((a, b) => b.downloadedAt - a.downloadedAt)
      .map((d) => ({
        id: d.videoId,
        videoId: d.videoId,
        title: d.title,
        artists: [{ name: d.artist || "Nghệ sĩ chưa rõ", id: null }],
        duration: d.duration ?? null,
        thumbnail: d.localCoverUrl || d.sourceThumbnail || null,
      }));
  }, [downloadedMap]);

  const totalDownloadedMb = useMemo(() => {
    const bytes = Object.values(downloadedMap).reduce((sum, d) => sum + (d.fileSize || 0), 0);
    return (bytes / (1024 * 1024)).toFixed(1);
  }, [downloadedMap]);

  const filteredLiked = useMemo(() => likedSongs.filter(matchesSong), [likedSongs, filterTerm]);
  const filteredDownloaded = useMemo(
    () => downloadedSongs.filter(matchesSong),
    [downloadedSongs, filterTerm]
  );
  const filteredAllSongs = useMemo(
    () => allLibrarySongs.filter(matchesSong),
    [allLibrarySongs, filterTerm]
  );
  const filteredHistory = useMemo(
    () => normalizedHistorySongs.filter(matchesSong),
    [normalizedHistorySongs, filterTerm]
  );
  const filteredPlaylists = useMemo(
    () =>
      filterTerm
        ? playlists.filter((p) => p.name.toLowerCase().includes(filterTerm))
        : playlists,
    [playlists, filterTerm]
  );

  const previewSongs = useMemo(() => {
    return allLibrarySongs
      .filter((s) => Boolean(s.thumbnail) || isValidTrackId(s.videoId || s.id))
      .slice(0, 4);
  }, [allLibrarySongs]);

  const padClass = sidebarExpanded ? "pl-[288px] pr-8" : "pl-[96px] pr-8";

  const tabs: Array<{ id: LibraryTab; label: string }> = [
    { id: "all", label: "Tất cả" },
    { id: "songs", label: "Bài hát" },
    { id: "playlists", label: "Playlists" },
    { id: "liked", label: "Đã thích" },
    { id: "downloaded", label: `Đã tải xuống (Offline${downloadedSongs.length > 0 ? ` • ${downloadedSongs.length}` : ""})` },
    { id: "history", label: "Lịch sử" },
  ];

  return (
    <div
      className={`flex-1 overflow-y-auto pt-20 pb-10 space-y-6 select-none font-sans bg-[#0a0a0c] text-[#f5f5f7] transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${padClass}`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">Library</h1>

        <div className="flex items-center gap-2.5">
          {onOpenSpotifyImport && (
            <button
              type="button"
              onClick={onOpenSpotifyImport}
              className="px-4 py-2 rounded-full bg-[#1DB954]/20 hover:bg-[#1DB954]/30 border border-[#1DB954]/40 text-[#4ade80] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
              <span>Nhập từ Spotify</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenCreatePlaylist}
            className="px-4 py-2 rounded-full bg-white/[0.10] hover:bg-white/[0.18] border border-white/[0.10] text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo playlist</span>
          </button>
        </div>
      </div>

      {/* Filter Search + Pill Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-white text-black shadow-sm"
                    : "bg-white/[0.07] text-white/70 hover:text-white hover:bg-white/[0.12] border border-white/[0.06]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-white/45 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Lọc trong thư viện..."
            className="w-full h-9 pl-9 pr-8 rounded-full bg-white/[0.07] border border-white/[0.08] focus:border-white/[0.22] focus:bg-white/[0.11] text-xs text-white placeholder-white/40 focus:outline-none transition-all"
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText("")}
              aria-label="Xóa bộ lọc"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* TAB: ALL (Overview Cards + Recent Tracks) */}
      {activeTab === "all" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Songs Overview Card */}
            <button
              type="button"
              onClick={() => handleSelectTab("songs")}
              className="group relative h-44 rounded-[20px] overflow-hidden bg-[#16161b] border border-white/[0.08] hover:border-white/[0.20] text-left p-4 flex flex-col justify-between transition-all cursor-pointer shadow-lg"
            >
              <div className="grid grid-cols-2 gap-1.5 w-24 h-24 rounded-xl overflow-hidden bg-white/[0.05]">
                {[0, 1, 2, 3].map((slot) =>
                  previewSongs[slot] ? (
                    <TrackThumbnail
                      key={slot}
                      src={previewSongs[slot].thumbnail}
                      videoId={previewSongs[slot].videoId || previewSongs[slot].id}
                      iconSize="xs"
                      className="w-full h-full"
                    />
                  ) : (
                    <div key={slot} className="w-full h-full bg-white/[0.05]" />
                  )
                )}
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-base font-bold text-white">Bài hát đã lưu</p>
                  <p className="text-xs text-white/55 mt-0.5">{allLibrarySongs.length} bài hát</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/50 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* Playlists Overview Card */}
            <button
              type="button"
              onClick={() => handleSelectTab("playlists")}
              className="group relative h-44 rounded-[20px] overflow-hidden bg-[#16161b] border border-white/[0.08] hover:border-white/[0.20] text-left p-4 flex flex-col justify-between transition-all cursor-pointer shadow-lg"
            >
              <div className="grid grid-cols-2 gap-1.5 w-24 h-24 rounded-xl overflow-hidden bg-white/[0.05]">
                {[0, 1, 2, 3].map((slot) =>
                  playlists[slot]?.thumbnailUrl ? (
                    <TrackThumbnail
                      key={slot}
                      src={playlists[slot].thumbnailUrl}
                      iconSize="xs"
                      className="w-full h-full"
                    />
                  ) : (
                    <div
                      key={slot}
                      className="w-full h-full bg-white/[0.05] flex items-center justify-center"
                    >
                      {slot === 0 && <ListMusic className="w-4 h-4 text-white/25" />}
                    </div>
                  )
                )}
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-base font-bold text-white">Playlists</p>
                  <p className="text-xs text-white/55 mt-0.5">{playlists.length} danh sách phát</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/50 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* Liked Songs Overview Card */}
            <button
              type="button"
              onClick={() => handleSelectTab("liked")}
              className="group relative h-44 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#2a1820] via-[#1c1419] to-[#141418] border border-white/[0.08] hover:border-white/[0.22] text-left p-4 flex flex-col justify-between transition-all cursor-pointer shadow-lg"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/[0.10] backdrop-blur-md flex items-center justify-center">
                <Heart className="w-7 h-7 text-[#fa233b] fill-[#fa233b]" />
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-base font-bold text-white">Bài hát đã thích</p>
                  <p className="text-xs text-white/60 mt-0.5">{likedSongs.length} bài yêu thích</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/55 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>

            {/* Offline Downloaded Songs Overview Card */}
            <button
              type="button"
              onClick={() => handleSelectTab("downloaded")}
              className="group relative h-44 rounded-[20px] overflow-hidden bg-gradient-to-br from-[#132922] via-[#121e1b] to-[#141418] border border-white/[0.08] hover:border-emerald-400/35 text-left p-4 flex flex-col justify-between transition-all cursor-pointer shadow-lg"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/25 backdrop-blur-md flex items-center justify-center">
                <ArrowDownToLine className="w-7 h-7 text-emerald-400" />
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-base font-bold text-white">Đã tải xuống</p>
                  <p className="text-xs text-emerald-200/75 mt-0.5">
                    {downloadedSongs.length} bài • {totalDownloadedMb} MB
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/55 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>

          {filteredPlaylists.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Playlists gần đây</h2>
                <button
                  type="button"
                  onClick={() => handleSelectTab("playlists")}
                  className="text-xs text-white/55 hover:text-white cursor-pointer"
                >
                  Xem tất cả
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredPlaylists.slice(0, 5).map((pl) => (
                  <button
                    type="button"
                    key={pl.id}
                    onClick={() => onSelectPlaylist(pl.id)}
                    className="group text-left cursor-pointer"
                  >
                    <TrackThumbnail
                      src={pl.thumbnailUrl}
                      alt={pl.name}
                      iconSize="lg"
                      className="aspect-square rounded-[18px] bg-[#18181d] border border-white/[0.08] group-hover:border-white/[0.20] mb-2 shadow-md transition-all"
                      imgClassName="group-hover:scale-105 transition-transform duration-300"
                    />
                    <p className="text-[13px] font-semibold text-white truncate">{pl.name}</p>
                    <p className="text-xs text-white/50 mt-0.5">{pl.songCount || 0} bài hát</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB: SONGS */}
      {activeTab === "songs" && (
        <div className="space-y-3">
          {filteredAllSongs.length > 0 && (
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => playSong(filteredAllSongs[0], filteredAllSongs, null)}
                className="px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Phát tất cả ({filteredAllSongs.length})</span>
              </button>
            </div>
          )}

          {filteredAllSongs.length === 0 ? (
            <div className="text-center py-20 text-white/45">
              <Disc className="w-10 h-10 mx-auto mb-3 opacity-35" />
              <p className="text-sm font-semibold text-white/75">Chưa có bài hát trong thư viện</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredAllSongs.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={filteredAllSongs}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: PLAYLISTS */}
      {activeTab === "playlists" && (
        <div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[18px] bg-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredPlaylists.map((pl) => (
                <button
                  type="button"
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl.id)}
                  className="group text-left cursor-pointer"
                >
                  <div className="aspect-square rounded-[18px] overflow-hidden bg-[#18181d] border border-white/[0.08] group-hover:border-white/[0.22] mb-2 relative shadow-md transition-all">
                    <TrackThumbnail
                      src={pl.thumbnailUrl}
                      alt={pl.name}
                      iconSize="lg"
                      className="w-full h-full"
                      imgClassName="group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                      </span>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-white truncate">{pl.name}</p>
                  <p className="text-xs text-white/50 truncate mt-0.5">
                    {pl.songCount || 0} bài hát
                  </p>
                </button>
              ))}

              <button
                type="button"
                onClick={onOpenCreatePlaylist}
                className="aspect-square rounded-[18px] bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.16] flex flex-col items-center justify-center gap-2 text-white/60 hover:text-white transition-all cursor-pointer"
              >
                <Plus className="w-7 h-7" />
                <span className="text-xs font-semibold">Tạo playlist mới</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: LIKED */}
      {activeTab === "liked" && (
        <div className="space-y-4">
          {filteredLiked.length > 0 && (
            <div className="flex items-center justify-between bg-white/[0.05] border border-white/[0.08] p-4 rounded-2xl">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => playSong(filteredLiked[0], filteredLiked, null)}
                  className="px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Phát tất cả</span>
                </button>
                <span className="text-xs text-white/60">
                  {filteredLiked.length} bài hát yêu thích
                </span>
              </div>
            </div>
          )}

          {filteredLiked.length === 0 ? (
            <div className="text-center py-20 text-white/45">
              <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-white/75">Chưa có bài hát yêu thích nào</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLiked.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={filteredLiked}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: DOWNLOADED (OFFLINE) */}
      {activeTab === "downloaded" && (
        <div className="space-y-4">
          {filteredDownloaded.length > 0 && (
            <div className="flex items-center justify-between bg-white/[0.05] border border-white/[0.08] p-4 rounded-2xl">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => playSong(filteredDownloaded[0], filteredDownloaded, null)}
                  className="px-4 py-2 rounded-full bg-white text-black hover:bg-white/90 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Phát tất cả</span>
                </button>
                <span className="text-xs text-emerald-300/85 font-medium">
                  {filteredDownloaded.length} bài hát Offline • {totalDownloadedMb} MB (phát không cần mạng)
                </span>
              </div>
            </div>
          )}

          {filteredDownloaded.length === 0 ? (
            <div className="text-center py-20 text-white/45">
              <ArrowDownToLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-white/75">
                Chưa có bài hát nào được tải xuống
              </p>
              <p className="text-xs text-white/45 mt-1">
                Bấm biểu tượng tải xuống trên bất kỳ bài hát hoặc playlist nào để nghe khi mất mạng
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredDownloaded.map((song, idx) => (
                <SongRow
                  key={`dl-${song.id}`}
                  song={song}
                  index={idx}
                  playlistContext={filteredDownloaded}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-3">
          {filteredHistory.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/55">
                {filteredHistory.length} lượt phát gần đây
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lịch sử</span>
              </button>
            </div>
          )}

          {filteredHistory.length === 0 ? (
            <div className="text-center py-20 text-white/45">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-white/75">Chưa có lịch sử nghe nhạc</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredHistory.map((song, idx) => (
                <SongRow
                  key={`${song.id}-${idx}`}
                  song={song}
                  index={idx}
                  playlistContext={filteredHistory}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
