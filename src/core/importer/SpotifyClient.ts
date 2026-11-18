// src/core/importer/SpotifyClient.ts

import type { ImportedTrack, ParsedImport, SpotifyAccountInfo, SpotifyRemotePlaylist } from "./types.ts";

const SPOTIFY_LINK_REGEX =
  /(?:open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]{22})/;

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class SpotifyClient {
  private static readonly API_BASE = "https://api.spotify.com/v1";

  /**
   * Parse a Spotify public link (playlist, album, track) and fetch tracks.
   * If an accessToken is provided, paginates via official Web API.
   * If onScrapeMore is provided and tracks hit the 100 limit, fetches remaining tracks.
   */
  static async parsePublicLink(
    url: string,
    accessToken?: string,
    onScrapeMore?: (id: string) => Promise<ImportedTrack[]>
  ): Promise<ParsedImport> {
    const trimmed = url.trim();
    const match = trimmed.match(SPOTIFY_LINK_REGEX);
    if (!match) {
      throw new Error("Link không hợp lệ. Vui lòng dán link playlist hoặc album Spotify hợp lệ.");
    }

    const [, type, id] = match;

    // 1. If accessToken is provided and type is playlist, try official API with pagination first
    if (accessToken && type === "playlist") {
      try {
        const metaRes = await fetch(`${this.API_BASE}/playlists/${id}?fields=name,description,images`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const name = meta.name || `Spotify Playlist`;
          let coverUrl: string | null = null;
          if (Array.isArray(meta.images) && meta.images.length > 0) {
            coverUrl = meta.images[0].url;
          }

          const tracks = await this.getPlaylistTracks(accessToken, id);

          return {
            type: "playlist",
            id,
            title: name,
            subtitle: meta.description || null,
            coverUrl,
            tracks,
            total: tracks.length,
            sourceUrl: `https://open.spotify.com/playlist/${id}`,
          };
        }
      } catch (err: any) {
        console.warn("[SpotifyClient] Fetch via accessToken failed, falling back to embed:", err.message);
      }
    }

    // 2. Fetch from embed
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("Không tìm thấy Playlist/Album này. Vui lòng đảm bảo nó ở chế độ Công khai (Public).");
      }
      throw new Error(`Spotify phản hồi lỗi HTTP ${res.status}.`);
    }

    const html = await res.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!nextDataMatch || !nextDataMatch[1]) {
      throw new Error("Không thể đọc dữ liệu trang Spotify. Vui lòng kiểm tra lại đường dẫn.");
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(nextDataMatch[1]);
    } catch {
      throw new Error("Lỗi phân tích cú pháp dữ liệu từ Spotify.");
    }

    const entity = parsedJson?.props?.pageProps?.state?.data?.entity;
    if (!entity) {
      throw new Error("Playlist hoặc Album Spotify này có thể đang ở chế độ riêng tư hoặc không tồn tại.");
    }

    const name: string = entity.name || entity.title || `Spotify ${type}`;
    const subtitle: string | null = entity.subtitle || entity.type || null;

    // Cover image: pick source with largest width
    let coverUrl: string | null = null;
    const sources = entity.coverArt?.sources || [];
    if (Array.isArray(sources) && sources.length > 0) {
      const sorted = [...sources].sort((a, b) => (b.width || 0) - (a.width || 0));
      coverUrl = sorted[0].url || null;
    }

    const rawTracks: any[] = Array.isArray(entity.trackList) ? entity.trackList : [];
    const tracks: ImportedTrack[] = [];
    const seenUris = new Set<string>();

    for (const t of rawTracks) {
      if (!t || !t.title) continue;
      const uri = typeof t.uri === "string" && t.uri.startsWith("spotify:track:") ? t.uri : null;
      if (uri) seenUris.add(uri);
      tracks.push({
        title: t.title,
        artist: (t.subtitle || "").replace(/\u00A0/g, " ").trim(),
        album: type === "album" ? name : null,
        durationMs: typeof t.duration === "number" ? t.duration : null,
        sourceId: uri,
      });
    }

    // 3. If playlist hits the 100 track limit of Embed and onScrapeMore is provided, fetch the rest
    if (type === "playlist" && tracks.length >= 100 && onScrapeMore) {
      try {
        console.log("[SpotifyClient] Playlist has >= 100 tracks, fetching remaining tracks...");
        const extraTracks = await onScrapeMore(id);
        for (const extra of extraTracks) {
          if (extra.sourceId && !seenUris.has(extra.sourceId)) {
            seenUris.add(extra.sourceId);
            tracks.push(extra);
          } else if (!extra.sourceId && !tracks.some((t) => t.title.toLowerCase() === extra.title.toLowerCase())) {
            tracks.push(extra);
          }
        }
        console.log(`[SpotifyClient] Expanded playlist to ${tracks.length} tracks.`);
      } catch (err: any) {
        console.warn("[SpotifyClient] Scrape remaining tracks error:", err.message);
      }
    }

    if (tracks.length === 0 && type !== "track") {
      throw new Error("Không tìm thấy bài hát nào trong playlist hoặc album này.");
    }

    return {
      type: type as "playlist" | "album" | "track",
      id,
      title: name,
      subtitle,
      coverUrl,
      tracks,
      total: tracks.length,
      sourceUrl: `https://open.spotify.com/${type}/${id}`,
    };
  }

  /**
   * Fetch current user profile via Spotify Web API
   */
  static async getMe(accessToken: string): Promise<SpotifyAccountInfo> {
    const res = await fetch(`${this.API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Lỗi xác thực Spotify (${res.status}): Token có thể đã hết hạn.`);
    }

    const data = await res.json();
    let photoUrl: string | undefined;
    if (Array.isArray(data.images) && data.images.length > 0) {
      photoUrl = data.images[0].url;
    }

    return {
      id: data.id,
      displayName: data.display_name || data.id,
      email: data.email,
      photoUrl,
      accessToken,
    };
  }

  /**
   * Fetch user playlists and Liked Songs summary
   */
  static async getUserPlaylists(accessToken: string): Promise<SpotifyRemotePlaylist[]> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const result: SpotifyRemotePlaylist[] = [];

    // 1. Get Liked Songs count
    try {
      const likedRes = await fetch(`${this.API_BASE}/me/tracks?limit=1`, { headers });
      if (likedRes.ok) {
        const likedData = await likedRes.json();
        const likedTotal = likedData.total || 0;
        if (likedTotal > 0) {
          result.push({
            id: "spotify:liked",
            name: "Liked Songs (Bài hát đã thích)",
            trackCount: likedTotal,
            isLiked: true,
            coverUrl: "https://misc.scdn.co/liked-songs/liked-songs-640.png",
          });
        }
      }
    } catch {
      // Continue even if liked songs check fails
    }

    // 2. Paginate user playlists
    let nextUrl: string | null = `${this.API_BASE}/me/playlists?limit=50`;
    let pages = 0;

    while (nextUrl && pages < 10) {
      pages++;
      const res = await fetch(nextUrl, { headers });
      if (!res.ok) break;

      const pageData = await res.json();
      const items = Array.isArray(pageData.items) ? pageData.items : [];

      for (const item of items) {
        if (!item || !item.id) continue;
        const count = item.tracks?.total ?? item.items?.total ?? 0;
        let cover: string | null = null;
        if (Array.isArray(item.images) && item.images.length > 0) {
          cover = item.images[0].url;
        }

        result.push({
          id: item.id,
          name: item.name || "Danh sách phát chưa đặt tên",
          trackCount: count,
          coverUrl: cover,
          isLiked: false,
          ownerName: item.owner?.display_name || null,
        });
      }

      nextUrl = typeof pageData.next === "string" ? pageData.next : null;
    }

    return result;
  }

  /**
   * Fetch all tracks for a given playlist or Liked Songs
   */
  static async getPlaylistTracks(
    accessToken: string,
    playlistId: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<ImportedTrack[]> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };

    const isLiked = playlistId === "spotify:liked";
    let nextUrl: string | null = isLiked
      ? `${this.API_BASE}/me/tracks?limit=50`
      : `${this.API_BASE}/playlists/${playlistId}/tracks?limit=100`;

    const tracks: ImportedTrack[] = [];
    let pages = 0;
    let totalExpected = 0;

    while (nextUrl && pages < 50) {
      pages++;
      let res = await fetch(nextUrl, { headers });

      // If /tracks returned 404, try /items (newer API endpoint)
      if (res.status === 404 && !isLiked && nextUrl.includes("/tracks?")) {
        nextUrl = `${this.API_BASE}/playlists/${playlistId}/items?limit=100`;
        res = await fetch(nextUrl, { headers });
      }

      if (!res.ok) break;

      const pageData = await res.json();
      if (totalExpected === 0 && typeof pageData.total === "number") {
        totalExpected = pageData.total;
      }

      const items = Array.isArray(pageData.items) ? pageData.items : [];

      for (const entry of items) {
        if (!entry) continue;
        const trackObj = entry.track || entry.item;
        if (!trackObj || trackObj.type === "episode") continue; // Skip podcasts

        const title = trackObj.name;
        if (!title) continue;

        const artists = Array.isArray(trackObj.artists)
          ? trackObj.artists.map((a: any) => a.name).filter(Boolean).join(", ")
          : "";

        let thumb: string | null = null;
        if (Array.isArray(trackObj.album?.images) && trackObj.album.images.length > 0) {
          thumb = trackObj.album.images[0].url;
        }

        tracks.push({
          title,
          artist: artists,
          album: trackObj.album?.name || null,
          durationMs: typeof trackObj.duration_ms === "number" ? trackObj.duration_ms : null,
          thumbnailUrl: thumb,
          sourceId: trackObj.id ? `spotify:track:${trackObj.id}` : null,
          addedAtMs: entry.added_at ? new Date(entry.added_at).getTime() : null,
        });
      }

      if (onProgress) {
        onProgress(tracks.length, totalExpected || tracks.length);
      }

      nextUrl = typeof pageData.next === "string" ? pageData.next : null;
    }

    return tracks;
  }
}
