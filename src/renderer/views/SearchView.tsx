// src/renderer/views/SearchView.tsx

import React, { useState, useRef } from "react";
import {
  Search,
  X,
  Loader2,
  Music,
  Headphones,
  Flame,
  Disc3,
  Globe,
  Coffee,
  Radio,
  Sparkles,
  Moon,
  Zap,
  Mic,
  Gamepad2,
} from "lucide-react";
import { isValidTrackId, type Song } from "../types.ts";
import { SongRow } from "../components/SongRow.tsx";

interface SearchViewProps {
  onAddToPlaylist: (song: Song) => void;
  sidebarExpanded?: boolean;
}

interface MoodCard {
  id: string;
  label: string;
  subtitle: string;
  query: string;
  gradient: string;
  icon: React.ReactNode;
}

const MOOD_MOMENTS: MoodCard[] = [
  {
    id: "chill",
    label: "Chill & Lofi",
    subtitle: "Nhạc thư giãn nhẹ nhàng",
    query: "Lofi Chill Việt",
    gradient: "from-[#1e2d3b] via-[#17212b] to-[#11151b]",
    icon: <Coffee className="w-5 h-5 text-sky-300" />,
  },
  {
    id: "vpop",
    label: "V-Pop Thịnh Hành",
    subtitle: "Bảng xếp hạng Việt Nam",
    query: "V-Pop Thịnh Hành 2026",
    gradient: "from-[#3a1f28] via-[#27161c] to-[#141115]",
    icon: <Flame className="w-5 h-5 text-rose-300" />,
  },
  {
    id: "remix",
    label: "Remix & DJ",
    subtitle: "Sôi động, Vinahouse, Club Mix",
    query: "Nhạc Trẻ Remix DJ",
    gradient: "from-[#2f233b] via-[#201929] to-[#131218]",
    icon: <Disc3 className="w-5 h-5 text-violet-300" />,
  },
  {
    id: "cjk",
    label: "Nhạc Trung",
    subtitle: "Cổ phong, Ballad & Douyin Remix",
    query: "Nhạc Hoa Remix Douyin",
    gradient: "from-[#3b281c] via-[#281c15] to-[#151211]",
    icon: <Sparkles className="w-5 h-5 text-amber-300" />,
  },
  {
    id: "indie",
    label: "Indie Việt",
    subtitle: "Giai điệu mộc mạc tự sự",
    query: "Indie Việt hay nhất",
    gradient: "from-[#1c332d] via-[#152420] to-[#101614]",
    icon: <Headphones className="w-5 h-5 text-emerald-300" />,
  },
  {
    id: "acoustic",
    label: "Acoustic Cafe",
    subtitle: "Guitar & Piano êm dịu",
    query: "Acoustic Nhẹ Nhàng",
    gradient: "from-[#332c1d] via-[#231f16] to-[#141310]",
    icon: <Music className="w-5 h-5 text-yellow-200" />,
  },
  {
    id: "usuk",
    label: "US-UK Top Hits",
    subtitle: "Pop, R&B quốc tế chọn lọc",
    query: "US-UK Pop Hits",
    gradient: "from-[#1d283d] via-[#161e2c] to-[#101319]",
    icon: <Globe className="w-5 h-5 text-blue-300" />,
  },
  {
    id: "ballad",
    label: "Ballad Việt",
    subtitle: "Những bản tình ca sâu lắng",
    query: "Ballad Việt buồn",
    gradient: "from-[#2c2533] via-[#1e1a24] to-[#121116]",
    icon: <Radio className="w-5 h-5 text-pink-300" />,
  },
  {
    id: "focus",
    label: "Focus & Study",
    subtitle: "Tập trung làm việc sâu",
    query: "Study Beats Instrumental",
    gradient: "from-[#1b2c30] via-[#142023] to-[#101416]",
    icon: <Zap className="w-5 h-5 text-teal-300" />,
  },
  {
    id: "rap",
    label: "Rap Việt",
    subtitle: "Hip-Hop & Melodic Rap",
    query: "Rap Việt",
    gradient: "from-[#36221f] via-[#261816] to-[#141111]",
    icon: <Mic className="w-5 h-5 text-orange-300" />,
  },
  {
    id: "gaming",
    label: "Gaming & EDM",
    subtitle: "Năng lượng cao cho chiến game",
    query: "EDM Gaming Hits",
    gradient: "from-[#1d2638] via-[#161c28] to-[#101218]",
    icon: <Gamepad2 className="w-5 h-5 text-indigo-300" />,
  },
  {
    id: "latenight",
    label: "Đêm Muộn",
    subtitle: "Giai điệu nhẹ cho giấc ngủ",
    query: "Nhạc Chill Đêm Khuya",
    gradient: "from-[#222230] via-[#181822] to-[#101015]",
    icon: <Moon className="w-5 h-5 text-slate-300" />,
  },
];

export const SearchView: React.FC<SearchViewProps> = ({
  onAddToPlaylist,
  sidebarExpanded = false,
}) => {
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
        return isValidTrackId(id);
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

  const handleMoodClick = (mood: MoodCard) => {
    setQuery(mood.query);
    performSearch(mood.query);
  };

  const padClass = sidebarExpanded ? "pl-[288px] pr-8" : "pl-[96px] pr-8";

  return (
    <div
      className={`flex-1 overflow-y-auto pt-20 pb-10 space-y-7 select-none font-sans bg-[#0a0a0c] text-[#f5f5f7] transition-[padding] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${padClass}`}
    >
      {/* Page Title & Pill Search Input */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">Search</h1>

        <form onSubmit={handleSubmit} className="relative max-w-xl">
          <div className="relative flex items-center bg-white/[0.08] border border-white/[0.10] focus-within:bg-white/[0.12] focus-within:border-white/[0.22] rounded-full transition-all px-4 shadow-sm">
            <Search className="w-4 h-4 text-white/50 mr-3 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder="Tìm bài hát, nghệ sĩ, bản remix hoặc từ khóa..."
              autoFocus
              className="w-full h-11 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setHasSearched(false);
                }}
                aria-label="Xóa từ khóa"
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/[0.10] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Moods & Moments Grid (Idle) */}
      {!hasSearched && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white tracking-tight">Moods &amp; moments</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {MOOD_MOMENTS.map((mood) => (
              <button
                type="button"
                key={mood.id}
                onClick={() => handleMoodClick(mood)}
                className={`group relative overflow-hidden rounded-2xl p-4 h-28 bg-gradient-to-br ${mood.gradient} border border-white/[0.08] hover:border-white/[0.22] text-left flex flex-col justify-between transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-full bg-white/[0.10] backdrop-blur-md flex items-center justify-center">
                    {mood.icon}
                  </span>
                  <span className="text-[10px] font-medium text-white/45 group-hover:text-white/75 transition-colors">
                    Khám phá
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{mood.label}</p>
                  <p className="text-xs text-white/55 truncate mt-0.5">{mood.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Search Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-3 text-sm text-white/65">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
          <span>Đang tìm kiếm trên YouTube &amp; SoundCloud...</span>
        </div>
      )}

      {/* Empty Search Result */}
      {!loading && hasSearched && results.length === 0 && (
        <div className="text-center py-20 text-white/45">
          <Music className="w-10 h-10 mx-auto mb-3 opacity-35" />
          <p className="text-sm font-semibold text-white/75">Không tìm thấy kết quả phù hợp</p>
          <p className="text-xs text-white/45 mt-1">Thử tìm bằng từ khóa hoặc tên nghệ sĩ khác</p>
        </div>
      )}

      {/* Search Results Table */}
      {!loading && results.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-bold text-white">
              Kết quả cho &ldquo;{query}&rdquo;
            </h2>
            <span className="text-xs text-white/45">{results.length} bài hát</span>
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
        </section>
      )}
    </div>
  );
};
