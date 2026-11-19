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
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-[#090d14]/80 animate-fadeIn font-sans p-4">
      <div className="relative w-full max-w-md bg-[#0f151f] border border-[#1e293b] rounded-md p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-[#2589f5]" />
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              // TẠO PLAYLIST MỚI
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all cursor-pointer"
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
              className="w-full bg-[#090d14] border border-[#1e293b] focus:border-[#2589f5] rounded-xs px-3 py-2 text-xs text-white placeholder-[#475569] font-mono focus:outline-none transition-colors"
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
              placeholder="Thêm mô tả về playlist..."
              className="w-full bg-[#090d14] border border-[#1e293b] focus:border-[#2589f5] rounded-xs px-3 py-2 text-xs text-white placeholder-[#475569] font-mono focus:outline-none resize-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-mono text-[#8492a6] hover:text-white rounded-xs hover:bg-[#16202e] transition-colors cursor-pointer"
            >
              [ HỦY ]
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-1.5 text-xs font-mono font-bold bg-[#2ecc71] hover:bg-[#27ae60] text-black rounded-xs transition-all shadow-[0_0_10px_rgba(46,204,113,0.3)] disabled:opacity-40 cursor-pointer active:scale-95"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-[#090d14]/80 animate-fadeIn font-sans p-4">
      <div className="relative w-full max-w-sm bg-[#0f151f] border border-[#1e293b] rounded-md p-5 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-[#2589f5]" />
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              // CHỌN PLAYLIST LƯU BÀI
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xs text-[#8492a6] hover:text-white hover:bg-[#16202e] border border-transparent hover:border-[#1e293b] transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-[#8492a6] font-mono truncate mb-3">
          &gt; BÀI HÁT: <strong className="text-white font-sans">"{song.title}"</strong>
        </p>

        <div className="max-h-60 overflow-y-auto space-y-1 my-2">
          {playlists.length === 0 ? (
            <p className="text-xs text-[#475569] font-mono italic py-4 text-center">
              // CHƯA CÓ PLAYLIST: Hãy tạo playlist mới trước
            </p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleSelectPlaylist(pl.id)}
                disabled={loading}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xs text-xs text-left hover:bg-[#16202e] text-[#8492a6] hover:text-white border border-transparent hover:border-[#1e293b] transition-all cursor-pointer"
              >
                <span className="truncate font-medium">{pl.name}</span>
                <span className="text-[10px] text-[#38bdf8] font-mono">
                  {pl.songCount || 0} bài
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
