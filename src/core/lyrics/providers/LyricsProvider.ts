// src/core/lyrics/providers/LyricsProvider.ts

import type { LyricsSearchQuery } from "../types.ts";

export interface LyricsProvider {
  readonly name: string;

  /**
   * Search and fetch synchronized LRC lyrics for a track.
   * Returns raw LRC string, or null if not found.
   */
  getLyrics(query: LyricsSearchQuery): Promise<string | null>;
}
