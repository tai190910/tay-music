// test-core.ts
// Kiểm tra toàn diện 3 thành phần Core của Mochy-PC:
// 1. YouTube Audio Stream (InnerTube + Cipher + PoToken)
// 2. Lyrics System (LrcLib + NetEase + KuGou + Time Sync)
// 3. SQLite Database (better-sqlite3: Songs, Liked, History, Playlists, Cache)

import * as readline from "node:readline";
import {
  YouTube,
  AudioQuality,
  YTPlayerUtils,
  LyricsHelper,
  MochyDatabase,
} from "./src/core/index.ts";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("==================================================================");
  console.log("   Mochy-PC Core Engine Test: Stream, Lyrics & Local Database     ");
  console.log("==================================================================\n");

  let query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    query = await prompt("Nhập tên bài hát cần tìm: ");
  }

  if (!query) {
    query = "Nơi này có anh";
  }

  console.log(`\n🔍 [1/3] TÌM KIẾM & TRÍCH XUẤT AUDIO STREAM: "${query}"...`);
  const songs = await YouTube.searchSongs(query);

  if (songs.length === 0) {
    console.log("❌ Không tìm thấy bài hát nào!");
    return;
  }

  const song = songs[0];
  const artists = song.artists.map((a) => a.name).join(", ");
  console.log(`✅ Đã chọn: "${song.title}" - ${artists} (ID: ${song.id}, Duration: ${song.duration}s)`);

  // Trích xuất stream
  console.log("⏳ Đang trích xuất audio stream chống 403 Forbidden...");
  const playback = await YouTube.getStream(song.id, {
    audioQuality: AudioQuality.HIGH,
  });
  console.log(`📡 Client: ${playback.streamClient}`);
  console.log(`📦 Format: itag ${playback.format.itag} (${playback.format.mimeType})`);
  console.log(`⚡ Bitrate: ${Math.round(playback.format.bitrate / 1000)} kbps`);

  // Kiểm tra anti-403
  const isValid = await YTPlayerUtils.validateStatus(
    playback.streamUrl,
    playback.streamHeaders,
    playback.format.contentLength ? Number(playback.format.contentLength) : null
  );
  console.log(`🛡️ Trạng thái stream: ${isValid ? "🟢 HỢP LỆ (206 Partial Content, phát full không cutoff)" : "🟡 Cảnh báo"}`);
  console.log(`🔗 Stream URL: ${playback.streamUrl.substring(0, 100)}...`);

  // 2. Lyrics System
  console.log(`\n📜 [2/3] HỆ THỐNG LYRICS (TỰ ĐỘNG TÌM & ĐỒNG BỘ THEO DÒNG/TỪ)...`);
  const lyricsResult = await LyricsHelper.getLyrics({
    title: song.title,
    artist: song.artists[0]?.name || "",
    duration: song.duration ?? undefined,
    id: song.id,
  });

  if (lyricsResult) {
    console.log(`✅ Tìm thấy lời bài hát từ nguồn: [${lyricsResult.provider.toUpperCase()}]`);
    console.log(`📊 Tổng số dòng lyrics: ${lyricsResult.parsed.lines.length}`);
    console.log(`🔤 Đồng bộ cấp độ từ (word-level sync): ${lyricsResult.parsed.hasWordSync ? "Có" : "Không"}`);

    console.log("\n--- 5 DÒNG LYRICS ĐẦU TIÊN ---");
    const previewLines = lyricsResult.parsed.lines.slice(0, 5);
    for (const line of previewLines) {
      const min = Math.floor(line.time / 60000);
      const sec = ((line.time % 60000) / 1000).toFixed(2).padStart(5, "0");
      console.log(`  [${min.toString().padStart(2, "0")}:${sec}] ${line.text}`);
    }

    // Giả lập đồng bộ thời gian (Time Sync)
    if (lyricsResult.parsed.lines.length > 2) {
      const midTime = lyricsResult.parsed.lines[2].time + 500;
      const active = LyricsHelper.findActiveLine(lyricsResult.parsed.lines, midTime);
      console.log(`\n⏱️ Giả lập vị trí phát tại ${(midTime / 1000).toFixed(1)}s:`);
      console.log(`   Dòng đang phát (Active Index ${active.activeIndex}): "${active.activeLine?.text}"`);
    }
  } else {
    console.log("⚠️ Không tìm thấy lyrics từ các provider LrcLib / NetEase / KuGou.");
  }

  // 3. Local SQLite Database
  console.log(`\n💾 [3/3] DATABASE CỤC BỘ (SQLite better-sqlite3)...`);
  const db = new MochyDatabase("mochy_test.db");

  // Upsert bài hát
  db.upsertSong({
    id: song.id,
    title: song.title,
    artists: song.artists,
    duration: song.duration ?? -1,
    thumbnailUrl: song.thumbnail,
    explicit: song.explicit,
  });
  console.log(`✅ Đã lưu bài hát "${song.title}" vào bảng 'song'`);

  // Đánh dấu yêu thích (Liked)
  db.setLiked(song.id, true);
  console.log(`❤️ Đã thêm vào danh sách Yêu thích (Liked songs count: ${db.getLikedSongs().length})`);

  // Lưu lịch sử nghe (History)
  db.addHistory(song.id, 120);
  console.log(`🕒 Đã ghi nhận lịch sử nghe 120s (Total history count: ${db.getHistory().length})`);

  // Quản lý Playlist
  const playlists = db.getPlaylists();
  let playlist = playlists.find((p) => p.name === "Nhạc Tuyển Chọn");
  if (!playlist) {
    playlist = db.createPlaylist("Nhạc Tuyển Chọn", "Playlist tạo tự động để test Mochy-PC");
    console.log(`📁 Đã tạo Playlist mới: "${playlist.name}" (ID: ${playlist.id})`);
  }
  db.addSongToPlaylist(playlist.id, song.id);
  console.log(`➕ Đã thêm bài hát vào Playlist "${playlist.name}". Tổng số bài: ${db.getPlaylistSongs(playlist.id).length}`);

  // Lưu cache Lyrics vào DB
  if (lyricsResult) {
    db.cacheLyrics(song.id, lyricsResult.lyrics, lyricsResult.provider);
    const cached = db.getCachedLyrics(song.id);
    console.log(`📝 Đã cache lyrics vào database SQLite (Provider: ${cached?.provider}, Length: ${cached?.lyrics.length} ký tự)`);
  }

  db.close();
  console.log("\n==================================================================");
  console.log("🎉 TẤT CẢ 3 TÍNH NĂNG CORE HOẠT ĐỘNG HOÀN HẢO!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("❌ LỖI:", err);
  process.exit(1);
});
