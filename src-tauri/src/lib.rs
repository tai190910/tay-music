mod cipher;
mod commands;
mod db;
mod discord_rpc;
mod downloader;
mod importer;
mod innertube;
mod lyrics;
mod models;
mod proxy;
mod soundcloud;
mod spotify_webview;
mod youtube_webview;

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
        .plugin(tauri_plugin_dialog::init())
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

            let default_dl_dir = db_path
                .parent()
                .map(|p| p.join("downloads"))
                .unwrap_or_else(|| std::env::temp_dir().join("tay_music_downloads"));
            let initial_dl_dir = db
                .get_setting("downloads_dir")
                .ok()
                .flatten()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .map(std::path::PathBuf::from)
                .unwrap_or(default_dl_dir);
            let downloader = Arc::new(downloader::DownloadManager::new(initial_dl_dir));

            let http_client = Client::builder()
                .redirect(reqwest::redirect::Policy::limited(6))
                .pool_max_idle_per_host(8)
                .build()
                .expect("Failed to create reqwest Client");

            let stream_proxy = tauri::async_runtime::block_on(
                LocalStreamProxy::start_with_downloads(
                    http_client.clone(),
                    downloader.downloads_dir_handle(),
                ),
            )
            .expect("Failed to start LocalStreamProxy");

            let inner_tube = Arc::new(InnerTube::new(http_client.clone()));
            youtube_webview::load_saved_auth_sync(&inner_tube, &db);
            let importer = Arc::new(MusicImportService::new());
            let discord_rpc = Arc::new(discord_rpc::DiscordRpcManager::new());

            app.manage(AppState {
                db,
                inner_tube,
                http_client,
                stream_proxy,
                importer,
                discord_rpc: discord_rpc.clone(),
                downloader,
            });

            discord_rpc::spawn_background_reconnect(app.handle().clone(), discord_rpc);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_auto_sync_if_enabled(handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(
                    event,
                    tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
                )
            {
                if let Some(state) = window.try_state::<AppState>() {
                    let rpc = state.discord_rpc.clone();
                    std::thread::spawn(move || {
                        rpc.shutdown_sync();
                    });
                }
            }
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
            commands::youtube_open_login,
            commands::youtube_get_account,
            commands::youtube_logout,
            commands::update_discord_presence,
            commands::clear_discord_presence,
            commands::get_discord_rpc_status,
            commands::download_track,
            commands::cancel_download,
            commands::delete_downloaded_track,
            commands::get_downloaded_tracks,
            commands::get_local_playback,
            commands::get_storage_info,
            commands::pick_downloads_folder,
            commands::change_downloads_dir,
            commands::export_user_data_backup,
            commands::import_user_data_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::importer::{MatchTier, TrackMatcher};
    use crate::innertube::{YTPlayerUtils, YouTube};
    use crate::lyrics::LyricsHelper;
    use crate::models::{Artist as ModelArtist, ImportedTrack, SongItem};

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
            source: Some("ytm_song".to_string()),
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

    #[test]
    fn test_track_matcher_cjk_and_remix_normalization() {
        assert_eq!(TrackMatcher::normalize_text("孤勇者 (DJ版)"), "孤勇者 dj 版");
        assert_eq!(TrackMatcher::normalize_text("陳奕迅"), "陈奕迅");
        assert_eq!(TrackMatcher::normalize_text("Đừng Làm Trái Tim Anh Đau"), "dung lam trai tim anh dau");

        let cleaned = TrackMatcher::clean_title_for_search("孤勇者 (DJ版) [Official MV]");
        assert!(cleaned.contains("DJ版"), "Expected DJ版 to be preserved in '{cleaned}'");
        assert!(!cleaned.to_lowercase().contains("official mv"), "Expected noise removed in '{cleaned}'");

        let track = ImportedTrack {
            title: "孤勇者 (DJ版)".to_string(),
            artist: "陈奕迅".to_string(),
            album: None,
            duration_ms: Some(250_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };

        let good_dj_video = SongItem {
            id: "uZ9iYxVljrk".to_string(),
            video_id: "uZ9iYxVljrk".to_string(),
            title: "陈奕迅 孤勇者 DJ-MJ Electro Remix【爱你孤身走暗巷】".to_string(),
            artists: vec![ModelArtist {
                name: "DJ-MJ Official".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(250),
            duration_text: Some("4:10".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=uZ9iYxVljrk".to_string(),
            author: Some("DJ-MJ Official".to_string()),
            source: Some("yt_video".to_string()),
        };

        let hour_compilation = SongItem {
            id: "N4NoW59zdmc".to_string(),
            video_id: "N4NoW59zdmc".to_string(),
            title: "孤勇者 DJ版 NONSTOP 1 Hour Mix".to_string(),
            artists: vec![ModelArtist {
                name: "Mix Channel".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(3980),
            duration_text: Some("1:06:20".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=N4NoW59zdmc".to_string(),
            author: Some("Mix Channel".to_string()),
            source: Some("yt_video".to_string()),
        };

        let matcher = TrackMatcher::new();
        let dj_score = matcher.score_for_tier(&track, &good_dj_video, MatchTier::Tier2YtVideo);
        let comp_score = matcher.score_for_tier(&track, &hour_compilation, MatchTier::Tier2YtVideo);
        assert!(dj_score >= 0.70, "Expected high Tier 2 score for matching Chinese DJ remix, got {dj_score}");
        assert_eq!(comp_score, 0.0, "Expected 1-hour compilation to be rejected, got {comp_score}");
    }

    #[tokio::test]
    async fn test_three_tier_audio_resolver_live() {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(6))
            .build()
            .unwrap();
        let inner = InnerTube::new(client.clone());
        let proxy = LocalStreamProxy::start(client.clone()).await.expect("start proxy");

        // 1. Tier 2 YouTube Video search works for CJK Remix
        let yt_videos = YouTube::search_youtube_videos(&inner, "孤勇者 DJ版")
            .await
            .expect("yt web video search");
        assert!(!yt_videos.is_empty(), "Expected YouTube Video results");
        assert!(yt_videos.iter().all(|v| v.id.len() == 11));

        // 2. TrackMatcher resolves CJK, Remix, and normal V-Pop tracks
        let mut matcher = TrackMatcher::new();

        let vpop = ImportedTrack {
            title: "Chúng Ta Của Hiện Tại".to_string(),
            artist: "Sơn Tùng M-TP".to_string(),
            album: None,
            duration_ms: Some(302_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let res_vpop = matcher.match_track(&inner, &vpop).await.expect("match vpop");
        assert_eq!(res_vpop.source.as_deref(), Some("ytm_song"));

        let cjk_remix = ImportedTrack {
            title: "孤勇者 (DJ版)".to_string(),
            artist: "陈奕迅".to_string(),
            album: None,
            duration_ms: Some(315_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let res_cjk = matcher.match_track(&inner, &cjk_remix).await.expect("match cjk remix");
        assert!(res_cjk.id.len() == 11 || crate::soundcloud::is_soundcloud_id(&res_cjk.id));

        let cjk_2 = ImportedTrack {
            title: "踏山河 (DJ版)".to_string(),
            artist: "七叔".to_string(),
            album: None,
            duration_ms: Some(210_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let res_cjk_2 = matcher.match_track(&inner, &cjk_2).await.expect("match cjk_2 remix");
        assert!(!res_cjk_2.id.is_empty());

        let edm_remix = ImportedTrack {
            title: "Faded (Slushii Remix)".to_string(),
            artist: "Alan Walker".to_string(),
            album: None,
            duration_ms: Some(212_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let res_edm = matcher.match_track(&inner, &edm_remix).await.expect("match edm remix");
        assert!(!res_edm.id.is_empty());

        // 3. Tier 3 SoundCloud search + HLS/Raw proxy streaming
        let sc_tracks = crate::soundcloud::search_tracks(&client, "Alan Walker Faded Remix", 5)
            .await
            .expect("soundcloud search");
        assert!(!sc_tracks.is_empty(), "Expected SoundCloud search results");

        let sc_first = &sc_tracks[0];
        let sc_playback = crate::soundcloud::resolve_playback_data(&client, &sc_first.id, &proxy)
            .await
            .expect("resolve SoundCloud playback");
        assert_eq!(sc_playback.stream_client, "SOUNDCLOUD");
        assert!(!sc_playback.stream_url.is_empty());

        let is_hls = sc_playback
            .format
            .get("isHls")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if is_hls {
            let m3u8_res = client
                .get(&sc_playback.stream_url)
                .send()
                .await
                .expect("fetch proxied hls playlist");
            assert_eq!(m3u8_res.status().as_u16(), 200);
            let m3u8_text = m3u8_res.text().await.expect("read hls text");
            assert!(m3u8_text.contains("#EXTM3U"));
            assert!(m3u8_text.contains("/raw?url="), "Expected rewritten segment proxy URLs in M3U8");

            let seg_url = m3u8_text
                .lines()
                .find(|l| l.starts_with("http://127.0.0.1"))
                .expect("segment url in M3U8");
            let seg_res = client.get(seg_url).send().await.expect("fetch first segment");
            assert_eq!(seg_res.status().as_u16(), 200);
            let seg_bytes = seg_res.bytes().await.expect("read segment bytes");
            assert!(!seg_bytes.is_empty(), "Expected non-empty HLS segment bytes");
        }
    }

    #[test]
    fn test_anti_instrumental_filter() {
        for kw in [
            "Dối Lừa Beat",
            "Track (Instrumental)",
            "Song Instrument Ver",
            "Track (Karaoke)",
            "Song Playback",
            "Nhạc Không Lời",
            "khong loi",
            "Nhạc Nền Thư Giãn",
            "nhac nen",
            "Song Off Vocal",
            "Dối Lừa Beat Chuẩn",
            "Dối Lừa Beat Lofi",
            "孤勇者 伴奏",
            "孤勇者 纯音乐",
        ] {
            assert!(
                TrackMatcher::has_instrumental_intent(kw),
                "Expected instrumental intent detected in '{kw}'"
            );
        }

        for safe in [
            "Heartbeat",
            "Upbeat Summer",
            "Instant Crush",
            "Dối Lừa (Lofi Ver)",
            "Cắt Đôi Nỗi Sầu (Remix)",
            "Chúng Ta Của Hiện Tại (Official Audio)",
        ] {
            assert!(
                !TrackMatcher::has_instrumental_intent(safe),
                "Did NOT expect false positive instrumental intent on '{safe}'"
            );
        }

        let matcher = TrackMatcher::new();

        // Case A: Spotify wants a Lofi vocal track; Beat Lofi with identical duration must be rejected (0.0)
        let lofi_vocal = ImportedTrack {
            title: "Dối Lừa (Lofi Ver)".to_string(),
            artist: "Nguyễn Vĩ".to_string(),
            album: None,
            duration_ms: Some(240_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };

        let cand_beat_lofi = SongItem {
            id: "beat1234567".to_string(),
            video_id: "beat1234567".to_string(),
            title: "Dối Lừa - Beat Lofi (Nhạc Nền)".to_string(),
            artists: vec![ModelArtist {
                name: "Nguyễn Vĩ".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(240),
            duration_text: Some("4:00".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=beat1234567".to_string(),
            author: Some("Karaoke Channel".to_string()),
            source: Some("yt_video".to_string()),
        };

        let cand_reupload = SongItem {
            id: "reup1234567".to_string(),
            video_id: "reup1234567".to_string(),
            title: "Dối Lừa (Lofi Ver)".to_string(),
            artists: vec![ModelArtist {
                name: "Nguyễn Vĩ".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(240),
            duration_text: Some("4:00".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=reup1234567".to_string(),
            author: Some("Music Reup".to_string()),
            source: Some("yt_video".to_string()),
        };

        let cand_official_lyrics = SongItem {
            id: "offc1234567".to_string(),
            video_id: "offc1234567".to_string(),
            title: "Dối Lừa (Lofi Ver) (Official Audio / Lyrics)".to_string(),
            artists: vec![ModelArtist {
                name: "Nguyễn Vĩ".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(240),
            duration_text: Some("4:00".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=offc1234567".to_string(),
            author: Some("Nguyễn Vĩ Official".to_string()),
            source: Some("yt_video".to_string()),
        };

        let beat_score = matcher.score_for_tier(&lofi_vocal, &cand_beat_lofi, MatchTier::Tier2YtVideo);
        let reup_score = matcher.score_for_tier(&lofi_vocal, &cand_reupload, MatchTier::Tier2YtVideo);
        let off_score =
            matcher.score_for_tier(&lofi_vocal, &cand_official_lyrics, MatchTier::Tier2YtVideo);

        assert_eq!(beat_score, 0.0, "Expected beat lofi to be rejected for vocal query");
        assert!(off_score >= 0.80, "Expected official/lyrics version high score, got {off_score}");
        assert!(
            off_score > reup_score || (off_score - 1.0).abs() < 1e-6,
            "Expected official/lyrics ({off_score}) >= plain reupload ({reup_score})"
        );

        // Case A with Karaoke Remix
        let remix_vocal = ImportedTrack {
            title: "Cắt Đôi Nỗi Sầu (Remix)".to_string(),
            artist: "Tăng Duy Tân".to_string(),
            album: None,
            duration_ms: Some(195_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let cand_karaoke_remix = SongItem {
            id: "kara1234567".to_string(),
            video_id: "kara1234567".to_string(),
            title: "Cắt Đôi Nỗi Sầu Remix Karaoke".to_string(),
            artists: vec![ModelArtist {
                name: "Tăng Duy Tân".to_string(),
                id: None,
            }],
            album: None,
            duration: Some(195),
            duration_text: Some("3:15".to_string()),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail: None,
            explicit: false,
            share_link: "https://www.youtube.com/watch?v=kara1234567".to_string(),
            author: Some("Karaoke Beat".to_string()),
            source: Some("yt_video".to_string()),
        };
        assert_eq!(
            matcher.score_for_tier(&remix_vocal, &cand_karaoke_remix, MatchTier::Tier2YtVideo),
            0.0,
            "Expected Karaoke Remix to be rejected for vocal Remix query"
        );

        // Case B: User/Spotify intentionally requests a Beat Lofi track -> must keep and score high
        let explicit_beat = ImportedTrack {
            title: "Dối Lừa Beat Lofi".to_string(),
            artist: "Nguyễn Vĩ".to_string(),
            album: None,
            duration_ms: Some(240_000),
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let explicit_beat_score =
            matcher.score_for_tier(&explicit_beat, &cand_beat_lofi, MatchTier::Tier2YtVideo);
        assert!(
            explicit_beat_score >= 0.80,
            "Expected explicit beat request to score high, got {explicit_beat_score}"
        );

        // Vocal-First Search cleaning for Spotify tracks polluted with "(Beat Lofi)" or "Instrument"
        assert_eq!(
            TrackMatcher::clean_title_for_vocal_search("Dối Lừa (Beat Lofi)"),
            "Dối Lừa"
        );
        assert_eq!(
            TrackMatcher::clean_title_for_vocal_search("Nơi Này Có Anh (Instrumental)"),
            "Nơi Này Có Anh"
        );
        assert_eq!(
            TrackMatcher::clean_title_for_vocal_search("Hẹn Ước Từ Hư Vô - Instrument"),
            "Hẹn Ước Từ Hư Vô"
        );
        assert_eq!(
            TrackMatcher::clean_title_for_vocal_search("Heartbeat"),
            "Heartbeat"
        );

        let vocal_cleaned_track = ImportedTrack {
            title: TrackMatcher::clean_title_for_vocal_search(&explicit_beat.title),
            ..explicit_beat.clone()
        };
        assert_eq!(
            matcher.score_for_tier_with_mode(
                &vocal_cleaned_track,
                &cand_beat_lofi,
                MatchTier::Tier2YtVideo,
                false
            ),
            0.0,
            "Expected Pass 1 Vocal-First search to reject Beat Lofi even when Spotify metadata had 'Beat Lofi'"
        );
        assert!(
            matcher.score_for_tier_with_mode(
                &vocal_cleaned_track,
                &cand_official_lyrics,
                MatchTier::Tier2YtVideo,
                false
            ) >= 0.80,
            "Expected Pass 1 Vocal-First search to pick official vocal track"
        );
    }

    #[tokio::test]
    async fn test_sapisidhash_stream_cache_and_cdn_thumbnails() {
        let cookie = "VISITOR_INFO1_LIVE=xyz; SAPISID=abc123def/456; __Secure-1PAPISID=p1_val; __Secure-3PAPISID=p3_val; SID=sid_token";
        let auth = InnerTube::sapisid_hash(cookie, "https://music.youtube.com")
            .expect("Expected SAPISIDHASH header");
        assert!(auth.contains("SAPISIDHASH "));
        assert!(auth.contains("SAPISID1PHASH "));
        assert!(auth.contains("SAPISID3PHASH "));

        let mut cookie_map = std::collections::HashMap::new();
        cookie_map.insert("SAPISID".to_string(), "abc123def/456".to_string());
        cookie_map.insert("SID".to_string(), "sid_token".to_string());
        assert!(youtube_webview::has_youtube_auth_cookies(&cookie_map));

        let client = Client::new();
        let inner = InnerTube::new(client);
        inner
            .set_auth(
                Some(cookie.to_string()),
                None,
                Some("0".to_string()),
                None,
                Some("CgtTestVisitorData".to_string()),
            )
            .await;
        assert!(inner.has_cookie().await);

        let dummy_playback = crate::models::PlaybackData {
            audio_config: None,
            video_details: None,
            playback_tracking: None,
            format: serde_json::json!({ "itag": 251, "mimeType": "audio/webm; codecs=\"opus\"" }),
            stream_url: "https://rr1---sn-test.googlevideo.com/videoplayback?rn=0".to_string(),
            original_stream_url: "https://rr1---sn-test.googlevideo.com/videoplayback?rn=0".to_string(),
            stream_expires_in_seconds: 21600,
            stream_client: "WEB_REMIX".to_string(),
            stream_headers: std::collections::HashMap::new(),
        };
        inner
            .put_cached_stream("bNp9pn0ni3I", "HIGH", &dummy_playback)
            .await;
        let hit = inner
            .get_cached_stream("bNp9pn0ni3I", "HIGH")
            .await
            .expect("Expected 2h stream cache hit");
        assert_eq!(hit.stream_client, "WEB_REMIX");

        // Verify DB rewrites googleusercontent thumbnails to i.ytimg.com/vi/<id>/mqdefault.jpg
        let tmp = std::env::temp_dir().join(format!("tay_music_thumb_test_{}.db", db::now_ms()));
        let db = MochyDatabase::open(&tmp).expect("open db");
        let polluted_song = serde_json::json!({
            "id": "bNp9pn0ni3I",
            "title": "Chúng Ta Của Hiện Tại",
            "artists": [{ "name": "Sơn Tùng M-TP", "id": null }],
            "duration": 302,
            "thumbnail": "https://lh3.googleusercontent.com/some-rate-limited-artwork=w544-h544"
        });
        db.upsert_song_value(&polluted_song).unwrap();
        let saved = db.get_song("bNp9pn0ni3I").unwrap().unwrap();
        assert_eq!(
            saved.thumbnail.as_deref(),
            Some("https://i.ytimg.com/vi/bNp9pn0ni3I/mqdefault.jpg")
        );
        drop(db);
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(tmp.with_extension("db-wal"));
        let _ = std::fs::remove_file(tmp.with_extension("db-shm"));
    }

    #[test]
    fn test_discord_rpc_sanitization_and_graceful_offline() {
        assert_eq!(discord_rpc::sanitize_discord_text("A", "Tày Music"), "A ");
        assert_eq!(discord_rpc::sanitize_discord_text("   ", "Tày Music"), "Tày Music");

        let long_vn = "Chúng Ta Của Hiện Tại Và Những Bản Nhạc Lofi Chill Buồn Rơi Nước Mắt Thâu Đêm Suốt Sáng Với Âm Thanh Tuyệt Đỉnh Vũ Trụ";
        let truncated = discord_rpc::sanitize_discord_text(long_vn, "Tày Music");
        assert!(truncated.len() <= 116);
        assert!(truncated.ends_with("..."));

        let manager = discord_rpc::DiscordRpcManager::new();
        let status = manager.current_status();
        assert!(!status.connected);
        manager.shutdown_sync();
    }

    #[tokio::test]
    async fn test_local_proxy_range_streaming() {
        let dir = std::env::temp_dir().join(format!("tay_music_local_proxy_{}", db::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let sample_bytes: Vec<u8> = (0..=255u8).cycle().take(4096).collect();
        std::fs::write(dir.join("dQw4w9WgXcQ.m4a"), &sample_bytes).unwrap();
        std::fs::write(dir.join("dQw4w9WgXcQ.jpg"), vec![0xFFu8; 600]).unwrap();

        let dir_handle = Arc::new(tokio::sync::RwLock::new(dir.clone()));
        let client = Client::new();
        let proxy = LocalStreamProxy::start_with_downloads(client.clone(), dir_handle)
            .await
            .expect("start local proxy");

        let audio_url = proxy.get_local_audio_url("dQw4w9WgXcQ");
        let res = client
            .get(&audio_url)
            .header("Range", "bytes=100-611")
            .send()
            .await
            .expect("local range fetch");
        assert_eq!(res.status().as_u16(), 206);
        assert_eq!(
            res.headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok()),
            Some("bytes 100-611/4096")
        );
        let chunk = res.bytes().await.unwrap();
        assert_eq!(chunk.len(), 512);
        assert_eq!(&chunk[..], &sample_bytes[100..612]);

        let cover_res = client
            .get(proxy.get_local_cover_url("dQw4w9WgXcQ"))
            .send()
            .await
            .expect("local cover fetch");
        assert_eq!(cover_res.status().as_u16(), 200);
        assert_eq!(cover_res.bytes().await.unwrap().len(), 600);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_safe_move_file_and_downloads_index() {
        let dir_a = std::env::temp_dir().join(format!("tay_move_a_{}", db::now_ms()));
        let dir_b = std::env::temp_dir().join(format!("tay_move_b_{}", db::now_ms()));
        std::fs::create_dir_all(&dir_a).unwrap();

        let src = dir_a.join("abc123def45.m4a");
        let dst = dir_b.join("abc123def45.m4a");
        std::fs::write(&src, b"local audio payload test").unwrap();

        downloader::DownloadManager::safe_move_file(&src, &dst).expect("safe move");
        assert!(!src.exists());
        assert!(dst.is_file());
        assert_eq!(std::fs::read(&dst).unwrap(), b"local audio payload test");

        let _ = std::fs::remove_dir_all(&dir_a);
        let _ = std::fs::remove_dir_all(&dir_b);
    }

    #[test]
    fn test_backup_export_import_roundtrip() {
        let now = db::now_ms();
        let tmp1 = std::env::temp_dir().join(format!("tay_bkp1_{now}.db"));
        let tmp2 = std::env::temp_dir().join(format!("tay_bkp2_{now}.db"));

        let db1 = MochyDatabase::open(&tmp1).unwrap();
        let song = serde_json::json!({
            "id": "bNp9pn0ni3I",
            "title": "Chúng Ta Của Hiện Tại",
            "artists": [{ "name": "Sơn Tùng M-TP", "id": null }],
            "duration": 302
        });
        db1.upsert_song_value(&song).unwrap();
        db1.set_liked("bNp9pn0ni3I", true, None).unwrap();
        let pl = db1.create_playlist("Nhạc Offline", Some("test"), None, None).unwrap();
        db1.add_song_to_playlist(&pl.id, "bNp9pn0ni3I", None).unwrap();

        let backup = db1
            .export_backup_json(Some(serde_json::json!({ "autoplayEnabled": false })))
            .expect("export backup");

        let db2 = MochyDatabase::open(&tmp2).unwrap();
        let res = db2.import_backup_json(&backup).expect("import backup");
        assert_eq!(res.songs_restored, 1);
        assert_eq!(res.liked_restored, 1);
        assert_eq!(res.playlists_restored, 1);
        assert!(db2.is_liked("bNp9pn0ni3I").unwrap());
        let pls2 = db2.get_playlists().unwrap();
        assert_eq!(pls2.len(), 1);
        assert_eq!(pls2[0].name, "Nhạc Offline");

        drop(db1);
        drop(db2);
        for t in [&tmp1, &tmp2] {
            let _ = std::fs::remove_file(t);
            let _ = std::fs::remove_file(t.with_extension("db-wal"));
            let _ = std::fs::remove_file(t.with_extension("db-shm"));
        }
    }

    #[tokio::test]
    async fn test_offline_local_lyrics_read() {
        let dir = std::env::temp_dir().join(format!("tay_lrc_test_{}", db::now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        let lrc_content = "[00:01.50] Never gonna give you up\n[00:05.00] Never gonna let you down\n";
        std::fs::write(dir.join("dQw4w9WgXcQ.lrc"), lrc_content).unwrap();

        let dm = downloader::DownloadManager::new(dir.clone());
        let raw = dm
            .read_local_lyrics("dQw4w9WgXcQ")
            .await
            .expect("expected local .lrc content offline");
        let parsed = lyrics::LyricsUtils::parse_lyrics(&raw);

        assert!(parsed.is_synced);
        assert_eq!(parsed.lines.len(), 2);
        assert_eq!(parsed.lines[0].time, 1500);
        assert_eq!(parsed.lines[0].text, "Never gonna give you up");
        assert_eq!(parsed.lines[1].time, 5000);
        assert_eq!(parsed.lines[1].text, "Never gonna let you down");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
