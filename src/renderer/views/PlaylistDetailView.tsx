// src/renderer/views/PlaylistDetailView.tsx

import React, { useEffect, useState } from "react";
import { ArrowLeft, Play, Trash2, ListMusic, Music } from "lucide-react";
import type { Playlist, Song } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";
import { FixMatchModal } from "../components/FixMatchModal.tsx";
import { usePlayer } from "../context/PlayerContext.tsx";

interface PlaylistDetailViewProps {
  playlistId: string;
  onBack: () => void;
  onAddToPlaylist: (song: Song) => void;
  onPlaylistDeleted: () => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({
  playlistId,
  onBack,
  onAddToPlaylist,
  onPlaylistDeleted,
}) => {
  const { playSong } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixMatchSong, setFixMatchSong] = useState<Song | null>(null);

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
    setSongs((prev) =>
      prev.map((s) => (s.id === fixMatchSong.id ? newSong : s))
    );
  };

  useEffect(() => {
    loadPlaylistData();
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
      playSong(songs[0], songs);
    }
  };

  if (!playlist && !loading) {
    return (
      <div className="flex-1 p-8 select-none">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-mochy-muted hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </button>
        <div className="py-20 text-center text-mochy-subtext">
          <p>Không tìm thấy danh sách phát này.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 select-none">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-mochy-muted hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại
      </button>

      {/* Playlist Header Banner */}
      <div className="flex items-end gap-6 bg-mochy-card border border-mochy-border/60 rounded-2xl p-6">
        <div className="w-40 h-40 rounded-xl bg-gradient-to-br from-neutral-800 to-mochy-bg border border-mochy-border flex items-center justify-center flex-shrink-0 shadow-lg">
          <ListMusic className="w-16 h-16 text-mochy-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-mochy-accent uppercase tracking-wider">
            Danh sách phát cá nhân
          </span>
          <h2 className="text-3xl font-extrabold text-white tracking-tight mt-1 truncate">
            {playlist?.name}
          </h2>
          {playlist?.description && (
            <p className="text-sm text-mochy-muted mt-2 line-clamp-2">
              {playlist.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs font-mono text-mochy-subtext mt-4">
            <span>{songs.length} bài hát</span>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayAll}
            disabled={songs.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-mochy-accent hover:bg-mochy-accentHover text-white font-semibold text-sm shadow-md transition-all active:scale-95 disabled:opacity-40"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Phát tất cả</span>
          </button>
        </div>

        <button
          onClick={handleDeletePlaylist}
          title="Xóa danh sách phát"
          className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Songs Table */}
      <div className="space-y-2">
        {songs.length > 0 ? (
          <div className="divide-y divide-mochy-border/30">
            {songs.map((song, idx) => (
              <SongRow
                key={`${song.id}-${idx}`}
                song={song}
                index={idx}
                playlistContext={songs}
                onAddToPlaylist={onAddToPlaylist}
                onRemoveFromPlaylist={handleRemoveSong}
                onFixMatch={(targetSong) => setFixMatchSong(targetSong)}
                showRemoveOption={true}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-mochy-subtext">
            <Music className="w-10 h-10 mb-2 mx-auto opacity-30" />
            <p className="text-sm font-medium text-mochy-muted">Chưa có bài hát nào trong playlist này</p>
            <p className="text-xs text-mochy-subtext mt-1">
              Tìm kiếm các bài hát yêu thích và nhấn dấu "+" để thêm vào danh sách này.
            </p>
          </div>
        )}
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
