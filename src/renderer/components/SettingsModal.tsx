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
  Infinity as InfinityIcon,
  ShieldCheck,
  LogOut,
  Loader2,
  Radio,
  FolderOpen,
  Download,
  Upload,
} from "lucide-react";
import { usePlayer, type AppSettings } from "../context/PlayerContext.tsx";
import type { StorageInfo, YouTubeAccountInfo } from "../types.ts";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSpotifyImport: () => void;
  onHistoryCleared?: () => void;
  focusPlaybackKey?: number;
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
    key: "autoplayEnabled",
    category: "playback",
    section: "Trong lúc nghe",
    title: "Tự động phát nhạc tương tự (Autoplay)",
    description: "Tự động tìm và nối tiếp bài hát cùng chủ đề/vibe khi hết hàng đợi",
    keywords: "autoplay tu dong phat smart radio goi y vibe playback",
    icon: InfinityIcon,
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
  focusPlaybackKey = 0,
}) => {
  const {
    settings,
    updateSettings,
    resetBotCircuitBreaker,
    discordStatus,
    refreshDownloadedTracks,
  } = usePlayer();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("playback");
  const [searchQuery, setSearchQuery] = useState("");
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [offsetFeedback, setOffsetFeedback] = useState<string | null>(null);
  const [savedOffsetCount, setSavedOffsetCount] = useState<number>(() => countSavedLyricOffsets());

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isMigratingDir, setIsMigratingDir] = useState(false);
  const [dirFeedback, setDirFeedback] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);

  const [ytAccount, setYtAccount] = useState<YouTubeAccountInfo | null>(null);
  const [isLoggingInYt, setIsLoggingInYt] = useState(false);
  const [ytAuthFeedback, setYtAuthFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSavedOffsetCount(countSavedLyricOffsets());
      setHistoryFeedback(null);
      setOffsetFeedback(null);
      setYtAuthFeedback(null);
      setDirFeedback(null);
      setBackupFeedback(null);
      window.mochyApi
        ?.youtubeGetAccount()
        .then((acc) => setYtAccount(acc))
        .catch(() => setYtAccount(null));
      window.mochyApi
        ?.getStorageInfo?.()
        .then((info) => setStorageInfo(info))
        .catch(() => {});
      if (settings.discordRpcEnabled) {
        window.mochyApi?.getDiscordRpcStatus?.().catch(() => {});
      }
    }
  }, [isOpen, settings.discordRpcEnabled]);

  useEffect(() => {
    if (focusPlaybackKey > 0) {
      setActiveCategory("playback");
      setSearchQuery("");
    }
  }, [focusPlaybackKey]);

  useEffect(() => {
    if (!window.mochyApi?.onYouTubeAuthChanged) return;
    return window.mochyApi.onYouTubeAuthChanged((acc) => {
      setYtAccount(acc);
    });
  }, []);

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

  const showYouTubeAuthControl = useMemo(() => {
    if (!trimmedQuery) return activeCategory === "playback";
    return (
      "youtube music login account tai khoan dang nhap chong chan bot 429 cookie playback".includes(
        trimmedQuery
      ) ||
      trimmedQuery.includes("youtube") ||
      trimmedQuery.includes("bot") ||
      trimmedQuery.includes("login") ||
      trimmedQuery.includes("429") ||
      trimmedQuery.includes("tài khoản") ||
      trimmedQuery.includes("đăng nhập")
    );
  }, [activeCategory, trimmedQuery]);

  const showDiscordControl = useMemo(() => {
    if (!trimmedQuery) return activeCategory === "playback";
    return (
      "discord rich presence rpc device integration trang thai ket noi playback".includes(
        trimmedQuery
      ) ||
      trimmedQuery.includes("discord") ||
      trimmedQuery.includes("rich presence") ||
      trimmedQuery.includes("rpc") ||
      trimmedQuery.includes("device") ||
      trimmedQuery.includes("integration")
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
      "storage lich su history lyric offset reset spotify import thu muc luu nhac folder offline backup restore sao luu khoi phuc json".includes(
        trimmedQuery
      ) ||
      trimmedQuery.includes("history") ||
      trimmedQuery.includes("offset") ||
      trimmedQuery.includes("spotify") ||
      trimmedQuery.includes("clear") ||
      trimmedQuery.includes("xoa") ||
      trimmedQuery.includes("folder") ||
      trimmedQuery.includes("thư mục") ||
      trimmedQuery.includes("backup") ||
      trimmedQuery.includes("restore") ||
      trimmedQuery.includes("sao lưu") ||
      trimmedQuery.includes("nhạc")
    );
  }, [activeCategory, trimmedQuery]);

  if (!isOpen) return null;

  const groupedToggles = filteredToggles.reduce<Record<string, ToggleSettingMeta[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const handleYouTubeLogin = async () => {
    if (isLoggingInYt || !window.mochyApi) return;
    setIsLoggingInYt(true);
    setYtAuthFeedback(null);
    try {
      const acc = await window.mochyApi.youtubeOpenLogin();
      if (acc && acc.loggedIn) {
        setYtAccount(acc);
        resetBotCircuitBreaker();
        setYtAuthFeedback("Đã kết nối tài khoản YouTube và lưu Cookie xác thực thành công");
      } else {
        setYtAuthFeedback("Cửa sổ đăng nhập đã đóng mà chưa hoàn tất xác thực");
      }
    } catch (err) {
      console.error("[SettingsModal] YouTube login failed:", err);
      setYtAuthFeedback("Không thể mở cửa sổ đăng nhập YouTube, vui lòng thử lại");
    } finally {
      setIsLoggingInYt(false);
    }
  };

  const handleYouTubeLogout = async () => {
    if (isLoggingInYt || !window.mochyApi) return;
    try {
      await window.mochyApi.youtubeLogout();
      setYtAccount(null);
      setYtAuthFeedback("Đã đăng xuất và xóa Cookie YouTube cục bộ");
    } catch (err) {
      console.error("[SettingsModal] YouTube logout failed:", err);
      setYtAuthFeedback("Không thể đăng xuất YouTube");
    }
  };

  const handleChangeDownloadsDir = async () => {
    if (isMigratingDir || !window.mochyApi?.pickDownloadsFolder) return;
    setDirFeedback(null);
    try {
      const newDir = await window.mochyApi.pickDownloadsFolder();
      if (!newDir || newDir === storageInfo?.downloadsDir) return;

      let migrate = true;
      if ((storageInfo?.trackCount ?? 0) > 0) {
        migrate = window.confirm(
          `Bạn có muốn chuyển toàn bộ ${storageInfo?.trackCount} bài hát (kèm ảnh bìa & lyrics) sang thư mục mới:\n"${newDir}"\n\nChọn OK để tự động di chuyển file cũ, hoặc Cancel để chỉ đổi đường dẫn.`
        );
      }

      setIsMigratingDir(true);
      const updated = await window.mochyApi.changeDownloadsDir(newDir, migrate);
      setStorageInfo(updated);
      await refreshDownloadedTracks();
      setDirFeedback(
        migrate && (storageInfo?.trackCount ?? 0) > 0
          ? `Đã chuyển toàn bộ nhạc sang "${updated.downloadsDir}"`
          : `Đã cập nhật thư mục lưu nhạc sang "${updated.downloadsDir}"`
      );
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Không thể đổi thư mục lưu nhạc";
      setDirFeedback(`Lỗi: ${msg}`);
    } finally {
      setIsMigratingDir(false);
    }
  };

  const handleExportBackup = async () => {
    if (isBackingUp || !window.mochyApi?.exportUserDataBackup) return;
    setIsBackingUp(true);
    setBackupFeedback(null);
    try {
      const savedPath = await window.mochyApi.exportUserDataBackup(settings);
      if (savedPath) {
        setBackupFeedback(`Đã xuất bản sao lưu ra "${savedPath}"`);
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Không thể xuất file sao lưu";
      setBackupFeedback(`Lỗi xuất dữ liệu: ${msg}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportBackup = async () => {
    if (isBackingUp || !window.mochyApi?.importUserDataBackup) return;
    setIsBackingUp(true);
    setBackupFeedback(null);
    try {
      const res = await window.mochyApi.importUserDataBackup();
      if (res) {
        if (res.frontendSettings && typeof res.frontendSettings === "object") {
          updateSettings(res.frontendSettings as Partial<AppSettings>);
        }
        window.dispatchEvent(new CustomEvent("tay-likes-changed"));
        window.dispatchEvent(new CustomEvent("tay-playlist-changed"));
        onHistoryCleared?.();
        setBackupFeedback(
          `Đã khôi phục ${res.songsRestored} bài hát, ${res.likedRestored} bài yêu thích và ${res.playlistsRestored} playlist`
        );
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Không thể nhập file sao lưu";
      setBackupFeedback(`Lỗi nhập dữ liệu: ${msg}`);
    } finally {
      setIsBackingUp(false);
    }
  };

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
            {/* YouTube Account Anti-Bot Auth (Playback) */}
            {showYouTubeAuthControl && (
              <div>
                <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                  Tài khoản &amp; Chống chặn Bot
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          ytAccount?.loggedIn
                            ? "bg-emerald-500/20 border border-emerald-500/35 text-emerald-300"
                            : "bg-white/[0.08] text-[#f5f5f7]"
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-medium text-[#f5f5f7]">
                            Đăng nhập YouTube (Chống chặn Bot)
                          </span>
                          {ytAccount?.loggedIn ? (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                              Đã xác thực
                            </span>
                          ) : (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-white/[0.08] text-[#c7c7cc] border border-white/[0.10] font-medium">
                              Chưa đăng nhập
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#8e8e93] leading-snug mt-1">
                          {ytAccount?.loggedIn
                            ? `Đang kết nối: ${ytAccount.accountName || "Tài khoản YouTube Music"}${
                                ytAccount.channelHandle
                                  ? ` (${ytAccount.channelHandle})`
                                  : ytAccount.email
                                    ? ` (${ytAccount.email})`
                                    : ""
                              }. Đính kèm tự động SAPISIDHASH & Cookie cho InnerTube.`
                            : "Đăng nhập trực tiếp trên cửa sổ WebView2 của Tày Music để vượt lỗi LOGIN_REQUIRED (Sign in to confirm you're not a bot) và giảm lỗi HTTP 429."}
                        </p>
                        {ytAuthFeedback && (
                          <p className="text-[11.5px] text-emerald-300 mt-1.5 flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>{ytAuthFeedback}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ytAccount?.loggedIn ? (
                        <>
                          <button
                            type="button"
                            onClick={handleYouTubeLogin}
                            disabled={isLoggingInYt}
                            className="min-h-[44px] px-3.5 rounded-full bg-white/[0.09] hover:bg-white/[0.18] text-[12px] font-medium text-[#f5f5f7] transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isLoggingInYt ? "Đang mở..." : "Làm mới"}
                          </button>
                          <button
                            type="button"
                            onClick={handleYouTubeLogout}
                            disabled={isLoggingInYt}
                            aria-label="Đăng xuất tài khoản YouTube"
                            className="min-h-[44px] px-3.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[12px] font-medium text-rose-200 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Đăng xuất</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={handleYouTubeLogin}
                          disabled={isLoggingInYt}
                          className="min-h-[44px] px-4 rounded-full bg-[#fa243c] hover:bg-[#ff3b52] text-white text-[12.5px] font-semibold flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shadow-sm"
                        >
                          {isLoggingInYt ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang chờ...</span>
                            </>
                          ) : (
                            <span>Đăng nhập YouTube</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Device integration: Discord Rich Presence */}
            {showDiscordControl && (
              <div>
                <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                  Kết nối thiết bị (Device integration)
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] px-4 py-3.5 min-h-[76px] flex items-center justify-between gap-4 hover:bg-white/[0.025] transition-colors">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        settings.discordRpcEnabled && discordStatus.connected
                          ? "bg-[#5865F2]/25 border border-[#5865F2]/45 text-[#99aaff]"
                          : "bg-white/[0.08] text-[#f5f5f7]"
                      }`}
                    >
                      <Radio className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                        Discord Rich Presence
                      </div>
                      <p className="text-[12px] text-[#8e8e93] leading-snug mt-0.5">
                        Tự động hiển thị bài hát đang phát, ca sĩ, ảnh bìa và tiến trình thời gian thực lên trạng thái Discord
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
                        {!settings.discordRpcEnabled ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-[#6e6e73] shrink-0" />
                            <span className="text-[#8e8e93]">Đang tắt</span>
                          </>
                        ) : discordStatus.connected ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <span className="text-emerald-300 font-medium">Đã kết nối Discord</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-[#8e8e93] shrink-0" />
                            <span className="text-[#9a9aa0]">
                              Không tìm thấy Discord
                              {!discordStatus.configured ? " • Chưa điền DISCORD_CLIENT_ID" : ""}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.discordRpcEnabled}
                    aria-label="Discord Rich Presence"
                    onClick={() => updateSettings({ discordRpcEnabled: !settings.discordRpcEnabled })}
                    className={`relative w-12 h-7 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer ${
                      settings.discordRpcEnabled ? "bg-[#fa243c]" : "bg-white/[0.16]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        settings.discordRpcEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

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
              <div className="space-y-4">
                <div>
                  <div className="text-[12px] font-semibold text-[#8e8e93] mb-2.5">
                    Kho nhạc Offline &amp; Sao lưu dữ liệu
                  </div>
                  <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                    {/* Downloads folder selector + migration */}
                    <div className="px-4 py-3.5 min-h-[76px] flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center shrink-0 text-emerald-300 mt-0.5">
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-medium text-[#f5f5f7]">
                              Thư mục lưu nhạc tải về
                            </span>
                            {storageInfo && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.08] text-emerald-300 font-medium tabular-nums">
                                {storageInfo.trackCount} bài • {(storageInfo.totalBytes / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[11.5px] text-[#8e8e93] mt-1 truncate max-w-[330px] font-mono"
                            title={storageInfo?.downloadsDir || ""}
                          >
                            {storageInfo?.downloadsDir || "Đang tải đường dẫn..."}
                          </p>
                          {dirFeedback && (
                            <p className="text-[11.5px] text-emerald-300 mt-1 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{dirFeedback}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleChangeDownloadsDir}
                        disabled={isMigratingDir}
                        className="min-h-[40px] px-4 rounded-full bg-white/[0.09] hover:bg-white/[0.18] text-[12.5px] font-medium text-[#f5f5f7] transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isMigratingDir && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{isMigratingDir ? "Đang chuyển..." : "Đổi thư mục"}</span>
                      </button>
                    </div>

                    {/* Backup & Restore JSON */}
                    <div className="px-4 py-3.5 min-h-[76px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 text-[#f5f5f7] mt-0.5">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium text-[#f5f5f7]">
                            Sao lưu &amp; Khôi phục dữ liệu cũ
                          </div>
                          <p className="text-[12px] text-[#8e8e93] mt-0.5">
                            Xuất hoặc nhập Playlists, Bài hát đã thích và Cài đặt (.json) khi đổi máy hoặc cài bản Setup
                          </p>
                          {backupFeedback && (
                            <p className="text-[11.5px] text-emerald-300 mt-1 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{backupFeedback}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleExportBackup}
                          disabled={isBackingUp}
                          className="min-h-[40px] px-3.5 rounded-full bg-white/[0.09] hover:bg-white/[0.18] text-[12px] font-medium text-[#f5f5f7] transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Xuất dữ liệu (.json)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleImportBackup}
                          disabled={isBackingUp}
                          className="min-h-[40px] px-3.5 rounded-full bg-white text-[#121216] hover:bg-[#e5e5ea] text-[12px] font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Nhập dữ liệu cũ (.json)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

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
              </div>
            )}

            {/* Empty Search Results State */}
            {trimmedQuery &&
              filteredToggles.length === 0 &&
              !showYouTubeAuthControl &&
              !showDiscordControl &&
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
