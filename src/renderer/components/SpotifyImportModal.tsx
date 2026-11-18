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
} from "lucide-react";
import type { ImportProgress, SpotifyAccountInfo, SpotifyRemotePlaylist, ParsedImport } from "../../core/importer/types.ts";

interface SpotifyImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type TabType = "link" | "account";

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

  // Load account and auto-sync settings on mount
  useEffect(() => {
    if (!isOpen || !window.mochyApi) return;

    // Listen to IPC progress events
    const unsub = window.mochyApi.onSpotifyProgress((p) => {
      setProgress(p);
      if (p.phase === "done") {
        setImportResult({ matched: p.matched, total: p.total });
        setIsImporting(false);
        onImportComplete?.();
      } else if (p.phase === "error") {
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
    setProgress({
      phase: "matching",
      total: parsedPreview.tracks.length,
      current: 0,
      matched: 0,
      playlistName: parsedPreview.title,
    });

    try {
      const res = await window.mochyApi.spotifyImportParsed(parsedPreview);
      setImportResult(res);
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

    const targets = remotePlaylists.filter((p) => selectedPlaylistIds.includes(p.id));

    try {
      let totalMatched = 0;
      let totalTracks = 0;

      for (const remote of targets) {
        const res = await window.mochyApi.spotifyImportRemote(remote);
        totalMatched += res.matched;
        totalTracks += res.total;
      }

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fadeIn">
      <div className="w-full max-w-2xl bg-mochy-card border border-mochy-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-white">
        {/* Header */}
        <div className="p-6 border-b border-mochy-border/60 flex items-center justify-between bg-gradient-to-r from-emerald-950/30 to-mochy-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1DB954] flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <svg className="w-6 h-6 text-black fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Nhập nhạc từ Spotify
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30">
                  Auto-Sync
                </span>
              </h2>
              <p className="text-xs text-mochy-subtext">
                Tự động tìm kiếm & đối soát link audio tốt nhất trên YouTube Music
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-lg text-mochy-muted hover:text-white hover:bg-mochy-cardHover transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-mochy-border/60 bg-mochy-sidebar/40 px-6 pt-3 gap-6">
          <button
            onClick={() => setActiveTab("link")}
            disabled={isImporting}
            className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all border-b-2 ${
              activeTab === "link"
                ? "border-[#1DB954] text-[#1DB954]"
                : "border-transparent text-mochy-muted hover:text-white"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Dán link công khai</span>
          </button>

          <button
            onClick={() => setActiveTab("account")}
            disabled={isImporting}
            className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all border-b-2 ${
              activeTab === "account"
                ? "border-[#1DB954] text-[#1DB954]"
                : "border-transparent text-mochy-muted hover:text-white"
            }`}
          >
            <User className="w-4 h-4" />
            <span>Tài khoản Spotify</span>
            {account && (
              <span className="w-2 h-2 rounded-full bg-[#1DB954]" title="Đã đăng nhập" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Active Progress View */}
          {isImporting && progress && (
            <div className="p-5 rounded-2xl bg-mochy-sidebar border border-[#1DB954]/40 shadow-xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-5 h-5 text-[#1DB954] animate-spin" />
                  <span className="font-semibold text-sm text-white">
                    {progress.phase === "fetching" && "Đang tải danh sách bài hát..."}
                    {progress.phase === "matching" && "Đang đối soát bài hát trên YouTube Music..."}
                    {progress.phase === "saving" && "Đang lưu vào cơ sở dữ liệu..."}
                    {progress.phase === "done" && "Hoàn tất!"}
                  </span>
                </div>
                <span className="text-xs font-bold text-[#1DB954]">
                  {progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : "0%"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-mochy-card h-2.5 rounded-full overflow-hidden border border-mochy-border/60">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-[#1DB954] h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-mochy-subtext">
                <span className="truncate max-w-[360px]" title={progress.currentTrack}>
                  {progress.currentTrack ? `Đang xử lý: ${progress.currentTrack}` : "Đang chuẩn bị..."}
                </span>
                <span>
                  Khớp: <strong className="text-white">{progress.matched}</strong> / {progress.total}
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleCancelImport}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors"
                >
                  Hủy tiến trình
                </button>
              </div>
            </div>
          )}

          {/* Finished Success Card */}
          {!isImporting && importResult && (
            <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Nhập nhạc hoàn tất!</h4>
                  <p className="text-xs text-emerald-300/80">
                    Đã tìm thấy và lưu thành công <strong>{importResult.matched}</strong> /{" "}
                    {importResult.total} bài hát vào thư viện của bạn.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/50 transition-colors"
              >
                Nhập thêm
              </button>
            </div>
          )}

          {/* TAB 1: Link Importer */}
          {activeTab === "link" && !isImporting && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-mochy-subtext mb-2">
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
                      className="w-full bg-mochy-sidebar border border-mochy-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-mochy-muted focus:outline-none focus:border-[#1DB954] transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleParseLink}
                    disabled={isParsingLink || !inputUrl.trim()}
                    className="px-5 py-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-950/30"
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
                  <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{linkError}</span>
                  </p>
                )}
              </div>

              {/* Parsed Preview Card */}
              {parsedPreview && (
                <div className="p-4 rounded-2xl bg-mochy-sidebar border border-mochy-border/80 space-y-4 animate-fadeIn">
                  <div className="flex gap-4 items-center">
                    {parsedPreview.coverUrl ? (
                      <img
                        src={parsedPreview.coverUrl}
                        alt={parsedPreview.title}
                        className="w-20 h-20 rounded-xl object-cover shadow-md flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-mochy-card flex items-center justify-center flex-shrink-0">
                        <Music className="w-8 h-8 text-mochy-subtext" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] uppercase font-bold text-[#1DB954]">
                        {parsedPreview.type}
                      </span>
                      <h3 className="font-bold text-base text-white truncate">
                        {parsedPreview.title}
                      </h3>
                      {parsedPreview.subtitle && (
                        <p className="text-xs text-mochy-subtext truncate">
                          {parsedPreview.subtitle}
                        </p>
                      )}
                      <p className="text-xs text-mochy-muted mt-1 font-medium">
                        Tổng cộng:{" "}
                        <strong className="text-white">{parsedPreview.tracks.length}</strong> bài
                        hát
                      </p>
                    </div>
                  </div>

                  {/* Sample tracks preview */}
                  <div className="border-t border-mochy-border/50 pt-3">
                    <span className="text-[11px] font-semibold text-mochy-subtext uppercase tracking-wider block mb-2">
                      Xem trước một số bài hát:
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {parsedPreview.tracks.slice(0, 5).map((track, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-mochy-card/60"
                        >
                          <span className="truncate max-w-[280px] font-medium text-white">
                            {i + 1}. {track.title}
                          </span>
                          <span className="text-mochy-subtext truncate max-w-[150px]">
                            {track.artist}
                          </span>
                        </div>
                      ))}
                      {parsedPreview.tracks.length > 5 && (
                        <p className="text-center text-[11px] text-mochy-muted pt-1">
                          và {parsedPreview.tracks.length - 5} bài hát khác...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Start Import Action Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleStartImportParsed}
                      className="px-6 py-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40"
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
                <div className="p-8 rounded-2xl bg-mochy-sidebar border border-mochy-border/80 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#1DB954]/20 border border-[#1DB954]/30 flex items-center justify-center mx-auto text-[#1DB954]">
                    <User className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="font-bold text-base text-white">Đăng nhập tài khoản Spotify</h3>
                    <p className="text-xs text-mochy-subtext leading-relaxed">
                      Đăng nhập trực tiếp bằng tài khoản Spotify của bạn để tự động nhập{" "}
                      <strong>Bài hát đã thích (Liked Songs)</strong> và danh sách phát riêng tư.
                      Dữ liệu xác thực được lưu an toàn tại máy tính cá nhân.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleLogin}
                      disabled={isLoggingIn}
                      className="px-6 py-3 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm inline-flex items-center gap-2.5 transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50"
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
                  <div className="p-4 rounded-2xl bg-mochy-sidebar border border-mochy-border/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {account.photoUrl ? (
                        <img
                          src={account.photoUrl}
                          alt={account.displayName}
                          className="w-12 h-12 rounded-full object-cover border border-[#1DB954]"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-mochy-card border border-mochy-border flex items-center justify-center">
                          <User className="w-6 h-6 text-mochy-subtext" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white">{account.displayName}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                            Đã kết nối
                          </span>
                        </div>
                        {account.email && (
                          <p className="text-xs text-mochy-subtext">{account.email}</p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/40 transition-colors"
                    >
                      Đăng xuất
                    </button>
                  </div>

                  {/* Auto-Sync Toggle Option */}
                  <div className="p-4 rounded-xl bg-mochy-sidebar border border-mochy-border/60 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-[#1DB954]" />
                        <span className="text-sm font-semibold text-white">
                          Tự động đồng bộ khi mở ứng dụng
                        </span>
                      </div>
                      <p className="text-xs text-mochy-subtext">
                        Mỗi lần khởi động Mochy Music, app sẽ tự kiểm tra và cập nhật các bài hát
                        mới từ Spotify.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(e) => handleToggleAutoSync(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-mochy-card peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1DB954]"></div>
                    </label>
                  </div>

                  {/* Remote Playlists List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-mochy-subtext uppercase tracking-wider">
                        Chọn danh sách phát cần nhập ({selectedPlaylistIds.length}/
                        {remotePlaylists.length}):
                      </span>

                      <button
                        onClick={handleToggleSelectAll}
                        className="text-xs text-[#1DB954] hover:underline font-semibold"
                      >
                        {selectedPlaylistIds.length === remotePlaylists.length
                          ? "Bỏ chọn tất cả"
                          : "Chọn tất cả"}
                      </button>
                    </div>

                    {isLoadingPlaylists ? (
                      <div className="py-8 text-center text-mochy-subtext space-y-2">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#1DB954]" />
                        <p className="text-xs">Đang tải danh sách playlist từ Spotify...</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {remotePlaylists.map((pl) => {
                          const isSelected = selectedPlaylistIds.includes(pl.id);
                          return (
                            <div
                              key={pl.id}
                              onClick={() => handleToggleSelectPlaylist(pl.id)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-mochy-sidebar border-[#1DB954]/50 shadow-sm"
                                  : "bg-mochy-card/50 border-mochy-border/60 hover:bg-mochy-card"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#1DB954] flex-shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-mochy-subtext flex-shrink-0" />
                                )}

                                {pl.coverUrl ? (
                                  <img
                                    src={pl.coverUrl}
                                    alt={pl.name}
                                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-mochy-card flex items-center justify-center flex-shrink-0">
                                    {pl.isLiked ? (
                                      <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                                    ) : (
                                      <Music className="w-4 h-4 text-mochy-subtext" />
                                    )}
                                  </div>
                                )}

                                <div className="truncate">
                                  <h5 className="font-semibold text-xs text-white truncate">
                                    {pl.name}
                                  </h5>
                                  <p className="text-[11px] text-mochy-subtext">
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
                    <div className="pt-3 flex justify-end">
                      <button
                        onClick={handleStartSyncSelected}
                        disabled={selectedPlaylistIds.length === 0}
                        className="px-6 py-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  );
};
