// electron/preload.ts

import { contextBridge, ipcRenderer } from "electron";

export const mochyApi = {
  // YouTube API
  search: (query: string) => ipcRenderer.invoke("youtube:search", query),
  searchSongs: (query: string) => ipcRenderer.invoke("youtube:searchSongs", query),
  getStream: (rawVideoId: any, quality?: string) => {
    let videoId = "";
    if (typeof rawVideoId === "string") {
      videoId = rawVideoId.trim();
    } else if (rawVideoId && typeof rawVideoId === "object") {
      videoId = (rawVideoId.videoId || rawVideoId.id || "").trim();
    }
    if (!videoId || videoId === "undefined" || videoId.length !== 11) {
      console.warn("[Preload] Blocked getStream with invalid 11-char videoId:", rawVideoId);
      return Promise.reject(new Error(`Invalid 11-character videoId: "${rawVideoId}"`));
    }
    return ipcRenderer.invoke("youtube:getStream", videoId, quality);
  },
  getLyrics: (title: string, artist?: string, duration?: number, videoId?: string) =>
    ipcRenderer.invoke("youtube:getLyrics", title, artist, duration, videoId),
  getPlaylist: (playlistId: string) => ipcRenderer.invoke("youtube:getPlaylist", playlistId),

  // Database API - Song & Liked
  upsertSong: (song: any) => ipcRenderer.invoke("db:upsertSong", song),
  getSong: (id: string) => ipcRenderer.invoke("db:getSong", id),
  setLiked: (songId: string, liked: boolean, metadata?: any) =>
    ipcRenderer.invoke("db:setLiked", songId, liked, metadata),
  toggleLike: (songId: string, metadata?: any) =>
    ipcRenderer.invoke("db:toggleLike", songId, metadata),
  isLiked: (songId: string) => ipcRenderer.invoke("db:isLiked", songId),
  getLikedSongs: () => ipcRenderer.invoke("db:getLikedSongs"),

  // Database API - History
  addHistory: (songId: string, playTimeSec?: number, metadata?: any) =>
    ipcRenderer.invoke("db:addHistory", songId, playTimeSec, metadata),
  getHistory: (limit?: number, offset?: number) =>
    ipcRenderer.invoke("db:getHistory", limit, offset),
  clearHistory: () => ipcRenderer.invoke("db:clearHistory"),

  // Database API - Playlists
  createPlaylist: (name: string, description?: string, thumbnailUrl?: string) =>
    ipcRenderer.invoke("db:createPlaylist", name, description, thumbnailUrl),
  getPlaylists: () => ipcRenderer.invoke("db:getPlaylists"),
  getPlaylist: (id: string) => ipcRenderer.invoke("db:getPlaylist", id),
  deletePlaylist: (id: string) => ipcRenderer.invoke("db:deletePlaylist", id),
  addSongToPlaylist: (playlistId: string, songId: string, metadata?: any) =>
    ipcRenderer.invoke("db:addSongToPlaylist", playlistId, songId, metadata),
  removeSongFromPlaylist: (playlistId: string, songId: string) =>
    ipcRenderer.invoke("db:removeSongFromPlaylist", playlistId, songId),
  getPlaylistSongs: (playlistId: string) =>
    ipcRenderer.invoke("db:getPlaylistSongs", playlistId),
  replacePlaylistSong: (playlistId: string, oldSongId: string, newSong: any) =>
    ipcRenderer.invoke("db:replacePlaylistSong", playlistId, oldSongId, newSong),

  // Fix Match / Track Candidates
  getTrackCandidates: (query: { title: string; artist: string; duration?: number }) =>
    ipcRenderer.invoke("youtube:getTrackCandidates", query),

  // Database API - Lyrics Cache
  getCachedLyrics: (songId: string) => ipcRenderer.invoke("db:getCachedLyrics", songId),
  cacheLyrics: (songId: string, lyrics: string, provider: string) =>
    ipcRenderer.invoke("db:cacheLyrics", songId, lyrics, provider),
};

contextBridge.exposeInMainWorld("mochyApi", mochyApi);
