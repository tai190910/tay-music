// src/core/db/schema.ts

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Bảng bài hát (Song)
CREATE TABLE IF NOT EXISTS song (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artists TEXT NOT NULL,
  duration INTEGER DEFAULT -1,
  thumbnail_url TEXT,
  album_id TEXT,
  album_name TEXT,
  explicit INTEGER DEFAULT 0,
  year INTEGER,
  liked INTEGER DEFAULT 0,
  liked_date INTEGER,
  total_play_time INTEGER DEFAULT 0,
  in_library INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_song_liked ON song(liked);
CREATE INDEX IF NOT EXISTS idx_song_in_library ON song(in_library);

-- Bảng danh sách phát (Playlist)
CREATE TABLE IF NOT EXISTS playlist (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  browse_id TEXT,
  description TEXT,
  thumbnail_url TEXT,
  is_editable INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Bảng liên kết Playlist và Song
CREATE TABLE IF NOT EXISTS playlist_song_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL REFERENCES playlist(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  added_at INTEGER NOT NULL,
  UNIQUE(playlist_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_psm_playlist ON playlist_song_map(playlist_id);
CREATE INDEX IF NOT EXISTS idx_psm_song ON playlist_song_map(song_id);

-- Bảng lịch sử nghe nhạc (History Events)
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  timestamp INTEGER NOT NULL,
  play_time INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_timestamp ON event(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_song ON event(song_id);

-- Bảng lưu cache lời bài hát offline (Lyrics)
CREATE TABLE IF NOT EXISTS lyrics_cache (
  song_id TEXT PRIMARY KEY,
  lyrics TEXT NOT NULL,
  provider TEXT DEFAULT 'Unknown',
  cached_at INTEGER NOT NULL
);

-- Bảng cài đặt & cấu hình ứng dụng (Settings & Sync tokens)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
