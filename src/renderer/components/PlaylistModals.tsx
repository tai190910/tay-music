// src/renderer/components/PlaylistModals.tsx

import React, { useState, useEffect } from "react";
import { X, Plus, FolderPlus, ListPlus } from "lucide-react";
import type { Song, Playlist } from "../types.ts";

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (playlist: Playlist) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !window.mochyApi) return;
    setLoading(true);
    try {
      const playlist = await window.mochyApi.createPlaylist(name.trim(), description.trim());
      setName("");
      setDescription("");
      onCreated(playlist);
      onClose();
    } catch (err) {
      console.error("Failed to create playlist:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/80 animate-fadeIn font-sans p-4">
      <div className="relative w-full max-w-md bg-[#13161c] border border-[#242a35] rounded-xs p-5 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
        {/* Subtle corner notches */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00f0ff]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00f0ff]" />

        <div className="flex items-center justify-between pb-3 border-b border-[#242a35] mb-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-[#00f0ff]" />
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              // CREATE_NEW_PLAYLIST
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono font-semibold text-[#8492a6] uppercase tracking-wider mb-1.5">
              &gt; TÊN PLAYLIST *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên danh sách phát..."
              className="w-full bg-[#181c24] border border-[#242a35] focus:border-[#00f0ff]/60 rounded-xs px-3 py-2 text-xs text-white placeholder-[#444c5c] font-mono focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-semibold text-[#8492a6] uppercase tracking-wider mb-1.5">
              &gt; MÔ TẢ (TÙY CHỌN)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Thêm ghi chú mô tả..."
              className="w-full bg-[#181c24] border border-[#242a35] focus:border-[#00f0ff]/60 rounded-xs px-3 py-2 text-xs text-white placeholder-[#444c5c] font-mono focus:outline-none resize-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-mono text-[#8492a6] hover:text-white rounded-xs hover:bg-[#181c24] transition-colors"
            >
              [ HỦY ]
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-1.5 text-xs font-mono font-bold bg-[#00f0ff] hover:bg-[#33f3ff] text-black rounded-xs transition-all shadow-[0_0_10px_rgba(0,240,255,0.3)] disabled:opacity-40 cursor-pointer active:scale-95"
            >
              {loading ? "[ ĐANG TẠO... ]" : "[ TẠO PLAYLIST ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddToPlaylistModalProps {
  song: Song | null;
  onClose: () => void;
  onAdded?: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  song,
  onClose,
  onAdded,
}) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (song && window.mochyApi) {
      window.mochyApi.getPlaylists().then(setPlaylists).catch(console.error);
    }
  }, [song]);

  if (!song) return null;

  const handleSelectPlaylist = async (playlistId: string) => {
    if (!window.mochyApi) return;
    setLoading(true);
    try {
      await window.mochyApi.addSongToPlaylist(playlistId, song.id, song);
      if (onAdded) onAdded();
      onClose();
    } catch (err) {
      console.error("Failed to add song to playlist:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/80 animate-fadeIn font-sans p-4">
      <div className="relative w-full max-w-sm bg-[#13161c] border border-[#242a35] rounded-xs p-5 shadow-[0_0_30px_rgba(0,0,0,0.7)]">
        {/* Subtle corner notches */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00f0ff]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00f0ff]" />

        <div className="flex items-center justify-between pb-3 border-b border-[#242a35] mb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-[#00f0ff]" />
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              // TARGET_PLAYLIST
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#181c24] border border-transparent hover:border-[#242a35] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-[#8492a6] font-mono truncate mb-3">
          &gt; BÀI HÁT: <strong className="text-white font-sans">"{song.title}"</strong>
        </p>

        <div className="max-h-60 overflow-y-auto space-y-1 my-2">
          {playlists.length === 0 ? (
            <p className="text-xs text-[#444c5c] font-mono italic py-4 text-center">
              // ZERO_PLAYLISTS: Hãy tạo playlist mới trước
            </p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleSelectPlaylist(pl.id)}
                disabled={loading}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xs text-xs text-left hover:bg-[#181c24] text-[#8492a6] hover:text-white border border-transparent hover:border-[#242a35] transition-all"
              >
                <span className="truncate font-medium">{pl.name}</span>
                <span className="text-[10px] text-[#444c5c] font-mono">
                  {pl.songCount || 0} TRK
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
