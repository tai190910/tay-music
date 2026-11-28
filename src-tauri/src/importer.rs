use crate::db::{now_ms, MochyDatabase};
use crate::innertube::{InnerTube, YouTube};
use crate::models::{
    CandidateResult, DbSong, ImportProgress, ImportResult, ImportedTrack, ParsedImport, SongItem,
    SpotifyAccountInfo, SpotifyRemotePlaylist,
};
use crate::soundcloud;
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MatchTier {
    Tier1YtmSong,
    Tier2YtVideo,
    Tier3SoundCloud,
}

pub struct TrackMatcher {
    cache: HashMap<String, Option<SongItem>>,
}

impl TrackMatcher {
    const SONG_ACCEPT: f64 = 0.60;
    const VIDEO_ACCEPT: f64 = 0.58;
    const VIDEO_ALT_ACCEPT: f64 = 0.56;
    const SOUNDCLOUD_ACCEPT: f64 = 0.55;
    const SONG_FALLBACK_ACCEPT: f64 = 0.50;
    const CLOSE_SECONDS: f64 = 5.0;

    const PRESERVED_VERSION_KEYWORDS: &'static [&'static str] = &[
        "remix",
        "dj",
        "cover",
        "slowed",
        "sped up",
        "speed up",
        "nightcore",
        "acoustic",
        "live",
        "instrumental",
        "bootleg",
        "mashup",
        "vinahouse",
        "vip",
        "lofi",
        "lo-fi",
        "版",
        "翻唱",
        "慢摇",
        "电音",
        "加速",
        "纯音乐",
        "现场",
        "舞曲",
        "混音",
    ];

    const NOISE_BRACKET_KEYWORDS: &'static [&'static str] = &[
        "feat",
        "ft",
        "with",
        "remaster",
        "remastered",
        "version",
        "edit",
        "mono",
        "stereo",
        "deluxe",
        "explicit",
        "clean",
        "bonus",
        "from",
        "official",
        "audio",
        "video",
        "mv",
        "lyrics",
        "lyric",
        "visualizer",
        "visualiser",
        "hd",
        "hq",
        "4k",
        "动态歌词",
        "歌词",
        "高清",
    ];

    const COMPILATION_KEYWORDS: &'static [&'static str] = &[
        "1 hour",
        "2 hour",
        "3 hour",
        "10 hour",
        "hours",
        "nonstop",
        "non stop",
        "compilation",
        "full album",
        "megamix",
        "playlist",
        "vietmix",
        "串烧",
        "连播",
        "合集",
        "联播",
        "循环",
        "1小时",
        "一小时",
        "30分钟",
        "live stream",
        "livestream",
        "24 7",
    ];

    const LIVE_ALBUM_WORDS: &'static [&'static str] = &[
        "live",
        "tour",
        "concert",
        "unplugged",
        "session",
        "sessions",
    ];

    const INSTRUMENTAL_LATIN_KEYWORDS: &'static [&'static str] = &[
        "beat",
        "beats",
        "instrumental",
        "instrument",
        "inst",
        "karaoke",
        "playback",
        "khong loi",
        "nhac nen",
        "off vocal",
        "offvocal",
        "beat chuan",
        "beat lofi",
        "beat goc",
        "no vocal",
        "minus one",
        "type beat",
    ];

    const INSTRUMENTAL_CJK_KEYWORDS: &'static [&'static str] = &[
        "伴奏",
        "纯音乐",
        "消音",
        "卡拉ok",
        "无人声",
        "钢琴版",
    ];

    const INSTRUMENTAL_CHANNEL_KEYWORDS: &'static [&'static str] = &[
        "karaoke",
        "instrumental",
        "khong loi",
        "nhac nen",
        "off vocal",
        "beat chuan",
        "beat goc",
        "伴奏",
    ];

    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    fn is_cjk(ch: char) -> bool {
        ('\u{4E00}'..='\u{9FFF}').contains(&ch)
            || ('\u{3400}'..='\u{4DBF}').contains(&ch)
            || ('\u{F900}'..='\u{FAFF}').contains(&ch)
            || ('\u{3040}'..='\u{30FF}').contains(&ch)
            || ('\u{AC00}'..='\u{D7AF}').contains(&ch)
    }

    fn contains_cjk(text: &str) -> bool {
        text.chars().any(Self::is_cjk)
    }

    fn t2s_char(ch: char) -> char {
        match ch {
            '愛' => '爱',
            '陳' => '陈',
            '夢' => '梦',
            '風' => '风',
            '說' => '说',
            '聽' | '聴' => '听',
            '無' => '无',
            '為' => '为',
            '這' => '这',
            '來' => '来',
            '時' => '时',
            '會' => '会',
            '對' => '对',
            '過' => '过',
            '還' => '还',
            '國' => '国',
            '聲' => '声',
            '樂' => '乐',
            '語' => '语',
            '與' => '与',
            '讓' => '让',
            '離' => '离',
            '錯' => '错',
            '總' => '总',
            '從' => '从',
            '東' => '东',
            '車' => '车',
            '長' => '长',
            '門' => '门',
            '問' => '问',
            '間' => '间',
            '見' => '见',
            '親' => '亲',
            '雲' => '云',
            '電' => '电',
            '飛' => '飞',
            '魚' => '鱼',
            '鳥' => '鸟',
            '黃' => '黄',
            '龍' => '龙',
            '發' | '髮' => '发',
            '頭' => '头',
            '體' => '体',
            '學' => '学',
            '實' => '实',
            '燈' => '灯',
            '熱' => '热',
            '獨' => '独',
            '現' => '现',
            '畫' => '画',
            '當' => '当',
            '盡' => '尽',
            '遠' => '远',
            '邊' => '边',
            '動' => '动',
            '傷' => '伤',
            '兩' => '两',
            '寫' => '写',
            '劇' => '剧',
            '勝' => '胜',
            '華' => '华',
            '單' => '单',
            '圍' => '围',
            '場' => '场',
            '壞' => '坏',
            '淚' => '泪',
            '溫' => '温',
            '滿' => '满',
            '燒' => '烧',
            '牽' => '牵',
            '瘋' => '疯',
            '緣' => '缘',
            '網' => '网',
            '藍' => '蓝',
            '裝' => '装',
            '覺' => '觉',
            '許' => '许',
            '話' => '话',
            '認' => '认',
            '變' => '变',
            '貝' => '贝',
            '紅' => '红',
            '約' => '约',
            '純' => '纯',
            '線' => '线',
            '戀' => '恋',
            '態' => '态',
            '懷' => '怀',
            '應' => '应',
            '願' => '愿',
            '進' => '进',
            '選' => '选',
            '遺' => '遗',
            '釋' => '释',
            '錄' => '录',
            '鐘' | '鍾' => '钟',
            '難' => '难',
            '靜' => '静',
            '響' => '响',
            '頁' => '页',
            '顏' => '颜',
            '飲' => '饮',
            '馬' => '马',
            '驚' => '惊',
            '點' => '点',
            '開' => '开',
            '關' => '关',
            '詞' => '词',
            '個' => '个',
            '們' => '们',
            '麼' => '么',
            '著' => '着',
            '請' => '请',
            '誰' => '谁',
            '謝' => '谢',
            '給' => '给',
            '沒' => '没',
            '經' => '经',
            '題' => '题',
            '憶' => '忆',
            '調' => '调',
            '節' => '节',
            '歡' => '欢',
            '別' => '别',
            '歸' => '归',
            '敗' => '败',
            '戰' => '战',
            '鬥' => '斗',
            '負' => '负',
            '強' => '强',
            '舊' => '旧',
            '虛' => '虚',
            '雙' => '双',
            '萬' => '万',
            '億' => '亿',
            '裡' | '裏' => '里',
            '後' => '后',
            '樹' => '树',
            '陽' => '阳',
            '綠' => '绿',
            '銀' => '银',
            '鐵' => '铁',
            '書' => '书',
            '該' => '该',
            '涼' => '凉',
            '聰' => '聪',
            '麗' => '丽',
            '醜' => '丑',
            '惡' => '恶',
            '鳳' => '凤',
            '貓' => '猫',
            '蟲' => '虫',
            '橋' => '桥',
            '鄉' => '乡',
            '劍' => '剑',
            '槍' => '枪',
            '將' => '将',
            '俠' => '侠',
            '師' => '师',
            '蒼' => '苍',
            '煙' => '烟',
            '塵' => '尘',
            '濤' => '涛',
            '霧' => '雾',
            '閃' => '闪',
            '陰' => '阴',
            '結' => '结',
            '運' => '运',
            '於' => '于',
            '卻' => '却',
            '極' => '极',
            '搖' => '摇',
            '園' => '园',
            '號' => '号',
            '醫' => '医',
            '張' => '张',
            '劉' => '刘',
            '楊' => '杨',
            '趙' => '赵',
            '吳' => '吴',
            '鄭' => '郑',
            '孫' => '孙',
            '羅' => '罗',
            '韓' => '韩',
            '馮' => '冯',
            '鄧' => '邓',
            '呂' => '吕',
            '蘇' => '苏',
            '盧' => '卢',
            '蔣' => '蒋',
            '賈' => '贾',
            '葉' => '叶',
            '閻' => '阎',
            '譚' => '谭',
            '鄒' => '邹',
            '陸' => '陆',
            '顧' => '顾',
            '錢' => '钱',
            '湯' => '汤',
            '喬' => '乔',
            '賀' => '贺',
            '賴' => '赖',
            '龔' => '龚',
            _ => ch,
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

    fn has_keyword(lower_text: &str, keywords: &[&str]) -> bool {
        let spaced = format!(
            " {} ",
            lower_text
                .chars()
                .map(|c| if c.is_alphanumeric() || Self::is_cjk(c) { c } else { ' ' })
                .collect::<String>()
        );
        keywords.iter().any(|kw| {
            if Self::contains_cjk(kw) {
                lower_text.contains(kw)
            } else {
                spaced.contains(&format!(" {kw} "))
            }
        })
    }

    fn strip_yt_promo_brackets(title: &str) -> String {
        static PROMO_RE: OnceLock<Regex> = OnceLock::new();
        let re = PROMO_RE.get_or_init(|| Regex::new(r"[【『「][^】』」]*[】』」]").unwrap());
        let replaced = re.replace_all(title, " ");
        let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
        if collapsed.is_empty() {
            title.to_string()
        } else {
            collapsed
        }
    }

    pub fn clean_title_for_search(title: &str) -> String {
        static BRACKET_RE: OnceLock<Regex> = OnceLock::new();
        static DASH_NOISE_RE: OnceLock<Regex> = OnceLock::new();
        static FEAT_RE: OnceLock<Regex> = OnceLock::new();

        let br = BRACKET_RE.get_or_init(|| Regex::new(r"[(\[（]([^)\]）]*)[)\]）]").unwrap());
        let dash_noise = DASH_NOISE_RE.get_or_init(|| Regex::new(r"\s[-–—]\s(.*)$").unwrap());
        let feat = FEAT_RE.get_or_init(|| Regex::new(r"(?i)\s(feat\.?|ft\.?|featuring)\s.*$").unwrap());

        let unwrapped = title.replace(['《', '》'], " ");
        let s1 = br.replace_all(&unwrapped, |caps: &regex::Captures<'_>| {
            let inner = caps[1].trim();
            let lower = inner.to_lowercase();
            let norm_t2s: String = lower.chars().map(Self::t2s_char).collect();
            if Self::has_keyword(&norm_t2s, Self::PRESERVED_VERSION_KEYWORDS) {
                format!(" {inner} ")
            } else if Self::has_keyword(&norm_t2s, Self::NOISE_BRACKET_KEYWORDS) {
                " ".to_string()
            } else {
                format!(" {inner} ")
            }
        });

        let s2 = dash_noise.replace(&s1, |caps: &regex::Captures<'_>| {
            let suffix = caps[1].trim();
            let lower = suffix.to_lowercase();
            let norm_t2s: String = lower.chars().map(Self::t2s_char).collect();
            let is_preserved = Self::has_keyword(&norm_t2s, Self::PRESERVED_VERSION_KEYWORDS);
            let is_noise = lower.contains("remaster")
                || lower.contains("mono")
                || lower.contains("stereo")
                || lower.contains("from ")
                || lower.contains("bonus")
                || lower.contains("radio edit")
                || lower.contains("single version")
                || lower.contains("deluxe");
            if !is_preserved && is_noise {
                "".to_string()
            } else {
                caps[0].to_string()
            }
        });

        let s3 = feat.replace_all(&s2, "");
        let cleaned = s3.split_whitespace().collect::<Vec<_>>().join(" ");
        if cleaned.is_empty() {
            title.to_string()
        } else {
            cleaned
        }
    }

    /// Cleans a Spotify track title for Vocal-First search by removing distracting
    /// instrumental/beat/karaoke tags (such as "Beat Lofi", "Beat", "Instrument",
    /// "Instrumental", "Karaoke", "Không lời", "Nhạc nền", "Off vocal") before
    /// building the YouTube search query.
    pub fn clean_title_for_vocal_search(title: &str) -> String {
        static VOCAL_BRACKET_RE: OnceLock<Regex> = OnceLock::new();
        static VOCAL_PHRASE_RE: OnceLock<Regex> = OnceLock::new();
        static VOCAL_WORD_RE: OnceLock<Regex> = OnceLock::new();
        static VOCAL_CJK_RE: OnceLock<Regex> = OnceLock::new();

        let br_re = VOCAL_BRACKET_RE.get_or_init(|| {
            Regex::new(
                r"(?i)[(\[（][^)\]）]*\b(?:beat\s+lofi|beat\s+lo-fi|lofi\s+beat|lo-fi\s+beat|beat\s+chuẩn|beat\s+chuan|beat\s+gốc|beat\s+goc|type\s+beat|beats?|instrumentals?|instruments?|inst|karaoke|playback|không\s+lời|khong\s+loi|nhạc\s+nền|nhac\s+nen|off\s*[-]?\s*vocal|no\s+vocal|minus\s+one)\b[^)\]）]*[)\]）]",
            )
            .unwrap()
        });
        let phrase_re = VOCAL_PHRASE_RE.get_or_init(|| {
            Regex::new(
                r"(?i)\b(?:beat\s+lofi|beat\s+lo-fi|lofi\s+beat|lo-fi\s+beat|beat\s+chuẩn|beat\s+chuan|beat\s+gốc|beat\s+goc|type\s+beat|không\s+lời|khong\s+loi|nhạc\s+nền|nhac\s+nen|off\s*[-]?\s*vocal|no\s+vocal|minus\s+one)\b",
            )
            .unwrap()
        });
        let word_re = VOCAL_WORD_RE.get_or_init(|| {
            Regex::new(r"(?i)\b(?:beats?|instrumentals?|instruments?|inst|karaoke|playback)\b")
                .unwrap()
        });
        let cjk_re = VOCAL_CJK_RE
            .get_or_init(|| Regex::new(r"(?i)(?:伴奏版?|纯音乐|消音版?|卡拉\s*ok|无人声)").unwrap());

        let s1 = br_re.replace_all(title, " ");
        let s2 = phrase_re.replace_all(&s1, " ");
        let s3 = word_re.replace_all(&s2, " ");
        let s4 = cjk_re.replace_all(&s3, " ");
        let base_cleaned = Self::clean_title_for_search(&s4);
        let trimmed = base_cleaned
            .trim_matches(|c: char| c.is_whitespace() || matches!(c, '-' | '–' | '—' | '|' | '/'))
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        if trimmed.is_empty() {
            Self::clean_title_for_search(title)
        } else {
            trimmed
        }
    }

    pub fn normalize_text(text: &str) -> String {
        #[derive(Clone, Copy, PartialEq, Eq)]
        enum Kind {
            Sep,
            AsciiOrLatin,
            Cjk,
        }

        let nfkc: String = text.nfkc().collect();
        let mut out = String::with_capacity(nfkc.len() + 8);
        let mut prev_kind = Kind::Sep;

        for raw_ch in nfkc.chars() {
            let ch = Self::t2s_char(raw_ch);
            if Self::is_cjk(ch) {
                if prev_kind == Kind::AsciiOrLatin {
                    out.push(' ');
                }
                out.push(ch);
                prev_kind = Kind::Cjk;
            } else {
                for dc in ch.to_string().nfkd() {
                    if ('\u{0300}'..='\u{036f}').contains(&dc) {
                        continue;
                    }
                    let mapped = match dc {
                        'đ' | 'Đ' => 'd',
                        other => other,
                    };
                    for lc in mapped.to_lowercase() {
                        if lc.is_alphanumeric() {
                            if prev_kind == Kind::Cjk {
                                out.push(' ');
                            }
                            out.push(lc);
                            prev_kind = Kind::AsciiOrLatin;
                        } else if prev_kind != Kind::Sep {
                            out.push(' ');
                            prev_kind = Kind::Sep;
                        }
                    }
                }
            }
        }

        out.trim().to_string()
    }

    pub fn normalize_title(title: &str) -> String {
        Self::normalize_text(&Self::clean_title_for_search(title))
    }

    fn strip_version_tokens(norm: &str) -> String {
        const STRIP_TOKENS: &[&str] = &[
            "remix",
            "dj",
            "cover",
            "slowed",
            "sped",
            "speed",
            "up",
            "nightcore",
            "reverb",
            "acoustic",
            "live",
            "instrumental",
            "inst",
            "karaoke",
            "bootleg",
            "mashup",
            "vinahouse",
            "vip",
            "lofi",
            "audio",
            "lyrics",
            "lyric",
            "mv",
            "official",
            "hd",
            "hq",
            "4k",
            "electro",
            "club",
            "mix",
            "extended",
            "版",
            "翻唱",
            "慢摇",
            "电音",
            "加速",
            "纯音乐",
            "现场",
            "舞曲",
            "混音",
            "伴奏",
        ];
        norm.split_whitespace()
            .filter(|tok| !STRIP_TOKENS.contains(tok))
            .collect::<Vec<_>>()
            .join(" ")
    }

    pub fn has_instrumental_intent(text: &str) -> bool {
        let norm = Self::normalize_text(text);
        if norm.is_empty() {
            return false;
        }
        let padded = format!(" {norm} ");
        if Self::INSTRUMENTAL_LATIN_KEYWORDS
            .iter()
            .any(|kw| padded.contains(&format!(" {kw} ")))
        {
            return true;
        }
        let compact = norm.replace(' ', "");
        Self::INSTRUMENTAL_CJK_KEYWORDS
            .iter()
            .any(|kw| compact.contains(kw))
    }

    pub fn is_instrumental_candidate(candidate: &SongItem, source_artist: &str) -> bool {
        if Self::has_instrumental_intent(&candidate.title) {
            return true;
        }
        if candidate
            .album
            .as_ref()
            .map(|a| Self::has_instrumental_intent(&a.name))
            .unwrap_or(false)
        {
            return true;
        }
        if !Self::has_instrumental_intent(source_artist) {
            let matches_chan_kw = |raw: &str| {
                let norm = Self::normalize_text(raw);
                if norm.is_empty() {
                    return false;
                }
                let padded = format!(" {norm} ");
                let compact = norm.replace(' ', "");
                Self::INSTRUMENTAL_CHANNEL_KEYWORDS.iter().any(|kw| {
                    if Self::contains_cjk(kw) {
                        compact.contains(kw)
                    } else {
                        padded.contains(&format!(" {kw} "))
                    }
                })
            };
            if candidate
                .author
                .as_deref()
                .map(matches_chan_kw)
                .unwrap_or(false)
                || candidate.artists.iter().any(|a| matches_chan_kw(&a.name))
            {
                return true;
            }
        }
        false
    }

    pub fn vocal_quality_bonus(title: &str) -> f64 {
        let norm = Self::normalize_text(title);
        let padded = format!(" {norm} ");
        let mut bonus = 0.0f64;
        if padded.contains(" official ") {
            bonus += 0.08;
        }
        if padded.contains(" audio ")
            || padded.contains(" lyrics ")
            || padded.contains(" lyric ")
            || padded.contains(" loi bai hat ")
            || norm.contains("歌词")
            || norm.contains("纯享")
            || norm.contains("无损")
        {
            bonus += 0.08;
        }
        bonus.min(0.14)
    }

    fn extract_version_groups(norm: &str) -> Vec<&'static str> {
        let padded = format!(" {norm} ");
        let mut groups = Vec::new();
        let has_word = |w: &str| padded.contains(&format!(" {w} "));

        let is_remix = has_word("remix")
            || has_word("dj")
            || has_word("bootleg")
            || has_word("vinahouse")
            || has_word("edm")
            || has_word("megamix")
            || norm.contains("电音")
            || norm.contains("慢摇")
            || norm.contains("混音")
            || norm.contains("舞曲");
        if is_remix {
            groups.push("remix");
        }

        if has_word("cover")
            || norm.contains("翻唱")
            || norm.contains("女声版")
            || norm.contains("男声版")
            || norm.contains("烟嗓版")
        {
            groups.push("cover");
        }

        if has_word("slowed") || has_word("reverb") || norm.contains("降调") || norm.contains("慢速") {
            groups.push("slowed");
        }

        if padded.contains(" sped up ")
            || padded.contains(" speed up ")
            || has_word("nightcore")
            || norm.contains("加速")
            || norm.contains("加快")
            || norm.contains("升调")
        {
            groups.push("sped_up");
        }

        if has_word("live") || has_word("concert") || has_word("unplugged") || norm.contains("现场") {
            groups.push("live");
        }

        if has_word("instrumental")
            || has_word("instrument")
            || has_word("inst")
            || has_word("karaoke")
            || has_word("beat")
            || has_word("beats")
            || has_word("playback")
            || padded.contains(" khong loi ")
            || padded.contains(" nhac nen ")
            || padded.contains(" off vocal ")
            || padded.contains(" offvocal ")
            || norm.contains("伴奏")
            || norm.contains("纯音乐")
            || norm.contains("钢琴版")
        {
            groups.push("inst");
        }

        groups
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
        let chars_a = compact_a.chars().count();
        let chars_b = compact_b.chars().count();
        let max_len = chars_a.max(chars_b);
        let edit = if max_len > 0 {
            1.0 - Self::levenshtein(&compact_a, &compact_b) as f64 / max_len as f64
        } else {
            0.0
        };

        let a_has_cjk = Self::contains_cjk(&compact_a);
        let b_has_cjk = Self::contains_cjk(&compact_b);
        let min_contain_chars = if a_has_cjk || b_has_cjk { 2 } else { 3 };

        let containment = if chars_a >= min_contain_chars
            && chars_b >= min_contain_chars
            && (compact_a.contains(&compact_b) || compact_b.contains(&compact_a))
        {
            if a_has_cjk && chars_a >= 2 && compact_b.contains(&compact_a) {
                0.85
            } else {
                0.80
            }
        } else {
            0.0
        };

        let target_token_recall = if !tokens_a.is_empty() && (a_has_cjk || chars_a >= 4) {
            (intersection as f64 / tokens_a.len() as f64) * 0.85
        } else {
            0.0
        };

        let cjk_recall_score = if a_has_cjk {
            let cjk_a: Vec<char> = compact_a.chars().filter(|c| Self::is_cjk(*c)).collect();
            let cjk_b: HashSet<char> = compact_b.chars().filter(|c| Self::is_cjk(*c)).collect();
            if cjk_a.len() >= 2 {
                let common = cjk_a.iter().filter(|c| cjk_b.contains(c)).count();
                let recall = common as f64 / cjk_a.len() as f64;
                if recall >= 0.75 {
                    recall * 0.84
                } else {
                    0.0
                }
            } else {
                0.0
            }
        } else {
            0.0
        };

        jaccard
            .max(edit)
            .max(containment)
            .max(target_token_recall)
            .max(cjk_recall_score)
    }

    fn is_rejected_compilation(track: &ImportedTrack, candidate: &SongItem) -> bool {
        if let Some(dur) = candidate.duration {
            if dur > 0 && dur <= 15 {
                return true;
            }
        }

        let target_norm = Self::normalize_text(&track.title);
        let cand_norm = Self::normalize_text(&candidate.title);
        let cand_padded = format!(" {cand_norm} ");
        let target_padded = format!(" {target_norm} ");

        let has_comp_kw = Self::COMPILATION_KEYWORDS.iter().any(|kw| {
            let in_cand = if Self::contains_cjk(kw) {
                cand_norm.contains(kw)
            } else {
                cand_padded.contains(&format!(" {kw} "))
            };
            let in_target = if Self::contains_cjk(kw) {
                target_norm.contains(kw)
            } else {
                target_padded.contains(&format!(" {kw} "))
            };
            in_cand && !in_target
        });
        if has_comp_kw {
            return true;
        }

        if let Some(dur) = candidate.duration.filter(|d| *d > 0) {
            if let Some(ms) = track.duration_ms.filter(|m| *m > 0) {
                let target_sec = ms as f64 / 1000.0;
                if target_sec < 480.0 && (dur > 600 || dur as f64 > target_sec * 2.0 + 60.0) {
                    return true;
                }
            } else if dur > 720
                && !target_norm.contains("mix")
                && !target_norm.contains("nonstop")
                && !target_norm.contains("hour")
                && !target_norm.contains("串烧")
                && !target_norm.contains("连播")
            {
                return true;
            }
        }

        false
    }

    fn duration_score_for_tier(
        source_ms: Option<i64>,
        candidate_sec: Option<i64>,
        tier: MatchTier,
    ) -> f64 {
        match (source_ms, candidate_sec) {
            (Some(ms), Some(sec)) if ms > 0 && sec > 0 => {
                let diff = (ms as f64 / 1000.0 - sec as f64).abs();
                match tier {
                    MatchTier::Tier1YtmSong => {
                        if diff <= Self::CLOSE_SECONDS {
                            1.0
                        } else if diff <= 10.0 {
                            0.35
                        } else if diff <= 15.0 {
                            -0.35
                        } else {
                            -999.0
                        }
                    }
                    MatchTier::Tier2YtVideo | MatchTier::Tier3SoundCloud => {
                        if diff <= Self::CLOSE_SECONDS {
                            1.0
                        } else if diff <= 12.0 {
                            0.75
                        } else if diff <= 25.0 {
                            0.40
                        } else if diff <= 45.0 {
                            0.05
                        } else if diff <= 90.0 {
                            -0.25
                        } else {
                            -999.0
                        }
                    }
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

    fn upload_score_for_tier(
        candidate: &SongItem,
        target_norm: &str,
        tier: MatchTier,
        target_wants_instrumental: bool,
    ) -> f64 {
        let mut bonus = 0.0;
        let cand_lower = Self::normalize_text(&candidate.title);
        let cand_padded = format!(" {cand_lower} ");

        match tier {
            MatchTier::Tier1YtmSong => {
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
            }
            MatchTier::Tier2YtVideo => {
                if (cand_padded.contains(" reaction ")
                    || cand_padded.contains(" tutorial ")
                    || cand_padded.contains(" lesson ")
                    || cand_padded.contains(" fancam ")
                    || cand_padded.contains(" dance practice ")
                    || cand_padded.contains(" rehearsal ")
                    || cand_padded.contains(" piano cover "))
                    && !target_norm.contains("reaction")
                    && !target_norm.contains("tutorial")
                {
                    bonus -= 0.25;
                }
            }
            MatchTier::Tier3SoundCloud => {
                if cand_padded.contains(" remix ") || cand_padded.contains(" dj ") {
                    bonus += 0.05;
                }
            }
        }

        if !target_wants_instrumental {
            bonus += Self::vocal_quality_bonus(&candidate.title);
        }

        bonus
    }

    fn is_generic_artist(norm_artist: &str) -> bool {
        matches!(
            norm_artist,
            "" | "various artists" | "unknown" | "dj" | "tiktok" | "douyin" | "v a" | "va"
        )
    }

    pub fn score_for_tier(
        &self,
        track: &ImportedTrack,
        candidate: &SongItem,
        tier: MatchTier,
    ) -> f64 {
        let target_wants_instrumental = Self::has_instrumental_intent(&track.title);
        self.score_for_tier_with_mode(track, candidate, tier, target_wants_instrumental)
    }

    pub fn score_for_tier_with_mode(
        &self,
        track: &ImportedTrack,
        candidate: &SongItem,
        tier: MatchTier,
        allow_instrumental: bool,
    ) -> f64 {
        if Self::is_rejected_compilation(track, candidate) {
            return 0.0;
        }

        let cand_is_instrumental = Self::is_instrumental_candidate(candidate, &track.artist);
        if !allow_instrumental && cand_is_instrumental {
            return 0.0;
        }

        let d_score = Self::duration_score_for_tier(track.duration_ms, candidate.duration, tier);
        if d_score == -999.0 {
            return 0.0;
        }

        let target_norm = Self::normalize_title(&track.title);
        let target_core = Self::strip_version_tokens(&target_norm);

        let promo_stripped = Self::strip_yt_promo_brackets(&candidate.title);
        let cand_norm_raw = Self::normalize_title(&candidate.title);
        let cand_norm_promo = Self::normalize_title(&promo_stripped);
        let cand_core_promo = Self::strip_version_tokens(&cand_norm_promo);

        let mut title_score = Self::similarity(&target_norm, &cand_norm_raw)
            .max(Self::similarity(&target_norm, &cand_norm_promo));
        if !target_core.is_empty() && !cand_core_promo.is_empty() {
            title_score = title_score.max(Self::similarity(&target_core, &cand_core_promo) * 0.96);
        }

        let raw_target_artists: Vec<String> = Self::split_artists(&track.artist)
            .into_iter()
            .map(|a| Self::normalize_text(&a))
            .filter(|a| !a.is_empty())
            .collect();
        let target_artists: Vec<String> = raw_target_artists
            .iter()
            .filter(|a| !Self::is_generic_artist(a))
            .cloned()
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
                    let max_art = candidate_artists
                        .iter()
                        .map(|c| Self::similarity(t, c))
                        .fold(0.0f64, f64::max);
                    if candidate_author.is_empty() {
                        max_art
                    } else {
                        max_art.max(Self::similarity(t, &candidate_author))
                    }
                })
                .fold(0.0f64, f64::max)
        };

        let cand_compact = cand_norm_promo.replace(' ', "");
        let primary_compact = primary_artist.replace(' ', "");

        let primary_in_artists = !primary_artist.is_empty()
            && (candidate_artists.iter().any(|c| {
                Self::similarity(primary_artist, c) >= 0.65
                    || c.contains(primary_artist)
                    || primary_artist.contains(c.as_str())
            }) || (!candidate_author.is_empty()
                && (Self::similarity(primary_artist, &candidate_author) >= 0.65
                    || candidate_author.contains(primary_artist)
                    || primary_artist.contains(candidate_author.as_str()))));

        let primary_in_title = !primary_artist.is_empty()
            && (cand_norm_promo.contains(primary_artist)
                || (primary_compact.chars().count() >= 2
                    && cand_compact.contains(&primary_compact)));

        let diff_sec = match (track.duration_ms, candidate.duration) {
            (Some(ms), Some(sec)) if ms > 0 && sec > 0 => {
                Some((ms as f64 / 1000.0 - sec as f64).abs())
            }
            _ => None,
        };

        if primary_artist.chars().count() >= 2 && !primary_in_artists && !primary_in_title {
            match tier {
                MatchTier::Tier1YtmSong => {
                    let is_very_close_dur =
                        diff_sec.map(|d| d <= Self::CLOSE_SECONDS).unwrap_or(false);
                    if title_score >= 0.88 && is_very_close_dur {
                        artist_score = artist_score.max(0.35);
                    } else {
                        return 0.0;
                    }
                }
                MatchTier::Tier2YtVideo | MatchTier::Tier3SoundCloud => {
                    if title_score >= 0.68 {
                        let is_close_dur = diff_sec.map(|d| d <= 8.0).unwrap_or(false);
                        artist_score = artist_score.max(if is_close_dur { 0.40 } else { 0.25 });
                    } else {
                        return 0.0;
                    }
                }
            }
        }

        if target_artists.iter().any(|a| !a.is_empty() && cand_norm_promo.contains(a.as_str())) {
            artist_score = artist_score.max(0.85);
            let mut stripped = cand_norm_promo.clone();
            for a in &target_artists {
                stripped = stripped.replace(a.as_str(), " ");
            }
            let stripped_trim = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
            let stripped_core = Self::strip_version_tokens(&stripped_trim);
            title_score = title_score.max(Self::similarity(&target_norm, &stripped_trim));
            if !target_core.is_empty() && !stripped_core.is_empty() {
                title_score = title_score.max(Self::similarity(&target_core, &stripped_core));
            }
        }

        let min_title = match tier {
            MatchTier::Tier1YtmSong => 0.40,
            MatchTier::Tier2YtVideo | MatchTier::Tier3SoundCloud => 0.38,
        };
        if title_score < min_title {
            return 0.0;
        }

        let target_full_norm = Self::normalize_text(&track.title);
        let cand_full_norm = Self::normalize_text(&promo_stripped);
        let target_groups = Self::extract_version_groups(&target_full_norm);
        let cand_groups = Self::extract_version_groups(&cand_full_norm);

        let target_wants_any_version = !target_groups.is_empty() || target_full_norm.contains("版");
        let version_matched = target_groups.iter().any(|g| cand_groups.contains(g))
            || (target_full_norm.contains("版") && !cand_groups.is_empty())
            || (allow_instrumental && cand_is_instrumental);
        let has_unwanted_version =
            !target_wants_any_version && !cand_groups.is_empty() && !(allow_instrumental && cand_is_instrumental);

        let version_bonus = if version_matched { 0.12 } else { 0.0 };

        let mut total = title_score * 0.50
            + artist_score * 0.25
            + d_score * 0.25
            + version_bonus
            + Self::album_score(
                track.album.as_deref(),
                candidate.album.as_ref().map(|a| a.name.as_str()),
            )
            + Self::upload_score_for_tier(
                candidate,
                &target_full_norm,
                tier,
                allow_instrumental,
            );

        if has_unwanted_version {
            total *= if tier == MatchTier::Tier1YtmSong {
                0.45
            } else {
                0.55
            };
        }

        total.clamp(0.0, 1.0)
    }

    #[allow(dead_code)]
    pub fn score(&self, track: &ImportedTrack, candidate: &SongItem) -> f64 {
        let inferred_tier = match candidate.source.as_deref() {
            Some("soundcloud") => MatchTier::Tier3SoundCloud,
            Some("yt_video") => MatchTier::Tier2YtVideo,
            _ if candidate.is_video_song => MatchTier::Tier2YtVideo,
            _ => MatchTier::Tier1YtmSong,
        };
        self.score_for_tier(track, candidate, inferred_tier)
    }

    fn search_query(track: &ImportedTrack) -> String {
        let clean_title = Self::clean_title_for_search(&track.title);
        let artists = Self::split_artists(&track.artist);
        let first_artist = artists
            .iter()
            .find(|a| !Self::is_generic_artist(&Self::normalize_text(a)))
            .map(|s| s.as_str())
            .unwrap_or("");

        if first_artist.is_empty() {
            return clean_title;
        }
        let norm_title = Self::normalize_text(&clean_title);
        let norm_artist = Self::normalize_text(first_artist);
        if !norm_artist.is_empty() && norm_title.contains(&norm_artist) {
            clean_title
        } else {
            format!("{clean_title} {first_artist}").trim().to_string()
        }
    }

    async fn search_songs_with_retry(inner: &InnerTube, query: &str) -> Vec<SongItem> {
        for attempt in 0..2 {
            match YouTube::search_songs(inner, query).await {
                Ok(res) => return res.into_iter().take(12).collect(),
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
                            if let Ok(mut s) = serde_json::from_value::<SongItem>(it) {
                                if s.source.is_none() {
                                    s.source = Some(if s.is_video_song {
                                        "yt_video".to_string()
                                    } else {
                                        "ytm_song".to_string()
                                    });
                                }
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

    async fn search_yt_videos_with_retry(inner: &InnerTube, query: &str) -> Vec<SongItem> {
        for attempt in 0..2 {
            match YouTube::search_youtube_videos(inner, query).await {
                Ok(res) => return res.into_iter().take(15).collect(),
                Err(_) if attempt == 0 => sleep(Duration::from_millis(300)).await,
                Err(_) => break,
            }
        }
        vec![]
    }

    async fn search_soundcloud_with_retry(client: &Client, query: &str, limit: usize) -> Vec<SongItem> {
        for attempt in 0..2 {
            match soundcloud::search_tracks(client, query, limit).await {
                Ok(res) => return res,
                Err(_) if attempt == 0 => sleep(Duration::from_millis(250)).await,
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
        // Vocal-First Search: always strip distracting Beat / Beat Lofi / Instrument / Instrumental
        // tags from Spotify metadata so we search for and match the official vocal version first.
        let vocal_title = Self::clean_title_for_vocal_search(&track.title);
        let vocal_track = ImportedTrack {
            title: vocal_title.clone(),
            ..track.clone()
        };

        let cache_key = format!(
            "{}|{}|{}",
            Self::normalize_title(&vocal_track.title),
            Self::normalize_text(&vocal_track.artist),
            ((vocal_track.duration_ms.unwrap_or(0) as f64) / 5000.0).round() as i64
        );
        if let Some(cached) = self.cache.get(&cache_key) {
            return cached.clone();
        }

        let clean_title = Self::clean_title_for_search(&vocal_track.title);
        let q_primary = Self::search_query(&vocal_track);
        let source_sec = vocal_track
            .duration_ms
            .map(|ms| ms as f64 / 1000.0)
            .filter(|s| *s > 0.0);

        // ==================== PASS 1: VOCAL-FIRST (STRICT ANTI-INSTRUMENTAL) ====================
        // Tier 1: YouTube Music (Songs)
        let songs = Self::search_songs_with_retry(inner, &q_primary).await;
        let scored_songs: Vec<(&SongItem, f64)> = songs
            .iter()
            .map(|s| {
                (
                    s,
                    self.score_for_tier_with_mode(&vocal_track, s, MatchTier::Tier1YtmSong, false),
                )
            })
            .collect();

        if let Some(best_t1) = self.pick(&vocal_track, &scored_songs, Self::SONG_ACCEPT) {
            let best_score = scored_songs
                .iter()
                .find(|(s, _)| s.id == best_t1.id)
                .map(|(_, sc)| *sc)
                .unwrap_or(0.0);
            let close_dur = match (source_sec, best_t1.duration) {
                (Some(ss), Some(d)) => (d as f64 - ss).abs() <= Self::CLOSE_SECONDS,
                (None, _) => true,
                _ => false,
            };
            if close_dur || best_score >= 0.78 {
                self.cache.insert(cache_key, Some(best_t1.clone()));
                return Some(best_t1);
            }
        }
        let tier1_backup = self.pick(&vocal_track, &scored_songs, Self::SONG_FALLBACK_ACCEPT);

        // Tier 2: YouTube Videos first, then YT Music General only if needed
        let yt_videos = Self::search_yt_videos_with_retry(inner, &q_primary).await;
        let mut seen_t2 = HashSet::new();
        let mut t2_pool = Vec::new();
        for item in yt_videos {
            if !item.id.is_empty() && seen_t2.insert(item.id.clone()) {
                t2_pool.push(item);
            }
        }

        let scored_t2_first: Vec<(&SongItem, f64)> = t2_pool
            .iter()
            .map(|v| {
                (
                    v,
                    self.score_for_tier_with_mode(&vocal_track, v, MatchTier::Tier2YtVideo, false),
                )
            })
            .collect();
        if let Some(best_t2) = self.pick(&vocal_track, &scored_t2_first, Self::VIDEO_ACCEPT) {
            self.cache.insert(cache_key, Some(best_t2.clone()));
            return Some(best_t2);
        }

        let ytm_general = Self::search_general_with_retry(inner, &q_primary).await;
        for item in ytm_general {
            if !item.id.is_empty() && seen_t2.insert(item.id.clone()) {
                t2_pool.push(item);
            }
        }

        let scored_t2: Vec<(&SongItem, f64)> = t2_pool
            .iter()
            .map(|v| {
                (
                    v,
                    self.score_for_tier_with_mode(&vocal_track, v, MatchTier::Tier2YtVideo, false),
                )
            })
            .collect();
        if let Some(best_t2) = self.pick(&vocal_track, &scored_t2, Self::VIDEO_ACCEPT) {
            self.cache.insert(cache_key, Some(best_t2.clone()));
            return Some(best_t2);
        }

        // Secondary Tier 2 query (handles CJK/Pinyin/DJ mismatch or missing "audio" keyword)
        let norm_t = Self::normalize_text(&clean_title);
        let has_version_or_cjk = Self::contains_cjk(&clean_title)
            || Self::has_keyword(&norm_t, Self::PRESERVED_VERSION_KEYWORDS);
        let q2_alt = if has_version_or_cjk && q_primary != clean_title {
            format!("{clean_title} audio")
        } else {
            format!("{q_primary} audio")
        };

        let mut alt_videos = Vec::new();
        if q2_alt != q_primary {
            alt_videos = Self::search_yt_videos_with_retry(inner, &q2_alt).await;
            let scored_alt: Vec<(&SongItem, f64)> = alt_videos
                .iter()
                .map(|v| {
                    (
                        v,
                        self.score_for_tier_with_mode(
                            &vocal_track,
                            v,
                            MatchTier::Tier2YtVideo,
                            false,
                        ),
                    )
                })
                .collect();
            if let Some(best_alt) = self.pick(&vocal_track, &scored_alt, Self::VIDEO_ALT_ACCEPT) {
                self.cache.insert(cache_key, Some(best_alt.clone()));
                return Some(best_alt);
            }
        }

        if let Some(backup) = tier1_backup {
            self.cache.insert(cache_key, Some(backup.clone()));
            return Some(backup);
        }

        // Tier 3: SoundCloud Public Search (Vocal-only)
        let mut sc_tracks = Self::search_soundcloud_with_retry(&inner.client, &q_primary, 8).await;
        if sc_tracks.is_empty() && clean_title != q_primary {
            sc_tracks = Self::search_soundcloud_with_retry(&inner.client, &clean_title, 8).await;
        }
        let scored_sc: Vec<(&SongItem, f64)> = sc_tracks
            .iter()
            .map(|s| {
                (
                    s,
                    self.score_for_tier_with_mode(
                        &vocal_track,
                        s,
                        MatchTier::Tier3SoundCloud,
                        false,
                    ),
                )
            })
            .collect();
        if let Some(best_sc) = self.pick(&vocal_track, &scored_sc, Self::SOUNDCLOUD_ACCEPT) {
            self.cache.insert(cache_key, Some(best_sc.clone()));
            return Some(best_sc);
        }

        // ==================== PASS 2: INSTRUMENTAL FALLBACK (ONLY IF NO VOCAL EXISTS) ====================
        let inst_t1: Vec<(&SongItem, f64)> = songs
            .iter()
            .map(|s| {
                (
                    s,
                    self.score_for_tier_with_mode(&vocal_track, s, MatchTier::Tier1YtmSong, true),
                )
            })
            .collect();
        if let Some(fb_t1) = self.pick(&vocal_track, &inst_t1, Self::SONG_ACCEPT) {
            self.cache.insert(cache_key, Some(fb_t1.clone()));
            return Some(fb_t1);
        }

        let inst_t2: Vec<(&SongItem, f64)> = t2_pool
            .iter()
            .chain(alt_videos.iter())
            .map(|v| {
                (
                    v,
                    self.score_for_tier_with_mode(&vocal_track, v, MatchTier::Tier2YtVideo, true),
                )
            })
            .collect();
        if let Some(fb_t2) = self.pick(&vocal_track, &inst_t2, Self::VIDEO_ACCEPT) {
            self.cache.insert(cache_key, Some(fb_t2.clone()));
            return Some(fb_t2);
        }

        let inst_sc: Vec<(&SongItem, f64)> = sc_tracks
            .iter()
            .map(|s| {
                (
                    s,
                    self.score_for_tier_with_mode(
                        &vocal_track,
                        s,
                        MatchTier::Tier3SoundCloud,
                        true,
                    ),
                )
            })
            .collect();
        if let Some(fb_sc) = self.pick(&vocal_track, &inst_sc, Self::SOUNDCLOUD_ACCEPT) {
            self.cache.insert(cache_key, Some(fb_sc.clone()));
            return Some(fb_sc);
        }

        None
    }

    pub async fn get_candidates(
        &self,
        inner: &InnerTube,
        title: &str,
        artist: &str,
        duration_ms: Option<i64>,
    ) -> Vec<CandidateResult> {
        let vocal_title = Self::clean_title_for_vocal_search(title);
        let dummy = ImportedTrack {
            title: vocal_title,
            artist: artist.to_string(),
            album: None,
            duration_ms,
            source_id: None,
            thumbnail_url: None,
            added_at_ms: None,
        };
        let query = Self::search_query(&dummy);
        let q_lower = query.to_lowercase();
        let allow_long = q_lower.contains("mix")
            || q_lower.contains("hour")
            || q_lower.contains("nonstop")
            || q_lower.contains("串烧")
            || q_lower.contains("连播");

        let (songs, yt_videos, sc_tracks) = tokio::join!(
            Self::search_songs_with_retry(inner, &query),
            Self::search_yt_videos_with_retry(inner, &query),
            Self::search_soundcloud_with_retry(&inner.client, &query, 5)
        );

        let mut seen = HashSet::new();
        let mut vocal_candidates: Vec<(usize, CandidateResult)> = Vec::new();
        let mut fallback_candidates: Vec<(usize, CandidateResult)> = Vec::new();
        let mut idx = 0usize;

        for (item, tier) in songs
            .into_iter()
            .map(|s| (s, MatchTier::Tier1YtmSong))
            .chain(yt_videos.into_iter().map(|s| (s, MatchTier::Tier2YtVideo)))
            .chain(sc_tracks.into_iter().map(|s| (s, MatchTier::Tier3SoundCloud)))
        {
            if item.id.is_empty() || !seen.insert(item.id.clone()) {
                continue;
            }
            if !allow_long && item.duration.unwrap_or(0) > 1800 {
                continue;
            }
            let is_inst = Self::is_instrumental_candidate(&item, artist);
            let s = (self
                .score_for_tier_with_mode(&dummy, &item, tier, is_inst)
                * 100.0)
                .round()
                / 100.0;
            let entry = (
                idx,
                CandidateResult {
                    song: item,
                    score: s,
                },
            );
            if is_inst {
                fallback_candidates.push(entry);
            } else {
                vocal_candidates.push(entry);
            }
            idx += 1;
        }

        let mut candidates = if vocal_candidates.is_empty() {
            fallback_candidates
        } else {
            vocal_candidates
        };

        candidates.sort_by(|a, b| {
            b.1.score
                .partial_cmp(&a.1.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.0.cmp(&b.0))
        });

        candidates
            .into_iter()
            .take(12)
            .map(|(_, c)| c)
            .collect()
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

    /// Preserves original Spotify metadata (title, artist, thumbnail, album) while
    /// binding the resolved YouTube/SoundCloud playback ID (`item.id`) underneath.
    fn build_imported_db_song(track: &ImportedTrack, item: SongItem) -> DbSong {
        let preserved_title = {
            let t = track.title.trim();
            if t.is_empty() {
                item.title
            } else {
                t.to_string()
            }
        };
        let preserved_artists = if !track.artist.trim().is_empty() {
            vec![crate::models::Artist {
                name: track.artist.trim().to_string(),
                id: None,
            }]
        } else if !item.artists.is_empty() {
            item.artists
        } else {
            vec![crate::models::Artist {
                name: "Unknown".to_string(),
                id: None,
            }]
        };
        let dur = item.duration.unwrap_or_else(|| {
            track
                .duration_ms
                .map(|ms| (ms as f64 / 1000.0).round() as i64)
                .unwrap_or(-1)
        });
        let preserved_thumb = track
            .thumbnail_url
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| item.thumbnail.filter(|s| !s.trim().is_empty()));
        let preserved_album = track
            .album
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| item.album.map(|a| a.name));
        let now = now_ms();

        DbSong {
            id: item.id,
            title: preserved_title,
            artists: preserved_artists,
            duration: dur,
            thumbnail_url: preserved_thumb.clone(),
            thumbnail: preserved_thumb,
            album_id: None,
            album_name: preserved_album,
            explicit: item.explicit,
            year: None,
            liked: false,
            liked_date: None,
            total_play_time: 0,
            in_library: Some(now),
            created_at: now,
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
        let mut unmatched_tracks: Vec<ImportedTrack> = Vec::new();

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

            let matched_item = {
                let mut m = self.matcher.lock().await;
                m.match_track(inner, track).await
            };

            if let Some(item) = matched_item {
                matched_count += 1;
                matched_songs.push(Self::build_imported_db_song(track, item));
            } else {
                unmatched_tracks.push(track.clone());
            }

            if i + 1 < total {
                sleep(Duration::from_millis(450)).await;
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
                Some(p) => {
                    if !matched_songs.is_empty() {
                        let _ = db.clear_playlist_songs(&p.id);
                    }
                    p
                }
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
            playlist_name: Some(parsed.title.clone()),
            is_liked: false,
            unmatched_tracks,
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
        let mut unmatched_tracks: Vec<ImportedTrack> = Vec::new();

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

            let matched_item = {
                let mut m = self.matcher.lock().await;
                m.match_track(inner, track).await
            };

            if let Some(item) = matched_item {
                matched_count += 1;
                matched_songs.push(Self::build_imported_db_song(track, item));
            } else {
                unmatched_tracks.push(track.clone());
            }

            if i + 1 < total {
                sleep(Duration::from_millis(450)).await;
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

        let is_liked = remote.is_liked.unwrap_or(false);
        let mut playlist_id: Option<String> = None;
        if is_liked {
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
                Some(p) => {
                    if !matched_songs.is_empty() {
                        let _ = db.clear_playlist_songs(&p.id);
                    }
                    p
                }
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
            playlist_name: Some(remote.name),
            is_liked,
            unmatched_tracks,
        })
    }
}
