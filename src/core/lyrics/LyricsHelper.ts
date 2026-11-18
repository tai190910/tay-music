// src/core/lyrics/LyricsHelper.ts

import type { LyricsProvider } from "./providers/LyricsProvider.ts";
import { LrcLibProvider } from "./providers/LrcLibProvider.ts";
import { NetEaseProvider } from "./providers/NetEaseProvider.ts";
import { KuGouProvider } from "./providers/KuGouProvider.ts";
import { LyricsUtils } from "./LyricsUtils.ts";
import type { LyricsSearchQuery, LyricsResult, ParsedLyrics, ActiveLyricsLine, LyricsEntry } from "./types.ts";

export class LyricsHelper {
  private static providers: LyricsProvider[] = [
    new LrcLibProvider(),
    new NetEaseProvider(),
    new KuGouProvider(),
  ];

  private static cache = new Map<string, LyricsResult>();

  private static getCacheKey(query: LyricsSearchQuery): string {
    if (query.id) return query.id;
    return `${query.artist.toLowerCase()}:::${query.title.toLowerCase()}`;
  }

  /**
   * Fetches synchronized LRC lyrics for a track, trying providers in order.
   */
  static async getLyrics(query: LyricsSearchQuery, forceRefresh: boolean = false): Promise<LyricsResult | null> {
    const cacheKey = this.getCacheKey(query);
    if (!forceRefresh && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    for (const provider of this.providers) {
      try {
        const raw = await provider.getLyrics(query);
        if (raw && raw.trim().length > 0) {
          const parsed = LyricsUtils.parseLyrics(raw);
          if (parsed.lines.length > 0) {
            const result: LyricsResult = {
              provider: provider.name,
              lyrics: raw,
              parsed,
            };
            this.cache.set(cacheKey, result);
            return result;
          }
        }
      } catch (err: any) {
        console.warn(`[LyricsHelper] Provider ${provider.name} failed:`, err.message);
      }
    }

    return null;
  }

  /**
   * Fetches lyrics from all providers simultaneously.
   */
  static async getAllLyrics(query: LyricsSearchQuery): Promise<LyricsResult[]> {
    const results: LyricsResult[] = [];
    const promises = this.providers.map(async (provider) => {
      try {
        const raw = await provider.getLyrics(query);
        if (raw && raw.trim().length > 0) {
          const parsed = LyricsUtils.parseLyrics(raw);
          if (parsed.lines.length > 0) {
            return {
              provider: provider.name,
              lyrics: raw,
              parsed,
            };
          }
        }
      } catch {}
      return null;
    });

    const settled = await Promise.all(promises);
    for (const r of settled) {
      if (r) results.push(r);
    }
    return results;
  }

  static parse(lrcString: string): ParsedLyrics {
    return LyricsUtils.parseLyrics(lrcString);
  }

  static findActiveLine(lines: LyricsEntry[], currentTimeMs: number): ActiveLyricsLine {
    return LyricsUtils.findActiveLine(lines, currentTimeMs);
  }
}
