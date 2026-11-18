// test-stream.ts

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
  console.log(" Mochy-PC Audio Stream Extractor & Tester (Reverse Engineered)   ");
  console.log("==================================================================\n");

  let query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    query = await prompt("Nhập tên bài hát cần tìm: ");
  }

  if (!query) {
    console.log("⚠️ Tên bài hát không được để trống!");
    process.exit(1);
  }

  console.log(`\n🔍 Đang tìm kiếm trên YouTube Music: "${query}"...`);
  const startTime = Date.now();

  try {
    const songs = await YouTube.searchSongs(query);

    if (songs.length === 0) {
      console.log("❌ Không tìm thấy bài hát nào phù hợp!");
      process.exit(0);
    }

    console.log(`\n✅ Tìm thấy ${songs.length} kết quả:`);
    const displayCount = Math.min(5, songs.length);
    for (let i = 0; i < displayCount; i++) {
      const s = songs[i];
      const artists = s.artists.map((a) => a.name).join(", ");
      const duration = s.durationText || (s.duration ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, "0")}` : "N/A");
      console.log(`  [${i + 1}] ${s.title} - ${artists} (${duration}) [ID: ${s.id}]`);
    }

    const targetSong = songs[0];
    const artistNames = targetSong.artists.map((a) => a.name).join(", ");
    console.log(`\n🎵 Chọn bài hát: "${targetSong.title}" - ${artistNames}`);
    console.log(`🆔 Video ID: ${targetSong.id}`);
    console.log(`🖼️ Thumbnail: ${targetSong.thumbnail}`);

    console.log(`\n⏳ Đang trích xuất link stream audio (Quality: HIGH)...`);
    const streamStart = Date.now();
    const playback = await YouTube.getStream(targetSong.id, {
      audioQuality: AudioQuality.HIGH,
    });
    const streamDuration = Date.now() - streamStart;

    console.log(`\n================== KẾT QUẢ STREAM AUDIO ==================`);
    console.log(`✅ Trích xuất thành công trong: ${streamDuration} ms`);
    console.log(`📡 Client sử dụng: ${playback.streamClient}`);
    console.log(`📦 Format itag: ${playback.format.itag}`);
    console.log(`🎼 MimeType: ${playback.format.mimeType}`);
    console.log(`⚡ Bitrate: ${Math.round(playback.format.bitrate / 1000)} kbps`);
    if (playback.format.contentLength) {
      const mb = (Number(playback.format.contentLength) / (1024 * 1024)).toFixed(2);
      console.log(`📏 Dung lượng file: ${mb} MB (${playback.format.contentLength} bytes)`);
    }
    console.log(`⏱️ Hạn sử dụng stream: ${Math.round(playback.streamExpiresInSeconds / 3600)} giờ (${playback.streamExpiresInSeconds}s)`);

    console.log(`\n🛡️ Kiểm tra URL stream chống lỗi 403 Forbidden...`);
    const isValid = await YTPlayerUtils.validateStatus(
      playback.streamUrl,
      playback.streamHeaders,
      playback.format.contentLength ? Number(playback.format.contentLength) : null
    );

    if (isValid) {
      console.log(`🟢 XÁC THỰC THÀNH CÔNG: Link stream hợp lệ, hỗ trợ 206 Partial Content và phát được toàn bộ bài!`);
    } else {
      console.log(`🟡 CẢNH BÁO: Kiểm tra byte cuối trả về mã không mong muốn.`);
    }

    console.log(`\n🔗 URL STREAM AUDIO THỰC TẾ:`);
    console.log(`${playback.streamUrl}\n`);

    // ================== HỆ THỐNG LYRICS ==================
    console.log(`\n================== LỜI BÀI HÁT (LYRICS) ==================`);
    const lyricsStart = Date.now();
    const lyricsResult = await YouTube.getLyrics(
      targetSong.title,
      targetSong.artists[0]?.name || "",
      targetSong.duration ?? undefined,
      targetSong.id
    );

    if (lyricsResult) {
      console.log(`✅ Lấy lyrics thành công từ: [${lyricsResult.provider.toUpperCase()}] (${Date.now() - lyricsStart} ms)`);
      console.log(`📊 Số dòng: ${lyricsResult.parsed.lines.length} | Có Timestamp: ${lyricsResult.parsed.isSynced ? "Có" : "Không"}`);
      const preview = lyricsResult.parsed.lines.slice(0, 4);
      for (const l of preview) {
        const min = Math.floor(l.time / 60000);
        const sec = ((l.time % 60000) / 1000).toFixed(2).padStart(5, "0");
        console.log(`   [${min.toString().padStart(2, "0")}:${sec}] ${l.text}`);
      }
    } else {
      console.log("ℹ️ Không tìm thấy lyrics trực tuyến cho bài hát này.");
    }

    // ================== DATABASE CỤC BỘ ==================
    console.log(`\n================== DATABASE CỤC BỘ ==================`);
    const db = new MochyDatabase("mochy.db");
    db.upsertSong({
      id: targetSong.id,
      title: targetSong.title,
      artists: targetSong.artists,
      duration: targetSong.duration ?? -1,
      thumbnailUrl: targetSong.thumbnail,
      explicit: targetSong.explicit,
    });
    db.setLiked(targetSong.id, true);
    db.addHistory(targetSong.id, 60);
    if (lyricsResult) {
      db.cacheLyrics(targetSong.id, lyricsResult.lyrics, lyricsResult.provider);
    }
    console.log(`✅ Đã lưu bài hát vào bảng 'song'`);
    console.log(`❤️ Đã thêm vào 'Liked songs' (Tổng: ${db.getLikedSongs().length})`);
    console.log(`🕒 Đã ghi nhận lịch sử nghe (Tổng: ${db.getHistory().length})`);
    if (lyricsResult) {
      console.log(`📝 Đã cache lyrics vào database SQLite`);
    }
    db.close();

    console.log(`==========================================================`);
    console.log(`Tổng thời gian thực thi: ${Date.now() - startTime} ms`);
  } catch (error: any) {
    console.error(`\n❌ LỖI TRÍCH XUẤT:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

main();
