// src/renderer/utils/smartAutoplay.ts

import { isValidTrackId, type Song } from "../types.ts";

export type AutoplayVibe = "lofi" | "remix" | "sad" | "vpop";

export interface VibeClassification {
  vibe: AutoplayVibe;
  label: string;
  hasChinese: boolean;
  allowInstrumental: boolean;
  queries: string[];
}

const LOFI_KEYWORDS = [
  "lofi",
  "lo-fi",
  "chill",
  "acoustic",
  "cover",
  "nhẹ nhàng",
  "nhe nhang",
  "mưa",
  "mua",
  "đêm",
  "dem",
];

const REMIX_KEYWORDS = [
  "remix",
  "dj",
  "bass",
  "vinahouse",
  "tăng lực",
  "tang luc",
  "phonk",
  "funk",
];

const SAD_KEYWORDS = [
  "buồn",
  "buon",
  "sầu",
  "sau",
  "tâm trạng",
  "tam trang",
  "ballad",
  "khóc",
  "khoc",
  "đau",
  "dau",
  "cô đơn",
  "co don",
];

const INSTRUMENTAL_BLACKLIST = [
  "beat",
  "instrumental",
  "instrument",
  "karaoke",
  "playback",
  "không lời",
  "khong loi",
  "nhạc nền",
  "nhac nen",
  "off vocal",
  "beat chuẩn",
  "beat lofi",
];

const LONG_MIX_BLACKLIST = [
  "liên khúc",
  "lien khuc",
  "tuyển tập",
  "tuyen tap",
  "1 hour",
  "1 tiếng",
  "1 tieng",
  "full album",
  "livestream",
  "megamix",
  "nonstop",
  "nhạc sàn 1h",
];

function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function containsWholeKeyword(haystackLower: string, haystackAscii: string, keyword: string): boolean {
  const kwLower = keyword.toLowerCase();
  const kwAscii = stripVietnameseDiacritics(keyword);
  // Word-boundary-aware check for short ASCII words like "dj" / "sau" / "dau" / "dem" / "mua"
  if (/^[a-z0-9-]+$/i.test(kwAscii) && kwAscii.length <= 4) {
    const escaped = kwAscii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
    return re.test(haystackLower) || re.test(haystackAscii);
  }
  return haystackLower.includes(kwLower) || haystackAscii.includes(kwAscii);
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  const ascii = stripVietnameseDiacritics(text);
  return keywords.some((kw) => containsWholeKeyword(lower, ascii, kw));
}

function cleanArtistForQuery(song: Song): string {
  const raw = song.artists?.[0]?.name?.trim() || "";
  if (!raw || /^unknown$/i.test(raw) || /^nghệ sĩ chưa rõ$/i.test(raw)) {
    return "";
  }
  // Remove noise like "- Topic" or "(Official)"
  return raw.replace(/\s*-\s*topic$/i, "").trim();
}

function normalizeTitleForDedup(title: string): string {
  return stripVietnameseDiacritics(title)
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/g, " ")
    .replace(/\b(official|audio|mv|video|lyrics|lyric|hd|4k|remix|lofi|cover|ver|version)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function parseDurationSec(song: any): number | null {
  if (typeof song?.duration === "number" && Number.isFinite(song.duration) && song.duration > 0) {
    return song.duration;
  }
  const text = typeof song?.durationText === "string" ? song.durationText.trim() : "";
  if (!text) return null;
  const parts = text.split(":").map((p: string) => parseInt(p, 10));
  if (parts.some((n: number) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function shuffleStrings(arr: string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function classifyTrackVibe(
  song: Song,
  playlistName?: string | null
): VibeClassification {
  const artistsText = (song.artists || []).map((a) => a.name).join(" ");
  const combined = `${song.title || ""} ${artistsText} ${playlistName || ""}`.trim();
  const primaryArtist = cleanArtistForQuery(song);

  const hasChinese = /[\u4e00-\u9fff]/.test(combined);
  const hasKorean = /[\uac00-\ud7af]/.test(combined);
  const hasJapanese = /[\u3040-\u30ff]/.test(combined);
  const isPhonkOrFunk = containsAnyKeyword(combined, ["phonk", "funk"]);
  const allowInstrumental =
    isPhonkOrFunk || containsAnyKeyword(combined, ["không lời", "nhạc nền", "instrumental", "beat"]);

  const dedupeQueries = (raw: string[]) => {
    const out: string[] = [];
    for (const q of raw) {
      const cleaned = q.replace(/\s+/g, " ").trim();
      if (cleaned && !out.includes(cleaned)) out.push(cleaned);
    }
    return shuffleStrings(out);
  };

  if (containsAnyKeyword(combined, REMIX_KEYWORDS)) {
    const pool = [
      ...(primaryArtist ? [`${primaryArtist} remix`] : []),
      ...(hasChinese ? ["nhạc trung remix", "nhạc hoa remix hot"] : []),
      ...(isPhonkOrFunk ? ["phonk music mix", "brazilian funk phonk"] : ["nhạc trẻ remix hot", "vinahouse remix hay nhất"]),
    ];
    return {
      vibe: "remix",
      label: isPhonkOrFunk ? "Phonk / Remix" : "Remix / Sôi động",
      hasChinese,
      allowInstrumental,
      queries: dedupeQueries(pool),
    };
  }

  if (containsAnyKeyword(combined, LOFI_KEYWORDS)) {
    const pool = [
      ...(primaryArtist ? [`${primaryArtist} lofi`, `${primaryArtist} chill`] : []),
      "nhạc lofi chill buồn",
      "lofi việt nhẹ nhàng",
      ...(hasChinese ? ["nhạc trung lofi chill"] : []),
    ];
    return {
      vibe: "lofi",
      label: "Lofi / Chill",
      hasChinese,
      allowInstrumental,
      queries: dedupeQueries(pool),
    };
  }

  if (containsAnyKeyword(combined, SAD_KEYWORDS)) {
    const pool = [
      ...(primaryArtist ? [`${primaryArtist} ballad buồn`, `${primaryArtist} nhạc buồn`] : []),
      "nhạc trẻ buồn tâm trạng",
      "nhạc buồn dễ ngủ",
      ...(hasChinese ? ["nhạc hoa buồn tâm trạng"] : []),
    ];
    return {
      vibe: "sad",
      label: "Tâm trạng / Sầu",
      hasChinese,
      allowInstrumental,
      queries: dedupeQueries(pool),
    };
  }

  // Default V-Pop / Same-Language Group
  const defaultPool = [
    ...(primaryArtist ? [`${primaryArtist} official audio`, `${primaryArtist} hits`] : []),
    ...(hasChinese
      ? ["nhạc trung nhẹ nhàng hay nhất", "nhạc hoa official audio"]
      : hasKorean
        ? ["nhạc hàn kpop official audio"]
        : hasJapanese
          ? ["jpop official audio"]
          : ["nhạc trẻ vpop hay nhất hiện nay", "nhạc việt thịnh hành official audio"]),
  ];

  return {
    vibe: "vpop",
    label: hasChinese ? "Nhạc Hoa" : hasKorean ? "K-Pop" : hasJapanese ? "J-Pop" : "V-Pop / Thịnh hành",
    hasChinese,
    allowInstrumental,
    queries: dedupeQueries(defaultPool),
  };
}

function normalizeCandidateSong(raw: any, vibeLabel: string): Song | null {
  const id = (raw?.videoId || raw?.id || "").trim();
  if (!isValidTrackId(id)) return null;

  const artists =
    Array.isArray(raw?.artists) && raw.artists.length > 0
      ? raw.artists
      : raw?.author
        ? [{ name: String(raw.author) }]
        : [{ name: "Unknown" }];

  const isYt11 = /^[a-zA-Z0-9_-]{11}$/.test(id) && !id.startsWith("sc:");
  const rawThumb = raw?.thumbnail || raw?.thumbnailUrl || null;
  const safeThumb = isYt11
    ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
    : rawThumb;

  return {
    id,
    videoId: id,
    title: String(raw?.title || "Unknown Track").trim(),
    artists,
    duration: parseDurationSec(raw),
    durationText: raw?.durationText ?? null,
    thumbnail: safeThumb,
    album: raw?.album ?? null,
    explicit: Boolean(raw?.explicit),
    source: raw?.source ?? null,
    isAutoplay: true,
    autoplayVibe: vibeLabel,
  };
}

function filterCleanCandidates(
  rawList: any[],
  seedSong: Song,
  playedHistoryIds: Set<string>,
  allowInstrumental: boolean,
  vibeLabel: string
): Song[] {
  const seedNormTitle = normalizeTitleForDedup(seedSong.title || "");
  const seenIds = new Set<string>();
  const clean: Song[] = [];

  for (const item of rawList) {
    const cand = normalizeCandidateSong(item, vibeLabel);
    if (!cand) continue;
    if (playedHistoryIds.has(cand.id) || seenIds.has(cand.id)) continue;

    // Prevent same-title re-upload duplicate of current seed song
    const candNormTitle = normalizeTitleForDedup(cand.title);
    if (seedNormTitle && candNormTitle && candNormTitle === seedNormTitle) continue;

    // Exclude excessively long mixes (> 8 min = 480s) or tiny snippets (< 45s)
    if (cand.duration != null && (cand.duration > 480 || cand.duration < 45)) continue;

    // Exclude long mix / livestream titles even when duration metadata is missing
    if (containsAnyKeyword(cand.title, LONG_MIX_BLACKLIST)) continue;

    // Anti-instrumental filter unless seed itself is phonk/funk/instrumental
    if (!allowInstrumental && containsAnyKeyword(cand.title, INSTRUMENTAL_BLACKLIST)) {
      continue;
    }

    seenIds.add(cand.id);
    clean.push(cand);
  }

  return clean;
}

function isRateLimitOrBotErr(err: unknown): boolean {
  const text = (typeof err === "string" ? err : (err as any)?.message || String(err || "")).toLowerCase();
  return (
    text.includes("429") ||
    text.includes("too many requests") ||
    text.includes("login_required") ||
    text.includes("not a bot") ||
    text.includes("sign in to confirm")
  );
}

export async function findAutoplayRecommendation(
  seedSong: Song,
  playedHistoryIds: Set<string>,
  playlistName?: string | null
): Promise<{ song: Song; classification: VibeClassification; query: string } | null> {
  if (!window.mochyApi) return null;

  const classification = classifyTrackVibe(seedSong, playlistName);
  const queriesToTry = classification.queries.slice(0, 2);

  for (let i = 0; i < queriesToTry.length; i++) {
    const query = queriesToTry[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 350));
    }

    try {
      let rawResults: any[] = [];
      try {
        const ytmSongs = await window.mochyApi.searchSongs(query);
        if (Array.isArray(ytmSongs)) rawResults = rawResults.concat(ytmSongs);
      } catch (err) {
        if (isRateLimitOrBotErr(err)) {
          throw err;
        }
      }

      let clean = filterCleanCandidates(
        rawResults,
        seedSong,
        playedHistoryIds,
        classification.allowInstrumental,
        classification.label
      );

      if (clean.length === 0 && rawResults.length === 0) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          const general = await window.mochyApi.search(query);
          const list = Array.isArray(general) ? general : general?.songs || general?.videos || general?.items || [];
          clean = filterCleanCandidates(
            list,
            seedSong,
            playedHistoryIds,
            classification.allowInstrumental,
            classification.label
          );
        } catch (err) {
          if (isRateLimitOrBotErr(err)) {
            throw err;
          }
        }
      }

      if (clean.length > 0) {
        const pool = clean.slice(0, Math.min(8, Math.max(5, clean.length)));
        const picked = pool[Math.floor(Math.random() * pool.length)];
        return { song: picked, classification, query };
      }
    } catch (err) {
      if (isRateLimitOrBotErr(err)) {
        throw err;
      }
      console.warn("[SmartAutoplay] Query failed:", query, err);
    }
  }

  return null;
}
