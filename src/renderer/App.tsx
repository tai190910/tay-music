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
    isLyricsOpen,
    setIsLyricsOpen,
    togglePlay,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    accentColor,
  } = usePlayer();
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [songForAddToPlaylist, setSongForAddToPlaylist] = useState<Song | null>(null);
  const [playlistRefreshKey, setPlaylistRefreshKey] = useState(0);

  // Desktop Global Keyboard Shortcuts
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

      // Ignore playback shortcuts while typing
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
    <div
      className="h-screen w-screen flex flex-col text-white overflow-hidden font-sans transition-colors duration-1000"
      style={{
        background: `radial-gradient(circle at 50% 0%, rgba(${accentColor.rgbString}, 0.08) 0%, rgba(11, 12, 16, 0.98) 55%, #0b0c10 100%)`,
      }}
    >
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          selectedPlaylistId={selectedPlaylistId}
          setSelectedPlaylistId={setSelectedPlaylistId}
          onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
          onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
          playlistRefreshKey={playlistRefreshKey}
        />

        {/* Center Dynamic View */}
        <main className="flex-1 flex flex-col overflow-hidden bg-mochy-bg relative">
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

        {/* Fullscreen Synchronized Karaoke Lyrics View */}
        {isLyricsOpen && <LyricsView />}

        {/* Upcoming Song Queue Drawer */}
        <QueueDrawer />
      </div>

      {/* Bottom Fixed Player Bar */}
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
