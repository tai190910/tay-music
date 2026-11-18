// src/core/db/types.ts

import type { Artist } from "../innertube/types.ts";

export interface DbSong {
  id: string;
  title: string;
  artists: Artist[];
  duration: number; // in seconds
  thumbnailUrl: string | null;
  albumId?: string | null;
  albumName?: string | null;
  explicit?: boolean;
  year?: number | null;
  liked: boolean;
  likedDate?: number | null; // timestamp ms
  totalPlayTime: number; // in seconds
  inLibrary?: number | null; // timestamp ms
  createdAt: number;
}

export interface DbPlaylist {
  id: string;
  name: string;
  browseId?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  isEditable: boolean;
  songCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DbHistoryEvent {
  id: number;
  songId: string;
  timestamp: number; // timestamp ms
  playTime: number;  // in seconds
  song?: DbSong;
}

export interface DbLyricsCache {
  songId: string;
  lyrics: string;
  provider: string;
  cachedAt: number;
}
