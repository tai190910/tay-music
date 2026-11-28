// src/renderer/components/TrackThumbnail.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Music } from "lucide-react";

export interface TrackThumbnailProps {
  src?: string | null;
  videoId?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  iconSize?: "xs" | "sm" | "md" | "lg" | "xl";
  isAmbient?: boolean;
}

const ICON_CLASSES: Record<NonNullable<TrackThumbnailProps["iconSize"]>, string> = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
  xl: "w-12 h-12",
};

const MAX_FAILED_CACHE_SIZE = 2000;
const failedThumbnailCache = new Set<string>();
const localCoverMap = new Map<string, string>();

export function syncLocalCoverCache(
  tracks: Array<{ videoId: string; localCoverUrl?: string | null }>
): void {
  localCoverMap.clear();
  for (const t of tracks) {
    if (t.videoId && t.localCoverUrl) {
      localCoverMap.set(t.videoId, t.localCoverUrl);
    }
  }
}

export function markThumbnailUrlFailed(url?: string | null): void {
  if (!url) return;
  if (failedThumbnailCache.size >= MAX_FAILED_CACHE_SIZE) {
    const first = failedThumbnailCache.values().next().value;
    if (first) failedThumbnailCache.delete(first);
  }
  failedThumbnailCache.add(url);
}

export function isThumbnailUrlFailed(url?: string | null): boolean {
  if (!url) return false;
  return failedThumbnailCache.has(url);
}

function normalizeThumbUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

function isGoogleUserContentUrl(url: string): boolean {
  return /(?:^https?:\/\/)?(?:[a-z0-9-]+\.)?(?:googleusercontent\.com|ggpht\.com)\//i.test(url);
}

export function extractYouTubeId(src?: string | null, videoId?: string | null): string | null {
  if (videoId && typeof videoId === "string") {
    const trimmedId = videoId.trim();
    if (
      /^[a-zA-Z0-9_-]{11}$/.test(trimmedId) &&
      !trimmedId.startsWith("LP_") &&
      !trimmedId.startsWith("VL") &&
      !trimmedId.startsWith("UC") &&
      !trimmedId.startsWith("MP")
    ) {
      return trimmedId;
    }
  }
  if (src && typeof src === "string") {
    const match = src.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function buildThumbnailFallbacks(src?: string | null, videoId?: string | null): string[] {
  const candidates: string[] = [];
  const pushUnique = (u?: string | null) => {
    const normalized = normalizeThumbUrl(u);
    if (normalized && !failedThumbnailCache.has(normalized) && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const normalizedSrc = normalizeThumbUrl(src);
  const trimmedRawId = typeof videoId === "string" ? videoId.trim() : "";
  const ytId = extractYouTubeId(normalizedSrc, videoId);
  const lookupId = trimmedRawId || ytId;

  if (lookupId) {
    const localCover = localCoverMap.get(lookupId);
    if (localCover) {
      pushUnique(localCover);
    }
  }

  // Always prioritize static YouTube CDN (i.ytimg.com) over yt3/lh3.googleusercontent.com
  // whenever a valid 11-character YouTube videoId exists to prevent HTTP 429 rate-limits.
  if (ytId) {
    pushUnique(`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`);
    pushUnique(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`);
    if (normalizedSrc && !isGoogleUserContentUrl(normalizedSrc)) {
      pushUnique(normalizedSrc);
    }
    return candidates;
  }

  if (normalizedSrc) {
    if (/\/maxresdefault(?:\.[a-z]+)?/i.test(normalizedSrc)) {
      pushUnique(normalizedSrc.replace(/\/maxresdefault(?:\.[a-z]+)?/i, "/mqdefault.jpg"));
      pushUnique(normalizedSrc.replace(/\/maxresdefault(?:\.[a-z]+)?/i, "/hqdefault.jpg"));
    } else if (/\/sddefault(?:\.[a-z]+)?/i.test(normalizedSrc)) {
      pushUnique(normalizedSrc.replace(/\/sddefault(?:\.[a-z]+)?/i, "/mqdefault.jpg"));
      pushUnique(normalizedSrc.replace(/\/sddefault(?:\.[a-z]+)?/i, "/hqdefault.jpg"));
    }
    // Avoid spamming yt3.googleusercontent.com; allow non-yt3 URLs if no videoId is available
    if (!/yt3\.googleusercontent\.com/i.test(normalizedSrc)) {
      pushUnique(normalizedSrc);
    }
  }

  return candidates;
}

export function getPreferredThumbnailUrl(src?: string | null, videoId?: string | null): string | null {
  const list = buildThumbnailFallbacks(src, videoId);
  return list[0] ?? null;
}

export const TrackThumbnail: React.FC<TrackThumbnailProps> = ({
  src,
  videoId,
  alt = "",
  className = "w-full h-full",
  imgClassName = "",
  iconSize = "md",
  isAmbient = false,
}) => {
  const candidates = useMemo(() => buildThumbnailFallbacks(src, videoId), [src, videoId]);
  const candidateKey = `${src ?? ""}::${videoId ?? ""}`;
  const [fallbackIdx, setFallbackIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFallbackIdx(0);
    setFailed(candidates.length === 0);
  }, [candidateKey, candidates.length]);

  const activeUrl = !failed && fallbackIdx < candidates.length ? candidates[fallbackIdx] : null;

  const advanceFallback = () => {
    if (activeUrl) {
      markThumbnailUrlFailed(activeUrl);
    }
    setFallbackIdx((prev) => {
      let next = prev + 1;
      while (next < candidates.length && isThumbnailUrlFailed(candidates[next])) {
        next += 1;
      }
      if (next < candidates.length) {
        return next;
      }
      setFailed(true);
      return prev;
    });
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (
      img.naturalWidth === 120 &&
      img.naturalHeight === 90 &&
      activeUrl &&
      /(?:maxresdefault|sddefault|_webp)/i.test(activeUrl)
    ) {
      advanceFallback();
    }
  };

  if (isAmbient) {
    if (!activeUrl) return null;
    return (
      <img
        src={activeUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={advanceFallback}
        onLoad={handleLoad}
        className={imgClassName || className || "w-full h-full object-cover"}
      />
    );
  }

  if (!activeUrl) {
    return (
      <div
        className={`overflow-hidden bg-gradient-to-br from-[#24242d] via-[#18181f] to-[#111116] flex items-center justify-center ${className}`}
      >
        <Music className={`${ICON_CLASSES[iconSize]} text-white/35 flex-shrink-0`} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      <img
        src={activeUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={advanceFallback}
        onLoad={handleLoad}
        className={`w-full h-full object-cover ${imgClassName}`}
      />
    </div>
  );
};
