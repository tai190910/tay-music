// src/renderer/views/SearchView.tsx

import React, { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, Music, Terminal, Sparkles } from "lucide-react";
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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans">
      {/* Search Input Bar - Cyber Terminal Style */}
      <form onSubmit={handleSubmit} className="relative max-w-2xl">
        <div className="relative flex items-center bg-[#13161c] border border-[#242a35] focus-within:border-[#00f0ff]/60 focus-within:shadow-[0_0_15px_rgba(0,240,255,0.15)] rounded-xs transition-all">
          <div className="pl-3.5 pr-2 text-[#00f0ff] font-mono text-xs flex items-center gap-1.5 select-none">
            <Terminal className="w-3.5 h-3.5" />
            <span className="font-bold">&gt;</span>
          </div>

          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Nhập tên bài hát, nghệ sĩ hoặc từ khóa cần tìm..."
            autoFocus
            className="w-full h-11 bg-transparent text-xs text-white placeholder-[#444c5c] font-mono focus:outline-none pr-12"
          />

          {!query && (
            <div className="absolute right-3 pointer-events-none flex items-center gap-1 text-[9px] font-mono text-[#8492a6] border border-[#242a35] px-1.5 py-0.5 rounded-xs bg-[#0d0f12]">
              <span>CTRL+F</span>
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
              className="absolute right-3 p-1 rounded-xs text-[#8492a6] hover:text-[#ff3366]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Quick Discovery Tags */}
      {!hasSearched && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#00f0ff]" />
            <span>// SUGGESTED_QUERIES</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="px-3 py-1.5 rounded-xs bg-[#13161c] border border-[#242a35] text-[11px] font-mono text-[#8492a6] hover:text-[#00f0ff] hover:border-[#00f0ff]/40 hover:bg-[#181c24] transition-all cursor-pointer shadow-sm"
              >
                [#{tag.replace(/\s+/g, "_")}]
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results Area */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-xs font-mono text-[#00f0ff]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>QUERYING_INNERTUBE_STREAM_DATABASE...</span>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <div className="text-center py-16 text-[#444c5c] font-mono text-xs">
          <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>// ZERO_RECORDS_FOUND: Thử lại với từ khóa khác</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#242a35] pb-2 text-[10px] font-mono text-[#8492a6]">
            <span>// QUERY_OUTPUT: {results.length} KẾT QUẢ CHO "{query}"</span>
            <span className="text-[#00ff9d]">STATUS: OK_200</span>
          </div>

          {/* Table Header Bar */}
          <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#444c5c] uppercase tracking-wider border-b border-[#242a35]/60">
            <span className="w-7 text-center">#</span>
            <span className="w-9" />
            <span className="flex-1">Track / Artist</span>
            <span className="w-12 text-right">Length</span>
            <span className="w-20 text-right">Action</span>
          </div>

          <div className="space-y-1">
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
        </div>
      )}
    </div>
  );
};
