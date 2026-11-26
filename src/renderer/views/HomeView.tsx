// src/renderer/views/HomeView.tsx

import React, { useEffect, useState, useMemo } from "react";
import { Play, ChevronRight, MoreHorizontal, Disc, Plus, ListMusic } from "lucide-react";
import { isValidTrackId, type Song, type HistoryItem, type Playlist } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";
import { TrackThumbnail } from "../components/TrackThumbnail.tsx";
import { usePlaylistPicker } from "../components/PlaylistPickerPopover.tsx";

interface HomeViewProps {
  onAddToPlaylist: (song: Song) => void;
  onNavigateSearch: () => void;
  onSelectPlaylist?: (id: string) => void;
  onOpenSpotifyImport?: () => void;
  sidebarExpanded?: boolean;
  playlistRefreshKey?: number;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigateSearch,
  onSelectPlaylist,
  onOpenSpotifyImport,
  sidebarExpanded = false,
  playlistRefreshKey = 0,
}) => {
  const { playSong, resumeData, resumePlayback, openQuickSwitch } = usePlayer();
  const { openPlaylistPicker } = usePlaylistPicker();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    if (!window.mochyApi) return;

    window.mochyApi
      .getHistory(30, 0)
      .then((items) => setHistoryItems(items || []))
      .catch(console.error);

    window.mochyApi
      .getPlaylists()
      .then((pls) => setPlaylists(pls || []))
      .catch(console.error);

    setLoadingTrending(true);
    window.mochyApi
      .searchSongs("Top V-Pop Hits 2026")
      .then((songs) => {
        if (songs && songs.length > 0) {
          setTrendingSongs(songs.filter((s) => isValidTrackId(s.id)).slice(0, 12));
        }
      })
      .catch(console.error)
      .finally(() => setLoadingTrending(false));
  }, []);

  useEffect(() => {
    if (!window.mochyApi || playlistRefreshKey === 0) return;
    window.mochyApi
      .getPlaylists()
      .then((pls) => setPlaylists(pls || []))
      .catch(console.error);
  }, [playlistRefreshKey]);

  // Deduplicated recent songs & most-played aggregation from local history + trending
  const recentSongs = useMemo<Song[]>(() => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const item of historyItems) {
      const s = item.song;
      const sid = s?.id || (s as any)?.videoId || item.songId;
      if (!isValidTrackId(sid) || seen.has(sid)) continue;
      seen.add(sid);
      out.push({
        id: sid,
        videoId: sid,
        title: s?.title || "Unknown Track",
        artists: s?.artists?.length ? s.artists : [{ name: "Unknown" }],
        thumbnail: s?.thumbnail || (s as any)?.thumbnailUrl || null,
        duration: s?.duration,
      });
    }
    return out;
  }, [historyItems]);

  const mostPlayedSongs = useMemo<Song[]>(() => {
    const counts = new Map<string, { song: Song; score: number }>();
    for (const item of historyItems) {
      const s = item.song;
      const sid = s?.id || (s as any)?.videoId || item.songId;
      if (!isValidTrackId(sid)) continue;
      const normalized: Song = {
        id: sid,
        videoId: sid,
        title: s?.title || "Unknown Track",
        artists: s?.artists?.length ? s.artists : [{ name: "Unknown" }],
        thumbnail: s?.thumbnail || (s as any)?.thumbnailUrl || null,
        duration: s?.duration,
      };
      const existing = counts.get(sid);
      if (existing) {
        existing.score += Math.max(1, item.playTime || 1);
      } else {
        counts.set(sid, { song: normalized, score: Math.max(1, item.playTime || 1) });
      }
    }
    const ranked = Array.from(counts.values())
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.song);

    const seen = new Set(ranked.map((s) => s.id));
    for (const t of trendingSongs) {
      if (ranked.length >= 9) break;
      if (!seen.has(t.id)) {
        seen.add(t.id);
        ranked.push(t);
      }
    }
    return ranked.slice(0, 9);
  }, [historyItems, trendingSongs]);

  const heroSlides = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ label: string; song: Song; isResume?: boolean }> = [];
    if (resumeData?.song && isValidTrackId(resumeData.song.id)) {
      seen.add(resumeData.song.id);
      list.push({ label: "On repeat", song: resumeData.song, isResume: true });
    }
    for (const s of [...recentSongs, ...trendingSongs]) {
      if (list.length >= 7) break;
      if (!seen.has(s.id)) {
        seen.add(s.id);
        list.push({ label: "On repeat", song: s });
      }
    }
    return list;
  }, [resumeData, recentSongs, trendingSongs]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIdx((prev) => (prev + 1) % heroSlides.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const safeHeroIdx = heroSlides.length > 0 ? heroIdx % heroSlides.length : 0;
  const activeHero = heroSlides[safeHeroIdx] ?? null;

  const monthLabel = useMemo(() => {
    const d = new Date();
    return `THÁNG ${d.getMonth() + 1} ${d.getFullYear()}`;
  }, []);

  const contentPad = sidebarExpanded ? "pl-[288px] pr-8" : "pl-[96px] pr-8";
  const carouselSongs = recentSongs.length > 0 ? recentSongs : trendingSongs;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a0c] text-[#f5f5f7] select-none pb-12">
      {/* 1. Full-bleed Hero Banner ("On repeat") */}
      <section className="relative w-full h-[360px] lg:h-[400px] overflow-hidden bg-[#121215]">
        <TrackThumbnail
          src={activeHero?.song.thumbnail}
          videoId={activeHero ? activeHero.song.videoId || activeHero.song.id : null}
          alt={activeHero?.song.title || "Tày Music"}
          iconSize="xl"
          className="absolute inset-0 w-full h-full"
          imgClassName="object-cover object-center scale-[1.02] transition-opacity duration-500"
        />

        {/* Cinematic Dark Gradient Scrim fading smoothly into #0a0a0c */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/55 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0c]/85 via-[#0a0a0c]/25 to-transparent" />

        {/* Bottom-left Hero Content + Bottom-right Dots */}
        <div
          className={`relative z-10 h-full flex flex-col justify-end pb-8 pt-20 transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${contentPad}`}
        >
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0 max-w-2xl space-y-2">
              <p className="text-sm font-medium text-white/75 tracking-wide">
                {activeHero ? activeHero.label : "Khám phá âm nhạc"}
              </p>

              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-white tracking-tight leading-[1.1] truncate">
                {activeHero
                  ? `${activeHero.song.title} - ${
                      activeHero.song.artists.map((a) => a.name).join(", ") || "Tày Music"
                    }`
                  : "Tày Music"}
              </h1>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {activeHero ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        activeHero.isResume
                          ? resumePlayback()
                          : playSong(activeHero.song, carouselSongs, null)
                      }
                      className="px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/[0.14] text-white text-sm font-semibold flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-lg"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{activeHero.isResume ? "Tiếp tục nghe" : "Play"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openQuickSwitch(activeHero.song, null)}
                      title="Tìm bản phát khác (YouTube)"
                      className="px-4 py-2 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-md border border-white/[0.10] text-white/80 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                    >
                      Đổi bản phát
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onNavigateSearch}
                    className="px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/[0.14] text-white text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Khám phá nhạc</span>
                  </button>
                )}
              </div>
            </div>

            {/* Pagination Dots */}
            {heroSlides.length > 1 && (
              <div className="flex items-center gap-1.5 flex-shrink-0 pb-1">
                {heroSlides.map((_, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setHeroIdx(idx)}
                    aria-label={`Slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                      idx === safeHeroIdx ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Sections */}
      <div className={`space-y-10 mt-2 transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${contentPad}`}>
        {/* 2. Recently Played / Trending Carousel */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {recentSongs.length > 0 ? "Recently played" : "Thịnh hành hôm nay"}
            </h2>
            <button
              type="button"
              onClick={onNavigateSearch}
              className="text-xs font-medium text-white/55 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Khám phá thêm</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingTrending && carouselSongs.length === 0 ? (
            <div className="flex gap-4 overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="w-40 sm:w-44 aspect-square rounded-[16px] bg-white/[0.06] animate-pulse flex-shrink-0"
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {carouselSongs.map((song) => (
                <div key={song.id} className="w-40 sm:w-44 flex-shrink-0 group">
                  <div className="relative aspect-square rounded-[16px] overflow-hidden bg-[#18181d] border border-white/[0.08] mb-2 shadow-lg">
                    <button
                      type="button"
                      onClick={() => playSong(song, carouselSongs, null)}
                      aria-label={`Phát ${song.title}`}
                      className="w-full h-full block cursor-pointer"
                    >
                      <TrackThumbnail
                        src={song.thumbnail}
                        videoId={song.videoId || song.id}
                        alt={song.title}
                        iconSize="lg"
                        className="w-full h-full"
                        imgClassName="group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                        </span>
                      </span>
                    </button>

                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPlaylistPicker(song, e.currentTarget.getBoundingClientRect());
                        }}
                        title="Thêm vào playlist"
                        aria-label="Thêm vào playlist"
                        className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white/85 hover:text-white flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openQuickSwitch(song, null);
                        }}
                        title="Tìm bản phát khác (YouTube)"
                        aria-label="Tìm bản phát khác"
                        className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white/85 hover:text-white flex items-center justify-center cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[13px] font-semibold text-white truncate">{song.title}</p>
                  <p className="text-xs text-white/55 truncate mt-0.5">
                    {song.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Most Played (3-Column Numbered Ranking Grid) */}
        {mostPlayedSongs.length > 0 && (
          <section className="space-y-3.5">
            <div>
              <p className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">
                {monthLabel}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <h2 className="text-xl font-bold text-white tracking-tight">Most played</h2>
                <ChevronRight className="w-4 h-4 text-white/45" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
              {mostPlayedSongs.map((song, idx) => (
                <div
                  key={`most-${song.id}-${idx}`}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-2xl hover:bg-white/[0.06] transition-colors group"
                >
                  <span className="w-5 text-sm font-bold text-white/55 tabular-nums text-center flex-shrink-0">
                    {idx + 1}
                  </span>

                  <button
                    type="button"
                    onClick={() => playSong(song, mostPlayedSongs, null)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <TrackThumbnail
                      src={song.thumbnail}
                      videoId={song.videoId || song.id}
                      alt={song.title}
                      iconSize="sm"
                      className="w-12 h-12 rounded-xl bg-[#18181d] border border-white/[0.08] flex-shrink-0 relative"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-white truncate">{song.title}</p>
                      <p className="text-xs text-white/55 truncate mt-0.5">
                        {song.artists.map((a) => a.name).join(", ")}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPlaylistPicker(song, e.currentTarget.getBoundingClientRect());
                      }}
                      title="Thêm vào playlist"
                      aria-label="Thêm vào playlist"
                      className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.16] text-white/70 hover:text-white flex items-center justify-center opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => openQuickSwitch(song, null)}
                      title="Tìm bản phát khác (YouTube)"
                      aria-label="Tìm bản phát khác"
                      className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.16] text-white/70 hover:text-white flex items-center justify-center opacity-60 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. Playlists của bạn */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">Playlists của bạn</h2>
            {onOpenSpotifyImport && (
              <button
                type="button"
                onClick={onOpenSpotifyImport}
                className="text-xs font-medium text-white/65 hover:text-white bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nhập từ Spotify</span>
              </button>
            )}
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {playlists.map((pl) => (
              <button
                type="button"
                key={pl.id}
                onClick={() => onSelectPlaylist?.(pl.id)}
                className="w-48 sm:w-52 aspect-square rounded-[20px] overflow-hidden bg-[#18181d] border border-white/[0.08] hover:border-white/[0.22] relative flex-shrink-0 text-left group transition-all cursor-pointer shadow-lg"
              >
                <TrackThumbnail
                  src={pl.thumbnailUrl}
                  alt={pl.name}
                  iconSize="xl"
                  className="absolute inset-0 w-full h-full"
                  imgClassName="group-hover:scale-105 transition-transform duration-300"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                <div className="relative z-10 h-full p-4 flex flex-col justify-end">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                      <p className="text-xs text-white/65 truncate mt-0.5">
                        {pl.songCount || 0} bài hát
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/60 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                  </div>
                </div>
              </button>
            ))}

            {onOpenSpotifyImport && (
              <button
                type="button"
                onClick={onOpenSpotifyImport}
                className="w-48 sm:w-52 aspect-square rounded-[20px] bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.16] flex flex-col items-center justify-center gap-2.5 text-white/65 hover:text-white flex-shrink-0 transition-all cursor-pointer p-4 text-center"
              >
                <span className="w-11 h-11 rounded-full bg-white/[0.10] flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Nhập từ Spotify</p>
                  <p className="text-xs text-white/45 mt-0.5">Đồng bộ playlist nhanh</p>
                </div>
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
