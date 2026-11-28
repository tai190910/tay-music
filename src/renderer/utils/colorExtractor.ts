// src/renderer/utils/colorExtractor.ts

import { isThumbnailUrlFailed, markThumbnailUrlFailed } from "../components/TrackThumbnail.tsx";

export interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
  rgbString: string;
}

export const DEFAULT_COLOR: ExtractedColor = {
  hex: "#7c6855",
  rgb: [124, 104, 85],
  rgbString: "124, 104, 85",
};

const colorCache = new Map<string, ExtractedColor>();
const MAX_COLOR_CACHE = 300;

/**
 * Extracts a dominant, vibrant accent color from an image URL.
 * Automatically avoids dark/black, washed-out white, or dull gray tones,
 * and caches both extracted colors and failed URLs to avoid redundant requests.
 */
export async function extractDominantColor(imageUrl?: string | null): Promise<ExtractedColor> {
  if (!imageUrl || isThumbnailUrlFailed(imageUrl)) return DEFAULT_COLOR;

  const cached = colorCache.get(imageUrl);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(DEFAULT_COLOR);

        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);

        const imgData = ctx.getImageData(0, 0, size, size).data;
        let bestR = 244,
          bestG = 63,
          bestB = 94;
        let maxScore = -1;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue;

          const total = r + g + b;
          if (total < 75 || total > 680) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const delta = max - min;
          if (delta < 25) continue;

          const saturation = delta / max;
          const score = saturation * (max / 255);

          if (score > maxScore) {
            maxScore = score;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }

        const result: ExtractedColor =
          maxScore > 0
            ? {
                hex: `#${((1 << 24) + (bestR << 16) + (bestG << 8) + bestB).toString(16).slice(1)}`,
                rgb: [bestR, bestG, bestB],
                rgbString: `${bestR}, ${bestG}, ${bestB}`,
              }
            : DEFAULT_COLOR;

        if (colorCache.size >= MAX_COLOR_CACHE) {
          const firstKey = colorCache.keys().next().value;
          if (firstKey) colorCache.delete(firstKey);
        }
        colorCache.set(imageUrl, result);
        resolve(result);
      } catch {
        resolve(DEFAULT_COLOR);
      }
    };

    img.onerror = () => {
      markThumbnailUrlFailed(imageUrl);
      resolve(DEFAULT_COLOR);
    };

    img.src = imageUrl;
  });
}
