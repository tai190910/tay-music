use crate::cipher::CipherDeobfuscator;
use crate::models::{Album, Artist, PlaybackData, PlaylistPageResult, SearchResult, SongItem};
use crate::proxy::with_rn_param;
use reqwest::Client;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub const ORIGIN_YOUTUBE: &str = "https://www.youtube.com";
pub const ORIGIN_YOUTUBE_MUSIC: &str = "https://music.youtube.com";
pub const USER_AGENT_WEB: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

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

pub struct InnerTube {
    pub client: Client,
    visitor_data: Arc<RwLock<Option<String>>>,
    own_visitor_ids: Arc<RwLock<HashMap<String, String>>>,
    cookie: Arc<RwLock<Option<String>>>,
    data_sync_id: Arc<RwLock<Option<String>>>,
}

impl InnerTube {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            visitor_data: Arc::new(RwLock::new(None)),
            own_visitor_ids: Arc::new(RwLock::new(HashMap::new())),
            cookie: Arc::new(RwLock::new(None)),
            data_sync_id: Arc::new(RwLock::new(None)),
        }
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

        insert("Content-Type", "application/json");
        insert("X-Goog-Api-Format-Version", yt_client.api_format_version);
        insert("X-YouTube-Client-Name", yt_client.client_id);
        insert("X-YouTube-Client-Version", yt_client.client_version);
        insert("User-Agent", yt_client.user_agent);
        insert("Accept", "application/json");
        insert("Accept-Language", "en-US,en;q=0.9");

        if !yt_client.is_native_app() {
            insert("X-Origin", yt_client.api_origin);
            let referer = format!("{}/", yt_client.api_origin);
            insert("Referer", &referer);
            insert("Origin", yt_client.api_origin);
        }

        let fallback_vd = self.visitor_data.read().await.clone();
        if let Some(vd) = visitor.map(|s| s.to_string()).or(fallback_vd) {
            if !vd.is_empty() {
                insert("X-Goog-Visitor-Id", &vd);
            }
        }

        if set_login && yt_client.login_supported {
            if let Some(ref c) = *self.cookie.read().await {
                insert("Cookie", c);
                if let Some(auth) = Self::sapisid_hash(c, yt_client.api_origin) {
                    insert("Authorization", &auth);
                }
            }
        }

        headers
    }

    fn sapisid_hash(cookie: &str, origin: &str) -> Option<String> {
        let mut sapisid = None;
        for part in cookie.split(';') {
            if let Some(idx) = part.find('=') {
                let k = part[..idx].trim();
                let v = part[idx + 1..].trim();
                if k == "SAPISID" || k == "__Secure-3PAPISID" {
                    sapisid = Some(v.to_string());
                    break;
                }
            }
        }
        let sapisid = sapisid?;
        let now_sec = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut hasher = Sha1::new();
        hasher.update(format!("{now_sec} {sapisid} {origin}").as_bytes());
        let hash = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        Some(format!("SAPISIDHASH {now_sec}_{hash}"))
    }

    pub async fn get_visitor_data_for_client(&self, yt_client: &YouTubeClient) -> Option<String> {
        if yt_client.own_visitor_id {
            if let Some(v) = self
                .own_visitor_ids
                .read()
                .await
                .get(yt_client.client_name)
                .cloned()
            {
                return Some(v);
            }
            return self.mint_visitor_id(yt_client).await;
        }
        let existing = self.visitor_data.read().await.clone();
        if existing.is_some() {
            return existing;
        }
        self.mint_visitor_id(yt_client).await
    }

    pub async fn mint_visitor_id(&self, yt_client: &YouTubeClient) -> Option<String> {
        let url = format!("{}/youtubei/v1/visitor_id", yt_client.api_origin);
        let headers = self.build_headers(yt_client, false, None).await;
        let body = json!({
            "context": yt_client.to_context(None, None)
        });

        let res = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .ok()?;
        if !res.status().is_success() {
            return None;
        }
        let data: Value = res.json().await.ok()?;
        let visitor = data
            .pointer("/responseContext/visitorData")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())?;

        if yt_client.own_visitor_id {
            self.own_visitor_ids
                .write()
                .await
                .insert(yt_client.client_name.to_string(), visitor.clone());
        } else {
            *self.visitor_data.write().await = Some(visitor.clone());
        }
        Some(visitor)
    }

    pub async fn search(
        &self,
        yt_client: &YouTubeClient,
        query: Option<&str>,
        params: Option<&str>,
        continuation: Option<&str>,
    ) -> Result<Value, String> {
        let visitor = self.get_visitor_data_for_client(yt_client).await;
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
        let headers = self.build_headers(yt_client, false, visitor.as_deref()).await;
        let mut body = serde_json::Map::new();
        body.insert(
            "context".into(),
            yt_client.to_context(visitor.as_deref(), None),
        );
        if let Some(q) = query {
            body.insert("query".into(), json!(q));
        }
        if let Some(p) = params {
            body.insert("params".into(), json!(p));
        }

        let res = self
            .client
            .post(&url)
            .headers(headers)
            .json(&Value::Object(body))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("YouTube search returned HTTP {}", res.status()));
        }
        res.json::<Value>().await.map_err(|e| e.to_string())
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

        let res = self
            .client
            .post(&url)
            .headers(headers)
            .json(&Value::Object(body))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("YouTube browse returned HTTP {}", res.status()));
        }
        res.json::<Value>().await.map_err(|e| e.to_string())
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

        let res = self
            .client
            .post(&url)
            .headers(headers)
            .json(&Value::Object(body))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("YouTube player API returned HTTP {}", res.status()));
        }
        res.json::<Value>().await.map_err(|e| e.to_string())
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
        thumbnails
            .and_then(|arr| arr.last())
            .and_then(|v| v.get("url"))
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string()
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
                thumbnail: Some(thumbnail_url),
                explicit: is_explicit,
                share_link: format!("https://music.youtube.com/watch?v={vid}"),
                author: None,
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
                if let Ok(song) = serde_json::from_value::<SongItem>(item) {
                    songs.push(song);
                }
            }
        }
        Ok(songs)
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

        if inner.visitor_data.read().await.is_none() {
            let _ = inner.mint_visitor_id(&YouTubeClient::web_remix()).await;
        }

        let main_client = YouTubeClient::visionos();
        let mut failures: Vec<String> = Vec::new();
        let mut main_player_response: Option<Value> = None;

        match inner
            .player(&main_client, video_id, None, None, None)
            .await
        {
            Ok(mut answer) => {
                if Self::is_bot_check(&answer) {
                    let _ = inner.mint_visitor_id(&main_client).await;
                    if let Ok(retried) = inner
                        .player(&main_client, video_id, None, None, None)
                        .await
                    {
                        answer = retried;
                    }
                }
                main_player_response = Some(answer);
            }
            Err(e) => failures.push(format!("VISIONOS: {e}")),
        }

        let clients_to_try = vec![
            YouTubeClient::visionos(),
            YouTubeClient::web_remix(),
            YouTubeClient::web(),
            YouTubeClient::web_creator(),
            YouTubeClient::ipados(),
            YouTubeClient::android_vr_1_43_32(),
            YouTubeClient::android_vr_1_61_48(),
            YouTubeClient::android_vr_1_65_10(),
            YouTubeClient::tvhtml5_simply_embedded(),
            YouTubeClient::tvhtml5(),
            YouTubeClient::android_creator(),
            YouTubeClient::mobile(),
        ];

        for yt_client in clients_to_try {
            let resp_opt = if yt_client.kind == ClientKind::VisionOs {
                if main_player_response
                    .as_ref()
                    .and_then(|r| r.pointer("/playabilityStatus/status"))
                    .and_then(|v| v.as_str())
                    == Some("OK")
                {
                    main_player_response.clone()
                } else {
                    None
                }
            } else if yt_client.login_required {
                continue;
            } else {
                match inner.player(&yt_client, video_id, None, None, None).await {
                    Ok(r) => Some(r),
                    Err(e) => {
                        failures.push(format!("{}: {e}", yt_client.client_name));
                        continue;
                    }
                }
            };

            let Some(resp) = resp_opt else {
                continue;
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

                    return Ok(PlaybackData {
                        audio_config: resp.pointer("/playerConfig/audioConfig").cloned(),
                        video_details: resp.get("videoDetails").cloned(),
                        playback_tracking: resp.get("playbackTracking").cloned(),
                        format: candidate,
                        stream_url: candidate_url.clone(),
                        original_stream_url: candidate_url,
                        stream_expires_in_seconds: expires,
                        stream_client: yt_client.client_name.to_string(),
                        stream_headers,
                    });
                }
            }
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
