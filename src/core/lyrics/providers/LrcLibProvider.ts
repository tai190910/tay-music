// src/core/lyrics/providers/LrcLibProvider.ts

import type { LyricsProvider } from "./LyricsProvider.ts";
import type { LyricsSearchQuery } from "../types.ts";
import { LyricsUtils } from "../LyricsUtils.ts";

export class LrcLibProvider implements LyricsProvider {
  readonly name = "LrcLib";
  private static readonly BASE_URL = "https://lrclib.net";
  private static readonly USER_AGENT = "Mochy-PC (+https://github.com/realidkroo/Mochy-Music)";
  private static readonly DURATION_TOLERANCE_SEC = 3;

  async getLyrics(query: LyricsSearchQuery): Promise<string | null> {
    const cleanedTitle = LyricsUtils.cleanTitle(query.title);
    const cleanedArtist = LyricsUtils.cleanArtist(query.artist);
    const targetDuration = query.duration && query.duration > 0 ? query.duration : null;

    // 1. Try track_name and artist_name
    let tracks = await this.search({
      track_name: cleanedTitle,
      artist_name: cleanedArtist,
      album_name: query.album || undefined,
    });

    // 2. Try track_name only
    if (tracks.length === 0) {
      tracks = await this.search({ track_name: cleanedTitle });
    }

    // 3. Try query string: "artist title"
    if (tracks.length === 0) {
      tracks = await this.search({ q: `${cleanedArtist} ${cleanedTitle}` });
    }

    // 4. Try raw title
    if (tracks.length === 0 && cleanedTitle !== query.title) {
      tracks = await this.search({ q: query.title });
    }

    if (tracks.length === 0) {
      return null;
    }

    // Pick best match by duration and syncedLyrics preference
    const matched = this.pickBestTrack(tracks, targetDuration);
    if (!matched) return null;

    return matched.syncedLyrics || matched.plainLyrics || null;
  }

  private pickBestTrack(tracks: any[], targetDuration: number | null): any {
    const candidates = tracks.filter((t) => t.syncedLyrics || t.plainLyrics);
    if (candidates.length === 0) return null;

    if (targetDuration != null) {
      // Find candidate with syncedLyrics within tolerance
      const syncedClose = candidates.find(
        (t) => t.syncedLyrics && Math.abs(t.duration - targetDuration) <= LrcLibProvider.DURATION_TOLERANCE_SEC
      );
      if (syncedClose) return syncedClose;

      // Find candidate within tolerance
      const close = candidates.find(
        (t) => Math.abs(t.duration - targetDuration) <= LrcLibProvider.DURATION_TOLERANCE_SEC
      );
      if (close) return close;

      // Closest by duration
      candidates.sort((a, b) => Math.abs(a.duration - targetDuration) - Math.abs(b.duration - targetDuration));
      return candidates[0];
    }

    // If duration not known, prefer syncedLyrics
    return candidates.find((t) => t.syncedLyrics) || candidates[0];
  }

  private async search(params: Record<string, string | undefined>): Promise<any[]> {
    try {
      const url = new URL(`${LrcLibProvider.BASE_URL}/api/search`);
      for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.append(key, value);
      }

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": LrcLibProvider.USER_AGENT },
      });

      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
}
