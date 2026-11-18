// src/renderer/views/SearchView.tsx

import React, { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, Music, Sparkles } from "lucide-react";
import type { Song } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";

interface SearchViewProps {
  onAddToPlaylist: (song: Song) => void;
}

const QUICK_TAGS = [
  "Sơn Tùng M-TP",
  "V-Pop Thịnh Hành",
  "Ballad Việt",
  "Indie Việt",
  "Lofi Chill",
  "Acoustic Nhẹ Nhàng",
  "US-UK Top Hits",
  "Rap Việt",
];

export const SearchView: React.FC<SearchViewProps> = ({ onAddToPlaylist }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim() || !window.mochyApi) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const songs = await window.mochyApi.searchSongs(searchTerm.trim());
      const validSongs = (songs || []).filter((s) => {
        const id = (s as any)?.videoId || s?.id;
        return typeof id === "string" && id.trim().length === 11;
      });
      setResults(validSongs);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (val.trim().length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(val);
      }, 500);
    } else if (val.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    performSearch(query);
  };

  const handleTagClick = (tag: string) => {
    setQuery(tag);
    performSearch(tag);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 select-none">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative max-w-2xl">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 absolute left-4 text-mochy-subtext pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Bạn muốn nghe bài gì? (Tên bài hát, ca sĩ...)"
            autoFocus
            className="w-full h-12 bg-mochy-card border border-mochy-border/80 rounded-xl pl-12 pr-12 text-sm text-white placeholder-mochy-subtext focus:outline-none focus:border-mochy-accent shadow-sm transition-colors"
          />
          {!query && (
            <div className="absolute right-4 pointer-events-none flex items-center gap-1 text-[11px] font-mono text-mochy-subtext border border-white/10 px-1.5 py-0.5 rounded bg-white/5">
              <span>Ctrl</span>
              <span>+</span>
              <span>F</span>
            </div>
          )}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setHasSearched(false);
              }}
              className="absolute right-4 p-1 rounded-md text-mochy-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Quick Discovery Tags */}
      {!hasSearched && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-mochy-subtext uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-mochy-accent" />
            <span>Gợi ý tìm kiếm phổ biến</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="px-3.5 py-1.5 rounded-lg bg-mochy-card border border-mochy-border/60 text-xs font-medium text-mochy-muted hover:text-white hover:bg-mochy-cardHover/80 hover:border-mochy-accent/40 transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-center text-mochy-muted">
          <Loader2 className="w-8 h-8 animate-spin text-mochy-accent mb-3" />
          <span className="text-sm">Đang tìm kiếm bài hát trên YouTube Music...</span>
        </div>
      )}

      {/* Search Results */}
      {!loading && hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white tracking-tight">
              Kết quả cho "{query}" ({results.length} bài)
            </h3>
          </div>

          {results.length > 0 ? (
            <div className="divide-y divide-mochy-border/30">
              {results.map((song, idx) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={idx}
                  playlistContext={results}
                  onAddToPlaylist={onAddToPlaylist}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center text-center text-mochy-subtext">
              <Music className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium text-mochy-muted">
                Không tìm thấy bài hát nào phù hợp
              </p>
              <p className="text-xs text-mochy-subtext mt-1">
                Hãy thử kiểm tra lại chính tả hoặc tìm theo tên ca sĩ khác.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
