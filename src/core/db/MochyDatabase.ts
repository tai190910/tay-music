// src/core/db/MochyDatabase.ts

import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import { SCHEMA_SQL } from "./schema.ts";
import type { DbSong, DbPlaylist, DbHistoryEvent, DbLyricsCache } from "./types.ts";
import type { Artist } from "../innertube/types.ts";

export class MochyDatabase {
  private db: Database.Database;

  constructor(dbPath: string = "mochy.db") {
    let dbFile = dbPath;
    if (dbPath !== ":memory:") {
      const resolvedPath = path.resolve(dbPath);
      const parentDir = path.dirname(resolvedPath);
      if (!fs.existsSync(parentDir)) {
        try {
          fs.mkdirSync(parentDir, { recursive: true });
        } catch {}
      }
      dbFile = resolvedPath;
    }

    this.db = new Database(dbFile);
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  // ==================== SONG METHODS ====================

  upsertSong(song: Partial<DbSong> & { id: string; title: string }): void {
    const existing = this.getSong(song.id);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO song (
        id, title, artists, duration, thumbnail_url, album_id, album_name,
        explicit, year, liked, liked_date, total_play_time, in_library, created_at
      ) VALUES (
        @id, @title, @artists, @duration, @thumbnail_url, @album_id, @album_name,
        @explicit, @year, @liked, @liked_date, @total_play_time, @in_library, @created_at
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        artists = excluded.artists,
        duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE song.duration END,
        thumbnail_url = COALESCE(excluded.thumbnail_url, song.thumbnail_url),
        album_id = COALESCE(excluded.album_id, song.album_id),
        album_name = COALESCE(excluded.album_name, song.album_name),
        explicit = COALESCE(excluded.explicit, song.explicit),
        year = COALESCE(excluded.year, song.year)
    `);

    stmt.run({
      id: song.id,
      title: song.title,
      artists: JSON.stringify(song.artists || []),
      duration: song.duration ?? existing?.duration ?? -1,
      thumbnail_url: song.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
      album_id: song.albumId ?? existing?.albumId ?? null,
      album_name: song.albumName ?? existing?.albumName ?? null,
      explicit: song.explicit ? 1 : 0,
      year: song.year ?? existing?.year ?? null,
      liked: song.liked != null ? (song.liked ? 1 : 0) : (existing?.liked ? 1 : 0),
      liked_date: song.likedDate ?? existing?.likedDate ?? null,
      total_play_time: song.totalPlayTime ?? existing?.totalPlayTime ?? 0,
      in_library: song.inLibrary ?? existing?.inLibrary ?? null,
      created_at: existing?.createdAt ?? now,
    });
  }

  getSong(id: string): DbSong | null {
    const row: any = this.db.prepare("SELECT * FROM song WHERE id = ?").get(id);
    return row ? this.mapRowToSong(row) : null;
  }

  isLiked(songId: string): boolean {
    const row: any = this.db.prepare("SELECT liked FROM song WHERE id = ?").get(songId);
    return row ? row.liked === 1 : false;
  }

  setLiked(songId: string, liked: boolean, songMetadata?: Partial<DbSong>): void {
    if (songMetadata) {
      this.upsertSong({ ...songMetadata, id: songId, title: songMetadata.title || "Unknown" });
    }

    const now = Date.now();
    this.db.prepare(`
      UPDATE song SET liked = ?, liked_date = ? WHERE id = ?
    `).run(liked ? 1 : 0, liked ? now : null, songId);
  }

  toggleLike(songId: string, songMetadata?: Partial<DbSong>): boolean {
    const current = this.isLiked(songId);
    const newLiked = !current;
    this.setLiked(songId, newLiked, songMetadata);
    return newLiked;
  }

  getLikedSongs(): DbSong[] {
    const rows: any[] = this.db.prepare(`
      SELECT * FROM song WHERE liked = 1 ORDER BY liked_date DESC, created_at DESC
    `).all();
    return rows.map((r) => this.mapRowToSong(r));
  }

  // ==================== HISTORY METHODS ====================

  addHistory(songId: string, playTimeSec: number = 0, songMetadata?: Partial<DbSong>): void {
    if (songMetadata) {
      this.upsertSong({ ...songMetadata, id: songId, title: songMetadata.title || "Unknown" });
    }

    const now = Date.now();
    const insertHistory = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO event (song_id, timestamp, play_time) VALUES (?, ?, ?)
      `).run(songId, now, playTimeSec);

      this.db.prepare(`
        UPDATE song SET total_play_time = total_play_time + ? WHERE id = ?
      `).run(playTimeSec, songId);
    });

    insertHistory();
  }

  getHistory(limit: number = 50, offset: number = 0): DbHistoryEvent[] {
    const rows: any[] = this.db.prepare(`
      SELECT e.id as event_id, e.song_id, e.timestamp, e.play_time,
             s.title, s.artists, s.duration, s.thumbnail_url, s.album_id, s.album_name,
             s.explicit, s.year, s.liked, s.liked_date, s.total_play_time, s.in_library, s.created_at
      FROM event e
      LEFT JOIN song s ON e.song_id = s.id
      ORDER BY e.timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return rows.map((r) => ({
      id: r.event_id,
      songId: r.song_id,
      timestamp: r.timestamp,
      playTime: r.play_time,
      song: r.title ? this.mapRowToSong({ ...r, id: r.song_id }) : {
        id: r.song_id,
        title: "Bài hát đã lưu",
        artists: [],
        duration: -1,
      },
    }));
  }

  clearHistory(): void {
    this.db.prepare("DELETE FROM event").run();
  }

  deleteHistoryItem(id: number): void {
    this.db.prepare("DELETE FROM event WHERE id = ?").run(id);
  }

  // ==================== PLAYLIST METHODS ====================

  createPlaylist(
    name: string,
    description: string | null = null,
    thumbnailUrl: string | null = null,
    browseId: string | null = null
  ): DbPlaylist {
    const id = "LP_" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO playlist (id, name, browse_id, description, thumbnail_url, is_editable, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, name, browseId, description, thumbnailUrl, now, now);

    return {
      id,
      name,
      browseId,
      description,
      thumbnailUrl,
      isEditable: true,
      songCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  getPlaylists(): DbPlaylist[] {
    const rows: any[] = this.db.prepare(`
      SELECT p.*, COUNT(psm.song_id) as song_count
      FROM playlist p
      LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      browseId: r.browse_id,
      description: r.description,
      thumbnailUrl: r.thumbnail_url,
      isEditable: r.is_editable === 1,
      songCount: r.song_count || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  getPlaylist(id: string): DbPlaylist | null {
    const row: any = this.db.prepare(`
      SELECT p.*, COUNT(psm.song_id) as song_count
      FROM playlist p
      LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
      WHERE p.id = ?
      GROUP BY p.id
    `).get(id);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      browseId: row.browse_id,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      isEditable: row.is_editable === 1,
      songCount: row.song_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findPlaylistByName(name: string): DbPlaylist | null {
    const row: any = this.db.prepare(`
      SELECT p.*, COUNT(psm.song_id) as song_count
      FROM playlist p
      LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
      WHERE LOWER(p.name) = LOWER(?)
      GROUP BY p.id
      LIMIT 1
    `).get(name);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      browseId: row.browse_id,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      isEditable: row.is_editable === 1,
      songCount: row.song_count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  deletePlaylist(id: string): boolean {
    const info = this.db.prepare("DELETE FROM playlist WHERE id = ?").run(id);
    return info.changes > 0;
  }

  addSongToPlaylist(playlistId: string, songId: string, songMetadata?: Partial<DbSong>): boolean {
    if (songMetadata) {
      this.upsertSong({ ...songMetadata, id: songId, title: songMetadata.title || "Unknown" });
    }

    const now = Date.now();
    try {
      const maxPosRow: any = this.db.prepare(`
        SELECT MAX(position) as max_pos FROM playlist_song_map WHERE playlist_id = ?
      `).get(playlistId);
      const nextPos = (maxPosRow?.max_pos ?? -1) + 1;

      this.db.prepare(`
        INSERT INTO playlist_song_map (playlist_id, song_id, position, added_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(playlist_id, song_id) DO NOTHING
      `).run(playlistId, songId, nextPos, now);

      this.db.prepare("UPDATE playlist SET updated_at = ? WHERE id = ?").run(now, playlistId);
      return true;
    } catch {
      return false;
    }
  }

  removeSongFromPlaylist(playlistId: string, songId: string): boolean {
    const info = this.db.prepare(`
      DELETE FROM playlist_song_map WHERE playlist_id = ? AND song_id = ?
    `).run(playlistId, songId);

    if (info.changes > 0) {
      this.db.prepare("UPDATE playlist SET updated_at = ? WHERE id = ?").run(Date.now(), playlistId);
      return true;
    }
    return false;
  }

  replaceSongInPlaylist(playlistId: string, oldSongId: string, newSong: DbSong): boolean {
    this.upsertSong(newSong);

    const now = Date.now();
    const info = this.db.prepare(`
      UPDATE playlist_song_map
      SET song_id = ?
      WHERE playlist_id = ? AND song_id = ?
    `).run(newSong.id, playlistId, oldSongId);

    if (info.changes > 0) {
      this.db.prepare("UPDATE playlist SET updated_at = ? WHERE id = ?").run(now, playlistId);
      return true;
    }
    return false;
  }

  getPlaylistSongs(playlistId: string): DbSong[] {
    const rows: any[] = this.db.prepare(`
      SELECT s.*
      FROM playlist_song_map psm
      JOIN song s ON psm.song_id = s.id
      WHERE psm.playlist_id = ?
      ORDER BY psm.position ASC
    `).all(playlistId);

    return rows.map((r) => this.mapRowToSong(r));
  }

  // ==================== LYRICS CACHE METHODS ====================

  getCachedLyrics(songId: string): DbLyricsCache | null {
    const row: any = this.db.prepare("SELECT * FROM lyrics_cache WHERE song_id = ?").get(songId);
    if (!row) return null;
    return {
      songId: row.song_id,
      lyrics: row.lyrics,
      provider: row.provider,
      cachedAt: row.cached_at,
    };
  }

  cacheLyrics(songId: string, lyrics: string, provider: string = "Unknown"): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO lyrics_cache (song_id, lyrics, provider, cached_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(song_id) DO UPDATE SET
        lyrics = excluded.lyrics,
        provider = excluded.provider,
        cached_at = excluded.cached_at
    `).run(songId, lyrics, provider, now);
  }

  // ==================== SETTINGS METHODS ====================

  getSetting(key: string): string | null {
    const row: any = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, value, now);
  }

  deleteSetting(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  // ==================== HELPER MAPPERS ====================

  private mapRowToSong(row: any): DbSong {
    let artists: Artist[] = [];
    try {
      artists = JSON.parse(row.artists || "[]");
    } catch {
      artists = [{ name: row.artists || "Unknown", id: null }];
    }

    const songId = row.id || row.song_id || "";

    return {
      id: songId,
      title: row.title || "Unknown",
      artists,
      duration: row.duration ?? -1,
      thumbnailUrl: row.thumbnail_url,
      albumId: row.album_id,
      albumName: row.album_name,
      explicit: row.explicit === 1,
      year: row.year,
      liked: row.liked === 1,
      likedDate: row.liked_date,
      totalPlayTime: row.total_play_time ?? 0,
      inLibrary: row.in_library,
      createdAt: row.created_at,
    };
  }
}
