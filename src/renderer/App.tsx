// src/renderer/App.tsx

import React, { useState, useEffect, useCallback } from "react";
import { ShieldAlert, WifiOff, X } from "lucide-react";
import { PlayerProvider, usePlayer } from "./context/PlayerContext.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { PlayerBar } from "./components/PlayerBar.tsx";
import { RightDrawer } from "./components/RightDrawer.tsx";
import { FullscreenPlayer } from "./components/FullscreenPlayer.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { HomeView } from "./views/HomeView.tsx";
import { SearchView } from "./views/SearchView.tsx";
import { LibraryView, type LibraryTab } from "./views/LibraryView.tsx";
import { PlaylistDetailView } from "./views/PlaylistDetailView.tsx";
import { CreatePlaylistModal, AddToPlaylistModal } from "./components/PlaylistModals.tsx";
import { SpotifyImportModal } from "./components/SpotifyImportModal.tsx";
import { QuickSwitchModal } from "./components/QuickSwitchModal.tsx";
import { PlaylistPickerProvider } from "./components/PlaylistPickerPopover.tsx";
import type { ActiveView, Playlist, Song } from "./types.ts";

const MainLayout: React.FC = () => {
  const {
    currentSong,
    togglePlay,
    seek,
    getCurrentTime,
    duration,
    volume,
    setVolume,
    rightDrawerTab,
    setRightDrawerTab,
    isFullscreenPlayerOpen,
    setIsFullscreenPlayerOpen,
    quickSwitchTarget,
    closeQuickSwitch,
    error,
    youtubeAuthToast,
    dismissYoutubeAuthToast,
    infoToast,
    dismissInfoToast,
  } = usePlayer();

  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [libraryTab, setLibraryTab] = useState<LibraryTab>("all");
  const [activeLibraryTab, setActiveLibraryTab] = useState<LibraryTab>("all");
  const [libraryTabRequestKey, setLibraryTabRequestKey] = useState(0);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsPlaybackFocusKey, setSettingsPlaybackFocusKey] = useState(0);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState(false);
  const [songForAddToPlaylist, setSongForAddToPlaylist] = useState<Song | null>(null);
  const [playlistRefreshKey, setPlaylistRefreshKey] = useState(0);

  const refreshPlaylists = useCallback(() => {
    setPlaylistRefreshKey((k) => k + 1);
  }, []);

  const openLibraryWithTab = useCallback((tab: LibraryTab) => {
    setLibraryTab(tab);
    setActiveLibraryTab(tab);
    setLibraryTabRequestKey((k) => k + 1);
    setSelectedPlaylistId(null);
    setActiveView("library");
  }, []);

  const handlePlaylistCreated = useCallback(
    (pl: Playlist) => {
      refreshPlaylists();
      setSelectedPlaylistId(pl.id);
      setActiveView("playlist-detail");
    },
    [refreshPlaylists]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toUpperCase() || "";
      const role = target?.getAttribute("role") || "";
      const isEditable =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        setSelectedPlaylistId(null);
        setActiveView("search");
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('main input[type="text"]');
          input?.focus();
          input?.select();
        }, 60);
        return;
      }

      if (e.key === "Escape") {
        if (isFullscreenPlayerOpen) {
          setIsFullscreenPlayerOpen(false);
          return;
        }
        if (quickSwitchTarget) {
          closeQuickSwitch();
          return;
        }
        if (isSettingsModalOpen) {
          setIsSettingsModalOpen(false);
          return;
        }
        if (isSpotifyModalOpen) {
          setIsSpotifyModalOpen(false);
          return;
        }
        if (isCreatePlaylistOpen) {
          setIsCreatePlaylistOpen(false);
          return;
        }
        if (songForAddToPlaylist) {
          setSongForAddToPlaylist(null);
          return;
        }
        if (rightDrawerTab) {
          setRightDrawerTab(null);
          return;
        }
      }

      if (isEditable) return;

      const isInteractiveButton = tagName === "BUTTON" || tagName === "A" || role === "switch";

      if (e.code === "Space" && !isInteractiveButton && currentSong) {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight" && currentSong && !isInteractiveButton) {
        e.preventDefault();
        const maxDuration = duration > 0 ? duration : currentSong.duration || 0;
        const targetSec =
          maxDuration > 0
            ? Math.min(maxDuration, getCurrentTime() + 5)
            : getCurrentTime() + 5;
        seek(targetSec);
      } else if (e.code === "ArrowLeft" && currentSong && !isInteractiveButton) {
        e.preventDefault();
        seek(Math.max(0, getCurrentTime() - 5));
      } else if (e.code === "ArrowUp" && !isInteractiveButton) {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      } else if (e.code === "ArrowDown" && !isInteractiveButton) {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentSong,
    duration,
    getCurrentTime,
    seek,
    togglePlay,
    volume,
    setVolume,
    isFullscreenPlayerOpen,
    setIsFullscreenPlayerOpen,
    quickSwitchTarget,
    closeQuickSwitch,
    isSettingsModalOpen,
    isSpotifyModalOpen,
    isCreatePlaylistOpen,
    songForAddToPlaylist,
    rightDrawerTab,
    setRightDrawerTab,
  ]);

  return (
    <PlaylistPickerProvider onPlaylistsChanged={refreshPlaylists}>
      <div className="h-screen w-screen flex bg-[#0a0a0c] text-[#f5f5f7] overflow-hidden select-none font-sans relative">
        {/* Floating Left Pill Sidebar */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          selectedPlaylistId={selectedPlaylistId}
          setSelectedPlaylistId={setSelectedPlaylistId}
          isExpanded={sidebarExpanded}
          onToggleExpand={() => setSidebarExpanded((prev) => !prev)}
          isLikedShortcutActive={activeView === "library" && activeLibraryTab === "liked"}
          onOpenLibrary={() => openLibraryWithTab("all")}
          onOpenLikedSongs={() => openLibraryWithTab("liked")}
          onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
          onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          playlistRefreshKey={playlistRefreshKey}
        />

        {/* Main Stage + Optional Right Split Drawer */}
        <div className="flex-1 min-w-0 h-full flex overflow-hidden relative">
          <main className="flex-1 min-w-0 h-full relative flex flex-col overflow-hidden bg-[#0a0a0c]">
            {/* Floating Top Dynamic Island Pill Player */}
            <PlayerBar sidebarExpanded={sidebarExpanded} />

            {/* Active Page View */}
            {activeView === "home" && (
              <HomeView
                onAddToPlaylist={setSongForAddToPlaylist}
                onNavigateSearch={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("search");
                }}
                onSelectPlaylist={(id) => {
                  setSelectedPlaylistId(id);
                  setActiveView("playlist-detail");
                }}
                onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
                sidebarExpanded={sidebarExpanded}
                playlistRefreshKey={playlistRefreshKey}
              />
            )}

            {activeView === "search" && (
              <SearchView
                onAddToPlaylist={setSongForAddToPlaylist}
                sidebarExpanded={sidebarExpanded}
              />
            )}

            {activeView === "library" && (
              <LibraryView
                onAddToPlaylist={setSongForAddToPlaylist}
                onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
                onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
                onSelectPlaylist={(id) => {
                  setSelectedPlaylistId(id);
                  setActiveView("playlist-detail");
                }}
                playlistRefreshKey={playlistRefreshKey}
                initialTab={libraryTab}
                tabRequestKey={libraryTabRequestKey}
                onActiveTabChange={setActiveLibraryTab}
                sidebarExpanded={sidebarExpanded}
              />
            )}

            {activeView === "playlist-detail" && selectedPlaylistId && (
              <PlaylistDetailView
                playlistId={selectedPlaylistId}
                onBack={() => setActiveView("library")}
                onAddToPlaylist={setSongForAddToPlaylist}
                onPlaylistDeleted={() => {
                  refreshPlaylists();
                  setSelectedPlaylistId(null);
                  setActiveView("library");
                }}
                sidebarExpanded={sidebarExpanded}
              />
            )}

            {/* Actionable YouTube Anti-Bot / 429 Circuit Breaker Toast */}
            {youtubeAuthToast ? (
              <div
                role="alert"
                className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,560px)] px-4 py-3 rounded-2xl bg-[#191519]/95 backdrop-blur-2xl border border-rose-500/40 text-[#f5f5f7] shadow-[0_18px_50px_rgba(0,0,0,0.75)] flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/35 text-rose-300 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 text-[12.5px] leading-snug text-[#e5e5ea]">
                  {youtubeAuthToast.message}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dismissYoutubeAuthToast();
                    setSettingsPlaybackFocusKey((k) => k + 1);
                    setIsSettingsModalOpen(true);
                  }}
                  className="min-h-[44px] px-4 rounded-full bg-[#fa243c] hover:bg-[#ff3b52] text-white text-[12px] font-semibold shrink-0 transition-colors cursor-pointer"
                >
                  Đăng nhập YouTube
                </button>
                <button
                  type="button"
                  onClick={dismissYoutubeAuthToast}
                  aria-label="Đóng thông báo"
                  className="w-11 h-11 rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              error && (
                <div
                  role="status"
                  className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#1c1417]/90 backdrop-blur-xl border border-rose-500/35 text-rose-200 text-[12.5px] shadow-xl max-w-md truncate"
                >
                  {error}
                </div>
              )
            )}

            {/* Info / Offline Mode Toast */}
            {infoToast && (
              <div
                role="status"
                className="pointer-events-auto fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-[#191b22]/95 backdrop-blur-2xl border border-amber-400/35 text-amber-100 text-[12.5px] shadow-[0_14px_40px_rgba(0,0,0,0.75)] flex items-center gap-2.5 max-w-[90vw]"
              >
                <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="truncate">{infoToast}</span>
                <button
                  type="button"
                  onClick={dismissInfoToast}
                  aria-label="Đóng thông báo"
                  className="w-6 h-6 rounded-full text-white/60 hover:text-white hover:bg-white/[0.08] flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </main>

          {/* Right Split Drawer (Up Next / Lyrics) */}
          <RightDrawer />
        </div>

        {/* Fullscreen Now Playing Overlay */}
        <FullscreenPlayer />

        {/* Modals */}
        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onOpenSpotifyImport={() => setIsSpotifyModalOpen(true)}
          onHistoryCleared={refreshPlaylists}
          focusPlaybackKey={settingsPlaybackFocusKey}
        />

        <CreatePlaylistModal
          isOpen={isCreatePlaylistOpen}
          onClose={() => setIsCreatePlaylistOpen(false)}
          onCreated={handlePlaylistCreated}
        />

        <AddToPlaylistModal
          song={songForAddToPlaylist}
          onClose={() => setSongForAddToPlaylist(null)}
          onAdded={refreshPlaylists}
        />

        <SpotifyImportModal
          isOpen={isSpotifyModalOpen}
          onClose={() => setIsSpotifyModalOpen(false)}
          onImportComplete={refreshPlaylists}
        />

        <QuickSwitchModal />
      </div>
    </PlaylistPickerProvider>
  );
};

export default function App() {
  return (
    <PlayerProvider>
      <MainLayout />
    </PlayerProvider>
  );
}
