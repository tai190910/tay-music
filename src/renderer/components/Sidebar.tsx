// src/renderer/components/Sidebar.tsx

import React, { useEffect, useState } from "react";
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Terminal,
  ListMusic,
  Mic2,
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
    <aside className="w-60 bg-[#0f151f] border-r border-[#1e293b] flex flex-col h-full flex-shrink-0 select-none font-sans z-10">
      {/* Navigation Root Header */}
      <div className="px-3.5 pt-3.5 pb-2">
        <div className="text-[10px] font-mono text-[#475569] font-bold tracking-wider px-1 mb-2 uppercase">
          // BẢNG ĐIỀU KHIỂN
        </div>

        <nav className="space-y-1">
          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("home");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono transition-all border ${
              activeView === "home" && !selectedPlaylistId
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_12px_rgba(37,137,245,0.2)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/60 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <div className="flex items-center gap-2.5 font-sans">
              <Home className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Trang chủ</span>
            </div>
            <span className="text-[10px] text-[#475569] font-mono">[01]</span>
          </button>

          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("search");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono transition-all border ${
              activeView === "search" && !selectedPlaylistId
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_12px_rgba(37,137,245,0.2)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/60 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <div className="flex items-center gap-2.5 font-sans">
              <Search className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Tìm kiếm</span>
            </div>
            <span className="text-[10px] text-[#475569] font-mono">[02]</span>
          </button>

          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("library");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono transition-all border ${
              activeView === "library" && !selectedPlaylistId
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_12px_rgba(37,137,245,0.2)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/60 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <div className="flex items-center gap-2.5 font-sans">
              <Library className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Thư viện</span>
            </div>
            <span className="text-[10px] text-[#475569] font-mono">[03]</span>
          </button>

          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("lyrics");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono transition-all border ${
              activeView === "lyrics" && !selectedPlaylistId
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] shadow-[0_0_12px_rgba(37,137,245,0.2)] font-semibold"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/60 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <div className="flex items-center gap-2.5 font-sans">
              <Mic2 className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">Lời bài hát</span>
            </div>
            <span className="text-[10px] text-[#2ecc71] font-mono font-bold">[LRC]</span>
          </button>
        </nav>
      </div>

      {/* Action Button: Import Spotify */}
      <div className="px-3.5 pb-2">
        <button
          onClick={onOpenSpotifyImport}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-mono bg-[#090d14] hover:bg-[#16202e] text-[#2ecc71] border border-[#2ecc71]/40 hover:border-[#2ecc71] transition-all shadow-[0_0_8px_rgba(46,204,113,0.15)] group"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 flex-shrink-0 text-[#2ecc71]" />
            <span className="font-sans text-xs font-medium">Nhập từ Spotify</span>
          </div>
          <span className="text-[9px] text-[#2ecc71] font-mono font-bold group-hover:translate-x-0.5 transition-transform">
            [+]
          </span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3.5 border-t border-[#1e293b]" />

      {/* Playlists Header */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#475569] font-bold tracking-wider uppercase">
          // DANH SÁCH PHÁT [{playlists.length}]
        </span>
        <button
          onClick={onOpenCreatePlaylist}
          title="Tạo playlist mới"
          className="p-1 rounded-xs text-[#8492a6] hover:text-[#2589f5] hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all"
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
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs text-[#8492a6] hover:text-white hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all group"
        >
          <div className="flex items-center gap-2 truncate font-sans">
            <Heart className="w-3.5 h-3.5 text-[#e74c3c] fill-[#e74c3c]/30 flex-shrink-0" />
            <span className="truncate">Bài hát đã thích</span>
          </div>
          <span className="text-[9px] font-mono text-[#475569] group-hover:text-[#2589f5]">
            &gt;
          </span>
        </button>

        {/* User Playlists */}
        {playlists.map((playlist, idx) => (
          <button
            key={playlist.id}
            onClick={() => {
              setSelectedPlaylistId(playlist.id);
              setActiveView("playlist-detail");
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all text-left border ${
              selectedPlaylistId === playlist.id
                ? "bg-[#16202e] text-[#2589f5] border-[#2589f5] font-medium shadow-xs"
                : "text-[#8492a6] hover:text-white hover:bg-[#16202e]/60 border-transparent hover:border-[#1e293b]"
            }`}
          >
            <div className="flex items-center gap-2 truncate font-sans">
              <ListMusic className="w-3.5 h-3.5 flex-shrink-0 text-[#475569]" />
              <span className="truncate">{playlist.name}</span>
            </div>
            <span className="text-[9px] font-mono text-[#475569]">
              #{String(idx + 1).padStart(2, "0")}
            </span>
          </button>
        ))}
      </div>

      {/* Sidebar Footer */}
      <div className="p-2.5 border-t border-[#1e293b] bg-[#090d14] text-[9px] font-mono text-[#475569] flex items-center justify-between">
        <span>AUDIO_CORE: ONLINE</span>
        <span className="text-[#2ecc71] font-bold">206_OK</span>
      </div>
    </aside>
  );
};
