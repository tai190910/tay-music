use crate::db::{now_ms, MochyDatabase};
use crate::innertube::InnerTube;
use crate::models::YouTubeAccountInfo;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};

const YT_COOKIE_KEY: &str = "youtube_cookie";
const YT_ACCOUNT_KEY: &str = "youtube_account_info";

fn youtube_data_dir(app: &AppHandle, name: &str) -> PathBuf {
    let base = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join(name);
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

#[cfg(windows)]
mod win_wv2 {
    use super::*;
    use tokio::sync::oneshot;
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_2;
    use webview2_com::{
        pwstr_from_str, take_pwstr, ExecuteScriptCompletedHandler, GetCookiesCompletedHandler,
    };
    use windows::core::{Interface, PCWSTR, PWSTR};

    pub async fn eval_script(win: &WebviewWindow, script: String) -> Result<String, String> {
        let (tx, rx) = oneshot::channel::<Result<String, String>>();
        win.with_webview(move |wv| unsafe {
            let mut tx = Some(tx);
            let controller = wv.controller();
            let Ok(core) = controller.CoreWebView2() else {
                if let Some(t) = tx.take() {
                    let _ = t.send(Err("CoreWebView2 unavailable".to_string()));
                }
                return;
            };
            let w_script = pwstr_from_str(&script);
            let handler = ExecuteScriptCompletedHandler::create(Box::new(move |hr, res| {
                if let Some(t) = tx.take() {
                    if hr.is_ok() {
                        let _ = t.send(Ok(res));
                    } else {
                        let _ = t.send(Err(format!("ExecuteScript failed: {hr:?}")));
                    }
                }
                Ok(())
            }));
            if let Err(e) = core.ExecuteScript(PCWSTR(w_script.as_ptr()), &handler) {
                log::warn!("[YT WebView2] ExecuteScript error: {e}");
            }
            let _ = take_pwstr(w_script);
        })
        .map_err(|e| e.to_string())?;

        rx.await.map_err(|e| e.to_string())?
    }

    pub async fn get_cookies_for_uri(win: &WebviewWindow, uri: &str) -> Vec<(String, String)> {
        let (tx, rx) = oneshot::channel::<Vec<(String, String)>>();
        let uri_owned = uri.to_string();

        if win
            .with_webview(move |wv| unsafe {
                let mut tx = Some(tx);
                let controller = wv.controller();
                let Ok(core) = controller.CoreWebView2() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(Vec::new());
                    }
                    return;
                };
                let Ok(core2) = core.cast::<ICoreWebView2_2>() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(Vec::new());
                    }
                    return;
                };
                let Ok(manager) = core2.CookieManager() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(Vec::new());
                    }
                    return;
                };
                let w_uri = pwstr_from_str(&uri_owned);
                let handler = GetCookiesCompletedHandler::create(Box::new(move |hr, list| {
                    let mut pairs = Vec::new();
                    if hr.is_ok() {
                        if let Some(cookies) = list {
                            let mut count = 0u32;
                            if cookies.Count(&mut count).is_ok() {
                                for i in 0..count {
                                    if let Ok(cookie) = cookies.GetValueAtIndex(i) {
                                        let mut name_pw = PWSTR::null();
                                        let mut val_pw = PWSTR::null();
                                        if cookie.Name(&mut name_pw).is_ok()
                                            && cookie.Value(&mut val_pw).is_ok()
                                        {
                                            let name = take_pwstr(name_pw);
                                            let val = take_pwstr(val_pw);
                                            if !name.is_empty() && !val.is_empty() {
                                                pairs.push((name, val));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let Some(t) = tx.take() {
                        let _ = t.send(pairs);
                    }
                    Ok(())
                }));
                let _ = manager.GetCookies(PCWSTR(w_uri.as_ptr()), &handler);
                let _ = take_pwstr(w_uri);
            })
            .is_err()
        {
            return Vec::new();
        }

        rx.await.unwrap_or_default()
    }

    pub async fn clear_cookies(win: &WebviewWindow) {
        let (tx, rx) = oneshot::channel::<()>();
        if win
            .with_webview(move |wv| unsafe {
                let controller = wv.controller();
                if let Ok(core) = controller.CoreWebView2() {
                    if let Ok(core2) = core.cast::<ICoreWebView2_2>() {
                        if let Ok(manager) = core2.CookieManager() {
                            let _ = manager.DeleteAllCookies();
                        }
                    }
                }
                let _ = tx.send(());
            })
            .is_ok()
        {
            let _ = rx.await;
        }
    }
}

#[cfg(not(windows))]
mod win_wv2 {
    use super::*;
    pub async fn eval_script(_win: &WebviewWindow, _script: String) -> Result<String, String> {
        Err("WebView2 helpers are only implemented on Windows".to_string())
    }
    pub async fn get_cookies_for_uri(_win: &WebviewWindow, _uri: &str) -> Vec<(String, String)> {
        Vec::new()
    }
    pub async fn clear_cookies(_win: &WebviewWindow) {}
}

fn normalize_datasync_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some((first, second)) = trimmed.split_once("||") {
        let f = first.trim();
        let s = second.trim();
        // Only send onBehalfOfUser when delegated to a secondary Brand Account (both parts present).
        if !f.is_empty() && !s.is_empty() {
            return Some(f.to_string());
        }
        return None;
    }
    None
}

pub fn has_youtube_auth_cookies(map: &HashMap<String, String>) -> bool {
    let has_papisid = map.contains_key("SAPISID")
        || map.contains_key("__Secure-3PAPISID")
        || map.contains_key("__Secure-1PAPISID");
    let has_sid = map.contains_key("SID")
        || map.contains_key("__Secure-3PSID")
        || map.contains_key("__Secure-1PSID")
        || map.contains_key("LOGIN_INFO");
    has_papisid && has_sid
}

async fn collect_youtube_cookies(win: &WebviewWindow) -> Option<(String, HashMap<String, String>)> {
    let mut merged: HashMap<String, String> = HashMap::new();
    let mut order: Vec<String> = Vec::new();

    for uri in ["https://www.youtube.com", "https://music.youtube.com"] {
        for (name, val) in win_wv2::get_cookies_for_uri(win, uri).await {
            if !merged.contains_key(&name) {
                order.push(name.clone());
            }
            merged.insert(name, val);
        }
    }

    if merged.is_empty() {
        return None;
    }

    let cookie_header = order
        .iter()
        .filter_map(|k| merged.get(k).map(|v| format!("{k}={v}")))
        .collect::<Vec<_>>()
        .join("; ");

    Some((cookie_header, merged))
}

#[derive(Default, Clone)]
struct WebviewSessionMeta {
    visitor_data: Option<String>,
    data_sync_id: Option<String>,
    auth_user: Option<String>,
    user_agent: Option<String>,
}

async fn extract_ytcfg_meta(win: &WebviewWindow) -> WebviewSessionMeta {
    let script = r#"
        (() => {
            try {
                const cfg = (window.ytcfg && window.ytcfg.data_) ? window.ytcfg.data_ : {};
                return JSON.stringify({
                    visitorData: cfg.VISITOR_DATA || null,
                    datasyncId: cfg.DATASYNC_ID || null,
                    authUser: cfg.SESSION_INDEX != null ? String(cfg.SESSION_INDEX) : "0",
                    userAgent: navigator.userAgent || null
                });
            } catch (e) {
                return JSON.stringify({ userAgent: navigator.userAgent || null });
            }
        })()
    "#;

    let mut meta = WebviewSessionMeta::default();
    if let Ok(raw) = win_wv2::eval_script(win, script.to_string()).await {
        if let Ok(json_str) = serde_json::from_str::<String>(&raw) {
            if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                meta.visitor_data = val
                    .get("visitorData")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                meta.data_sync_id = val
                    .get("datasyncId")
                    .and_then(|v| v.as_str())
                    .and_then(normalize_datasync_id);
                meta.auth_user = val
                    .get("authUser")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                meta.user_agent = val
                    .get("userAgent")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
            }
        }
    }
    meta
}

fn extract_runs_str(val: Option<&Value>) -> Option<String> {
    let v = val?;
    if let Some(s) = v.get("simpleText").and_then(|t| t.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    let joined = v
        .get("runs")
        .and_then(|r| r.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    let trimmed = joined.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

async fn finalize_login_session(
    inner: &InnerTube,
    db: &MochyDatabase,
    cookie_header: String,
    meta: WebviewSessionMeta,
) -> YouTubeAccountInfo {
    inner
        .set_auth(
            Some(cookie_header.clone()),
            meta.data_sync_id.clone(),
            meta.auth_user.clone(),
            meta.user_agent.clone(),
            meta.visitor_data.clone(),
        )
        .await;

    let mut account_name: Option<String> = None;
    let mut email: Option<String> = None;
    let mut channel_handle: Option<String> = None;
    let mut photo_url: Option<String> = None;

    if let Ok(menu) = inner.account_menu().await {
        let header = menu
            .pointer("/actions/0/openPopupAction/popup/multiPageMenuRenderer/header/activeAccountHeaderRenderer");
        if let Some(h) = header {
            account_name = extract_runs_str(h.get("accountName"));
            email = extract_runs_str(h.get("email"));
            channel_handle = extract_runs_str(h.get("channelHandle"));
            photo_url = h
                .pointer("/accountPhoto/thumbnails")
                .and_then(|t| t.as_array())
                .and_then(|arr| arr.last())
                .and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
                .filter(|u| !u.contains("yt3.googleusercontent.com"))
                .map(|s| s.to_string());
        }
    }

    if account_name.is_none() {
        account_name = Some("Tài khoản YouTube Music".to_string());
    }

    let info = YouTubeAccountInfo {
        logged_in: true,
        account_name,
        email,
        channel_handle,
        photo_url,
        visitor_data: meta.visitor_data,
        data_sync_id: meta.data_sync_id,
        auth_user: meta.auth_user,
        user_agent: meta.user_agent,
        updated_at: now_ms(),
    };

    let _ = db.set_setting(YT_COOKIE_KEY, &cookie_header);
    if let Ok(info_json) = serde_json::to_string(&info) {
        let _ = db.set_setting(YT_ACCOUNT_KEY, &info_json);
    }

    info
}

pub fn load_saved_auth_sync(inner: &InnerTube, db: &MochyDatabase) {
    let cookie = db
        .get_setting(YT_COOKIE_KEY)
        .ok()
        .flatten()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let Some(cookie_str) = cookie else {
        return;
    };

    let account = db
        .get_setting(YT_ACCOUNT_KEY)
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<YouTubeAccountInfo>(&raw).ok());

    let dsid = account.as_ref().and_then(|a| a.data_sync_id.clone());
    let auth_user = account.as_ref().and_then(|a| a.auth_user.clone());
    let ua = account.as_ref().and_then(|a| a.user_agent.clone());
    let vd = account.as_ref().and_then(|a| a.visitor_data.clone());

    tauri::async_runtime::block_on(inner.set_auth(Some(cookie_str), dsid, auth_user, ua, vd));
    log::info!("[YouTube Auth] Restored saved YouTube session from SQLite settings");
}

pub fn get_saved_account(db: &MochyDatabase) -> Result<Option<YouTubeAccountInfo>, String> {
    let has_cookie = db
        .get_setting(YT_COOKIE_KEY)?
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    if !has_cookie {
        return Ok(None);
    }

    if let Some(raw) = db.get_setting(YT_ACCOUNT_KEY)? {
        if let Ok(mut parsed) = serde_json::from_str::<YouTubeAccountInfo>(&raw) {
            parsed.logged_in = true;
            return Ok(Some(parsed));
        }
    }

    Ok(Some(YouTubeAccountInfo {
        logged_in: true,
        account_name: Some("Tài khoản YouTube Music".to_string()),
        email: None,
        channel_handle: None,
        photo_url: None,
        visitor_data: None,
        data_sync_id: None,
        auth_user: Some("0".to_string()),
        user_agent: None,
        updated_at: now_ms(),
    }))
}

pub async fn open_login(
    app: &AppHandle,
    inner: &InnerTube,
    db: &MochyDatabase,
) -> Result<Option<YouTubeAccountInfo>, String> {
    if let Some(existing) = app.get_webview_window("youtube_auth") {
        let _ = existing.close();
        sleep(Duration::from_millis(200)).await;
    }

    let login_url: url::Url =
        "https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F&hl=vi"
            .parse()
            .map_err(|e: url::ParseError| e.to_string())?;

    let builder = WebviewWindowBuilder::new(app, "youtube_auth", WebviewUrl::External(login_url))
        .title("Đăng nhập YouTube Music (Chống chặn Bot)")
        .inner_size(520.0, 720.0)
        .center()
        .data_directory(youtube_data_dir(app, "youtube_session"));

    let auth_win = builder.build().map_err(|e| e.to_string())?;

    let mut last_valid_cookie: Option<(String, WebviewSessionMeta)> = None;
    let mut yt_settle_ticks = 0u32;

    // Poll up to 5 minutes (750 * 400ms)
    for _ in 0..750 {
        sleep(Duration::from_millis(400)).await;

        let Some(win) = app.get_webview_window("youtube_auth") else {
            // User closed the WebView window manually — save if valid auth cookies were already captured
            if let Some((cookie_str, meta)) = last_valid_cookie {
                let info = finalize_login_session(inner, db, cookie_str, meta).await;
                return Ok(Some(info));
            }
            return Ok(None);
        };

        let Ok(cur_url) = win.url() else {
            continue;
        };
        let host = cur_url.host_str().unwrap_or("");
        let on_youtube = host == "music.youtube.com" || host == "www.youtube.com" || host == "m.youtube.com";

        if !on_youtube {
            yt_settle_ticks = 0;
            continue;
        }

        if let Some((cookie_str, cookie_map)) = collect_youtube_cookies(&win).await {
            if has_youtube_auth_cookies(&cookie_map) {
                let meta = extract_ytcfg_meta(&win).await;
                last_valid_cookie = Some((cookie_str, meta));
                yt_settle_ticks += 1;

                let ready_on_music = host == "music.youtube.com" && yt_settle_ticks >= 2;
                let ready_on_main = yt_settle_ticks >= 4;

                if ready_on_music || ready_on_main {
                    sleep(Duration::from_millis(700)).await;
                    if let Some((fresh_cookie, fresh_map)) = collect_youtube_cookies(&win).await {
                        if has_youtube_auth_cookies(&fresh_map) {
                            let fresh_meta = extract_ytcfg_meta(&win).await;
                            last_valid_cookie = Some((fresh_cookie, fresh_meta));
                        }
                    }
                    let _ = win.close();
                    if let Some((final_cookie, final_meta)) = last_valid_cookie {
                        let info = finalize_login_session(inner, db, final_cookie, final_meta).await;
                        return Ok(Some(info));
                    }
                }
            }
        }
    }

    let _ = auth_win.close();
    if let Some((cookie_str, meta)) = last_valid_cookie {
        let info = finalize_login_session(inner, db, cookie_str, meta).await;
        return Ok(Some(info));
    }
    Ok(None)
}

pub async fn logout(
    app: &AppHandle,
    inner: &InnerTube,
    db: &MochyDatabase,
) -> Result<bool, String> {
    if let Some(existing) = app.get_webview_window("youtube_auth") {
        let _ = existing.close();
        sleep(Duration::from_millis(150)).await;
    }

    if let Ok(url) = "https://music.youtube.com/".parse::<url::Url>() {
        if let Ok(win) =
            WebviewWindowBuilder::new(app, "youtube_logout", WebviewUrl::External(url))
                .visible(false)
                .inner_size(100.0, 100.0)
                .data_directory(youtube_data_dir(app, "youtube_session"))
                .build()
        {
            sleep(Duration::from_millis(300)).await;
            win_wv2::clear_cookies(&win).await;
            let _ = win.close();
        }
    }

    let session_dir = youtube_data_dir(app, "youtube_session");
    let _ = std::fs::remove_dir_all(&session_dir);
    let _ = db.delete_setting(YT_COOKIE_KEY);
    let _ = db.delete_setting(YT_ACCOUNT_KEY);
    inner.clear_auth().await;
    Ok(true)
}
