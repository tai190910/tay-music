# Tày Music 🎵

<p align="center">
  <strong>Trình phát nhạc Desktop hiện đại, tối giản và hiệu năng cao dành cho Windows.</strong><br>
  <em>A modern, lightweight, and high-performance desktop music player built for Windows.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="License: GPL-3.0" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&logoColor=white" alt="TailwindCSS v4" />
  <img src="https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
</p>

---

## 🌟 Giới thiệu / Overview

**Tày Music** là ứng dụng nghe nhạc Desktop mã nguồn mở được tối ưu hóa riêng cho hệ điều hành Windows. Ứng dụng mang lại trải nghiệm nghe nhạc mượt mà từ kho nhạc trực tuyến chất lượng cao, đồng bộ lời bài hát chạy karaoke theo thời gian thực, nhập playlist từ Spotify và quản lý thư viện cá nhân hoàn toàn trên máy tính mà không gây nặng RAM hay ngốn GPU.

> **English Summary**: *Tày Music is an open-source desktop music player for Windows built with Electron, React 19, Vite, and SQLite. It features high-quality audio streaming with a custom chunked proxy, real-time synchronized karaoke lyrics, full Spotify playlist import & auto-sync, intelligent track matching, and an ultra-responsive dark-mode interface.*

---

## ✨ Tính năng nổi bật / Key Features

### 1. Trình phát nhạc chất lượng cao & Chunked Stream Proxy
- **Chunked Audio Streaming**: Mô phỏng cơ chế `ChunkDataSource` của ExoPlayer trên Android, chia nhỏ luồng tải thành các khối **512 KB** kèm tham số xoay vòng `&rn=`, khắc phục triệt để lỗi Google bóp băng thông hoặc ngắt kết nối sau 3 giây đầu.
- **Can thiệp Header mạng toàn cục**: Tự động loại bỏ các header rò rỉ trình duyệt (`Origin`, `Referer`) và áp dụng User-Agent chuẩn cho mọi yêu cầu tới server stream.
- **Khả năng phục hồi kết nối (Auto Retry)**: Tự động thử lại đến 3 lần khi mạng gián đoạn, đảm bảo bài hát không bị đứng giữa chừng.
- **Tua nhạc tức thì (Instant Seeking)**: Phản hồi thao tác tua thanh thời gian theo mili-giây mà không cần tải lại từ đầu.

### 2. Hệ thống lời bài hát Karaoke đồng bộ thời gian thực
- **Đa nguồn tìm kiếm (Multi-provider)**: Tự động tổng hợp và ưu tiên lời bài hát từ **LrcLib**, **KuGou** và **NetEase**.
- **Chính xác theo từng dòng**: Hỗ trợ định dạng LRC có timestamp, cuộn chữ mượt mà và làm nổi bật câu hát đang phát.

### 3. Nhập & Đồng bộ hóa danh sách phát Spotify (100% Full Import)
- **Nhập từ URL công khai**: Cho phép dán link playlist Spotify bất kỳ. Tích hợp cơ chế cào dữ liệu qua DevTools Protocol để lấy trọn vẹn 100% số bài (không bị giới hạn 100 bài của Spotify Embed).
- **Đăng nhập Spotify an toàn**: Đăng nhập trực tiếp qua cửa sổ trình duyệt nhúng để tự động đồng bộ *Liked Songs* và *Private Playlists*.
- **Thuật toán TrackMatcher thông minh**:
  - Giới hạn sai lệch thời lượng nghiêm ngặt ($|\Delta t| \le 4\text{s}$).
  - Ép buộc đối chiếu nghệ sĩ chính (Primary Artist) chính xác.
  - Tự động trừ điểm các bản phối sai lệch (remix, cover, live, sped up) nếu bài gốc là bản thu chuẩn.
  - Ưu tiên bản phát hành chính thức (`- Topic` / Official Audio).
- **Tính năng Đổi phiên bản (Fix Match)**: Cho phép người dùng linh hoạt xem danh sách ứng cử viên YouTube và đổi bản phối mong muốn trực tiếp trong giao diện.

### 4. Giao diện Dark Mode & Tối ưu hiệu năng
- **Hiện đại & Tinh tế**: Bố cục trực quan với thanh điều hướng bên trái, thanh điều khiển phát nhạc cố định dưới đáy và màn hình hiển thị lời bài hát rộng rãi.
- **Màu sắc động (Dynamic Accent Color)**: Tự động trích xuất bảng màu chủ đạo từ ảnh bìa bài hát đang phát.
- **Tối ưu phần cứng**: Loại bỏ các hiệu ứng blur/shader nặng nề, giữ mức tiêu thụ RAM và CPU luôn ở mức tối thiểu trên các cấu hình máy tầm trung.

### 5. Cơ sở dữ liệu SQLite cục bộ (Offline-First)
- Sử dụng `better-sqlite3` lưu trữ toàn bộ lịch sử nghe nhạc, bài hát yêu thích, danh sách phát cá nhân và cache metadata ngay trên máy tính của bạn.

---

## 🛠️ Công nghệ sử dụng / Tech Stack

- **Core & Runtime**: [Node.js](https://nodejs.org/), [Electron](https://www.electronjs.org/) (v45.x)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [TailwindCSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) (Icons)
- **Database**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Audio & Reverse Engineering**: InnerTube Client, Cipher & n-transform Solver, PoToken Generator

---

## 🚀 Hướng dẫn cài đặt & Chạy từ Source

### Yêu cầu hệ thống (Prerequisites)
- Hệ điều hành: Windows 10 / 11 (64-bit)
- [Node.js](https://nodejs.org/) version 20 trở lên
- npm hoặc yarn / pnpm

### Các bước thực hiện

1. **Clone repository về máy**:
   ```bash
   git clone https://github.com/<username>/tay-music.git
   cd tay-music
   ```

2. **Cài đặt dependencies**:
   ```bash
   npm install
   ```

3. **Chạy ứng dụng ở môi trường phát triển (Development Mode)**:
   ```bash
   # Khởi chạy đồng thời giao diện Vite và Electron Main Process
   npm start
   ```
   *Hoặc chạy riêng biệt giao diện:*
   ```bash
   npm run dev:ui
   ```

4. **Đóng gói bộ cài đặt Windows (.exe)**:
   ```bash
   # Đóng gói cả bản cài đặt NSIS và bản Portable
   npm run dist

   # Hoặc chỉ tạo bản Portable chạy ngay:
   npm run dist:portable

   # Hoặc chỉ tạo bộ cài đặt NSIS:
   npm run dist:nsis
   ```
   *File thực thi sau khi hoàn tất sẽ nằm trong thư mục `release/`.*

---

## 👏 Ghi nhận & Tri ân / Acknowledgments & Credits

Dự án **Tày Music** được phát triển với sự tham khảo sâu sắc về kiến trúc và thuật toán trích xuất stream InnerTube từ dự án mã nguồn mở Android:
- **[Mochy Music](https://github.com/)** – Trình phát nhạc Android mã nguồn mở tuyệt vời phát triển bởi Mochy Music Team. Xin gửi lời cảm ơn chân thành tới các tác giả của Mochy Music vì những đóng góp quý giá cho cộng đồng mã nguồn mở.

---

## 📄 Giấy phép / License

Dự án này được phát hành dưới giấy phép **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)**. Bạn hoàn toàn có quyền tự do sử dụng, chỉnh sửa và phân phối lại mã nguồn theo các điều khoản của giấy phép này.
