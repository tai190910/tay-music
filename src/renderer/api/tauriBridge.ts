// src/renderer/api/tauriBridge.ts

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isValidTrackId, type MochyApi } from "../types.ts";

export const tauriMochyApi: MochyApi = {
  // YouTube API
  search: (query: string) => invoke("youtube_search", { query }),
  searchSongs: (query: string) => invoke("youtube_search_songs", { query }),
  getStream: (rawVideoId: any, quality?: string) => {
    let videoId = "";
    if (typeof rawVideoId === "string") {
      videoId = rawVideoId.trim();
    } else if (rawVideoId && typeof rawVideoId === "object") {
      videoId = (rawVideoId.videoId || rawVideoId.id || "").trim();
    }
    if (!isValidTrackId(videoId)) {
      console.warn("[TauriBridge] Blocked getStream with invalid trackId:", rawVideoId);
      return Promise.reject(new Error(`Invalid trackId: "${rawVideoId}"`));
    }
    return invoke("youtube_get_stream", { videoId, quality });
  },
  getLyrics: (title: string, artist?: string, duration?: number, videoId?: string) =>
    invoke("youtube_get_lyrics", { title, artist, duration, videoId }),
  getYouTubePlaylist: (playlistId: string) => invoke("youtube_get_playlist", { playlistId }),

  // Database API - Song & Liked
  upsertSong: (song: any) => invoke("db_upsert_song", { song }),
  getSong: (id: string) => invoke("db_get_song", { id }),
  setLiked: (songId: string, liked: boolean, metadata?: any) =>
    invoke("db_set_liked", { songId, liked, metadata }),
  toggleLike: (songId: string, metadata?: any) =>
    invoke("db_toggle_like", { songId, metadata }),
  isLiked: (songId: string) => invoke("db_is_liked", { songId }),
  getLikedSongs: () => invoke("db_get_liked_songs"),

  // Database API - History
  addHistory: (songId: string, playTimeSec?: number, metadata?: any) =>
    invoke("db_add_history", { songId, playTimeSec, metadata }),
  getHistory: (limit?: number, offset?: number) =>
    invoke("db_get_history", { limit, offset }),
  clearHistory: () => invoke("db_clear_history"),

  // Database API - Playlists
  createPlaylist: (name: string, description?: string, thumbnailUrl?: string) =>
    invoke("db_create_playlist", { name, description, thumbnailUrl }),
  getPlaylists: () => invoke("db_get_playlists"),
  getPlaylist: (id: string) => invoke("db_get_playlist", { id }),
  deletePlaylist: (id: string) => invoke("db_delete_playlist", { id }),
  addSongToPlaylist: (playlistId: string, songId: string, metadata?: any) =>
    invoke("db_add_song_to_playlist", { playlistId, songId, metadata }),
  removeSongFromPlaylist: (playlistId: string, songId: string) =>
    invoke("db_remove_song_from_playlist", { playlistId, songId }),
  getPlaylistSongs: (playlistId: string) =>
    invoke("db_get_playlist_songs", { playlistId }),
  replacePlaylistSong: (playlistId: string, oldSongId: string, newSong: any) =>
    invoke("db_replace_playlist_song", { playlistId, oldSongId, newSong }),

  // Fix Match / Track Candidates
  getTrackCandidates: (query: { title: string; artist: string; duration?: number | null }) =>
    invoke("youtube_get_track_candidates", { query }),

  // Database API - Lyrics Cache
  getCachedLyrics: (songId: string) => invoke("db_get_cached_lyrics", { songId }),
  cacheLyrics: (songId: string, lyrics: string, provider: string) =>
    invoke("db_cache_lyrics", { songId, lyrics, provider }),

  // Spotify Importer & Auto-Sync
  spotifyOpenLogin: () => invoke("spotify_open_login"),
  spotifyGetAccount: () => invoke("spotify_get_account"),
  spotifyLogout: () => invoke("spotify_logout"),
  spotifyParseLink: (url: string) => invoke("spotify_parse_link", { url }),
  spotifyGetUserPlaylists: () => invoke("spotify_get_user_playlists"),
  spotifyImportParsed: (parsed: any) => invoke("spotify_import_parsed", { parsed }),
  spotifyImportRemote: (remote: any) => invoke("spotify_import_remote", { remote }),
  spotifyCancelImport: () => invoke("spotify_cancel_import"),
  spotifyGetAutoSync: () => invoke("spotify_get_auto_sync"),
  spotifySetAutoSync: (enabled: boolean, playlistIds?: string[]) =>
    invoke("spotify_set_auto_sync", { enabled, playlistIds }),
  onSpotifyProgress: (callback: (progress: any) => void) => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    listen("spotify:importProgress", (event) => {
      callback(event.payload);
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  },
};

export function initMochyApiBridge(): void {
  if (typeof window !== "undefined" && !window.mochyApi) {
    window.mochyApi = tauriMochyApi;
  }
}
