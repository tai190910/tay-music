// src/renderer/components/Sidebar.tsx

import React, { useEffect, useState } from "react";
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Radio,
  ListMusic,
  Terminal,
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
    <aside className="w-64 bg-[#13161c] border-r border-[#242a35] flex flex-col h-full flex-shrink-0 select-none font-sans z-10">
      {/* App Branding - Cyber Terminal Style */}
      <div className="p-4 border-b border-[#242a35]/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-sm bg-[#181c24] border border-[#00f0ff]/40 flex items-center justify-center shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <Radio className="w-4 h-4 text-[#00f0ff] animate-pulse" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-widest text-white leading-none font-mono">
              TÀY<span className="text-[#00f0ff]">.OS</span>
            </h1>
            <span className="text-[10px] font-mono text-[#8492a6] tracking-wider block mt-0.5">
              // MUSIC_TERMINAL
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[#181c24] border border-[#242a35]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-ping" />
          <span className="text-[9px] font-mono text-[#00ff9d] font-bold">ONLINE</span>
        </div>
      </div>

      {/* Main Navigation - HUD Indexed Menu */}
      <div className="p-3">
        <div className="text-[10px] font-mono text-[#444c5c] font-semibold tracking-wider px-2 mb-2 uppercase">
          // NAVIGATION_ROOT
        </div>
        <nav className="space-y-1">
          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("home");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-sm text-xs font-mono transition-all border ${
              activeView === "home" && !selectedPlaylistId
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_12px_rgba(0,240,255,0.15)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/60 border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Home className="w-4 h-4 flex-shrink-0" />
              <span className="font-sans text-xs">Trang chủ</span>
            </div>
            <span className="text-[10px] text-[#444c5c] font-mono">[01]</span>
          </button>

          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("search");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-sm text-xs font-mono transition-all border ${
              activeView === "search" && !selectedPlaylistId
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_12px_rgba(0,240,255,0.15)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/60 border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="font-sans text-xs">Tìm kiếm</span>
            </div>
            <span className="text-[10px] text-[#444c5c] font-mono">[02]</span>
          </button>

          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("library");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-sm text-xs font-mono transition-all border ${
              activeView === "library" && !selectedPlaylistId
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/50 shadow-[0_0_12px_rgba(0,240,255,0.15)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/60 border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Library className="w-4 h-4 flex-shrink-0" />
              <span className="font-sans text-xs">Thư viện</span>
            </div>
            <span className="text-[10px] text-[#444c5c] font-mono">[03]</span>
          </button>
        </nav>
      </div>

      {/* Cyber Actions - Uplink Module */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenSpotifyImport}
          className="w-full flex items-center justify-between px-3 py-2 rounded-sm text-xs font-mono bg-[#14231b] hover:bg-[#183024] text-[#00ff9d] border border-[#00ff9d]/30 hover:border-[#00ff9d]/70 transition-all shadow-[0_0_10px_rgba(0,255,157,0.1)] group"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 flex-shrink-0 text-[#00ff9d]" />
            <span className="font-sans text-xs font-medium">Nhập từ Spotify</span>
          </div>
          <span className="text-[9px] text-[#00ff9d]/70 font-mono font-bold group-hover:translate-x-0.5 transition-transform">
            [UPLINK]
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-[#242a35]/60" />

      {/* Playlists Header */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#444c5c] font-semibold tracking-wider uppercase">
          // PLAYLISTS [{playlists.length}]
        </span>
        <button
          onClick={onOpenCreatePlaylist}
          title="Tạo playlist mới"
          className="p-1 rounded-sm text-[#8492a6] hover:text-[#00f0ff] hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Playlists List */}
      <div className="flex-1 px-3 overflow-y-auto space-y-1">
        {/* Liked Songs Shortcut */}
        <button
          onClick={() => {
            setSelectedPlaylistId(null);
            setActiveView("library");
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs text-[#8492a6] hover:text-white hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all group"
        >
          <div className="flex items-center gap-2 truncate">
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/30 flex-shrink-0" />
            <span className="truncate font-sans">Bài hát đã thích</span>
          </div>
          <span className="text-[9px] font-mono text-[#444c5c] group-hover:text-[#00f0ff]">
            &gt;
          </span>
        </button>

        {/* User Created Playlists */}
        {playlists.map((playlist, idx) => (
          <button
            key={playlist.id}
            onClick={() => {
              setSelectedPlaylistId(playlist.id);
              setActiveView("playlist-detail");
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs transition-all text-left border ${
              selectedPlaylistId === playlist.id
                ? "bg-[#181c24] text-[#00f0ff] border-[#00f0ff]/40 font-medium"
                : "text-[#8492a6] hover:text-white hover:bg-[#181c24]/50 border-transparent hover:border-[#242a35]"
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <ListMusic className="w-3.5 h-3.5 flex-shrink-0 text-[#444c5c]" />
              <span className="truncate font-sans">{playlist.name}</span>
            </div>
            <span className="text-[9px] font-mono text-[#444c5c]">
              #{String(idx + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>

      {/* Sidebar Footer - System Telemetry Tag */}
      <div className="p-2.5 border-t border-[#242a35]/80 bg-[#0d0f12]/60 text-[9px] font-mono text-[#444c5c] flex items-center justify-between">
        <span>CORE: INNERTUBE_X</span>
        <span className="text-[#00ff9d]">OK:200</span>
      </div>
    </aside>
  );
};
