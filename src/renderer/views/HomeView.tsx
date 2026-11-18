// src/renderer/views/HomeView.tsx

import React, { useEffect, useState } from "react";
import { Play, Flame, History, Heart, Disc, Sparkles } from "lucide-react";
import type { Song, HistoryItem } from "../types.ts";
import { usePlayer } from "../context/PlayerContext.tsx";
import { SongRow } from "../components/SongRow.tsx";

interface HomeViewProps {
  onAddToPlaylist: (song: Song) => void;
  onNavigateSearch: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onAddToPlaylist, onNavigateSearch }) => {
  const { playSong } = usePlayer();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);

  useEffect(() => {
    // 1. Fetch recent history from SQLite
    if (window.mochyApi) {
      window.mochyApi
        .getHistory(10, 0)
        .then((items) => {
          setHistoryItems(items);
        })
        .catch(console.error);

      // 2. Fetch some popular songs from YouTube Music
      setLoadingTrending(true);
      window.mochyApi
        .searchSongs("Top V-Pop Hits 2026")
        .then((songs) => {
          if (songs && songs.length > 0) {
            setTrendingSongs(songs.slice(0, 10));
          }
        })
        .catch(console.error)
        .finally(() => setLoadingTrending(false));
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 select-none">
      {/* Welcome Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-rose-900/40 via-purple-900/20 to-mochy-bg border border-mochy-border/80 p-8 overflow-hidden">
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mochy-accent/20 text-mochy-accent text-xs font-semibold uppercase tracking-wider mb-4 border border-mochy-accent/30">
            <Sparkles className="w-3.5 h-3.5" />
            Tày Music Desktop
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight leading-tight">
            Khám phá & thưởng thức âm nhạc không giới hạn
          </h2>
          <p className="text-sm text-mochy-muted mt-2">
            Nghe trực tiếp chất lượng cao từ YouTube Music, đồng bộ lời bài hát karaoke thời gian thực và quản lý thư viện cục bộ với SQLite.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={onNavigateSearch}
              className="px-5 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:scale-105 active:scale-95 transition-all shadow-md"
            >
              Tìm kiếm bài hát
            </button>
          </div>
        </div>
      </div>

      {/* Recently Played Section (From SQLite) */}
      {historyItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-mochy-accent" />
            <h3 className="text-lg font-bold text-white tracking-tight">Nghe gần đây</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {historyItems
              .filter((item) => {
                const vid = item.song?.id || (item.song as any)?.videoId || item.songId;
                return typeof vid === "string" && vid.trim().length === 11;
              })
              .slice(0, 5)
              .map((item) => {
                const validId = (item.song?.id || (item.song as any)?.videoId || item.songId).trim();
                const song: Song = {
                  id: validId,
                  videoId: validId,
                  title: item.song?.title || "Bài hát đã nghe",
                  artists: item.song?.artists?.length ? item.song.artists : [{ name: "Nghệ sĩ" }],
                  thumbnail: item.song?.thumbnail || (item.song as any)?.thumbnailUrl,
                  duration: item.song?.duration,
                };

              return (
                <div
                  key={`${item.id}-${item.songId}`}
                  onClick={() => playSong(song)}
                  className="group p-3 rounded-xl bg-mochy-card border border-mochy-border/60 hover:bg-mochy-cardHover/80 transition-all cursor-pointer flex flex-col"
                >
                  <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-mochy-bg mb-3 flex-shrink-0 shadow-sm">
                    {song.thumbnail ? (
                      <img
                        src={song.thumbnail}
                        alt={song.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-8 h-8 text-mochy-subtext" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playSong(song);
                      }}
                      className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-mochy-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-2 transition-all shadow-lg hover:scale-110 active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </button>
                  </div>

                  <p className="text-sm font-semibold text-white truncate" title={song.title}>
                    {song.title}
                  </p>
                  <p className="text-xs text-mochy-muted truncate mt-0.5">
                    {song.artists.map((a) => a.name).join(", ")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Trending / Recommended Songs */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-mochy-accent" />
          <h3 className="text-lg font-bold text-white tracking-tight">Thịnh hành hôm nay</h3>
        </div>

        {loadingTrending ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-mochy-card/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-mochy-border/30">
            {trendingSongs
              .filter((song) => typeof song.id === "string" && song.id.trim().length === 11)
              .map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={trendingSongs}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
          </div>
        )}
      </section>
    </div>
  );
};
