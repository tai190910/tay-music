// src/renderer/components/SpotifyImportModal.tsx

import React, { useState, useEffect } from "react";
import {
  X,
  Link2,
  User,
  RefreshCw,
  Check,
  CheckSquare,
  Square,
  Music,
  Heart,
  Loader2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Search,
} from "lucide-react";
import type {
  ImportProgress,
  ImportedTrack,
  SpotifyAccountInfo,
  SpotifyRemotePlaylist,
  ParsedImport,
} from "../../core/importer/types.ts";
import type { Song } from "../types.ts";
import { ManualMatchModal } from "./ManualMatchModal.tsx";
import { TrackThumbnail } from "./TrackThumbnail.tsx";

interface SpotifyImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type TabType = "link" | "account";

interface UnmatchedEntry {
  key: string;
  track: ImportedTrack;
  playlistId?: string | null;
  playlistName?: string | null;
  isLiked?: boolean;
  resolvedSong?: Song;
}

export const SpotifyImportModal: React.FC<SpotifyImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("link");

  // Tab 1: Link State
  const [inputUrl, setInputUrl] = useState("");
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedImport | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Tab 2: Account State
  const [account, setAccount] = useState<SpotifyAccountInfo | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [remotePlaylists, setRemotePlaylists] = useState<SpotifyRemotePlaylist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

  // Progress State
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<{ matched: number; total: number } | null>(null);
  const [unmatchedEntries, setUnmatchedEntries] = useState<UnmatchedEntry[]>([]);
  const [manualMatchTarget, setManualMatchTarget] = useState<UnmatchedEntry | null>(null);

  // Load account and auto-sync settings on mount
  useEffect(() => {
    if (!isOpen || !window.mochyApi) return;

    // Listen to IPC progress events
    const unsub = window.mochyApi.onSpotifyProgress((p) => {
      setProgress(p);
      if (p.phase === "error") {
        setIsImporting(false);
      }
    });

    loadAccount();
    loadAutoSync();

    return () => {
      unsub();
    };
  }, [isOpen]);

  const loadAccount = async () => {
    if (!window.mochyApi) return;
    setIsLoadingAccount(true);
    try {
      const acc = await window.mochyApi.spotifyGetAccount();
      setAccount(acc);
      if (acc) {
        fetchPlaylists();
      }
    } catch (err) {
      console.error("[SpotifyModal] Failed to load account:", err);
    } finally {
      setIsLoadingAccount(false);
    }
  };

  const loadAutoSync = async () => {
    if (!window.mochyApi) return;
    try {
      const { enabled, playlistIds } = await window.mochyApi.spotifyGetAutoSync();
      setAutoSyncEnabled(enabled);
      if (playlistIds && playlistIds.length > 0) {
        setSelectedPlaylistIds(playlistIds);
      }
    } catch (err) {
      console.error("[SpotifyModal] Failed to load auto-sync:", err);
    }
  };

  const fetchPlaylists = async () => {
    if (!window.mochyApi) return;
    setIsLoadingPlaylists(true);
    try {
      const list = await window.mochyApi.spotifyGetUserPlaylists();
      setRemotePlaylists(list || []);
      // Default to select all
      if (selectedPlaylistIds.length === 0) {
        setSelectedPlaylistIds((list || []).map((p) => p.id));
      }
    } catch (err: any) {
      console.error("[SpotifyModal] Failed to fetch remote playlists:", err);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const handleLogin = async () => {
    if (!window.mochyApi) return;
    setIsLoggingIn(true);
    try {
      const loggedAccount = await window.mochyApi.spotifyOpenLogin();
      if (loggedAccount) {
        setAccount(loggedAccount);
        fetchPlaylists();
      }
    } catch (err) {
      console.error("[SpotifyModal] Login error:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (!window.mochyApi) return;
    await window.mochyApi.spotifyLogout();
    setAccount(null);
    setRemotePlaylists([]);
    setSelectedPlaylistIds([]);
  };

  const handleParseLink = async () => {
    if (!inputUrl.trim() || !window.mochyApi) return;
    setIsParsingLink(true);
    setLinkError(null);
    setParsedPreview(null);

    try {
      const parsed = await window.mochyApi.spotifyParseLink(inputUrl.trim());
      setParsedPreview(parsed);
    } catch (err: any) {
      setLinkError(err.message || "Không thể phân tích đường dẫn này. Vui lòng kiểm tra lại link.");
    } finally {
      setIsParsingLink(false);
    }
  };

  const handleStartImportParsed = async () => {
    if (!parsedPreview || !window.mochyApi) return;
    setIsImporting(true);
    setImportResult(null);
    setUnmatchedEntries([]);
    setManualMatchTarget(null);
    setProgress({
      phase: "matching",
      total: parsedPreview.tracks.length,
      current: 0,
      matched: 0,
      playlistName: parsedPreview.title,
    });

    try {
      const res = await window.mochyApi.spotifyImportParsed(parsedPreview);
      const entries: UnmatchedEntry[] = (res.unmatchedTracks || []).map((track, idx) => ({
        key: `${res.playlistId || "lib"}-${idx}-${track.title}`,
        track,
        playlistId: res.playlistId,
        playlistName: res.playlistName || parsedPreview.title,
        isLiked: Boolean(res.isLiked),
      }));
      setUnmatchedEntries(entries);
      setImportResult({ matched: res.matched, total: res.total });
      onImportComplete?.();
    } catch (err: any) {
      console.error("[SpotifyModal] Import parsed error:", err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartSyncSelected = async () => {
    if (!window.mochyApi || selectedPlaylistIds.length === 0) return;
    setIsImporting(true);
    setImportResult(null);
    setUnmatchedEntries([]);
    setManualMatchTarget(null);

    const targets = remotePlaylists.filter((p) => selectedPlaylistIds.includes(p.id));

    try {
      let totalMatched = 0;
      let totalTracks = 0;
      const allUnmatched: UnmatchedEntry[] = [];

      for (const remote of targets) {
        const res = await window.mochyApi.spotifyImportRemote(remote);
        totalMatched += res.matched;
        totalTracks += res.total;
        const missed = res.unmatchedTracks || [];
        missed.forEach((track, idx) => {
          allUnmatched.push({
            key: `${remote.id}-${idx}-${track.title}`,
            track,
            playlistId: res.playlistId,
            playlistName: res.playlistName || remote.name,
            isLiked: Boolean(res.isLiked || remote.isLiked),
          });
        });
      }

      setUnmatchedEntries(allUnmatched);
      setImportResult({ matched: totalMatched, total: totalTracks });
      onImportComplete?.();
    } catch (err: any) {
      console.error("[SpotifyModal] Sync error:", err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    if (window.mochyApi) {
      await window.mochyApi.spotifySetAutoSync(enabled, selectedPlaylistIds);
    }
  };

  const handleToggleSelectPlaylist = (id: string) => {
    const next = selectedPlaylistIds.includes(id)
      ? selectedPlaylistIds.filter((pId) => pId !== id)
      : [...selectedPlaylistIds, id];
    setSelectedPlaylistIds(next);

    if (autoSyncEnabled && window.mochyApi) {
      window.mochyApi.spotifySetAutoSync(true, next);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedPlaylistIds.length === remotePlaylists.length) {
      setSelectedPlaylistIds([]);
    } else {
      const all = remotePlaylists.map((p) => p.id);
      setSelectedPlaylistIds(all);
      if (autoSyncEnabled && window.mochyApi) {
        window.mochyApi.spotifySetAutoSync(true, all);
      }
    }
  };

  const handleCancelImport = () => {
    if (window.mochyApi) {
      window.mochyApi.spotifyCancelImport();
      setIsImporting(false);
    }
  };

  const formatDurationMs = (ms?: number | null) => {
    if (!ms || ms <= 0) return "--:--";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const resolvedCount = unmatchedEntries.filter((e) => Boolean(e.resolvedSong)).length;
  const remainingUnmatchedCount = unmatchedEntries.length - resolvedCount;
  const effectiveMatched = (importResult?.matched || 0) + resolvedCount;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none animate-fadeIn font-sans"
      onClick={() => !isImporting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spotify Uplink"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#16161a]/95 backdrop-blur-2xl border border-white/[0.12] rounded-[24px] shadow-[0_28px_80px_rgba(0,0,0,0.85)] flex flex-col max-h-[85vh] overflow-hidden text-[#f5f5f7]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#121216]/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#1DB954] fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-[15.5px] font-bold text-[#f5f5f7] tracking-tight flex items-center gap-2">
                Spotify Uplink
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#1DB954]/15 text-[#4ade80] border border-[#1DB954]/30">
                  Auto-Sync
                </span>
              </h2>
              <p className="text-[12px] text-[#8e8e93]">
                Đồng bộ danh sách phát &amp; đối soát đa nguồn YT Music / YouTube / SoundCloud
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            aria-label="Đóng Spotify Uplink"
            className="w-8 h-8 rounded-full text-[#8e8e93] hover:text-white bg-white/[0.06] hover:bg-white/[0.14] flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.08] bg-[#121216]/40 px-6 py-2.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            disabled={isImporting}
            className={`min-h-[36px] px-4 rounded-full flex items-center gap-2 font-medium text-[12.5px] transition-all cursor-pointer ${
              activeTab === "link"
                ? "bg-white/[0.14] text-white shadow-sm"
                : "text-[#8e8e93] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Link công khai</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("account")}
            disabled={isImporting}
            className={`min-h-[36px] px-4 rounded-full flex items-center gap-2 font-medium text-[12.5px] transition-all cursor-pointer ${
              activeTab === "account"
                ? "bg-white/[0.14] text-white shadow-sm"
                : "text-[#8e8e93] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Tài khoản Spotify</span>
            {account && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" title="Đã đăng nhập" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Active Progress View */}
          {isImporting && progress && (
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.1] shadow-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 text-[#1DB954] animate-spin" />
                  <span className="font-semibold text-[13.5px] text-white">
                    {progress.phase === "fetching" && "Đang tải danh sách bài hát từ Spotify..."}
                    {progress.phase === "matching" && "Đang đối soát nguồn âm thanh..."}
                    {progress.phase === "saving" && "Đang lưu vào cơ sở dữ liệu..."}
                    {progress.phase === "done" && "Hoàn tất đồng bộ"}
                  </span>
                </div>
                <span className="text-[12.5px] font-semibold text-[#4ade80] tabular-nums">
                  {progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : "0%"}
                </span>
              </div>

              {/* Smooth Progress Bar */}
              <div className="w-full bg-white/[0.08] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#1DB954] to-[#4ade80] h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[12px] text-[#8e8e93]">
                <span className="truncate max-w-[360px]" title={progress.currentTrack}>
                  {progress.currentTrack ? progress.currentTrack : "Đang chuẩn bị..."}
                </span>
                <span className="tabular-nums">
                  Khớp: <strong className="text-white">{progress.matched}</strong> / {progress.total}
                </span>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="px-4 py-1.5 rounded-full text-[12px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                >
                  Hủy tiến trình
                </button>
              </div>
            </div>
          )}

          {/* Finished Success Card + Unmatched Manual Match List */}
          {!isImporting && importResult && (
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-[#1DB954]/30 shadow-lg space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/35 text-[#4ade80] flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[14px] text-white">
                      Đồng bộ hoàn tất
                    </h4>
                    <p className="text-[12.5px] text-[#8e8e93] mt-0.5">
                      Đã lưu <strong className="text-[#4ade80]">{effectiveMatched}</strong> /{" "}
                      <strong className="text-white">{importResult.total}</strong> bài hát vào thư
                      viện
                      {remainingUnmatchedCount > 0 && (
                        <span className="text-[#fbbf24]">
                          {" "}
                          • Còn {remainingUnmatchedCount} bài chưa khớp tự động
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImportResult(null);
                    setUnmatchedEntries([]);
                    setManualMatchTarget(null);
                  }}
                  className="px-4 py-1.5 text-[12px] font-medium rounded-full bg-white/[0.08] text-white hover:bg-white/[0.15] transition-colors flex-shrink-0 cursor-pointer"
                >
                  Nhập thêm
                </button>
              </div>

              {unmatchedEntries.length > 0 && (
                <div className="border-t border-white/[0.08] pt-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#fbbf24] font-semibold">
                      Bài hát chưa khớp tự động ({remainingUnmatchedCount} bài còn lại)
                    </span>
                    <span className="text-[#8e8e93] text-[11px]">
                      Bấm &ldquo;Tìm thủ công&rdquo; để chọn thay thế
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {unmatchedEntries.map((entry, idx) => {
                      const isResolved = Boolean(entry.resolvedSong);
                      return (
                        <div
                          key={entry.key}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-colors ${
                            isResolved
                              ? "bg-[#1DB954]/10 border-[#1DB954]/30"
                              : "bg-white/[0.03] border-white/[0.07] hover:border-white/[0.15]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="text-[11px] font-medium text-[#6e6e73] w-5 text-right flex-shrink-0 tabular-nums">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[13px] font-semibold text-white truncate"
                                  title={entry.track.title}
                                >
                                  {entry.track.title}
                                </span>
                                <span className="text-[11px] text-[#6e6e73] flex-shrink-0 tabular-nums">
                                  {formatDurationMs(entry.track.durationMs)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11.5px] truncate">
                                <span className="text-[#9a9aa0] truncate">{entry.track.artist}</span>
                                {entry.playlistName && (
                                  <span className="text-[11px] text-[#6e6e73] truncate">
                                    • {entry.playlistName}
                                  </span>
                                )}
                              </div>
                              {isResolved && entry.resolvedSong && (
                                <p className="text-[11px] text-[#4ade80] truncate mt-0.5">
                                  Đã chọn: {entry.resolvedSong.title}
                                </p>
                              )}
                            </div>
                          </div>

                          {isResolved ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#1DB954]/20 text-[#4ade80] flex-shrink-0">
                              Đã thêm
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setManualMatchTarget(entry)}
                              className="px-3 py-1.5 rounded-full text-[11.5px] font-medium bg-white/[0.09] hover:bg-white text-white hover:text-[#121216] transition-colors flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                            >
                              <Search className="w-3 h-3" />
                              <span>Tìm thủ công</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: Link Importer */}
          {activeTab === "link" && !isImporting && (
            <div className="space-y-5">
              <div>
                <label className="block text-[12.5px] font-medium text-[#9a9aa0] mb-2">
                  Đường dẫn Playlist hoặc Album Spotify (Công khai)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => {
                        setInputUrl(e.target.value);
                        setLinkError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleParseLink()}
                      placeholder="https://open.spotify.com/playlist/... hoặc spotify:playlist:..."
                      className="w-full h-10 bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 text-[13px] text-white placeholder-[#6e6e73] focus:outline-none focus:border-[#1DB954] focus:bg-white/[0.08] transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleParseLink}
                    disabled={isParsingLink || !inputUrl.trim()}
                    className="px-5 h-10 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-[13px] flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isParsingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    <span>Kiểm tra link</span>
                  </button>
                </div>
                {linkError && (
                  <p className="text-[12px] text-rose-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{linkError}</span>
                  </p>
                )}
              </div>

              {/* Parsed Preview Card */}
              {parsedPreview && (
                <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-4 animate-fadeIn">
                  <div className="flex gap-4 items-center">
                    <TrackThumbnail
                      src={parsedPreview.coverUrl}
                      alt={parsedPreview.title}
                      iconSize="lg"
                      className="w-20 h-20 rounded-xl shadow-md flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10.5px] uppercase font-semibold text-[#1DB954]">
                        {parsedPreview.type}
                      </span>
                      <h3 className="font-bold text-[16px] text-white truncate">
                        {parsedPreview.title}
                      </h3>
                      {parsedPreview.subtitle && (
                        <p className="text-[12.5px] text-[#9a9aa0] truncate">
                          {parsedPreview.subtitle}
                        </p>
                      )}
                      <p className="text-[12px] text-[#8e8e93] mt-1 font-medium">
                        Tổng cộng:{" "}
                        <strong className="text-white">{parsedPreview.tracks.length}</strong> bài
                        hát
                      </p>
                    </div>
                  </div>

                  {/* Sample tracks preview */}
                  <div className="border-t border-white/[0.07] pt-3">
                    <span className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider block mb-2">
                      Xem trước một số bài hát:
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {parsedPreview.tracks.slice(0, 5).map((track, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[12px] py-1.5 px-2.5 rounded-lg bg-white/[0.04]"
                        >
                          <span className="truncate max-w-[280px] font-medium text-white">
                            {i + 1}. {track.title}
                          </span>
                          <span className="text-[#8e8e93] truncate max-w-[150px]">
                            {track.artist}
                          </span>
                        </div>
                      ))}
                      {parsedPreview.tracks.length > 5 && (
                        <p className="text-center text-[11px] text-[#6e6e73] pt-1">
                          và {parsedPreview.tracks.length - 5} bài hát khác...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Start Import Action Button */}
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={handleStartImportParsed}
                      className="px-6 py-2.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-[13px] flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 fill-black" />
                      <span>Bắt đầu nhập vào Thư viện</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Spotify Account Importer & Auto-Sync */}
          {activeTab === "account" && !isImporting && (
            <div className="space-y-6">
              {!account ? (
                /* Not Logged In View */
                <div className="p-8 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#1DB954]/15 border border-[#1DB954]/30 flex items-center justify-center mx-auto text-[#1DB954]">
                    <User className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1.5">
                    <h3 className="font-bold text-[16px] text-white">Đăng nhập tài khoản Spotify</h3>
                    <p className="text-[12.5px] text-[#8e8e93] leading-relaxed">
                      Đăng nhập trực tiếp bằng tài khoản Spotify của bạn để tự động nhập{" "}
                      <strong className="text-white">Bài hát đã thích (Liked Songs)</strong> và danh sách phát riêng tư.
                      Dữ liệu xác thực được lưu an toàn tại máy tính cá nhân.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="px-6 py-2.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-[13px] inline-flex items-center gap-2.5 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isLoggingIn ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Đang chờ đăng nhập...</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          <span>Đăng nhập với Spotify</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Logged In View */
                <div className="space-y-5">
                  {/* Account Profile Card */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrackThumbnail
                        src={account.photoUrl}
                        alt={account.displayName}
                        iconSize="md"
                        className="w-12 h-12 rounded-full border border-[#1DB954] flex-shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-[14px] text-white">{account.displayName}</h4>
                          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#1DB954]/15 text-[#4ade80] font-semibold border border-[#1DB954]/30">
                            Đã kết nối
                          </span>
                        </div>
                        {account.email && (
                          <p className="text-[12px] text-[#8e8e93]">{account.email}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-3.5 py-1.5 rounded-full text-[12px] font-medium text-rose-300 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer"
                    >
                      Đăng xuất
                    </button>
                  </div>

                  {/* Auto-Sync Toggle Option */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-[#1DB954]" />
                        <span className="text-[13.5px] font-semibold text-white">
                          Tự động đồng bộ khi mở ứng dụng
                        </span>
                      </div>
                      <p className="text-[12px] text-[#8e8e93]">
                        Mỗi lần khởi động Tày Music, app sẽ tự kiểm tra và cập nhật các bài hát mới từ Spotify.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(e) => handleToggleAutoSync(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/[0.16] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1DB954]"></div>
                    </label>
                  </div>

                  {/* Remote Playlists List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-semibold text-[#8e8e93] uppercase tracking-wider">
                        Chọn danh sách phát cần nhập ({selectedPlaylistIds.length}/
                        {remotePlaylists.length}):
                      </span>

                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-[12px] text-[#4ade80] hover:underline font-semibold cursor-pointer"
                      >
                        {selectedPlaylistIds.length === remotePlaylists.length
                          ? "Bỏ chọn tất cả"
                          : "Chọn tất cả"}
                      </button>
                    </div>

                    {isLoadingPlaylists ? (
                      <div className="py-8 text-center text-[#8e8e93] space-y-2">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1DB954]" />
                        <p className="text-[12px]">Đang tải danh sách playlist từ Spotify...</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {remotePlaylists.map((pl) => {
                          const isSelected = selectedPlaylistIds.includes(pl.id);
                          return (
                            <div
                              key={pl.id}
                              onClick={() => handleToggleSelectPlaylist(pl.id)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-[#1DB954]/10 border-[#1DB954]/45 shadow-sm"
                                  : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#1DB954] flex-shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-[#8e8e93] flex-shrink-0" />
                                )}

                                {pl.coverUrl ? (
                                  <TrackThumbnail
                                    src={pl.coverUrl}
                                    alt={pl.name}
                                    iconSize="sm"
                                    className="w-9 h-9 rounded-lg flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                                    {pl.isLiked ? (
                                      <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                                    ) : (
                                      <Music className="w-4 h-4 text-[#8e8e93]" />
                                    )}
                                  </div>
                                )}

                                <div className="truncate">
                                  <h5 className="font-semibold text-[13px] text-white truncate">
                                    {pl.name}
                                  </h5>
                                  <p className="text-[11.5px] text-[#8e8e93]">
                                    {pl.trackCount} bài hát {pl.ownerName ? `• ${pl.ownerName}` : ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Sync Selected Playlists Action Button */}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleStartSyncSelected}
                        disabled={selectedPlaylistIds.length === 0}
                        className="px-6 py-2.5 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-[13px] flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 fill-black" />
                        <span>Nhập {selectedPlaylistIds.length} danh sách đã chọn</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Match Modal for Unmatched Tracks */}
      {manualMatchTarget && (
        <ManualMatchModal
          track={manualMatchTarget.track}
          playlistId={manualMatchTarget.playlistId}
          playlistName={manualMatchTarget.playlistName}
          isLiked={manualMatchTarget.isLiked}
          onClose={() => setManualMatchTarget(null)}
          onMatched={(song) => {
            setUnmatchedEntries((prev) =>
              prev.map((e) =>
                e.key === manualMatchTarget.key ? { ...e, resolvedSong: song } : e
              )
            );
            onImportComplete?.();
          }}
        />
      )}
    </div>
  );
};
