// src/core/index.ts

// InnerTube API & YouTube Client
export { YouTube } from "./innertube/YouTube.ts";
export { InnerTube } from "./innertube/InnerTube.ts";
export { YouTubeClient } from "./innertube/YouTubeClient.ts";
export * from "./innertube/constants.ts";
export * from "./innertube/types.ts";

// Audio Stream Player
export { YTPlayerUtils } from "./player/YTPlayerUtils.ts";
export { LocalStreamProxy } from "./player/LocalStreamProxy.ts";
export { AudioQuality, type PlaybackData } from "./player/types.ts";

// Cipher & N-transform Deobfuscator
export { CipherDeobfuscator } from "./cipher/CipherDeobfuscator.ts";
export { PlayerJsFetcher } from "./cipher/PlayerJsFetcher.ts";
export { FunctionNameExtractor } from "./cipher/FunctionNameExtractor.ts";
export { SolverEngine } from "./cipher/SolverEngine.ts";

// Proof of Origin (PoToken)
export { PoTokenGenerator } from "./potoken/PoTokenGenerator.ts";
export type { PoTokenResult } from "./potoken/PoTokenResult.ts";

// Lyrics System
export { LyricsHelper } from "./lyrics/LyricsHelper.ts";
export { LyricsUtils } from "./lyrics/LyricsUtils.ts";
export { LrcLibProvider } from "./lyrics/providers/LrcLibProvider.ts";
export { NetEaseProvider } from "./lyrics/providers/NetEaseProvider.ts";
export { KuGouProvider } from "./lyrics/providers/KuGouProvider.ts";
export type { LyricsProvider } from "./lyrics/providers/LyricsProvider.ts";
export type {
  LyricsEntry,
  WordTimestamp,
  ParsedLyrics,
  LyricsSearchQuery,
  LyricsResult,
  ActiveLyricsLine,
} from "./lyrics/types.ts";

// Local SQLite Database
export { MochyDatabase } from "./db/MochyDatabase.ts";
export { SCHEMA_SQL } from "./db/schema.ts";
export type {
  DbSong,
  DbPlaylist,
  DbHistoryEvent,
  DbLyricsCache,
} from "./db/types.ts";

// Spotify Importer & Auto-Sync
export * from "./importer/index.ts";

