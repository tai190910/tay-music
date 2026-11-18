// src/core/importer/TrackMatcher.ts

import { YouTube } from "../innertube/YouTube.ts";
import type { SongItem } from "../innertube/types.ts";
import type { ImportedTrack } from "./types.ts";

export interface CandidateResult {
  song: SongItem;
  score: number;
}

export class TrackMatcher {
  private static readonly SONG_ACCEPT = 0.60;
  private static readonly VIDEO_ACCEPT = 0.70;
  private static readonly SONG_FALLBACK_ACCEPT = 0.50;
  private static readonly MIN_TITLE = 0.40;
  private static readonly CLOSE_SECONDS = 4.0;
  private static readonly MAX_DURATION_DIFF = 15.0;

  // Words that indicate special versions
  private static readonly VERSION_WORDS = [
    "remix", "cover", "live", "instrumental", "inst", "karaoke", "sped up", "slowed",
    "nightcore", "acoustic", "reverb", "8d", "dance practice", "practice", "performance",
    "fancam", "concert", "rehearsal", "reaction", "1 hour", "hour", "loop", "extended"
  ];

  private static readonly LIVE_ALBUM_WORDS = [
    "live", "tour", "concert", "unplugged", "session", "sessions",
  ];

  private static readonly NOISE_IN_BRACKETS =
    /[([][^)\]]*\b(feat|ft|with|remaster|remastered|version|edit|mono|stereo|deluxe|explicit|clean|bonus|from|official|audio|video|lyrics?|visuali[sz]er|hd|hq|4k)\b[^)\]]*[)\]]/gi;

  private static readonly DASH_SUFFIX =
    /\s[-–—]\s.*(remaster|version|edit|mono|stereo|mix\b|from |live at|bonus).*$/gi;

  private static readonly FEAT_TAIL = /\s(feat\.?|ft\.?|featuring)\s.*$/gi;

  private static readonly ARTIST_SPLIT =
    /\s*(?:,|&|;|\/|\sx\s|\sand\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\swith\s)\s*/gi;

  private readonly cache = new Map<string, SongItem | null>();

  /**
   * Split artist string into individual artists
   */
  static splitArtists(artist: string): string[] {
    return artist
      .replace(/\u00A0/g, " ")
      .split(this.ARTIST_SPLIT)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }

  /**
   * Strip bracketed noise, feat, and dash suffixes for cleaner search queries
   */
  static cleanTitleForSearch(title: string): string {
    const cleaned = title
      .replace(this.NOISE_IN_BRACKETS, " ")
      .replace(this.DASH_SUFFIX, "")
      .replace(this.FEAT_TAIL, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length > 0 ? cleaned : title;
  }

  /**
   * Normalize text by removing diacritics and non-alphanumeric characters
   */
  static normalizeText(text: string): string {
    const folded = text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
    return folded.replace(/[^a-z0-9]+/g, " ").trim();
  }

  static normalizeTitle(title: string): string {
    return this.normalizeText(this.cleanTitleForSearch(title));
  }

  /**
   * Compute similarity score between two strings using Jaccard token overlap,
   * Levenshtein distance, and substring containment.
   */
  static similarity(a: string, b: string): number {
    if (!a || !b) return 0.0;
    if (a === b) return 1.0;

    const tokensA = new Set(a.split(" ").filter(Boolean));
    const tokensB = new Set(b.split(" ").filter(Boolean));

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }

    const union = tokensA.size + tokensB.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0.0;

    const compactA = a.replace(/\s+/g, "");
    const compactB = b.replace(/\s+/g, "");
    const maxLen = Math.max(compactA.length, compactB.length);
    const edit = maxLen > 0 ? 1.0 - this.levenshtein(compactA, compactB) / maxLen : 0.0;

    let containment = 0.0;
    if (
      compactA.length >= 3 &&
      compactB.length >= 3 &&
      (compactA.includes(compactB) || compactB.includes(compactA))
    ) {
      containment = 0.8;
    }

    return Math.max(jaccard, edit, containment);
  }

  private static levenshtein(a: string, b: string): number {
    if (a.length > 200 || b.length > 200) {
      return Math.max(a.length, b.length) - Math.min(a.length, b.length);
    }

    let prev = new Int32Array(b.length + 1);
    let curr = new Int32Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) {
      prev[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }

    return prev[b.length];
  }

  /**
   * Duration score:
   * <= 4.0s: max score (+1.0)
   * <= 10.0s: reduced confidence (+0.3)
   * <= 15.0s: heavy penalty (-0.5)
   * > 15.0s: disqualify (-999.0)
   */
  private durationScore(sourceMs?: number | null, candidateSeconds?: number | null): number {
    if (!sourceMs || sourceMs <= 0 || !candidateSeconds || candidateSeconds <= 0) {
      return 0.5; // neutral if unknown
    }
    const diff = Math.abs(sourceMs / 1000.0 - candidateSeconds);
    if (diff <= TrackMatcher.CLOSE_SECONDS) return 1.0;
    if (diff <= 10.0) return 0.3;
    if (diff <= TrackMatcher.MAX_DURATION_DIFF) return -0.5;
    return -999.0; // Over 15s difference -> rejected!
  }

  private albumScore(sourceAlbum?: string | null, candidateAlbum?: string | null): number {
    if (!candidateAlbum || !candidateAlbum.trim()) return 0.0;
    const candidate = ` ${TrackMatcher.normalizeText(candidateAlbum)} `;
    const source = ` ${TrackMatcher.normalizeText(sourceAlbum || "")} `;

    const isLiveAlbum = TrackMatcher.LIVE_ALBUM_WORDS.some(
      (w) => candidate.includes(` ${w} `) && !source.includes(` ${w} `)
    );
    if (isLiveAlbum) return -0.3;

    if (!sourceAlbum || !sourceAlbum.trim()) return 0.0;
    return TrackMatcher.similarity(source.trim(), candidate.trim()) >= 0.8 ? 0.05 : 0.0;
  }

  private uploadScore(candidate: SongItem): number {
    let bonus = 0.0;
    // ATV: Official Audio released by record label (- Topic)
    if (candidate.musicVideoType === "MUSIC_VIDEO_TYPE_ATV") bonus += 0.15;
    if (candidate.musicVideoType === "MUSIC_VIDEO_TYPE_UGC") bonus -= 0.10;

    // Bonus for "- Topic" in artists or author
    const isTopic =
      candidate.artists.some((a) => a.name.toLowerCase().includes("- topic")) ||
      (candidate.author && candidate.author.toLowerCase().includes("- topic"));
    if (isTopic) bonus += 0.15;

    if (candidate.album) bonus += 0.05;
    return bonus;
  }

  /**
   * Score a YouTube candidate against the target imported track
   */
  score(track: ImportedTrack, candidate: SongItem): number {
    // 1. Duration check
    const dScore = this.durationScore(track.durationMs, candidate.duration);
    if (dScore === -999.0) {
      // Disqualified due to >15s duration difference
      return 0.0;
    }

    const targetTitle = TrackMatcher.normalizeTitle(track.title);
    const candidateTitle = TrackMatcher.normalizeTitle(candidate.title);
    let titleScore = TrackMatcher.similarity(targetTitle, candidateTitle);

    // 2. Primary Artist check
    const targetArtists = TrackMatcher.splitArtists(track.artist)
      .map(TrackMatcher.normalizeText)
      .filter((a) => a.length > 0);
    const primaryArtist = targetArtists[0] || "";

    const candidateArtists = candidate.artists
      .map((a) => TrackMatcher.normalizeText(a.name))
      .filter((a) => a.length > 0);
    const candidateAuthor = candidate.author ? TrackMatcher.normalizeText(candidate.author) : "";

    let artistScore = 0.0;
    if (targetArtists.length === 0) {
      artistScore = 0.5;
    } else {
      artistScore = Math.max(
        ...targetArtists.map((target) =>
          candidateArtists.length > 0
            ? Math.max(...candidateArtists.map((c) => TrackMatcher.similarity(target, c)))
            : 0.0
        )
      );
    }

    // Check if primary artist is matched
    const primaryInArtists = candidateArtists.some(
      (c) => TrackMatcher.similarity(primaryArtist, c) >= 0.65 || c.includes(primaryArtist) || primaryArtist.includes(c)
    );
    const primaryInTitle = candidateTitle.includes(primaryArtist);
    const primaryInAuthor = candidateAuthor.includes(primaryArtist);

    if (primaryArtist.length >= 2 && !primaryInArtists && !primaryInTitle && !primaryInAuthor) {
      // Strict rule: Spotify primary artist MUST be in artist, title, or channel
      return 0.0;
    }

    // Videos titled "Artist - Title (Official Video)"
    if (
      artistScore < 0.6 &&
      targetArtists.some((a) => a.length > 0 && candidateTitle.includes(a))
    ) {
      artistScore = 0.8;
      const stripped = targetArtists.reduce((acc, a) => acc.replace(a, " "), candidateTitle).trim();
      titleScore = Math.max(titleScore, TrackMatcher.similarity(targetTitle, stripped));
    }

    if (titleScore < TrackMatcher.MIN_TITLE) return 0.0;

    // 3. Negative Version Penalty
    // If Spotify title lacks "remix", "cover", "live", "instrumental", etc. but YouTube has it:
    const rawTarget = ` ${TrackMatcher.normalizeText(track.title)} `;
    const rawCandidate = ` ${TrackMatcher.normalizeText(candidate.title)} `;

    let hasForbiddenVersion = false;
    for (const word of TrackMatcher.VERSION_WORDS) {
      const inCandidate = rawCandidate.includes(` ${word} `);
      const inTarget = rawTarget.includes(` ${word} `);
      if (inCandidate && !inTarget) {
        hasForbiddenVersion = true;
        break;
      }
    }

    let totalScore =
      titleScore * 0.50 +
      artistScore * 0.25 +
      dScore * 0.25 +
      this.albumScore(track.album, candidate.album?.name) +
      this.uploadScore(candidate);

    if (hasForbiddenVersion) {
      // Reduce 60% of total score
      totalScore *= 0.40;
    }

    return Math.max(0.0, Math.min(1.0, totalScore));
  }

  private searchQuery(track: ImportedTrack): string {
    const firstArtist = TrackMatcher.splitArtists(track.artist)[0] || "";
    return `${TrackMatcher.cleanTitleForSearch(track.title)} ${firstArtist}`.trim();
  }

  private async searchSongsWithRetry(query: string): Promise<SongItem[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const results = await YouTube.searchSongs(query);
        return results.slice(0, 10);
      } catch {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }
    return [];
  }

  private async searchGeneralWithRetry(query: string): Promise<SongItem[]> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await YouTube.search(query);
        return res.items
          .filter((it): it is SongItem => "duration" in it || (it as any).videoId != null)
          .slice(0, 10);
      } catch {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }
    return [];
  }

  private pick(
    track: ImportedTrack,
    scored: Array<{ song: SongItem; score: number }>,
    accept: number
  ): SongItem | null {
    const sourceSeconds = track.durationMs ? track.durationMs / 1000.0 : null;

    // Prioritize candidates within CLOSE_SECONDS (4.0s)
    if (sourceSeconds && sourceSeconds > 0) {
      const closeMatches = scored.filter(
        ({ song, score }) =>
          score >= accept &&
          song.duration != null &&
          Math.abs(song.duration - sourceSeconds) <= TrackMatcher.CLOSE_SECONDS
      );
      if (closeMatches.length > 0) {
        return closeMatches.sort((a, b) => b.score - a.score)[0].song;
      }
    }

    const valid = scored.filter((s) => s.score >= accept);
    if (valid.length === 0) return null;
    return valid.sort((a, b) => b.score - a.score)[0].song;
  }

  /**
   * Match an imported track to a YouTube Music SongItem
   */
  async match(track: ImportedTrack): Promise<SongItem | null> {
    const cacheKey = `${TrackMatcher.normalizeTitle(track.title)}|${TrackMatcher.normalizeText(
      track.artist
    )}|${Math.round((track.durationMs || 0) / 5000)}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    const query = this.searchQuery(track);

    // 1. Search Songs (prefer Songs first)
    const songs = await this.searchSongsWithRetry(query);
    const scoredSongs = songs.map((s) => ({ song: s, score: this.score(track, s) }));
    const bestSong = this.pick(track, scoredSongs, TrackMatcher.SONG_ACCEPT);
    if (bestSong) {
      this.cache.set(cacheKey, bestSong);
      return bestSong;
    }

    // 2. Search Videos / General if best song score is low
    const videos = await this.searchGeneralWithRetry(query);
    const scoredVideos = videos.map((v) => ({ song: v, score: this.score(track, v) }));
    const bestVideo = this.pick(track, scoredVideos, TrackMatcher.VIDEO_ACCEPT);
    if (bestVideo) {
      this.cache.set(cacheKey, bestVideo);
      return bestVideo;
    }

    // 3. Fallback to best song at lower threshold
    const fallbackSong = this.pick(track, scoredSongs, TrackMatcher.SONG_FALLBACK_ACCEPT);
    this.cache.set(cacheKey, fallbackSong);
    return fallbackSong;
  }

  /**
   * Get top candidate matches for a song (used for manual Fix Match popup)
   */
  async getCandidates(track: {
    title: string;
    artist: string;
    durationMs?: number | null;
  }): Promise<CandidateResult[]> {
    const dummyTrack: ImportedTrack = {
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs || null,
    };

    const query = this.searchQuery(dummyTrack);
    const [songs, videos] = await Promise.all([
      this.searchSongsWithRetry(query),
      this.searchGeneralWithRetry(query),
    ]);

    const seenIds = new Set<string>();
    const candidates: CandidateResult[] = [];

    // Combine and score
    for (const item of [...songs, ...videos]) {
      if (!item || !item.id || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      const s = this.score(dummyTrack, item);
      candidates.push({ song: item, score: Math.round(s * 100) / 100 });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 8);
  }
}
