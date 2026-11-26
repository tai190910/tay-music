// src/renderer/components/Sidebar.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  Search,
  Library,
  Heart,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  Disc,
} from "lucide-react";
import type { ActiveView, Playlist } from "../types.ts";
import appIcon from "../assets/app-icon.png";

interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isLikedShortcutActive?: boolean;
  onOpenLibrary: () => void;
  onOpenLikedSongs: () => void;
  onOpenCreatePlaylist: () => void;
  onOpenSpotifyImport: () => void;
  onOpenSettings: () => void;
  playlistRefreshKey: number;
}

const PLAYLIST_DOT_COLORS = [
  "#facc15", // Amber Yellow
  "#2dd4bf", // Neon Teal
  "#f472b6", // Rose Pink
  "#38bdf8", // Sky Blue
  "#a78bfa", // Soft Violet
  "#fb923c", // Warm Orange
  "#4ade80", // Mint Green
];

function getPlaylistDotColor(playlistId: string, index: number): string {
  let hash = index;
  for (let i = 0; i < playlistId.length; i++) {
    hash = (hash * 31 + playlistId.charCodeAt(i)) >>> 0;
  }
  return PLAYLIST_DOT_COLORS[hash % PLAYLIST_DOT_COLORS.length];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  selectedPlaylistId,
  setSelectedPlaylistId,
  isExpanded,
  onToggleExpand,
  isLikedShortcutActive = false,
  onOpenLibrary,
  onOpenLikedSongs,
  onOpenCreatePlaylist,
  onOpenSpotifyImport,
  onOpenSettings,
  playlistRefreshKey,
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedCount, setLikedCount] = useState<number>(0);

  const dockContainerRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const mouseYRef = useRef<number | null>(null);

  const loadSidebarData = useCallback(() => {
    if (!window.mochyApi) return;
    window.mochyApi.getPlaylists().then((pls) => setPlaylists(pls || [])).catch(console.error);
    window.mochyApi
      .getLikedSongs()
      .then((songs) => setLikedCount(songs?.length || 0))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadSidebarData();
  }, [playlistRefreshKey, loadSidebarData]);

  useEffect(() => {
    const onRefresh = () => loadSidebarData();
    window.addEventListener("tay-likes-changed", onRefresh);
    window.addEventListener("tay-playlist-changed", onRefresh);
    return () => {
      window.removeEventListener("tay-likes-changed", onRefresh);
      window.removeEventListener("tay-playlist-changed", onRefresh);
    };
  }, [loadSidebarData]);

  const isHomeActive = activeView === "home" && !selectedPlaylistId;
  const isLibraryActive = activeView === "library" && !selectedPlaylistId && !isLikedShortcutActive;
  const isSearchActive = activeView === "search" && !selectedPlaylistId;

  const activeLabel = useMemo(() => {
    if (activeView === "playlist-detail" && selectedPlaylistId) {
      return playlists.find((p) => p.id === selectedPlaylistId)?.name || "Playlist";
    }
    if (isLikedShortcutActive) return "Đã thích";
    if (isLibraryActive) return "Thư viện";
    if (isSearchActive) return "Tìm kiếm";
    return "Trang chủ";
  }, [
    activeView,
    selectedPlaylistId,
    playlists,
    isLikedShortcutActive,
    isLibraryActive,
    isSearchActive,
  ]);

  // 60fps macOS Dock Magnification via requestAnimationFrame & direct CSS transforms
  const applyDockTransforms = useCallback((mouseY: number | null) => {
    const container = dockContainerRef.current;
    if (!container) return;
    const slots = Array.from(container.querySelectorAll<HTMLElement>("[data-dock-slot]"));
    if (slots.length === 0) return;

    if (mouseY === null) {
      for (const slot of slots) {
        const btn = slot.querySelector<HTMLElement>("[data-dock-btn]");
        if (!btn) continue;
        btn.style.transition = "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)";
        btn.style.transform = "translate3d(0, 0, 0) scale(1)";
        btn.style.zIndex = "1";
      }
      return;
    }

    const maxDistance = 110;
    const scales: number[] = [];
    const weights: number[] = [];
    const centers: number[] = [];

    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      centers.push(centerY);
      const dist = Math.abs(mouseY - centerY);
      const weight =
        dist < maxDistance ? Math.pow(Math.cos((dist / maxDistance) * (Math.PI / 2)), 2) : 0;
      weights.push(weight);
      scales.push(1 + 0.38 * weight);
    }

    const extraRadii = scales.map((s, idx) => {
      const baseSize = slots[idx].offsetHeight || 40;
      return ((s - 1) * baseSize) / 2;
    });

    const rawOffsets = new Array<number>(slots.length).fill(0);
    for (let i = 1; i < slots.length; i++) {
      rawOffsets[i] = rawOffsets[i - 1] + extraRadii[i - 1] + extraRadii[i];
    }

    let anchorOffset = rawOffsets[0];
    if (mouseY >= centers[centers.length - 1]) {
      anchorOffset = rawOffsets[slots.length - 1];
    } else {
      for (let i = 0; i < centers.length - 1; i++) {
        if (mouseY >= centers[i] && mouseY <= centers[i + 1]) {
          const span = Math.max(1, centers[i + 1] - centers[i]);
          const t = (mouseY - centers[i]) / span;
          anchorOffset = rawOffsets[i] + t * (rawOffsets[i + 1] - rawOffsets[i]);
          break;
        }
      }
    }

    for (let i = 0; i < slots.length; i++) {
      const btn = slots[i].querySelector<HTMLElement>("[data-dock-btn]");
      if (!btn) continue;
      const dy = (rawOffsets[i] - anchorOffset) * 0.85;
      const scale = scales[i];
      const weight = weights[i];
      btn.style.transition = "transform 0.06s linear";
      btn.style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      btn.style.zIndex = weight > 0.5 ? "10" : weight > 0.1 ? "5" : "1";
    }
  }, []);

  const handleDockMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isExpanded) return;
    mouseYRef.current = e.clientY;
    if (rafIdRef.current === null) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        applyDockTransforms(mouseYRef.current);
      });
    }
  };

  const handleDockMouseLeave = () => {
    mouseYRef.current = null;
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    applyDockTransforms(null);
  };

  useEffect(() => {
    if (isExpanded) {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      mouseYRef.current = null;
    }
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isExpanded]);

  const handleSpotlightMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  const collapsedPlaylists = useMemo(() => playlists.slice(0, 5), [playlists]);

  return (
    <aside
      aria-label="Thanh điều hướng chính"
      className={`glass-sidebar-v10 fixed left-3 top-3.5 bottom-3.5 z-30 rounded-[32px] overflow-hidden select-none ${
        isExpanded ? "w-[260px]" : "w-[68px]"
      }`}
    >
      {isExpanded ? (
        /* ==================== EXPANDED GLASSY SIDEBAR V10 ==================== */
        <div className="flex h-full w-full">
          {/* Left Navigation Column */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-3.5 pl-3">
            {/* Header + Quick Search */}
            <div className="pr-2.5 flex-shrink-0 space-y-2.5">
              {/* Brand Header */}
              <div className="flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlaylistId(null);
                    setActiveView("home");
                  }}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                >
                  <img
                    src={appIcon}
                    alt="Tày Music"
                    className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-white/[0.14] shadow-md group-hover:scale-105 transition-transform"
                  />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold tracking-tight text-white truncate leading-tight">
                      Tày Music
                    </div>
                    <div className="text-[10.5px] font-medium text-white/45 truncate leading-tight mt-0.5">
                      Desktop Player
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onToggleExpand}
                  title="Thu gọn Sidebar"
                  aria-label="Thu gọn Sidebar"
                  className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.10] text-white/75 hover:text-white flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Search Pill */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("search");
                }}
                onMouseMove={handleSpotlightMove}
                className={`w-full h-9 px-3 rounded-full flex items-center justify-between gap-2 text-left cursor-pointer border transition-all ${
                  isSearchActive
                    ? "bg-[#f8fafc] text-[#0f172a] border-[#f8fafc] shadow-sm font-semibold"
                    : "bg-white/[0.06] border-white/[0.10] text-white/60 hover:text-white v10-spotlight"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Search className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-[12px] truncate">Tìm kiếm...</span>
                </span>
                <kbd
                  className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    isSearchActive
                      ? "bg-[#0f172a]/10 text-[#0f172a]"
                      : "bg-white/[0.08] text-white/55 border border-white/[0.08]"
                  }`}
                >
                  Ctrl+K
                </kbd>
              </button>
            </div>

            {/* Scrollable Navigation + Playlists */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-4 space-y-1.5">
              {/* Main Menu */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("home");
                }}
                onMouseMove={!isHomeActive ? handleSpotlightMove : undefined}
                className={`h-10 px-3 flex items-center gap-3 text-left cursor-pointer ${
                  isHomeActive
                    ? "w-full v10-nav-active font-semibold"
                    : "w-[calc(100%-10px)] mr-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-white/75 hover:text-white v10-spotlight font-medium"
                }`}
              >
                <Home className="w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] truncate">Trang chủ</span>
              </button>

              <button
                type="button"
                onClick={onOpenLibrary}
                onMouseMove={!isLibraryActive ? handleSpotlightMove : undefined}
                className={`h-10 px-3 flex items-center gap-3 text-left cursor-pointer ${
                  isLibraryActive
                    ? "w-full v10-nav-active font-semibold"
                    : "w-[calc(100%-10px)] mr-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-white/75 hover:text-white v10-spotlight font-medium"
                }`}
              >
                <Library className="w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] truncate">Thư viện</span>
              </button>

              <button
                type="button"
                onClick={onOpenLikedSongs}
                onMouseMove={!isLikedShortcutActive ? handleSpotlightMove : undefined}
                className={`h-10 px-3 flex items-center justify-between gap-2 text-left cursor-pointer ${
                  isLikedShortcutActive
                    ? "w-full v10-nav-active font-semibold"
                    : "w-[calc(100%-10px)] mr-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-white/75 hover:text-white v10-spotlight font-medium"
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Heart
                    className={`w-4 h-4 flex-shrink-0 ${
                      isLikedShortcutActive ? "text-[#fa233b] fill-[#fa233b]" : "text-[#fb7185]"
                    }`}
                  />
                  <span className="text-[13px] truncate">Bài hát đã thích</span>
                </span>
                <span
                  className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                    isLikedShortcutActive
                      ? "bg-[#0f172a]/10 text-[#0f172a]"
                      : "bg-white/[0.08] text-white/65"
                  }`}
                >
                  {likedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenSpotifyImport}
                onMouseMove={handleSpotlightMove}
                className="w-[calc(100%-10px)] mr-2.5 h-10 px-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-white/75 hover:text-white v10-spotlight font-medium flex items-center gap-3 text-left cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#4ade80] flex-shrink-0" />
                <span className="text-[13px] truncate">Nhập từ Spotify</span>
              </button>

              {/* Playlists Section */}
              <div className="pt-3 mt-2 border-t border-white/[0.08]">
                <div className="pr-2.5 pl-1 pb-2 flex items-center justify-between">
                  <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-white/40">
                    Playlists
                  </span>
                  <button
                    type="button"
                    onClick={onOpenCreatePlaylist}
                    title="Tạo playlist mới"
                    aria-label="Tạo playlist mới"
                    className="w-6 h-6 rounded-full bg-white/[0.07] hover:bg-white/[0.16] border border-white/[0.08] text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 pb-2">
                  {playlists.length === 0 ? (
                    <p className="px-2 py-2 text-[11.5px] text-white/35">Chưa có playlist</p>
                  ) : (
                    playlists.map((pl, idx) => {
                      const isSelected =
                        activeView === "playlist-detail" && selectedPlaylistId === pl.id;
                      const dotColor = getPlaylistDotColor(pl.id, idx);
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlaylistId(pl.id);
                            setActiveView("playlist-detail");
                          }}
                          onMouseMove={!isSelected ? handleSpotlightMove : undefined}
                          className={`h-9 px-3 flex items-center justify-between gap-2 text-left cursor-pointer ${
                            isSelected
                              ? "w-full v10-nav-active font-semibold"
                              : "w-[calc(100%-10px)] mr-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] text-white/70 hover:text-white v10-spotlight font-medium"
                          }`}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: dotColor,
                                boxShadow: `0 0 8px ${dotColor}99`,
                              }}
                            />
                            <span className="text-[12.5px] truncate">{pl.name}</span>
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums flex-shrink-0 ${
                              isSelected
                                ? "bg-[#0f172a]/10 text-[#0f172a]"
                                : "bg-white/[0.07] text-white/50"
                            }`}
                          >
                            {pl.songCount || 0}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Footer Settings */}
            <div className="pt-2 pr-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={onOpenSettings}
                onMouseMove={handleSpotlightMove}
                className="w-full h-10 px-3 rounded-2xl bg-white/[0.05] border border-white/[0.08] text-white/80 hover:text-white v10-spotlight font-medium flex items-center gap-3 text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] truncate">Cài đặt</span>
              </button>
            </div>
          </div>

          {/* Right White Vertical Accent Rail */}
          <div
            aria-hidden="true"
            className="w-[24px] shrink-0 my-2.5 mr-2 rounded-[14px] bg-[#f8fafc] flex flex-col items-center justify-end pb-4 pt-4 relative z-[1] shadow-inner"
          >
            <span className="v10-rail-label text-[10px] font-bold tracking-[0.18em] uppercase text-[#0f172a]/40 max-h-[180px] truncate px-0.5">
              {activeLabel}
            </span>
          </div>
        </div>
      ) : (
        /* ==================== COLLAPSED macOS DOCK MODE ==================== */
        <div
          ref={dockContainerRef}
          onMouseMove={handleDockMouseMove}
          onMouseLeave={handleDockMouseLeave}
          className="w-full h-full flex flex-col items-center justify-between py-3 px-1.5"
        >
          {/* Top Dock Stack */}
          <div className="flex flex-col items-center gap-1.5">
            {/* Brand Logo -> Home */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("home");
                }}
                title="Tày Music — Trang chủ"
                aria-label="Tày Music Trang chủ"
                style={{ transformOrigin: "center center" }}
                className="w-10 h-10 rounded-full overflow-hidden border border-white/[0.16] shadow-md cursor-pointer flex items-center justify-center bg-black/40"
              >
                <img src={appIcon} alt="Tày Music" className="w-full h-full object-cover" />
              </button>
            </div>

            {/* Expand Sidebar */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={onToggleExpand}
                title="Mở rộng Sidebar"
                aria-label="Mở rộng Sidebar"
                style={{ transformOrigin: "center center" }}
                className="w-10 h-10 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-white/75 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("search");
                }}
                title="Tìm kiếm (Ctrl+K)"
                aria-label="Tìm kiếm"
                style={{ transformOrigin: "center center" }}
                className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                  isSearchActive
                    ? "bg-white text-[#0f172a] shadow-[0_6px_20px_rgba(255,255,255,0.28)]"
                    : "bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-white/80 hover:text-white"
                }`}
              >
                <Search className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Home */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={() => {
                  setSelectedPlaylistId(null);
                  setActiveView("home");
                }}
                title="Trang chủ"
                aria-label="Trang chủ"
                style={{ transformOrigin: "center center" }}
                className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                  isHomeActive
                    ? "bg-white text-[#0f172a] shadow-[0_6px_20px_rgba(255,255,255,0.28)]"
                    : "bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-white/80 hover:text-white"
                }`}
              >
                <Home className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Library */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={onOpenLibrary}
                title="Thư viện"
                aria-label="Thư viện"
                style={{ transformOrigin: "center center" }}
                className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                  isLibraryActive
                    ? "bg-white text-[#0f172a] shadow-[0_6px_20px_rgba(255,255,255,0.28)]"
                    : "bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-white/80 hover:text-white"
                }`}
              >
                <Library className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Liked Songs */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={onOpenLikedSongs}
                title={`Bài hát đã thích (${likedCount})`}
                aria-label="Bài hát đã thích"
                style={{ transformOrigin: "center center" }}
                className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                  isLikedShortcutActive
                    ? "bg-white text-[#fa233b] shadow-[0_6px_20px_rgba(255,255,255,0.28)]"
                    : "bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-white/80 hover:text-white"
                }`}
              >
                <Heart className="w-[18px] h-[18px] fill-current" />
              </button>
            </div>

            {/* Import Spotify */}
            <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <button
                data-dock-btn
                type="button"
                onClick={onOpenSpotifyImport}
                title="Nhập từ Spotify"
                aria-label="Nhập từ Spotify"
                style={{ transformOrigin: "center center" }}
                className="w-10 h-10 rounded-full bg-white/[0.07] hover:bg-white/[0.15] border border-white/[0.10] text-[#4ade80] hover:text-white flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>
            </div>

            {/* Compact Playlist Neon Dots */}
            {collapsedPlaylists.length > 0 && (
              <>
                <div className="w-7 h-px bg-white/[0.10] my-0.5 flex-shrink-0" />
                {collapsedPlaylists.map((pl, idx) => {
                  const isSelected =
                    activeView === "playlist-detail" && selectedPlaylistId === pl.id;
                  const dotColor = getPlaylistDotColor(pl.id, idx);
                  return (
                    <div
                      key={pl.id}
                      data-dock-slot
                      className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                    >
                      <button
                        data-dock-btn
                        type="button"
                        onClick={() => {
                          setSelectedPlaylistId(pl.id);
                          setActiveView("playlist-detail");
                        }}
                        title={`${pl.name} (${pl.songCount || 0} bài)`}
                        aria-label={`Mở playlist ${pl.name}`}
                        style={{ transformOrigin: "center center" }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-white text-[#0f172a] shadow-[0_6px_20px_rgba(255,255,255,0.28)]"
                            : "bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.09]"
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: dotColor,
                            boxShadow: isSelected ? "none" : `0 0 8px ${dotColor}`,
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {playlists.length > 5 && (
              <div data-dock-slot className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                <button
                  data-dock-btn
                  type="button"
                  onClick={onToggleExpand}
                  title={`Xem tất cả ${playlists.length} playlists`}
                  aria-label="Mở rộng để xem thêm playlist"
                  style={{ transformOrigin: "center center" }}
                  className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.14] border border-white/[0.08] text-white/60 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <Disc className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom Settings Dock Circle */}
          <div data-dock-slot className="w-10 h-10 flex items-center justify-center flex-shrink-0 pt-1">
            <button
              data-dock-btn
              type="button"
              onClick={onOpenSettings}
              title="Cài đặt (Settings)"
              aria-label="Cài đặt"
              style={{ transformOrigin: "center center" }}
              className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.12] text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
