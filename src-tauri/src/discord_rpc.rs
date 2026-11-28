use crate::models::DiscordRpcStatus;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::task::spawn_blocking;
use tokio::time::sleep;

/// Dán Application ID (Client ID) từ Discord Developer Portal vào hằng số bên dưới:
pub const DISCORD_CLIENT_ID: &str = "1575873625653903493";

const DEFAULT_ASSET_KEY: &str = "tay_music_logo";
const DOWNLOAD_URL: &str = "https://github.com/TeXfRuV50/tay-music";
const FOREGROUND_RETRY_COOLDOWN: Duration = Duration::from_secs(3);
const BACKGROUND_POLL_INTERVAL: Duration = Duration::from_secs(12);

#[derive(Debug, Clone)]
pub struct PresenceSnapshot {
    pub title: String,
    pub artist: String,
    pub thumbnail_url: Option<String>,
    pub duration_secs: Option<f64>,
    pub current_time_secs: Option<f64>,
    pub is_playing: bool,
    pub video_id: Option<String>,
    pub recorded_at: Instant,
}

struct DiscordRpcInner {
    client: Option<DiscordIpcClient>,
    connected: bool,
    enabled: bool,
    last_connect_attempt: Option<Instant>,
    last_presence: Option<PresenceSnapshot>,
}

pub struct DiscordRpcManager {
    inner: Arc<Mutex<DiscordRpcInner>>,
}

pub fn effective_client_id() -> Option<String> {
    let raw = DISCORD_CLIENT_ID.trim();
    if !raw.is_empty() && raw != "YOUR_APP_ID_HERE" {
        return Some(raw.to_string());
    }
    if let Ok(env_id) = std::env::var("TAY_DISCORD_CLIENT_ID") {
        let trimmed = env_id.trim();
        if !trimmed.is_empty() && trimmed != "YOUR_APP_ID_HERE" {
            return Some(trimmed.to_string());
        }
    }
    None
}

pub fn sanitize_discord_text(raw: &str, fallback: &str) -> String {
    let base = raw.trim();
    let candidate = if base.is_empty() { fallback } else { base };

    let mut out = if candidate.len() > 116 {
        let mut end = 113;
        while end > 0 && !candidate.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...", candidate[..end].trim_end())
    } else {
        candidate.to_string()
    };

    // Discord IPC rejects text fields shorter than 2 characters.
    while out.chars().count() < 2 {
        out.push(' ');
    }
    out
}

fn valid_youtube_video_id(raw: Option<&str>) -> Option<String> {
    let vid = raw?.trim();
    if vid.len() == 11
        && !vid.starts_with("sc:")
        && !vid.starts_with("LP_")
        && !vid.starts_with("VL")
        && !vid.starts_with("UC")
        && vid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Some(vid.to_string())
    } else {
        None
    }
}

fn resolve_large_image(thumbnail_url: Option<&str>, valid_yt_id: Option<&str>) -> String {
    if let Some(url) = thumbnail_url.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if url.starts_with("https://i.ytimg.com/") && url.len() <= 250 {
            return url.to_string();
        }
    }
    if let Some(vid) = valid_yt_id {
        return format!("https://i.ytimg.com/vi/{vid}/mqdefault.jpg");
    }
    if let Some(url) = thumbnail_url.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if url.starts_with("https://")
            && url.len() <= 250
            && !url.contains("googleusercontent.com")
        {
            return url.to_string();
        }
    }
    DEFAULT_ASSET_KEY.to_string()
}

fn send_snapshot_on_client(
    client: &mut DiscordIpcClient,
    snap: &PresenceSnapshot,
    extra_elapsed_secs: f64,
) -> Result<(), String> {
    let details_str = sanitize_discord_text(&snap.title, "Tày Music");
    let artist_clean = if snap.artist.trim().is_empty() {
        "Nghệ sĩ chưa rõ"
    } else {
        snap.artist.trim()
    };
    let state_str = if snap.is_playing {
        sanitize_discord_text(artist_clean, "Nghệ sĩ chưa rõ")
    } else {
        sanitize_discord_text(&format!("{artist_clean} • Đang tạm dừng"), "Đang tạm dừng")
    };

    let valid_vid = valid_youtube_video_id(snap.video_id.as_deref());
    let large_image_str = resolve_large_image(snap.thumbnail_url.as_deref(), valid_vid.as_deref());
    let small_text_str = if snap.is_playing {
        "Đang phát"
    } else {
        "Đang tạm dừng"
    };

    let mut payload = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .details(&details_str)
        .state(&state_str)
        .assets(
            activity::Assets::new()
                .large_image(&large_image_str)
                .large_text("Tày Music")
                .small_image(DEFAULT_ASSET_KEY)
                .small_text(small_text_str),
        );

    if snap.is_playing {
        let now_unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let cur_sec =
            (snap.current_time_secs.unwrap_or(0.0) + extra_elapsed_secs).max(0.0).round() as i64;
        let start_ts = now_unix.saturating_sub(cur_sec);
        let dur_sec = snap.duration_secs.unwrap_or(0.0).max(0.0).round() as i64;

        let ts = if dur_sec > 0 && cur_sec < dur_sec {
            activity::Timestamps::new()
                .start(start_ts)
                .end(start_ts + dur_sec)
        } else {
            activity::Timestamps::new().start(start_ts)
        };
        payload = payload.timestamps(ts);
    }

    let yt_url_opt = valid_vid.map(|vid| format!("https://youtu.be/{vid}"));
    let mut buttons = Vec::with_capacity(2);
    if let Some(ref yt_url) = yt_url_opt {
        buttons.push(activity::Button::new("Nghe trên YouTube", yt_url));
    }
    buttons.push(activity::Button::new("Tải Tày Music", DOWNLOAD_URL));
    payload = payload.buttons(buttons);

    client.set_activity(payload).map_err(|e| e.to_string())
}

fn emit_status_if_changed(app: &AppHandle, prev_connected: bool, status: &DiscordRpcStatus) {
    if prev_connected != status.connected {
        let _ = app.emit("discord:statusChanged", status);
    }
}

impl DiscordRpcManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(DiscordRpcInner {
                client: None,
                connected: false,
                enabled: true,
                last_connect_attempt: None,
                last_presence: None,
            })),
        }
    }

    pub fn current_status(&self) -> DiscordRpcStatus {
        let configured = effective_client_id().is_some();
        let connected = self
            .inner
            .lock()
            .map(|g| g.connected && configured)
            .unwrap_or(false);
        DiscordRpcStatus {
            connected,
            configured,
        }
    }

    fn update_blocking(inner_arc: &Arc<Mutex<DiscordRpcInner>>, snap: PresenceSnapshot) -> (bool, DiscordRpcStatus) {
        let Some(client_id) = effective_client_id() else {
            if let Ok(mut guard) = inner_arc.lock() {
                let prev = guard.connected;
                guard.enabled = true;
                guard.last_presence = Some(snap);
                guard.connected = false;
                guard.client = None;
                return (
                    prev,
                    DiscordRpcStatus {
                        connected: false,
                        configured: false,
                    },
                );
            }
            return (
                false,
                DiscordRpcStatus {
                    connected: false,
                    configured: false,
                },
            );
        };

        let Ok(mut guard) = inner_arc.lock() else {
            return (
                false,
                DiscordRpcStatus {
                    connected: false,
                    configured: true,
                },
            );
        };

        let prev_connected = guard.connected;
        guard.enabled = true;
        guard.last_presence = Some(snap.clone());

        if guard.client.is_none() || !guard.connected {
            let throttled = guard
                .last_connect_attempt
                .map(|t| t.elapsed() < FOREGROUND_RETRY_COOLDOWN)
                .unwrap_or(false);
            if throttled {
                return (
                    prev_connected,
                    DiscordRpcStatus {
                        connected: false,
                        configured: true,
                    },
                );
            }
            guard.last_connect_attempt = Some(Instant::now());

            let mut client = DiscordIpcClient::new(&client_id);
            if client.connect().is_err() {
                guard.client = None;
                guard.connected = false;
                return (
                    prev_connected,
                    DiscordRpcStatus {
                        connected: false,
                        configured: true,
                    },
                );
            }
            guard.client = Some(client);
            guard.connected = true;
        }

        let send_ok = if let Some(ref mut client) = guard.client {
            send_snapshot_on_client(client, &snap, 0.0).is_ok()
        } else {
            false
        };

        if !send_ok {
            // Discord may have restarted; drop broken pipe and attempt one clean reconnect.
            guard.client = None;
            guard.connected = false;
            guard.last_connect_attempt = Some(Instant::now());

            let mut fresh = DiscordIpcClient::new(&client_id);
            if fresh.connect().is_ok() && send_snapshot_on_client(&mut fresh, &snap, 0.0).is_ok() {
                guard.client = Some(fresh);
                guard.connected = true;
            }
        }

        let status = DiscordRpcStatus {
            connected: guard.connected,
            configured: true,
        };
        (prev_connected, status)
    }

    pub async fn update_presence(&self, app: &AppHandle, snap: PresenceSnapshot) -> DiscordRpcStatus {
        let inner = self.inner.clone();
        let (prev_connected, status) = spawn_blocking(move || Self::update_blocking(&inner, snap))
            .await
            .unwrap_or_else(|_| (false, self.current_status()));
        emit_status_if_changed(app, prev_connected, &status);
        status
    }

    fn clear_blocking(inner_arc: &Arc<Mutex<DiscordRpcInner>>, disable: bool) -> (bool, DiscordRpcStatus) {
        let configured = effective_client_id().is_some();
        let Ok(mut guard) = inner_arc.lock() else {
            return (
                false,
                DiscordRpcStatus {
                    connected: false,
                    configured,
                },
            );
        };

        let prev_connected = guard.connected;
        if disable {
            guard.enabled = false;
        }
        guard.last_presence = None;

        if let Some(ref mut client) = guard.client {
            if client.clear_activity().is_err() {
                guard.connected = false;
                guard.client = None;
            }
            if disable {
                if let Some(mut old_client) = guard.client.take() {
                    let _ = old_client.close();
                }
                guard.connected = false;
            }
        } else if disable {
            guard.connected = false;
        }

        let status = DiscordRpcStatus {
            connected: guard.connected && configured,
            configured,
        };
        (prev_connected, status)
    }

    pub async fn clear_presence(&self, app: &AppHandle, disable: bool) -> DiscordRpcStatus {
        let inner = self.inner.clone();
        let (prev_connected, status) =
            spawn_blocking(move || Self::clear_blocking(&inner, disable))
                .await
                .unwrap_or_else(|_| (false, self.current_status()));
        emit_status_if_changed(app, prev_connected, &status);
        status
    }

    fn probe_blocking(inner_arc: &Arc<Mutex<DiscordRpcInner>>, replay_if_present: bool) -> (bool, DiscordRpcStatus) {
        let Some(client_id) = effective_client_id() else {
            let prev = inner_arc.lock().map(|g| g.connected).unwrap_or(false);
            return (
                prev,
                DiscordRpcStatus {
                    connected: false,
                    configured: false,
                },
            );
        };

        let Ok(mut guard) = inner_arc.lock() else {
            return (
                false,
                DiscordRpcStatus {
                    connected: false,
                    configured: true,
                },
            );
        };

        let prev_connected = guard.connected;
        if !guard.enabled {
            return (
                prev_connected,
                DiscordRpcStatus {
                    connected: false,
                    configured: true,
                },
            );
        }

        if guard.client.is_none() || !guard.connected {
            let throttled = guard
                .last_connect_attempt
                .map(|t| t.elapsed() < FOREGROUND_RETRY_COOLDOWN)
                .unwrap_or(false);
            if !throttled {
                guard.last_connect_attempt = Some(Instant::now());
                let mut client = DiscordIpcClient::new(&client_id);
                if client.connect().is_ok() {
                    guard.connected = true;
                    if replay_if_present {
                        if let Some(ref snap) = guard.last_presence {
                            let extra = if snap.is_playing {
                                snap.recorded_at.elapsed().as_secs_f64()
                            } else {
                                0.0
                            };
                            if send_snapshot_on_client(&mut client, snap, extra).is_err() {
                                guard.connected = false;
                            }
                        }
                    }
                    if guard.connected {
                        guard.client = Some(client);
                    }
                } else {
                    guard.connected = false;
                    guard.client = None;
                }
            }
        }

        let status = DiscordRpcStatus {
            connected: guard.connected,
            configured: true,
        };
        (prev_connected, status)
    }

    pub async fn probe_status(&self, app: &AppHandle) -> DiscordRpcStatus {
        let inner = self.inner.clone();
        let (prev_connected, status) = spawn_blocking(move || Self::probe_blocking(&inner, true))
            .await
            .unwrap_or_else(|_| (false, self.current_status()));
        emit_status_if_changed(app, prev_connected, &status);
        status
    }

    pub fn shutdown_sync(&self) {
        let _ = Self::clear_blocking(&self.inner, true);
    }
}

pub fn spawn_background_reconnect(app: AppHandle, manager: Arc<DiscordRpcManager>) {
    tauri::async_runtime::spawn(async move {
        // Initial non-blocking check shortly after startup
        sleep(Duration::from_secs(2)).await;
        let _ = manager.probe_status(&app).await;

        loop {
            sleep(BACKGROUND_POLL_INTERVAL).await;
            let needs_connect = manager
                .inner
                .lock()
                .map(|g| g.enabled && !g.connected)
                .unwrap_or(false);
            if needs_connect && effective_client_id().is_some() {
                let inner = manager.inner.clone();
                let (prev_connected, status) =
                    spawn_blocking(move || DiscordRpcManager::probe_blocking(&inner, true))
                        .await
                        .unwrap_or_else(|_| (false, manager.current_status()));
                emit_status_if_changed(&app, prev_connected, &status);
            }
        }
    });
}
