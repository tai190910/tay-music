use crate::innertube::USER_AGENT_WEB;
use crate::models::{Artist, PlaybackData, SongItem};
use crate::proxy::LocalStreamProxy;
use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tokio::sync::RwLock;

static CLIENT_ID_CACHE: OnceLock<RwLock<Option<String>>> = OnceLock::new();

fn cache_lock() -> &'static RwLock<Option<String>> {
    CLIENT_ID_CACHE.get_or_init(|| RwLock::new(None))
}

pub fn is_soundcloud_id(id: &str) -> bool {
    extract_track_id(id).is_some()
}

pub fn extract_track_id(id: &str) -> Option<&str> {
    let trimmed = id.trim();
    let rest = trimmed.strip_prefix("sc:")?;
    if rest.len() >= 4 && rest.chars().all(|c| c.is_ascii_digit()) {
        Some(rest)
    } else {
        None
    }
}

fn format_duration_text(sec: i64) -> String {
    let s = sec.max(0);
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let rem = s % 60;
    if h > 0 {
        format!("{h}:{m:02}:{rem:02}")
    } else {
        format!("{m}:{rem:02}")
    }
}

fn upgrade_artwork_url(raw: Option<&str>) -> Option<String> {
    let s = raw?.trim();
    if s.is_empty() {
        return None;
    }
    Some(s.replace("-large.", "-t500x500."))
}

pub async fn get_client_id(client: &Client, force_refresh: bool) -> Result<String, String> {
    if !force_refresh {
        if let Some(cached) = cache_lock().read().await.clone() {
            return Ok(cached);
        }
    }

    let html = client
        .get("https://soundcloud.com")
        .header("User-Agent", USER_AGENT_WEB)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .await
        .map_err(|e| format!("Failed to load SoundCloud homepage: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Failed to read SoundCloud homepage: {e}"))?;

    static SCRIPT_RE: OnceLock<Regex> = OnceLock::new();
    static CID_COLON_RE: OnceLock<Regex> = OnceLock::new();
    static CID_QUERY_RE: OnceLock<Regex> = OnceLock::new();

    let script_re =
        SCRIPT_RE.get_or_init(|| Regex::new(r#"https://a-v2\.sndcdn\.com/assets/[^"\s]+\.js"#).unwrap());
    let cid_colon_re =
        CID_COLON_RE.get_or_init(|| Regex::new(r#"client_id\s*:\s*"([a-zA-Z0-9]{20,40})""#).unwrap());
    let cid_query_re =
        CID_QUERY_RE.get_or_init(|| Regex::new(r#"client_id=([a-zA-Z0-9]{20,40})"#).unwrap());

    let mut seen = HashSet::new();
    let mut script_urls = Vec::new();
    for m in script_re.find_iter(&html) {
        let u = m.as_str().to_string();
        if seen.insert(u.clone()) {
            script_urls.push(u);
        }
    }

    for url in script_urls.into_iter().rev() {
        let Ok(resp) = client
            .get(&url)
            .header("User-Agent", USER_AGENT_WEB)
            .send()
            .await
        else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(js) = resp.text().await else {
            continue;
        };

        let found = cid_colon_re
            .captures(&js)
            .or_else(|| cid_query_re.captures(&js))
            .map(|c| c[1].to_string());

        if let Some(cid) = found {
            *cache_lock().write().await = Some(cid.clone());
            return Ok(cid);
        }
    }

    Err("Could not discover SoundCloud client_id".to_string())
}

fn is_playable_transcoding(tr: &Value) -> bool {
    if tr.get("snipped").and_then(|v| v.as_bool()) == Some(true) {
        return false;
    }
    let preset = tr.get("preset").and_then(|v| v.as_str()).unwrap_or("");
    let mime = tr
        .pointer("/format/mime_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let proto = tr
        .pointer("/format/protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if preset == "abr_sq" || mime == "audio/mpegurl" {
        return false;
    }

    let url_ok = tr
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    url_ok && (proto == "progressive" || proto == "hls")
}

pub async fn search_tracks(
    client: &Client,
    query: &str,
    limit: usize,
) -> Result<Vec<SongItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    let limit = limit.clamp(1, 20);
    let mut force_refresh = false;
    let mut json_body: Option<Value> = None;

    for attempt in 0..2 {
        let cid = get_client_id(client, force_refresh).await?;
        let url = format!(
            "https://api-v2.soundcloud.com/search/tracks?q={}&client_id={}&limit={}",
            urlencoding::encode(trimmed),
            urlencoding::encode(&cid),
            limit
        );

        let res = client
            .get(&url)
            .header("User-Agent", USER_AGENT_WEB)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("SoundCloud search failed: {e}"))?;

        let status = res.status().as_u16();
        if (status == 401 || status == 403) && attempt == 0 {
            force_refresh = true;
            continue;
        }
        if !res.status().is_success() {
            return Err(format!("SoundCloud search returned HTTP {status}"));
        }

        json_body = Some(
            res.json::<Value>()
                .await
                .map_err(|e| format!("Invalid SoundCloud search JSON: {e}"))?,
        );
        break;
    }

    let Some(data) = json_body else {
        return Ok(vec![]);
    };

    let mut songs = Vec::new();
    let Some(collection) = data.get("collection").and_then(|v| v.as_array()) else {
        return Ok(songs);
    };

    for tr in collection {
        if tr.get("streamable").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }
        let policy = tr.get("policy").and_then(|v| v.as_str()).unwrap_or("");
        if policy.eq_ignore_ascii_case("BLOCK") || policy.eq_ignore_ascii_case("SNIP") {
            continue;
        }

        let has_transcoding = tr
            .pointer("/media/transcodings")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(is_playable_transcoding))
            .unwrap_or(false);
        if !has_transcoding {
            continue;
        }

        let Some(track_id_num) = tr.get("id").and_then(|v| v.as_u64()) else {
            continue;
        };
        let duration_ms = tr
            .get("duration")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let dur_sec = (duration_ms / 1000.0).round() as i64;
        if dur_sec <= 15 {
            continue;
        }

        let title = tr
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }

        let username = tr
            .pointer("/user/username")
            .and_then(|v| v.as_str())
            .unwrap_or("SoundCloud")
            .trim()
            .to_string();

        let artwork = upgrade_artwork_url(tr.get("artwork_url").and_then(|v| v.as_str()))
            .or_else(|| upgrade_artwork_url(tr.pointer("/user/avatar_url").and_then(|v| v.as_str())));

        let permalink = tr
            .get("permalink_url")
            .and_then(|v| v.as_str())
            .unwrap_or("https://soundcloud.com")
            .to_string();

        let sc_id = format!("sc:{track_id_num}");
        songs.push(SongItem {
            id: sc_id.clone(),
            video_id: sc_id,
            title,
            artists: vec![Artist {
                name: username.clone(),
                id: None,
            }],
            album: None,
            duration: Some(dur_sec),
            duration_text: Some(format_duration_text(dur_sec)),
            music_video_type: Some("SOUNDCLOUD_TRACK".to_string()),
            is_video_song: false,
            thumbnail: artwork,
            explicit: false,
            share_link: permalink,
            author: Some(username),
            source: Some("soundcloud".to_string()),
        });
    }

    Ok(songs)
}

fn proto_of(t: &Value) -> &str {
    t.pointer("/format/protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

fn mime_of(t: &Value) -> &str {
    t.pointer("/format/mime_type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

fn preset_of(t: &Value) -> &str {
    t.get("preset").and_then(|v| v.as_str()).unwrap_or("")
}

fn pick_best_transcoding<'a>(transcodings: &'a [Value]) -> Option<&'a Value> {
    let usable: Vec<&Value> = transcodings
        .iter()
        .filter(|tr| is_playable_transcoding(tr))
        .collect();
    if usable.is_empty() {
        return None;
    }

    // 1. Progressive MP3 / AAC direct stream
    if let Some(t) = usable.iter().find(|t| proto_of(t) == "progressive") {
        return Some(*t);
    }
    // 2. HLS fMP4 AAC-160k
    if let Some(t) = usable
        .iter()
        .find(|t| proto_of(t) == "hls" && mime_of(t).contains("audio/mp4") && preset_of(t).contains("160"))
    {
        return Some(*t);
    }
    // 3. Any HLS fMP4 AAC
    if let Some(t) = usable
        .iter()
        .find(|t| proto_of(t) == "hls" && mime_of(t).contains("audio/mp4"))
    {
        return Some(*t);
    }
    // 4. HLS MPEG
    if let Some(t) = usable
        .iter()
        .find(|t| proto_of(t) == "hls" && mime_of(t).contains("audio/mpeg"))
    {
        return Some(*t);
    }

    usable.first().copied()
}

pub async fn resolve_playback_data(
    client: &Client,
    sc_id: &str,
    proxy: &LocalStreamProxy,
) -> Result<PlaybackData, String> {
    let track_id = extract_track_id(sc_id)
        .ok_or_else(|| format!("Invalid SoundCloud track ID: \"{sc_id}\""))?;

    let mut force_refresh = false;

    for attempt in 0..2 {
        let cid = get_client_id(client, force_refresh).await?;
        let track_url = format!(
            "https://api-v2.soundcloud.com/tracks/{track_id}?client_id={}",
            urlencoding::encode(&cid)
        );

        let track_res = client
            .get(&track_url)
            .header("User-Agent", USER_AGENT_WEB)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch SoundCloud track metadata: {e}"))?;

        let status = track_res.status().as_u16();
        if (status == 401 || status == 403) && attempt == 0 {
            force_refresh = true;
            continue;
        }
        if !track_res.status().is_success() {
            return Err(format!("SoundCloud track API returned HTTP {status}"));
        }

        let track: Value = track_res
            .json()
            .await
            .map_err(|e| format!("Invalid SoundCloud track JSON: {e}"))?;

        let transcodings = track
            .pointer("/media/transcodings")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "SoundCloud track has no media transcodings".to_string())?;

        let chosen = pick_best_transcoding(transcodings)
            .ok_or_else(|| "No playable SoundCloud audio stream available".to_string())?;

        let endpoint = chosen
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing SoundCloud transcoding URL".to_string())?;
        let proto = chosen
            .pointer("/format/protocol")
            .and_then(|v| v.as_str())
            .unwrap_or("hls");
        let mime_type = chosen
            .pointer("/format/mime_type")
            .and_then(|v| v.as_str())
            .unwrap_or("audio/mp4; codecs=\"mp4a.40.2\"");
        let preset = chosen
            .get("preset")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let auth = track
            .get("track_authorization")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let sep = if endpoint.contains('?') { '&' } else { '?' };
        let mut resolve_url = format!(
            "{endpoint}{sep}client_id={}",
            urlencoding::encode(&cid)
        );
        if !auth.is_empty() {
            resolve_url.push_str(&format!("&track_authorization={}", urlencoding::encode(auth)));
        }

        let stream_res = client
            .get(&resolve_url)
            .header("User-Agent", USER_AGENT_WEB)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("Failed to resolve SoundCloud transcoding URL: {e}"))?;

        let s_status = stream_res.status().as_u16();
        if (s_status == 401 || s_status == 403) && attempt == 0 {
            force_refresh = true;
            continue;
        }
        if !stream_res.status().is_success() {
            return Err(format!(
                "SoundCloud transcoding resolver returned HTTP {s_status}"
            ));
        }

        let stream_meta: Value = stream_res
            .json()
            .await
            .map_err(|e| format!("Invalid SoundCloud stream JSON: {e}"))?;
        let original_url = stream_meta
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "SoundCloud returned empty stream URL".to_string())?;

        let is_hls = proto == "hls";
        let stream_url = if is_hls {
            proxy.get_hls_proxy_url(&original_url)
        } else {
            proxy.get_raw_proxy_url(&original_url)
        };

        let bitrate = if preset.contains("160") {
            160_000
        } else if preset.contains("96") {
            96_000
        } else {
            128_000
        };

        let dur_seconds = track
            .get("duration")
            .and_then(|v| v.as_f64())
            .map(|ms| (ms / 1000.0).round() as i64)
            .unwrap_or(0);

        let mut headers_map = HashMap::new();
        headers_map.insert("User-Agent".to_string(), USER_AGENT_WEB.to_string());

        return Ok(PlaybackData {
            audio_config: None,
            video_details: Some(json!({
                "videoId": sc_id,
                "title": track.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "author": track.pointer("/user/username").and_then(|v| v.as_str()).unwrap_or("SoundCloud"),
                "lengthSeconds": dur_seconds.to_string(),
            })),
            playback_tracking: None,
            format: json!({
                "mimeType": mime_type,
                "bitrate": bitrate,
                "isHls": is_hls,
                "preset": preset,
                "protocol": proto,
            }),
            stream_url,
            original_stream_url: original_url,
            stream_expires_in_seconds: 1800,
            stream_client: "SOUNDCLOUD".to_string(),
            stream_headers: headers_map,
        });
    }

    Err(format!("Failed to resolve SoundCloud stream for {sc_id}"))
}
