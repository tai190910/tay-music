use crate::db::now_ms;
use regex::Regex;
use reqwest::Client;
use rquickjs::{Context, Runtime, Value as JsValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex, OnceLock};
use tokio::sync::Mutex as AsyncMutex;

const MERIYAH_JS: &str = include_str!("../solver/meriyah.js");
const ASTRING_JS: &str = include_str!("../solver/astring.js");
const YT_SOLVER_JS: &str = include_str!("../solver/yt.solver.core.js");

const IFRAME_API_URL: &str = "https://www.youtube.com/iframe_api";
const PLAYER_JS_URL_TEMPLATE: &str =
    "https://www.youtube.com/s/player/%s/player_ias.vflset/en_GB/base.js";
const CACHE_TTL_MS: i64 = 6 * 60 * 60 * 1000;

#[derive(Clone, Debug)]
pub struct PlayerJsResult {
    pub player_js: String,
    pub hash: String,
}

#[derive(Serialize, Deserialize)]
struct CachedMeta {
    hash: String,
    timestamp: i64,
}

struct MemPlayerCache {
    player_js: String,
    hash: String,
    timestamp: i64,
}

static MEMORY_CACHE: OnceLock<Mutex<Option<MemPlayerCache>>> = OnceLock::new();
static FETCH_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();

fn mem_cache() -> &'static Mutex<Option<MemPlayerCache>> {
    MEMORY_CACHE.get_or_init(|| Mutex::new(None))
}

fn cache_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("mochy_pc_cipher_cache");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub struct PlayerJsFetcher;

impl PlayerJsFetcher {
    pub async fn get_player_js(client: &Client, force_refresh: bool) -> Option<PlayerJsResult> {
        let _guard = FETCH_LOCK.get_or_init(|| AsyncMutex::new(())).lock().await;
        let now = now_ms();

        if !force_refresh {
            if let Ok(guard) = mem_cache().lock() {
                if let Some(ref c) = *guard {
                    if now - c.timestamp < CACHE_TTL_MS {
                        return Some(PlayerJsResult {
                            player_js: c.player_js.clone(),
                            hash: c.hash.clone(),
                        });
                    }
                }
            }

            let dir = cache_dir();
            let meta_file = dir.join("current_hash.json");
            if let Ok(meta_str) = std::fs::read_to_string(&meta_file) {
                if let Ok(meta) = serde_json::from_str::<CachedMeta>(&meta_str) {
                    if now - meta.timestamp < CACHE_TTL_MS {
                        let js_file = dir.join(format!("player_{}.js", meta.hash));
                        if let Ok(player_js) = std::fs::read_to_string(&js_file) {
                            if player_js.len() > 1000 {
                                if let Ok(mut guard) = mem_cache().lock() {
                                    *guard = Some(MemPlayerCache {
                                        player_js: player_js.clone(),
                                        hash: meta.hash.clone(),
                                        timestamp: meta.timestamp,
                                    });
                                }
                                return Some(PlayerJsResult {
                                    player_js,
                                    hash: meta.hash,
                                });
                            }
                        }
                    }
                }
            }
        }

        let hash = Self::fetch_player_hash(client).await?;
        let player_js = Self::download_player_js(client, &hash).await?;

        if let Ok(mut guard) = mem_cache().lock() {
            *guard = Some(MemPlayerCache {
                player_js: player_js.clone(),
                hash: hash.clone(),
                timestamp: now,
            });
        }

        let dir = cache_dir();
        let _ = std::fs::write(dir.join(format!("player_{hash}.js")), &player_js);
        if let Ok(meta_json) = serde_json::to_string(&CachedMeta {
            hash: hash.clone(),
            timestamp: now,
        }) {
            let _ = std::fs::write(dir.join("current_hash.json"), meta_json);
        }

        Some(PlayerJsResult { player_js, hash })
    }

    pub fn invalidate_cache() {
        if let Ok(mut guard) = mem_cache().lock() {
            *guard = None;
        }
        let dir = cache_dir();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    async fn fetch_player_hash(client: &Client) -> Option<String> {
        let res = client
            .get(IFRAME_API_URL)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .send()
            .await
            .ok()?;
        if !res.status().is_success() {
            return None;
        }
        let body = res.text().await.ok()?;
        let re = Regex::new(r"player[/\\]+([a-zA-Z0-9_-]+)").ok()?;
        re.captures(&body)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
    }

    async fn download_player_js(client: &Client, hash: &str) -> Option<String> {
        let url = PLAYER_JS_URL_TEMPLATE.replace("%s", hash);
        let res = client
            .get(&url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            )
            .send()
            .await
            .ok()?;
        if !res.status().is_success() {
            return None;
        }
        res.text().await.ok()
    }
}

struct SigFunctionInfo {
    name: String,
    constant_arg: Option<i64>,
}

struct NFunctionInfo {
    name: String,
    array_index: Option<i64>,
}

fn extract_sig_function_info(player_js: &str) -> Option<SigFunctionInfo> {
    let patterns = [
        r"&&\s*\(\s*[a-zA-Z0-9$]+\s*=\s*([a-zA-Z0-9$]+)\s*\(\s*(\d+)\s*,\s*decodeURIComponent\s*\(\s*[a-zA-Z0-9$]+\s*\)",
        r"\b[cs]\s*&&\s*[adf]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(",
        r"\b[a-zA-Z0-9]+\s*&&\s*[a-zA-Z0-9]+\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(",
        r"\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)",
        r"\bc\s*&&\s*d\.set\([^,]+\s*,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(",
        r"\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(",
        r#"(?:[\b;]|var\s+)([a-zA-Z0-9$]+)\s*=\s*function\(a\)\{a\s*=\s*a\.split\(""\);"#,
        r#"function\s+([a-zA-Z0-9$]+)\(a\)\{a\s*=\s*a\.split\(""\);"#,
        r#"([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9$]+\)\{[a-zA-Z0-9$]+\s*=\s*[a-zA-Z0-9$]+\.split\(""\);"#,
    ];
    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            if let Some(caps) = re.captures(player_js) {
                let name = caps.get(1)?.as_str().to_string();
                let const_arg = caps.get(2).and_then(|m| m.as_str().parse::<i64>().ok());
                return Some(SigFunctionInfo {
                    name,
                    constant_arg: const_arg,
                });
            }
        }
    }
    None
}

fn extract_n_function_info(player_js: &str) -> Option<NFunctionInfo> {
    let patterns = [
        r#"\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(([a-zA-Z0-9])\)"#,
        r#"\.get\("n"\)\)\s*&&\s*\(([a-zA-Z0-9$]+)\s*=\s*([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(\1\)"#,
        r"\(\s*([a-zA-Z0-9$]+)\s*=\s*String\.fromCharCode\(110\)",
        r"([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9]\)\s*\{[^}]*?enhanced_except_",
    ];
    for (idx, pat) in patterns.iter().enumerate() {
        if let Ok(re) = Regex::new(pat) {
            if let Some(caps) = re.captures(player_js) {
                return match idx {
                    0 => Some(NFunctionInfo {
                        name: caps.get(1)?.as_str().to_string(),
                        array_index: caps.get(2).and_then(|m| m.as_str().parse::<i64>().ok()),
                    }),
                    1 => Some(NFunctionInfo {
                        name: caps.get(2)?.as_str().to_string(),
                        array_index: caps.get(3).and_then(|m| m.as_str().parse::<i64>().ok()),
                    }),
                    _ => Some(NFunctionInfo {
                        name: caps.get(1)?.as_str().to_string(),
                        array_index: None,
                    }),
                };
            }
        }
    }
    None
}

enum SolverJob {
    Init {
        player_js: String,
        player_hash: String,
        reply: tokio::sync::oneshot::Sender<bool>,
    },
    TransformN {
        n_val: String,
        reply: tokio::sync::oneshot::Sender<String>,
    },
    DeobfuscateSig {
        sig: String,
        reply: tokio::sync::oneshot::Sender<Option<String>>,
    },
}

fn solver_sender() -> &'static mpsc::Sender<SolverJob> {
    static TX: OnceLock<mpsc::Sender<SolverJob>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<SolverJob>();
        std::thread::Builder::new()
            .name("tay-js-solver".to_string())
            .spawn(move || run_solver_worker(rx))
            .expect("Failed to spawn JS solver thread");
        tx
    })
}

fn run_solver_worker(rx: mpsc::Receiver<SolverJob>) {
    let Ok(rt) = Runtime::new() else {
        return;
    };
    let Ok(ctx) = Context::full(&rt) else {
        return;
    };

    let mut jsc_loaded = false;
    let mut cached_hash: Option<String> = None;

    for job in rx {
        match job {
            SolverJob::Init {
                player_js,
                player_hash,
                reply,
            } => {
                if cached_hash.as_deref() == Some(player_hash.as_str()) {
                    let _ = reply.send(true);
                    continue;
                }
                cached_hash = Some(player_hash);

                let ok = ctx.with(|ctx| -> bool {
                    let _ = ctx.eval::<JsValue, _>(
                        "globalThis.console = globalThis.console || { log: function(){}, warn: function(){}, error: function(){} };",
                    );

                    if !jsc_loaded {
                        if ctx.eval::<JsValue, _>(MERIYAH_JS).is_ok()
                            && ctx.eval::<JsValue, _>(ASTRING_JS).is_ok()
                            && ctx.eval::<JsValue, _>(YT_SOLVER_JS).is_ok()
                        {
                            jsc_loaded = true;
                        }
                    }

                    let _ = ctx.eval::<JsValue, _>("globalThis._tayNSolver = null; globalThis._taySigSolver = null;");

                    if jsc_loaded {
                        if let Ok(json_player) = serde_json::to_string(&player_js) {
                            let script = format!(
                                r#"(() => {{
                                    try {{
                                        const res = jsc({{
                                            type: "player",
                                            player: {json_player},
                                            requests: [],
                                            output_preprocessed: true
                                        }});
                                        if (res && res.type !== "error" && res.preprocessed_player) {{
                                            const out = {{ n: null, sig: null }};
                                            const runner = new Function("_result", res.preprocessed_player);
                                            runner(out);
                                            if (typeof out.n === "function") globalThis._tayNSolver = out.n;
                                            if (typeof out.sig === "function") globalThis._taySigSolver = out.sig;
                                            return !!(globalThis._tayNSolver || globalThis._taySigSolver);
                                        }}
                                    }} catch (e) {{}}
                                    return false;
                                }})()"#
                            );
                            if let Ok(v) = ctx.eval::<bool, _>(script) {
                                if v {
                                    return true;
                                }
                            }
                        }
                    }

                    // Fallback: FunctionNameExtractor + eval
                    let sig_info = extract_sig_function_info(&player_js);
                    let n_info = extract_n_function_info(&player_js);

                    let mut exports = Vec::new();
                    if let Some(ref si) = sig_info {
                        exports.push(format!(
                            "window._cipherSigFunc = typeof {} !== 'undefined' ? {} : null;",
                            si.name, si.name
                        ));
                    }
                    if let Some(ref ni) = n_info {
                        let expr = if let Some(idx) = ni.array_index {
                            format!("{}[{idx}]", ni.name)
                        } else {
                            ni.name.clone()
                        };
                        exports.push(format!(
                            "window._nTransformFunc = typeof {} !== 'undefined' ? {expr} : null;",
                            ni.name
                        ));
                    }

                    let mut modified_js = player_js;
                    if !exports.is_empty() {
                        let export_code = format!("; {} ", exports.join(" "));
                        modified_js = modified_js
                            .replace("})(_yt_player);", &format!("{export_code}}})(_yt_player);"));
                    }

                    let const_arg_js = sig_info
                        .as_ref()
                        .and_then(|s| s.constant_arg)
                        .map(|n| n.to_string())
                        .unwrap_or_else(|| "null".to_string());

                    let _ = ctx.eval::<JsValue, _>(
                        r#"
                        var window = globalThis;
                        var document = {};
                        var location = { href: "https://www.youtube.com" };
                        "#,
                    );
                    if ctx.eval::<JsValue, _>(modified_js).is_ok() {
                        let bind_script = format!(
                            r#"(() => {{
                                if (typeof window._nTransformFunc === "function") {{
                                    globalThis._tayNSolver = function(n) {{ return window._nTransformFunc(n); }};
                                }}
                                if (typeof window._cipherSigFunc === "function") {{
                                    const ca = {const_arg_js};
                                    globalThis._taySigSolver = function(sig) {{
                                        return ca !== null ? window._cipherSigFunc(ca, sig) : window._cipherSigFunc(sig);
                                    }};
                                }}
                                return !!(globalThis._tayNSolver || globalThis._taySigSolver);
                            }})()"#
                        );
                        return ctx.eval::<bool, _>(bind_script).unwrap_or(false);
                    }
                    false
                });

                let _ = reply.send(ok);
            }
            SolverJob::TransformN { n_val, reply } => {
                let res = ctx.with(|ctx| -> String {
                    let arg = serde_json::to_string(&n_val).unwrap_or_else(|_| "\"\"".to_string());
                    let script = format!(
                        r#"(() => {{
                            try {{
                                if (typeof globalThis._tayNSolver === "function") {{
                                    const r = globalThis._tayNSolver({arg});
                                    if (typeof r === "string" && r.length > 0) return r;
                                }}
                            }} catch (e) {{}}
                            return {arg};
                        }})()"#
                    );
                    ctx.eval::<String, _>(script).unwrap_or(n_val)
                });
                let _ = reply.send(res);
            }
            SolverJob::DeobfuscateSig { sig, reply } => {
                let res = ctx.with(|ctx| -> Option<String> {
                    let arg = serde_json::to_string(&sig).unwrap_or_else(|_| "\"\"".to_string());
                    let script = format!(
                        r#"(() => {{
                            try {{
                                if (typeof globalThis._taySigSolver === "function") {{
                                    const r = globalThis._taySigSolver({arg});
                                    if (typeof r === "string" && r.length > 0) return r;
                                }}
                            }} catch (e) {{}}
                            return "";
                        }})()"#
                    );
                    let out = ctx.eval::<String, _>(script).unwrap_or_default();
                    if out.is_empty() {
                        None
                    } else {
                        Some(out)
                    }
                });
                let _ = reply.send(res);
            }
        }
    }
}

pub struct CipherDeobfuscator;

impl CipherDeobfuscator {
    fn parse_query_params(query: &str) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for pair in query.split('&') {
            if let Some(idx) = pair.find('=') {
                let k = urlencoding::decode(&pair[..idx])
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| pair[..idx].to_string());
                let v = urlencoding::decode(&pair[idx + 1..])
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|_| pair[idx + 1..].to_string());
                map.insert(k, v);
            }
        }
        map
    }

    async fn init_solver(player_js: String, hash: String) -> bool {
        let (tx, rx) = tokio::sync::oneshot::channel();
        if solver_sender()
            .send(SolverJob::Init {
                player_js,
                player_hash: hash,
                reply: tx,
            })
            .is_err()
        {
            return false;
        }
        rx.await.unwrap_or(false)
    }

    pub async fn deobfuscate_stream_url(
        client: &Client,
        signature_cipher: &str,
        _video_id: &str,
    ) -> Option<String> {
        if let Some(url) = Self::deobfuscate_internal(client, signature_cipher, false).await {
            return Some(url);
        }
        PlayerJsFetcher::invalidate_cache();
        Self::deobfuscate_internal(client, signature_cipher, true).await
    }

    async fn deobfuscate_internal(
        client: &Client,
        signature_cipher: &str,
        is_retry: bool,
    ) -> Option<String> {
        let params = Self::parse_query_params(signature_cipher);
        let obfuscated_sig = params.get("s")?.clone();
        let sig_param = params
            .get("sp")
            .cloned()
            .unwrap_or_else(|| "signature".to_string());
        let base_url = params.get("url")?.clone();

        let pjs = PlayerJsFetcher::get_player_js(client, is_retry).await?;
        Self::init_solver(pjs.player_js, pjs.hash).await;

        let (tx, rx) = tokio::sync::oneshot::channel();
        solver_sender()
            .send(SolverJob::DeobfuscateSig {
                sig: obfuscated_sig,
                reply: tx,
            })
            .ok()?;
        let deobfuscated_sig = rx.await.ok().flatten()?;

        let sep = if base_url.contains('?') { '&' } else { '?' };
        Some(format!(
            "{base_url}{sep}{sig_param}={}",
            urlencoding::encode(&deobfuscated_sig)
        ))
    }

    pub async fn transform_n_param_in_url(client: &Client, url_str: &str) -> String {
        static N_RE: OnceLock<Regex> = OnceLock::new();
        let re = N_RE.get_or_init(|| Regex::new(r"([?&])n=([^&]+)").unwrap());
        let Some(caps) = re.captures(url_str) else {
            return url_str.to_string();
        };
        let n_val = urlencoding::decode(&caps[2])
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| caps[2].to_string());

        let Some(pjs) = PlayerJsFetcher::get_player_js(client, false).await else {
            return url_str.to_string();
        };
        Self::init_solver(pjs.player_js, pjs.hash).await;

        let (tx, rx) = tokio::sync::oneshot::channel();
        if solver_sender()
            .send(SolverJob::TransformN {
                n_val: n_val.clone(),
                reply: tx,
            })
            .is_err()
        {
            return url_str.to_string();
        }

        let Ok(transformed) = rx.await else {
            return url_str.to_string();
        };
        if transformed == n_val {
            return url_str.to_string();
        }

        re.replace(
            url_str,
            format!("${{1}}n={}", urlencoding::encode(&transformed)),
        )
        .to_string()
    }
}
