// src/core/lyrics/providers/KuGouProvider.ts

import type { LyricsProvider } from "./LyricsProvider.ts";
import type { LyricsSearchQuery } from "../types.ts";
import { LyricsUtils } from "../LyricsUtils.ts";

export class KuGouProvider implements LyricsProvider {
  readonly name = "KuGou";
  private static readonly SEARCH_SONG_URL = "https://mobileservice.kugou.com/api/v3/search/song";
  private static readonly SEARCH_LYRICS_URL = "https://lyrics.kugou.com/search";
  private static readonly DOWNLOAD_LYRICS_URL = "https://lyrics.kugou.com/download";
  private static readonly DURATION_TOLERANCE_SEC = 4;

  async getLyrics(query: LyricsSearchQuery): Promise<string | null> {
    const cleanedTitle = LyricsUtils.cleanTitle(query.title);
    const cleanedArtist = LyricsUtils.cleanArtist(query.artist);
    const targetDuration = query.duration && query.duration > 0 ? query.duration : null;

    try {
      const keyword = `${cleanedTitle} - ${cleanedArtist}`;
      const searchRes = await fetch(
        `${KuGouProvider.SEARCH_SONG_URL}?version=9108&plat=0&pagesize=8&showtype=0&keyword=${encodeURIComponent(keyword)}`
      );

      if (!searchRes.ok) return null;
      const searchData: any = await searchRes.json();
      const songs: any[] = searchData.data?.info || [];

      let candidate: { id: string | number; accesskey: string } | null = null;

      // 1. Try search lyrics by hash
      for (const song of songs) {
        if (targetDuration == null || Math.abs(song.duration - targetDuration) <= KuGouProvider.DURATION_TOLERANCE_SEC) {
          const lrcSearchRes = await fetch(
            `${KuGouProvider.SEARCH_LYRICS_URL}?ver=1&man=yes&client=pc&hash=${song.hash}`
          );
          if (lrcSearchRes.ok) {
            const lrcSearchData: any = await lrcSearchRes.json();
            if (lrcSearchData.candidates && lrcSearchData.candidates.length > 0) {
              candidate = lrcSearchData.candidates[0];
              break;
            }
          }
        }
      }

      // 2. Try search lyrics by keyword if hash lookup found nothing
      if (!candidate) {
        const durationParam = targetDuration != null ? `&duration=${targetDuration * 1000}` : "";
        const lrcSearchRes = await fetch(
          `${KuGouProvider.SEARCH_LYRICS_URL}?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(keyword)}${durationParam}`
        );
        if (lrcSearchRes.ok) {
          const lrcSearchData: any = await lrcSearchRes.json();
          if (lrcSearchData.candidates && lrcSearchData.candidates.length > 0) {
            candidate = lrcSearchData.candidates[0];
          }
        }
      }

      if (!candidate) return null;

      // Download and decode Base64 LRC
      const dlRes = await fetch(
        `${KuGouProvider.DOWNLOAD_LYRICS_URL}?fmt=lrc&charset=utf8&client=pc&ver=1&id=${candidate.id}&accesskey=${candidate.accesskey}`
      );

      if (!dlRes.ok) return null;
      const dlData: any = await dlRes.json();
      if (!dlData.content) return null;

      return Buffer.from(dlData.content, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
}
