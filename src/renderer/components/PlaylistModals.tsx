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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fadeIn">
      <div className="w-full max-w-md bg-mochy-sidebar border border-mochy-border rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-mochy-accent" />
            <h3 className="text-base font-bold text-white">Tạo danh sách phát mới</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-mochy-muted hover:text-white hover:bg-mochy-cardHover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-mochy-subtext uppercase tracking-wider mb-1.5">
              Tên danh sách phát *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Nhạc học tập, Chill cuối tuần..."
              className="w-full bg-mochy-card border border-mochy-border rounded-lg px-3 py-2 text-sm text-white placeholder-mochy-subtext focus:outline-none focus:border-mochy-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-mochy-subtext uppercase tracking-wider mb-1.5">
              Mô tả (tùy chọn)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Thêm mô tả về playlist này..."
              className="w-full bg-mochy-card border border-mochy-border rounded-lg px-3 py-2 text-sm text-white placeholder-mochy-subtext focus:outline-none focus:border-mochy-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-mochy-muted hover:text-white rounded-lg hover:bg-mochy-card transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2 text-sm font-semibold bg-mochy-accent hover:bg-mochy-accentHover text-white rounded-lg transition-colors disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fadeIn">
      <div className="w-full max-w-sm bg-mochy-sidebar border border-mochy-border rounded-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-mochy-accent" />
            <h3 className="text-sm font-bold text-white">Thêm vào Playlist</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-mochy-muted hover:text-white hover:bg-mochy-cardHover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-mochy-muted truncate mb-3">
          Chọn playlist để thêm bài <strong className="text-white">"{song.title}"</strong>:
        </p>

        <div className="max-h-60 overflow-y-auto space-y-1 my-2">
          {playlists.length === 0 ? (
            <p className="text-xs text-mochy-subtext italic py-4 text-center">
              Chưa có playlist nào. Hãy tạo playlist mới trước!
            </p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleSelectPlaylist(pl.id)}
                disabled={loading}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-mochy-card text-mochy-muted hover:text-white transition-colors"
              >
                <span className="truncate font-medium">{pl.name}</span>
                <span className="text-[11px] text-mochy-subtext font-mono">
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
