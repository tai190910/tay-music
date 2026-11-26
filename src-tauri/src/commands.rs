use crate::innertube::{InnerTube, YTPlayerUtils, YouTube};
use crate::lyrics::LyricsHelper;
use crate::models::{
    AutoSyncSettings, CandidateResult, DbHistoryEvent, DbLyricsCache, DbPlaylist, DbSong,
    ImportResult, LyricsResult, ParsedImport, PlaybackData, PlaylistPageResult,
    SongItem, SpotifyAccountInfo, SpotifyRemotePlaylist, TrackCandidateQuery,
};
use crate::proxy::LocalStreamProxy;
use crate::soundcloud;
use crate::spotify_webview;
use crate::importer::{MusicImportService, SpotifyClient, TrackMatcher};
use crate::db::MochyDatabase;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<MochyDatabase>,
    pub inner_tube: Arc<InnerTube>,
    pub http_client: Client,
    pub stream_proxy: LocalStreamProxy,
    pub importer: Arc<MusicImportService>,
}

#[tauri::command]
pub async fn youtube_search(state: State<'_, AppState>, query: String) -> Result<Value, String> {
    match YouTube::search(&state.inner_tube, &query, None).await {
        Ok(res) => Ok(serde_json::to_value(res).unwrap_or_else(|_| json!({ "items": [] }))),
        Err(err) => {
            log::error!("[IPC] youtube_search error: {err}");
            Ok(json!({ "songs": [], "albums": [], "playlists": [], "artists": [], "items": [] }))
        }
    }
}

fn rank_vocal_priority(query_norm: &str, items: &mut Vec<SongItem>) {
    if items.len() <= 1 || query_norm.is_empty() {
        return;
    }
    let q_padded = format!(" {query_norm} ");
    let mut scored: Vec<(i32, usize, SongItem)> = items
        .drain(..)
        .enumerate()
        .map(|(idx, item)| {
            let mut bonus: i32 = 0;
            let title_norm = TrackMatcher::normalize_text(&item.title);
            let padded = format!(" {title_norm} ");
            if padded.contains(" official ") {
                bonus += 3;
            }
            if padded.contains(" audio ")
                || padded.contains(" lyrics ")
                || padded.contains(" lyric ")
                || padded.contains(" loi bai hat ")
                || title_norm.contains("歌词")
            {
                bonus += 2;
            }
            let artist_matched = item
                .artists
                .iter()
                .map(|a| a.name.as_str())
                .chain(item.author.as_deref())
                .any(|raw| {
                    let anorm = TrackMatcher::normalize_text(raw);
                    !anorm.is_empty()
                        && (q_padded.contains(&format!(" {anorm} "))
                            || anorm
                                .split_whitespace()
                                .any(|tok| tok.chars().count() >= 2 && q_padded.contains(&format!(" {tok} "))))
                });
            if artist_matched {
                bonus += 2;
            }
            (bonus - (idx as i32), idx, item)
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    *items = scored.into_iter().map(|(_, _, it)| it).collect();
}

#[tauri::command]
pub async fn youtube_search_songs(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SongItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let query_wants_instrumental = TrackMatcher::has_instrumental_intent(trimmed);
    let query_norm = TrackMatcher::normalize_text(trimmed);

    let (ytm_res, ytv_res) = tokio::join!(
        YouTube::search_songs(&state.inner_tube, trimmed),
        YouTube::search_youtube_videos(&state.inner_tube, trimmed)
    );

    let mut ytm_songs = ytm_res.unwrap_or_else(|err| {
        log::error!("[IPC] youtube_search_songs (YTM) error: {err}");
        vec![]
    });
    let ytv_raw = ytv_res.unwrap_or_else(|err| {
        log::warn!("[IPC] youtube_search_songs (YT Video) error: {err}");
        vec![]
    });

    let q_lower = trimmed.to_lowercase();
    let allow_long = q_lower.contains("mix")
        || q_lower.contains("nonstop")
        || q_lower.contains("hour")
        || q_lower.contains("compilation")
        || trimmed.contains("串烧")
        || trimmed.contains("连播");

    let mut ytv_filtered: Vec<SongItem> = ytv_raw
        .into_iter()
        .filter(|v| allow_long || v.duration.unwrap_or(0) <= 720)
        .collect();

    let raw_ytm_backup = if query_wants_instrumental {
        Vec::new()
    } else {
        ytm_songs.clone()
    };
    let raw_ytv_backup = if query_wants_instrumental {
        Vec::new()
    } else {
        ytv_filtered.clone()
    };

    if !query_wants_instrumental {
        ytm_songs.retain(|s| !TrackMatcher::is_instrumental_candidate(s, ""));
        ytv_filtered.retain(|s| !TrackMatcher::is_instrumental_candidate(s, ""));
        rank_vocal_priority(&query_norm, &mut ytv_filtered);
    }

    let is_remix_or_cover_query = [
        "remix",
        "dj",
        "cover",
        "slowed",
        "sped up",
        "speed up",
        "nightcore",
        "bootleg",
        "mashup",
        "vinahouse",
        "vip",
        "tiktok",
        "douyin",
        "版",
        "慢摇",
        "翻唱",
        "电音",
    ]
    .iter()
    .any(|kw| q_lower.contains(kw) || trimmed.contains(kw));

    let mut merged = Vec::new();
    let mut seen = HashSet::new();

    fn push_unique_songs(
        merged: &mut Vec<SongItem>,
        seen: &mut HashSet<String>,
        list: Vec<SongItem>,
    ) {
        for item in list {
            if merged.len() >= 20 {
                break;
            }
            if !item.id.is_empty() && seen.insert(item.id.clone()) {
                merged.push(item);
            }
        }
    }

    if is_remix_or_cover_query {
        let mut ytm_iter = ytm_songs.into_iter();
        let mut ytv_iter = ytv_filtered.into_iter();
        push_unique_songs(&mut merged, &mut seen, ytm_iter.by_ref().take(3).collect());
        if merged.len() < 20 {
            push_unique_songs(&mut merged, &mut seen, ytv_iter.by_ref().take(5).collect());
        }
        if merged.len() < 20 {
            push_unique_songs(&mut merged, &mut seen, ytm_iter.collect());
        }
        if merged.len() < 20 {
            push_unique_songs(&mut merged, &mut seen, ytv_iter.collect());
        }
    } else {
        push_unique_songs(&mut merged, &mut seen, ytm_songs);
        if merged.len() < 20 {
            push_unique_songs(&mut merged, &mut seen, ytv_filtered);
        }
    }

    let wants_sc = q_lower.contains("soundcloud")
        || q_lower.contains("remix")
        || q_lower.contains("dj")
        || q_lower.contains("bootleg");
    if (merged.len() < 4 || (wants_sc && merged.len() < 8)) && merged.len() < 20 {
        match soundcloud::search_tracks(&state.http_client, trimmed, 5).await {
            Ok(mut sc_tracks) => {
                if !query_wants_instrumental {
                    sc_tracks.retain(|s| !TrackMatcher::is_instrumental_candidate(s, ""));
                }
                push_unique_songs(&mut merged, &mut seen, sc_tracks);
            }
            Err(err) => log::warn!("[IPC] SoundCloud search fallback error: {err}"),
        }
    }

    if merged.is_empty() && !query_wants_instrumental {
        push_unique_songs(&mut merged, &mut seen, raw_ytm_backup);
        if merged.len() < 20 {
            push_unique_songs(&mut merged, &mut seen, raw_ytv_backup);
        }
    }

    Ok(merged)
}

#[tauri::command]
pub async fn youtube_get_stream(
    state: State<'_, AppState>,
    video_id: String,
    quality: Option<String>,
) -> Result<PlaybackData, String> {
    let vid = video_id.trim().to_string();
    if soundcloud::is_soundcloud_id(&vid) {
        return soundcloud::resolve_playback_data(&state.http_client, &vid, &state.stream_proxy)
            .await;
    }

    if vid.is_empty() || vid == "undefined" || vid.len() != 11 {
        return Err(format!("Invalid 11-character videoId: \"{video_id}\""));
    }

    let q = quality.as_deref().unwrap_or("HIGH");
    let mut playback = YTPlayerUtils::resolve_playback_data(&state.inner_tube, &vid, q).await?;

    let clen = YTPlayerUtils::parse_content_length(&playback.format);
    let mime = playback.format.get("mimeType").and_then(|v| v.as_str());
    let proxied_url = state.stream_proxy.get_proxy_url(
        &playback.original_stream_url,
        &playback.stream_client,
        clen,
        mime,
    );
    playback.stream_url = proxied_url;

    Ok(playback)
}

#[tauri::command]
pub async fn youtube_get_lyrics(
    state: State<'_, AppState>,
    title: String,
    artist: Option<String>,
    duration: Option<f64>,
    video_id: Option<String>,
) -> Result<Option<LyricsResult>, String> {
    Ok(LyricsHelper::get_lyrics(
        &state.http_client,
        &title,
        artist.as_deref().unwrap_or(""),
        duration,
        video_id.as_deref(),
    )
    .await)
}

#[tauri::command]
pub async fn youtube_get_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Option<PlaylistPageResult>, String> {
    match YouTube::get_playlist(&state.inner_tube, &playlist_id).await {
        Ok(res) => Ok(Some(res)),
        Err(err) => {
            log::error!("[IPC] youtube_get_playlist error: {err}");
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn youtube_get_track_candidates(
    state: State<'_, AppState>,
    query: TrackCandidateQuery,
) -> Result<Vec<CandidateResult>, String> {
    let matcher = TrackMatcher::new();
    let duration_ms = query.duration.map(|d| (d * 1000.0).round() as i64);
    Ok(matcher
        .get_candidates(&state.inner_tube, &query.title, &query.artist, duration_ms)
        .await)
}

// ==================== DATABASE COMMANDS ====================

#[tauri::command]
pub fn db_upsert_song(state: State<'_, AppState>, song: Value) -> Result<bool, String> {
    state.db.upsert_song_value(&song)?;
    Ok(true)
}

#[tauri::command]
pub fn db_get_song(state: State<'_, AppState>, id: String) -> Result<Option<DbSong>, String> {
    state.db.get_song(&id)
}

#[tauri::command]
pub fn db_is_liked(state: State<'_, AppState>, song_id: String) -> Result<bool, String> {
    state.db.is_liked(&song_id)
}

#[tauri::command]
pub fn db_set_liked(
    state: State<'_, AppState>,
    song_id: String,
    liked: bool,
    metadata: Option<Value>,
) -> Result<bool, String> {
    state.db.set_liked(&song_id, liked, metadata.as_ref())
}

#[tauri::command]
pub fn db_toggle_like(
    state: State<'_, AppState>,
    song_id: String,
    metadata: Option<Value>,
) -> Result<bool, String> {
    state.db.toggle_like(&song_id, metadata.as_ref())
}

#[tauri::command]
pub fn db_get_liked_songs(state: State<'_, AppState>) -> Result<Vec<DbSong>, String> {
    state.db.get_liked_songs()
}

#[tauri::command]
pub fn db_add_history(
    state: State<'_, AppState>,
    song_id: String,
    play_time_sec: Option<i64>,
    metadata: Option<Value>,
) -> Result<bool, String> {
    state
        .db
        .add_history(&song_id, play_time_sec.unwrap_or(0), metadata.as_ref())?;
    Ok(true)
}

#[tauri::command]
pub fn db_get_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<DbHistoryEvent>, String> {
    state
        .db
        .get_history(limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub fn db_clear_history(state: State<'_, AppState>) -> Result<bool, String> {
    state.db.clear_history()?;
    Ok(true)
}

#[tauri::command]
pub fn db_create_playlist(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    thumbnail_url: Option<String>,
) -> Result<DbPlaylist, String> {
    state.db.create_playlist(
        &name,
        description.as_deref(),
        thumbnail_url.as_deref(),
        None,
    )
}

#[tauri::command]
pub fn db_get_playlists(state: State<'_, AppState>) -> Result<Vec<DbPlaylist>, String> {
    state.db.get_playlists()
}

#[tauri::command]
pub fn db_get_playlist(state: State<'_, AppState>, id: String) -> Result<Option<DbPlaylist>, String> {
    state.db.get_playlist(&id)
}

#[tauri::command]
pub fn db_delete_playlist(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.db.delete_playlist(&id)
}

#[tauri::command]
pub fn db_add_song_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    song_id: String,
    metadata: Option<Value>,
) -> Result<bool, String> {
    state
        .db
        .add_song_to_playlist(&playlist_id, &song_id, metadata.as_ref())
}

#[tauri::command]
pub fn db_remove_song_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    song_id: String,
) -> Result<bool, String> {
    state.db.remove_song_from_playlist(&playlist_id, &song_id)
}

#[tauri::command]
pub fn db_get_playlist_songs(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<DbSong>, String> {
    state.db.get_playlist_songs(&playlist_id)
}

#[tauri::command]
pub fn db_replace_playlist_song(
    state: State<'_, AppState>,
    playlist_id: String,
    old_song_id: String,
    new_song: Value,
) -> Result<bool, String> {
    state
        .db
        .replace_song_in_playlist(&playlist_id, &old_song_id, &new_song)
}

#[tauri::command]
pub fn db_get_cached_lyrics(
    state: State<'_, AppState>,
    song_id: String,
) -> Result<Option<DbLyricsCache>, String> {
    state.db.get_cached_lyrics(&song_id)
}

#[tauri::command]
pub fn db_cache_lyrics(
    state: State<'_, AppState>,
    song_id: String,
    lyrics: String,
    provider: String,
) -> Result<bool, String> {
    state.db.cache_lyrics(&song_id, &lyrics, &provider)?;
    Ok(true)
}

// ==================== SPOTIFY COMMANDS ====================

#[tauri::command]
pub async fn spotify_open_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<SpotifyAccountInfo>, String> {
    spotify_webview::open_login(&app, &state.http_client, &state.db).await
}

#[tauri::command]
pub fn spotify_get_account(
    state: State<'_, AppState>,
) -> Result<Option<SpotifyAccountInfo>, String> {
    let raw = state.db.get_setting("spotify_account_info")?;
    let Some(json_str) = raw else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<SpotifyAccountInfo>(&json_str).ok())
}

#[tauri::command]
pub async fn spotify_logout(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    spotify_webview::logout(&app, &state.db).await
}

#[tauri::command]
pub async fn spotify_parse_link(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<ParsedImport, String> {
    let token = spotify_webview::get_valid_token(&app, &state.db).await;
    let app_clone = app.clone();
    SpotifyClient::parse_public_link(
        &state.http_client,
        &url,
        token.as_deref(),
        Some(move |playlist_id: String| async move {
            spotify_webview::scrape_full_public_playlist(&app_clone, &playlist_id).await
        }),
    )
    .await
}

#[tauri::command]
pub async fn spotify_get_user_playlists(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<SpotifyRemotePlaylist>, String> {
    let token = spotify_webview::get_valid_token(&app, &state.db)
        .await
        .ok_or_else(|| "Chưa đăng nhập Spotify hoặc phiên đăng nhập đã hết hạn.".to_string())?;
    SpotifyClient::get_user_playlists(&state.http_client, &token).await
}

#[tauri::command]
pub async fn spotify_import_parsed(
    app: AppHandle,
    state: State<'_, AppState>,
    parsed: ParsedImport,
) -> Result<ImportResult, String> {
    state
        .importer
        .import_from_parsed(&state.db, &state.inner_tube, parsed, |progress| {
            let _ = app.emit("spotify:importProgress", &progress);
        })
        .await
}

#[tauri::command]
pub async fn spotify_import_remote(
    app: AppHandle,
    state: State<'_, AppState>,
    remote: SpotifyRemotePlaylist,
) -> Result<ImportResult, String> {
    let token = spotify_webview::get_valid_token(&app, &state.db)
        .await
        .ok_or_else(|| "Chưa đăng nhập Spotify hoặc phiên đăng nhập đã hết hạn.".to_string())?;
    state
        .importer
        .import_from_spotify_remote(&state.db, &state.inner_tube, &token, remote, |progress| {
            let _ = app.emit("spotify:importProgress", &progress);
        })
        .await
}

#[tauri::command]
pub fn spotify_cancel_import(state: State<'_, AppState>) -> Result<bool, String> {
    state.importer.cancel();
    Ok(true)
}

#[tauri::command]
pub fn spotify_get_auto_sync(state: State<'_, AppState>) -> Result<AutoSyncSettings, String> {
    let enabled = state.db.get_setting("spotify_auto_sync")?.as_deref() == Some("true");
    let raw_pls = state
        .db
        .get_setting("spotify_sync_playlists")?
        .unwrap_or_else(|| "[]".to_string());
    let playlist_ids: Vec<String> = serde_json::from_str(&raw_pls).unwrap_or_default();
    Ok(AutoSyncSettings {
        enabled,
        playlist_ids,
    })
}

#[tauri::command]
pub fn spotify_set_auto_sync(
    state: State<'_, AppState>,
    enabled: bool,
    playlist_ids: Option<Vec<String>>,
) -> Result<bool, String> {
    state
        .db
        .set_setting("spotify_auto_sync", if enabled { "true" } else { "false" })?;
    if let Some(ids) = playlist_ids {
        let json_ids = serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string());
        state.db.set_setting("spotify_sync_playlists", &json_ids)?;
    }
    Ok(true)
}
