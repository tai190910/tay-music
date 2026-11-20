use crate::models::{LyricsEntry, LyricsResult, ParsedLyrics, WordTimestamp};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use regex::Regex;
use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub struct LyricsUtils;

impl LyricsUtils {
    pub fn clean_title(title: &str) -> String {
        let patterns = [
            r"(?i)\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)",
            r"(?i)\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]",
            r"\s*【.*?】",
            r"\s*\|.*$",
            r"(?i)\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$",
            r"(?i)\s*\(feat\..*?\)",
            r"(?i)\s*\(ft\..*?\)",
            r"(?i)\s*feat\..*$",
            r"(?i)\s*ft\..*$",
        ];
        let mut cleaned = title.trim().to_string();
        for pat in patterns {
            if let Ok(re) = Regex::new(pat) {
                cleaned = re.replace_all(&cleaned, "").to_string();
            }
        }
        cleaned.trim().to_string()
    }

    pub fn clean_artist(artist: &str) -> String {
        let separators = [
            " & ",
            " and ",
            ", ",
            " x ",
            " X ",
            " feat. ",
            " feat ",
            " ft. ",
            " ft ",
            " featuring ",
            " with ",
        ];
        let mut cleaned = artist.trim().to_string();
        let lower = cleaned.to_lowercase();
        for sep in separators {
            if let Some(idx) = lower.find(&sep.to_lowercase()) {
                if idx > 0 {
                    cleaned = cleaned[..idx].to_string();
                    break;
                }
            }
        }
        cleaned.trim().to_string()
    }

    fn decode_html_entities(s: &str) -> String {
        s.replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&#39;", "'")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&nbsp;", " ")
    }

    fn parse_timestamp(min_str: &str, sec_str: &str, ms_str: &str) -> i64 {
        let min: i64 = min_str.parse().unwrap_or(0);
        let sec: i64 = sec_str.parse().unwrap_or(0);
        let mut ms: i64 = ms_str.parse().unwrap_or(0);
        if ms_str.len() == 2 {
            ms *= 10;
        }
        min * 60000 + sec * 1000 + ms
    }

    pub fn parse_lyrics(raw_lrc: &str) -> ParsedLyrics {
        if raw_lrc.trim().is_empty() {
            return ParsedLyrics {
                lines: vec![],
                is_synced: false,
                raw: raw_lrc.to_string(),
            };
        }

        let unescaped = raw_lrc
            .trim()
            .trim_start_matches('"')
            .trim_end_matches('"')
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
            .replace("\\\\", "\\");

        let decoded = Self::decode_html_entities(&unescaped);
        let raw_lines: Vec<String> = decoded
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty() && !l.starts_with("[offset:"))
            .collect();

        static YRC_CHECK_RE: OnceLock<Regex> = OnceLock::new();
        let yrc_re = YRC_CHECK_RE.get_or_init(|| Regex::new(r"^\[\d+,\d+\]\(\d+,\d+,-?\d+\)").unwrap());
        if raw_lines.iter().any(|l| yrc_re.is_match(l)) {
            let yrc_entries = Self::parse_yrc(&raw_lines);
            if !yrc_entries.is_empty() {
                return ParsedLyrics {
                    lines: yrc_entries,
                    is_synced: true,
                    raw: raw_lrc.to_string(),
                };
            }
        }

        static META_RE: OnceLock<Regex> = OnceLock::new();
        static LRC_LINE_RE: OnceLock<Regex> = OnceLock::new();
        static TS_TAG_RE: OnceLock<Regex> = OnceLock::new();
        static WORD_SYNC_RE: OnceLock<Regex> = OnceLock::new();
        static WORD_CLEAN_RE: OnceLock<Regex> = OnceLock::new();
        static AGENT_RE: OnceLock<Regex> = OnceLock::new();
        static BG_RE: OnceLock<Regex> = OnceLock::new();

        let meta_re = META_RE.get_or_init(|| Regex::new(r"(?i)^\[(ti|ar|al|by|offset|length|re|ve):").unwrap());
        let lrc_line_re = LRC_LINE_RE.get_or_init(|| Regex::new(r"^((?:\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]\s*)+)(.*)$").unwrap());
        let ts_tag_re = TS_TAG_RE.get_or_init(|| Regex::new(r"\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]").unwrap());
        let word_sync_re = WORD_SYNC_RE.get_or_init(|| Regex::new(r"<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>\s*([^<]+)").unwrap());
        let word_clean_re = WORD_CLEAN_RE.get_or_init(|| Regex::new(r"<\d{1,2}:\d{2}(?:\.\d{2,3})?>").unwrap());
        let agent_re = AGENT_RE.get_or_init(|| Regex::new(r"\{agent:([^}]+)\}").unwrap());
        let bg_re = BG_RE.get_or_init(|| Regex::new(r"^\{bg\}\s*").unwrap());

        let mut entries: Vec<LyricsEntry> = Vec::new();
        let mut has_timestamp = false;

        for line in &raw_lines {
            if meta_re.is_match(line) {
                continue;
            }
            if let Some(caps) = lrc_line_re.captures(line) {
                has_timestamp = true;
                let time_header = &caps[1];
                let mut line_text = caps[2].trim().to_string();

                let mut agent: Option<String> = None;
                if let Some(acaps) = agent_re.captures(&line_text) {
                    agent = Some(acaps[1].to_string());
                    line_text = agent_re.replace(&line_text, "").trim().to_string();
                }

                let mut is_background = false;
                if bg_re.is_match(&line_text) {
                    is_background = true;
                    line_text = bg_re.replace(&line_text, "").to_string();
                }

                let word_caps: Vec<_> = word_sync_re.captures_iter(&line_text).collect();
                let mut words: Option<Vec<WordTimestamp>> = None;
                if !word_caps.is_empty() {
                    let mut w_list = Vec::with_capacity(word_caps.len());
                    for (i, wm) in word_caps.iter().enumerate() {
                        let start = Self::parse_timestamp(
                            &wm[1],
                            &wm[2],
                            wm.get(3).map(|m| m.as_str()).unwrap_or("0"),
                        );
                        let w_text = wm[4].trim().to_string();
                        let end = if i + 1 < word_caps.len() {
                            let next = &word_caps[i + 1];
                            Self::parse_timestamp(
                                &next[1],
                                &next[2],
                                next.get(3).map(|m| m.as_str()).unwrap_or("0"),
                            )
                        } else {
                            start + 500
                        };
                        w_list.push(WordTimestamp {
                            text: w_text,
                            start_time: start,
                            end_time: end,
                        });
                    }
                    words = Some(w_list);
                    let cleaned = word_clean_re.replace_all(&line_text, "");
                    line_text = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
                }

                for tc in ts_tag_re.captures_iter(time_header) {
                    let t = Self::parse_timestamp(
                        &tc[1],
                        &tc[2],
                        tc.get(3).map(|m| m.as_str()).unwrap_or("0"),
                    );
                    entries.push(LyricsEntry {
                        time: t,
                        text: line_text.clone(),
                        words: words.clone(),
                        agent: agent.clone(),
                        is_background: if is_background { Some(true) } else { None },
                    });
                }
            } else if !line.is_empty() {
                entries.push(LyricsEntry {
                    time: 0,
                    text: line.clone(),
                    words: None,
                    agent: None,
                    is_background: None,
                });
            }
        }

        if has_timestamp {
            entries.sort_by_key(|e| e.time);
        }

        ParsedLyrics {
            lines: entries,
            is_synced: has_timestamp,
            raw: raw_lrc.to_string(),
        }
    }

    fn parse_yrc(raw_lines: &[String]) -> Vec<LyricsEntry> {
        static LINE_RE: OnceLock<Regex> = OnceLock::new();
        static WORD_RE: OnceLock<Regex> = OnceLock::new();
        let line_re = LINE_RE.get_or_init(|| Regex::new(r"^\[(\d+),(\d+)\](.*)$").unwrap());
        let word_re = WORD_RE.get_or_init(|| Regex::new(r"\((\d+),(\d+),-?\d+\)([^(]*)").unwrap());

        let mut entries = Vec::new();
        for raw in raw_lines {
            let Some(caps) = line_re.captures(raw) else {
                continue;
            };
            let line_start: i64 = caps[1].parse().unwrap_or(0);
            let content = &caps[3];
            let mut words = Vec::new();

            for wc in word_re.captures_iter(content) {
                let w_start: i64 = wc[1].parse().unwrap_or(0);
                let w_dur: i64 = wc[2].parse().unwrap_or(0);
                let w_text = wc[3].to_string();
                words.push(WordTimestamp {
                    text: w_text,
                    start_time: w_start,
                    end_time: w_start + w_dur,
                });
            }

            let full_text: String = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join("");
            entries.push(LyricsEntry {
                time: line_start,
                text: full_text.trim().to_string(),
                words: if words.is_empty() { None } else { Some(words) },
                agent: None,
                is_background: None,
            });
        }
        entries.sort_by_key(|e| e.time);
        entries
    }
}

pub struct LyricsHelper;

fn lyrics_cache() -> &'static Mutex<HashMap<String, LyricsResult>> {
    static CACHE: OnceLock<Mutex<HashMap<String, LyricsResult>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

impl LyricsHelper {
    pub async fn get_lyrics(
        client: &Client,
        title: &str,
        artist: &str,
        duration: Option<f64>,
        video_id: Option<&str>,
    ) -> Option<LyricsResult> {
        let cache_key = if let Some(vid) = video_id.filter(|v| !v.is_empty()) {
            vid.to_string()
        } else {
            format!("{}:::{}", artist.to_lowercase(), title.to_lowercase())
        };

        if let Ok(guard) = lyrics_cache().lock() {
            if let Some(cached) = guard.get(&cache_key) {
                return Some(cached.clone());
            }
        }

        let target_dur = duration.filter(|d| *d > 0.0);

        let providers: [(&str, Option<String>); 3] = [
            (
                "LrcLib",
                Self::fetch_lrclib(client, title, artist, target_dur).await,
            ),
            (
                "NetEase",
                Self::fetch_netease(client, title, artist, target_dur).await,
            ),
            (
                "KuGou",
                Self::fetch_kugou(client, title, artist, target_dur).await,
            ),
        ];

        for (name, maybe_raw) in providers {
            if let Some(raw) = maybe_raw {
                if !raw.trim().is_empty() {
                    let parsed = LyricsUtils::parse_lyrics(&raw);
                    if !parsed.lines.is_empty() {
                        let result = LyricsResult {
                            provider: name.to_string(),
                            lyrics: raw,
                            parsed,
                        };
                        if let Ok(mut guard) = lyrics_cache().lock() {
                            guard.insert(cache_key, result.clone());
                        }
                        return Some(result);
                    }
                }
            }
        }

        None
    }

    async fn fetch_lrclib(
        client: &Client,
        title: &str,
        artist: &str,
        target_dur: Option<f64>,
    ) -> Option<String> {
        let cleaned_title = LyricsUtils::clean_title(title);
        let cleaned_artist = LyricsUtils::clean_artist(artist);

        let mut tracks = Self::lrclib_search(
            client,
            &[
                ("track_name", cleaned_title.as_str()),
                ("artist_name", cleaned_artist.as_str()),
            ],
        )
        .await;

        if tracks.is_empty() {
            tracks = Self::lrclib_search(client, &[("track_name", cleaned_title.as_str())]).await;
        }
        if tracks.is_empty() {
            let q = format!("{cleaned_artist} {cleaned_title}");
            tracks = Self::lrclib_search(client, &[("q", q.as_str())]).await;
        }
        if tracks.is_empty() && cleaned_title != title {
            tracks = Self::lrclib_search(client, &[("q", title)]).await;
        }
        if tracks.is_empty() {
            return None;
        }

        let candidates: Vec<&Value> = tracks
            .iter()
            .filter(|t| {
                t.get("syncedLyrics").and_then(|v| v.as_str()).is_some()
                    || t.get("plainLyrics").and_then(|v| v.as_str()).is_some()
            })
            .collect();
        if candidates.is_empty() {
            return None;
        }

        let picked = if let Some(td) = target_dur {
            candidates
                .iter()
                .find(|t| {
                    t.get("syncedLyrics").and_then(|v| v.as_str()).is_some()
                        && t.get("duration")
                            .and_then(|d| d.as_f64())
                            .map(|d| (d - td).abs() <= 3.0)
                            .unwrap_or(false)
                })
                .or_else(|| {
                    candidates.iter().find(|t| {
                        t.get("duration")
                            .and_then(|d| d.as_f64())
                            .map(|d| (d - td).abs() <= 3.0)
                            .unwrap_or(false)
                    })
                })
                .or_else(|| {
                    candidates.iter().min_by(|a, b| {
                        let da = (a.get("duration").and_then(|d| d.as_f64()).unwrap_or(9999.0) - td).abs();
                        let db = (b.get("duration").and_then(|d| d.as_f64()).unwrap_or(9999.0) - td).abs();
                        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
                    })
                })
                .copied()
        } else {
            candidates
                .iter()
                .find(|t| t.get("syncedLyrics").and_then(|v| v.as_str()).is_some())
                .or_else(|| candidates.first())
                .copied()
        }?;

        picked
            .get("syncedLyrics")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                picked
                    .get("plainLyrics")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
            })
            .map(|s| s.to_string())
    }

    async fn lrclib_search(client: &Client, params: &[(&str, &str)]) -> Vec<Value> {
        let Ok(mut url) = url::Url::parse("https://lrclib.net/api/search") else {
            return vec![];
        };
        {
            let mut pairs = url.query_pairs_mut();
            for (k, v) in params {
                if !v.is_empty() {
                    pairs.append_pair(k, v);
                }
            }
        }
        let Ok(res) = client
            .get(url)
            .header(
                "User-Agent",
                "Mochy-PC (+https://github.com/realidkroo/Mochy-Music)",
            )
            .send()
            .await
        else {
            return vec![];
        };
        if !res.status().is_success() {
            return vec![];
        }
        res.json::<Vec<Value>>().await.unwrap_or_default()
    }

    async fn fetch_netease(
        client: &Client,
        title: &str,
        artist: &str,
        target_dur: Option<f64>,
    ) -> Option<String> {
        let cleaned_title = LyricsUtils::clean_title(title);
        let cleaned_artist = LyricsUtils::clean_artist(artist);
        let search_url = format!(
            "https://music.163.com/api/search/get?s={}&type=1&limit=10",
            urlencoding::encode(&format!("{cleaned_title} {cleaned_artist}"))
        );

        let search_res = client
            .get(&search_url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header("Referer", "https://music.163.com/")
            .send()
            .await
            .ok()?;
        if !search_res.status().is_success() {
            return None;
        }
        let data: Value = search_res.json().await.ok()?;
        let songs = data.pointer("/result/songs")?.as_array()?;
        if songs.is_empty() {
            return None;
        }

        let best = if let Some(td) = target_dur {
            songs
                .iter()
                .find(|s| {
                    s.get("duration")
                        .and_then(|d| d.as_f64())
                        .map(|ms| ((ms / 1000.0).round() - td).abs() <= 4.0)
                        .unwrap_or(false)
                })
                .unwrap_or(&songs[0])
        } else {
            &songs[0]
        };

        let song_id = best.get("id")?.as_i64()?;
        let lyric_url = format!("https://music.163.com/api/song/lyric?id={song_id}&lv=1&yv=1");
        let lyric_res = client
            .get(&lyric_url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .header("Referer", "https://music.163.com/")
            .send()
            .await
            .ok()?;
        if !lyric_res.status().is_success() {
            return None;
        }
        let lyric_data: Value = lyric_res.json().await.ok()?;
        lyric_data
            .pointer("/yrc/lyric")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                lyric_data
                    .pointer("/lrc/lyric")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
            })
            .map(|s| s.to_string())
    }

    async fn fetch_kugou(
        client: &Client,
        title: &str,
        artist: &str,
        target_dur: Option<f64>,
    ) -> Option<String> {
        let cleaned_title = LyricsUtils::clean_title(title);
        let cleaned_artist = LyricsUtils::clean_artist(artist);
        let keyword = format!("{cleaned_title} - {cleaned_artist}");

        let search_url = format!(
            "https://mobileservice.kugou.com/api/v3/search/song?version=9108&plat=0&pagesize=8&showtype=0&keyword={}",
            urlencoding::encode(&keyword)
        );
        let search_res = client.get(&search_url).send().await.ok()?;
        if !search_res.status().is_success() {
            return None;
        }
        let search_data: Value = search_res.json().await.ok()?;
        let songs = search_data
            .pointer("/data/info")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut cand_id: Option<String> = None;
        let mut cand_key: Option<String> = None;

        for song in &songs {
            let dur_ok = match target_dur {
                Some(td) => song
                    .get("duration")
                    .and_then(|d| d.as_f64())
                    .map(|d| (d - td).abs() <= 4.0)
                    .unwrap_or(false),
                None => true,
            };
            if dur_ok {
                if let Some(hash) = song.get("hash").and_then(|h| h.as_str()) {
                    let url = format!(
                        "https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash={hash}"
                    );
                    if let Ok(r) = client.get(&url).send().await {
                        if let Ok(d) = r.json::<Value>().await {
                            if let Some(c) = d
                                .pointer("/candidates")
                                .and_then(|v| v.as_array())
                                .and_then(|a| a.first())
                            {
                                cand_id = c
                                    .get("id")
                                    .map(|v| v.to_string().trim_matches('"').to_string());
                                cand_key = c
                                    .get("accesskey")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }

        if cand_id.is_none() || cand_key.is_none() {
            let dur_param = target_dur
                .map(|td| format!("&duration={}", (td * 1000.0).round() as i64))
                .unwrap_or_default();
            let url = format!(
                "https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword={}{dur_param}",
                urlencoding::encode(&keyword)
            );
            if let Ok(r) = client.get(&url).send().await {
                if let Ok(d) = r.json::<Value>().await {
                    if let Some(c) = d
                        .pointer("/candidates")
                        .and_then(|v| v.as_array())
                        .and_then(|a| a.first())
                    {
                        cand_id = c
                            .get("id")
                            .map(|v| v.to_string().trim_matches('"').to_string());
                        cand_key = c
                            .get("accesskey")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                    }
                }
            }
        }

        let (id, accesskey) = (cand_id?, cand_key?);
        let dl_url = format!(
            "https://lyrics.kugou.com/download?fmt=lrc&charset=utf8&client=pc&ver=1&id={id}&accesskey={accesskey}"
        );
        let dl_res = client.get(&dl_url).send().await.ok()?;
        if !dl_res.status().is_success() {
            return None;
        }
        let dl_data: Value = dl_res.json().await.ok()?;
        let content_b64 = dl_data.get("content")?.as_str()?;
        let decoded_bytes = BASE64.decode(content_b64).ok()?;
        String::from_utf8(decoded_bytes).ok()
    }
}
