// src/renderer/views/PlaylistDetailView.tsx

import React, { useEffect, useState } from "react";
import { ArrowLeft, Play, Trash2, ListMusic, Shuffle } from "lucide-react";
import type { Playlist, Song } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";
import { FixMatchModal } from "../components/FixMatchModal.tsx";
import { TrackThumbnail } from "../components/TrackThumbnail.tsx";
import { usePlayer } from "../context/PlayerContext.tsx";

interface PlaylistDetailViewProps {
  playlistId: string;
  onBack: () => void;
  onAddToPlaylist: (song: Song) => void;
  onPlaylistDeleted: () => void;
  sidebarExpanded?: boolean;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlistId,
  onBack,
  onAddToPlaylist,
  onPlaylistDeleted,
  sidebarExpanded = false,
}) => {
  const { playSong, lastSwitchedVersion, toggleShuffle, isShuffle } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixMatchSong, setFixMatchSong] = useState<Song | null>(null);

  useEffect(() => {
    if (!lastSwitchedVersion) return;
    setSongs((prev) =>
      prev.map((s) =>
        s.id === lastSwitchedVersion.oldId ? lastSwitchedVersion.newSong : s
      )
    );
  }, [lastSwitchedVersion]);

  const loadPlaylistData = async () => {
    if (!window.mochyApi) return;
    setLoading(true);
    try {
      const pl = await window.mochyApi.getPlaylist(playlistId);
      const songList = await window.mochyApi.getPlaylistSongs(playlistId);
      setPlaylist(pl);
      setSongs(songList || []);
    } catch (err) {
      console.error("Failed to load playlist:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSongReplaced = (newSong: Song) => {
    if (!fixMatchSong) return;
    setSongs((prev) => prev.map((s) => (s.id === fixMatchSong.id ? newSong : s)));
  };

  useEffect(() => {
    loadPlaylistData();
  }, [playlistId]);

  useEffect(() => {
    const onPlaylistChanged = async (e: Event) => {
      const detail = (e as CustomEvent<{ playlistId?: string }>).detail;
      if (detail?.playlistId && detail.playlistId !== playlistId) return;
      if (!window.mochyApi) return;
      try {
        const [pl, songList] = await Promise.all([
          window.mochyApi.getPlaylist(playlistId),
          window.mochyApi.getPlaylistSongs(playlistId),
        ]);
        if (pl) setPlaylist(pl);
        setSongs(songList || []);
      } catch (err) {
        console.error("Failed to refresh playlist:", err);
      }
    };
    window.addEventListener("tay-playlist-changed", onPlaylistChanged);
    return () => window.removeEventListener("tay-playlist-changed", onPlaylistChanged);
  }, [playlistId]);

  const handleDeletePlaylist = async () => {
    if (!playlist) return;
    if (window.confirm(`Bạn có chắc chắn muốn xóa playlist "${playlist.name}"?`)) {
      if (window.mochyApi) {
        await window.mochyApi.deletePlaylist(playlistId);
        onPlaylistDeleted();
        onBack();
      }
    }
  };

  const handleRemoveSong = async (songId: string) => {
    if (window.mochyApi) {
      await window.mochyApi.removeSongFromPlaylist(playlistId, songId);
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    }
  };

  const handlePlayAll = () => {
    if (songs.length > 0) {
      playSong(songs[0], songs, playlistId);
    }
  };

  const handleShufflePlay = () => {
    if (songs.length > 0) {
      if (!isShuffle) toggleShuffle();
      const randomIdx = Math.floor(Math.random() * songs.length);
      playSong(songs[randomIdx], songs, playlistId);
    }
  };

  const padClass = sidebarExpanded ? "pl-[288px] pr-8" : "pl-[96px] pr-8";

  if (!playlist && !loading) {
    return (
      <div
        className={`flex-1 pt-20 pb-10 select-none font-sans bg-[#0a0a0c] text-[#f5f5f7] ${padClass}`}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại"
          className="w-9 h-9 rounded-full bg-white/[0.10] hover:bg-white/[0.18] flex items-center justify-center text-white mb-6 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="py-20 text-center text-white/45 text-sm">
          Không tìm thấy danh sách phát này.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0c] text-[#f5f5f7] select-none font-sans relative pb-12">
      {/* Subtle Ambient Backdrop behind Playlist Header */}
      {playlist?.thumbnailUrl && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-80 overflow-hidden pointer-events-none">
          <TrackThumbnail
            src={playlist.thumbnailUrl}
            isAmbient
            imgClassName="w-full h-full object-cover blur-3xl opacity-20 scale-125"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-[#0a0a0c]/75 to-[#0a0a0c]" />
        </div>
      )}

      <div className={`relative z-10 pt-20 space-y-6 transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${padClass}`}>
        {/* Circular Back Button */}
        <div>
          <button
            type="button"
            onClick={onBack}
            title="Quay lại thư viện"
            aria-label="Quay lại thư viện"
            className="w-9 h-9 rounded-full bg-white/[0.10] hover:bg-white/[0.18] border border-white/[0.10] text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Playlist Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
          <TrackThumbnail
            src={playlist?.thumbnailUrl}
            alt={playlist?.name || "Playlist"}
            iconSize="xl"
            className="w-44 h-44 sm:w-52 sm:h-52 rounded-[22px] bg-[#18181d] border border-white/[0.10] flex-shrink-0 shadow-[0_20px_50px_rgba(0,0,0,0.6)] relative group"
          />

          <div className="flex-1 min-w-0 space-y-2 pb-1">
            <span className="text-[11px] font-semibold tracking-widest uppercase text-white/55">
              Playlist
            </span>

            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight truncate">
              {playlist?.name || "Đang tải..."}
            </h1>

            {playlist?.description && (
              <p className="text-xs sm:text-sm text-white/60 line-clamp-2 max-w-2xl">
                {playlist.description}
              </p>
            )}

            <p className="text-xs text-white/50 pt-0.5">{songs.length} bài hát</p>

            {/* Primary Action Pills */}
            <div className="pt-3 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={songs.length === 0}
                className="px-6 py-2 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-35 cursor-pointer shadow-lg"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Phát tất cả</span>
              </button>

              <button
                type="button"
                onClick={handleShufflePlay}
                disabled={songs.length === 0}
                className="px-5 py-2 rounded-full bg-white/[0.10] hover:bg-white/[0.18] border border-white/[0.10] text-white text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-35 cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Trộn bài</span>
              </button>

              <button
                type="button"
                onClick={handleDeletePlaylist}
                title="Xóa danh sách phát này"
                aria-label="Xóa danh sách phát"
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-rose-500/20 border border-white/[0.08] hover:border-rose-500/40 text-white/65 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Song List */}
        <div className="space-y-1 pt-2">
          <div className="flex items-center gap-3 px-3 py-2 text-[11px] font-medium text-white/40 uppercase tracking-wider border-b border-white/[0.07]">
            <span className="w-7 text-center">#</span>
            <span className="w-10" />
            <span className="flex-1">Bài hát</span>
            <span className="w-11 text-right">Thời lượng</span>
          </div>

          {loading ? (
            <div className="space-y-2 pt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-16 text-white/45 text-sm">
              Danh sách đang trống. Hãy tìm kiếm hoặc nhập nhạc từ Spotify.
            </div>
          ) : (
            <div className="space-y-0.5 pt-1">
              {songs.map((song, idx) => (
                <SongRow
                  key={`${song.id}-${idx}`}
                  song={song}
                  index={idx}
                  playlistId={playlistId}
                  playlistContext={songs}
                  onAddToPlaylist={onAddToPlaylist}
                  onRemoveFromPlaylist={handleRemoveSong}
                  onFixMatch={(s) => setFixMatchSong(s)}
                  showRemoveOption={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fix Match Modal */}
      {fixMatchSong && (
        <FixMatchModal
          song={fixMatchSong}
          playlistId={playlistId}
          onClose={() => setFixMatchSong(null)}
          onReplaced={handleSongReplaced}
        />
      )}
    </div>
  );
};
