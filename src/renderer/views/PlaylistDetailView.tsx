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
      <div className="flex-1 p-6 select-none font-mono text-xs bg-[#090d14]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#8492a6] hover:text-[#2589f5] mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> [ &lt; QUAY LẠI ]
        </button>
        <div className="py-20 text-center text-[#475569]">
          <p>// 404_PLAYLIST_NOT_FOUND</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans bg-[#090d14]">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[10px] font-mono text-[#8492a6] hover:text-[#2589f5] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>[ &lt; QUAY LẠI THƯ VIỆN ]</span>
      </button>

      {/* Playlist Header Card */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-end gap-5 bg-[#0f151f] border border-[#1e293b] p-5 rounded-md shadow-sm">
        <div className="w-32 h-32 rounded-md bg-[#090d14] border border-[#1e293b] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
          {playlist?.thumbnailUrl ? (
            <img src={playlist.thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <ListMusic className="w-12 h-12 text-[#2589f5]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#2ecc71] uppercase tracking-wider mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2ecc71] animate-pulse" />
            <span>// DANH SÁCH PHÁT CỤC BỘ // SQLITE</span>
          </div>

          <h2 className="text-2xl font-bold text-white tracking-tight truncate font-sans">
            {playlist?.name}
          </h2>

          <p className="text-xs text-[#38bdf8] mt-1 line-clamp-2 font-mono">
            // {playlist?.description || "Danh sách phát cá nhân lưu trữ trên máy tính"}
          </p>

          <div className="flex items-center gap-3 text-[11px] font-mono text-[#475569] mt-3">
            <span className="text-[#2589f5] font-bold">[{songs.length} BÀI HÁT]</span>
            <span>•</span>
            <span>MÃ: {playlistId.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex items-center justify-between border-b border-[#1e293b] pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayAll}
            disabled={songs.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xs bg-[#2ecc71] hover:bg-[#27ae60] text-black font-mono font-bold text-xs shadow-[0_0_10px_rgba(46,204,113,0.3)] transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>PHÁT TẤT CẢ</span>
          </button>
        </div>

        <button
          onClick={handleDeletePlaylist}
          title="Xóa danh sách phát này"
          className="p-1.5 rounded-xs text-[#e74c3c] hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Song List */}
      <div className="space-y-1">
        <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#475569] uppercase tracking-wider border-b border-[#1e293b]/60">
          <span className="w-7 text-center">#</span>
          <span className="w-9" />
          <span className="flex-1">Tên bài hát / Ca sĩ</span>
          <span className="w-12 text-right">Thời lượng</span>
          <span className="w-20 text-right">Thao tác</span>
        </div>

        {songs.length === 0 ? (
          <div className="text-center py-16 text-[#475569] font-mono text-xs">
            <p>// DANH SÁCH ĐANG TRỐNG: Hãy thêm bài hát vào playlist này</p>
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
