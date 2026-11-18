// src/core/innertube/types.ts

export interface YouTubeLocale {
  gl: string;
  hl: string;
}

export interface Artist {
  name: string;
  id?: string | null;
}

export interface Album {
  name: string;
  id: string;
}

export interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YTItem {
  id: string;
  title: string;
  thumbnail: string | null;
  explicit: boolean;
  shareLink: string;
}

export interface SongItem extends YTItem {
  artists: Artist[];
  album?: Album | null;
  duration?: number | null; // in seconds
  durationText?: string | null;
  musicVideoType?: string | null;
  isVideoSong: boolean;
}

export interface AlbumItem extends YTItem {
  browseId: string;
  playlistId: string;
  artists?: Artist[] | null;
  year?: number | null;
  description?: string | null;
}

export interface PlaylistItem extends YTItem {
  author?: Artist | null;
  songCountText?: string | null;
  songCount?: number | null;
}

export interface ArtistItem extends YTItem {
  channelId?: string | null;
}

export interface SearchResult {
  items: (SongItem | AlbumItem | PlaylistItem | ArtistItem)[];
  continuation?: string | null;
}

export interface PlaylistPageResult {
  playlist: PlaylistItem;
  songs: SongItem[];
  continuation?: string | null;
}

export interface SearchSuggestionsResult {
  queries: string[];
  recommendedItems: SongItem[];
}

export interface PlayerResponse {
  responseContext?: {
    visitorData?: string;
    serviceTrackingParams?: any[];
  };
  playabilityStatus: {
    status: string; // "OK", "LOGIN_REQUIRED", etc.
    reason?: string;
    playableInEmbed?: boolean;
  };
  playerConfig?: {
    audioConfig?: {
      loudnessDb?: number | null;
      perceptualLoudnessDb?: number | null;
    };
  };
  streamingData?: {
    expiresInSeconds: string | number;
    formats?: Format[];
    adaptiveFormats: Format[];
  };
  videoDetails?: {
    videoId: string;
    title?: string;
    author?: string;
    channelId?: string;
    lengthSeconds: string;
    musicVideoType?: string;
    viewCount?: string;
    thumbnail?: {
      thumbnails: Thumbnail[];
    };
  };
  playbackTracking?: {
    videostatsPlaybackUrl?: { baseUrl?: string };
    videostatsWatchtimeUrl?: { baseUrl?: string };
    atrUrl?: { baseUrl?: string };
  };
}

export interface Format {
  itag: number;
  url?: string | null;
  mimeType: string;
  bitrate: number;
  width?: number | null;
  height?: number | null;
  contentLength?: string | number | null;
  quality?: string;
  fps?: number | null;
  qualityLabel?: string | null;
  averageBitrate?: number | null;
  audioQuality?: string | null; // "AUDIO_QUALITY_HIGH", "AUDIO_QUALITY_MEDIUM", "AUDIO_QUALITY_LOW"
  approxDurationMs?: string | null;
  audioSampleRate?: string | number | null;
  audioChannels?: number | null;
  loudnessDb?: number | null;
  lastModified?: string | number | null;
  signatureCipher?: string | null;
  cipher?: string | null;
  audioTrack?: {
    displayName?: string;
    id?: string;
    isAutoDubbed?: boolean;
  } | null;
}
