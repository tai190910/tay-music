// src/renderer/App.tsx

import React, { useState, useEffect } from "react";
import { PlayerProvider, usePlayer } from "./context/PlayerContext.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { PlayerBar } from "./components/PlayerBar.tsx";
import { LyricsView } from "./components/LyricsView.tsx";
import { QueueDrawer } from "./components/QueueDrawer.tsx";
import { CreatePlaylistModal, AddToPlaylistModal } from "./components/PlaylistModals.tsx";
import { SpotifyImportModal } from "./components/SpotifyImportModal.tsx";
import { HomeView } from "./views/HomeView.tsx";
import { SearchView } from "./views/SearchView.tsx";
import { LibraryView } from "./views/LibraryView.tsx";
import { PlaylistDetailView } from "./views/PlaylistDetailView.tsx";
import { Radio, Terminal, Settings, ListMusic, Mic2, Disc } from "lucide-react";
import type { ActiveView, Song, Playlist } from "./types.ts";

const MainLayout: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    isLyricsOpen,
    setIsLyricsOpen,
    isQueueOpen,
    setIsQueueOpen,
    togglePlay,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
  } = usePlayer();

  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [songForAddToPlaylist, setSongForAddToPlaylist] = useState<Song | null>(null);
  const [playlistRefreshKey, setPlaylistRefreshKey] = useState(0);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setSelectedPlaylistId(null);
        setActiveView("search");
        setTimeout(() => {
          const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }, 50);
        return;
      }

      if (e.key === "Escape") {
        if (isLyricsOpen) setIsLyricsOpen(false);
        if (isSpotifyModalOpen) setIsSpotifyModalOpen(false);
        if (isCreatePlaylistOpen) setIsCreatePlaylistOpen(false);
        if (songForAddToPlaylist) setSongForAddToPlaylist(null);
        return;
      }

      if (isInput) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, currentTime - 5));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seek(Math.min(duration, currentTime + 5));
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isLyricsOpen,
    isSpotifyModalOpen,
    isCreatePlaylistOpen,
    songForAddToPlaylist,
    togglePlay,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
  ]);

  const refreshPlaylists = () => {
    setPlaylistRefreshKey((prev) => prev + 1);
  };

  const handlePlaylistCreated = (playlist: Playlist) => {
    refreshPlaylists();
    setSelectedPlaylistId(playlist.id);
    setActiveView("playlist-detail");
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d14] text-[#e2e8f0] overflow-hidden select-none font-sans">
      {/* 1. Top Header Bar (Retro-RPG HUD Topbar) */}
      <header className="h-10 bg-[#0f151f] border-b border-[#1e293b] px-4 flex items-center justify-between flex-shrink-0 z-30 select-none">
        {/* Left: Icon + TÀY MUSIC + [DESKTOP PLAYER] badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-xs bg-[#e67e22]/15 border border-[#e67e22]/50 flex items-center justify-center text-[#e67e22]">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-wider text-white font-sans">
            TÀY MUSIC
          </span>
          {/* Badge styled exactly like [HARDCORE TEXT-RPG] in reference image */}
          <span className="text-[9px] font-mono font-bold tracking-widest text-[#e74c3c] border border-[#e74c3c]/80 bg-[#e74c3c]/10 px-1.5 py-0.5 rounded-xs uppercase">
            DESKTOP PLAYER
          </span>
        </div>

        {/* Center: Live playing status ticker */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-[#8492a6]">
          {currentSong ? (
            <span className="truncate max-w-md">
              <span className="text-[#2ecc71] font-bold">📍</span>{" "}
              <span className="text-white font-sans font-medium">{currentSong.title}</span>{" "}
              <span className="text-[#38bdf8]">// {currentSong.artists.map((a) => a.name).join(", ")}</span>
            </span>
          ) : (
            <span className="text-[#475569]">// CHUẨN BỊ PHÁT NHẠC</span>
          )}
        </div>

        {/* Right: Small square 1px-bordered action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Terminal Lyrics View */}
          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setActiveView("lyrics");
            }}
            title="Mở màn hình Lời bài hát Terminal"
            className={`w-7 h-7 rounded-xs border flex items-center justify-center transition-all cursor-pointer ${
              activeView === "lyrics"
                ? "bg-[#16202e] border-[#2589f5] text-[#2589f5] shadow-[0_0_8px_rgba(37,137,245,0.3)]"
                : "bg-[#090d14] border-[#1e293b] text-[#8492a6] hover:text-white hover:border-[#2589f5]"
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" />
          </button>

          {/* Import Spotify */}
          <button
            onClick={() => setIsSpotifyModalOpen(true)}
            title="Nhập playlist từ Spotify"
            className="w-7 h-7 rounded-xs bg-[#090d14] border border-[#1e293b] hover:border-[#2ecc71] text-[#2ecc71] flex items-center justify-center transition-all cursor-pointer shadow-xs"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Queue */}
          <button
            onClick={() => setIsQueueOpen((prev) => !prev)}
            title="Mở danh sách hàng đợi phát"
            className={`w-7 h-7 rounded-xs border flex items-center justify-center transition-all cursor-pointer ${
              isQueueOpen
                ? "bg-[#16202e] border-[#2589f5] text-[#2589f5] shadow-[0_0_8px_rgba(37,137,245,0.3)]"
                : "bg-[#090d14] border-[#1e293b] text-[#8492a6] hover:text-white hover:border-[#2589f5]"
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          selectedPlaylistId={selectedPlaylistId}
          setSelectedPlaylistId={setSelectedPlaylistId}
          onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
          onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
          playlistRefreshKey={playlistRefreshKey}
        />

        {/* Center Main Stage (Fixed 100vh Viewport, only internal scroll) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#090d14] relative">
          {activeView === "home" && (
            <HomeView
              onAddToPlaylist={(song) => setSongForAddToPlaylist(song)}
              onNavigateSearch={() => setActiveView("search")}
              onSelectPlaylist={(id) => {
                setSelectedPlaylistId(id);
                setActiveView("playlist-detail");
              }}
            />
          )}

          {activeView === "search" && (
            <SearchView onAddToPlaylist={(song) => setSongForAddToPlaylist(song)} />
          )}

          {activeView === "library" && (
            <LibraryView
              onAddToPlaylist={(song) => setSongForAddToPlaylist(song)}
              onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
              onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
              onSelectPlaylist={(id) => {
                setSelectedPlaylistId(id);
                setActiveView("playlist-detail");
              }}
              playlistRefreshKey={playlistRefreshKey}
            />
          )}

          {activeView === "playlist-detail" && selectedPlaylistId && (
            <PlaylistDetailView
              playlistId={selectedPlaylistId}
              onBack={() => {
                setSelectedPlaylistId(null);
                setActiveView("library");
              }}
              onAddToPlaylist={(song) => setSongForAddToPlaylist(song)}
              onPlaylistDeleted={() => refreshPlaylists()}
            />
          )}

          {/* Fullscreen/Main Terminal Synced Lyrics View */}
          {activeView === "lyrics" && (
            <div className="flex-1 overflow-hidden relative">
              <LyricsView isMainStageView={true} onClose={() => setActiveView("home")} />
            </div>
          )}
        </main>

        {/* Overlay Karaoke Lyrics (When opened via [LRC] button from playerbar) */}
        {isLyricsOpen && activeView !== "lyrics" && <LyricsView />}

        {/* Queue Drawer */}
        <QueueDrawer />
      </div>

      {/* 2. Bottom Fixed Player HUD */}
      <PlayerBar />

      {/* Modals */}
      <CreatePlaylistModal
        isOpen={isCreatePlaylistOpen}
        onClose={() => setIsCreatePlaylistOpen(false)}
        onCreated={handlePlaylistCreated}
      />

      <AddToPlaylistModal
        song={songForAddToPlaylist}
        onClose={() => setSongForAddToPlaylist(null)}
        onAdded={() => refreshPlaylists()}
      />

      <SpotifyImportModal
        isOpen={isSpotifyModalOpen}
        onClose={() => setIsSpotifyModalOpen(false)}
        onImportComplete={() => refreshPlaylists()}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <PlayerProvider>
      <MainLayout />
    </PlayerProvider>
  );
};

export default App;
