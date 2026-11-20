use axum::{
    body::Body,
    extract::{Query, State},
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
use std::sync::{Arc, OnceLock};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use url::Url;

const CHUNK_SIZE: u64 = 512 * 1024; // 512 KB

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
}

#[derive(Deserialize)]
struct StreamQuery {
    url: Option<String>,
    c: Option<String>,
    clen: Option<String>,
    mime: Option<String>,
}

impl LocalStreamProxy {
    pub async fn start(client: Client) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind LocalStreamProxy: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read LocalStreamProxy addr: {e}"))?
            .port();

        let state = Arc::new(ProxyState {
            client: client.clone(),
        });

        let app = Router::new()
            .route("/stream", any(handle_stream))
            .with_state(state);

        tokio::spawn(async move {
            log::info!("[StreamProxy] Chunked audio proxy listening on http://127.0.0.1:{port}");
            if let Err(err) = axum::serve(listener, app).await {
                log::error!("[StreamProxy] Server error: {err}");
            }
        });

        Ok(Self { port, client })
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
    client: Client,
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
        "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; Quest 2) gzip"
    } else {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
    }
}

async fn probe_metadata(client: &Client, url: &str, user_agent: &str) -> Result<(u64, String), String> {
    let probe_url = with_rn_param(url, 0);
    let res = client
        .get(&probe_url)
        .header(header::USER_AGENT, user_agent)
        .header(header::RANGE, "bytes=0-1")
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|e| e.to_string())?;

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
) -> Result<Bytes, String> {
    let res = client
        .get(chunk_url)
        .header(header::USER_AGENT, user_agent)
        .header(header::RANGE, chunk_range)
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::CONNECTION, "keep-alive")
        .send()
        .await
        .map_err(|e| e.to_string())?;

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
        match probe_metadata(&state.client, &target_url, user_agent).await {
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
                match fetch_single_chunk(&client, &chunk_url, &chunk_range, user_agent).await {
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
