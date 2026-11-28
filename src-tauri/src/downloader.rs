use crate::db::{now_ms, MochyDatabase};
use crate::innertube::{InnerTube, YTPlayerUtils, USER_AGENT_WEB};
use crate::lyrics::LyricsHelper;
use crate::models::{DownloadProgressEvent, DownloadedTrack, LyricsResult, PlaybackData, StorageInfo};
use crate::proxy::{safe_track_stem, with_rn_param, LocalStreamProxy};
use crate::soundcloud;
use regex::Regex;
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::{RwLock, Semaphore};
use tokio::time::{sleep, Duration};
use url::Url;

pub const INDEX_FILE_NAME: &str = "downloads_index.json";
const MAX_CONCURRENT_DOWNLOADS: usize = 2;
const CHUNK_SIZE: u64 = 512 * 1024; // 512 KB

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDownloadEntry {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub duration: Option<i64>,
    pub file_name: String,
    pub mime_type: String,
    #[serde(default)]
    pub cover_file: Option<String>,
    #[serde(default)]
    pub lyrics_file: Option<String>,
    pub file_size: u64,
    pub downloaded_at: i64,
    #[serde(default)]
    pub source_thumbnail: Option<String>,
}

struct ActiveCancelGuard {
    video_id: String,
    flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Drop for ActiveCancelGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = self.flags.lock() {
            map.remove(&self.video_id);
        }
    }
}

pub struct DownloadManager {
    downloads_dir: Arc<RwLock<PathBuf>>,
    index: Arc<RwLock<HashMap<String, StoredDownloadEntry>>>,
    semaphore: Arc<Semaphore>,
    cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl DownloadManager {
    pub fn new(initial_dir: PathBuf) -> Self {
        if !initial_dir.exists() {
            let _ = std::fs::create_dir_all(&initial_dir);
        }
        let initial_index = Self::load_index_from_disk(&initial_dir);
        Self {
            downloads_dir: Arc::new(RwLock::new(initial_dir)),
            index: Arc::new(RwLock::new(initial_index)),
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_DOWNLOADS)),
            cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn downloads_dir_handle(&self) -> Arc<RwLock<PathBuf>> {
        self.downloads_dir.clone()
    }

    fn load_index_from_disk(dir: &Path) -> HashMap<String, StoredDownloadEntry> {
        let index_path = dir.join(INDEX_FILE_NAME);
        let Ok(raw) = std::fs::read_to_string(&index_path) else {
            return HashMap::new();
        };
        let Ok(list) = serde_json::from_str::<Vec<StoredDownloadEntry>>(&raw) else {
            return HashMap::new();
        };
        let mut map = HashMap::new();
        for mut entry in list {
            if dir.join(&entry.file_name).is_file() {
                if let Some(ref cf) = entry.cover_file {
                    if !dir.join(cf).is_file() {
                        entry.cover_file = None;
                    }
                }
                if let Some(ref lf) = entry.lyrics_file {
                    if !dir.join(lf).is_file() {
                        entry.lyrics_file = None;
                    }
                }
                map.insert(entry.video_id.clone(), entry);
            }
        }
        map
    }

    pub fn write_index_to_disk(
        dir: &Path,
        entries: &HashMap<String, StoredDownloadEntry>,
    ) -> Result<(), String> {
        if !dir.exists() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let mut list: Vec<&StoredDownloadEntry> = entries.values().collect();
        list.sort_by(|a, b| b.downloaded_at.cmp(&a.downloaded_at));
        let json_str = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
        let index_path = dir.join(INDEX_FILE_NAME);
        let tmp_path = dir.join(format!("{INDEX_FILE_NAME}.tmp"));
        std::fs::write(&tmp_path, json_str.as_bytes()).map_err(|e| e.to_string())?;
        if index_path.exists() {
            let _ = std::fs::remove_file(&index_path);
        }
        std::fs::rename(&tmp_path, &index_path).map_err(|e| {
            let _ = std::fs::remove_file(&tmp_path);
            e.to_string()
        })
    }

    /// Safely move a file across same or different drives on Windows:
    /// try `std::fs::rename` first; on cross-device error, copy -> verify size -> remove source.
    pub fn safe_move_file(src: &Path, dst: &Path) -> Result<(), String> {
        if src == dst {
            return Ok(());
        }
        if let Some(parent) = dst.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
        }
        if std::fs::rename(src, dst).is_ok() {
            return Ok(());
        }

        let expected_size = std::fs::metadata(src)
            .map_err(|e| format!("Không thể đọc file nguồn '{}': {e}", src.display()))?
            .len();
        let copied = std::fs::copy(src, dst)
            .map_err(|e| format!("Không thể sao chép '{}': {e}", src.display()))?;
        let dst_size = std::fs::metadata(dst)
            .map_err(|e| format!("Không thể kiểm tra file đích '{}': {e}", dst.display()))?
            .len();

        if copied != expected_size || dst_size != expected_size {
            let _ = std::fs::remove_file(dst);
            return Err(format!(
                "Kích thước file sau khi sao chép không khớp ({dst_size} != {expected_size})"
            ));
        }

        std::fs::remove_file(src)
            .map_err(|e| format!("Đã chép xong nhưng không thể xóa file cũ '{}': {e}", src.display()))?;
        Ok(())
    }

    fn emit_progress(
        app: &AppHandle,
        video_id: &str,
        percent: u8,
        status: &str,
        error: Option<String>,
    ) {
        let _ = app.emit(
            "download-progress",
            DownloadProgressEvent {
                video_id: video_id.to_string(),
                percent,
                status: status.to_string(),
                error,
            },
        );
    }

    fn ext_and_mime_from_format(format: &Value) -> (&'static str, &'static str) {
        let mime = format
            .get("mimeType")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        if mime.contains("mpeg") || mime.contains("mp3") {
            ("mp3", "audio/mpeg")
        } else if mime.contains("mp4") || mime.contains("m4a") || mime.contains("aac") {
            ("m4a", "audio/mp4")
        } else {
            ("webm", "audio/webm")
        }
    }

    fn to_public_track(
        entry: &StoredDownloadEntry,
        proxy: &LocalStreamProxy,
    ) -> DownloadedTrack {
        let local_cover_url = entry
            .cover_file
            .as_ref()
            .map(|_| proxy.get_local_cover_url(&entry.video_id));
        DownloadedTrack {
            video_id: entry.video_id.clone(),
            title: entry.title.clone(),
            artist: entry.artist.clone(),
            duration: entry.duration,
            file_name: entry.file_name.clone(),
            mime_type: entry.mime_type.clone(),
            cover_file: entry.cover_file.clone(),
            lyrics_file: entry.lyrics_file.clone(),
            file_size: entry.file_size,
            downloaded_at: entry.downloaded_at,
            local_stream_url: proxy.get_local_audio_url(&entry.video_id),
            local_cover_url,
            source_thumbnail: entry.source_thumbnail.clone(),
        }
    }

    async fn fetch_hls_to_file(
        client: &Client,
        m3u8_url: &str,
        part_path: &Path,
        cancel_flag: &AtomicBool,
        app: &AppHandle,
        video_id: &str,
    ) -> Result<u64, String> {
        let res = client
            .get(m3u8_url)
            .header(header::USER_AGENT, USER_AGENT_WEB)
            .header(header::ACCEPT, "*/*")
            .send()
            .await
            .map_err(|e| format!("Không thể tải playlist HLS: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("HLS playlist HTTP {}", res.status()));
        }
        let playlist_text = res.text().await.map_err(|e| e.to_string())?;
        let base_url = Url::parse(m3u8_url).ok();

        let mut segment_urls = Vec::new();
        for raw_line in playlist_text.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if line.starts_with("http://") || line.starts_with("https://") {
                segment_urls.push(line.to_string());
            } else if let Some(ref base) = base_url {
                if let Ok(joined) = base.join(line) {
                    segment_urls.push(joined.to_string());
                }
            }
        }
        if segment_urls.is_empty() {
            return Err("Không tìm thấy phân đoạn âm thanh HLS nào".to_string());
        }

        let mut file = tokio::fs::File::create(part_path)
            .await
            .map_err(|e| format!("Không tạo được file tạm: {e}"))?;
        let total = segment_urls.len();
        let mut total_bytes = 0u64;
        let mut last_pct = 2u8;

        for (idx, seg_url) in segment_urls.iter().enumerate() {
            if cancel_flag.load(Ordering::SeqCst) {
                drop(file);
                let _ = tokio::fs::remove_file(part_path).await;
                return Err("__CANCELLED__".to_string());
            }
            let seg_res = client
                .get(seg_url)
                .header(header::USER_AGENT, USER_AGENT_WEB)
                .header(header::ACCEPT, "*/*")
                .send()
                .await
                .map_err(|e| format!("Lỗi tải segment HLS: {e}"))?;
            if !seg_res.status().is_success() {
                return Err(format!("Segment HLS HTTP {}", seg_res.status()));
            }
            let bytes = seg_res.bytes().await.map_err(|e| e.to_string())?;
            file.write_all(&bytes)
                .await
                .map_err(|e| format!("Lỗi ghi file tạm: {e}"))?;
            total_bytes += bytes.len() as u64;

            let pct = (2 + ((idx + 1) * 88 / total)).min(90) as u8;
            if pct >= last_pct + 2 || idx + 1 == total {
                last_pct = pct;
                Self::emit_progress(app, video_id, pct, "downloading", None);
            }
        }

        file.flush().await.map_err(|e| e.to_string())?;
        Ok(total_bytes)
    }

    async fn fetch_chunked_audio_to_file(
        client: &Client,
        playback: &PlaybackData,
        part_path: &Path,
        cancel_flag: &AtomicBool,
        app: &AppHandle,
        video_id: &str,
    ) -> Result<u64, String> {
        let mut total_length = YTPlayerUtils::parse_content_length(&playback.format).unwrap_or(0);
        if total_length == 0 {
            if let Ok(parsed) = Url::parse(&playback.original_stream_url) {
                if let Some(cl) = parsed
                    .query_pairs()
                    .find(|(k, _)| k == "clen")
                    .and_then(|(_, v)| v.parse::<u64>().ok())
                {
                    total_length = cl;
                }
            }
        }

        let build_req = |url: &str, range: Option<&str>| {
            let mut req = client.get(url);
            for (k, v) in &playback.stream_headers {
                req = req.header(k.as_str(), v.as_str());
            }
            if !playback.stream_headers.contains_key("User-Agent") {
                req = req.header(header::USER_AGENT, USER_AGENT_WEB);
            }
            req = req.header(header::ACCEPT_ENCODING, "identity");
            if let Some(r) = range {
                req = req.header(header::RANGE, r);
            }
            req
        };

        if total_length == 0 {
            let probe_url = with_rn_param(&playback.original_stream_url, 0);
            if let Ok(probe_res) = build_req(&probe_url, Some("bytes=0-1")).send().await {
                if let Some(cr) = probe_res
                    .headers()
                    .get(header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                {
                    if let Some(slash) = cr.rfind('/') {
                        if let Ok(len) = cr[slash + 1..].trim().parse::<u64>() {
                            total_length = len;
                        }
                    }
                }
            }
        }

        let mut file = tokio::fs::File::create(part_path)
            .await
            .map_err(|e| format!("Không tạo được file tạm: {e}"))?;

        if total_length == 0 {
            let direct_url = with_rn_param(&playback.original_stream_url, 0);
            let mut res = build_req(&direct_url, None)
                .send()
                .await
                .map_err(|e| format!("Không thể tải luồng âm thanh: {e}"))?;
            if !res.status().is_success() {
                return Err(format!("Máy chủ âm thanh phản hồi HTTP {}", res.status()));
            }
            let mut written = 0u64;
            while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
                if cancel_flag.load(Ordering::SeqCst) {
                    drop(file);
                    let _ = tokio::fs::remove_file(part_path).await;
                    return Err("__CANCELLED__".to_string());
                }
                file.write_all(&chunk).await.map_err(|e| e.to_string())?;
                written += chunk.len() as u64;
            }
            file.flush().await.map_err(|e| e.to_string())?;
            Self::emit_progress(app, video_id, 90, "downloading", None);
            return Ok(written);
        }

        let mut offset = 0u64;
        let mut rn = 0u64;
        let mut last_pct = 2u8;

        while offset < total_length {
            if cancel_flag.load(Ordering::SeqCst) {
                drop(file);
                let _ = tokio::fs::remove_file(part_path).await;
                return Err("__CANCELLED__".to_string());
            }

            let chunk_end = std::cmp::min(offset + CHUNK_SIZE - 1, total_length - 1);
            let range = format!("bytes={offset}-{chunk_end}");
            let chunk_url = with_rn_param(&playback.original_stream_url, rn);

            let mut chunk_bytes = None;
            let mut last_err = String::new();
            for attempt in 1..=3u64 {
                if cancel_flag.load(Ordering::SeqCst) {
                    drop(file);
                    let _ = tokio::fs::remove_file(part_path).await;
                    return Err("__CANCELLED__".to_string());
                }
                match build_req(&chunk_url, Some(&range)).send().await {
                    Ok(res) if res.status().is_success() || res.status().as_u16() == 206 => {
                        match res.bytes().await {
                            Ok(b) => {
                                chunk_bytes = Some(b);
                                break;
                            }
                            Err(e) => last_err = e.to_string(),
                        }
                    }
                    Ok(res) => last_err = format!("HTTP {}", res.status()),
                    Err(e) => last_err = e.to_string(),
                }
                if attempt < 3 {
                    sleep(Duration::from_millis(attempt * 350)).await;
                }
            }

            let Some(bytes) = chunk_bytes else {
                drop(file);
                let _ = tokio::fs::remove_file(part_path).await;
                return Err(format!("Tải đoạn âm thanh thất bại: {last_err}"));
            };

            if bytes.is_empty() {
                break;
            }

            file.write_all(&bytes)
                .await
                .map_err(|e| format!("Lỗi ghi file tạm: {e}"))?;
            offset += bytes.len() as u64;
            rn += 1;

            let pct = (2 + (offset.saturating_mul(88) / total_length)).min(90) as u8;
            if pct >= last_pct + 2 || offset >= total_length {
                last_pct = pct;
                Self::emit_progress(app, video_id, pct, "downloading", None);
            }
        }

        file.flush().await.map_err(|e| e.to_string())?;
        Ok(offset)
    }

    async fn download_cover_image(
        client: &Client,
        dir: &Path,
        stem: &str,
        vid: &str,
        thumbnail_url: Option<&str>,
    ) -> Option<String> {
        let mut urls = Vec::new();
        let is_yt_11 = vid.len() == 11
            && !soundcloud::is_soundcloud_id(vid)
            && !vid.starts_with("LP_")
            && !vid.starts_with("VL")
            && !vid.starts_with("UC");
        if is_yt_11 {
            urls.push(format!("https://i.ytimg.com/vi/{vid}/mqdefault.jpg"));
            urls.push(format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"));
        }
        if let Some(u) = thumbnail_url.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            if !u.contains("googleusercontent.com") && !urls.iter().any(|x| x == u) {
                urls.push(u.to_string());
            }
        }

        for url in urls {
            let Ok(res) = client
                .get(&url)
                .header(header::USER_AGENT, USER_AGENT_WEB)
                .send()
                .await
            else {
                continue;
            };
            if !res.status().is_success() {
                continue;
            }
            let Ok(bytes) = res.bytes().await else {
                continue;
            };
            if bytes.len() < 512 {
                continue;
            }
            let file_name = format!("{stem}.jpg");
            let dest = dir.join(&file_name);
            if tokio::fs::write(&dest, &bytes).await.is_ok() {
                return Some(file_name);
            }
        }
        None
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn download_track(
        &self,
        app: &AppHandle,
        db: &MochyDatabase,
        inner_tube: &InnerTube,
        http_client: &Client,
        proxy: &LocalStreamProxy,
        video_id: String,
        title: String,
        artist: String,
        thumbnail_url: Option<String>,
        duration: Option<i64>,
        lyrics_lrc: Option<String>,
        quality: Option<String>,
    ) -> Result<Option<DownloadedTrack>, String> {
        let vid = video_id.trim().to_string();
        let Some(stem) = safe_track_stem(&vid) else {
            return Err(format!("Mã bài hát không hợp lệ: {video_id}"));
        };

        let cancel_flag = Arc::new(AtomicBool::new(false));
        {
            let mut flags = self.cancel_flags.lock().map_err(|e| e.to_string())?;
            if flags.contains_key(&vid) {
                return Err("Bài hát này đang được tải xuống.".to_string());
            }
            flags.insert(vid.clone(), cancel_flag.clone());
        }
        let _guard = ActiveCancelGuard {
            video_id: vid.clone(),
            flags: self.cancel_flags.clone(),
        };

        Self::emit_progress(app, &vid, 0, "queued", None);

        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|e| format!("Không thể khởi tạo hàng đợi tải: {e}"))?;

        if cancel_flag.load(Ordering::SeqCst) {
            Self::emit_progress(app, &vid, 0, "cancelled", None);
            return Ok(None);
        }

        Self::emit_progress(app, &vid, 2, "downloading", None);

        let q = quality.as_deref().unwrap_or("HIGH");
        let playback = if soundcloud::is_soundcloud_id(&vid) {
            soundcloud::resolve_playback_data(http_client, &vid, proxy).await
        } else {
            YTPlayerUtils::resolve_playback_data(inner_tube, &vid, q).await
        };

        let playback = match playback {
            Ok(pb) => pb,
            Err(err) => {
                Self::emit_progress(app, &vid, 0, "error", Some(err.clone()));
                return Err(err);
            }
        };

        if cancel_flag.load(Ordering::SeqCst) {
            Self::emit_progress(app, &vid, 0, "cancelled", None);
            return Ok(None);
        }

        let dir = self.downloads_dir.read().await.clone();
        if !dir.exists() {
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        }

        let is_hls = playback
            .format
            .get("isHls")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let (ext, mime_type) = if is_hls {
            ("mp3", "audio/mpeg")
        } else {
            Self::ext_and_mime_from_format(&playback.format)
        };

        let audio_file_name = format!("{stem}.{ext}");
        let part_path = dir.join(format!("{audio_file_name}.part"));
        let final_audio_path = dir.join(&audio_file_name);

        // Remove older extension files if re-downloading in another codec
        for old_ext in ["m4a", "webm", "opus", "mp3", "mp4", "aac", "ogg"] {
            if old_ext != ext {
                let p = dir.join(format!("{stem}.{old_ext}"));
                if p.exists() {
                    let _ = tokio::fs::remove_file(p).await;
                }
            }
        }

        // Check passed/cached lyrics upfront and spawn online lyrics fetch in parallel with audio download
        let mut initial_lrc = lyrics_lrc.filter(|s| !s.trim().is_empty());
        if initial_lrc.is_none() {
            if let Ok(Some(cached)) = db.get_cached_lyrics(&vid) {
                if !cached.lyrics.trim().is_empty() {
                    initial_lrc = Some(cached.lyrics);
                }
            }
        }
        let lyrics_task: Option<tokio::task::JoinHandle<Option<LyricsResult>>> =
            if initial_lrc.is_none() {
                let lrc_client = http_client.clone();
                let lrc_title = title.clone();
                let lrc_artist = artist.clone();
                let lrc_vid = vid.clone();
                let lrc_dur = duration.map(|d| d as f64);
                Some(tokio::spawn(async move {
                    LyricsHelper::get_lyrics(
                        &lrc_client,
                        &lrc_title,
                        &lrc_artist,
                        lrc_dur,
                        Some(&lrc_vid),
                    )
                    .await
                }))
            } else {
                None
            };

        let dl_res = if is_hls {
            Self::fetch_hls_to_file(
                http_client,
                &playback.original_stream_url,
                &part_path,
                &cancel_flag,
                app,
                &vid,
            )
            .await
        } else {
            Self::fetch_chunked_audio_to_file(
                http_client,
                &playback,
                &part_path,
                &cancel_flag,
                app,
                &vid,
            )
            .await
        };

        let file_size = match dl_res {
            Ok(bytes) => bytes,
            Err(e) if e == "__CANCELLED__" => {
                if let Some(handle) = lyrics_task {
                    handle.abort();
                }
                let _ = tokio::fs::remove_file(&part_path).await;
                Self::emit_progress(app, &vid, 0, "cancelled", None);
                return Ok(None);
            }
            Err(err) => {
                if let Some(handle) = lyrics_task {
                    handle.abort();
                }
                let _ = tokio::fs::remove_file(&part_path).await;
                Self::emit_progress(app, &vid, 0, "error", Some(err.clone()));
                return Err(err);
            }
        };

        if final_audio_path.exists() {
            let _ = tokio::fs::remove_file(&final_audio_path).await;
        }
        tokio::fs::rename(&part_path, &final_audio_path)
            .await
            .map_err(|e| format!("Không thể hoàn tất lưu file âm thanh: {e}"))?;

        Self::emit_progress(app, &vid, 94, "downloading", None);

        // Await cover artwork and parallel lyrics fetch concurrently
        let (cover_file, fetched_lyrics_opt) = tokio::join!(
            Self::download_cover_image(
                http_client,
                &dir,
                &stem,
                &vid,
                thumbnail_url.as_deref(),
            ),
            async {
                if let Some(handle) = lyrics_task {
                    handle.await.ok().flatten()
                } else {
                    None
                }
            }
        );

        let mut effective_lrc = initial_lrc;
        if effective_lrc.is_none() {
            if let Some(fetched) = fetched_lyrics_opt {
                if !fetched.lyrics.trim().is_empty() {
                    let _ = db.cache_lyrics(&vid, &fetched.lyrics, &fetched.provider);
                    effective_lrc = Some(fetched.lyrics);
                }
            }
        }

        let lyrics_file = if let Some(ref lrc_text) = effective_lrc {
            let lf = format!("{stem}.lrc");
            if tokio::fs::write(dir.join(&lf), lrc_text.as_bytes())
                .await
                .is_ok()
            {
                Some(lf)
            } else {
                None
            }
        } else {
            None
        };

        Self::emit_progress(app, &vid, 98, "downloading", None);

        let entry = StoredDownloadEntry {
            video_id: vid.clone(),
            title: title.clone(),
            artist: artist.clone(),
            duration,
            file_name: audio_file_name,
            mime_type: mime_type.to_string(),
            cover_file,
            lyrics_file,
            file_size,
            downloaded_at: now_ms(),
            source_thumbnail: thumbnail_url.clone(),
        };

        {
            let mut idx_guard = self.index.write().await;
            idx_guard.insert(vid.clone(), entry.clone());
            Self::write_index_to_disk(&dir, &idx_guard)?;
        }

        // Persist song metadata in SQLite so offline library stays complete
        let song_json = json!({
            "id": vid,
            "videoId": vid,
            "title": title,
            "artists": [{ "name": artist, "id": null }],
            "duration": duration,
            "thumbnail": thumbnail_url,
            "inLibrary": now_ms()
        });
        let _ = db.upsert_song_value(&song_json);

        Self::emit_progress(app, &vid, 100, "completed", None);
        Ok(Some(Self::to_public_track(&entry, proxy)))
    }

    pub async fn cancel_download(&self, app: &AppHandle, video_id: &str) -> bool {
        let vid = video_id.trim();
        let found = if let Ok(flags) = self.cancel_flags.lock() {
            if let Some(flag) = flags.get(vid) {
                flag.store(true, Ordering::SeqCst);
                true
            } else {
                false
            }
        } else {
            false
        };
        if found {
            Self::emit_progress(app, vid, 0, "cancelled", None);
        }
        found
    }

    pub async fn delete_downloaded_track(&self, video_id: &str) -> Result<bool, String> {
        let vid = video_id.trim();
        if let Ok(flags) = self.cancel_flags.lock() {
            if let Some(flag) = flags.get(vid) {
                flag.store(true, Ordering::SeqCst);
            }
        }

        let dir = self.downloads_dir.read().await.clone();
        let removed_entry = {
            let mut idx_guard = self.index.write().await;
            let removed = idx_guard.remove(vid);
            Self::write_index_to_disk(&dir, &idx_guard)?;
            removed
        };

        if let Some(entry) = removed_entry {
            let _ = tokio::fs::remove_file(dir.join(&entry.file_name)).await;
            if let Some(cf) = entry.cover_file {
                let _ = tokio::fs::remove_file(dir.join(cf)).await;
            }
            if let Some(lf) = entry.lyrics_file {
                let _ = tokio::fs::remove_file(dir.join(lf)).await;
            }
            return Ok(true);
        }

        // Also clean orphaned files matching safe stem if any
        if let Some(stem) = safe_track_stem(vid) {
            for ext in [
                "m4a", "webm", "opus", "mp3", "mp4", "aac", "ogg", "jpg", "png", "webp", "lrc",
            ] {
                let p = dir.join(format!("{stem}.{ext}"));
                if p.exists() {
                    let _ = tokio::fs::remove_file(p).await;
                }
            }
        }
        Ok(false)
    }

    pub async fn get_downloaded_tracks(&self, proxy: &LocalStreamProxy) -> Vec<DownloadedTrack> {
        let dir = self.downloads_dir.read().await.clone();
        let guard = self.index.read().await;
        let mut tracks: Vec<DownloadedTrack> = guard
            .values()
            .filter(|e| dir.join(&e.file_name).is_file())
            .map(|e| Self::to_public_track(e, proxy))
            .collect();
        tracks.sort_by(|a, b| b.downloaded_at.cmp(&a.downloaded_at));
        tracks
    }

    pub async fn get_local_playback(
        &self,
        proxy: &LocalStreamProxy,
        video_id: &str,
    ) -> Option<PlaybackData> {
        let vid = video_id.trim();
        let dir = self.downloads_dir.read().await.clone();
        let entry = self.index.read().await.get(vid)?.clone();
        let audio_path = dir.join(&entry.file_name);
        if !audio_path.is_file() {
            return None;
        }
        let actual_size = std::fs::metadata(&audio_path)
            .map(|m| m.len())
            .unwrap_or(entry.file_size);

        let local_url = proxy.get_local_audio_url(vid);
        Some(PlaybackData {
            audio_config: None,
            video_details: Some(json!({
                "videoId": vid,
                "title": entry.title,
                "author": entry.artist,
                "lengthSeconds": entry.duration.unwrap_or(0).to_string(),
            })),
            playback_tracking: None,
            format: json!({
                "mimeType": entry.mime_type,
                "bitrate": 160000,
                "contentLength": actual_size,
                "isLocal": true
            }),
            stream_url: local_url.clone(),
            original_stream_url: local_url,
            stream_expires_in_seconds: 86400,
            stream_client: "LOCAL".to_string(),
            stream_headers: HashMap::new(),
        })
    }

    pub async fn read_local_lyrics(&self, video_id: &str) -> Option<String> {
        let vid = video_id.trim();
        let dir = self.downloads_dir.read().await.clone();
        let file_name = {
            let guard = self.index.read().await;
            guard
                .get(vid)
                .and_then(|e| e.lyrics_file.clone())
                .or_else(|| safe_track_stem(vid).map(|s| format!("{s}.lrc")))
        }?;
        let path = dir.join(file_name);
        if !path.is_file() {
            return None;
        }
        let text = tokio::fs::read_to_string(&path).await.ok()?;
        if text.trim().is_empty() {
            None
        } else {
            Some(text)
        }
    }

    pub async fn get_storage_info(&self) -> StorageInfo {
        let dir = self.downloads_dir.read().await.clone();
        let guard = self.index.read().await;
        let mut total_bytes = 0u64;
        let mut track_count = 0usize;

        for entry in guard.values() {
            let audio_p = dir.join(&entry.file_name);
            if audio_p.is_file() {
                track_count += 1;
                total_bytes += std::fs::metadata(&audio_p)
                    .map(|m| m.len())
                    .unwrap_or(entry.file_size);
                if let Some(ref cf) = entry.cover_file {
                    if let Ok(m) = std::fs::metadata(dir.join(cf)) {
                        total_bytes += m.len();
                    }
                }
                if let Some(ref lf) = entry.lyrics_file {
                    if let Ok(m) = std::fs::metadata(dir.join(lf)) {
                        total_bytes += m.len();
                    }
                }
            }
        }

        StorageInfo {
            downloads_dir: dir.to_string_lossy().to_string(),
            total_bytes,
            track_count,
        }
    }

    pub async fn change_downloads_dir(
        &self,
        db: &MochyDatabase,
        new_dir: PathBuf,
        migrate_existing: bool,
    ) -> Result<StorageInfo, String> {
        if self
            .cancel_flags
            .lock()
            .map(|f| !f.is_empty())
            .unwrap_or(false)
        {
            return Err("Vui lòng đợi hoặc hủy các bài đang tải trước khi đổi thư mục.".to_string());
        }

        let old_dir = self.downloads_dir.read().await.clone();
        if new_dir == old_dir {
            return Ok(self.get_storage_info().await);
        }
        if new_dir.starts_with(&old_dir) && old_dir != Path::new("") {
            return Err(
                "Không thể chọn thư mục con bên trong thư mục lưu nhạc hiện tại.".to_string(),
            );
        }

        if !new_dir.exists() {
            std::fs::create_dir_all(&new_dir)
                .map_err(|e| format!("Không thể tạo thư mục đích: {e}"))?;
        }

        // Verify write permission in target folder before moving files
        let probe_file = new_dir.join(".tay_music_write_test");
        std::fs::write(&probe_file, b"ok")
            .map_err(|e| format!("Không có quyền ghi vào thư mục đã chọn: {e}"))?;
        let _ = std::fs::remove_file(&probe_file);

        if migrate_existing {
            let entries: Vec<StoredDownloadEntry> =
                self.index.read().await.values().cloned().collect();
            for entry in &entries {
                let files = [
                    Some(entry.file_name.as_str()),
                    entry.cover_file.as_deref(),
                    entry.lyrics_file.as_deref(),
                ];
                for file_opt in files {
                    if let Some(fname) = file_opt {
                        let src = old_dir.join(fname);
                        let dst = new_dir.join(fname);
                        if src.is_file() {
                            Self::safe_move_file(&src, &dst)?;
                        }
                    }
                }
            }

            let idx_guard = self.index.read().await;
            Self::write_index_to_disk(&new_dir, &idx_guard)?;
            let old_idx = old_dir.join(INDEX_FILE_NAME);
            if old_idx.exists() {
                let _ = std::fs::remove_file(old_idx);
            }
        } else {
            let loaded = Self::load_index_from_disk(&new_dir);
            *self.index.write().await = loaded;
        }

        *self.downloads_dir.write().await = new_dir.clone();
        db.set_setting("downloads_dir", &new_dir.to_string_lossy())?;

        Ok(self.get_storage_info().await)
    }
}

#[allow(dead_code)]
fn _unused_regex_anchor() -> Option<Regex> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let _ = &RE;
    None
}
