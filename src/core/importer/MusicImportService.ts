// src/core/importer/MusicImportService.ts

import { MochyDatabase } from "../db/MochyDatabase.ts";
import { SpotifyClient } from "./SpotifyClient.ts";
import { TrackMatcher } from "./TrackMatcher.ts";
import type { ImportedTrack, ParsedImport, ImportProgress, SpotifyRemotePlaylist } from "./types.ts";
import type { DbSong } from "../db/types.ts";

export class MusicImportService {
  private static instance: MusicImportService;
  private db: MochyDatabase;
  private matcher: TrackMatcher;
  private isCancelled = false;
  private active = false;

  private constructor(db: MochyDatabase) {
    this.db = db;
    this.matcher = new TrackMatcher();
  }

  static getInstance(db?: MochyDatabase): MusicImportService {
    if (!MusicImportService.instance) {
      if (!db) {
        throw new Error("MusicImportService must be initialized with a MochyDatabase instance");
      }
      MusicImportService.instance = new MusicImportService(db);
    }
    return MusicImportService.instance;
  }

  isRunning(): boolean {
    return this.active;
  }

  cancel(): void {
    if (this.active) {
      this.isCancelled = true;
    }
  }

  /**
   * Import tracks from a parsed public link (e.g. Spotify embed)
   */
  async importFromParsed(
    parsed: ParsedImport,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<{ matched: number; total: number; playlistId?: string }> {
    if (this.active) {
      throw new Error("Một tiến trình nhập nhạc đang chạy. Vui lòng chờ hoàn tất.");
    }

    this.active = true;
    this.isCancelled = false;

    const total = parsed.tracks.length;
    let matchedCount = 0;
    const matchedSongs: Array<{ track: ImportedTrack; song: DbSong }> = [];

    const reportProgress = (
      phase: ImportProgress["phase"],
      current: number,
      currentTrack?: string,
      error?: string
    ) => {
      if (onProgress) {
        onProgress({
          phase,
          total,
          current,
          matched: matchedCount,
          currentTrack,
          playlistName: parsed.title,
          error,
        });
      }
    };

    try {
      reportProgress("matching", 0, "Bắt đầu tìm kiếm...");

      // Match tracks with 250ms delay between requests and retry up to 2 times
      for (let i = 0; i < total; i++) {
        if (this.isCancelled) {
          throw new Error("Tiến trình đã bị người dùng hủy.");
        }

        const track = parsed.tracks[i];
        reportProgress("matching", i + 1, `${track.title} - ${track.artist}`);

        let matchedItem = null;
        let lastErr: any = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            matchedItem = await this.matcher.match(track);
            break;
          } catch (err: any) {
            lastErr = err;
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }

        if (matchedItem) {
          matchedCount++;
          const dbSong: DbSong = {
            id: matchedItem.id,
            title: matchedItem.title,
            artists: matchedItem.artists || [{ name: track.artist, id: null }],
            duration: matchedItem.duration ?? (track.durationMs ? Math.round(track.durationMs / 1000) : -1),
            thumbnailUrl: matchedItem.thumbnail || track.thumbnailUrl || null,
            albumName: matchedItem.album?.name || track.album || null,
            explicit: matchedItem.explicit,
            inLibrary: Date.now(),
          };
          matchedSongs.push({ track, song: dbSong });
        } else if (lastErr) {
          console.warn(`[MusicImportService] Failed to match "${track.title}":`, lastErr.message);
        }

        // 250ms delay between requests to avoid rate limits
        if (i < total - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      if (this.isCancelled) {
        throw new Error("Tiến trình đã bị người dùng hủy.");
      }

      // Step 2: Save to SQLite database
      reportProgress("saving", total, "Đang lưu vào thư viện...");

      let playlistId: string | undefined;

      if (parsed.type === "playlist" || parsed.type === "album") {
        // Check if playlist with same name already exists
        let playlist = this.db.findPlaylistByName(parsed.title);
        if (!playlist) {
          playlist = this.db.createPlaylist(
            parsed.title,
            `Nhập từ Spotify (${parsed.type})`,
            parsed.coverUrl
          );
        }
        playlistId = playlist.id;

        for (const item of matchedSongs) {
          this.db.upsertSong(item.song);
          this.db.addSongToPlaylist(playlistId, item.song.id);
        }
      } else {
        // Individual track
        for (const item of matchedSongs) {
          this.db.upsertSong(item.song);
        }
      }

      reportProgress("done", total, "Hoàn tất!");
      return { matched: matchedCount, total, playlistId };
    } catch (error: any) {
      reportProgress("error", total, undefined, error.message || "Lỗi không xác định khi nhập");
      throw error;
    } finally {
      this.active = false;
      this.isCancelled = false;
    }
  }

  /**
   * Import or sync a Spotify remote playlist or Liked Songs
   */
  async importFromSpotifyRemote(
    accessToken: string,
    remote: SpotifyRemotePlaylist,
    onProgress?: (progress: ImportProgress) => void
  ): Promise<{ matched: number; total: number; playlistId?: string }> {
    if (this.active) {
      throw new Error("Một tiến trình nhập nhạc đang chạy. Vui lòng chờ hoàn tất.");
    }

    this.active = true;
    this.isCancelled = false;

    const reportProgress = (
      phase: ImportProgress["phase"],
      total: number,
      current: number,
      matched: number,
      currentTrack?: string,
      error?: string
    ) => {
      if (onProgress) {
        onProgress({
          phase,
          total,
          current,
          matched,
          currentTrack,
          playlistName: remote.name,
          error,
        });
      }
    };

    try {
      reportProgress("fetching", remote.trackCount, 0, 0, "Đang tải danh sách từ Spotify...");

      const tracks = await SpotifyClient.getPlaylistTracks(
        accessToken,
        remote.id,
        (loaded, totalExpected) => {
          reportProgress("fetching", totalExpected, loaded, 0, `Đã tải ${loaded} bài hát...`);
        }
      );

      if (this.isCancelled) {
        throw new Error("Tiến trình đã bị hủy.");
      }

      const total = tracks.length;
      let matchedCount = 0;
      const matchedSongs: Array<{ track: ImportedTrack; song: DbSong }> = [];

      reportProgress("matching", total, 0, 0, "Bắt đầu đối soát...");

      for (let i = 0; i < total; i++) {
        if (this.isCancelled) {
          throw new Error("Tiến trình đã bị người dùng hủy.");
        }

        const track = tracks[i];
        reportProgress("matching", total, i + 1, matchedCount, `${track.title} - ${track.artist}`);

        let matchedItem = null;
        let lastErr: any = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            matchedItem = await this.matcher.match(track);
            break;
          } catch (err: any) {
            lastErr = err;
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }

        if (matchedItem) {
          matchedCount++;
          const dbSong: DbSong = {
            id: matchedItem.id,
            title: matchedItem.title,
            artists: matchedItem.artists || [{ name: track.artist, id: null }],
            duration: matchedItem.duration ?? (track.durationMs ? Math.round(track.durationMs / 1000) : -1),
            thumbnailUrl: matchedItem.thumbnail || track.thumbnailUrl || null,
            albumName: matchedItem.album?.name || track.album || null,
            explicit: matchedItem.explicit,
            inLibrary: Date.now(),
          };
          matchedSongs.push({ track, song: dbSong });
        } else if (lastErr) {
          console.warn(`[MusicImportService] Failed to match "${track.title}":`, lastErr.message);
        }

        // 250ms delay between requests to avoid rate limits
        if (i < total - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      reportProgress("saving", total, total, matchedCount, "Đang lưu bài hát...");

      let playlistId: string | undefined;

      if (remote.isLiked) {
        // Liked Songs
        for (const item of matchedSongs) {
          this.db.upsertSong(item.song);
          this.db.setLiked(item.song.id, true, item.song);
        }
      } else {
        // Regular Playlist
        let playlist = this.db.findPlaylistByName(remote.name);
        if (!playlist) {
          playlist = this.db.createPlaylist(
            remote.name,
            `Đồng bộ từ Spotify (${remote.ownerName ? `bởi ${remote.ownerName}` : "Playlist cá nhân"})`,
            remote.coverUrl
          );
        }
        playlistId = playlist.id;

        for (const item of matchedSongs) {
          this.db.upsertSong(item.song);
          this.db.addSongToPlaylist(playlistId, item.song.id);
        }
      }

      reportProgress("done", total, total, matchedCount, "Hoàn tất!");
      return { matched: matchedCount, total, playlistId };
    } catch (error: any) {
      reportProgress("error", 0, 0, 0, undefined, error.message || "Lỗi không xác định khi nhập");
      throw error;
    } finally {
      this.active = false;
      this.isCancelled = false;
    }
  }
}
