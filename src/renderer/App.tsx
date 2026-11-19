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
import type { ActiveView, Song, Playlist } from "./types.ts";

const MainLayout: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    isLyricsOpen,
    setIsLyricsOpen,
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

      // Ctrl + F or Cmd + F: Quick Search
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

      // Escape: Close modals/lyrics
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
    <div className="h-screen w-screen flex flex-col bg-[#0d0f12] text-[#e2e8f0] overflow-hidden select-none font-sans cyber-grid-bg">
      {/* Top HUD Telemetry Banner */}
      <header className="h-7 bg-[#101217] border-b border-[#242a35] px-4 flex items-center justify-between text-[10px] font-mono text-[#8492a6] flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-[#00f0ff] font-bold tracking-wider">[TÀY.OS HUD]</span>
          <span className="text-[#444c5c]">//</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
            <span className="text-[#00ff9d]">SYS: NOMINAL</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[#8492a6]">
          {currentSong ? (
            <span className="truncate max-w-md">
              <span className="text-[#00f0ff] font-bold">&gt;&gt;</span> NOW_PLAYING:{" "}
              <span className="text-white font-sans font-medium">{currentSong.title}</span> -{" "}
              <span className="text-[#8492a6]">{currentSong.artists.map((a) => a.name).join(", ")}</span>
            </span>
          ) : (
            <span>// CHUNKED_AUDIO_STREAM_PROXY: STANDBY</span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[9px] text-[#444c5c]">
          <span className="px-1.5 py-0.5 rounded-xs bg-[#181c24] border border-[#242a35]">
            [SPACE] PLAY
          </span>
          <span className="px-1.5 py-0.5 rounded-xs bg-[#181c24] border border-[#242a35]">
            [CTRL+F] SEARCH
          </span>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Cyber Sidebar */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          selectedPlaylistId={selectedPlaylistId}
          setSelectedPlaylistId={setSelectedPlaylistId}
          onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
          onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
          playlistRefreshKey={playlistRefreshKey}
        />

        {/* Center Main Stage (Fixed 100vh viewport, internal scroll only) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0d0f12] relative">
          {activeView === "home" && (
            <HomeView
              onAddToPlaylist={(song) => setSongForAddToPlaylist(song)}
              onNavigateSearch={() => setActiveView("search")}
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
        </main>

        {/* Fullscreen Cyber Karaoke Lyrics HUD */}
        {isLyricsOpen && <LyricsView />}

        {/* Cyber Queue Drawer */}
        <QueueDrawer />
      </div>

      {/* Bottom RPG Character Status Player HUD */}
      <PlayerBar />

      {/* Cyber Modals */}
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
