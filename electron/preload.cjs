// electron/preload.cjs

const { contextBridge, ipcRenderer } = require("electron");

const mochyApi = {
  // YouTube API
  search: (query) => ipcRenderer.invoke("youtube:search", query),
  searchSongs: (query) => ipcRenderer.invoke("youtube:searchSongs", query),
  getStream: (rawVideoId, quality) => {
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
  getLyrics: (title, artist, duration, videoId) =>
    ipcRenderer.invoke("youtube:getLyrics", title, artist, duration, videoId),
  getPlaylist: (playlistId) => ipcRenderer.invoke("youtube:getPlaylist", playlistId),

  // Database API - Song & Liked
  upsertSong: (song) => ipcRenderer.invoke("db:upsertSong", song),
  getSong: (id) => ipcRenderer.invoke("db:getSong", id),
  setLiked: (songId, liked, metadata) =>
    ipcRenderer.invoke("db:setLiked", songId, liked, metadata),
  toggleLike: (songId, metadata) =>
    ipcRenderer.invoke("db:toggleLike", songId, metadata),
  isLiked: (songId) => ipcRenderer.invoke("db:isLiked", songId),
  getLikedSongs: () => ipcRenderer.invoke("db:getLikedSongs"),

  // Database API - History
  addHistory: (songId, playTimeSec, metadata) =>
    ipcRenderer.invoke("db:addHistory", songId, playTimeSec, metadata),
  getHistory: (limit, offset) =>
    ipcRenderer.invoke("db:getHistory", limit, offset),
  clearHistory: () => ipcRenderer.invoke("db:clearHistory"),

  // Database API - Playlists
  createPlaylist: (name, description, thumbnailUrl) =>
    ipcRenderer.invoke("db:createPlaylist", name, description, thumbnailUrl),
  getPlaylists: () => ipcRenderer.invoke("db:getPlaylists"),
  getPlaylist: (id) => ipcRenderer.invoke("db:getPlaylist", id),
  deletePlaylist: (id) => ipcRenderer.invoke("db:deletePlaylist", id),
  addSongToPlaylist: (playlistId, songId, metadata) =>
    ipcRenderer.invoke("db:addSongToPlaylist", playlistId, songId, metadata),
  removeSongFromPlaylist: (playlistId, songId) =>
    ipcRenderer.invoke("db:removeSongFromPlaylist", playlistId, songId),
  getPlaylistSongs: (playlistId) =>
    ipcRenderer.invoke("db:getPlaylistSongs", playlistId),
  replacePlaylistSong: (playlistId, oldSongId, newSong) =>
    ipcRenderer.invoke("db:replacePlaylistSong", playlistId, oldSongId, newSong),

  // Fix Match / Track Candidates
  getTrackCandidates: (query) => ipcRenderer.invoke("youtube:getTrackCandidates", query),

  // Database API - Lyrics Cache
  getCachedLyrics: (songId) => ipcRenderer.invoke("db:getCachedLyrics", songId),
  cacheLyrics: (songId, lyrics, provider) =>
    ipcRenderer.invoke("db:cacheLyrics", songId, lyrics, provider),

  // Spotify Importer & Auto-Sync
  spotifyOpenLogin: () => ipcRenderer.invoke("spotify:openLogin"),
  spotifyGetAccount: () => ipcRenderer.invoke("spotify:getAccount"),
  spotifyLogout: () => ipcRenderer.invoke("spotify:logout"),
  spotifyParseLink: (url) => ipcRenderer.invoke("spotify:parseLink", url),
  spotifyGetUserPlaylists: () => ipcRenderer.invoke("spotify:getUserPlaylists"),
  spotifyImportParsed: (parsed) => ipcRenderer.invoke("spotify:importParsed", parsed),
  spotifyImportRemote: (remote) => ipcRenderer.invoke("spotify:importRemote", remote),
  spotifyCancelImport: () => ipcRenderer.invoke("spotify:cancelImport"),
  spotifyGetAutoSync: () => ipcRenderer.invoke("spotify:getAutoSync"),
  spotifySetAutoSync: (enabled, playlistIds) =>
    ipcRenderer.invoke("spotify:setAutoSync", enabled, playlistIds),
  onSpotifyProgress: (callback) => {
    const subscription = (_event, progress) => callback(progress);
    ipcRenderer.on("spotify:importProgress", subscription);
    return () => ipcRenderer.removeListener("spotify:importProgress", subscription);
  },
};

contextBridge.exposeInMainWorld("mochyApi", mochyApi);
