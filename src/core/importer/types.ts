// src/core/importer/types.ts

export interface ImportedTrack {
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
  sourceId?: string | null;
  thumbnailUrl?: string | null;
  addedAtMs?: number | null;
}

export interface ParsedImport {
  type: "playlist" | "album" | "track";
  id: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  tracks: ImportedTrack[];
  total: number;
  sourceUrl?: string;
}

export interface SpotifyAccountInfo {
  id: string;
  displayName: string;
  email?: string;
  photoUrl?: string;
  spDc?: string;
  accessToken?: string;
  expiresAt?: number;
  autoSync?: boolean;
  syncPlaylists?: string[];
  syncLiked?: boolean;
}

export interface SpotifyRemotePlaylist {
  id: string;
  name: string;
  trackCount: number;
  coverUrl?: string | null;
  isLiked?: boolean;
  ownerName?: string | null;
}

export interface ImportProgress {
  phase: "fetching" | "matching" | "saving" | "done" | "error";
  total: number;
  current: number;
  matched: number;
  currentTrack?: string;
  playlistName?: string;
  error?: string;
}
