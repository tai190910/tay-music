// src/core/lyrics/providers/NetEaseProvider.ts

import type { LyricsProvider } from "./LyricsProvider.ts";
import type { LyricsSearchQuery } from "../types.ts";
import { LyricsUtils } from "../LyricsUtils.ts";

export class NetEaseProvider implements LyricsProvider {
  readonly name = "NetEase";
  private static readonly SEARCH_URL = "https://music.163.com/api/search/get";
  private static readonly LYRIC_URL = "https://music.163.com/api/song/lyric";
  private static readonly DURATION_TOLERANCE_SEC = 4;

  async getLyrics(query: LyricsSearchQuery): Promise<string | null> {
    const cleanedTitle = LyricsUtils.cleanTitle(query.title);
    const cleanedArtist = LyricsUtils.cleanArtist(query.artist);
    const targetDuration = query.duration && query.duration > 0 ? query.duration : null;

    try {
      const searchRes = await fetch(
        `${NetEaseProvider.SEARCH_URL}?s=${encodeURIComponent(`${cleanedTitle} ${cleanedArtist}`)}&type=1&limit=10`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://music.163.com/",
          },
        }
      );

      if (!searchRes.ok) return null;
      const searchData: any = await searchRes.json();
      const songs: any[] = searchData.result?.songs || [];
      if (songs.length === 0) return null;

      // Pick best matching song
      let bestSong = songs[0];
      if (targetDuration != null) {
        const matchingDuration = songs.find(
          (s) => Math.abs(Math.round(s.duration / 1000) - targetDuration) <= NetEaseProvider.DURATION_TOLERANCE_SEC
        );
        if (matchingDuration) {
          bestSong = matchingDuration;
        }
      }

      // Fetch lyrics
      const lyricRes = await fetch(
        `${NetEaseProvider.LYRIC_URL}?id=${bestSong.id}&lv=1&yv=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://music.163.com/",
          },
        }
      );

      if (!lyricRes.ok) return null;
      const lyricData: any = await lyricRes.json();

      // Return yrc (word-by-word) or lrc (line-by-line)
      return lyricData.yrc?.lyric || lyricData.lrc?.lyric || null;
    } catch {
      return null;
    }
  }
}
