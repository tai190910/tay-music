// src/core/lyrics/types.ts

export interface WordTimestamp {
  text: string;
  startTime: number; // in milliseconds
  endTime: number;   // in milliseconds
}

export interface LyricsEntry {
  time: number; // in milliseconds
  text: string;
  words?: WordTimestamp[] | null;
  agent?: string | null;
  isBackground?: boolean;
}

export interface ParsedLyrics {
  lines: LyricsEntry[];
  isSynced: boolean;
  raw: string;
}

export interface LyricsSearchQuery {
  title: string;
  artist: string;
  duration?: number | null; // in seconds
  album?: string | null;
  id?: string | null;
}

export interface LyricsResult {
  provider: string;
  lyrics: string;
  parsed: ParsedLyrics;
}

export interface ActiveLyricsLine {
  activeIndex: number;
  activeLine: LyricsEntry | null;
  nextLine: LyricsEntry | null;
  progress: number; // 0.0 - 1.0 progress through current line
}
