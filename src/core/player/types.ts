// src/core/player/types.ts

import type { Format, PlayerResponse } from "../innertube/types.ts";

export const AudioQuality = {
  AUTO: "AUTO",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type AudioQuality = (typeof AudioQuality)[keyof typeof AudioQuality];

export interface PlaybackData {
  audioConfig?: PlayerResponse["playerConfig"] extends { audioConfig?: infer T } ? T : any;
  videoDetails?: PlayerResponse["videoDetails"];
  playbackTracking?: PlayerResponse["playbackTracking"];
  format: Format;
  streamUrl: string;
  streamExpiresInSeconds: number;
  streamClient: string;
  streamHeaders: Record<string, string>;
  fromMusicVideo?: boolean;
  fromStudio?: boolean;
}
