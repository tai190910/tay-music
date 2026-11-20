mod cipher;
mod commands;
mod db;
mod importer;
mod innertube;
mod lyrics;
mod models;
mod proxy;
mod spotify_webview;

use commands::AppState;
use db::MochyDatabase;
use importer::{MusicImportService, SpotifyClient};
use innertube::InnerTube;
use proxy::LocalStreamProxy;
use reqwest::Client;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::time::{sleep, Duration};

fn resolve_and_migrate_db_path(app: &tauri::App) -> std::path::PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to resolve app_data_dir");
    if !app_data_dir.exists() {
        let _ = std::fs::create_dir_all(&app_data_dir);
    }
    let db_path = app_data_dir.join("mochy_music.db");

    // Smoothly migrate existing Electron database if present and Tauri DB is fresh
    if !db_path.exists() {
        if let Some(parent) = app_data_dir.parent() {
            let legacy_db = parent.join("tay-music").join("mochy_music.db");
            if legacy_db.exists() {
                let _ = std::fs::copy(&legacy_db, &db_path);
                let legacy_wal = parent.join("tay-music").join("mochy_music.db-wal");
                if legacy_wal.exists() {
                    let _ = std::fs::copy(&legacy_wal, app_data_dir.join("mochy_music.db-wal"));
                }
            }
        }
    }

    db_path
}

async fn run_auto_sync_if_enabled(app: tauri::AppHandle) {
    sleep(Duration::from_millis(2500)).await;
    let state = app.state::<AppState>();

    let enabled = state
        .db
        .get_setting("spotify_auto_sync")
        .ok()
        .flatten()
        .as_deref()
        == Some("true");
    if !enabled {
        return;
    }

    let raw_playlists = state
        .db
        .get_setting("spotify_sync_playlists")
        .ok()
        .flatten()
        .unwrap_or_else(|| "[]".to_string());
    let playlist_ids: Vec<String> = serde_json::from_str(&raw_playlists).unwrap_or_default();
    if playlist_ids.is_empty() {
        return;
    }

    let Some(token) = spotify_webview::get_valid_token(&app, &state.db).await else {
        log::info!("[Spotify Auto-Sync] Skipped: No valid token available");
        return;
    };

    log::info!(
        "[Spotify Auto-Sync] Starting background auto-sync for {} playlist(s)...",
        playlist_ids.len()
    );

    let Ok(all_remotes) = SpotifyClient::get_user_playlists(&state.http_client, &token).await else {
        return;
    };

    for remote in all_remotes
        .into_iter()
        .filter(|r| playlist_ids.contains(&r.id))
    {
        let _ = state
            .importer
            .import_from_spotify_remote(&state.db, &state.inner_tube, &token, remote, |p| {
                let _ = app.emit("spotify:importProgress", &p);
            })
            .await;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let db_path = resolve_and_migrate_db_path(app);
            let db = Arc::new(MochyDatabase::open(&db_path).expect("Failed to open SQLite database"));

            let http_client = Client::builder()
                .redirect(reqwest::redirect::Policy::limited(6))
                .pool_max_idle_per_host(8)
                .build()
                .expect("Failed to create reqwest Client");

            let stream_proxy = tauri::async_runtime::block_on(LocalStreamProxy::start(http_client.clone()))
                .expect("Failed to start LocalStreamProxy");

            let inner_tube = Arc::new(InnerTube::new(http_client.clone()));
            let importer = Arc::new(MusicImportService::new());

            app.manage(AppState {
                db,
                inner_tube,
                http_client,
                stream_proxy,
                importer,
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_auto_sync_if_enabled(handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::youtube_search,
            commands::youtube_search_songs,
            commands::youtube_get_stream,
            commands::youtube_get_lyrics,
            commands::youtube_get_playlist,
            commands::youtube_get_track_candidates,
            commands::db_upsert_song,
            commands::db_get_song,
            commands::db_is_liked,
            commands::db_set_liked,
            commands::db_toggle_like,
            commands::db_get_liked_songs,
            commands::db_add_history,
            commands::db_get_history,
            commands::db_clear_history,
            commands::db_create_playlist,
            commands::db_get_playlists,
            commands::db_get_playlist,
            commands::db_delete_playlist,
            commands::db_add_song_to_playlist,
            commands::db_remove_song_from_playlist,
            commands::db_get_playlist_songs,
            commands::db_replace_playlist_song,
            commands::db_get_cached_lyrics,
            commands::db_cache_lyrics,
            commands::spotify_open_login,
            commands::spotify_get_account,
            commands::spotify_logout,
            commands::spotify_parse_link,
            commands::spotify_get_user_playlists,
            commands::spotify_import_parsed,
            commands::spotify_import_remote,
            commands::spotify_cancel_import,
            commands::spotify_get_auto_sync,
            commands::spotify_set_auto_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importer::TrackMatcher;
    use crate::innertube::{YTPlayerUtils, YouTube};
    use crate::lyrics::LyricsHelper;
    use crate::models::ImportedTrack;

    #[test]
    fn test_db_crud_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("tay_music_test_{}.db", db::now_ms()));
        let db = MochyDatabase::open(&tmp).expect("open db");

        let song_json = serde_json::json!({
            "id": "bNp9pn0ni3I",
            "title": "Chúng Ta Của Hiện Tại",
            "artists": [{ "name": "Sơn Tùng M-TP", "id": null }],
            "duration": 302,
            "thumbnail": "https://example.com/thumb.jpg",
            "explicit": false
        });
        db.upsert_song_value(&song_json).expect("upsert song");
        let fetched = db.get_song("bNp9pn0ni3I").expect("get song").expect("exists");
        assert_eq!(fetched.title, "Chúng Ta Của Hiện Tại");
        assert_eq!(fetched.thumbnail.as_deref(), Some("https://example.com/thumb.jpg"));

        assert!(!db.is_liked("bNp9pn0ni3I").unwrap());
        assert!(db.toggle_like("bNp9pn0ni3I", None).unwrap());
        assert!(db.is_liked("bNp9pn0ni3I").unwrap());
        assert_eq!(db.get_liked_songs().unwrap().len(), 1);

        db.add_history("bNp9pn0ni3I", 45, None).unwrap();
        assert_eq!(db.get_history(10, 0).unwrap().len(), 1);

        let pl = db.create_playlist("Test Playlist", Some("desc"), None, None).unwrap();
        assert!(db.add_song_to_playlist(&pl.id, "bNp9pn0ni3I", None).unwrap());
        assert_eq!(db.get_playlist_songs(&pl.id).unwrap().len(), 1);

        db.cache_lyrics("bNp9pn0ni3I", "[00:01.00] Hello", "LrcLib").unwrap();
        assert_eq!(db.get_cached_lyrics("bNp9pn0ni3I").unwrap().unwrap().provider, "LrcLib");

        drop(db);
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(tmp.with_extension("db-wal"));
        let _ = std::fs::remove_file(tmp.with_extension("db-shm"));
    }

    #[test]
    fn test_track_matcher_vietnamese_normalization() {
        let norm = TrackMatcher::normalize_text("Chúng Ta Của Hiện Tại (Official Video)");
        assert!(norm.contains("chung ta cua hien tai"));
        let sim = TrackMatcher::similarity("chung ta cua hien tai", "chung ta cua hien tai");
        assert!((sim - 1.0).abs() < 1e-6);

        let track = ImportedTrack {
            title: "Chúng Ta Của Hiện Tại".to_string(),
            artist: "Sơn Tùng M-TP".to_string(),
            album: None,
            duration_ms: Some(302_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let cand = crate::models::SongItem {
            id: "bNp9pn0ni3I".to_string(),
            video_id: "bNp9pn0ni3I".to_string(),
            title: "Chúng Ta Của Hiện Tại".to_string(),
            artists: vec![crate::models::Artist {
                name: "Sơn Tùng M-TP".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(302),
            duration_text: Some("5:02".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_ATV".to_string()),
            is_video_song: false,
            thumbnail: None,
            explicit: false,
            share_link: "https://music.youtube.com/watch?v=bNp9pn0ni3I".to_string(),
            author: None,
        };
        let matcher = TrackMatcher::new();
        let score = matcher.score(&track, &cand);
        assert!(score > 0.9, "Expected high match score, got {score}");
    }

    #[test]
    fn test_solver_js_loads() {
        let rt = rquickjs::Runtime::new().unwrap();
        let ctx = rquickjs::Context::full(&rt).unwrap();
        let ok = ctx.with(|ctx| -> bool {
            let _ = ctx.eval::<rquickjs::Value, _>(
                "globalThis.console = { log: function(){}, warn: function(){}, error: function(){} };",
            );
            let m = ctx.eval::<rquickjs::Value, _>(include_str!("../solver/meriyah.js")).is_ok();
            let a = ctx.eval::<rquickjs::Value, _>(include_str!("../solver/astring.js")).is_ok();
            let y = ctx.eval::<rquickjs::Value, _>(include_str!("../solver/yt.solver.core.js")).is_ok();
            let has_jsc = ctx.eval::<bool, _>("typeof jsc === 'function'").unwrap_or(false);
            m && a && y && has_jsc
        });
        assert!(ok, "Expected meriyah, astring, and yt.solver.core.js to load in QuickJS");
    }

    #[tokio::test]
    async fn test_youtube_search_stream_proxy_and_lyrics() {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(6))
            .build()
            .unwrap();
        let inner = InnerTube::new(client.clone());
        let proxy = LocalStreamProxy::start(client.clone()).await.expect("start proxy");

        let songs = YouTube::search_songs(&inner, "Sơn Tùng M-TP Chúng Ta Của Hiện Tại")
            .await
            .expect("youtube search");
        assert!(!songs.is_empty(), "Expected search results");

        let first = &songs[0];
        let playback = YTPlayerUtils::resolve_playback_data(&inner, &first.id, "HIGH")
            .await
            .expect("resolve playback");
        assert!(!playback.stream_url.is_empty());

        let clen = YTPlayerUtils::parse_content_length(&playback.format);
        let mime = playback.format.get("mimeType").and_then(|v| v.as_str());
        let proxied_url = proxy.get_proxy_url(&playback.original_stream_url, &playback.stream_client, clen, mime);

        let res = client
            .get(&proxied_url)
            .header("Range", "bytes=0-1023")
            .send()
            .await
            .expect("fetch proxied range");
        assert_eq!(res.status().as_u16(), 206, "Expected 206 Partial Content from proxy");
        let chunk = res.bytes().await.expect("read proxy bytes");
        assert_eq!(chunk.len(), 1024, "Expected exact 1024 bytes");

        let lyrics = LyricsHelper::get_lyrics(
            &client,
            &first.title,
            first.artists.first().map(|a| a.name.as_str()).unwrap_or(""),
            first.duration.map(|d| d as f64),
            Some(&first.id),
        )
        .await;
        assert!(lyrics.is_some(), "Expected lyrics result");
    }
}
