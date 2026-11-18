// src/renderer/components/Sidebar.tsx

import React, { useEffect, useState } from "react";
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Music,
  ListMusic,
} from "lucide-react";
import type { ActiveView, Playlist } from "../types.ts";

interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  onOpenCreatePlaylist: () => void;
  onOpenSpotifyImport: () => void;
  playlistRefreshKey: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  selectedPlaylistId,
  setSelectedPlaylistId,
  onOpenCreatePlaylist,
  onOpenSpotifyImport,
  playlistRefreshKey,
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    if (window.mochyApi) {
      window.mochyApi.getPlaylists().then(setPlaylists).catch(console.error);
    }
  }, [playlistRefreshKey]);

  return (
    <aside className="w-64 bg-mochy-sidebar border-r border-mochy-border flex flex-col h-full flex-shrink-0 select-none">
      {/* App Branding */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mochy-accent to-rose-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
          <Music className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-white leading-none">
            Tày<span className="text-mochy-accent">Music</span>
          </h1>
          <span className="text-[10px] text-mochy-subtext uppercase font-semibold tracking-wider">
            PC Edition
          </span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="px-3 py-2 space-y-1">
        <button
          onClick={() => {
            setSelectedPlaylistId(null);
            setActiveView("home");
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "home" && !selectedPlaylistId
              ? "bg-mochy-card text-white font-semibold"
              : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/60"
          }`}
        >
          <Home className={`w-5 h-5 ${activeView === "home" && !selectedPlaylistId ? "text-mochy-accent" : ""}`} />
          <span>Trang chủ</span>
        </button>

        <button
          onClick={() => {
            setSelectedPlaylistId(null);
            setActiveView("search");
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "search" && !selectedPlaylistId
              ? "bg-mochy-card text-white font-semibold"
              : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/60"
          }`}
        >
          <Search className={`w-5 h-5 ${activeView === "search" && !selectedPlaylistId ? "text-mochy-accent" : ""}`} />
          <span>Tìm kiếm</span>
        </button>

        <button
          onClick={() => {
            setSelectedPlaylistId(null);
            setActiveView("library");
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeView === "library" && !selectedPlaylistId
              ? "bg-mochy-card text-white font-semibold"
              : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/60"
          }`}
        >
          <Library className={`w-5 h-5 ${activeView === "library" && !selectedPlaylistId ? "text-mochy-accent" : ""}`} />
          <span>Thư viện</span>
        </button>
      </nav>

      {/* Divider */}
      <div className="my-2 mx-4 border-t border-mochy-border/60" />

      {/* Playlists Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-mochy-subtext uppercase tracking-wider">
          Danh sách phát
        </span>
        <button
          onClick={onOpenCreatePlaylist}
          title="Tạo playlist mới"
          className="p-1 rounded-md text-mochy-muted hover:text-white hover:bg-mochy-cardHover transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Playlists List */}
      <div className="flex-1 px-3 overflow-y-auto space-y-1">
        {/* Spotify Import Trigger */}
        <button
          onClick={onOpenSpotifyImport}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-400 hover:text-white hover:bg-emerald-950/40 border border-emerald-900/30 transition-all mb-1 group"
        >
          <div className="w-6 h-6 rounded-md bg-[#1DB954] flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <svg className="w-3.5 h-3.5 text-black fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          </div>
          <span className="truncate font-semibold text-xs">Nhập từ Spotify</span>
        </button>

        {/* Liked Songs Shortcut */}
        <button
          onClick={() => {
            setSelectedPlaylistId(null);
            setActiveView("library");
          }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-mochy-muted hover:text-white hover:bg-mochy-cardHover/60 transition-colors"
        >
          <div className="w-6 h-6 rounded bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center flex-shrink-0">
            <Heart className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="truncate">Bài hát đã thích</span>
        </button>

        {/* User Created Playlists */}
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            onClick={() => {
              setSelectedPlaylistId(playlist.id);
              setActiveView("playlist-detail");
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
              selectedPlaylistId === playlist.id
                ? "bg-mochy-card text-white font-medium"
                : "text-mochy-muted hover:text-white hover:bg-mochy-cardHover/60"
            }`}
          >
            <ListMusic className="w-4 h-4 flex-shrink-0 text-mochy-subtext" />
            <span className="truncate">{playlist.name}</span>
          </button>
        ))}
      </div>
    </aside>
  );
};
