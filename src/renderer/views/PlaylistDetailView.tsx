// src/renderer/views/PlaylistDetailView.tsx

import React, { useEffect, useState } from "react";
import { ArrowLeft, Play, Trash2, ListMusic } from "lucide-react";
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
      <div className="flex-1 p-6 select-none font-mono text-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#8492a6] hover:text-[#00f0ff] mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> [ &lt; QUAY LẠI ]
        </button>
        <div className="py-20 text-center text-[#444c5c]">
          <p>// ERROR: 404_PLAYLIST_NOT_FOUND</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[10px] font-mono text-[#8492a6] hover:text-[#00f0ff] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>[ &lt; RETURN_TO_COLLECTION ]</span>
      </button>

      {/* Playlist Header Banner - Cyber RPG Style */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-end gap-5 bg-[#13161c] border border-[#242a35] p-5 rounded-xs shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        {/* Subtle corner notches */}
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[#00f0ff]" />

        <div className="w-32 h-32 rounded-xs bg-[#0d0f12] border border-[#242a35] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md">
          {playlist?.thumbnailUrl ? (
            <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <ListMusic className="w-12 h-12 text-[#00f0ff]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#00ff9d] uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff9d] animate-pulse" />
            <span>// PLAYLIST_DATA // SQLITE_LOCAL</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight truncate font-sans">
            {playlist?.name}
          </h2>

          {playlist?.description && (
            <p className="text-xs text-[#8492a6] mt-1 line-clamp-2 font-mono">
              {playlist.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-[11px] font-mono text-[#444c5c] mt-3">
            <span className="text-[#00f0ff] font-bold">[{songs.length} TRACKS]</span>
            <span>•</span>
            <span>ID: {playlistId.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between border-b border-[#242a35] pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayAll}
            disabled={songs.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xs bg-[#00f0ff] hover:bg-[#33f3ff] text-black font-mono font-bold text-xs shadow-[0_0_12px_rgba(0,240,255,0.35)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>[ PHÁT TẤT CẢ ]</span>
          </button>
        </div>

        <button
          onClick={handleDeletePlaylist}
          title="Xóa danh sách phát"
          className="p-1.5 rounded-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Song List */}
      <div className="space-y-1">
        <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider border-b border-[#242a35]/60">
          <span className="w-7 text-center">#</span>
          <span className="w-9" />
          <span className="flex-1">Track / Artist</span>
          <span className="w-12 text-right">Length</span>
          <span className="w-20 text-right">Action</span>
        </div>

        {songs.length === 0 ? (
          <div className="text-center py-16 text-[#444c5c] font-mono text-xs">
            <p>// EMPTY_PLAYLIST: Chưa có bài hát nào trong danh sách</p>
          </div>
        ) : (
          songs.map((song, idx) => (
            <SongRow
              key={`${song.id}-${idx}`}
              song={song}
              index={idx}
              playlistContext={songs}
              onAddToPlaylist={onAddToPlaylist}
              onRemoveFromPlaylist={handleRemoveSong}
              onFixMatch={(s) => setFixMatchSong(s)}
              showRemoveOption={true}
            />
          ))
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
