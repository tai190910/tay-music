// src/core/cipher/PlayerJsFetcher.ts

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface PlayerJsResult {
  playerJs: string;
  hash: string;
}

export class PlayerJsFetcher {
  private static readonly IFRAME_API_URL = "https://www.youtube.com/iframe_api";
  private static readonly PLAYER_JS_URL_TEMPLATE = "https://www.youtube.com/s/player/%s/player_ias.vflset/en_GB/base.js";
  private static readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  private static memoryCache: { playerJs: string; hash: string; timestamp: number } | null = null;

  private static getCacheDir(): string {
    const dir = path.join(os.tmpdir(), "mochy_pc_cipher_cache");
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }

  private static getCacheFilePath(hash: string): string {
    return path.join(this.getCacheDir(), `player_${hash}.js`);
  }

  private static getMetaFilePath(): string {
    return path.join(this.getCacheDir(), "current_hash.json");
  }

  static async getPlayerJs(forceRefresh: boolean = false): Promise<PlayerJsResult | null> {
    const now = Date.now();

    // 1. Memory Cache
    if (!forceRefresh && this.memoryCache && now - this.memoryCache.timestamp < this.CACHE_TTL_MS) {
      return { playerJs: this.memoryCache.playerJs, hash: this.memoryCache.hash };
    }

    // 2. Disk Cache
    if (!forceRefresh) {
      try {
        const metaFile = this.getMetaFilePath();
        if (fs.existsSync(metaFile)) {
          const meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
          if (meta.hash && meta.timestamp && now - meta.timestamp < this.CACHE_TTL_MS) {
            const cacheFile = this.getCacheFilePath(meta.hash);
            if (fs.existsSync(cacheFile)) {
              const playerJs = fs.readFileSync(cacheFile, "utf-8");
              if (playerJs.length > 1000) {
                this.memoryCache = { playerJs, hash: meta.hash, timestamp: meta.timestamp };
                return { playerJs, hash: meta.hash };
              }
            }
          }
        }
      } catch (err) {
        // Disk cache error, ignore and fetch fresh
      }
    }

    // 3. Network Fetch
    try {
      const hash = await this.fetchPlayerHash();
      if (!hash) {
        console.warn("[PlayerJsFetcher] Failed to extract player hash from iframe_api");
        return null;
      }

      const playerJs = await this.downloadPlayerJs(hash);
      if (!playerJs) {
        console.warn(`[PlayerJsFetcher] Failed to download player JS for hash: ${hash}`);
        return null;
      }

      this.memoryCache = { playerJs, hash, timestamp: now };

      // Write to disk
      try {
        const metaFile = this.getMetaFilePath();
        const cacheFile = this.getCacheFilePath(hash);
        fs.writeFileSync(cacheFile, playerJs, "utf-8");
        fs.writeFileSync(metaFile, JSON.stringify({ hash, timestamp: now }), "utf-8");
      } catch {}

      return { playerJs, hash };
    } catch (err: any) {
      console.error("[PlayerJsFetcher] Error fetching player JS:", err.message);
      return null;
    }
  }

  static invalidateCache(): void {
    this.memoryCache = null;
    try {
      const dir = this.getCacheDir();
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    } catch {}
  }

  private static async fetchPlayerHash(): Promise<string | null> {
    const res = await fetch(this.IFRAME_API_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const body = await res.text();
    const match = body.match(/player[/\\\\]+([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  private static async downloadPlayerJs(hash: string): Promise<string | null> {
    const url = this.PLAYER_JS_URL_TEMPLATE.replace("%s", hash);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    return await res.text();
  }
}
