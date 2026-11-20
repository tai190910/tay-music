use crate::models::{Artist, DbHistoryEvent, DbLyricsCache, DbPlaylist, DbSong};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const SCHEMA_SQL: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  timestamp INTEGER NOT NULL,
  play_time INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_timestamp ON event(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_song ON event(song_id);

CREATE TABLE IF NOT EXISTS lyrics_cache (
  song_id TEXT PRIMARY KEY,
  lyrics TEXT NOT NULL,
  provider TEXT DEFAULT 'Unknown',
  cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
"#;

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub struct MochyDatabase {
    conn: Mutex<Connection>,
}

impl MochyDatabase {
    pub fn open<P: AsRef<Path>>(db_path: P) -> Result<Self, String> {
        let path = db_path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA_SQL).map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn upsert_song_value(&self, song: &Value) -> Result<(), String> {
        let id = song
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| song.get("videoId").and_then(|v| v.as_str()))
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() {
            return Err("Missing song id".to_string());
        }

        let title = song
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let artists_val = song
            .get("artists")
            .cloned()
            .unwrap_or_else(|| Value::Array(vec![]));
        let artists_json = serde_json::to_string(&artists_val).unwrap_or_else(|_| "[]".to_string());

        let duration = song.get("duration").and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_f64().map(|f| f.round() as i64))
        });

        let thumbnail_url = song
            .get("thumbnailUrl")
            .and_then(|v| v.as_str())
            .or_else(|| song.get("thumbnail").and_then(|v| v.as_str()))
            .map(|s| s.to_string());

        let album_id = song
            .get("albumId")
            .and_then(|v| v.as_str())
            .or_else(|| {
                song.get("album")
                    .and_then(|a| a.get("id"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.to_string());

        let album_name = song
            .get("albumName")
            .and_then(|v| v.as_str())
            .or_else(|| song.get("album").and_then(|a| a.as_str()))
            .or_else(|| {
                song.get("album")
                    .and_then(|a| a.get("name"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.to_string());

        let explicit = song
            .get("explicit")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let year = song.get("year").and_then(|v| v.as_i64());
        let liked = song.get("liked").and_then(|v| v.as_bool());
        let liked_date = song.get("likedDate").and_then(|v| v.as_i64());
        let total_play_time = song.get("totalPlayTime").and_then(|v| v.as_i64());
        let in_library = song.get("inLibrary").and_then(|v| v.as_i64());

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let existing = Self::get_song_inner(&conn, &id)?;
        let now = now_ms();

        let eff_duration = duration
            .or_else(|| existing.as_ref().map(|e| e.duration))
            .unwrap_or(-1);
        let eff_thumb = thumbnail_url.or_else(|| existing.as_ref().and_then(|e| e.thumbnail_url.clone()));
        let eff_album_id = album_id.or_else(|| existing.as_ref().and_then(|e| e.album_id.clone()));
        let eff_album_name = album_name.or_else(|| existing.as_ref().and_then(|e| e.album_name.clone()));
        let eff_year = year.or_else(|| existing.as_ref().and_then(|e| e.year));
        let eff_liked = liked
            .unwrap_or_else(|| existing.as_ref().map(|e| e.liked).unwrap_or(false));
        let eff_liked_date = liked_date.or_else(|| existing.as_ref().and_then(|e| e.liked_date));
        let eff_play_time = total_play_time
            .or_else(|| existing.as_ref().map(|e| e.total_play_time))
            .unwrap_or(0);
        let eff_in_library = in_library.or_else(|| existing.as_ref().and_then(|e| e.in_library));
        let eff_created = existing.as_ref().map(|e| e.created_at).unwrap_or(now);

        conn.execute(
            r#"
            INSERT INTO song (
              id, title, artists, duration, thumbnail_url, album_id, album_name,
              explicit, year, liked, liked_date, total_play_time, in_library, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              artists = excluded.artists,
              duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE song.duration END,
              thumbnail_url = COALESCE(excluded.thumbnail_url, song.thumbnail_url),
              album_id = COALESCE(excluded.album_id, song.album_id),
              album_name = COALESCE(excluded.album_name, song.album_name),
              explicit = COALESCE(excluded.explicit, song.explicit),
              year = COALESCE(excluded.year, song.year)
            "#,
            params![
                id,
                title,
                artists_json,
                eff_duration,
                eff_thumb,
                eff_album_id,
                eff_album_name,
                if explicit { 1i64 } else { 0i64 },
                eff_year,
                if eff_liked { 1i64 } else { 0i64 },
                eff_liked_date,
                eff_play_time,
                eff_in_library,
                eff_created,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn upsert_db_song(&self, song: &DbSong) -> Result<(), String> {
        let val = serde_json::to_value(song).map_err(|e| e.to_string())?;
        self.upsert_song_value(&val)
    }

    fn map_row_to_song(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbSong> {
        let id: String = row.get("id")?;
        let title: String = row.get::<_, Option<String>>("title")?.unwrap_or_else(|| "Unknown".to_string());
        let artists_raw: String = row.get::<_, Option<String>>("artists")?.unwrap_or_else(|| "[]".to_string());
        let artists: Vec<Artist> = serde_json::from_str(&artists_raw).unwrap_or_else(|_| {
            if artists_raw.trim().is_empty() {
                vec![]
            } else {
                vec![Artist {
                    name: artists_raw,
                    id: None,
                }]
            }
        });
        let duration: i64 = row.get::<_, Option<i64>>("duration")?.unwrap_or(-1);
        let thumbnail_url: Option<String> = row.get("thumbnail_url")?;
        let album_id: Option<String> = row.get("album_id")?;
        let album_name: Option<String> = row.get("album_name")?;
        let explicit: i64 = row.get::<_, Option<i64>>("explicit")?.unwrap_or(0);
        let year: Option<i64> = row.get("year")?;
        let liked: i64 = row.get::<_, Option<i64>>("liked")?.unwrap_or(0);
        let liked_date: Option<i64> = row.get("liked_date")?;
        let total_play_time: i64 = row.get::<_, Option<i64>>("total_play_time")?.unwrap_or(0);
        let in_library: Option<i64> = row.get("in_library")?;
        let created_at: i64 = row.get::<_, Option<i64>>("created_at")?.unwrap_or(0);

        Ok(DbSong {
            id,
            title,
            artists,
            duration,
            thumbnail: thumbnail_url.clone(),
            thumbnail_url,
            album_id,
            album_name,
            explicit: explicit == 1,
            year,
            liked: liked == 1,
            liked_date,
            total_play_time,
            in_library,
            created_at,
        })
    }

    fn get_song_inner(conn: &Connection, id: &str) -> Result<Option<DbSong>, String> {
        conn.query_row("SELECT * FROM song WHERE id = ?1", params![id], Self::map_row_to_song)
            .optional()
            .map_err(|e| e.to_string())
    }

    pub fn get_song(&self, id: &str) -> Result<Option<DbSong>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        Self::get_song_inner(&conn, id)
    }

    pub fn is_liked(&self, song_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let liked: Option<i64> = conn
            .query_row(
                "SELECT liked FROM song WHERE id = ?1",
                params![song_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(liked.unwrap_or(0) == 1)
    }

    pub fn set_liked(
        &self,
        song_id: &str,
        liked: bool,
        metadata: Option<&Value>,
    ) -> Result<bool, String> {
        if let Some(meta) = metadata {
            let mut obj = meta.clone();
            if let Some(map) = obj.as_object_mut() {
                map.insert("id".to_string(), Value::String(song_id.to_string()));
                if !map.contains_key("title") {
                    map.insert("title".to_string(), Value::String("Unknown".to_string()));
                }
            }
            let _ = self.upsert_song_value(&obj);
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        let liked_date: Option<i64> = if liked { Some(now) } else { None };
        conn.execute(
            "UPDATE song SET liked = ?1, liked_date = ?2 WHERE id = ?3",
            params![if liked { 1i64 } else { 0i64 }, liked_date, song_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(liked)
    }

    pub fn toggle_like(&self, song_id: &str, metadata: Option<&Value>) -> Result<bool, String> {
        let current = self.is_liked(song_id)?;
        let next = !current;
        self.set_liked(song_id, next, metadata)
    }

    pub fn get_liked_songs(&self) -> Result<Vec<DbSong>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT * FROM song WHERE liked = 1 ORDER BY liked_date DESC, created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], Self::map_row_to_song)
            .map_err(|e| e.to_string())?;
        let mut songs = Vec::new();
        for row in rows {
            songs.push(row.map_err(|e| e.to_string())?);
        }
        Ok(songs)
    }

    pub fn add_history(
        &self,
        song_id: &str,
        play_time_sec: i64,
        metadata: Option<&Value>,
    ) -> Result<(), String> {
        if let Some(meta) = metadata {
            let mut obj = meta.clone();
            if let Some(map) = obj.as_object_mut() {
                map.insert("id".to_string(), Value::String(song_id.to_string()));
                if !map.contains_key("title") {
                    map.insert("title".to_string(), Value::String("Unknown".to_string()));
                }
            }
            let _ = self.upsert_song_value(&obj);
        }

        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = now_ms();
        tx.execute(
            "INSERT INTO event (song_id, timestamp, play_time) VALUES (?1, ?2, ?3)",
            params![song_id, now, play_time_sec],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE song SET total_play_time = total_play_time + ?1 WHERE id = ?2",
            params![play_time_sec, song_id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_history(&self, limit: i64, offset: i64) -> Result<Vec<DbHistoryEvent>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT e.id as event_id, e.song_id as id, e.timestamp, e.play_time,
                       s.title, s.artists, s.duration, s.thumbnail_url, s.album_id, s.album_name,
                       s.explicit, s.year, s.liked, s.liked_date, s.total_play_time, s.in_library, s.created_at
                FROM event e
                LEFT JOIN song s ON e.song_id = s.id
                ORDER BY e.timestamp DESC
                LIMIT ?1 OFFSET ?2
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit, offset], |row| {
                let event_id: i64 = row.get("event_id")?;
                let song_id: String = row.get("id")?;
                let timestamp: i64 = row.get("timestamp")?;
                let play_time: i64 = row.get("play_time")?;
                let title: Option<String> = row.get("title")?;

                let song = if title.is_some() {
                    Self::map_row_to_song(row)?
                } else {
                    DbSong {
                        id: song_id.clone(),
                        title: "Bài hát đã lưu".to_string(),
                        artists: vec![],
                        duration: -1,
                        thumbnail_url: None,
                        thumbnail: None,
                        album_id: None,
                        album_name: None,
                        explicit: false,
                        year: None,
                        liked: false,
                        liked_date: None,
                        total_play_time: 0,
                        in_library: None,
                        created_at: 0,
                    }
                };

                Ok(DbHistoryEvent {
                    id: event_id,
                    song_id,
                    timestamp,
                    play_time,
                    song: Some(song),
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM event", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn random_playlist_id() -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        const CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let mut x = nanos as u64 ^ 0x5DEECE66Du64;
        let mut s = String::from("LP_");
        for _ in 0..8 {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
            let idx = ((x >> 32) as usize) % CHARS.len();
            s.push(CHARS[idx] as char);
        }
        s
    }

    pub fn create_playlist(
        &self,
        name: &str,
        description: Option<&str>,
        thumbnail_url: Option<&str>,
        browse_id: Option<&str>,
    ) -> Result<DbPlaylist, String> {
        let id = Self::random_playlist_id();
        let now = now_ms();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"
            INSERT INTO playlist (id, name, browse_id, description, thumbnail_url, is_editable, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)
            "#,
            params![id, name, browse_id, description, thumbnail_url, now, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(DbPlaylist {
            id,
            name: name.to_string(),
            browse_id: browse_id.map(|s| s.to_string()),
            description: description.map(|s| s.to_string()),
            thumbnail_url: thumbnail_url.map(|s| s.to_string()),
            is_editable: true,
            song_count: 0,
            created_at: now,
            updated_at: now,
        })
    }

    fn map_row_to_playlist(row: &rusqlite::Row<'_>) -> rusqlite::Result<DbPlaylist> {
        Ok(DbPlaylist {
            id: row.get("id")?,
            name: row.get("name")?,
            browse_id: row.get("browse_id")?,
            description: row.get("description")?,
            thumbnail_url: row.get("thumbnail_url")?,
            is_editable: row.get::<_, Option<i64>>("is_editable")?.unwrap_or(1) == 1,
            song_count: row.get::<_, Option<i64>>("song_count")?.unwrap_or(0),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn get_playlists(&self) -> Result<Vec<DbPlaylist>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT p.*, COUNT(psm.song_id) as song_count
                FROM playlist p
                LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
                GROUP BY p.id
                ORDER BY p.updated_at DESC
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], Self::map_row_to_playlist)
            .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_playlist(&self, id: &str) -> Result<Option<DbPlaylist>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            r#"
            SELECT p.*, COUNT(psm.song_id) as song_count
            FROM playlist p
            LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
            WHERE p.id = ?1
            GROUP BY p.id
            "#,
            params![id],
            Self::map_row_to_playlist,
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn find_playlist_by_name(&self, name: &str) -> Result<Option<DbPlaylist>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            r#"
            SELECT p.*, COUNT(psm.song_id) as song_count
            FROM playlist p
            LEFT JOIN playlist_song_map psm ON p.id = psm.playlist_id
            WHERE LOWER(p.name) = LOWER(?1)
            GROUP BY p.id
            LIMIT 1
            "#,
            params![name],
            Self::map_row_to_playlist,
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn delete_playlist(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let changes = conn
            .execute("DELETE FROM playlist WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(changes > 0)
    }

    pub fn add_song_to_playlist(
        &self,
        playlist_id: &str,
        song_id: &str,
        metadata: Option<&Value>,
    ) -> Result<bool, String> {
        if let Some(meta) = metadata {
            let mut obj = meta.clone();
            if let Some(map) = obj.as_object_mut() {
                map.insert("id".to_string(), Value::String(song_id.to_string()));
                if !map.contains_key("title") {
                    map.insert("title".to_string(), Value::String("Unknown".to_string()));
                }
            }
            let _ = self.upsert_song_value(&obj);
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        let max_pos: Option<i64> = conn
            .query_row(
                "SELECT MAX(position) FROM playlist_song_map WHERE playlist_id = ?1",
                params![playlist_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        let next_pos = max_pos.unwrap_or(-1) + 1;

        let res = conn.execute(
            r#"
            INSERT INTO playlist_song_map (playlist_id, song_id, position, added_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(playlist_id, song_id) DO NOTHING
            "#,
            params![playlist_id, song_id, next_pos, now],
        );

        match res {
            Ok(_) => {
                let _ = conn.execute(
                    "UPDATE playlist SET updated_at = ?1 WHERE id = ?2",
                    params![now, playlist_id],
                );
                Ok(true)
            }
            Err(_) => Ok(false),
        }
    }

    pub fn remove_song_from_playlist(&self, playlist_id: &str, song_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let changes = conn
            .execute(
                "DELETE FROM playlist_song_map WHERE playlist_id = ?1 AND song_id = ?2",
                params![playlist_id, song_id],
            )
            .map_err(|e| e.to_string())?;
        if changes > 0 {
            let _ = conn.execute(
                "UPDATE playlist SET updated_at = ?1 WHERE id = ?2",
                params![now_ms(), playlist_id],
            );
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn replace_song_in_playlist(
        &self,
        playlist_id: &str,
        old_song_id: &str,
        new_song: &Value,
    ) -> Result<bool, String> {
        self.upsert_song_value(new_song)?;
        let new_id = new_song
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| new_song.get("videoId").and_then(|v| v.as_str()))
            .unwrap_or("")
            .trim()
            .to_string();

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        let changes = conn
            .execute(
                "UPDATE playlist_song_map SET song_id = ?1 WHERE playlist_id = ?2 AND song_id = ?3",
                params![new_id, playlist_id, old_song_id],
            )
            .map_err(|e| e.to_string())?;
        if changes > 0 {
            let _ = conn.execute(
                "UPDATE playlist SET updated_at = ?1 WHERE id = ?2",
                params![now, playlist_id],
            );
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn get_playlist_songs(&self, playlist_id: &str) -> Result<Vec<DbSong>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT s.*
                FROM playlist_song_map psm
                JOIN song s ON psm.song_id = s.id
                WHERE psm.playlist_id = ?1
                ORDER BY psm.position ASC
                "#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![playlist_id], Self::map_row_to_song)
            .map_err(|e| e.to_string())?;
        let mut songs = Vec::new();
        for r in rows {
            songs.push(r.map_err(|e| e.to_string())?);
        }
        Ok(songs)
    }

    pub fn get_cached_lyrics(&self, song_id: &str) -> Result<Option<DbLyricsCache>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT * FROM lyrics_cache WHERE song_id = ?1",
            params![song_id],
            |row| {
                Ok(DbLyricsCache {
                    song_id: row.get("song_id")?,
                    lyrics: row.get("lyrics")?,
                    provider: row.get("provider")?,
                    cached_at: row.get("cached_at")?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn cache_lyrics(&self, song_id: &str, lyrics: &str, provider: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"
            INSERT INTO lyrics_cache (song_id, lyrics, provider, cached_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(song_id) DO UPDATE SET
              lyrics = excluded.lyrics,
              provider = excluded.provider,
              cached_at = excluded.cached_at
            "#,
            params![song_id, lyrics, provider, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            "#,
            params![key, value, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
