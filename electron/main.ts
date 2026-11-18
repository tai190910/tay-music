// electron/main.ts

import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  YouTube,
  AudioQuality,
  MochyDatabase,
  LocalStreamProxy,
  SpotifyClient,
  MusicImportService,
  TrackMatcher,
} from "../src/core/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chromium Autoplay and Audio flags: Ensure audio playback is never blocked by browser policies
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies");
app.commandLine.appendSwitch("force-wave-audio"); // Reliable low-latency audio rendering on Windows

let mainWindow: BrowserWindow | null = null;
let db: MochyDatabase;
const streamProxy = new LocalStreamProxy();

function initDatabase(): void {
  try {
    const userDataDir = app.getPath("userData");
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    const dbPath = path.join(userDataDir, "mochy_music.db");
    console.log("[Electron] Initializing Mochy Database at:", dbPath);
    db = new MochyDatabase(dbPath);
  } catch (err: any) {
    console.error("[Electron] Critical: Failed to open userData DB at", app.getPath("userData"), ":", err?.message || err);
    throw err;
  }
}

/**
 * Intercepts all requests to *.googlevideo.com in Chromium/Electron.
 * 1. Strips Origin & Referer to prevent YouTube from blocking local/web origins.
 * 2. Enforces the authentic VISIONOS User-Agent matching the client parameter in the stream URL.
 * 3. Injects CORS and Accept-Ranges headers into responses.
 */
function setupNetworkHeaderInterception(): void {
  const filter = { urls: ["*://*.googlevideo.com/*"] };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };

    // Strip Origin and Referer completely
    delete requestHeaders["Origin"];
    delete requestHeaders["origin"];
    delete requestHeaders["Referer"];
    delete requestHeaders["referer"];
    delete requestHeaders["sec-ch-ua"];
    delete requestHeaders["sec-ch-ua-mobile"];
    delete requestHeaders["sec-ch-ua-platform"];
    delete requestHeaders["sec-fetch-site"];
    delete requestHeaders["sec-fetch-mode"];
    delete requestHeaders["sec-fetch-dest"];

    // Enforce VISIONOS User-Agent
    requestHeaders["User-Agent"] =
      "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)";
    requestHeaders["Accept-Encoding"] = "identity";

    callback({ requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders["access-control-allow-origin"] = ["*"];
    responseHeaders["access-control-allow-methods"] = ["GET, HEAD, OPTIONS"];
    responseHeaders["access-control-allow-headers"] = ["Range, Accept, Accept-Encoding"];
    responseHeaders["access-control-expose-headers"] = ["Content-Length, Content-Range, Accept-Ranges"];
    responseHeaders["accept-ranges"] = ["bytes"];
    callback({ responseHeaders });
  });

  console.log("[Electron] Registered webRequest header interceptor for *.googlevideo.com");
}

function registerIpcHandlers(): void {
  // YouTube API
  ipcMain.handle("youtube:search", async (_event, query: string) => {
    try {
      return await YouTube.search(query);
    } catch (err: any) {
      console.error("[IPC] youtube:search error:", err.message);
      return { songs: [], albums: [], playlists: [], artists: [] };
    }
  });

  ipcMain.handle("youtube:searchSongs", async (_event, query: string) => {
    try {
      return await YouTube.searchSongs(query);
    } catch (err: any) {
      console.error("[IPC] youtube:searchSongs error:", err.message);
      return [];
    }
  });

  ipcMain.handle("youtube:getStream", async (_event, rawVideoId: any, quality?: string) => {
    try {
      let videoId = "";
      if (typeof rawVideoId === "string") {
        videoId = rawVideoId.trim();
      } else if (rawVideoId && typeof rawVideoId === "object") {
        videoId = (rawVideoId.videoId || rawVideoId.id || "").trim();
      }

      if (!videoId || videoId === "undefined" || videoId.length !== 11) {
        console.error("[IPC] youtube:getStream rejected invalid 11-char videoId:", rawVideoId);
        throw new Error(`Invalid 11-character videoId: "${rawVideoId}"`);
      }

      let q = AudioQuality.HIGH;
      if (quality === "MEDIUM") q = AudioQuality.MEDIUM;
      if (quality === "LOW") q = AudioQuality.LOW;

      const playback = await YouTube.getStream(videoId, { audioQuality: q });

      // Transform URL to route through our Chunked Local HTTP Stream Proxy
      // Passing clen and mime allows the proxy to respond instantly with 206 Partial Content
      const proxiedUrl = streamProxy.getProxyUrl(
        playback.streamUrl,
        playback.streamClient,
        playback.format.contentLength,
        playback.format.mimeType
      );

      return {
        ...playback,
        streamUrl: proxiedUrl,
        originalStreamUrl: playback.streamUrl,
      };
    } catch (err: any) {
      console.error("[IPC] youtube:getStream error:", err.message);
      throw err;
    }
  });

  ipcMain.handle(
    "youtube:getLyrics",
    async (_event, title: string, artist?: string, duration?: number, videoId?: string) => {
      try {
        return await YouTube.getLyrics(title, artist || "", duration, videoId);
      } catch (err: any) {
        console.error("[IPC] youtube:getLyrics error:", err.message);
        return null;
      }
    }
  );

  ipcMain.handle("youtube:getPlaylist", async (_event, playlistId: string) => {
    try {
      return await YouTube.getPlaylist(playlistId);
    } catch (err: any) {
      console.error("[IPC] youtube:getPlaylist error:", err.message);
      return null;
    }
  });

  ipcMain.handle("youtube:getTrackCandidates", async (_event, query: { title: string; artist: string; duration?: number }) => {
    try {
      const matcher = new TrackMatcher();
      return await matcher.getCandidates({
        title: query.title,
        artist: query.artist,
        durationMs: query.duration ? query.duration * 1000 : null,
      });
    } catch (err: any) {
      console.error("[IPC] youtube:getTrackCandidates error:", err.message);
      return [];
    }
  });

  // Database API - Song & Liked
  ipcMain.handle("db:upsertSong", (_event, song: any) => {
    db.upsertSong(song);
    return true;
  });

  ipcMain.handle("db:getSong", (_event, id: string) => {
    return db.getSong(id);
  });

  ipcMain.handle("db:isLiked", (_event, songId: string) => {
    return db.isLiked(songId);
  });

  ipcMain.handle("db:setLiked", (_event, songId: string, liked: boolean, metadata?: any) => {
    db.setLiked(songId, liked, metadata);
    return liked;
  });

  ipcMain.handle("db:toggleLike", (_event, songId: string, metadata?: any) => {
    return db.toggleLike(songId, metadata);
  });

  ipcMain.handle("db:getLikedSongs", () => {
    return db.getLikedSongs();
  });

  // Database API - History
  ipcMain.handle("db:addHistory", (_event, songId: string, playTimeSec?: number, metadata?: any) => {
    db.addHistory(songId, playTimeSec || 0, metadata);
    return true;
  });

  ipcMain.handle("db:getHistory", (_event, limit?: number, offset?: number) => {
    return db.getHistory(limit ?? 50, offset ?? 0);
  });

  ipcMain.handle("db:clearHistory", () => {
    db.clearHistory();
    return true;
  });

  // Database API - Playlists
  ipcMain.handle(
    "db:createPlaylist",
    (_event, name: string, description?: string, thumbnailUrl?: string) => {
      return db.createPlaylist(name, description || null, thumbnailUrl || null);
    }
  );

  ipcMain.handle("db:getPlaylists", () => {
    return db.getPlaylists();
  });

  ipcMain.handle("db:getPlaylist", (_event, id: string) => {
    return db.getPlaylist(id);
  });

  ipcMain.handle("db:deletePlaylist", (_event, id: string) => {
    return db.deletePlaylist(id);
  });

  ipcMain.handle("db:addSongToPlaylist", (_event, playlistId: string, songId: string, metadata?: any) => {
    return db.addSongToPlaylist(playlistId, songId, metadata);
  });

  ipcMain.handle("db:removeSongFromPlaylist", (_event, playlistId: string, songId: string) => {
    return db.removeSongFromPlaylist(playlistId, songId);
  });

  ipcMain.handle("db:getPlaylistSongs", (_event, playlistId: string) => {
    return db.getPlaylistSongs(playlistId);
  });

  ipcMain.handle("db:replacePlaylistSong", (_event, playlistId: string, oldSongId: string, newSong: any) => {
    return db.replaceSongInPlaylist(playlistId, oldSongId, newSong);
  });

  // Database API - Lyrics Cache
  ipcMain.handle("db:getCachedLyrics", (_event, songId: string) => {
    return db.getCachedLyrics(songId);
  });

  ipcMain.handle("db:cacheLyrics", (_event, songId: string, lyrics: string, provider: string) => {
    db.cacheLyrics(songId, lyrics, provider);
    return true;
  });

  // Spotify Importer & Auto-Sync
  ipcMain.handle("spotify:openLogin", async () => {
    return new Promise((resolve) => {
      let isDone = false;
      const authWin = new BrowserWindow({
        width: 480,
        height: 700,
        title: "Đăng nhập tài khoản Spotify",
        parent: mainWindow || undefined,
        modal: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: "persist:spotify",
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWin.loadURL("https://accounts.spotify.com/en/login?continue=https%3A%2F%2Fopen.spotify.com%2F");

      const checkAuthSuccess = async (url: string) => {
        if (isDone) return;
        if (url.includes("open.spotify.com") && !url.includes("accounts.spotify.com")) {
          isDone = true;
          // Wait briefly for cookies to set
          await new Promise((r) => setTimeout(r, 800));

          try {
            const spotifySession = session.fromPartition("persist:spotify");
            const spDcCookies = await spotifySession.cookies.get({ name: "sp_dc" });
            const spDc = spDcCookies?.[0]?.value;

            const tokenResult: any = await authWin.webContents.executeJavaScript(`
              (async () => {
                try {
                  const res = await fetch("https://open.spotify.com/get_access_token?reason=transport&productType=web_player");
                  return await res.json();
                } catch (e) {
                  return null;
                }
              })()
            `);

            if (tokenResult && tokenResult.accessToken) {
              const profile = await SpotifyClient.getMe(tokenResult.accessToken);
              const accountInfo = {
                ...profile,
                spDc,
                accessToken: tokenResult.accessToken,
                expiresAt: tokenResult.accessTokenExpirationTimestampMs,
              };
              db.setSetting("spotify_account_info", JSON.stringify(accountInfo));
              console.log("[Spotify] Successfully logged in as:", profile.displayName);
              authWin.close();
              resolve(accountInfo);
              return;
            }
          } catch (err: any) {
            console.error("[Spotify] Error completing login:", err.message);
          }

          authWin.close();
          resolve(null);
        }
      };

      authWin.webContents.on("did-navigate", (_e, url) => checkAuthSuccess(url));
      authWin.webContents.on("did-navigate-in-page", (_e, url) => checkAuthSuccess(url));

      authWin.on("closed", () => {
        if (!isDone) {
          isDone = true;
          resolve(null);
        }
      });
    });
  });

  ipcMain.handle("spotify:getAccount", async () => {
    const raw = db.getSetting("spotify_account_info");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle("spotify:logout", async () => {
    try {
      await session.fromPartition("persist:spotify").clearStorageData();
      db.deleteSetting("spotify_account_info");
      db.deleteSetting("spotify_auto_sync");
      db.deleteSetting("spotify_sync_playlists");
      return true;
    } catch (err: any) {
      console.error("[Spotify] Logout error:", err.message);
      return false;
    }
  });

  ipcMain.handle("spotify:parseLink", async (_event, url: string) => {
    try {
      const token = await getValidSpotifyToken();
      return await SpotifyClient.parsePublicLink(
        url,
        token || undefined,
        async (playlistId) => await scrapeFullPublicPlaylist(playlistId)
      );
    } catch (err: any) {
      console.error("[Spotify] parseLink error:", err.message);
      throw err;
    }
  });

  ipcMain.handle("spotify:getUserPlaylists", async () => {
    const token = await getValidSpotifyToken();
    if (!token) throw new Error("Chưa đăng nhập Spotify hoặc phiên đăng nhập đã hết hạn.");
    return await SpotifyClient.getUserPlaylists(token);
  });

  ipcMain.handle("spotify:importParsed", async (_event, parsed: any) => {
    const service = MusicImportService.getInstance(db);
    return await service.importFromParsed(parsed, (progress) => {
      mainWindow?.webContents.send("spotify:importProgress", progress);
    });
  });

  ipcMain.handle("spotify:importRemote", async (_event, remote: any) => {
    const token = await getValidSpotifyToken();
    if (!token) throw new Error("Chưa đăng nhập Spotify hoặc phiên đăng nhập đã hết hạn.");
    const service = MusicImportService.getInstance(db);
    return await service.importFromSpotifyRemote(token, remote, (progress) => {
      mainWindow?.webContents.send("spotify:importProgress", progress);
    });
  });

  ipcMain.handle("spotify:cancelImport", () => {
    MusicImportService.getInstance(db).cancel();
    return true;
  });

  ipcMain.handle("spotify:getAutoSync", () => {
    const enabled = db.getSetting("spotify_auto_sync") === "true";
    let playlistIds: string[] = [];
    try {
      playlistIds = JSON.parse(db.getSetting("spotify_sync_playlists") || "[]");
    } catch {
      playlistIds = [];
    }
    return { enabled, playlistIds };
  });

  ipcMain.handle("spotify:setAutoSync", (_event, enabled: boolean, playlistIds?: string[]) => {
    db.setSetting("spotify_auto_sync", enabled ? "true" : "false");
    if (playlistIds) {
      db.setSetting("spotify_sync_playlists", JSON.stringify(playlistIds));
    }
    return true;
  });
}

async function scrapeFullPublicPlaylist(playlistId: string): Promise<any[]> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: "persist:spotify_scrape",
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await win.loadURL(`https://open.spotify.com/playlist/${playlistId}`);
    await new Promise((r) => setTimeout(r, 5000));

    win.webContents.debugger.attach("1.3");

    const collected = new Map<string, any>();

    for (let step = 0; step < 16; step++) {
      const pageBatch: any[] = await win.webContents.executeJavaScript(`
        (() => {
          const links = document.querySelectorAll('a[href*="/track/"]');
          const res = [];
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/\\/track\\/([A-Za-z0-9]+)/);
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
                if (/^\\d+:\\d{2}$/.test(t)) {
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
          return res;
        })()
      `);

      for (const t of pageBatch) {
        if (!collected.has(t.sourceId)) {
          collected.set(t.sourceId, t);
        }
      }

      await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: 700,
        y: 500,
        deltaX: 0,
        deltaY: 6000,
      });

      await new Promise((r) => setTimeout(r, 500));
    }

    return Array.from(collected.values());
  } catch (err: any) {
    console.warn("[Scraper] Scrape error:", err.message);
    return [];
  } finally {
    try {
      win.webContents.debugger.detach();
    } catch {}
    win.destroy();
  }
}

async function getValidSpotifyToken(): Promise<string | null> {
  const accountJson = db.getSetting("spotify_account_info");
  if (!accountJson) return null;

  try {
    const account = JSON.parse(accountJson);
    const now = Date.now();
    // If token exists and is valid for at least 2 more minutes
    if (account.accessToken && account.expiresAt && account.expiresAt > now + 120_000) {
      return account.accessToken;
    }

    console.log("[Spotify] Access token expired or expiring soon, refreshing via partition session...");
    const spotifySession = session.fromPartition("persist:spotify");
    const cookies = await spotifySession.cookies.get({ name: "sp_dc" });
    if (!cookies || cookies.length === 0) {
      console.warn("[Spotify] sp_dc cookie not found in session, cannot refresh token");
      return account.accessToken || null;
    }

    const refreshWin = new BrowserWindow({
      show: false,
      width: 400,
      height: 400,
      webPreferences: {
        partition: "persist:spotify",
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      await refreshWin.loadURL("https://open.spotify.com/");
      const tokenResult: any = await refreshWin.webContents.executeJavaScript(`
        (async () => {
          try {
            const res = await fetch("https://open.spotify.com/get_access_token?reason=transport&productType=web_player");
            return await res.json();
          } catch (e) {
            return null;
          }
        })()
      `);

      if (tokenResult && tokenResult.accessToken) {
        account.accessToken = tokenResult.accessToken;
        account.expiresAt = tokenResult.accessTokenExpirationTimestampMs;
        db.setSetting("spotify_account_info", JSON.stringify(account));
        console.log("[Spotify] Access token refreshed successfully");
        return tokenResult.accessToken;
      }
    } finally {
      refreshWin.destroy();
    }
    return account.accessToken || null;
  } catch (err: any) {
    console.error("[Spotify] Error refreshing token:", err.message);
  }

  return null;
}

async function runAutoSyncIfEnabled(): Promise<void> {
  try {
    const autoSyncEnabled = db.getSetting("spotify_auto_sync") === "true";
    if (!autoSyncEnabled) return;

    const rawPlaylists = db.getSetting("spotify_sync_playlists");
    let playlistIds: string[] = [];
    try {
      playlistIds = JSON.parse(rawPlaylists || "[]");
    } catch {
      playlistIds = [];
    }

    if (playlistIds.length === 0) return;

    const token = await getValidSpotifyToken();
    if (!token) {
      console.log("[Spotify Auto-Sync] Skipped: No valid token available");
      return;
    }

    console.log(`[Spotify Auto-Sync] Starting background auto-sync for ${playlistIds.length} playlist(s)...`);
    const service = MusicImportService.getInstance(db);
    const allRemotes = await SpotifyClient.getUserPlaylists(token);
    const targetRemotes = allRemotes.filter((r) => playlistIds.includes(r.id));

    for (const remote of targetRemotes) {
      console.log(`[Spotify Auto-Sync] Syncing "${remote.name}"...`);
      await service.importFromSpotifyRemote(token, remote, (p) => {
        mainWindow?.webContents.send("spotify:importProgress", p);
      });
    }
    console.log("[Spotify Auto-Sync] Background sync completed successfully!");
  } catch (err: any) {
    console.error("[Spotify Auto-Sync] Background sync encountered an error:", err.message);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0b0c10",
    title: "Tày Music",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      autoplayPolicy: "no-user-gesture-required",
      webSecurity: false,
    },
  });

  mainWindow.webContents.setAudioMuted(false);

  // Open links in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  initDatabase();
  await streamProxy.start();
  setupNetworkHeaderInterception();
  registerIpcHandlers();
  createWindow();

  // Run background auto-sync if user previously enabled it
  setTimeout(() => {
    runAutoSyncIfEnabled();
  }, 2500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    streamProxy.stop();
    if (db) db.close();
    app.quit();
  }
});
