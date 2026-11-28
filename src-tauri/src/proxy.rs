use axum::{
    body::Body,
    extract::{Path as AxumPath, Query, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::Response,
    routing::any,
    Router,
};
use bytes::Bytes;
use futures_util::stream::StreamExt;
use regex::Regex;
use reqwest::Client;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, RwLock};
use tokio::time::{sleep, Duration};
use url::Url;

const CHUNK_SIZE: u64 = 512 * 1024; // 512 KB
const LOCAL_STREAM_CHUNK_SIZE: usize = 64 * 1024; // 64 KB
const USER_AGENT_WEB: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

pub fn safe_track_stem(video_id: &str) -> Option<String> {
    let trimmed = video_id.trim();
    if trimmed.is_empty() || trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return None;
    }
    let stem = trimmed.replace(':', "_");
    if stem
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Some(stem)
    } else {
        None
    }
}

pub fn with_rn_param(url_str: &str, rn: u64) -> String {
    static RN_RE: OnceLock<Regex> = OnceLock::new();
    let re = RN_RE.get_or_init(|| Regex::new(r"([?&])rn=\d+").unwrap());
    if re.is_match(url_str) {
        re.replace(url_str, format!("${{1}}rn={rn}")).to_string()
    } else {
        let sep = if url_str.contains('?') { '&' } else { '?' };
        format!("{url_str}{sep}rn={rn}")
    }
}

#[derive(Clone)]
pub struct LocalStreamProxy {
    port: u16,
    client: Client,
    downloads_dir: Arc<RwLock<PathBuf>>,
}

#[derive(Deserialize)]
struct StreamQuery {
    url: Option<String>,
    c: Option<String>,
    clen: Option<String>,
    mime: Option<String>,
}

#[derive(Deserialize)]
struct UrlQuery {
    url: Option<String>,
}

impl LocalStreamProxy {
    #[allow(dead_code)]
    pub async fn start(client: Client) -> Result<Self, String> {
        let downloads_dir = Arc::new(RwLock::new(PathBuf::new()));
        Self::start_with_downloads(client, downloads_dir).await
    }

    pub async fn start_with_downloads(
        client: Client,
        downloads_dir: Arc<RwLock<PathBuf>>,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind LocalStreamProxy: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read LocalStreamProxy addr: {e}"))?
            .port();

        let state = Arc::new(ProxyState {
            port,
            client: client.clone(),
            downloads_dir: downloads_dir.clone(),
        });

        let app = Router::new()
            .route("/stream", any(handle_stream))
            .route("/hls", any(handle_hls))
            .route("/raw", any(handle_raw))
            .route("/local/{video_id}", any(handle_local_audio))
            .route("/local-cover/{video_id}", any(handle_local_cover))
            .with_state(state);

        tokio::spawn(async move {
            log::info!("[StreamProxy] Chunked & Local audio proxy listening on http://127.0.0.1:{port}");
            if let Err(err) = axum::serve(listener, app).await {
                log::error!("[StreamProxy] Server error: {err}");
            }
        });

        Ok(Self {
            port,
            client,
            downloads_dir,
        })
    }

    pub fn get_local_audio_url(&self, video_id: &str) -> String {
        format!(
            "http://127.0.0.1:{}/local/{}",
            self.port,
            urlencoding::encode(video_id)
        )
    }

    pub fn get_local_cover_url(&self, video_id: &str) -> String {
        format!(
            "http://127.0.0.1:{}/local-cover/{}",
            self.port,
            urlencoding::encode(video_id)
        )
    }

    #[allow(dead_code)]
    pub fn downloads_dir(&self) -> &Arc<RwLock<PathBuf>> {
        &self.downloads_dir
    }

    pub fn get_hls_proxy_url(&self, target_url: &str) -> String {
        format!(
            "http://127.0.0.1:{}/hls?url={}",
            self.port,
            urlencoding::encode(target_url)
        )
    }

    pub fn get_raw_proxy_url(&self, target_url: &str) -> String {
        format!(
            "http://127.0.0.1:{}/raw?url={}",
            self.port,
            urlencoding::encode(target_url)
        )
    }

    pub fn get_proxy_url(
        &self,
        target_url: &str,
        client_name: &str,
        content_length: Option<u64>,
        mime_type: Option<&str>,
    ) -> String {
        let encoded_url = urlencoding::encode(target_url);
        let encoded_c = urlencoding::encode(client_name);
        let mut proxy_url = format!(
            "http://127.0.0.1:{}/stream?url={}&c={}",
            self.port, encoded_url, encoded_c
        );
        if let Some(clen) = content_length {
            if clen > 0 {
                proxy_url.push_str(&format!("&clen={clen}"));
            }
        }
        if let Some(mime) = mime_type {
            if !mime.is_empty() {
                proxy_url.push_str(&format!("&mime={}", urlencoding::encode(mime)));
            }
        }
        proxy_url
    }

    #[allow(dead_code)]
    pub fn client(&self) -> &Client {
        &self.client
    }
}

struct ProxyState {
    port: u16,
    client: Client,
    downloads_dir: Arc<RwLock<PathBuf>>,
}

fn cors_builder(status: StatusCode) -> axum::http::response::Builder {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        .header("Access-Control-Allow-Headers", "Range, Accept, Accept-Encoding")
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges",
        )
        .header("Accept-Ranges", "bytes")
}

fn user_agent_for_client(client_name: &str) -> &'static str {
    if client_name == "VISIONOS" {
        "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)"
    } else if client_name.starts_with("ANDROID_VR") {
        "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)"
    } else if client_name == "ANDROID" || client_name == "MOBILE" {
        "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip"
    } else if client_name == "ANDROID_CREATOR" {
        "com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)"
    } else if client_name == "IOS" || client_name == "IPADOS" {
        "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)"
    } else if client_name == "TVHTML5_SIMPLY_EMBEDDED_PLAYER" {
        "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15"
    } else if client_name == "TVHTML5" {
        "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15"
    } else {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

fn origin_referer_for_client(client_name: &str) -> Option<(&'static str, &'static str)> {
    match client_name {
        "VISIONOS" | "ANDROID_VR" | "ANDROID_CREATOR" | "ANDROID" | "MOBILE" | "IOS" | "IPADOS" => None,
        "WEB_REMIX" => Some(("https://music.youtube.com", "https://music.youtube.com/")),
        "WEB_CREATOR" => Some(("https://studio.youtube.com", "https://studio.youtube.com/")),
        _ => Some(("https://www.youtube.com", "https://www.youtube.com/")),
    }
}

async fn probe_metadata(
    client: &Client,
    url: &str,
    user_agent: &str,
    client_name: &str,
) -> Result<(u64, String), String> {
    let probe_url = with_rn_param(url, 0);
    let mut req = client
        .get(&probe_url)
        .header(header::USER_AGENT, user_agent)
        .header(header::RANGE, "bytes=0-1")
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_ENCODING, "identity");
    if let Some((origin, referer)) = origin_referer_for_client(client_name) {
        req = req.header(header::ORIGIN, origin).header(header::REFERER, referer);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;

    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("audio/webm")
        .to_string();

    let mut total_length: u64 = 0;
    if let Some(cr) = res.headers().get(header::CONTENT_RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(slash) = cr.rfind('/') {
            if let Ok(len) = cr[slash + 1..].trim().parse::<u64>() {
                total_length = len;
            }
        }
    }
    if total_length == 0 {
        if let Some(cl) = res.headers().get(header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()) {
            if let Ok(len) = cl.trim().parse::<u64>() {
                total_length = len;
            }
        }
    }

    Ok((
        if total_length > 0 {
            total_length
        } else {
            5 * 1024 * 1024
        },
        content_type,
    ))
}

async fn fetch_single_chunk(
    client: &Client,
    chunk_url: &str,
    chunk_range: &str,
    user_agent: &str,
    client_name: &str,
) -> Result<Bytes, String> {
    let mut req = client
        .get(chunk_url)
        .header(header::USER_AGENT, user_agent)
        .header(header::RANGE, chunk_range)
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::CONNECTION, "keep-alive");
    if let Some((origin, referer)) = origin_referer_for_client(client_name) {
        req = req.header(header::ORIGIN, origin).header(header::REFERER, referer);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    if status != 200 && status != 206 {
        return Err(format!(
            "Google Video returned HTTP {status} for {chunk_range}"
        ));
    }

    res.bytes().await.map_err(|e| e.to_string())
}

async fn handle_stream(
    method: Method,
    headers: HeaderMap,
    Query(query): Query<StreamQuery>,
    State(state): State<Arc<ProxyState>>,
) -> Response {
    if method == Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }

    let Some(target_url) = query.url.filter(|u| !u.is_empty()) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(Body::from("Missing target url parameter"))
            .unwrap();
    };

    let client_name = query.c.unwrap_or_else(|| "VISIONOS".to_string());
    let user_agent = user_agent_for_client(&client_name);

    let mut total_length: u64 = query
        .clen
        .as_deref()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let parsed_target = Url::parse(&target_url).ok();
    let raw_mime = query.mime.or_else(|| {
        parsed_target.as_ref().and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "mime")
                .map(|(_, v)| v.into_owned())
        })
    });

    let mut content_type = if let Some(ref rm) = raw_mime {
        let lower = rm.to_lowercase();
        if lower.contains("mp4") || lower.contains("m4a") || lower.contains("aac") {
            "audio/mp4".to_string()
        } else {
            "audio/webm".to_string()
        }
    } else {
        "audio/webm".to_string()
    };

    if total_length == 0 {
        if let Some(ref u) = parsed_target {
            if let Some(cl) = u
                .query_pairs()
                .find(|(k, _)| k == "clen")
                .and_then(|(_, v)| v.parse::<u64>().ok())
            {
                total_length = cl;
            }
        }
    }

    if total_length == 0 {
        match probe_metadata(&state.client, &target_url, user_agent, &client_name).await {
            Ok((len, probed_ct)) => {
                total_length = len;
                if raw_mime.is_none() {
                    content_type = if probed_ct.to_lowercase().contains("mp4") {
                        "audio/mp4".to_string()
                    } else {
                        "audio/webm".to_string()
                    };
                }
            }
            Err(err) => {
                log::warn!("[StreamProxy] Metadata probe failed, using default length: {err}");
                total_length = 5 * 1024 * 1024;
            }
        }
    }

    if method == Method::HEAD {
        return cors_builder(StatusCode::OK)
            .header(header::CONTENT_TYPE, &content_type)
            .header(header::CONTENT_LENGTH, total_length.to_string())
            .body(Body::empty())
            .unwrap();
    }

    let range_header = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut start_byte: u64 = 0;
    let mut end_byte: u64 = total_length.saturating_sub(1);

    if let Some(ref rh) = range_header {
        static RANGE_RE: OnceLock<Regex> = OnceLock::new();
        let re = RANGE_RE.get_or_init(|| Regex::new(r"bytes=(\d+)-(\d+)?").unwrap());
        if let Some(caps) = re.captures(rh) {
            if let Ok(s) = caps[1].parse::<u64>() {
                start_byte = s;
            }
            if let Some(m2) = caps.get(2) {
                if let Ok(e) = m2.as_str().parse::<u64>() {
                    end_byte = e;
                }
            }
        }
    }

    if end_byte >= total_length {
        end_byte = total_length.saturating_sub(1);
    }

    if total_length == 0 || start_byte > end_byte {
        return cors_builder(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{total_length}"))
            .header(header::CONTENT_TYPE, &content_type)
            .body(Body::empty())
            .unwrap();
    }

    let requested_length = end_byte - start_byte + 1;
    let is_ranged = range_header.is_some();
    let status = if is_ranged {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(2);
    let client = state.client.clone();

    tokio::spawn(async move {
        let mut current_offset = start_byte;
        let mut rn = start_byte / CHUNK_SIZE;

        while current_offset <= end_byte {
            if tx.is_closed() {
                break;
            }

            let chunk_end = std::cmp::min(current_offset + CHUNK_SIZE - 1, end_byte);
            let chunk_range = format!("bytes={current_offset}-{chunk_end}");
            let chunk_url = with_rn_param(&target_url, rn);

            let mut chunk_bytes: Option<Bytes> = None;
            for attempt in 1..=3u64 {
                if tx.is_closed() {
                    break;
                }
                match fetch_single_chunk(&client, &chunk_url, &chunk_range, user_agent, &client_name).await {
                    Ok(b) => {
                        chunk_bytes = Some(b);
                        break;
                    }
                    Err(err) => {
                        log::warn!("[StreamProxy] Chunk [rn={rn}] attempt {attempt} failed: {err}");
                        if attempt < 3 && !tx.is_closed() {
                            sleep(Duration::from_millis(attempt * 300)).await;
                        }
                    }
                }
            }

            let Some(bytes) = chunk_bytes else {
                if !tx.is_closed() {
                    log::error!("[StreamProxy] Chunk [rn={rn}] failed permanently.");
                }
                break;
            };

            if tx.send(Ok(bytes)).await.is_err() {
                break;
            }

            current_offset = chunk_end + 1;
            rn += 1;
        }
    });

    let stream = tokio_stream_from_mpsc(rx);
    let mut builder = cors_builder(status)
        .header(header::CONTENT_TYPE, &content_type)
        .header(header::CONTENT_LENGTH, requested_length.to_string())
        .header(header::CACHE_CONTROL, "no-cache");

    if is_ranged {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start_byte}-{end_byte}/{total_length}"),
        );
    }

    builder.body(Body::from_stream(stream)).unwrap()
}

fn tokio_stream_from_mpsc(
    mut rx: mpsc::Receiver<Result<Bytes, std::io::Error>>,
) -> impl futures_util::Stream<Item = Result<Bytes, std::io::Error>> + Send {
    futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx)).fuse()
}

fn is_http_url(url_str: &str) -> bool {
    url_str.starts_with("https://") || url_str.starts_with("http://")
}

fn resolve_m3u8_uri(base: Option<&Url>, raw: &str) -> String {
    let trimmed = raw.trim();
    if is_http_url(trimmed) {
        return trimmed.to_string();
    }
    if let Some(b) = base {
        if let Ok(joined) = b.join(trimmed) {
            return joined.to_string();
        }
    }
    trimmed.to_string()
}

async fn handle_hls(
    method: Method,
    Query(query): Query<UrlQuery>,
    State(state): State<Arc<ProxyState>>,
) -> Response {
    if method == Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }

    let Some(target_url) = query.url.filter(|u| is_http_url(u.trim())) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(Body::from("Invalid or missing target url parameter"))
            .unwrap();
    };
    let target_url = target_url.trim().to_string();

    let res = match state
        .client
        .get(&target_url)
        .header(header::USER_AGENT, USER_AGENT_WEB)
        .header(header::ACCEPT, "*/*")
        .send()
        .await
    {
        Ok(r) => r,
        Err(err) => {
            log::error!("[StreamProxy] HLS playlist fetch error: {err}");
            return cors_builder(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!("Upstream error: {err}")))
                .unwrap();
        }
    };

    if !res.status().is_success() {
        let code = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        return cors_builder(code)
            .body(Body::from(format!("Upstream HTTP {}", res.status())))
            .unwrap();
    }

    let playlist_text = match res.text().await {
        Ok(t) => t,
        Err(err) => {
            return cors_builder(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!("Failed reading M3U8: {err}")))
                .unwrap();
        }
    };

    static ATTR_URI_RE: OnceLock<Regex> = OnceLock::new();
    let attr_uri_re = ATTR_URI_RE.get_or_init(|| Regex::new(r#"URI="([^"]+)""#).unwrap());

    let base_url = Url::parse(&target_url).ok();
    let port = state.port;
    let mut rewritten = Vec::new();

    for raw_line in playlist_text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            if attr_uri_re.is_match(line) {
                let replaced = attr_uri_re.replace_all(line, |caps: &regex::Captures<'_>| {
                    let resolved = resolve_m3u8_uri(base_url.as_ref(), &caps[1]);
                    format!(
                        r#"URI="http://127.0.0.1:{port}/raw?url={}""#,
                        urlencoding::encode(&resolved)
                    )
                });
                rewritten.push(replaced.into_owned());
            } else {
                rewritten.push(line.to_string());
            }
        } else {
            let resolved = resolve_m3u8_uri(base_url.as_ref(), line);
            rewritten.push(format!(
                "http://127.0.0.1:{port}/raw?url={}",
                urlencoding::encode(&resolved)
            ));
        }
    }

    let body_text = rewritten.join("\n") + "\n";

    cors_builder(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(body_text))
        .unwrap()
}

async fn handle_raw(
    method: Method,
    headers: HeaderMap,
    Query(query): Query<UrlQuery>,
    State(state): State<Arc<ProxyState>>,
) -> Response {
    if method == Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }

    let Some(target_url) = query.url.filter(|u| is_http_url(u.trim())) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(Body::from("Invalid or missing target url parameter"))
            .unwrap();
    };
    let target_url = target_url.trim().to_string();

    let incoming_range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut req = state
        .client
        .get(&target_url)
        .header(header::USER_AGENT, USER_AGENT_WEB)
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_ENCODING, "identity");

    if let Some(ref range) = incoming_range {
        req = req.header(header::RANGE, range);
    } else if method == Method::HEAD {
        // SoundCloud CloudFront rejects HEAD with 405, so probe byte 0 via GET.
        req = req.header(header::RANGE, "bytes=0-0");
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(err) => {
            log::error!("[StreamProxy] Raw upstream fetch error: {err}");
            return cors_builder(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!("Upstream error: {err}")))
                .unwrap();
        }
    };

    let upstream_status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let upstream_headers = upstream.headers().clone();

    let ct = upstream_headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream");

    if method == Method::HEAD {
        let mut total_len = None;
        if let Some(cr) = upstream_headers
            .get(header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(slash) = cr.rfind('/') {
                if let Ok(len) = cr[slash + 1..].trim().parse::<u64>() {
                    total_len = Some(len);
                }
            }
        }
        if total_len.is_none() {
            if let Some(cl) = upstream_headers
                .get(header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<u64>().ok())
            {
                total_len = Some(cl);
            }
        }

        let mut builder = cors_builder(if upstream.status().is_success() {
            StatusCode::OK
        } else {
            upstream_status
        })
        .header(header::CONTENT_TYPE, ct)
        .header(header::CACHE_CONTROL, "no-cache");

        if let Some(len) = total_len {
            builder = builder.header(header::CONTENT_LENGTH, len.to_string());
        }
        return builder.body(Body::empty()).unwrap();
    }

    let mut builder = cors_builder(upstream_status)
        .header(header::CONTENT_TYPE, ct)
        .header(header::CACHE_CONTROL, "no-cache");

    if let Some(cl) = upstream_headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
    {
        builder = builder.header(header::CONTENT_LENGTH, cl);
    }
    if let Some(cr) = upstream_headers
        .get(header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
    {
        builder = builder.header(header::CONTENT_RANGE, cr);
    }

    let byte_stream = upstream
        .bytes_stream()
        .map(|item| item.map_err(std::io::Error::other));

    builder.body(Body::from_stream(byte_stream)).unwrap()
}

fn find_local_audio_file(dir: &std::path::Path, stem: &str) -> Option<(PathBuf, &'static str)> {
    const AUDIO_CANDIDATES: [(&str, &str); 7] = [
        ("m4a", "audio/mp4"),
        ("webm", "audio/webm"),
        ("opus", "audio/ogg"),
        ("mp3", "audio/mpeg"),
        ("mp4", "audio/mp4"),
        ("aac", "audio/aac"),
        ("ogg", "audio/ogg"),
    ];
    for (ext, mime) in AUDIO_CANDIDATES {
        let p = dir.join(format!("{stem}.{ext}"));
        if p.is_file() {
            return Some((p, mime));
        }
    }
    None
}

async fn handle_local_audio(
    method: Method,
    headers: HeaderMap,
    AxumPath(raw_video_id): AxumPath<String>,
    State(state): State<Arc<ProxyState>>,
) -> Response {
    if method == Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }

    let decoded = urlencoding::decode(&raw_video_id)
        .map(|s| s.into_owned())
        .unwrap_or(raw_video_id);
    let Some(stem) = safe_track_stem(&decoded) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(Body::from("Invalid track id"))
            .unwrap();
    };

    let dir = state.downloads_dir.read().await.clone();
    let Some((file_path, content_type)) = find_local_audio_file(&dir, &stem) else {
        return cors_builder(StatusCode::NOT_FOUND)
            .body(Body::from("Local track not found"))
            .unwrap();
    };

    let Ok(meta) = tokio::fs::metadata(&file_path).await else {
        return cors_builder(StatusCode::NOT_FOUND)
            .body(Body::from("Local track unavailable"))
            .unwrap();
    };
    let file_len = meta.len();

    if method == Method::HEAD {
        return cors_builder(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CONTENT_LENGTH, file_len.to_string())
            .body(Body::empty())
            .unwrap();
    }

    if file_len == 0 {
        return cors_builder(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, "bytes */0")
            .body(Body::empty())
            .unwrap();
    }

    let range_header = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut start_byte: u64 = 0;
    let mut end_byte: u64 = file_len - 1;
    let mut is_ranged = false;

    if let Some(ref rh) = range_header {
        static LOCAL_RANGE_RE: OnceLock<Regex> = OnceLock::new();
        let re = LOCAL_RANGE_RE.get_or_init(|| Regex::new(r"bytes=(\d+)-(\d+)?").unwrap());
        if let Some(caps) = re.captures(rh) {
            is_ranged = true;
            if let Ok(s) = caps[1].parse::<u64>() {
                start_byte = s;
            }
            if let Some(m2) = caps.get(2) {
                if let Ok(e) = m2.as_str().parse::<u64>() {
                    end_byte = e;
                }
            }
        }
    }

    if end_byte >= file_len {
        end_byte = file_len - 1;
    }

    if start_byte > end_byte {
        return cors_builder(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{file_len}"))
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::empty())
            .unwrap();
    }

    let requested_length = end_byte - start_byte + 1;
    let mut file = match tokio::fs::File::open(&file_path).await {
        Ok(f) => f,
        Err(err) => {
            return cors_builder(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!("Failed to open file: {err}")))
                .unwrap();
        }
    };

    if start_byte > 0 {
        if let Err(err) = file.seek(std::io::SeekFrom::Start(start_byte)).await {
            return cors_builder(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(format!("Seek failed: {err}")))
                .unwrap();
        }
    }

    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(4);
    tokio::spawn(async move {
        let mut reader = file.take(requested_length);
        let mut buf = vec![0u8; LOCAL_STREAM_CHUNK_SIZE];
        loop {
            if tx.is_closed() {
                break;
            }
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(Ok(Bytes::copy_from_slice(&buf[..n]))).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx.send(Err(err)).await;
                    break;
                }
            }
        }
    });

    let status = if is_ranged {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    let mut builder = cors_builder(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, requested_length.to_string())
        .header(header::CACHE_CONTROL, "public, max-age=3600");

    if is_ranged {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start_byte}-{end_byte}/{file_len}"),
        );
    }

    builder
        .body(Body::from_stream(tokio_stream_from_mpsc(rx)))
        .unwrap()
}

async fn handle_local_cover(
    method: Method,
    AxumPath(raw_video_id): AxumPath<String>,
    State(state): State<Arc<ProxyState>>,
) -> Response {
    if method == Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }

    let decoded = urlencoding::decode(&raw_video_id)
        .map(|s| s.into_owned())
        .unwrap_or(raw_video_id);
    let Some(stem) = safe_track_stem(&decoded) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(Body::from("Invalid track id"))
            .unwrap();
    };

    let dir = state.downloads_dir.read().await.clone();
    const COVER_EXTS: [(&str, &str); 3] = [
        ("jpg", "image/jpeg"),
        ("png", "image/png"),
        ("webp", "image/webp"),
    ];
    for (ext, mime) in COVER_EXTS {
        let p = dir.join(format!("{stem}.{ext}"));
        if p.is_file() {
            match tokio::fs::read(&p).await {
                Ok(bytes) => {
                    return cors_builder(StatusCode::OK)
                        .header(header::CONTENT_TYPE, mime)
                        .header(header::CONTENT_LENGTH, bytes.len().to_string())
                        .header(header::CACHE_CONTROL, "public, max-age=86400")
                        .body(Body::from(bytes))
                        .unwrap();
                }
                Err(_) => break,
            }
        }
    }

    cors_builder(StatusCode::NOT_FOUND)
        .body(Body::from("Local cover not found"))
        .unwrap()
}
