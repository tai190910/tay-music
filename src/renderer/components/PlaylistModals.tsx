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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/65 animate-fadeIn font-sans p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tạo playlist mới"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#16161a]/95 backdrop-blur-2xl border border-white/[0.12] rounded-[24px] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
              <FolderPlus className="w-4 h-4 text-[#f5f5f7]" />
            </div>
            <h3 className="text-[16px] font-bold text-[#f5f5f7] tracking-tight">
              Tạo playlist mới
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full text-[#8e8e93] hover:text-white bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#9a9aa0] mb-1.5">
              Tên playlist <span className="text-[#fa243c]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên danh sách phát..."
              className="w-full h-10 bg-white/[0.06] border border-white/[0.1] focus:border-white/[0.3] focus:bg-white/[0.09] rounded-xl px-3.5 text-[13.5px] text-[#f5f5f7] placeholder-[#6e6e73] focus:outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#9a9aa0] mb-1.5">
              Mô tả (tùy chọn)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Thêm mô tả về playlist..."
              className="w-full bg-white/[0.06] border border-white/[0.1] focus:border-white/[0.3] focus:bg-white/[0.09] rounded-xl px-3.5 py-2.5 text-[13.5px] text-[#f5f5f7] placeholder-[#6e6e73] focus:outline-none resize-none transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 text-[13px] font-medium text-[#9a9aa0] hover:text-white rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="min-h-[40px] px-5 text-[13px] font-semibold bg-[#fa243c] hover:bg-[#e61e34] text-white rounded-full transition-all shadow-sm disabled:opacity-40 cursor-pointer active:scale-95"
            >
              {loading ? "Đang tạo..." : "Tạo playlist"}
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/65 animate-fadeIn font-sans p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chọn playlist lưu bài hát"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-[#16161a]/95 backdrop-blur-2xl border border-white/[0.12] rounded-[24px] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08] mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center">
              <ListPlus className="w-4 h-4 text-[#f5f5f7]" />
            </div>
            <h3 className="text-[15.5px] font-bold text-[#f5f5f7] tracking-tight">
              Thêm vào playlist
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="w-8 h-8 rounded-full text-[#8e8e93] hover:text-white bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[12.5px] text-[#8e8e93] truncate mb-3.5">
          Bài hát: <strong className="text-[#f5f5f7] font-medium">&ldquo;{song.title}&rdquo;</strong>
        </p>

        <div className="max-h-64 overflow-y-auto space-y-1.5 my-1">
          {playlists.length === 0 ? (
            <p className="text-[13px] text-[#8e8e93] py-6 text-center">
              Chưa có playlist nào. Hãy tạo playlist mới trước.
            </p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => handleSelectPlaylist(pl.id)}
                disabled={loading}
                className="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2 rounded-xl text-[13px] text-left bg-white/[0.03] hover:bg-white/[0.09] text-[#f5f5f7] border border-white/[0.05] hover:border-white/[0.12] transition-all cursor-pointer"
              >
                <span className="truncate font-medium">{pl.name}</span>
                <span className="text-[11.5px] text-[#8e8e93] shrink-0 ml-2">
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
