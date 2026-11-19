// src/renderer/views/HomeView.tsx

import React, { useEffect, useState } from "react";
import { Play, Flame, History, Disc, Terminal, Radio, Sparkles } from "lucide-react";
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
  const [typewriterText, setTypewriterText] = useState("");

  const fullPrompt = "SYSTEM ONLINE // REPOSITORY CONNECTED // HIGH-BITRATE STREAM READY...";

  // Minimal Typewriter effect on mount
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= fullPrompt.length) {
        setTypewriterText(fullPrompt.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 28);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Fetch recent history from SQLite
    if (window.mochyApi) {
      window.mochyApi
        .getHistory(10, 0)
        .then((items) => {
          setHistoryItems(items);
        })
        .catch(console.error);

      // 2. Fetch popular songs from YouTube Music
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
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none font-sans">
      {/* Cyber-Terminal Banner */}
      <div className="relative rounded-xs bg-[#13161c] border border-[#242a35] p-6 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        {/* Subtle cyan corner notches */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#00f0ff]" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#00f0ff]" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00f0ff]" />

        <div className="relative z-10 max-w-2xl">
          {/* Typewriter Terminal Prompt */}
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xs bg-[#0d0f12] text-[#00ff9d] text-[10px] font-mono font-bold tracking-widest mb-3 border border-[#00ff9d]/30 shadow-[0_0_8px_rgba(0,255,157,0.1)]">
            <Terminal className="w-3 h-3 text-[#00ff9d]" />
            <span>&gt; {typewriterText}</span>
            <span className="w-1.5 h-3 bg-[#00ff9d] inline-block animate-cursor" />
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
            TÀY MUSIC // <span className="text-[#00f0ff]">TERMINAL STAGE</span>
          </h2>

          <p className="text-xs text-[#8492a6] font-mono mt-1.5 leading-relaxed">
            Chunked ExoPlayer Proxy • Đồng bộ lời bài hát LRC thời gian thực • SQLite Offline Database
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onNavigateSearch}
              className="px-4 py-2 rounded-xs bg-[#00f0ff] hover:bg-[#33f3ff] text-black font-mono font-bold text-xs tracking-wider uppercase transition-all shadow-[0_0_12px_rgba(0,240,255,0.35)] cursor-pointer active:scale-95 flex items-center gap-2"
            >
              <span>[ EXECUTE SEARCH ]</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recently Played (History Grid) */}
      {historyItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#242a35] pb-2">
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-white tracking-wider">
              <History className="w-4 h-4 text-[#00f0ff]" />
              <span>// RECENT_TRANSMISSIONS</span>
            </div>
            <span className="text-[10px] font-mono text-[#444c5c]">
              [{historyItems.length} RECORDS]
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                  title: item.song?.title || "Unknown Track",
                  artists: item.song?.artists?.length ? item.song.artists : [{ name: "Unknown" }],
                  thumbnail: item.song?.thumbnail || (item.song as any)?.thumbnailUrl,
                  duration: item.song?.duration,
                };

                return (
                  <div
                    key={`${item.id}-${item.songId}`}
                    onClick={() => playSong(song)}
                    className="group p-2.5 rounded-xs bg-[#13161c] border border-[#242a35] hover:border-[#00f0ff]/50 hover:bg-[#181c24] transition-all cursor-pointer flex flex-col relative shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
                  >
                    <div className="relative w-full aspect-square rounded-xs overflow-hidden bg-[#0d0f12] mb-2.5 flex-shrink-0 border border-[#242a35]">
                      {song.thumbnail ? (
                        <img
                          src={song.thumbnail}
                          alt={song.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-6 h-6 text-[#444c5c]" />
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playSong(song);
                        }}
                        className="absolute bottom-2 right-2 w-8 h-8 rounded-xs bg-[#00f0ff] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-[0_0_10px_rgba(0,240,255,0.5)] hover:scale-110 active:scale-95"
                      >
                        <Play className="w-4 h-4 fill-black ml-0.5" />
                      </button>
                    </div>

                    <p className="text-xs font-bold text-white truncate" title={song.title}>
                      {song.title}
                    </p>
                    <p className="text-[11px] text-[#8492a6] truncate mt-0.5">
                      {song.artists.map((a) => a.name).join(", ")}
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Trending / Recommended Songs - Cyber HUD Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#242a35] pb-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-white tracking-wider">
            <Flame className="w-4 h-4 text-[#00ff9d]" />
            <span>// TOP_CHARTS // V-POP_MAINSTREAM</span>
          </div>
          <span className="text-[10px] font-mono text-[#00ff9d] bg-[#00ff9d]/10 px-1.5 py-0.5 rounded-xs border border-[#00ff9d]/30 font-semibold">
            FEED: ACTIVE
          </span>
        </div>

        {/* Table Header Bar */}
        <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider border-b border-[#242a35]/60">
          <span className="w-7 text-center">#</span>
          <span className="w-9" />
          <span className="flex-1">Track / Artist</span>
          <span className="w-12 text-right">Length</span>
          <span className="w-20 text-right">Action</span>
        </div>

        {loadingTrending ? (
          <div className="space-y-1.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-11 rounded-xs bg-[#13161c] border border-[#242a35]/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
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
