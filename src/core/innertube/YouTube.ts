// src/core/innertube/YouTube.ts

import { InnerTube } from "./InnerTube.ts";
import { YouTubeClient } from "./YouTubeClient.ts";
import { YTPlayerUtils } from "../player/YTPlayerUtils.ts";
import { AudioQuality, type PlaybackData } from "../player/types.ts";
import { LyricsHelper } from "../lyrics/LyricsHelper.ts";
import type { LyricsResult } from "../lyrics/types.ts";
import type {
  SongItem,
  AlbumItem,
  PlaylistItem,
  ArtistItem,
  SearchResult,
  PlaylistPageResult,
  SearchSuggestionsResult,
  PlayerResponse,
  Artist,
  Album,
} from "./types.ts";

export class YouTube {
  private static readonly innerTubeInstance = new InnerTube();

  static get innerTube(): InnerTube {
    return this.innerTubeInstance;
  }

  static setCookie(cookie: string | null): void {
    this.innerTubeInstance.setCookie(cookie);
  }

  /**
   * Parse duration string like "3:45" or "1:02:15" into seconds.
   */
  private static parseDuration(timeStr?: string | null): number | null {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(":").map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
  }

  /**
   * Extracts clean thumbnail URL from YouTube thumbnail list.
   */
  private static extractThumbnailUrl(thumbnails?: Array<{ url: string; width?: number; height?: number }> | null): string {
    if (!thumbnails || thumbnails.length === 0) return "";
    // Return the highest resolution available
    return thumbnails[thumbnails.length - 1].url;
  }

  /**
   * Parses a MusicResponsiveListItemRenderer from YouTube Music responses.
   */
  private static parseResponsiveListItem(renderer: any): SongItem | AlbumItem | PlaylistItem | ArtistItem | null {
    if (!renderer) return null;

    const flexColumns = renderer.flexColumns || [];
    const firstColRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
    const title = firstColRuns?.[0]?.text;
    if (!title) return null;

    const navEndpoint = renderer.navigationEndpoint?.browseEndpoint;
    const browseId = navEndpoint?.browseId;
    const pageType = navEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

    const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const thumbnailUrl = this.extractThumbnailUrl(thumbnails);

    const isExplicit = (renderer.badges || []).some(
      (b: any) => b.musicInlineBadgeRenderer?.icon?.iconType === "MUSIC_EXPLICIT_BADGE"
    );

    // Extract videoId if it's a song/video
    let videoId = renderer.playlistItemData?.videoId;
    if (!videoId) {
      videoId = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
    }
    if (!videoId) {
      videoId = firstColRuns?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;
    }

    const secondaryRuns: any[] = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

    // Group runs by separator " • " or " \u2022 "
    const runGroups: any[][] = [];
    let currentGroup: any[] = [];
    for (const run of secondaryRuns) {
      if (run.text === " • " || run.text?.includes("•")) {
        if (currentGroup.length > 0) {
          runGroups.push(currentGroup);
          currentGroup = [];
        }
      } else {
        currentGroup.push(run);
      }
    }
    if (currentGroup.length > 0) {
      runGroups.push(currentGroup);
    }

    // Check if it's an artist
    if (pageType === "MUSIC_PAGE_TYPE_ARTIST" && browseId) {
      return {
        id: browseId,
        title,
        thumbnail: thumbnailUrl,
        explicit: false,
        shareLink: `https://music.youtube.com/channel/${browseId}`,
        channelId: browseId,
      } as ArtistItem;
    }

    // Check if it's an album
    if (pageType === "MUSIC_PAGE_TYPE_ALBUM" && browseId) {
      const artists: Artist[] = (runGroups[1] || runGroups[0] || []).map((r) => ({
        name: r.text,
        id: r.navigationEndpoint?.browseEndpoint?.browseId,
      }));
      const yearText = runGroups[2]?.[0]?.text || runGroups[1]?.[0]?.text;
      const year = yearText ? parseInt(yearText, 10) : null;
      const playlistId = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId || browseId;

      return {
        id: browseId,
        browseId,
        playlistId,
        title,
        artists,
        year: isNaN(year as any) ? null : year,
        thumbnail: thumbnailUrl,
        explicit: isExplicit,
        shareLink: `https://music.youtube.com/playlist?list=${playlistId}`,
      } as AlbumItem;
    }

    // Check if it's a playlist
    if (pageType === "MUSIC_PAGE_TYPE_PLAYLIST" && browseId) {
      const cleanId = browseId.replace(/^VL/, "");
      const authorText = runGroups[0]?.[0]?.text;
      const songCountText = runGroups[1]?.[0]?.text;
      return {
        id: cleanId,
        title,
        author: authorText ? { name: authorText, id: null } : null,
        songCountText,
        thumbnail: thumbnailUrl,
        explicit: false,
        shareLink: `https://music.youtube.com/playlist?list=${cleanId}`,
      } as PlaylistItem;
    }

    // Default: Song or Video Item
    if (videoId) {
      const artists: Artist[] = (runGroups[0] || []).map((r) => ({
        name: r.text,
        id: r.navigationEndpoint?.browseEndpoint?.browseId || null,
      })).filter((a) => a.name && !a.name.includes(":"));

      const albumRun = runGroups[1]?.find((r) => r.navigationEndpoint?.browseEndpoint?.browseId);
      const album: Album | null = albumRun
        ? { name: albumRun.text, id: albumRun.navigationEndpoint.browseEndpoint.browseId }
        : null;

      const durationText = runGroups[runGroups.length - 1]?.[0]?.text ||
        renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
      const duration = this.parseDuration(durationText);

      return {
        id: videoId,
        videoId: videoId,
        title,
        artists,
        album,
        duration,
        durationText,
        musicVideoType: renderer.musicVideoType,
        isVideoSong: renderer.musicVideoType != null && renderer.musicVideoType !== "MUSIC_VIDEO_TYPE_ATV",
        thumbnail: thumbnailUrl,
        explicit: isExplicit,
        shareLink: `https://music.youtube.com/watch?v=${videoId}`,
      } as SongItem;
    }

    return null;
  }

  /**
   * Search YouTube Music for tracks, albums, artists, or playlists.
   */
  static async search(query: string, filter?: string): Promise<SearchResult> {
    const raw = await this.innerTubeInstance.search(YouTubeClient.WEB_REMIX, query, filter);
    const items: (SongItem | AlbumItem | PlaylistItem | ArtistItem)[] = [];

    const tabs = raw.contents?.tabbedSearchResultsRenderer?.tabs;
    const sectionContents = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];

    for (const section of sectionContents) {
      // Direct shelf
      const shelf = section.musicShelfRenderer;
      if (shelf?.contents) {
        for (const itemRenderer of shelf.contents) {
          const parsed = this.parseResponsiveListItem(itemRenderer.musicResponsiveListItemRenderer);
          if (parsed && !items.some((it) => it.id === parsed.id)) {
            items.push(parsed);
          }
        }
      }

      // Card shelf
      const card = section.musicCardShelfRenderer;
      if (card?.contents) {
        for (const itemRenderer of card.contents) {
          const parsed = this.parseResponsiveListItem(itemRenderer.musicResponsiveListItemRenderer);
          if (parsed && !items.some((it) => it.id === parsed.id)) {
            items.push(parsed);
          }
        }
      }

      // Flat itemSectionRenderer
      const itemSection = section.itemSectionRenderer;
      if (itemSection?.contents) {
        for (const subItem of itemSection.contents) {
          const parsed = this.parseResponsiveListItem(subItem.musicResponsiveListItemRenderer);
          if (parsed && !items.some((it) => it.id === parsed.id)) {
            items.push(parsed);
          }
        }
      }
    }

    const continuation = sectionContents[0]?.musicShelfRenderer?.continuations?.[0]?.nextContinuationData?.continuation;
    return { items, continuation };
  }

  /**
   * Convenience search method specifically returning songs.
   */
  static async searchSongs(query: string): Promise<SongItem[]> {
    // "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D" is the filter for songs in YouTube Music
    const result = await this.search(query, "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D");
    return result.items.filter((it): it is SongItem => {
      const vId = (it as any).videoId || it.id;
      return (
        typeof vId === "string" &&
        vId.trim().length === 11 &&
        !vId.startsWith("MP") &&
        !vId.startsWith("UC") &&
        !vId.startsWith("VL")
      );
    });
  }

  /**
   * Get search suggestions for auto-complete.
   */
  static async searchSuggestions(query: string): Promise<SearchSuggestionsResult> {
    const raw = await this.innerTubeInstance.getSearchSuggestions(YouTubeClient.WEB_REMIX, query);
    const contents = raw.contents || [];

    const queries: string[] = [];
    const querySection = contents[0]?.searchSuggestionsSectionRenderer?.contents || [];
    for (const item of querySection) {
      const text = item.searchSuggestionRenderer?.suggestion?.runs?.map((r: any) => r.text).join("");
      if (text) queries.push(text);
    }

    const recommendedItems: SongItem[] = [];
    const itemSection = contents[1]?.searchSuggestionsSectionRenderer?.contents || [];
    for (const item of itemSection) {
      const parsed = this.parseResponsiveListItem(item.musicResponsiveListItemRenderer);
      if (parsed && "artists" in parsed) {
        recommendedItems.push(parsed as SongItem);
      }
    }

    return { queries, recommendedItems };
  }

  /**
   * Fetches song details and metadata.
   */
  static async getSong(videoId: string): Promise<PlayerResponse> {
    return await this.innerTubeInstance.player(YouTubeClient.WEB_REMIX, videoId);
  }

  /**
   * Fetches playlist metadata and song list.
   */
  static async getPlaylist(playlistId: string): Promise<PlaylistPageResult> {
    const cleanId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
    const raw = await this.innerTubeInstance.browse(YouTubeClient.WEB_REMIX, cleanId, undefined, undefined, true);

    const base = raw.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0];
    const header = base?.musicResponsiveHeaderRenderer ||
      base?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer;

    const title = header?.title?.runs?.[0]?.text || "Unknown Playlist";
    const authorText = header?.straplineTextOne?.runs?.[0]?.text;
    const author = authorText ? { name: authorText, id: null } : null;
    const songCountText = header?.secondSubtitle?.runs?.[0]?.text;

    const thumbnails = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
    const thumbnailUrl = this.extractThumbnailUrl(thumbnails);

    const playlist: PlaylistItem = {
      id: playlistId.replace(/^VL/, ""),
      title,
      author,
      songCountText,
      thumbnail: thumbnailUrl,
      explicit: false,
      shareLink: `https://music.youtube.com/playlist?list=${playlistId.replace(/^VL/, "")}`,
    };

    const songs: SongItem[] = [];
    const musicPlaylistShelf = raw.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer ||
      base?.musicPlaylistShelfRenderer;

    const contents = musicPlaylistShelf?.contents || [];
    for (const item of contents) {
      const parsed = this.parseResponsiveListItem(item.musicResponsiveListItemRenderer);
      if (parsed && "artists" in parsed) {
        songs.push(parsed as SongItem);
      }
    }

    const continuation = musicPlaylistShelf?.continuations?.[0]?.nextContinuationData?.continuation;
    return { playlist, songs, continuation };
  }

  /**
   * Resolves and extracts an audio stream URL for playback.
   * Guarantees non-cutoff, validated stream without 403 Forbidden!
   */
  static async getStream(
    videoId: string,
    options: {
      audioQuality?: AudioQuality;
      playlistId?: string | null;
      networkMetered?: boolean;
    } = {}
  ): Promise<PlaybackData> {
    if (!videoId || typeof videoId !== "string" || videoId === "undefined" || videoId.trim().length !== 11) {
      throw new Error(`[YouTube.getStream] Invalid 11-character videoId provided: "${videoId}"`);
    }
    return await YTPlayerUtils.resolvePlaybackData(
      this.innerTubeInstance,
      videoId.trim(),
      options.playlistId,
      options.audioQuality ?? AudioQuality.HIGH,
      options.networkMetered ?? false
    );
  }

  /**
   * Searches and fetches synchronized LRC lyrics for a song.
   */
  static async getLyrics(
    title: string,
    artist: string = "",
    duration?: number,
    videoId?: string
  ): Promise<LyricsResult | null> {
    return await LyricsHelper.getLyrics({
      title,
      artist,
      duration,
      id: videoId,
    });
  }
}
