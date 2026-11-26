// src/renderer/components/SettingsModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  Play,
  SlidersHorizontal,
  Sparkles,
  HardDrive,
  Volume2,
  VolumeX,
  RotateCcw,
  Shuffle,
  AlertCircle,
  MessageSquareQuote,
  Gauge,
  Trash2,
  Music2,
  Clock,
  Check,
  AudioLines,
} from "lucide-react";
import { usePlayer, type AppSettings } from "../context/PlayerContext.tsx";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSpotifyImport: () => void;
  onHistoryCleared?: () => void;
}

type SettingsCategory = "playback" | "now-playing" | "audio" | "storage";

type ToggleKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

interface ToggleSettingMeta {
  key: ToggleKey;
  category: "playback" | "now-playing" | "audio";
  section: string;
  title: string;
  description: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOGGLE_ITEMS: ToggleSettingMeta[] = [
  {
    key: "saveLastState",
    category: "playback",
    section: "Khi mở ứng dụng",
    title: "Save Player's last state",
    description: "Lưu và gợi ý phát tiếp bài hát cùng vị trí phát gần nhất khi khởi động lại",
    keywords: "save state resume khoi phuc playback",
    icon: RotateCcw,
  },
  {
    key: "pauseWhenMuted",
    category: "playback",
    section: "Trong lúc nghe",
    title: "Pause music when muted",
    description: "Tự động tạm dừng nhạc khi âm lượng giảm về 0% hoặc bấm tắt tiếng",
    keywords: "mute pause tam dung am luong",
    icon: VolumeX,
  },
  {
    key: "keepShuffleOn",
    category: "playback",
    section: "Trong lúc nghe",
    title: "Keep shuffle on",
    description: "Giữ chế độ phát ngẫu nhiên khi chuyển sang danh sách phát mới",
    keywords: "shuffle tron bai ngau nhien",
    icon: Shuffle,
  },
  {
    key: "dontSkipOnFailure",
    category: "playback",
    section: "Khi gặp sự cố",
    title: "Don't skip on failure",
    description: "Dừng tại bài hiện tại thay vì tự động nhảy sang bài kế tiếp nếu nguồn phát lỗi",
    keywords: "skip error failure loi stream",
    icon: AlertCircle,
  },
  {
    key: "ambientBackground",
    category: "now-playing",
    section: "Giao diện trình phát",
    title: "Ambient Background",
    description: "Hiển thị nền gradient động trích xuất màu sắc từ ảnh bìa trong trình phát toàn màn hình",
    keywords: "ambient background color gradient fullscreen mau nen",
    icon: Sparkles,
  },
  {
    key: "typewriterLyrics",
    category: "now-playing",
    section: "Lời bài hát 60fps",
    title: "Typewriter Synced Lyrics",
    description: "Chạy hiệu ứng lướt chữ từng từ theo nhịp ở 60fps trong khung lời bài hát",
    keywords: "lyrics typewriter 60fps loi bai hat",
    icon: MessageSquareQuote,
  },
  {
    key: "evenOutVolume",
    category: "audio",
    section: "Xử lý âm lượng",
    title: "Even out volume",
    description: "Cân bằng độ lớn âm lượng giữa các bài hát để tránh chênh lệch đột ngột",
    keywords: "volume loudness normalize can bang am luong",
    icon: Volume2,
  },
];

const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "playback", label: "Playback", icon: Play },
  { id: "now-playing", label: "Now playing", icon: Sparkles },
  { id: "audio", label: "Audio", icon: SlidersHorizontal },
  { id: "storage", label: "Storage", icon: HardDrive },
];

const QUALITY_OPTIONS: { value: AppSettings["streamQuality"]; label: string; hint: string }[] = [
  { value: "HIGH", label: "HIGH", hint: "Chất lượng cao nhất" },
  { value: "MEDIUM", label: "MEDIUM", hint: "Cân bằng ổn định" },
  { value: "LOW", label: "LOW", hint: "Tiết kiệm băng thông" },
];

const LYRIC_OFFSET_PREFIX = "tay_music_lyric_offset:";

function countSavedLyricOffsets(): number {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(LYRIC_OFFSET_PREFIX)).length;
  } catch {
    return 0;
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenSpotifyImport,
  onHistoryCleared,
}) => {
  const { settings, updateSettings } = usePlayer();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("playback");
  const [searchQuery, setSearchQuery] = useState("");
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [offsetFeedback, setOffsetFeedback] = useState<string | null>(null);
  const [savedOffsetCount, setSavedOffsetCount] = useState<number>(() => countSavedLyricOffsets());

  useEffect(() => {
    if (isOpen) {
      setSavedOffsetCount(countSavedLyricOffsets());
      setHistoryFeedback(null);
      setOffsetFeedback(null);
    }
  }, [isOpen]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredToggles = useMemo(() => {
    if (!trimmedQuery) {
      return TOGGLE_ITEMS.filter((item) => item.category === activeCategory);
    }
    return TOGGLE_ITEMS.filter((item) =>
      `${item.title} ${item.description} ${item.keywords} ${item.section}`
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [activeCategory, trimmedQuery]);

  const showCrossfadeControl = useMemo(() => {
    if (!trimmedQuery) return activeCategory === "playback";
    return (
      "crossfade tron chuyen bai fade mix duration thoi gian playback".includes(trimmedQuery) ||
      trimmedQuery.includes("crossfade") ||
      trimmedQuery.includes("fade")
    );
  }, [activeCategory, trimmedQuery]);

  const showQualityControl = useMemo(() => {
    if (!trimmedQuery) return activeCategory === "audio";
    return "stream quality chat luong am thanh high medium low".includes(trimmedQuery) ||
      trimmedQuery.includes("quality") ||
      trimmedQuery.includes("audio") ||
      trimmedQuery.includes("stream");
  }, [activeCategory, trimmedQuery]);

  const showStorageActions = useMemo(() => {
    if (!trimmedQuery) return activeCategory === "storage";
    return (
      "storage lich su history lyric offset reset spotify import".includes(trimmedQuery) ||
      trimmedQuery.includes("history") ||
      trimmedQuery.includes("offset") ||
      trimmedQuery.includes("spotify") ||
      trimmedQuery.includes("clear") ||
      trimmedQuery.includes("xoa")
    );
  }, [activeCategory, trimmedQuery]);

  if (!isOpen) return null;

  const groupedToggles = filteredToggles.reduce<Record<string, ToggleSettingMeta[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const handleClearHistory = async () => {
    if (isClearingHistory) return;
    setIsClearingHistory(true);
    setHistoryFeedback(null);
    try {
      await window.mochyApi.clearHistory();
      onHistoryCleared?.();
      setHistoryFeedback("Đã xóa toàn bộ lịch sử nghe nhạc");
    } catch (err) {
      console.error("[SettingsModal] Clear history failed:", err);
      setHistoryFeedback("Không thể xóa lịch sử, vui lòng thử lại");
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleResetAllOffsets = () => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LYRIC_OFFSET_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
      setSavedOffsetCount(0);
      setOffsetFeedback(
        keys.length > 0
          ? `Đã đặt lại ${keys.length} độ lệch lyric đã lưu`
          : "Hiện chưa có độ lệch lyric tùy chỉnh nào"
      );
    } catch {
      setOffsetFeedback("Không thể truy cập localStorage");
    }
  };

  const activeCategoryLabel =
    trimmedQuery
      ? `Kết quả tìm kiếm`
      : CATEGORIES.find((c) => c.id === activeCategory)?.label || "Settings";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[780px] h-[560px] max-h-[86vh] rounded-[24px] bg-[#16161a]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_28px_80px_rgba(0,0,0,0.85)] overflow-hidden flex text-[#f5f5f7]"
      >
        {/* Left Navigation Column */}
        <div className="w-[245px] shrink-0 border-r border-white/[0.07] bg-[#121216]/70 p-6 flex flex-col">
          <h2 className="text-[26px] font-bold tracking-tight text-[#f5f5f7] mb-4">
            Settings
          </h2>

          {/* Search settings input */}
          <div className="relative mb-5">
            <Search className="w-4 h-4 text-[#8e8e93] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="w-full h-10 pl-9 pr-8 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[13px] text-[#f5f5f7] placeholder:text-[#8e8e93] focus:outline-none focus:bg-white/[0.09] focus:border-white/[0.2] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear settings search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[#8e8e93] hover:text-white hover:bg-white/[0.1] flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Categories */}
          <nav className="flex flex-col gap-1.5" aria-label="Settings categories">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = !trimmedQuery && activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveCategory(cat.id);
                  }}
                  className={`min-h-[44px] w-full px-3.5 rounded-xl flex items-center gap-3 text-[13.5px] font-medium transition-all text-left ${
                    isSelected
                      ? "bg-white/[0.12] text-[#f5f5f7] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-[#9a9aa0] hover:text-[#f5f5f7] hover:bg-white/[0.05]"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto pt-4 border-t border-white/[0.06] text-[11px] text-[#6e6e73]">
            Tày Music • Dark Glass HUD
          </div>
        </div>

        {/* Right Content Column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header with close button */}
          <div className="px-7 pt-6 pb-3 flex items-center justify-between gap-4 shrink-0">
            <h3 className="text-[22px] font-bold tracking-tight text-[#f5f5f7]">
              {activeCategoryLabel}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cài đặt"
              className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-[#c7c7cc] hover:text-white flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Settings Body */}
          <div className="flex-1 overflow-y-auto px-7 pb-7 space-y-5">
            {Object.entries(groupedToggles).map(([sectionName, items]) => (
              <div key={sectionName}>
                <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                  {sectionName}
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const checked = Boolean(settings[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="px-4 py-3.5 min-h-[64px] flex items-center justify-between gap-4 hover:bg-white/[0.025] transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7]">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-medium text-[#f5f5f7] truncate">
                              {item.title}
                            </div>
                            <p className="text-[12px] text-[#8e8e93] leading-snug mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          aria-label={item.title}
                          onClick={() => updateSettings({ [item.key]: !checked })}
                          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                            checked ? "bg-[#fa243c]" : "bg-white/[0.16]"
                          }`}
                        >
                          <span
                            className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              checked ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Crossfade (Playback) */}
            {showCrossfadeControl && (() => {
              const effectiveSec = settings.crossfadeEnabled ? settings.crossfadeDuration : 0;
              const isCrossfadeOn = effectiveSec > 0;
              return (
                <div>
                  <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                    Chuyển bài (Crossfade)
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7]">
                          <AudioLines className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                            Crossfade (Trộn chuyển bài)
                          </div>
                          <p className="text-[12px] text-[#8e8e93] leading-snug mt-0.5">
                            Giảm dần cuối bài hiện tại và hòa trộn mượt mà với đầu bài kế tiếp
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isCrossfadeOn}
                        aria-label="Crossfade (Trộn chuyển bài)"
                        onClick={() => {
                          if (isCrossfadeOn) {
                            updateSettings({ crossfadeEnabled: false });
                          } else {
                            updateSettings({
                              crossfadeEnabled: true,
                              crossfadeDuration:
                                settings.crossfadeDuration > 0 ? settings.crossfadeDuration : 6,
                            });
                          }
                        }}
                        className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer ${
                          isCrossfadeOn ? "bg-[#fa243c]" : "bg-white/[0.16]"
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            isCrossfadeOn ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="pt-1 border-t border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#9a9aa0] font-medium">
                          Thời gian hòa trộn
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-white/[0.09] text-[#f5f5f7] font-semibold tabular-nums">
                          {isCrossfadeOn ? `${effectiveSec}s` : "Tắt (0s)"}
                        </span>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={12}
                        step={1}
                        aria-label="Thời gian Crossfade (giây)"
                        value={effectiveSec}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0));
                          if (val === 0) {
                            updateSettings({ crossfadeEnabled: false, crossfadeDuration: 0 });
                          } else {
                            updateSettings({ crossfadeEnabled: true, crossfadeDuration: val });
                          }
                        }}
                        className="w-full h-1.5 rounded-full appearance-none bg-white/[0.14] accent-[#fa243c] cursor-pointer"
                      />

                      <div className="flex items-center justify-between text-[11px] text-[#6e6e73] tabular-nums">
                        <span>0s (Tắt)</span>
                        <span>6s (Mặc định)</span>
                        <span>12s</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Audio Quality Selector */}
            {showQualityControl && (
              <div>
                <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                  Chất lượng stream ưu tiên
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 space-y-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7]">
                      <Gauge className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                        Stream Quality
                      </div>
                      <p className="text-[12px] text-[#8e8e93] mt-0.5">
                        Áp dụng cho nguồn âm thanh YouTube / SoundCloud khi tải bài mới
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {QUALITY_OPTIONS.map((opt) => {
                      const active = settings.streamQuality === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateSettings({ streamQuality: opt.value })}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all ${
                            active
                              ? "bg-white text-[#121216] border-white shadow-sm"
                              : "bg-white/[0.04] text-[#c7c7cc] border-white/[0.08] hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          <div className="text-[12px] font-semibold tracking-wide">
                            {opt.label}
                          </div>
                          <div
                            className={`text-[11px] mt-0.5 ${
                              active ? "text-[#3a3a3c]" : "text-[#8e8e93]"
                            }`}
                          >
                            {opt.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Storage & Sources Section */}
            {showStorageActions && (
              <div>
                <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                  Bộ nhớ &amp; Nhập nhạc
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                  {/* Clear listening history */}
                  <div className="px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7]">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                          Xóa lịch sử nghe nhạc
                        </div>
                        <p className="text-[12px] text-[#8e8e93] mt-0.5">
                          Xóa danh sách phát gần đây trong cơ sở dữ liệu cục bộ
                        </p>
                        {historyFeedback && (
                          <p className="text-[11.5px] text-[#ff6476] mt-1 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>{historyFeedback}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearHistory}
                      disabled={isClearingHistory}
                      className="min-h-[40px] px-4 rounded-full bg-white/[0.09] hover:bg-[#fa243c] text-[12.5px] font-medium text-[#f5f5f7] hover:text-white transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isClearingHistory ? "Đang xóa..." : "Xóa lịch sử"}
                    </button>
                  </div>

                  {/* Reset saved lyric offsets */}
                  <div className="px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7]">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                          Đặt lại độ lệch lyric đã lưu
                        </div>
                        <p className="text-[12px] text-[#8e8e93] mt-0.5">
                          Hiện đang lưu tùy chỉnh riêng cho {savedOffsetCount} bài hát
                        </p>
                        {offsetFeedback && (
                          <p className="text-[11.5px] text-[#c7c7cc] mt-1">
                            {offsetFeedback}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleResetAllOffsets}
                      className="min-h-[40px] px-4 rounded-full bg-white/[0.09] hover:bg-white/[0.18] text-[12.5px] font-medium text-[#f5f5f7] transition-colors shrink-0"
                    >
                      Đặt lại
                    </button>
                  </div>

                  {/* Spotify Uplink shortcut */}
                  <div className="px-4 py-3.5 min-h-[68px] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#1db954]/20 border border-[#1db954]/30 flex items-center justify-center shrink-0 text-[#4ade80]">
                        <Music2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                          Spotify Uplink Importer
                        </div>
                        <p className="text-[12px] text-[#8e8e93] mt-0.5">
                          Nhập playlist từ link Spotify hoặc đồng bộ thư viện đã lưu
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSpotifyImport();
                      }}
                      className="min-h-[40px] px-4 rounded-full bg-white text-[#121216] hover:bg-[#e5e5ea] text-[12.5px] font-semibold transition-colors shrink-0"
                    >
                      Mở Uplink
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty Search Results State */}
            {trimmedQuery &&
              filteredToggles.length === 0 &&
              !showCrossfadeControl &&
              !showQualityControl &&
              !showStorageActions && (
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] py-12 px-6 text-center text-[#8e8e93] text-[13px]">
                  Không tìm thấy cài đặt nào khớp với &ldquo;{searchQuery}&rdquo;
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
