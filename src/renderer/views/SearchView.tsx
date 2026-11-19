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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none font-sans bg-[#090d14]">
      {/* Search Input Bar - Retro-RPG Terminal Style */}
      <form onSubmit={handleSubmit} className="relative max-w-2xl">
        <div className="relative flex items-center bg-[#0f151f] border border-[#1e293b] focus-within:border-[#2589f5] focus-within:shadow-[0_0_12px_rgba(37,137,245,0.2)] rounded-md transition-all">
          <div className="pl-3.5 pr-2 text-[#2ecc71] font-mono text-xs flex items-center gap-1.5 select-none">
            <Terminal className="w-3.5 h-3.5" />
            <span className="font-bold">&gt;</span>
          </div>

          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Nhập tên bài hát, nghệ sĩ hoặc từ khóa cần tìm..."
            autoFocus
            className="w-full h-11 bg-transparent text-xs text-white placeholder-[#475569] font-mono focus:outline-none pr-12"
          />

          {!query && (
            <div className="absolute right-3 pointer-events-none flex items-center gap-1 text-[9px] font-mono text-[#8492a6] border border-[#1e293b] px-1.5 py-0.5 rounded-xs bg-[#090d14]">
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
              className="absolute right-3 p-1 rounded-xs text-[#8492a6] hover:text-[#e74c3c]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Quick Discovery Tags */}
      {!hasSearched && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#475569] uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[#2589f5]" />
            <span>// GỢI Ý TỪ KHÓA TÌM KIẾM</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="px-3 py-1.5 rounded-md bg-[#0f151f] border border-[#1e293b] text-[11px] font-mono text-[#8492a6] hover:text-[#2589f5] hover:border-[#2589f5] hover:bg-[#16202e] transition-all cursor-pointer shadow-xs"
              >
                [#{tag.replace(/\s+/g, "_")}]
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results Area */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-xs font-mono text-[#2589f5]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>ĐANG_TRUY_VẤN_KHO_BÀI_HÁT...</span>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && (
        <div className="text-center py-16 text-[#475569] font-mono text-xs">
          <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>// KHÔNG TÌM THẤY KẾT QUẢ PHÙ HỢP</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2 text-[10px] font-mono text-[#8492a6]">
            <span>// KẾT QUẢ TÌM KIẾM: {results.length} BÀI HÁT CHO "{query}"</span>
            <span className="text-[#2ecc71] font-bold">STATUS: OK_200</span>
          </div>

          {/* Table Header Bar */}
          <div className="flex items-center gap-3.5 px-3 py-1.5 text-[10px] font-mono text-[#475569] uppercase tracking-wider border-b border-[#1e293b]/60">
            <span className="w-7 text-center">#</span>
            <span className="w-9" />
            <span className="flex-1">Tên bài hát / Ca sĩ</span>
            <span className="w-12 text-right">Thời lượng</span>
            <span className="w-20 text-right">Thao tác</span>
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
