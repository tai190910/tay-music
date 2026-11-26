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

function normalizeThumbUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
}

function extractYouTubeId(src?: string | null, videoId?: string | null): string | null {
  if (videoId && typeof videoId === "string") {
    const trimmedId = videoId.trim();
    if (trimmedId.length === 11 && !trimmedId.startsWith("sc:")) {
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
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const normalizedSrc = normalizeThumbUrl(src);
  const ytId = extractYouTubeId(normalizedSrc, videoId);

  if (normalizedSrc) {
    pushUnique(normalizedSrc);
    if (/\/maxresdefault(?:\.[a-z]+)?/i.test(normalizedSrc)) {
      pushUnique(normalizedSrc.replace(/\/maxresdefault(?:\.[a-z]+)?/i, "/hqdefault.jpg"));
      pushUnique(normalizedSrc.replace(/\/maxresdefault(?:\.[a-z]+)?/i, "/mqdefault.jpg"));
    }
    if (/\/sddefault(?:\.[a-z]+)?/i.test(normalizedSrc)) {
      pushUnique(normalizedSrc.replace(/\/sddefault(?:\.[a-z]+)?/i, "/hqdefault.jpg"));
    }
  }

  if (ytId) {
    pushUnique(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`);
    pushUnique(`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`);
  }

  return candidates;
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
    setFailed(false);
  }, [candidateKey]);

  const activeUrl = !failed && fallbackIdx < candidates.length ? candidates[fallbackIdx] : null;

  const advanceFallback = () => {
    setFallbackIdx((prev) => {
      if (prev + 1 < candidates.length) {
        return prev + 1;
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
        onError={advanceFallback}
        onLoad={handleLoad}
        className={`w-full h-full object-cover ${imgClassName}`}
      />
    </div>
  );
};
