// src/renderer/components/PlaylistPickerPopover.tsx

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Plus, X } from "lucide-react";
import type { Playlist, Song } from "../types.ts";
import { TrackThumbnail, getPreferredThumbnailUrl } from "./TrackThumbnail.tsx";

interface PlaylistPickerContextValue {
  openPlaylistPicker: (song: Song, anchorRect: DOMRect) => void;
  closePlaylistPicker: () => void;
  showToast: (message: string) => void;
}

const PlaylistPickerContext = createContext<PlaylistPickerContextValue | null>(null);

export const usePlaylistPicker = (): PlaylistPickerContextValue => {
  const ctx = useContext(PlaylistPickerContext);
  if (!ctx) {
    throw new Error("usePlaylistPicker must be used inside PlaylistPickerProvider");
  }
  return ctx;
};

interface PickerState {
  song: Song;
  left: number;
  top?: number;
  bottom?: number;
}

interface PlaylistPickerProviderProps {
  children: React.ReactNode;
  onPlaylistsChanged?: () => void;
}

const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 360;

export const PlaylistPickerProvider: React.FC<PlaylistPickerProviderProps> = ({
  children,
  onPlaylistsChanged,
}) => {
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creatingLoading, setCreatingLoading] = useState(false);

  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const closePlaylistPicker = useCallback(() => {
    setPickerState(null);
    setIsCreating(false);
    setNewPlaylistName("");
  }, []);

  const openPlaylistPicker = useCallback((song: Song, anchorRect: DOMRect) => {
    window.dispatchEvent(new CustomEvent("tay-close-context-menus"));

    const left = Math.max(
      8,
      Math.min(anchorRect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8)
    );
    const spaceBelow = window.innerHeight - anchorRect.bottom - 10;
    const openUpward = spaceBelow < 240 && anchorRect.top > POPOVER_MAX_HEIGHT * 0.65;

    setIsCreating(false);
    setNewPlaylistName("");
    setPickerState(
      openUpward
        ? {
            song,
            left,
            bottom: Math.max(8, window.innerHeight - anchorRect.top + 8),
          }
        : {
            song,
            left,
            top: Math.max(8, Math.min(anchorRect.bottom + 8, window.innerHeight - 160)),
          }
    );
  }, []);

  // Load playlists and song membership whenever popover opens or target song changes
  useEffect(() => {
    if (!pickerState || !window.mochyApi) return;

    let cancelled = false;
    const targetSongId = pickerState.song.id;
    setLoading(true);

    (async () => {
      try {
        const list = await window.mochyApi.getPlaylists();
        const presentSet = new Set<string>();
        await Promise.all(
          list.map(async (pl) => {
            try {
              const songs = await window.mochyApi.getPlaylistSongs(pl.id);
              if (songs.some((s) => s.id === targetSongId)) {
                presentSet.add(pl.id);
              }
            } catch {
              // Ignore failed membership read for an individual playlist
            }
          })
        );
        if (!cancelled) {
          setPlaylists(list);
          setMemberIds(presentSet);
        }
      } catch (err) {
        console.error("[PlaylistPickerPopover] Failed to load playlists:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pickerState?.song.id]);

  // Dismiss on outside mousedown or Escape key
  useEffect(() => {
    if (!pickerState) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popoverRef.current && target && !popoverRef.current.contains(target)) {
        closePlaylistPicker();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePlaylistPicker();
      }
    };

    const timerId = window.setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown, true);
      window.addEventListener("keydown", handleKeyDown, true);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [pickerState, closePlaylistPicker]);

  const handleTogglePlaylist = async (playlist: Playlist) => {
    if (!pickerState || !window.mochyApi || busyPlaylistId) return;
    const song = pickerState.song;
    const isAlreadyIn = memberIds.has(playlist.id);

    setBusyPlaylistId(playlist.id);
    try {
      if (isAlreadyIn) {
        await window.mochyApi.removeSongFromPlaylist(playlist.id, song.id);
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(playlist.id);
          return next;
        });
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlist.id
              ? { ...p, songCount: Math.max(0, (p.songCount ?? 1) - 1) }
              : p
          )
        );
        onPlaylistsChanged?.();
        window.dispatchEvent(
          new CustomEvent("tay-playlist-changed", { detail: { playlistId: playlist.id } })
        );
        showToast(`Đã gỡ khỏi playlist '${playlist.name}'`);
      } else {
        await window.mochyApi.addSongToPlaylist(playlist.id, song.id, song);
        setMemberIds((prev) => new Set(prev).add(playlist.id));
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlist.id ? { ...p, songCount: (p.songCount ?? 0) + 1 } : p
          )
        );
        onPlaylistsChanged?.();
        window.dispatchEvent(
          new CustomEvent("tay-playlist-changed", { detail: { playlistId: playlist.id } })
        );
        showToast(`Đã thêm vào playlist '${playlist.name}'`);
      }
    } catch (err) {
      console.error("[PlaylistPickerPopover] Failed to toggle song in playlist:", err);
      showToast("Không thể cập nhật playlist, vui lòng thử lại");
    } finally {
      setBusyPlaylistId(null);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed || !pickerState || !window.mochyApi || creatingLoading) return;

    const song = pickerState.song;
    setCreatingLoading(true);
    try {
      const created = await window.mochyApi.createPlaylist(
        trimmed,
        "",
        getPreferredThumbnailUrl(song.thumbnail, song.videoId || song.id) || undefined
      );
      await window.mochyApi.addSongToPlaylist(created.id, song.id, song);
      setPlaylists((prev) => [{ ...created, songCount: 1 }, ...prev]);
      setMemberIds((prev) => new Set(prev).add(created.id));
      setNewPlaylistName("");
      setIsCreating(false);
      onPlaylistsChanged?.();
      window.dispatchEvent(
        new CustomEvent("tay-playlist-changed", { detail: { playlistId: created.id } })
      );
      showToast(`Đã tạo và thêm vào playlist '${created.name}'`);
    } catch (err) {
      console.error("[PlaylistPickerPopover] Failed to create playlist:", err);
      showToast("Không thể tạo playlist mới");
    } finally {
      setCreatingLoading(false);
    }
  };

  return (
    <PlaylistPickerContext.Provider
      value={{ openPlaylistPicker, closePlaylistPicker, showToast }}
    >
      {children}

      {pickerState &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Thêm vào playlist"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: pickerState.left,
              top: pickerState.top,
              bottom: pickerState.bottom,
              width: POPOVER_WIDTH,
              maxHeight: POPOVER_MAX_HEIGHT,
            }}
            className="fixed z-[80] rounded-2xl bg-[#18181e]/94 backdrop-blur-2xl border border-white/[0.14] shadow-[0_20px_55px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-[#f5f5f7] font-sans animate-fadeIn select-none"
          >
            {/* Header */}
            <div className="px-3.5 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-white/[0.02]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Thêm vào playlist
                </p>
                <p className="text-xs font-medium text-white truncate mt-0.5">
                  {pickerState.song.title}
                </p>
              </div>
              <button
                type="button"
                onClick={closePlaylistPicker}
                aria-label="Đóng"
                className="w-7 h-7 rounded-full text-white/55 hover:text-white hover:bg-white/[0.1] flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Playlist list */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 max-h-[220px]">
              {loading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-white/55">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tải playlist...</span>
                </div>
              ) : playlists.length === 0 ? (
                <p className="py-6 px-3 text-center text-xs text-white/45">
                  Chưa có playlist nào. Hãy tạo playlist mới ở bên dưới.
                </p>
              ) : (
                playlists.map((pl) => {
                  const isIn = memberIds.has(pl.id);
                  const isBusy = busyPlaylistId === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      disabled={Boolean(busyPlaylistId)}
                      onClick={() => handleTogglePlaylist(pl)}
                      className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${
                        isIn
                          ? "bg-white/[0.09] text-white"
                          : "text-white/80 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <TrackThumbnail
                          src={pl.thumbnailUrl}
                          alt={pl.name}
                          iconSize="xs"
                          className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate">{pl.name}</p>
                          <p className="text-[11px] text-white/45">{pl.songCount || 0} bài hát</p>
                        </div>
                      </div>

                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white/70" />
                        ) : isIn ? (
                          <span className="w-5 h-5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 flex items-center justify-center">
                            <Check className="w-3 h-3 text-[#4ade80]" />
                          </span>
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-white/40" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer: Quick Create Playlist */}
            <div className="border-t border-white/[0.08] p-2 bg-white/[0.02]">
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[12.5px] font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo playlist mới</span>
                </button>
              ) : (
                <form onSubmit={handleCreateAndAdd} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Tên playlist mới..."
                    autoFocus
                    className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-white/[0.08] border border-white/[0.15] focus:border-white/[0.35] text-xs text-white placeholder-white/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistName.trim() || creatingLoading}
                    className="h-9 px-3 rounded-xl bg-[#fa243c] hover:bg-[#e61e34] text-white text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer flex-shrink-0"
                  >
                    {creatingLoading ? "..." : "Tạo & Thêm"}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Global Confirmation Toast */}
      {toast &&
        createPortal(
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full bg-[#18181e]/94 backdrop-blur-2xl border border-white/[0.14] shadow-[0_14px_40px_rgba(0,0,0,0.8)] flex items-center gap-2 text-[13px] font-medium text-white animate-fadeIn pointer-events-none"
          >
            <span className="w-5 h-5 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/35 flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-[#4ade80]" />
            </span>
            <span>{toast.message}</span>
          </div>,
          document.body
        )}
    </PlaylistPickerContext.Provider>
  );
};
