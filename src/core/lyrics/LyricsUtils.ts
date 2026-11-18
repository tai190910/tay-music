// src/core/lyrics/LyricsUtils.ts

import type { LyricsEntry, ParsedLyrics, WordTimestamp, ActiveLyricsLine } from "./types.ts";

export class LyricsUtils {
  private static readonly TITLE_CLEANUP_PATTERNS = [
    /\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\)/gi,
    /\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit).*?\]/gi,
    /\s*【.*?】/g,
    /\s*\|.*$/g,
    /\s*-\s*(official|video|audio|lyrics|lyric|visualizer).*$/gi,
    /\s*\(feat\..*?\)/gi,
    /\s*\(ft\..*?\)/gi,
    /\s*feat\..*$/gi,
    /\s*ft\..*$/gi,
  ];

  private static readonly ARTIST_SEPARATORS = [
    " & ", " and ", ", ", " x ", " X ", " feat. ", " feat ", " ft. ", " ft ", " featuring ", " with "
  ];

  static cleanTitle(title: string): string {
    let cleaned = title.trim();
    for (const pattern of this.TITLE_CLEANUP_PATTERNS) {
      cleaned = cleaned.replace(pattern, "");
    }
    return cleaned.trim();
  }

  static cleanArtist(artist: string): string {
    let cleaned = artist.trim();
    for (const separator of this.ARTIST_SEPARATORS) {
      const idx = cleaned.toLowerCase().indexOf(separator.toLowerCase());
      if (idx > 0) {
        cleaned = cleaned.substring(0, idx);
        break;
      }
    }
    return cleaned.trim();
  }

  private static decodeHtmlEntities(str: string): string {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ");
  }

  /**
   * Parse milliseconds from a timestamp tag "[mm:ss.xx]" or "<mm:ss.xx>".
   */
  private static parseTimestamp(minStr: string, secStr: string, msStr: string): number {
    const min = parseInt(minStr, 10);
    const sec = parseInt(secStr, 10);
    let ms = parseInt(msStr, 10);
    if (msStr.length === 2) {
      ms = ms * 10;
    }
    return min * 60000 + sec * 1000 + ms;
  }

  /**
   * Formats milliseconds into LRC timestamp "[mm:ss.xx]".
   */
  static formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const centis = Math.floor((ms % 1000) / 10);
    return `[${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}]`;
  }

  /**
   * Parses standard LRC or Enhanced/RichSync LRC into structured entries.
   */
  static parseLyrics(rawLrc: string): ParsedLyrics {
    if (!rawLrc || rawLrc.trim().length === 0) {
      return { lines: [], isSynced: false, raw: rawLrc };
    }

    const unescaped = rawLrc
      .trim()
      .replace(/^"|"$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\");

    const decoded = this.decodeHtmlEntities(unescaped);
    const rawLines = decoded.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("[offset:"));

    // 1. Check if NetEase YRC format: e.g. "[123,456](123,100,0)Hello(223,200,0)World"
    const isYrc = rawLines.some((l) => /^\[\d+,\d+\]\(\d+,\d+,-?\d+\)/.test(l));
    if (isYrc) {
      const yrcEntries = this.parseYrc(rawLines);
      if (yrcEntries.length > 0) {
        return { lines: yrcEntries, isSynced: true, raw: rawLrc };
      }
    }

    // 2. Standard or Enhanced LRC parsing
    const entries: LyricsEntry[] = [];
    let hasTimestamp = false;

    // Pattern for LRC line: "[01:23.45] text" or multiple timestamps "[01:23.45][02:34.56] text"
    const lrcLineRegex = /^((?:\[\d{1,2}:\d{2}(?:\.\d{2,3})?\]\s*)+)(.*)$/;
    const timestampTagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
    const wordSyncRegex = /<(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?>\s*([^<]+)/g;

    for (const line of rawLines) {
      // Ignore metadata headers like [ti:...], [ar:...], [al:...]
      if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(line)) {
        continue;
      }

      const match = line.match(lrcLineRegex);
      if (match) {
        hasTimestamp = true;
        const timeHeader = match[1];
        let lineText = match[2].trim();

        // Extract agent tag e.g. "{agent:v1}"
        let agent: string | null = null;
        const agentMatch = lineText.match(/\{agent:([^}]+)\}/);
        if (agentMatch) {
          agent = agentMatch[1];
          lineText = lineText.replace(/\{agent:[^}]+\}/, "").trim();
        }

        // Check if background vocal tag "{bg}"
        let isBackground = false;
        if (/^\{bg\}/.test(lineText)) {
          isBackground = true;
          lineText = lineText.replace(/^\{bg\}\s*/, "");
        }

        // Check for word-level sync e.g. "<01:23.45> Word1 <01:24.00> Word2"
        let words: WordTimestamp[] | null = null;
        const wordMatches = [...lineText.matchAll(wordSyncRegex)];
        if (wordMatches.length > 0) {
          words = [];
          for (let i = 0; i < wordMatches.length; i++) {
            const wm = wordMatches[i];
            const start = this.parseTimestamp(wm[1], wm[2], wm[3] || "0");
            const wText = wm[4].trim();

            let end = start + 500;
            if (i + 1 < wordMatches.length) {
              const nextWm = wordMatches[i + 1];
              end = this.parseTimestamp(nextWm[1], nextWm[2], nextWm[3] || "0");
            }
            words.push({ text: wText, startTime: start, endTime: end });
          }
          // Clean word tags from line text
          lineText = lineText.replace(/<\d{1,2}:\d{2}(?:\.\d{2,3})?>/g, "").replace(/\s+/g, " ").trim();
        }

        // A line may have multiple timestamps e.g. [00:12.00][00:45.00] Repeat line
        const timestamps: number[] = [];
        let tMatch: RegExpExecArray | null;
        while ((tMatch = timestampTagRegex.exec(timeHeader)) !== null) {
          timestamps.push(this.parseTimestamp(tMatch[1], tMatch[2], tMatch[3] || "0"));
        }

        for (const t of timestamps) {
          entries.push({
            time: t,
            text: lineText,
            words: words ? [...words] : null,
            agent,
            isBackground,
          });
        }
      } else {
        // Plain text line without timestamp
        if (line.length > 0) {
          entries.push({
            time: 0,
            text: line,
          });
        }
      }
    }

    if (hasTimestamp) {
      entries.sort((a, b) => a.time - b.time);
    }

    return {
      lines: entries,
      isSynced: hasTimestamp,
      raw: rawLrc,
    };
  }

  /**
   * Parse NetEase YRC word-timed lines.
   */
  private static parseYrc(rawLines: string[]): LyricsEntry[] {
    const entries: LyricsEntry[] = [];
    const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
    const wordRegex = /\((\d+),(\d+),-?\d+\)(.*?)(?=\(\d+,\d+,-?\d+\)|$)/g;

    for (const raw of rawLines) {
      const m = raw.match(lineRegex);
      if (!m) continue;

      const lineStart = parseInt(m[1], 10);
      const content = m[3];
      const words: WordTimestamp[] = [];

      let wordMatch: RegExpExecArray | null;
      while ((wordMatch = wordRegex.exec(content)) !== null) {
        const wStart = parseInt(wordMatch[1], 10);
        const wDuration = parseInt(wordMatch[2], 10);
        const wText = wordMatch[3];
        words.push({
          text: wText,
          startTime: wStart,
          endTime: wStart + wDuration,
        });
      }

      const fullText = words.map((w) => w.text).join("").trim();
      entries.push({
        time: lineStart,
        text: fullText,
        words: words.length > 0 ? words : null,
      });
    }

    entries.sort((a, b) => a.time - b.time);
    return entries;
  }

  /**
   * Finds the currently active lyrics line for a given playback timestamp (in milliseconds).
   * Calculates smooth progress (0.0 to 1.0) inside the current line.
   */
  static findActiveLine(lines: LyricsEntry[], currentTimeMs: number): ActiveLyricsLine {
    if (!lines || lines.length === 0) {
      return { activeIndex: -1, activeLine: null, nextLine: null, progress: 0 };
    }

    // Binary search for closest line with time <= currentTimeMs
    let low = 0;
    let high = lines.length - 1;
    let foundIdx = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lines[mid].time <= currentTimeMs) {
        foundIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (foundIdx === -1) {
      return {
        activeIndex: 0,
        activeLine: lines[0],
        nextLine: lines.length > 1 ? lines[1] : null,
        progress: 0,
      };
    }

    const activeLine = lines[foundIdx];
    const nextLine = foundIdx + 1 < lines.length ? lines[foundIdx + 1] : null;

    let progress = 0;
    if (nextLine) {
      const duration = nextLine.time - activeLine.time;
      if (duration > 0) {
        progress = Math.min(1, Math.max(0, (currentTimeMs - activeLine.time) / duration));
      }
    } else {
      progress = 1;
    }

    return {
      activeIndex: foundIdx,
      activeLine,
      nextLine,
      progress,
    };
  }
}
