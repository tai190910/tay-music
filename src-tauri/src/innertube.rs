use crate::cipher::{CipherDeobfuscator, PlayerJsFetcher};
use crate::db::now_ms;
use crate::models::{Album, Artist, PlaybackData, PlaylistPageResult, SearchResult, SongItem};
use crate::proxy::with_rn_param;
use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, OnceLock};
use tokio::sync::{Mutex as AsyncMutex, RwLock, Semaphore};
use tokio::time::{sleep, Duration};

pub const ORIGIN_YOUTUBE: &str = "https://www.youtube.com";
pub const ORIGIN_YOUTUBE_MUSIC: &str = "https://music.youtube.com";
pub const USER_AGENT_WEB: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STREAM_CACHE_TTL_MS: i64 = 2 * 60 * 60 * 1000; // 2 hours
const SEARCH_CACHE_TTL_MS: i64 = 5 * 60 * 1000; // 5 minutes
const VISITOR_DATA_TTL_MS: i64 = 30 * 60 * 1000; // 30 minutes
const MIN_REQUEST_INTERVAL_MS: i64 = 160;
const RATE_LIMIT_COOLDOWN_MS: i64 = 12_000;

#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClientKind {
    VisionOs,
    Web,
    WebRemix,
    WebCreator,
    TvHtml5,
    TvHtml5Samsung,
    TvHtml5Downgraded,
    WebEmbeddedPlayer,
    TvHtml5SimplyEmbeddedPlayer,
    IpadOs,
    Mobile,
    AndroidVr143,
    AndroidVr161,
    AndroidVr165,
    AndroidCreator,
}

#[derive(Clone, Debug)]
pub struct YouTubeClient {
    pub kind: ClientKind,
    pub client_name: &'static str,
    pub client_version: &'static str,
    pub client_id: &'static str,
    pub user_agent: &'static str,
    pub os_name: Option<&'static str>,
    pub os_version: Option<&'static str>,
    pub device_make: Option<&'static str>,
    pub device_model: Option<&'static str>,
    pub android_sdk_version: Option<&'static str>,
    pub login_supported: bool,
    pub login_required: bool,
    pub use_signature_timestamp: bool,
    pub is_embedded: bool,
    pub api_origin: &'static str,
    pub api_format_version: &'static str,
    pub client_screen: Option<&'static str>,
    pub platform: Option<&'static str>,
    pub own_visitor_id: bool,
}

#[allow(dead_code)]
impl YouTubeClient {
    pub fn is_native_app(&self) -> bool {
        self.platform.is_some()
    }

    pub fn to_context(&self, visitor_data: Option<&str>, data_sync_id: Option<&str>) -> Value {
        let mut client_obj = serde_json::Map::new();
        client_obj.insert("clientName".into(), json!(self.client_name));
        client_obj.insert("clientVersion".into(), json!(self.client_version));
        if let Some(cs) = self.client_screen {
            client_obj.insert("clientScreen".into(), json!(cs));
            client_obj.insert("utcOffsetMinutes".into(), json!(0));
        }
        if let Some(p) = self.platform {
            client_obj.insert("platform".into(), json!(p));
        }
        if let Some(v) = self.os_name {
            client_obj.insert("osName".into(), json!(v));
        }
        if let Some(v) = self.os_version {
            client_obj.insert("osVersion".into(), json!(v));
        }
        if let Some(v) = self.device_make {
            client_obj.insert("deviceMake".into(), json!(v));
        }
        if let Some(v) = self.device_model {
            client_obj.insert("deviceModel".into(), json!(v));
        }
        if let Some(v) = self.android_sdk_version {
            client_obj.insert("androidSdkVersion".into(), json!(v));
        }
        client_obj.insert("gl".into(), json!("US"));
        client_obj.insert("hl".into(), json!("en"));
        if let Some(vd) = visitor_data {
            if !vd.is_empty() {
                client_obj.insert("visitorData".into(), json!(vd));
            }
        }

        let mut user_obj = serde_json::Map::new();
        if self.login_supported {
            if let Some(dsid) = data_sync_id {
                user_obj.insert("onBehalfOfUser".into(), json!(dsid));
            }
        }

        let mut root = serde_json::Map::new();
        root.insert("client".into(), Value::Object(client_obj));
        root.insert("user".into(), Value::Object(user_obj));
        if self.is_embedded {
            root.insert(
                "thirdParty".into(),
                json!({ "embedUrl": "https://www.youtube.com" }),
            );
        }
        Value::Object(root)
    }

    pub fn stream_headers(&self) -> HashMap<String, String> {
        let mut h = HashMap::new();
        h.insert("User-Agent".to_string(), self.user_agent.to_string());
        h.insert("Accept".to_string(), "*/*".to_string());
        h.insert("Accept-Language".to_string(), "en-US,en;q=0.9".to_string());

        match self.client_name {
            "VISIONOS" | "ANDROID_VR" | "ANDROID_CREATOR" | "IOS" | "IPADOS" | "MOBILE" => {}
            "WEB_REMIX" => {
                h.insert(
                    "Referer".to_string(),
                    "https://music.youtube.com/".to_string(),
                );
                h.insert(
                    "Origin".to_string(),
                    "https://music.youtube.com".to_string(),
                );
            }
            "WEB_CREATOR" => {
                h.insert(
                    "Referer".to_string(),
                    "https://studio.youtube.com/".to_string(),
                );
                h.insert(
                    "Origin".to_string(),
                    "https://studio.youtube.com".to_string(),
                );
            }
            _ => {
                h.insert("Referer".to_string(), "https://www.youtube.com/".to_string());
                h.insert("Origin".to_string(), "https://www.youtube.com".to_string());
            }
        }
        h
    }

    pub fn visionos() -> Self {
        Self {
            kind: ClientKind::VisionOs,
            client_name: "VISIONOS",
            client_version: "1.04",
            client_id: "101",
            user_agent: "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)",
            os_name: Some("visionOS"),
            os_version: Some("26.6.0.23O770"),
            device_make: Some("Apple"),
            device_model: Some("RealityDevice17,1"),
            android_sdk_version: None,
            login_supported: false,
            login_required: false,
            use_signature_timestamp: false,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE,
            api_format_version: "2",
            client_screen: Some("WATCH"),
            platform: Some("MOBILE"),
            own_visitor_id: true,
        }
    }

    pub fn web() -> Self {
        Self {
            kind: ClientKind::Web,
            client_name: "WEB",
            client_version: "2.20260708.00.00",
            client_id: "1",
            user_agent: USER_AGENT_WEB,
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn web_youtube() -> Self {
        Self {
            kind: ClientKind::Web,
            client_name: "WEB",
            client_version: "2.20260708.00.00",
            client_id: "1",
            user_agent: USER_AGENT_WEB,
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn web_remix() -> Self {
        Self {
            kind: ClientKind::WebRemix,
            client_name: "WEB_REMIX",
            client_version: "1.20260707.12.00",
            client_id: "67",
            user_agent: USER_AGENT_WEB,
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn web_creator() -> Self {
        Self {
            kind: ClientKind::WebCreator,
            client_name: "WEB_CREATOR",
            client_version: "1.20260708.06.00",
            client_id: "62",
            user_agent: USER_AGENT_WEB,
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: true,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn tvhtml5() -> Self {
        Self {
            kind: ClientKind::TvHtml5,
            client_name: "TVHTML5",
            client_version: "7.20260707.07.00",
            client_id: "7",
            user_agent: "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15",
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: true,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn tvhtml5_simply_embedded() -> Self {
        Self {
            kind: ClientKind::TvHtml5SimplyEmbeddedPlayer,
            client_name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
            client_version: "2.0",
            client_id: "85",
            user_agent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
            os_name: None,
            os_version: None,
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: true,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn ipados() -> Self {
        Self {
            kind: ClientKind::IpadOs,
            client_name: "IOS",
            client_version: "21.03.3",
            client_id: "5",
            user_agent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)",
            os_name: Some("iPadOS"),
            os_version: Some("17.7.10.21H450"),
            device_make: Some("Apple"),
            device_model: Some("iPad7,6"),
            android_sdk_version: None,
            login_supported: false,
            login_required: false,
            use_signature_timestamp: false,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn mobile() -> Self {
        Self {
            kind: ClientKind::Mobile,
            client_name: "ANDROID",
            client_version: "21.26.364",
            client_id: "3",
            user_agent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
            os_name: Some("Android"),
            os_version: Some("11"),
            device_make: None,
            device_model: None,
            android_sdk_version: None,
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn android_vr_1_43_32() -> Self {
        Self {
            kind: ClientKind::AndroidVr143,
            client_name: "ANDROID_VR",
            client_version: "1.43.32",
            client_id: "28",
            user_agent: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)",
            os_name: Some("Android"),
            os_version: Some("12"),
            device_make: Some("Oculus"),
            device_model: Some("Quest 3"),
            android_sdk_version: Some("32"),
            login_supported: false,
            login_required: false,
            use_signature_timestamp: false,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn android_vr_1_61_48() -> Self {
        Self {
            kind: ClientKind::AndroidVr161,
            client_name: "ANDROID_VR",
            client_version: "1.61.48",
            client_id: "28",
            user_agent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
            os_name: Some("Android"),
            os_version: Some("12"),
            device_make: Some("Oculus"),
            device_model: Some("Quest 3"),
            android_sdk_version: Some("32"),
            login_supported: false,
            login_required: false,
            use_signature_timestamp: false,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn android_vr_1_65_10() -> Self {
        Self {
            kind: ClientKind::AndroidVr165,
            client_name: "ANDROID_VR",
            client_version: "1.65.10",
            client_id: "28",
            user_agent: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
            os_name: Some("Android"),
            os_version: Some("12L"),
            device_make: Some("Oculus"),
            device_model: Some("Quest 3"),
            android_sdk_version: Some("32"),
            login_supported: false,
            login_required: false,
            use_signature_timestamp: false,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }

    pub fn android_creator() -> Self {
        Self {
            kind: ClientKind::AndroidCreator,
            client_name: "ANDROID_CREATOR",
            client_version: "25.03.101",
            client_id: "14",
            user_agent: "com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)",
            os_name: Some("Android"),
            os_version: Some("15"),
            device_make: Some("Google"),
            device_model: Some("Pixel 9 Pro Fold"),
            android_sdk_version: Some("35"),
            login_supported: true,
            login_required: false,
            use_signature_timestamp: true,
            is_embedded: false,
            api_origin: ORIGIN_YOUTUBE_MUSIC,
            api_format_version: "1",
            client_screen: None,
            platform: None,
            own_visitor_id: false,
        }
    }
}

#[derive(Clone)]
struct CachedStreamEntry {
    data: PlaybackData,
    expires_at_ms: i64,
}

#[derive(Clone)]
struct CachedSearchEntry {
    value: Value,
    expires_at_ms: i64,
}

pub struct InnerTube {
    pub client: Client,
    visitor_data: Arc<RwLock<Option<(String, i64)>>>,
    own_visitor_ids: Arc<RwLock<HashMap<String, (String, i64)>>>,
    cookie: Arc<RwLock<Option<String>>>,
    data_sync_id: Arc<RwLock<Option<String>>>,
    auth_user: Arc<RwLock<String>>,
    custom_user_agent: Arc<RwLock<Option<String>>>,
    request_semaphore: Arc<Semaphore>,
    last_request_ms: Arc<AsyncMutex<i64>>,
    rate_limit_until_ms: Arc<AtomicI64>,
    stream_cache: Arc<RwLock<HashMap<String, CachedStreamEntry>>>,
    search_cache: Arc<RwLock<HashMap<String, CachedSearchEntry>>>,
}

impl InnerTube {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            visitor_data: Arc::new(RwLock::new(None)),
            own_visitor_ids: Arc::new(RwLock::new(HashMap::new())),
            cookie: Arc::new(RwLock::new(None)),
            data_sync_id: Arc::new(RwLock::new(None)),
            auth_user: Arc::new(RwLock::new("0".to_string())),
            custom_user_agent: Arc::new(RwLock::new(None)),
            request_semaphore: Arc::new(Semaphore::new(2)),
            last_request_ms: Arc::new(AsyncMutex::new(0)),
            rate_limit_until_ms: Arc::new(AtomicI64::new(0)),
            stream_cache: Arc::new(RwLock::new(HashMap::new())),
            search_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn set_auth(
        &self,
        cookie: Option<String>,
        data_sync_id: Option<String>,
        auth_user: Option<String>,
        user_agent: Option<String>,
        visitor_data: Option<String>,
    ) {
        *self.cookie.write().await = cookie.filter(|s| !s.trim().is_empty());
        *self.data_sync_id.write().await = data_sync_id.filter(|s| !s.trim().is_empty());
        *self.auth_user.write().await = auth_user
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "0".to_string());
        *self.custom_user_agent.write().await = user_agent.filter(|s| !s.trim().is_empty());
        if let Some(vd) = visitor_data.filter(|s| !s.trim().is_empty()) {
            *self.visitor_data.write().await = Some((vd, now_ms()));
        }
        self.rate_limit_until_ms.store(0, Ordering::SeqCst);
        self.stream_cache.write().await.clear();
        self.search_cache.write().await.clear();
    }

    pub async fn clear_auth(&self) {
        *self.cookie.write().await = None;
        *self.data_sync_id.write().await = None;
        *self.auth_user.write().await = "0".to_string();
        *self.custom_user_agent.write().await = None;
        *self.visitor_data.write().await = None;
        self.rate_limit_until_ms.store(0, Ordering::SeqCst);
        self.stream_cache.write().await.clear();
        self.search_cache.write().await.clear();
    }

    pub async fn has_cookie(&self) -> bool {
        self.cookie
            .read()
            .await
            .as_ref()
            .map(|c| !c.trim().is_empty())
            .unwrap_or(false)
    }

    pub async fn get_cached_stream(&self, video_id: &str, quality: &str) -> Option<PlaybackData> {
        let key = format!("{video_id}:{quality}");
        let now = now_ms();
        let guard = self.stream_cache.read().await;
        if let Some(entry) = guard.get(&key) {
            if now < entry.expires_at_ms {
                return Some(entry.data.clone());
            }
        }
        None
    }

    pub async fn put_cached_stream(&self, video_id: &str, quality: &str, data: &PlaybackData) {
        let key = format!("{video_id}:{quality}");
        let now = now_ms();
        let upstream_ttl_ms = data
            .stream_expires_in_seconds
            .saturating_sub(300)
            .max(600)
            * 1000;
        let ttl_ms = STREAM_CACHE_TTL_MS.min(upstream_ttl_ms);
        let mut guard = self.stream_cache.write().await;
        if guard.len() >= 500 {
            guard.retain(|_, v| now < v.expires_at_ms);
            if guard.len() >= 500 {
                if let Some(first_key) = guard.keys().next().cloned() {
                    guard.remove(&first_key);
                }
            }
        }
        guard.insert(
            key,
            CachedStreamEntry {
                data: data.clone(),
                expires_at_ms: now + ttl_ms,
            },
        );
    }

    async fn send_innertube_post(
        &self,
        url: &str,
        headers: reqwest::header::HeaderMap,
        body: &Value,
        context_label: &str,
    ) -> Result<Value, String> {
        let now = now_ms();
        let cooldown_until = self.rate_limit_until_ms.load(Ordering::SeqCst);
        if now < cooldown_until {
            let secs = ((cooldown_until - now) / 1000).max(1);
            return Err(format!(
                "HTTP 429 Too Many Requests: YouTube đang tạm giới hạn tần suất truy vấn ({secs}s). Vui lòng đăng nhập YouTube trong Settings."
            ));
        }

        let _permit = self
            .request_semaphore
            .acquire()
            .await
            .map_err(|e| e.to_string())?;

        // Enforce gentle pacing so parallel searches/imports never burst-flood YouTube
        {
            let mut last_guard = self.last_request_ms.lock().await;
            let cur = now_ms();
            let elapsed = cur.saturating_sub(*last_guard);
            if *last_guard > 0 && elapsed < MIN_REQUEST_INTERVAL_MS {
                let wait_ms = (MIN_REQUEST_INTERVAL_MS - elapsed) as u64;
                sleep(Duration::from_millis(wait_ms)).await;
            }
            *last_guard = now_ms();
        }

        let res = self
            .client
            .post(url)
            .headers(headers)
            .json(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = res.status();
        if status.as_u16() == 429 {
            self.rate_limit_until_ms
                .store(now_ms() + RATE_LIMIT_COOLDOWN_MS, Ordering::SeqCst);
            return Err(format!(
                "HTTP 429 Too Many Requests ({context_label}): YouTube chặn tần suất truy vấn."
            ));
        }

        if !status.is_success() {
            return Err(format!("{context_label} returned HTTP {status}"));
        }

        res.json::<Value>().await.map_err(|e| e.to_string())
    }

    async fn build_headers(
        &self,
        yt_client: &YouTubeClient,
        set_login: bool,
        visitor: Option<&str>,
    ) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        let mut insert = |k: &'static str, v: &str| {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(v),
            ) {
                headers.insert(name, val);
            }
        };

        let cookie_opt = if set_login && yt_client.login_supported {
            self.cookie.read().await.clone()
        } else {
            None
        };

        let effective_ua = if matches!(
            yt_client.kind,
            ClientKind::Web | ClientKind::WebRemix | ClientKind::WebCreator
        ) {
            self.custom_user_agent
                .read()
                .await
                .clone()
                .unwrap_or_else(|| yt_client.user_agent.to_string())
        } else {
            yt_client.user_agent.to_string()
        };

        insert("Content-Type", "application/json");
        insert("X-Goog-Api-Format-Version", yt_client.api_format_version);
        insert("X-YouTube-Client-Name", yt_client.client_id);
        insert("X-YouTube-Client-Version", yt_client.client_version);
        insert("User-Agent", &effective_ua);
        insert("Accept", "application/json");
        insert("Accept-Language", "en-US,en;q=0.9,vi;q=0.8");

        if !yt_client.is_native_app() || cookie_opt.is_some() {
            insert("X-Origin", yt_client.api_origin);
            let referer = format!("{}/", yt_client.api_origin);
            insert("Referer", &referer);
            insert("Origin", yt_client.api_origin);
        }

        let fallback_vd = self
            .visitor_data
            .read()
            .await
            .as_ref()
            .map(|(v, _)| v.clone());
        if let Some(vd) = visitor.map(|s| s.to_string()).or(fallback_vd) {
            if !vd.is_empty() {
                insert("X-Goog-Visitor-Id", &vd);
            }
        }

        if let Some(ref c) = cookie_opt {
            insert("Cookie", c);
            let auth_user = self.auth_user.read().await.clone();
            insert("X-Goog-AuthUser", &auth_user);
            if let Some(auth) = Self::sapisid_hash(c, yt_client.api_origin) {
                insert("Authorization", &auth);
            }
        }

        headers
    }

    pub fn sapisid_hash(cookie: &str, origin: &str) -> Option<String> {
        let mut sapisid: Option<String> = None;
        let mut papisid_1p: Option<String> = None;
        let mut papisid_3p: Option<String> = None;

        for part in cookie.split(';') {
            if let Some(idx) = part.find('=') {
                let k = part[..idx].trim();
                let v = part[idx + 1..].trim();
                if v.is_empty() {
                    continue;
                }
                match k {
                    "SAPISID" => sapisid = Some(v.to_string()),
                    "__Secure-1PAPISID" => papisid_1p = Some(v.to_string()),
                    "__Secure-3PAPISID" => papisid_3p = Some(v.to_string()),
                    _ => {}
                }
            }
        }

        let primary = sapisid
            .clone()
            .or_else(|| papisid_3p.clone())
            .or_else(|| papisid_1p.clone())?;

        let now_sec = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let compute = |token: &str| -> String {
            let mut hasher = Sha1::new();
            hasher.update(format!("{now_sec} {token} {origin}").as_bytes());
            hasher
                .finalize()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };

        let mut tokens = vec![format!("SAPISIDHASH {now_sec}_{}", compute(&primary))];
        if let Some(ref p1) = papisid_1p {
            tokens.push(format!("SAPISID1PHASH {now_sec}_{}", compute(p1)));
        }
        if let Some(ref p3) = papisid_3p {
            tokens.push(format!("SAPISID3PHASH {now_sec}_{}", compute(p3)));
        }
        Some(tokens.join(" "))
    }

    pub async fn fetch_fresh_ytm_visitor_data(&self) -> Option<String> {
        static VD_JSON_RE: OnceLock<Regex> = OnceLock::new();
        static VD_CGT_RE: OnceLock<Regex> = OnceLock::new();

        let vd_json_re = VD_JSON_RE
            .get_or_init(|| Regex::new(r#""VISITOR_DATA"\s*:\s*"([^"]+)""#).unwrap());
        let vd_cgt_re = VD_CGT_RE
            .get_or_init(|| Regex::new(r#"(Cgt[A-Za-z0-9_\-%]{12,})"#).unwrap());

        for url in [
            "https://music.youtube.com/sw.js_data",
            "https://music.youtube.com/",
        ] {
            let Ok(res) = self
                .client
                .get(url)
                .header("User-Agent", USER_AGENT_WEB)
                .header("Accept-Language", "en-US,en;q=0.9")
                .send()
                .await
            else {
                continue;
            };
            if !res.status().is_success() {
                continue;
            }
            let Ok(text) = res.text().await else {
                continue;
            };

            let extracted = vd_json_re
                .captures(&text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string())
                .or_else(|| {
                    vd_cgt_re
                        .captures(&text)
                        .and_then(|c| c.get(1))
                        .map(|m| m.as_str().to_string())
                });

            if let Some(raw_vd) = extracted {
                let clean_vd = raw_vd.trim().to_string();
                if !clean_vd.is_empty() {
                    *self.visitor_data.write().await = Some((clean_vd.clone(), now_ms()));
                    return Some(clean_vd);
                }
            }
        }

        self.mint_visitor_id(&YouTubeClient::web_remix()).await
    }

    pub async fn ensure_session_visitor_data(&self) -> Option<String> {
        let now = now_ms();
        if let Some((ref vd, ts)) = *self.visitor_data.read().await {
            if !vd.is_empty() && now - ts < VISITOR_DATA_TTL_MS {
                return Some(vd.clone());
            }
        }
        self.fetch_fresh_ytm_visitor_data().await
    }

    pub async fn get_visitor_data_for_client(&self, yt_client: &YouTubeClient) -> Option<String> {
        let now = now_ms();
        if yt_client.own_visitor_id {
            if let Some((v, ts)) = self
                .own_visitor_ids
                .read()
                .await
                .get(yt_client.client_name)
                .cloned()
            {
                if now - ts < VISITOR_DATA_TTL_MS {
                    return Some(v);
                }
            }
            return self.mint_visitor_id(yt_client).await;
        }

        if let Some((existing, ts)) = self.visitor_data.read().await.clone() {
            if !existing.is_empty() && now - ts < VISITOR_DATA_TTL_MS {
                return Some(existing);
            }
        }
        self.fetch_fresh_ytm_visitor_data().await
    }

    pub async fn mint_visitor_id(&self, yt_client: &YouTubeClient) -> Option<String> {
        let url = format!("{}/youtubei/v1/visitor_id", yt_client.api_origin);
        let headers = self.build_headers(yt_client, false, None).await;
        let body = json!({
            "context": yt_client.to_context(None, None)
        });

        let data = self
            .send_innertube_post(&url, headers, &body, "YouTube visitor_id")
            .await
            .ok()?;
        let visitor = data
            .pointer("/responseContext/visitorData")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())?;

        let now = now_ms();
        if yt_client.own_visitor_id {
            self.own_visitor_ids
                .write()
                .await
                .insert(yt_client.client_name.to_string(), (visitor.clone(), now));
        } else {
            *self.visitor_data.write().await = Some((visitor.clone(), now));
        }
        Some(visitor)
    }

    pub async fn account_menu(&self) -> Result<Value, String> {
        let yt_client = YouTubeClient::web_remix();
        let visitor = self.get_visitor_data_for_client(&yt_client).await;
        let dsid = self.data_sync_id.read().await.clone();
        let url = format!("{}/youtubei/v1/account/account_menu", yt_client.api_origin);
        let headers = self.build_headers(&yt_client, true, visitor.as_deref()).await;
        let body = json!({
            "context": yt_client.to_context(visitor.as_deref(), dsid.as_deref()),
            "deviceTheme": "DEVICE_THEME_SUPPORTED",
            "userInterfaceTheme": "USER_INTERFACE_THEME_DARK"
        });
        self.send_innertube_post(&url, headers, &body, "YouTube account_menu")
            .await
    }

    pub async fn search(
        &self,
        yt_client: &YouTubeClient,
        query: Option<&str>,
        params: Option<&str>,
        continuation: Option<&str>,
    ) -> Result<Value, String> {
        let cache_key = if continuation.is_none() {
            Some(format!(
                "{}|{}|{}|{}",
                yt_client.client_name,
                yt_client.api_origin,
                query.unwrap_or(""),
                params.unwrap_or("")
            ))
        } else {
            None
        };

        if let Some(ref ck) = cache_key {
            let now = now_ms();
            if let Some(entry) = self.search_cache.read().await.get(ck) {
                if now < entry.expires_at_ms {
                    return Ok(entry.value.clone());
                }
            }
        }

        let visitor = self.get_visitor_data_for_client(yt_client).await;
        let has_login = self.has_cookie().await && yt_client.login_supported;
        let dsid = if has_login {
            self.data_sync_id.read().await.clone()
        } else {
            None
        };

        let url = if let Some(cont) = continuation {
            format!(
                "{}/youtubei/v1/search?continuation={}&ctoken={}",
                yt_client.api_origin,
                urlencoding::encode(cont),
                urlencoding::encode(cont)
            )
        } else {
            format!("{}/youtubei/v1/search", yt_client.api_origin)
        };
        let headers = self
            .build_headers(yt_client, has_login, visitor.as_deref())
            .await;
        let mut body = serde_json::Map::new();
        body.insert(
            "context".into(),
            yt_client.to_context(visitor.as_deref(), dsid.as_deref()),
        );
        if let Some(q) = query {
            body.insert("query".into(), json!(q));
        }
        if let Some(p) = params {
            body.insert("params".into(), json!(p));
        }

        let val = self
            .send_innertube_post(&url, headers, &Value::Object(body), "YouTube search")
            .await?;

        if let Some(ck) = cache_key {
            let now = now_ms();
            let mut guard = self.search_cache.write().await;
            if guard.len() >= 120 {
                guard.retain(|_, v| now < v.expires_at_ms);
                if guard.len() >= 120 {
                    if let Some(k) = guard.keys().next().cloned() {
                        guard.remove(&k);
                    }
                }
            }
            guard.insert(
                ck,
                CachedSearchEntry {
                    value: val.clone(),
                    expires_at_ms: now + SEARCH_CACHE_TTL_MS,
                },
            );
        }

        Ok(val)
    }

    pub async fn browse(
        &self,
        yt_client: &YouTubeClient,
        browse_id: Option<&str>,
        params: Option<&str>,
        continuation: Option<&str>,
        set_login: bool,
    ) -> Result<Value, String> {
        let visitor = self.get_visitor_data_for_client(yt_client).await;
        let dsid = self.data_sync_id.read().await.clone();
        let url = if let Some(cont) = continuation {
            format!(
                "{}/youtubei/v1/browse?continuation={}&ctoken={}",
                yt_client.api_origin,
                urlencoding::encode(cont),
                urlencoding::encode(cont)
            )
        } else {
            format!("{}/youtubei/v1/browse", yt_client.api_origin)
        };

        let headers = self
            .build_headers(yt_client, set_login, visitor.as_deref())
            .await;
        let mut body = serde_json::Map::new();
        body.insert(
            "context".into(),
            yt_client.to_context(
                visitor.as_deref(),
                if set_login { dsid.as_deref() } else { None },
            ),
        );
        if let Some(bid) = browse_id {
            body.insert("browseId".into(), json!(bid));
        }
        if let Some(p) = params {
            body.insert("params".into(), json!(p));
        }
        if let Some(c) = continuation {
            body.insert("continuation".into(), json!(c));
        }

        self.send_innertube_post(&url, headers, &Value::Object(body), "YouTube browse")
            .await
    }

    pub async fn player(
        &self,
        yt_client: &YouTubeClient,
        video_id: &str,
        playlist_id: Option<&str>,
        signature_timestamp: Option<i64>,
        po_token: Option<&str>,
    ) -> Result<Value, String> {
        let visitor = self.get_visitor_data_for_client(yt_client).await;
        let dsid = self.data_sync_id.read().await.clone();
        let url = format!("{}/youtubei/v1/player", yt_client.api_origin);
        let headers = self.build_headers(yt_client, true, visitor.as_deref()).await;

        let mut body = serde_json::Map::new();
        body.insert(
            "context".into(),
            yt_client.to_context(visitor.as_deref(), dsid.as_deref()),
        );
        body.insert("videoId".into(), json!(video_id));
        if let Some(pid) = playlist_id {
            body.insert("playlistId".into(), json!(pid));
        }
        body.insert("contentCheckOk".into(), json!(true));
        body.insert("racyCheckOk".into(), json!(true));

        if yt_client.use_signature_timestamp {
            if let Some(sts) = signature_timestamp {
                body.insert(
                    "playbackContext".into(),
                    json!({
                        "contentPlaybackContext": {
                            "signatureTimestamp": sts,
                            "html5Preference": "HTML5_PREF_WANTS"
                        }
                    }),
                );
            }
        }
        if let Some(pot) = po_token {
            body.insert(
                "serviceIntegrityDimensions".into(),
                json!({ "poToken": pot }),
            );
        }

        self.send_innertube_post(&url, headers, &Value::Object(body), "YouTube player API")
            .await
    }
}

pub struct YouTube;

impl YouTube {
    fn parse_duration(time_str: Option<&str>) -> Option<i64> {
        let s = time_str?.trim();
        let parts: Vec<i64> = s.split(':').filter_map(|p| p.parse::<i64>().ok()).collect();
        if parts.len() == 2 && s.split(':').count() == 2 {
            Some(parts[0] * 60 + parts[1])
        } else if parts.len() == 3 && s.split(':').count() == 3 {
            Some(parts[0] * 3600 + parts[1] * 60 + parts[2])
        } else {
            None
        }
    }

    fn extract_thumbnail_url(thumbnails: Option<&Vec<Value>>) -> String {
        let Some(arr) = thumbnails else {
            return String::new();
        };

        let normalize = |raw: &str| -> String {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                String::new()
            } else if trimmed.starts_with("//") {
                format!("https:{trimmed}")
            } else {
                trimmed.to_string()
            }
        };

        // Prefer static CDN thumbnails (avoid maxresdefault and yt3.googleusercontent.com rate-limits)
        if let Some(stable) = arr
            .iter()
            .rev()
            .filter_map(|v| v.get("url").and_then(|u| u.as_str()).map(normalize))
            .find(|url| {
                !url.is_empty()
                    && !url.contains("maxresdefault")
                    && !url.contains("yt3.googleusercontent.com")
            })
        {
            return stable;
        }

        arr.iter()
            .rev()
            .filter_map(|v| v.get("url").and_then(|u| u.as_str()).map(normalize))
            .find(|url| !url.is_empty() && !url.contains("yt3.googleusercontent.com"))
            .unwrap_or_default()
    }

    pub fn parse_responsive_list_item(renderer: &Value) -> Option<Value> {
        if renderer.is_null() {
            return None;
        }
        let flex_columns = renderer.get("flexColumns")?.as_array()?;
        let first_col_runs = flex_columns
            .first()?
            .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")?
            .as_array()?;
        let title = first_col_runs.first()?.get("text")?.as_str()?.to_string();

        let nav_endpoint = renderer.pointer("/navigationEndpoint/browseEndpoint");
        let browse_id = nav_endpoint
            .and_then(|n| n.get("browseId"))
            .and_then(|v| v.as_str());
        let page_type = nav_endpoint
            .and_then(|n| {
                n.pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
            })
            .and_then(|v| v.as_str());

        let thumbnails = renderer
            .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|v| v.as_array());
        let thumbnail_url = Self::extract_thumbnail_url(thumbnails);

        let is_explicit = renderer
            .get("badges")
            .and_then(|b| b.as_array())
            .map(|arr| {
                arr.iter().any(|b| {
                    b.pointer("/musicInlineBadgeRenderer/icon/iconType")
                        .and_then(|v| v.as_str())
                        == Some("MUSIC_EXPLICIT_BADGE")
                })
            })
            .unwrap_or(false);

        let mut video_id = renderer
            .pointer("/playlistItemData/videoId")
            .and_then(|v| v.as_str());
        if video_id.is_none() {
            video_id = renderer
                .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId")
                .and_then(|v| v.as_str());
        }
        if video_id.is_none() {
            video_id = first_col_runs
                .first()
                .and_then(|r| r.pointer("/navigationEndpoint/watchEndpoint/videoId"))
                .and_then(|v| v.as_str());
        }

        let secondary_runs = flex_columns
            .get(1)
            .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut run_groups: Vec<Vec<Value>> = Vec::new();
        let mut current_group: Vec<Value> = Vec::new();
        for run in secondary_runs {
            let txt = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if txt == " • " || txt.contains('•') {
                if !current_group.is_empty() {
                    run_groups.push(current_group);
                    current_group = Vec::new();
                }
            } else {
                current_group.push(run);
            }
        }
        if !current_group.is_empty() {
            run_groups.push(current_group);
        }

        if page_type == Some("MUSIC_PAGE_TYPE_ARTIST") {
            if let Some(bid) = browse_id {
                return Some(json!({
                    "id": bid,
                    "title": title,
                    "thumbnail": thumbnail_url,
                    "explicit": false,
                    "shareLink": format!("https://music.youtube.com/channel/{bid}"),
                    "channelId": bid
                }));
            }
        }

        if page_type == Some("MUSIC_PAGE_TYPE_ALBUM") {
            if let Some(bid) = browse_id {
                let artists: Vec<Artist> = run_groups
                    .get(1)
                    .or_else(|| run_groups.first())
                    .map(|g| {
                        g.iter()
                            .filter_map(|r| {
                                r.get("text").and_then(|t| t.as_str()).map(|name| Artist {
                                    name: name.to_string(),
                                    id: r
                                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string()),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let year_text = run_groups
                    .get(2)
                    .and_then(|g| g.first())
                    .or_else(|| run_groups.get(1).and_then(|g| g.first()))
                    .and_then(|r| r.get("text"))
                    .and_then(|v| v.as_str());
                let year = year_text.and_then(|y| y.parse::<i64>().ok());
                let playlist_id = renderer
                    .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchPlaylistEndpoint/playlistId")
                    .and_then(|v| v.as_str())
                    .unwrap_or(bid);

                return Some(json!({
                    "id": bid,
                    "browseId": bid,
                    "playlistId": playlist_id,
                    "title": title,
                    "artists": artists,
                    "year": year,
                    "thumbnail": thumbnail_url,
                    "explicit": is_explicit,
                    "shareLink": format!("https://music.youtube.com/playlist?list={playlist_id}")
                }));
            }
        }

        if page_type == Some("MUSIC_PAGE_TYPE_PLAYLIST") {
            if let Some(bid) = browse_id {
                let clean_id = bid.strip_prefix("VL").unwrap_or(bid);
                let author_text = run_groups
                    .first()
                    .and_then(|g| g.first())
                    .and_then(|r| r.get("text"))
                    .and_then(|v| v.as_str());
                let song_count_text = run_groups
                    .get(1)
                    .and_then(|g| g.first())
                    .and_then(|r| r.get("text"))
                    .and_then(|v| v.as_str());

                return Some(json!({
                    "id": clean_id,
                    "title": title,
                    "author": author_text.map(|a| json!({ "name": a, "id": null })),
                    "songCountText": song_count_text,
                    "thumbnail": thumbnail_url,
                    "explicit": false,
                    "shareLink": format!("https://music.youtube.com/playlist?list={clean_id}")
                }));
            }
        }

        if let Some(vid) = video_id {
            let artists: Vec<Artist> = run_groups
                .first()
                .map(|g| {
                    g.iter()
                        .filter_map(|r| {
                            let name = r.get("text")?.as_str()?;
                            if name.is_empty() || name.contains(':') {
                                return None;
                            }
                            Some(Artist {
                                name: name.to_string(),
                                id: r
                                    .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            let album = run_groups.get(1).and_then(|g| {
                g.iter().find_map(|r| {
                    let aid = r
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .and_then(|v| v.as_str())?;
                    let name = r.get("text").and_then(|v| v.as_str())?;
                    Some(Album {
                        name: name.to_string(),
                        id: Some(aid.to_string()),
                    })
                })
            });

            let duration_text = run_groups
                .last()
                .and_then(|g| g.first())
                .and_then(|r| r.get("text"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    renderer
                        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
                        .and_then(|v| v.as_str())
                })
                .map(|s| s.to_string());
            let duration = Self::parse_duration(duration_text.as_deref());

            let mvt = renderer
                .get("musicVideoType")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let is_video_song = mvt
                .as_deref()
                .map(|t| t != "MUSIC_VIDEO_TYPE_ATV")
                .unwrap_or(false);

            let thumbnail = if vid.len() == 11 {
                Some(format!("https://i.ytimg.com/vi/{vid}/mqdefault.jpg"))
            } else if !thumbnail_url.is_empty() {
                Some(thumbnail_url)
            } else {
                None
            };

            let song = SongItem {
                id: vid.to_string(),
                video_id: vid.to_string(),
                title,
                artists,
                album,
                duration,
                duration_text,
                music_video_type: mvt,
                is_video_song,
                thumbnail,
                explicit: is_explicit,
                share_link: format!("https://music.youtube.com/watch?v={vid}"),
                author: None,
                source: Some(if is_video_song { "yt_video" } else { "ytm_song" }.to_string()),
            };
            return serde_json::to_value(song).ok();
        }

        None
    }

    pub async fn search(
        inner: &InnerTube,
        query: &str,
        filter: Option<&str>,
    ) -> Result<SearchResult, String> {
        let raw = inner
            .search(&YouTubeClient::web_remix(), Some(query), filter, None)
            .await?;
        let mut items: Vec<Value> = Vec::new();
        let mut seen = std::collections::HashSet::new();

        let section_contents = raw
            .pointer("/contents/tabbedSearchResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for section in &section_contents {
            for pointer_path in [
                "/musicShelfRenderer/contents",
                "/musicCardShelfRenderer/contents",
                "/itemSectionRenderer/contents",
            ] {
                if let Some(arr) = section.pointer(pointer_path).and_then(|v| v.as_array()) {
                    for entry in arr {
                        if let Some(renderer) = entry.get("musicResponsiveListItemRenderer") {
                            if let Some(parsed) = Self::parse_responsive_list_item(renderer) {
                                let id = parsed
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !id.is_empty() && seen.insert(id) {
                                    items.push(parsed);
                                }
                            }
                        }
                    }
                }
            }
        }

        let continuation = section_contents
            .first()
            .and_then(|s| {
                s.pointer("/musicShelfRenderer/continuations/0/nextContinuationData/continuation")
            })
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(SearchResult {
            items,
            continuation,
        })
    }

    pub async fn search_songs(inner: &InnerTube, query: &str) -> Result<Vec<SongItem>, String> {
        let result = Self::search(
            inner,
            query,
            Some("EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D"),
        )
        .await?;

        let mut songs = Vec::new();
        for item in result.items {
            let vid = item
                .get("videoId")
                .or_else(|| item.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if vid.len() == 11
                && !vid.starts_with("MP")
                && !vid.starts_with("UC")
                && !vid.starts_with("VL")
            {
                if let Ok(mut song) = serde_json::from_value::<SongItem>(item) {
                    song.source = Some("ytm_song".to_string());
                    songs.push(song);
                }
            }
        }
        Ok(songs)
    }

    fn join_runs_text(val: Option<&Value>) -> String {
        let Some(v) = val else {
            return String::new();
        };
        if let Some(simple) = v.get("simpleText").and_then(|s| s.as_str()) {
            return simple.to_string();
        }
        v.get("runs")
            .and_then(|r| r.as_array())
            .map(|runs| {
                runs.iter()
                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default()
    }

    fn parse_video_renderer(v: &Value) -> Option<SongItem> {
        let vid = v.get("videoId")?.as_str()?.trim();
        if vid.len() != 11 {
            return None;
        }

        let is_live_badge = v
            .get("badges")
            .and_then(|b| b.as_array())
            .map(|badges| {
                badges.iter().any(|b| {
                    let style = b
                        .pointer("/metadataBadgeRenderer/style")
                        .and_then(|s| s.as_str())
                        .unwrap_or("");
                    let label = b
                        .pointer("/metadataBadgeRenderer/label")
                        .and_then(|s| s.as_str())
                        .unwrap_or("");
                    style.contains("LIVE")
                        || label.eq_ignore_ascii_case("LIVE")
                        || label.eq_ignore_ascii_case("PREMIERE")
                })
            })
            .unwrap_or(false);
        if is_live_badge {
            return None;
        }

        let is_live_overlay = v
            .get("thumbnailOverlays")
            .and_then(|o| o.as_array())
            .map(|overlays| {
                overlays.iter().any(|o| {
                    o.pointer("/thumbnailOverlayTimeStatusRenderer/style")
                        .and_then(|s| s.as_str())
                        == Some("LIVE")
                })
            })
            .unwrap_or(false);
        if is_live_overlay {
            return None;
        }

        let duration_str = Self::join_runs_text(v.get("lengthText")).trim().to_string();
        if duration_str.is_empty() {
            return None;
        }
        let duration = Self::parse_duration(Some(&duration_str));
        if duration.unwrap_or(0) <= 15 {
            return None;
        }

        let title = Self::join_runs_text(v.get("title")).trim().to_string();
        if title.is_empty() {
            return None;
        }

        let owner_raw = {
            let o1 = Self::join_runs_text(v.get("ownerText"));
            if !o1.trim().is_empty() {
                o1
            } else {
                Self::join_runs_text(v.get("longBylineText"))
            }
        };
        let owner = owner_raw.trim().to_string();
        let owner_id = v
            .pointer("/ownerText/runs/0/navigationEndpoint/browseEndpoint/browseId")
            .or_else(|| {
                v.pointer("/longBylineText/runs/0/navigationEndpoint/browseEndpoint/browseId")
            })
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());

        let artists = if owner.is_empty() {
            vec![]
        } else {
            vec![Artist {
                name: owner.clone(),
                id: owner_id,
            }]
        };
        let author = if owner.is_empty() { None } else { Some(owner) };

        let thumbnail = if vid.len() == 11 {
            Some(format!("https://i.ytimg.com/vi/{vid}/mqdefault.jpg"))
        } else {
            let thumb = Self::extract_thumbnail_url(
                v.pointer("/thumbnail/thumbnails")
                    .and_then(|t| t.as_array()),
            );
            if thumb.is_empty() {
                None
            } else {
                Some(thumb)
            }
        };

        Some(SongItem {
            id: vid.to_string(),
            video_id: vid.to_string(),
            title,
            artists,
            album: None,
            duration,
            duration_text: Some(duration_str),
            music_video_type: Some("MUSIC_VIDEO_TYPE_UGC".to_string()),
            is_video_song: true,
            thumbnail,
            explicit: false,
            share_link: format!("https://www.youtube.com/watch?v={vid}"),
            author,
            source: Some("yt_video".to_string()),
        })
    }

    pub async fn search_youtube_videos(
        inner: &InnerTube,
        query: &str,
    ) -> Result<Vec<SongItem>, String> {
        let raw = inner
            .search(&YouTubeClient::web_youtube(), Some(query), None, None)
            .await?;

        let sections = raw
            .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut videos = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for section in &sections {
            if let Some(items) = section
                .pointer("/itemSectionRenderer/contents")
                .and_then(|v| v.as_array())
            {
                for entry in items {
                    if let Some(vr) = entry.get("videoRenderer") {
                        if let Some(song) = Self::parse_video_renderer(vr) {
                            if seen.insert(song.id.clone()) {
                                videos.push(song);
                                if videos.len() >= 15 {
                                    return Ok(videos);
                                }
                            }
                        }
                    } else if let Some(shelf_items) = entry
                        .pointer("/shelfRenderer/content/verticalListRenderer/items")
                        .and_then(|v| v.as_array())
                    {
                        for shelf_entry in shelf_items {
                            if let Some(vr) = shelf_entry.get("videoRenderer") {
                                if let Some(song) = Self::parse_video_renderer(vr) {
                                    if seen.insert(song.id.clone()) {
                                        videos.push(song);
                                        if videos.len() >= 15 {
                                            return Ok(videos);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(videos)
    }

    pub async fn get_playlist(
        inner: &InnerTube,
        playlist_id: &str,
    ) -> Result<PlaylistPageResult, String> {
        let clean_id = if playlist_id.starts_with("VL") {
            playlist_id.to_string()
        } else {
            format!("VL{playlist_id}")
        };
        let raw = inner
            .browse(&YouTubeClient::web_remix(), Some(&clean_id), None, None, true)
            .await?;

        let base = raw.pointer(
            "/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0",
        );
        let header = base.and_then(|b| {
            b.get("musicResponsiveHeaderRenderer").or_else(|| {
                b.pointer("/musicEditablePlaylistDetailHeaderRenderer/header/musicResponsiveHeaderRenderer")
            })
        });

        let title = header
            .and_then(|h| h.pointer("/title/runs/0/text"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Playlist");
        let author_text = header
            .and_then(|h| h.pointer("/straplineTextOne/runs/0/text"))
            .and_then(|v| v.as_str());
        let song_count_text = header
            .and_then(|h| h.pointer("/secondSubtitle/runs/0/text"))
            .and_then(|v| v.as_str());
        let thumbnails = header
            .and_then(|h| h.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"))
            .and_then(|v| v.as_array());
        let thumbnail_url = Self::extract_thumbnail_url(thumbnails);
        let plain_id = playlist_id.strip_prefix("VL").unwrap_or(playlist_id);

        let playlist = json!({
            "id": plain_id,
            "title": title,
            "author": author_text.map(|a| json!({ "name": a, "id": null })),
            "songCountText": song_count_text,
            "thumbnail": thumbnail_url,
            "explicit": false,
            "shareLink": format!("https://music.youtube.com/playlist?list={plain_id}")
        });

        let shelf = raw
            .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer")
            .or_else(|| base.and_then(|b| b.get("musicPlaylistShelfRenderer")));

        let mut songs = Vec::new();
        if let Some(contents) = shelf.and_then(|s| s.get("contents")).and_then(|v| v.as_array()) {
            for item in contents {
                if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
                    if let Some(parsed) = Self::parse_responsive_list_item(renderer) {
                        if parsed.get("artists").is_some() {
                            if let Ok(song) = serde_json::from_value::<SongItem>(parsed) {
                                songs.push(song);
                            }
                        }
                    }
                }
            }
        }

        let continuation = shelf
            .and_then(|s| s.pointer("/continuations/0/nextContinuationData/continuation"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(PlaylistPageResult {
            playlist,
            songs,
            continuation,
        })
    }
}

pub struct YTPlayerUtils;

impl YTPlayerUtils {
    pub async fn resolve_playback_data(
        inner: &InnerTube,
        video_id: &str,
        quality: &str,
    ) -> Result<PlaybackData, String> {
        let video_id = video_id.trim();
        if video_id.len() != 11 || video_id == "undefined" {
            return Err(format!("Invalid 11-character videoId: \"{video_id}\""));
        }

        if let Some(cached) = inner.get_cached_stream(video_id, quality).await {
            return Ok(cached);
        }

        let _ = inner.ensure_session_visitor_data().await;
        let has_login = inner.has_cookie().await;

        // Distinct, non-repeating client sequence:
        // - Logged-in: prioritize Cookie + SAPISIDHASH clients (WEB_REMIX, WEB, ANDROID) first to bypass bot checks.
        // - Anonymous: use fresh YTM visitorData + stable clients (only 1 ANDROID_VR version, never 3 in a row).
        let clients_to_try: Vec<YouTubeClient> = if has_login {
            vec![
                YouTubeClient::web_remix(),
                YouTubeClient::tvhtml5_simply_embedded(),
                YouTubeClient::web(),
                YouTubeClient::mobile(),
                YouTubeClient::web_creator(),
                YouTubeClient::visionos(),
                YouTubeClient::android_vr_1_61_48(),
            ]
        } else {
            vec![
                YouTubeClient::visionos(),
                YouTubeClient::android_vr_1_61_48(),
                YouTubeClient::tvhtml5_simply_embedded(),
                YouTubeClient::web_remix(),
                YouTubeClient::ipados(),
            ]
        };

        let mut failures: Vec<String> = Vec::new();
        let mut sts_cached: Option<Option<i64>> = None;
        let mut bot_check_count = 0usize;
        let mut visitor_refreshed_on_bot = false;

        for yt_client in clients_to_try {
            if yt_client.login_required && !has_login {
                continue;
            }

            let sts = if yt_client.use_signature_timestamp {
                match sts_cached {
                    Some(val) => val,
                    None => {
                        let fetched = PlayerJsFetcher::get_signature_timestamp(&inner.client).await;
                        sts_cached = Some(fetched);
                        fetched
                    }
                }
            } else {
                None
            };

            let resp = match inner.player(&yt_client, video_id, None, sts, None).await {
                Ok(mut r) => {
                    if !has_login && Self::is_bot_check(&r) && !visitor_refreshed_on_bot {
                        visitor_refreshed_on_bot = true;
                        if yt_client.own_visitor_id {
                            let _ = inner.mint_visitor_id(&yt_client).await;
                        } else {
                            let _ = inner.fetch_fresh_ytm_visitor_data().await;
                        }
                        if let Ok(retried) = inner.player(&yt_client, video_id, None, sts, None).await {
                            r = retried;
                        }
                    }
                    r
                }
                Err(e) => {
                    let is_429 = e.contains("429") || e.to_lowercase().contains("too many requests");
                    failures.push(format!("{}: {e}", yt_client.client_name));
                    if is_429 {
                        return Err(format!(
                            "HTTP 429 Too Many Requests ({video_id}): {}",
                            failures.join(" | ")
                        ));
                    }
                    continue;
                }
            };

            let status = resp
                .pointer("/playabilityStatus/status")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown");
            if status != "OK" {
                let reason = resp
                    .pointer("/playabilityStatus/reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                failures.push(format!("{}: {status} ({reason})", yt_client.client_name));

                if Self::is_bot_check(&resp) {
                    bot_check_count += 1;
                    // Stop hammering further clients once 3 distinct clients confirm an IP-level bot gate
                    if !has_login && bot_check_count >= 3 {
                        break;
                    }
                }
                continue;
            }

            let candidates = Self::select_audio_format_candidates(&resp, quality);
            if candidates.is_empty() {
                failures.push(format!("{}: no audio formats", yt_client.client_name));
                continue;
            }

            for candidate in candidates {
                let Some(mut candidate_url) =
                    Self::resolve_format_url(&inner.client, &candidate, video_id).await
                else {
                    continue;
                };

                if candidate_url.contains("n=") {
                    candidate_url =
                        CipherDeobfuscator::transform_n_param_in_url(&inner.client, &candidate_url)
                            .await;
                }

                candidate_url = with_rn_param(&candidate_url, 0);

                let clen = Self::parse_content_length(&candidate);
                let stream_headers = yt_client.stream_headers();
                let mut is_valid =
                    Self::validate_status(&inner.client, &candidate_url, &stream_headers, clen)
                        .await;

                if !is_valid && yt_client.kind == ClientKind::VisionOs {
                    is_valid = true;
                }

                if !is_valid {
                    let re_transformed =
                        CipherDeobfuscator::transform_n_param_in_url(&inner.client, &candidate_url)
                            .await;
                    if re_transformed != candidate_url
                        && Self::validate_status(
                            &inner.client,
                            &re_transformed,
                            &stream_headers,
                            clen,
                        )
                        .await
                    {
                        candidate_url = re_transformed;
                        is_valid = true;
                    }
                }

                if is_valid {
                    let expires = resp
                        .pointer("/streamingData/expiresInSeconds")
                        .and_then(|v| {
                            v.as_i64()
                                .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                        })
                        .unwrap_or(21600);

                    let playback = PlaybackData {
                        audio_config: resp.pointer("/playerConfig/audioConfig").cloned(),
                        video_details: resp.get("videoDetails").cloned(),
                        playback_tracking: resp.get("playbackTracking").cloned(),
                        format: candidate,
                        stream_url: candidate_url.clone(),
                        original_stream_url: candidate_url,
                        stream_expires_in_seconds: expires,
                        stream_client: yt_client.client_name.to_string(),
                        stream_headers,
                    };

                    inner.put_cached_stream(video_id, quality, &playback).await;
                    return Ok(playback);
                }
            }
        }

        if bot_check_count > 0 {
            return Err(format!(
                "LOGIN_REQUIRED: Sign in to confirm you're not a bot ({video_id}) | {}",
                failures.join(" | ")
            ));
        }

        Err(format!(
            "All clients failed for video {video_id}: {}",
            failures.join(" | ")
        ))
    }

    fn is_bot_check(resp: &Value) -> bool {
        resp.pointer("/playabilityStatus/status")
            .and_then(|v| v.as_str())
            == Some("LOGIN_REQUIRED")
            && resp
                .pointer("/playabilityStatus/reason")
                .and_then(|v| v.as_str())
                .map(|r| r.to_lowercase().contains("bot"))
                .unwrap_or(false)
    }

    async fn resolve_format_url(
        client: &Client,
        format: &Value,
        video_id: &str,
    ) -> Option<String> {
        if let Some(u) = format.get("url").and_then(|v| v.as_str()) {
            if !u.is_empty() {
                return Some(u.to_string());
            }
        }
        let cipher = format
            .get("signatureCipher")
            .or_else(|| format.get("cipher"))
            .and_then(|v| v.as_str())?;
        CipherDeobfuscator::deobfuscate_stream_url(client, cipher, video_id).await
    }

    pub fn parse_content_length(format: &Value) -> Option<u64> {
        format.get("contentLength").and_then(|v| {
            v.as_u64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
        })
    }

    async fn validate_status(
        client: &Client,
        url_str: &str,
        headers: &HashMap<String, String>,
        content_length: Option<u64>,
    ) -> bool {
        let offset = match content_length {
            Some(cl) if cl > 1 => cl - 1,
            _ => 1_048_576,
        };
        let probe_url = with_rn_param(url_str, 0);
        let mut req = client.get(&probe_url);
        for (k, v) in headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if !headers.contains_key("User-Agent") {
            req = req.header("User-Agent", USER_AGENT_WEB);
        }
        req = req.header("Range", format!("bytes={offset}-{offset}"));

        match req.send().await {
            Ok(res) => {
                let code = res.status().as_u16();
                res.status().is_success()
                    || code == 206
                    || (code == 416 && content_length.is_none())
            }
            Err(_) => false,
        }
    }

    fn select_audio_format_candidates(resp: &Value, quality: &str) -> Vec<Value> {
        let Some(adaptive) = resp
            .pointer("/streamingData/adaptiveFormats")
            .and_then(|v| v.as_array())
        else {
            return vec![];
        };

        let audio_formats: Vec<Value> = adaptive
            .iter()
            .filter(|f| {
                f.get("width").map(|w| w.is_null()).unwrap_or(true)
                    && f.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0) > 0
                    && (f.get("url").and_then(|u| u.as_str()).is_some()
                        || f.get("signatureCipher").and_then(|u| u.as_str()).is_some()
                        || f.get("cipher").and_then(|u| u.as_str()).is_some())
            })
            .cloned()
            .collect();

        if audio_formats.is_empty() {
            return vec![];
        }

        let original: Vec<Value> = audio_formats
            .iter()
            .filter(|f| f.pointer("/audioTrack/isAutoDubbed").map(|v| v.is_null()).unwrap_or(true))
            .cloned()
            .collect();
        let mut usable = if original.is_empty() {
            audio_formats
        } else {
            original
        };

        let target_bps: Option<i64> = match quality {
            "LOW" => Some(70_000),
            "MEDIUM" => Some(135_000),
            _ => None,
        };

        let comparator = |a: &Value, b: &Value| -> std::cmp::Ordering {
            let a_direct = if a.get("url").and_then(|v| v.as_str()).is_some() { 1 } else { 0 };
            let b_direct = if b.get("url").and_then(|v| v.as_str()).is_some() { 1 } else { 0 };
            if a_direct != b_direct {
                return b_direct.cmp(&a_direct);
            }

            let a_mime = a.get("mimeType").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let b_mime = b.get("mimeType").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let a_mp4 = if a_mime.contains("mp4") { 1 } else { 0 };
            let b_mp4 = if b_mime.contains("mp4") { 1 } else { 0 };
            if a_mp4 != b_mp4 {
                return b_mp4.cmp(&a_mp4);
            }

            let q_rank = |v: &Value| -> i32 {
                match v.get("audioQuality").and_then(|q| q.as_str()) {
                    Some("AUDIO_QUALITY_HIGH") => 3,
                    Some("AUDIO_QUALITY_MEDIUM") => 2,
                    Some("AUDIO_QUALITY_LOW") => 1,
                    _ => 0,
                }
            };
            let aq = q_rank(a);
            let bq = q_rank(b);
            if aq != bq {
                return bq.cmp(&aq);
            }

            let ach = a.get("audioChannels").and_then(|v| v.as_i64()).unwrap_or(2);
            let bch = b.get("audioChannels").and_then(|v| v.as_i64()).unwrap_or(2);
            if ach != bch {
                return bch.cmp(&ach);
            }

            let abr = a.get("bitrate").and_then(|v| v.as_i64()).unwrap_or(0);
            let bbr = b.get("bitrate").and_then(|v| v.as_i64()).unwrap_or(0);
            if abr != bbr {
                return bbr.cmp(&abr);
            }

            let c_rank = |mime: &str| -> i32 {
                if mime.contains("mp4a") || mime.contains("mp4") || mime.contains("aac") {
                    3
                } else if mime.contains("opus") || mime.contains("webm") {
                    2
                } else {
                    1
                }
            };
            let ac = c_rank(&a_mime);
            let bc = c_rank(&b_mime);
            if ac != bc {
                return bc.cmp(&ac);
            }

            let sample_rate = |v: &Value| -> i64 {
                v.get("audioSampleRate")
                    .and_then(|r| r.as_i64().or_else(|| r.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0)
            };
            sample_rate(b).cmp(&sample_rate(a))
        };

        if let Some(max_bps) = target_bps {
            let mut below: Vec<Value> = usable
                .iter()
                .filter(|f| f.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0) <= max_bps)
                .cloned()
                .collect();
            let mut above: Vec<Value> = usable
                .iter()
                .filter(|f| f.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0) > max_bps)
                .cloned()
                .collect();
            below.sort_by(&comparator);
            above.sort_by(|a, b| {
                let abr = a.get("bitrate").and_then(|v| v.as_i64()).unwrap_or(0);
                let bbr = b.get("bitrate").and_then(|v| v.as_i64()).unwrap_or(0);
                abr.cmp(&bbr).then_with(|| comparator(a, b))
            });
            below.extend(above);
            below
        } else {
            usable.sort_by(&comparator);
            usable
        }
    }
}
