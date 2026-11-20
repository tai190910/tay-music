use crate::db::{now_ms, MochyDatabase};
use crate::innertube::{InnerTube, YouTube};
use crate::models::{
    CandidateResult, DbSong, ImportProgress, ImportResult, ImportedTrack, ParsedImport, SongItem,
    SpotifyAccountInfo, SpotifyRemotePlaylist,
};
use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use unicode_normalization::UnicodeNormalization;

const DESKTOP_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API_BASE: &str = "https://api.spotify.com/v1";

pub struct SpotifyClient;

impl SpotifyClient {
    pub async fn parse_public_link<F, Fut>(
        client: &Client,
        url: &str,
        access_token: Option<&str>,
        on_scrape_more: Option<F>,
    ) -> Result<ParsedImport, String>
    where
        F: FnOnce(String) -> Fut,
        Fut: Future<Output = Vec<ImportedTrack>> + Send,
    {
        static LINK_RE: OnceLock<Regex> = OnceLock::new();
        let re = LINK_RE.get_or_init(|| {
            Regex::new(r"(?:open\.spotify\.com/(?:intl-[a-zA-Z-]+/)?(?:embed/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]{22})").unwrap()
        });

        let trimmed = url.trim();
        let caps = re.captures(trimmed).ok_or_else(|| {
            "Link không hợp lệ. Vui lòng dán link playlist hoặc album Spotify hợp lệ.".to_string()
        })?;
        let import_type = caps[1].to_string();
        let id = caps[2].to_string();

        // 1. Try official API with access token for playlists
        if let Some(token) = access_token {
            if import_type == "playlist" {
                let meta_url = format!("{API_BASE}/playlists/{id}?fields=name,description,images");
                if let Ok(meta_res) = client
                    .get(&meta_url)
                    .bearer_auth(token)
                    .header("Accept", "application/json")
                    .send()
                    .await
                {
                    if meta_res.status().is_success() {
                        if let Ok(meta) = meta_res.json::<Value>().await {
                            let name = meta
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Spotify Playlist")
                                .to_string();
                            let cover_url = meta
                                .get("images")
                                .and_then(|v| v.as_array())
                                .and_then(|a| a.first())
                                .and_then(|i| i.get("url"))
                                .and_then(|u| u.as_str())
                                .map(|s| s.to_string());
                            let subtitle = meta
                                .get("description")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            let tracks =
                                Self::get_playlist_tracks::<fn(usize, usize)>(client, token, &id, None)
                                    .await;
                            let total = tracks.len();
                            return Ok(ParsedImport {
                                import_type: "playlist".to_string(),
                                id: id.clone(),
                                title: name,
                                subtitle,
                                cover_url,
                                tracks,
                                total,
                                source_url: Some(format!("https://open.spotify.com/playlist/{id}")),
                            });
                        }
                    }
                }
            }
        }

        // 2. Fetch from Spotify embed page
        let embed_url = format!("https://open.spotify.com/embed/{import_type}/{id}");
        let res = client
            .get(&embed_url)
            .header("User-Agent", DESKTOP_USER_AGENT)
            .header("Accept-Language", "en-US,en;q=0.9,vi;q=0.8")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            if res.status().as_u16() == 404 {
                return Err("Không tìm thấy Playlist/Album này. Vui lòng đảm bảo nó ở chế độ Công khai (Public).".to_string());
            }
            return Err(format!("Spotify phản hồi lỗi HTTP {}.", res.status().as_u16()));
        }

        let html = res.text().await.map_err(|e| e.to_string())?;
        static NEXT_DATA_RE: OnceLock<Regex> = OnceLock::new();
        let next_re = NEXT_DATA_RE.get_or_init(|| {
            Regex::new(r#"(?s)<script id="__NEXT_DATA__" type="application/json">(.*?)</script>"#).unwrap()
        });
        let json_str = next_re
            .captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .ok_or_else(|| "Không thể đọc dữ liệu trang Spotify. Vui lòng kiểm tra lại đường dẫn.".to_string())?;

        let parsed_json: Value = serde_json::from_str(json_str)
            .map_err(|_| "Lỗi phân tích cú pháp dữ liệu từ Spotify.".to_string())?;

        let entity = parsed_json
            .pointer("/props/pageProps/state/data/entity")
            .ok_or_else(|| {
                "Playlist hoặc Album Spotify này có thể đang ở chế độ riêng tư hoặc không tồn tại.".to_string()
            })?;

        let name = entity
            .get("name")
            .or_else(|| entity.get("title"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Spotify {import_type}"));
        let subtitle = entity
            .get("subtitle")
            .or_else(|| entity.get("type"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let mut cover_url: Option<String> = None;
        if let Some(sources) = entity.pointer("/coverArt/sources").and_then(|v| v.as_array()) {
            let mut best_w = -1i64;
            for src in sources {
                let w = src.get("width").and_then(|v| v.as_i64()).unwrap_or(0);
                if w > best_w {
                    if let Some(u) = src.get("url").and_then(|v| v.as_str()) {
                        best_w = w;
                        cover_url = Some(u.to_string());
                    }
                }
            }
        }

        let raw_tracks = entity
            .get("trackList")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut tracks = Vec::new();
        let mut seen_uris = HashSet::new();

        for t in raw_tracks {
            let Some(title) = t.get("title").and_then(|v| v.as_str()) else {
                continue;
            };
            if title.is_empty() {
                continue;
            }
            let uri = t
                .get("uri")
                .and_then(|v| v.as_str())
                .filter(|u| u.starts_with("spotify:track:"))
                .map(|s| s.to_string());
            if let Some(ref u) = uri {
                seen_uris.insert(u.clone());
            }
            let artist = t
                .get("subtitle")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .replace('\u{00A0}', " ")
                .trim()
                .to_string();
            let duration_ms = t.get("duration").and_then(|v| v.as_i64());

            tracks.push(ImportedTrack {
                title: title.to_string(),
                artist,
                album: if import_type == "album" {
                    Some(name.clone())
                } else {
                    None
                },
                duration_ms,
                source_id: uri,
                thumbnail_url: None,
                added_at_ms: None,
            });
        }

        if import_type == "playlist" && tracks.len() >= 100 {
            if let Some(scrape_fn) = on_scrape_more {
                let extra_tracks = scrape_fn(id.clone()).await;
                for extra in extra_tracks {
                    if let Some(ref sid) = extra.source_id {
                        if seen_uris.insert(sid.clone()) {
                            tracks.push(extra);
                        }
                    } else if !tracks
                        .iter()
                        .any(|t| t.title.eq_ignore_ascii_case(&extra.title))
                    {
                        tracks.push(extra);
                    }
                }
            }
        }

        if tracks.is_empty() && import_type != "track" {
            return Err("Không tìm thấy bài hát nào trong playlist hoặc album này.".to_string());
        }

        let total = tracks.len();
        Ok(ParsedImport {
            import_type,
            id: id.clone(),
            title: name,
            subtitle,
            cover_url,
            tracks,
            total,
            source_url: Some(format!("https://open.spotify.com/{}/{id}", caps[1].to_string())),
        })
    }

    pub async fn get_me(client: &Client, access_token: &str) -> Result<SpotifyAccountInfo, String> {
        let res = client
            .get(format!("{API_BASE}/me"))
            .bearer_auth(access_token)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err(format!(
                "Lỗi xác thực Spotify ({}): Token có thể đã hết hạn.",
                res.status().as_u16()
            ));
        }

        let data: Value = res.json().await.map_err(|e| e.to_string())?;
        let id = data
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let display_name = data
            .get("display_name")
            .and_then(|v| v.as_str())
            .unwrap_or(&id)
            .to_string();
        let email = data
            .get("email")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let photo_url = data
            .get("images")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|i| i.get("url"))
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());

        Ok(SpotifyAccountInfo {
            id,
            display_name,
            email,
            photo_url,
            sp_dc: None,
            access_token: Some(access_token.to_string()),
            expires_at: None,
        })
    }

    pub async fn get_user_playlists(
        client: &Client,
        access_token: &str,
    ) -> Result<Vec<SpotifyRemotePlaylist>, String> {
        let mut result = Vec::new();

        if let Ok(liked_res) = client
            .get(format!("{API_BASE}/me/tracks?limit=1"))
            .bearer_auth(access_token)
            .header("Accept", "application/json")
            .send()
            .await
        {
            if liked_res.status().is_success() {
                if let Ok(liked_data) = liked_res.json::<Value>().await {
                    let liked_total = liked_data.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
                    if liked_total > 0 {
                        result.push(SpotifyRemotePlaylist {
                            id: "spotify:liked".to_string(),
                            name: "Liked Songs (Bài hát đã thích)".to_string(),
                            track_count: liked_total,
                            cover_url: Some(
                                "https://misc.scdn.co/liked-songs/liked-songs-640.png".to_string(),
                            ),
                            is_liked: Some(true),
                            owner_name: None,
                        });
                    }
                }
            }
        }

        let mut next_url = Some(format!("{API_BASE}/me/playlists?limit=50"));
        let mut pages = 0;

        while let Some(url) = next_url {
            if pages >= 10 {
                break;
            }
            pages += 1;

            let Ok(res) = client
                .get(&url)
                .bearer_auth(access_token)
                .header("Accept", "application/json")
                .send()
                .await
            else {
                break;
            };
            if !res.status().is_success() {
                break;
            }
            let Ok(page_data) = res.json::<Value>().await else {
                break;
            };
            let items = page_data
                .get("items")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            for item in items {
                let Some(id) = item.get("id").and_then(|v| v.as_str()) else {
                    continue;
                };
                let count = item
                    .pointer("/tracks/total")
                    .or_else(|| item.pointer("/items/total"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let cover = item
                    .get("images")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|i| i.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Danh sách phát chưa đặt tên")
                    .to_string();
                let owner_name = item
                    .pointer("/owner/display_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                result.push(SpotifyRemotePlaylist {
                    id: id.to_string(),
                    name,
                    track_count: count,
                    cover_url: cover,
                    is_liked: Some(false),
                    owner_name,
                });
            }

            next_url = page_data
                .get("next")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }

        Ok(result)
    }

    pub async fn get_playlist_tracks<F>(
        client: &Client,
        access_token: &str,
        playlist_id: &str,
        mut on_progress: Option<F>,
    ) -> Vec<ImportedTrack>
    where
        F: FnMut(usize, usize),
    {
        let is_liked = playlist_id == "spotify:liked";
        let mut next_url = Some(if is_liked {
            format!("{API_BASE}/me/tracks?limit=50")
        } else {
            format!("{API_BASE}/playlists/{playlist_id}/tracks?limit=100")
        });

        let mut tracks = Vec::new();
        let mut pages = 0;
        let mut total_expected: usize = 0;

        while let Some(mut url) = next_url {
            if pages >= 50 {
                break;
            }
            pages += 1;

            let Ok(mut res) = client
                .get(&url)
                .bearer_auth(access_token)
                .header("Accept", "application/json")
                .send()
                .await
            else {
                break;
            };

            if res.status().as_u16() == 404 && !is_liked && url.contains("/tracks?") {
                url = format!("{API_BASE}/playlists/{playlist_id}/items?limit=100");
                let Ok(retry) = client
                    .get(&url)
                    .bearer_auth(access_token)
                    .header("Accept", "application/json")
                    .send()
                    .await
                else {
                    break;
                };
                res = retry;
            }

            if !res.status().is_success() {
                break;
            }
            let Ok(page_data) = res.json::<Value>().await else {
                break;
            };
            if total_expected == 0 {
                if let Some(t) = page_data.get("total").and_then(|v| v.as_u64()) {
                    total_expected = t as usize;
                }
            }

            let items = page_data
                .get("items")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            for entry in items {
                let track_obj = entry.get("track").or_else(|| entry.get("item"));
                let Some(track_obj) = track_obj else {
                    continue;
                };
                if track_obj.get("type").and_then(|v| v.as_str()) == Some("episode") {
                    continue;
                }
                let Some(title) = track_obj.get("name").and_then(|v| v.as_str()) else {
                    continue;
                };
                if title.is_empty() {
                    continue;
                }

                let artists = track_obj
                    .get("artists")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                            .filter(|n| !n.is_empty())
                            .collect::<Vec<_>>()
                            .join(", ")
                    })
                    .unwrap_or_default();

                let thumb = track_obj
                    .pointer("/album/images")
                    .and_then(|v| v.as_array())
                    .and_then(|a| a.first())
                    .and_then(|i| i.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string());

                let album = track_obj
                    .pointer("/album/name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let duration_ms = track_obj.get("duration_ms").and_then(|v| v.as_i64());
                let source_id = track_obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .map(|id| format!("spotify:track:{id}"));

                tracks.push(ImportedTrack {
                    title: title.to_string(),
                    artist: artists,
                    album,
                    duration_ms,
                    source_id,
                    thumbnail_url: thumb,
                    added_at_ms: None,
                });
            }

            if let Some(ref mut cb) = on_progress {
                cb(tracks.len(), if total_expected > 0 { total_expected } else { tracks.len() });
            }

            next_url = page_data
                .get("next")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }

        tracks
    }
}

pub struct TrackMatcher {
    cache: HashMap<String, Option<SongItem>>,
}

impl TrackMatcher {
    const SONG_ACCEPT: f64 = 0.60;
    const VIDEO_ACCEPT: f64 = 0.70;
    const SONG_FALLBACK_ACCEPT: f64 = 0.50;
    const MIN_TITLE: f64 = 0.40;
    const CLOSE_SECONDS: f64 = 4.0;
    const MAX_DURATION_DIFF: f64 = 15.0;

    const VERSION_WORDS: &'static [&'static str] = &[
        "remix",
        "cover",
        "live",
        "instrumental",
        "inst",
        "karaoke",
        "sped up",
        "slowed",
        "nightcore",
        "acoustic",
        "reverb",
        "8d",
        "dance practice",
        "practice",
        "performance",
        "fancam",
        "concert",
        "rehearsal",
        "reaction",
        "1 hour",
        "hour",
        "loop",
        "extended",
    ];

    const LIVE_ALBUM_WORDS: &'static [&'static str] = &[
        "live",
        "tour",
        "concert",
        "unplugged",
        "session",
        "sessions",
    ];

    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    pub fn split_artists(artist: &str) -> Vec<String> {
        static SPLIT_RE: OnceLock<Regex> = OnceLock::new();
        let re = SPLIT_RE.get_or_init(|| {
            Regex::new(
                r"(?i)\s*(?:,|&|;|/|\sx\s|\sand\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\swith\s)\s*",
            )
            .unwrap()
        });
        let cleaned = artist.replace('\u{00A0}', " ");
        re.split(&cleaned)
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect()
    }

    pub fn clean_title_for_search(title: &str) -> String {
        static BRACKET_RE: OnceLock<Regex> = OnceLock::new();
        static DASH_RE: OnceLock<Regex> = OnceLock::new();
        static FEAT_RE: OnceLock<Regex> = OnceLock::new();

        let br = BRACKET_RE.get_or_init(|| {
            Regex::new(r"(?i)[(\[][^)\]]*\b(feat|ft|with|remaster|remastered|version|edit|mono|stereo|deluxe|explicit|clean|bonus|from|official|audio|video|lyrics?|visuali[sz]er|hd|hq|4k)\b[^)\]]*[)\]]").unwrap()
        });
        let dash = DASH_RE.get_or_init(|| {
            Regex::new(r"(?i)\s[-–—]\s.*(remaster|version|edit|mono|stereo|mix\b|from |live at|bonus).*$").unwrap()
        });
        let feat = FEAT_RE.get_or_init(|| Regex::new(r"(?i)\s(feat\.?|ft\.?|featuring)\s.*$").unwrap());

        let s1 = br.replace_all(title, " ");
        let s2 = dash.replace_all(&s1, "");
        let s3 = feat.replace_all(&s2, "");
        let cleaned = s3.split_whitespace().collect::<Vec<_>>().join(" ");
        if cleaned.is_empty() {
            title.to_string()
        } else {
            cleaned
        }
    }

    pub fn normalize_text(text: &str) -> String {
        let lower = text.to_lowercase();
        let folded: String = lower
            .nfkd()
            .filter(|c| !('\u{0300}'..='\u{036f}').contains(c))
            .collect();
        let mut out = String::with_capacity(folded.len());
        let mut last_space = true;
        for ch in folded.chars() {
            if ch.is_ascii_alphanumeric() {
                out.push(ch);
                last_space = false;
            } else if !last_space {
                out.push(' ');
                last_space = true;
            }
        }
        out.trim().to_string()
    }

    pub fn normalize_title(title: &str) -> String {
        Self::normalize_text(&Self::clean_title_for_search(title))
    }

    fn levenshtein(a: &str, b: &str) -> usize {
        let ac: Vec<char> = a.chars().collect();
        let bc: Vec<char> = b.chars().collect();
        if ac.len() > 200 || bc.len() > 200 {
            return ac.len().abs_diff(bc.len());
        }
        let mut prev: Vec<usize> = (0..=bc.len()).collect();
        let mut curr = vec![0usize; bc.len() + 1];
        for i in 1..=ac.len() {
            curr[0] = i;
            for j in 1..=bc.len() {
                let cost = if ac[i - 1] == bc[j - 1] { 0 } else { 1 };
                curr[j] = (curr[j - 1] + 1).min(prev[j] + 1).min(prev[j - 1] + cost);
            }
            std::mem::swap(&mut prev, &mut curr);
        }
        prev[bc.len()]
    }

    pub fn similarity(a: &str, b: &str) -> f64 {
        if a.is_empty() || b.is_empty() {
            return 0.0;
        }
        if a == b {
            return 1.0;
        }

        let tokens_a: HashSet<&str> = a.split_whitespace().collect();
        let tokens_b: HashSet<&str> = b.split_whitespace().collect();
        let intersection = tokens_a.iter().filter(|t| tokens_b.contains(*t)).count();
        let union = tokens_a.len() + tokens_b.len() - intersection;
        let jaccard = if union > 0 {
            intersection as f64 / union as f64
        } else {
            0.0
        };

        let compact_a: String = a.chars().filter(|c| !c.is_whitespace()).collect();
        let compact_b: String = b.chars().filter(|c| !c.is_whitespace()).collect();
        let max_len = compact_a.chars().count().max(compact_b.chars().count());
        let edit = if max_len > 0 {
            1.0 - Self::levenshtein(&compact_a, &compact_b) as f64 / max_len as f64
        } else {
            0.0
        };

        let containment = if compact_a.len() >= 3
            && compact_b.len() >= 3
            && (compact_a.contains(&compact_b) || compact_b.contains(&compact_a))
        {
            0.8
        } else {
            0.0
        };

        jaccard.max(edit).max(containment)
    }

    fn duration_score(source_ms: Option<i64>, candidate_sec: Option<i64>) -> f64 {
        match (source_ms, candidate_sec) {
            (Some(ms), Some(sec)) if ms > 0 && sec > 0 => {
                let diff = (ms as f64 / 1000.0 - sec as f64).abs();
                if diff <= Self::CLOSE_SECONDS {
                    1.0
                } else if diff <= 10.0 {
                    0.3
                } else if diff <= Self::MAX_DURATION_DIFF {
                    -0.5
                } else {
                    -999.0
                }
            }
            _ => 0.5,
        }
    }

    fn album_score(source_album: Option<&str>, candidate_album: Option<&str>) -> f64 {
        let Some(ca) = candidate_album.filter(|s| !s.trim().is_empty()) else {
            return 0.0;
        };
        let candidate = format!(" {} ", Self::normalize_text(ca));
        let source = format!(" {} ", Self::normalize_text(source_album.unwrap_or("")));

        let is_live_album = Self::LIVE_ALBUM_WORDS
            .iter()
            .any(|w| candidate.contains(&format!(" {w} ")) && !source.contains(&format!(" {w} ")));
        if is_live_album {
            return -0.3;
        }
        if source_album.map(|s| s.trim().is_empty()).unwrap_or(true) {
            return 0.0;
        }
        if Self::similarity(source.trim(), candidate.trim()) >= 0.8 {
            0.05
        } else {
            0.0
        }
    }

    fn upload_score(candidate: &SongItem) -> f64 {
        let mut bonus = 0.0;
        if candidate.music_video_type.as_deref() == Some("MUSIC_VIDEO_TYPE_ATV") {
            bonus += 0.15;
        }
        if candidate.music_video_type.as_deref() == Some("MUSIC_VIDEO_TYPE_UGC") {
            bonus -= 0.10;
        }
        let is_topic = candidate
            .artists
            .iter()
            .any(|a| a.name.to_lowercase().contains("- topic"))
            || candidate
                .author
                .as_deref()
                .map(|a| a.to_lowercase().contains("- topic"))
                .unwrap_or(false);
        if is_topic {
            bonus += 0.15;
        }
        if candidate.album.is_some() {
            bonus += 0.05;
        }
        bonus
    }

    pub fn score(&self, track: &ImportedTrack, candidate: &SongItem) -> f64 {
        let d_score = Self::duration_score(track.duration_ms, candidate.duration);
        if d_score == -999.0 {
            return 0.0;
        }

        let target_title = Self::normalize_title(&track.title);
        let candidate_title = Self::normalize_title(&candidate.title);
        let mut title_score = Self::similarity(&target_title, &candidate_title);

        let target_artists: Vec<String> = Self::split_artists(&track.artist)
            .into_iter()
            .map(|a| Self::normalize_text(&a))
            .filter(|a| !a.is_empty())
            .collect();
        let primary_artist = target_artists.first().map(|s| s.as_str()).unwrap_or("");

        let candidate_artists: Vec<String> = candidate
            .artists
            .iter()
            .map(|a| Self::normalize_text(&a.name))
            .filter(|a| !a.is_empty())
            .collect();
        let candidate_author = candidate
            .author
            .as_deref()
            .map(Self::normalize_text)
            .unwrap_or_default();

        let mut artist_score = if target_artists.is_empty() {
            0.5
        } else {
            target_artists
                .iter()
                .map(|t| {
                    candidate_artists
                        .iter()
                        .map(|c| Self::similarity(t, c))
                        .fold(0.0f64, f64::max)
                })
                .fold(0.0f64, f64::max)
        };

        let primary_in_artists = !primary_artist.is_empty()
            && candidate_artists.iter().any(|c| {
                Self::similarity(primary_artist, c) >= 0.65
                    || c.contains(primary_artist)
                    || primary_artist.contains(c.as_str())
            });
        let primary_in_title = !primary_artist.is_empty() && candidate_title.contains(primary_artist);
        let primary_in_author = !primary_artist.is_empty() && candidate_author.contains(primary_artist);

        if primary_artist.len() >= 2 && !primary_in_artists && !primary_in_title && !primary_in_author {
            return 0.0;
        }

        if artist_score < 0.6
            && target_artists
                .iter()
                .any(|a| !a.is_empty() && candidate_title.contains(a.as_str()))
        {
            artist_score = 0.8;
            let mut stripped = candidate_title.clone();
            for a in &target_artists {
                stripped = stripped.replace(a.as_str(), " ");
            }
            title_score = title_score.max(Self::similarity(&target_title, stripped.trim()));
        }

        if title_score < Self::MIN_TITLE {
            return 0.0;
        }

        let raw_target = format!(" {} ", Self::normalize_text(&track.title));
        let raw_candidate = format!(" {} ", Self::normalize_text(&candidate.title));
        let has_forbidden = Self::VERSION_WORDS.iter().any(|w| {
            raw_candidate.contains(&format!(" {w} ")) && !raw_target.contains(&format!(" {w} "))
        });

        let mut total = title_score * 0.50
            + artist_score * 0.25
            + d_score * 0.25
            + Self::album_score(
                track.album.as_deref(),
                candidate.album.as_ref().map(|a| a.name.as_str()),
            )
            + Self::upload_score(candidate);

        if has_forbidden {
            total *= 0.40;
        }

        total.clamp(0.0, 1.0)
    }

    fn search_query(track: &ImportedTrack) -> String {
        let artists = Self::split_artists(&track.artist);
        let first_artist = artists.first().map(|s| s.as_str()).unwrap_or("");
        format!(
            "{} {}",
            Self::clean_title_for_search(&track.title),
            first_artist
        )
        .trim()
        .to_string()
    }

    async fn search_songs_with_retry(inner: &InnerTube, query: &str) -> Vec<SongItem> {
        for attempt in 0..2 {
            match YouTube::search_songs(inner, query).await {
                Ok(res) => return res.into_iter().take(10).collect(),
                Err(_) if attempt == 0 => sleep(Duration::from_millis(300)).await,
                Err(_) => break,
            }
        }
        vec![]
    }

    async fn search_general_with_retry(inner: &InnerTube, query: &str) -> Vec<SongItem> {
        for attempt in 0..2 {
            match YouTube::search(inner, query, None).await {
                Ok(res) => {
                    let mut list = Vec::new();
                    for it in res.items {
                        if it.get("duration").is_some() || it.get("videoId").is_some() {
                            if let Ok(s) = serde_json::from_value::<SongItem>(it) {
                                list.push(s);
                                if list.len() >= 10 {
                                    break;
                                }
                            }
                        }
                    }
                    return list;
                }
                Err(_) if attempt == 0 => sleep(Duration::from_millis(300)).await,
                Err(_) => break,
            }
        }
        vec![]
    }

    fn pick<'a>(
        &self,
        track: &ImportedTrack,
        scored: &'a [(&'a SongItem, f64)],
        accept: f64,
    ) -> Option<SongItem> {
        let source_sec = track.duration_ms.map(|ms| ms as f64 / 1000.0).filter(|s| *s > 0.0);
        if let Some(ss) = source_sec {
            let mut close: Vec<(&SongItem, f64)> = scored
                .iter()
                .filter(|(song, sc)| {
                    *sc >= accept
                        && song
                            .duration
                            .map(|d| (d as f64 - ss).abs() <= Self::CLOSE_SECONDS)
                            .unwrap_or(false)
                })
                .copied()
                .collect();
            if !close.is_empty() {
                close.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                return Some(close[0].0.clone());
            }
        }

        let mut valid: Vec<(&SongItem, f64)> = scored
            .iter()
            .filter(|(_, sc)| *sc >= accept)
            .copied()
            .collect();
        if valid.is_empty() {
            return None;
        }
        valid.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        Some(valid[0].0.clone())
    }

    pub async fn match_track(&mut self, inner: &InnerTube, track: &ImportedTrack) -> Option<SongItem> {
        let cache_key = format!(
            "{}|{}|{}",
            Self::normalize_title(&track.title),
            Self::normalize_text(&track.artist),
            ((track.duration_ms.unwrap_or(0) as f64) / 5000.0).round() as i64
        );
        if let Some(cached) = self.cache.get(&cache_key) {
            return cached.clone();
        }

        let query = Self::search_query(track);

        let songs = Self::search_songs_with_retry(inner, &query).await;
        let scored_songs: Vec<(&SongItem, f64)> =
            songs.iter().map(|s| (s, self.score(track, s))).collect();
        if let Some(best) = self.pick(track, &scored_songs, Self::SONG_ACCEPT) {
            self.cache.insert(cache_key, Some(best.clone()));
            return Some(best);
        }

        let videos = Self::search_general_with_retry(inner, &query).await;
        let scored_videos: Vec<(&SongItem, f64)> =
            videos.iter().map(|v| (v, self.score(track, v))).collect();
        if let Some(best_video) = self.pick(track, &scored_videos, Self::VIDEO_ACCEPT) {
            self.cache.insert(cache_key, Some(best_video.clone()));
            return Some(best_video);
        }

        let fallback = self.pick(track, &scored_songs, Self::SONG_FALLBACK_ACCEPT);
        self.cache.insert(cache_key, fallback.clone());
        fallback
    }

    pub async fn get_candidates(
        &self,
        inner: &InnerTube,
        title: &str,
        artist: &str,
        duration_ms: Option<i64>,
    ) -> Vec<CandidateResult> {
        let dummy = ImportedTrack {
            title: title.to_string(),
            artist: artist.to_string(),
            album: None,
            duration_ms,
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let query = Self::search_query(&dummy);
        let (songs, videos) = tokio::join!(
            Self::search_songs_with_retry(inner, &query),
            Self::search_general_with_retry(inner, &query)
        );

        let mut seen = HashSet::new();
        let mut candidates = Vec::new();
        for item in songs.into_iter().chain(videos.into_iter()) {
            if item.id.is_empty() || !seen.insert(item.id.clone()) {
                continue;
            }
            let s = (self.score(&dummy, &item) * 100.0).round() / 100.0;
            candidates.push(CandidateResult {
                song: item,
                score: s,
            });
        }
        candidates.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        candidates.truncate(8);
        candidates
    }
}

pub struct MusicImportService {
    active: Arc<AtomicBool>,
    cancelled: Arc<AtomicBool>,
    matcher: Mutex<TrackMatcher>,
}

impl MusicImportService {
    pub fn new() -> Self {
        Self {
            active: Arc::new(AtomicBool::new(false)),
            cancelled: Arc::new(AtomicBool::new(false)),
            matcher: Mutex::new(TrackMatcher::new()),
        }
    }

    pub fn cancel(&self) {
        if self.active.load(Ordering::SeqCst) {
            self.cancelled.store(true, Ordering::SeqCst);
        }
    }

    pub async fn import_from_parsed<F>(
        &self,
        db: &MochyDatabase,
        inner: &InnerTube,
        parsed: ParsedImport,
        mut on_progress: F,
    ) -> Result<ImportResult, String>
    where
        F: FnMut(ImportProgress),
    {
        if self
            .active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("Một tiến trình nhập nhạc đang chạy. Vui lòng chờ hoàn tất.".to_string());
        }
        self.cancelled.store(false, Ordering::SeqCst);

        let result = self
            .import_parsed_inner(db, inner, parsed, &mut on_progress)
            .await;

        self.active.store(false, Ordering::SeqCst);
        self.cancelled.store(false, Ordering::SeqCst);
        result
    }

    async fn import_parsed_inner<F>(
        &self,
        db: &MochyDatabase,
        inner: &InnerTube,
        parsed: ParsedImport,
        on_progress: &mut F,
    ) -> Result<ImportResult, String>
    where
        F: FnMut(ImportProgress),
    {
        let total = parsed.tracks.len();
        let mut matched_count = 0usize;
        let mut matched_songs: Vec<DbSong> = Vec::new();

        let emit = |cb: &mut F,
                    phase: &str,
                    current: usize,
                    matched: usize,
                    current_track: Option<String>,
                    error: Option<String>| {
            cb(ImportProgress {
                phase: phase.to_string(),
                total,
                current,
                matched,
                current_track,
                playlist_name: Some(parsed.title.clone()),
                error,
            });
        };

        emit(
            on_progress,
            "matching",
            0,
            0,
            Some("Bắt đầu tìm kiếm...".to_string()),
            None,
        );

        for (i, track) in parsed.tracks.iter().enumerate() {
            if self.cancelled.load(Ordering::SeqCst) {
                let msg = "Tiến trình đã bị người dùng hủy.".to_string();
                emit(on_progress, "error", total, matched_count, None, Some(msg.clone()));
                return Err(msg);
            }

            emit(
                on_progress,
                "matching",
                i + 1,
                matched_count,
                Some(format!("{} - {}", track.title, track.artist)),
                None,
            );

            let mut matched_item = None;
            for attempt in 0..2 {
                let mut m = self.matcher.lock().await;
                if let Some(found) = m.match_track(inner, track).await {
                    matched_item = Some(found);
                    break;
                }
                drop(m);
                if attempt == 0 {
                    sleep(Duration::from_millis(400)).await;
                }
            }

            if let Some(item) = matched_item {
                matched_count += 1;
                let artists = if item.artists.is_empty() {
                    vec![crate::models::Artist {
                        name: track.artist.clone(),
                        id: None,
                    }]
                } else {
                    item.artists
                };
                let dur = item.duration.unwrap_or_else(|| {
                    track
                        .duration_ms
                        .map(|ms| (ms as f64 / 1000.0).round() as i64)
                        .unwrap_or(-1)
                });
                let thumb = item
                    .thumbnail
                    .filter(|s| !s.is_empty())
                    .or_else(|| track.thumbnail_url.clone());
                let alb_name = item.album.map(|a| a.name).or_else(|| track.album.clone());
                let now = now_ms();

                matched_songs.push(DbSong {
                    id: item.id,
                    title: item.title,
                    artists,
                    duration: dur,
                    thumbnail_url: thumb.clone(),
                    thumbnail: thumb,
                    album_id: None,
                    album_name: alb_name,
                    explicit: item.explicit,
                    year: None,
                    liked: false,
                    liked_date: None,
                    total_play_time: 0,
                    in_library: Some(now),
                    created_at: now,
                });
            }

            if i + 1 < total {
                sleep(Duration::from_millis(250)).await;
            }
        }

        if self.cancelled.load(Ordering::SeqCst) {
            let msg = "Tiến trình đã bị người dùng hủy.".to_string();
            emit(on_progress, "error", total, matched_count, None, Some(msg.clone()));
            return Err(msg);
        }

        emit(
            on_progress,
            "saving",
            total,
            matched_count,
            Some("Đang lưu vào thư viện...".to_string()),
            None,
        );

        let mut playlist_id: Option<String> = None;
        if parsed.import_type == "playlist" || parsed.import_type == "album" {
            let playlist = match db.find_playlist_by_name(&parsed.title)? {
                Some(p) => p,
                None => db.create_playlist(
                    &parsed.title,
                    Some(&format!("Nhập từ Spotify ({})", parsed.import_type)),
                    parsed.cover_url.as_deref(),
                    None,
                )?,
            };
            playlist_id = Some(playlist.id.clone());
            for song in &matched_songs {
                db.upsert_db_song(song)?;
                db.add_song_to_playlist(&playlist.id, &song.id, None)?;
            }
        } else {
            for song in &matched_songs {
                db.upsert_db_song(song)?;
            }
        }

        emit(
            on_progress,
            "done",
            total,
            matched_count,
            Some("Hoàn tất!".to_string()),
            None,
        );

        Ok(ImportResult {
            matched: matched_count,
            total,
            playlist_id,
        })
    }

    pub async fn import_from_spotify_remote<F>(
        &self,
        db: &MochyDatabase,
        inner: &InnerTube,
        access_token: &str,
        remote: SpotifyRemotePlaylist,
        mut on_progress: F,
    ) -> Result<ImportResult, String>
    where
        F: FnMut(ImportProgress),
    {
        if self
            .active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("Một tiến trình nhập nhạc đang chạy. Vui lòng chờ hoàn tất.".to_string());
        }
        self.cancelled.store(false, Ordering::SeqCst);

        let result = self
            .import_remote_inner(db, inner, access_token, remote, &mut on_progress)
            .await;

        self.active.store(false, Ordering::SeqCst);
        self.cancelled.store(false, Ordering::SeqCst);
        result
    }

    async fn import_remote_inner<F>(
        &self,
        db: &MochyDatabase,
        inner: &InnerTube,
        access_token: &str,
        remote: SpotifyRemotePlaylist,
        on_progress: &mut F,
    ) -> Result<ImportResult, String>
    where
        F: FnMut(ImportProgress),
    {
        let emit = |cb: &mut F,
                    phase: &str,
                    total: usize,
                    current: usize,
                    matched: usize,
                    current_track: Option<String>,
                    error: Option<String>| {
            cb(ImportProgress {
                phase: phase.to_string(),
                total,
                current,
                matched,
                current_track,
                playlist_name: Some(remote.name.clone()),
                error,
            });
        };

        let init_total = remote.track_count.max(0) as usize;
        emit(
            on_progress,
            "fetching",
            init_total,
            0,
            0,
            Some("Đang tải danh sách từ Spotify...".to_string()),
            None,
        );

        let remote_name_clone = remote.name.clone();
        let tracks = SpotifyClient::get_playlist_tracks(
            &inner.client,
            access_token,
            &remote.id,
            Some(|loaded: usize, total_exp: usize| {
                on_progress(ImportProgress {
                    phase: "fetching".to_string(),
                    total: total_exp,
                    current: loaded,
                    matched: 0,
                    current_track: Some(format!("Đã tải {loaded} bài hát...")),
                    playlist_name: Some(remote_name_clone.clone()),
                    error: None,
                });
            }),
        )
        .await;

        if self.cancelled.load(Ordering::SeqCst) {
            let msg = "Tiến trình đã bị hủy.".to_string();
            emit(on_progress, "error", 0, 0, 0, None, Some(msg.clone()));
            return Err(msg);
        }

        let total = tracks.len();
        let mut matched_count = 0usize;
        let mut matched_songs: Vec<DbSong> = Vec::new();

        emit(
            on_progress,
            "matching",
            total,
            0,
            0,
            Some("Bắt đầu đối soát...".to_string()),
            None,
        );

        for (i, track) in tracks.iter().enumerate() {
            if self.cancelled.load(Ordering::SeqCst) {
                let msg = "Tiến trình đã bị người dùng hủy.".to_string();
                emit(on_progress, "error", total, i, matched_count, None, Some(msg.clone()));
                return Err(msg);
            }

            emit(
                on_progress,
                "matching",
                total,
                i + 1,
                matched_count,
                Some(format!("{} - {}", track.title, track.artist)),
                None,
            );

            let mut matched_item = None;
            for attempt in 0..2 {
                let mut m = self.matcher.lock().await;
                if let Some(found) = m.match_track(inner, track).await {
                    matched_item = Some(found);
                    break;
                }
                drop(m);
                if attempt == 0 {
                    sleep(Duration::from_millis(400)).await;
                }
            }

            if let Some(item) = matched_item {
                matched_count += 1;
                let artists = if item.artists.is_empty() {
                    vec![crate::models::Artist {
                        name: track.artist.clone(),
                        id: None,
                    }]
                } else {
                    item.artists
                };
                let dur = item.duration.unwrap_or_else(|| {
                    track
                        .duration_ms
                        .map(|ms| (ms as f64 / 1000.0).round() as i64)
                        .unwrap_or(-1)
                });
                let thumb = item
                    .thumbnail
                    .filter(|s| !s.is_empty())
                    .or_else(|| track.thumbnail_url.clone());
                let alb_name = item.album.map(|a| a.name).or_else(|| track.album.clone());
                let now = now_ms();

                matched_songs.push(DbSong {
                    id: item.id,
                    title: item.title,
                    artists,
                    duration: dur,
                    thumbnail_url: thumb.clone(),
                    thumbnail: thumb,
                    album_id: None,
                    album_name: alb_name,
                    explicit: item.explicit,
                    year: None,
                    liked: false,
                    liked_date: None,
                    total_play_time: 0,
                    in_library: Some(now),
                    created_at: now,
                });
            }

            if i + 1 < total {
                sleep(Duration::from_millis(250)).await;
            }
        }

        emit(
            on_progress,
            "saving",
            total,
            total,
            matched_count,
            Some("Đang lưu bài hát...".to_string()),
            None,
        );

        let mut playlist_id: Option<String> = None;
        if remote.is_liked.unwrap_or(false) {
            for song in &matched_songs {
                let val = serde_json::to_value(song).map_err(|e| e.to_string())?;
                db.upsert_db_song(song)?;
                db.set_liked(&song.id, true, Some(&val))?;
            }
        } else {
            let desc = match remote.owner_name {
                Some(ref o) => format!("Đồng bộ từ Spotify (bởi {o})"),
                None => "Đồng bộ từ Spotify (Playlist cá nhân)".to_string(),
            };
            let playlist = match db.find_playlist_by_name(&remote.name)? {
                Some(p) => p,
                None => db.create_playlist(
                    &remote.name,
                    Some(&desc),
                    remote.cover_url.as_deref(),
                    None,
                )?,
            };
            playlist_id = Some(playlist.id.clone());
            for song in &matched_songs {
                db.upsert_db_song(song)?;
                db.add_song_to_playlist(&playlist.id, &song.id, None)?;
            }
        }

        emit(
            on_progress,
            "done",
            total,
            total,
            matched_count,
            Some("Hoàn tất!".to_string()),
            None,
        );

        Ok(ImportResult {
            matched: matched_count,
            total,
            playlist_id,
        })
    }
}
