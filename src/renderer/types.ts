// src/renderer/types.ts

import type { ImportResult } from "../core/importer/types.ts";

export function isValidTrackId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "undefined") return false;
  if (trimmed.length === 11) return true;
  return /^sc:\d{4,}$/.test(trimmed);
}

export function getSourceBadge(cand: any): { label: string; cls: string } {
  if (
    cand?.source === "soundcloud" ||
    (typeof cand?.id === "string" && cand.id.startsWith("sc:"))
  ) {
    return {
      label: "SC",
      cls: "bg-[#f97316]/15 text-[#fb923c] border-[#f97316]/40",
    };
  }
  if (cand?.source === "yt_video" || cand?.isVideoSong) {
    return {
      label: "YT VIDEO",
      cls: "bg-[#2589f5]/15 text-[#38bdf8] border-[#2589f5]/40",
    };
  }
  return {
    label: "YT MUSIC",
    cls: "bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d]/35",
  };
}

export interface Artist {
  name: string;
  id?: string | null;
}

export interface Song {
  id: string;
  videoId?: string;
  title: string;
  artists: Artist[];
  duration?: number | null;
  durationText?: string | null;
  thumbnail?: string | null;
  album?: { name: string; id?: string | null } | null;
  explicit?: boolean;
  source?: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  songCount?: number;
  isEditable?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface HistoryItem {
  id: number;
  songId: string;
  timestamp: number;
  playTime: number;
  song?: Song;
}

export interface LyricsLine {
  time: number; // in milliseconds
  text: string;
  words?: { text: string; startTime: number; endTime: number }[] | null;
}

export interface LyricsData {
  provider: string;
  lyrics: string;
  parsed: {
    lines: LyricsLine[];
    isSynced: boolean;
    raw: string;
  };
}

export interface StreamInfo {
  bitrate?: number;
  mimeType?: string;
  client?: string;
  codec?: string;
  badgeText: string;
}

export type RepeatMode = "off" | "all" | "one";
export type ActiveView = "home" | "search" | "library" | "playlist-detail" | "lyrics";

export interface MochyApi {
  // YouTube API
  search: (query: string) => Promise<any>;
  searchSongs: (query: string) => Promise<Song[]>;
  getStream: (videoId: string, quality?: string) => Promise<any>;
  getLyrics: (title: string, artist?: string, duration?: number, videoId?: string) => Promise<LyricsData | null>;
  getYouTubePlaylist?: (playlistId: string) => Promise<any>;

  // DB - Songs & Liked
  upsertSong: (song: any) => Promise<boolean>;
  getSong: (id: string) => Promise<any>;
  isLiked: (songId: string) => Promise<boolean>;
  setLiked: (songId: string, liked: boolean, metadata?: any) => Promise<boolean>;
  toggleLike: (songId: string, metadata?: any) => Promise<boolean>;
  getLikedSongs: () => Promise<any[]>;

  // DB - History
  addHistory: (songId: string, playTimeSec?: number, metadata?: any) => Promise<boolean>;
  getHistory: (limit?: number, offset?: number) => Promise<any[]>;
  clearHistory: () => Promise<boolean>;

  // DB - Playlists
  createPlaylist: (name: string, description?: string, thumbnailUrl?: string) => Promise<Playlist>;
  getPlaylists: () => Promise<Playlist[]>;
  getPlaylist: (id: string) => Promise<Playlist | null>;
  deletePlaylist: (id: string) => Promise<boolean>;
  addSongToPlaylist: (playlistId: string, songId: string, metadata?: any) => Promise<boolean>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<boolean>;
  getPlaylistSongs: (playlistId: string) => Promise<any[]>;
  replacePlaylistSong: (playlistId: string, oldSongId: string, newSong: any) => Promise<boolean>;

  // Fix Match / Track Candidates
  getTrackCandidates: (query: { title: string; artist: string; duration?: number | null }) => Promise<any[]>;

  // DB - Lyrics
  getCachedLyrics: (songId: string) => Promise<any>;
  cacheLyrics: (songId: string, lyrics: string, provider: string) => Promise<boolean>;

  // Spotify Importer & Auto-Sync
  spotifyOpenLogin: () => Promise<any>;
  spotifyGetAccount: () => Promise<any>;
  spotifyLogout: () => Promise<boolean>;
  spotifyParseLink: (url: string) => Promise<any>;
  spotifyGetUserPlaylists: () => Promise<any[]>;
  spotifyImportParsed: (parsed: any) => Promise<ImportResult>;
  spotifyImportRemote: (remote: any) => Promise<ImportResult>;
  spotifyCancelImport: () => Promise<boolean>;
  spotifyGetAutoSync: () => Promise<{ enabled: boolean; playlistIds: string[] }>;
  spotifySetAutoSync: (enabled: boolean, playlistIds?: string[]) => Promise<boolean>;
  onSpotifyProgress: (callback: (progress: any) => void) => () => void;
}

declare global {
  interface Window {
    mochyApi: MochyApi;
  }
}
