use crate::db::{now_ms, MochyDatabase};
use crate::importer::SpotifyClient;
use crate::models::{ImportedTrack, SpotifyAccountInfo};
use reqwest::Client;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::time::{sleep, Duration};

fn spotify_data_dir(app: &AppHandle, name: &str) -> PathBuf {
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
        pwstr_from_str, take_pwstr, CallDevToolsProtocolMethodCompletedHandler,
        ExecuteScriptCompletedHandler, GetCookiesCompletedHandler,
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
                log::warn!("[WebView2] ExecuteScript error: {e}");
            }
            let _ = take_pwstr(w_script);
        })
        .map_err(|e| e.to_string())?;

        rx.await.map_err(|e| e.to_string())?
    }

    pub async fn get_cookie(
        win: &WebviewWindow,
        uri: &str,
        cookie_name: &str,
    ) -> Option<String> {
        let (tx, rx) = oneshot::channel::<Option<String>>();
        let uri_owned = uri.to_string();
        let target_name = cookie_name.to_string();

        if win
            .with_webview(move |wv| unsafe {
                let mut tx = Some(tx);
                let controller = wv.controller();
                let Ok(core) = controller.CoreWebView2() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(None);
                    }
                    return;
                };
                let Ok(core2) = core.cast::<ICoreWebView2_2>() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(None);
                    }
                    return;
                };
                let Ok(manager) = core2.CookieManager() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(None);
                    }
                    return;
                };
                let w_uri = pwstr_from_str(&uri_owned);
                let handler = GetCookiesCompletedHandler::create(Box::new(move |hr, list| {
                    let mut found = None;
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
                                            if name == target_name {
                                                found = Some(val);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let Some(t) = tx.take() {
                        let _ = t.send(found);
                    }
                    Ok(())
                }));
                let _ = manager.GetCookies(PCWSTR(w_uri.as_ptr()), &handler);
                let _ = take_pwstr(w_uri);
            })
            .is_err()
        {
            return None;
        }

        rx.await.ok().flatten()
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

    pub async fn dispatch_mouse_wheel(win: &WebviewWindow, x: i32, y: i32, delta_y: i32) {
        let (tx, rx) = oneshot::channel::<()>();
        let params = format!(
            r#"{{"type":"mouseWheel","x":{x},"y":{y},"deltaX":0,"deltaY":{delta_y}}}"#
        );
        if win
            .with_webview(move |wv| unsafe {
                let mut tx = Some(tx);
                let controller = wv.controller();
                let Ok(core) = controller.CoreWebView2() else {
                    if let Some(t) = tx.take() {
                        let _ = t.send(());
                    }
                    return;
                };
                let w_method = pwstr_from_str("Input.dispatchMouseEvent");
                let w_params = pwstr_from_str(&params);
                let handler =
                    CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |_, _| {
                        if let Some(t) = tx.take() {
                            let _ = t.send(());
                        }
                        Ok(())
                    }));
                let _ = core.CallDevToolsProtocolMethod(
                    PCWSTR(w_method.as_ptr()),
                    PCWSTR(w_params.as_ptr()),
                    &handler,
                );
                let _ = take_pwstr(w_method);
                let _ = take_pwstr(w_params);
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
    pub async fn get_cookie(_win: &WebviewWindow, _uri: &str, _cookie_name: &str) -> Option<String> {
        None
    }
    pub async fn clear_cookies(_win: &WebviewWindow) {}
    pub async fn dispatch_mouse_wheel(_win: &WebviewWindow, _x: i32, _y: i32, _delta_y: i32) {}
}

async fn fetch_access_token_in_webview(win: &WebviewWindow) -> Option<Value> {
    let start_js = r#"
        window.__tayTokenRes = null;
        fetch("https://open.spotify.com/get_access_token?reason=transport&productType=web_player")
            .then(r => r.json())
            .then(d => { window.__tayTokenRes = JSON.stringify(d); })
            .catch(() => { window.__tayTokenRes = "ERR"; });
    "#;
    let _ = win_wv2::eval_script(win, start_js.to_string()).await;

    for _ in 0..30 {
        sleep(Duration::from_millis(150)).await;
        if let Ok(raw) = win_wv2::eval_script(win, "window.__tayTokenRes".to_string()).await {
            if raw == "null" || raw.is_empty() {
                continue;
            }
            if let Ok(decoded_str) = serde_json::from_str::<String>(&raw) {
                if decoded_str == "ERR" {
                    return None;
                }
                if let Ok(json_val) = serde_json::from_str::<Value>(&decoded_str) {
                    return Some(json_val);
                }
            }
        }
    }
    None
}

pub async fn open_login(
    app: &AppHandle,
    client: &Client,
    db: &MochyDatabase,
) -> Result<Option<SpotifyAccountInfo>, String> {
    if let Some(existing) = app.get_webview_window("spotify_auth") {
        let _ = existing.close();
        sleep(Duration::from_millis(200)).await;
    }

    let login_url: url::Url =
        "https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F"
            .parse()
            .map_err(|e: url::ParseError| e.to_string())?;

    let builder = WebviewWindowBuilder::new(app, "spotify_auth", WebviewUrl::External(login_url))
        .title("Đăng nhập tài khoản Spotify")
        .inner_size(480.0, 700.0)
        .center()
        .data_directory(spotify_data_dir(app, "spotify_session"));

    let auth_win = builder.build().map_err(|e| e.to_string())?;

    // Poll until user lands on open.spotify.com or closes the window (max 5 minutes)
    for _ in 0..1200 {
        sleep(Duration::from_millis(250)).await;
        let Some(win) = app.get_webview_window("spotify_auth") else {
            return Ok(None);
        };
        if let Ok(cur_url) = win.url() {
            let s = cur_url.as_str();
            if s.contains("open.spotify.com") && !s.contains("accounts.spotify.com") {
                sleep(Duration::from_millis(800)).await;
                let sp_dc = win_wv2::get_cookie(&win, "https://open.spotify.com", "sp_dc").await;
                if let Some(token_json) = fetch_access_token_in_webview(&win).await {
                    if let Some(access_token) =
                        token_json.get("accessToken").and_then(|v| v.as_str())
                    {
                        if let Ok(mut profile) = SpotifyClient::get_me(client, access_token).await {
                            profile.sp_dc = sp_dc;
                            profile.access_token = Some(access_token.to_string());
                            profile.expires_at = token_json
                                .get("accessTokenExpirationTimestampMs")
                                .and_then(|v| v.as_i64());

                            if let Ok(acc_json) = serde_json::to_string(&profile) {
                                let _ = db.set_setting("spotify_account_info", &acc_json);
                            }
                            let _ = win.close();
                            return Ok(Some(profile));
                        }
                    }
                }
                let _ = win.close();
                return Ok(None);
            }
        }
    }

    let _ = auth_win.close();
    Ok(None)
}

pub async fn get_valid_token(app: &AppHandle, db: &MochyDatabase) -> Option<String> {
    let raw = db.get_setting("spotify_account_info").ok()??;
    let mut account: SpotifyAccountInfo = serde_json::from_str(&raw).ok()?;
    let now = now_ms();

    if let (Some(ref token), Some(exp)) = (&account.access_token, account.expires_at) {
        if exp > now + 120_000 {
            return Some(token.clone());
        }
    }

    let url: url::Url = "https://open.spotify.com/".parse().ok()?;
    if let Some(existing) = app.get_webview_window("spotify_refresh") {
        let _ = existing.close();
    }

    let refresh_win =
        WebviewWindowBuilder::new(app, "spotify_refresh", WebviewUrl::External(url))
            .visible(false)
            .inner_size(400.0, 400.0)
            .data_directory(spotify_data_dir(app, "spotify_session"))
            .build()
            .ok()?;

    // Wait briefly for page load
    sleep(Duration::from_millis(2500)).await;
    let sp_dc = win_wv2::get_cookie(&refresh_win, "https://open.spotify.com", "sp_dc").await;
    if sp_dc.is_none() && account.sp_dc.is_none() {
        let _ = refresh_win.close();
        return account.access_token;
    }

    let token_json = fetch_access_token_in_webview(&refresh_win).await;
    let _ = refresh_win.close();

    if let Some(tj) = token_json {
        if let Some(new_token) = tj.get("accessToken").and_then(|v| v.as_str()) {
            account.access_token = Some(new_token.to_string());
            account.expires_at = tj
                .get("accessTokenExpirationTimestampMs")
                .and_then(|v| v.as_i64());
            if let Ok(updated) = serde_json::to_string(&account) {
                let _ = db.set_setting("spotify_account_info", &updated);
            }
            return Some(new_token.to_string());
        }
    }

    account.access_token
}

pub async fn logout(app: &AppHandle, db: &MochyDatabase) -> Result<bool, String> {
    if let Ok(url) = "https://open.spotify.com/".parse::<url::Url>() {
        if let Ok(win) =
            WebviewWindowBuilder::new(app, "spotify_logout", WebviewUrl::External(url))
                .visible(false)
                .inner_size(100.0, 100.0)
                .data_directory(spotify_data_dir(app, "spotify_session"))
                .build()
        {
            sleep(Duration::from_millis(300)).await;
            win_wv2::clear_cookies(&win).await;
            let _ = win.close();
        }
    }
    let session_dir = spotify_data_dir(app, "spotify_session");
    let _ = std::fs::remove_dir_all(&session_dir);
    let _ = db.delete_setting("spotify_account_info");
    let _ = db.delete_setting("spotify_auto_sync");
    let _ = db.delete_setting("spotify_sync_playlists");
    Ok(true)
}

pub async fn scrape_full_public_playlist(
    app: &AppHandle,
    playlist_id: &str,
) -> Vec<ImportedTrack> {
    let Ok(url) = format!("https://open.spotify.com/playlist/{playlist_id}").parse::<url::Url>()
    else {
        return vec![];
    };

    if let Some(existing) = app.get_webview_window("spotify_scrape") {
        let _ = existing.close();
    }

    let Ok(win) = WebviewWindowBuilder::new(app, "spotify_scrape", WebviewUrl::External(url))
        .visible(false)
        .inner_size(1280.0, 900.0)
        .data_directory(spotify_data_dir(app, "spotify_scrape"))
        .build()
    else {
        return vec![];
    };

    sleep(Duration::from_millis(5000)).await;

    let mut collected: HashMap<String, ImportedTrack> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    let mut seen_ids = HashSet::new();

    let scrape_js = r#"
        (() => {
          const links = document.querySelectorAll('a[href*="/track/"]');
          const res = [];
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/\/track\/([A-Za-z0-9]+)/);
            if (!m) continue;
            const id = m[1];
            const title = a.textContent.trim();
            if (!title) continue;

            const row = a.closest('[role="row"]') || a.closest('div[class*="legacy-list-row"]');
            let artist = '';
            let durationMs = null;
            if (row) {
              const artistLinks = row.querySelectorAll('a[href*="/artist/"]');
              artist = Array.from(artistLinks).map(el => el.textContent.trim()).filter(Boolean).join(', ');
              const textNodes = row.querySelectorAll('[data-encore-id="text"]');
              for (const tn of textNodes) {
                const t = tn.textContent.trim();
                if (/^\d+:\d{2}$/.test(t)) {
                  const parts = t.split(':').map(Number);
                  durationMs = (parts[0] * 60 + parts[1]) * 1000;
                  break;
                }
              }
            }

            res.push({
              title,
              artist,
              album: null,
              durationMs,
              sourceId: 'spotify:track:' + id
            });
          }
          return JSON.stringify(res);
        })()
    "#;

    for _ in 0..16 {
        if let Ok(raw) = win_wv2::eval_script(&win, scrape_js.to_string()).await {
            if let Ok(json_str) = serde_json::from_str::<String>(&raw) {
                if let Ok(batch) = serde_json::from_str::<Vec<ImportedTrack>>(&json_str) {
                    for t in batch {
                        if let Some(ref sid) = t.source_id {
                            if seen_ids.insert(sid.clone()) {
                                order.push(sid.clone());
                                collected.insert(sid.clone(), t);
                            }
                        }
                    }
                }
            }
        }
        win_wv2::dispatch_mouse_wheel(&win, 700, 500, 6000).await;
        sleep(Duration::from_millis(500)).await;
    }

    let _ = win.close();
    order
        .into_iter()
        .filter_map(|id| collected.remove(&id))
        .collect()
}
