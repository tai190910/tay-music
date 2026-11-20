use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub name: String,
    #[serde(default)]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub name: String,
    #[serde(default)]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongItem {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub artists: Vec<Artist>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<Album>,
    pub duration: Option<i64>,
    pub duration_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub music_video_type: Option<String>,
    pub is_video_song: bool,
    pub thumbnail: Option<String>,
    pub explicit: bool,
    pub share_link: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub items: Vec<Value>,
    pub continuation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistPageResult {
    pub playlist: Value,
    pub songs: Vec<SongItem>,
    pub continuation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_config: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_details: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playback_tracking: Option<Value>,
    pub format: Value,
    pub stream_url: String,
    pub original_stream_url: String,
    pub stream_expires_in_seconds: i64,
    pub stream_client: String,
    pub stream_headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSong {
    pub id: String,
    pub title: String,
    pub artists: Vec<Artist>,
    pub duration: i64,
    pub thumbnail_url: Option<String>,
    pub thumbnail: Option<String>,
    pub album_id: Option<String>,
    pub album_name: Option<String>,
    pub explicit: bool,
    pub year: Option<i64>,
    pub liked: bool,
    pub liked_date: Option<i64>,
    pub total_play_time: i64,
    pub in_library: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbPlaylist {
    pub id: String,
    pub name: String,
    pub browse_id: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_editable: bool,
    pub song_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbHistoryEvent {
    pub id: i64,
    pub song_id: String,
    pub timestamp: i64,
    pub play_time: i64,
    pub song: Option<DbSong>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbLyricsCache {
    pub song_id: String,
    pub lyrics: String,
    pub provider: String,
    pub cached_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordTimestamp {
    pub text: String,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsEntry {
    pub time: i64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<WordTimestamp>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_background: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedLyrics {
    pub lines: Vec<LyricsEntry>,
    pub is_synced: bool,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub provider: String,
    pub lyrics: String,
    pub parsed: ParsedLyrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTrack {
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub source_id: Option<String>,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
    #[serde(default)]
    pub added_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedImport {
    #[serde(rename = "type")]
    pub import_type: String,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
    pub tracks: Vec<ImportedTrack>,
    pub total: usize,
    #[serde(default)]
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyAccountInfo {
    pub id: String,
    pub display_name: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub photo_url: Option<String>,
    #[serde(default)]
    pub sp_dc: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyRemotePlaylist {
    pub id: String,
    pub name: String,
    pub track_count: i64,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub is_liked: Option<bool>,
    #[serde(default)]
    pub owner_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: String,
    pub total: usize,
    pub current: usize,
    pub matched: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_track: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub matched: usize,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSyncSettings {
    pub enabled: bool,
    pub playlist_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackCandidateQuery {
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateResult {
    pub song: SongItem,
    pub score: f64,
}
