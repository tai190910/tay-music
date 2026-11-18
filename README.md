# Tày Music 🎵

<p align="center">
  <strong>Trình phát nhạc Desktop hiện đại, tối giản và mượt mà dành cho Windows.</strong><br>
  <em>A modern, lightweight, and high-performance desktop music player built for Windows.</em>
</p>

<p align="center">
  <a href="https://github.com/TeXfRuV50/tay-music/releases/latest">
    <img src="https://img.shields.io/github/v/release/TeXfRuV50/tay-music?color=blue&label=T%E1%BA%A3i%20v%E1%BB%81%20ngay%20(Windows)&logo=windows" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="License: GPL-3.0" />
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-45.x-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black" alt="React 19" />
</p>

---

## 📥 Tải về & Cài đặt nhanh (Dành cho người dùng Windows)

Tải ngay phiên bản phát hành mới nhất của Tày Music tại đường dẫn sau:

<p align="center">
  <a href="https://github.com/TeXfRuV50/tay-music/releases/latest">
    <img src="https://img.shields.io/badge/%E2%9E%A4%20T%E1%BA%A3i%20xu%E1%BB%91ng%20b%E1%BA%A3n%20m%E1%BB%9Bi%20nh%E1%BA%A5t%20(Releases)-2ea44f?style=for-the-badge&logo=github&logoColor=white" height="42" alt="Tải bản mới nhất" />
  </a>
</p>

Tại trang [Releases](https://github.com/TeXfRuV50/tay-music/releases/latest), bạn có thể lựa chọn 1 trong 2 phiên bản phù hợp với nhu cầu:

| Tệp cài đặt (.exe) | Phiên bản | Mô tả & Cách sử dụng |
| :--- | :--- | :--- |
| **`Tay Music Setup 1.0.0.exe`** | **Bản cài đặt đầy đủ (Khuyên dùng)** | Tự động cài đặt vào hệ thống Windows, tự tạo biểu tượng shortcut ngoài màn hình Desktop và trong Start Menu để tiện mở ứng dụng hàng ngày. |
| **`Tay Music-1.0.0-Portable.exe`** | **Bản Portable (Chạy ngay)** | Không cần cài đặt. Tải về nhấp đúp chuột là phát nhạc được ngay, có thể copy vào USB để mang theo và sử dụng trên nhiều máy tính khác nhau. |

> [!NOTE]
> ### 🛡️ Lưu ý về cảnh báo bảo vệ của Windows (SmartScreen)
> Do **Tày Music** là dự án mã nguồn mở phát triển độc lập phi lợi nhuận (chưa đăng ký chứng chỉ số thương mại đắt tiền từ Microsoft), khi bạn mở file `.exe` lần đầu tiên, Windows SmartScreen có thể hiển thị cảnh báo:  
> **"Windows protected your PC" (Windows đã bảo vệ máy tính của bạn)**.  
> 
> **Cách xử lý rất đơn giản:**  
> 1. Nhấp chuột vào dòng chữ **"More info"** *(Thêm thông tin)* trên bảng cảnh báo.  
> 2. Chọn nút **"Run anyway"** *(Vẫn chạy)*. Ứng dụng sẽ khởi động bình thường và hoàn toàn an toàn cho thiết bị của bạn.

---

## 🌟 Giới thiệu & Tính năng chính

**Tày Music** là ứng dụng nghe nhạc desktop dành riêng cho Windows, hướng tới trải nghiệm âm thanh mượt mà, giao diện tinh tế và tiêu tốn cực ít tài nguyên phần cứng:

- 🎧 **Nghe nhạc chất lượng cao & Ổn định**: Tích hợp cơ chế Chunked Stream Proxy chia nhỏ dữ liệu thành từng khối 512 KB, chống bóp băng thông và loại bỏ hoàn toàn lỗi ngắt kết nối sau 3 giây đầu. Hỗ trợ tua nhạc tức thì (Instant Seeking) theo từng mili-giây.
- 🎤 **Tự động đồng bộ lời bài hát Karaoke (LRC)**: Tự động tìm kiếm và đối chiếu lời bài hát từ các nguồn uy tín (**LrcLib**, **KuGou**, **NetEase**), cuộn mượt và highlight từng câu hát khớp với giai điệu theo thời gian thực.
- 🟢 **Nhập & Đồng bộ danh sách phát từ Spotify**: Nhập 100% số lượng bài hát từ link playlist Spotify công khai (không bị chặn ở mốc 100 bài). Tích hợp thuật toán so khớp `TrackMatcher` chuẩn xác theo thời lượng và ca sĩ, kèm tính năng **Đổi phiên bản (Fix Match)** trực tiếp trên giao diện.
- 🎨 **Giao diện Dark Mode tối ưu nhẹ máy**: Thiết kế tông tối hiện đại, tự động trích xuất màu chủ đạo từ ảnh bìa album bài hát đang phát. Tắt các hiệu ứng làm mờ nặng nề để đảm bảo máy tính cấu hình văn phòng hay tầm trung đều chạy mát và mượt mà.
- 💾 **Lưu trữ cục bộ an toàn**: Toàn bộ lịch sử nghe nhạc, bài hát yêu thích và danh sách phát cá nhân được lưu trữ offline trên máy thông qua SQLite (`better-sqlite3`).

---

## 💻 Dành cho lập trình viên (Build từ mã nguồn)

Dành cho những ai muốn tự đóng gói từ mã nguồn hoặc tham gia phát triển dự án:

### Yêu cầu môi trường
- Hệ điều hành: Windows 10 / 11 (64-bit)
- [Node.js](https://nodejs.org/) phiên bản 20 trở lên
- Trình quản lý gói `npm`

### Các bước cài đặt và khởi chạy

1. **Clone mã nguồn về máy**:
   ```bash
   git clone https://github.com/TeXfRuV50/tay-music.git
   cd tay-music
   ```

2. **Cài đặt các thư viện phụ thuộc**:
   ```bash
   npm install
   ```

3. **Chạy ứng dụng trong môi trường phát triển (Dev Mode)**:
   ```bash
   npm start
   ```

4. **Đóng gói file thực thi `.exe` độc lập**:
   ```bash
   # Đóng gói cả bản Setup NSIS và bản Portable:
   npm run dist

   # Hoặc chỉ tạo riêng bản Portable:
   npm run dist:portable

   # Hoặc chỉ tạo riêng bộ cài đặt NSIS Setup:
   npm run dist:nsis
   ```
   *Các file `.exe` sau khi build xong sẽ được tạo tại thư mục `release/`.*

---

## 👏 Ghi nhận & Tri ân / Credits & Acknowledgments

Dự án **Tày Music** trân trọng ghi nhận và chân thành cảm ơn dự án mã nguồn mở gốc:
- **[Mochy Music](https://github.com/realidkroo/Mochy-Music)** (tác giả **[realidkroo](https://github.com/realidkroo)**) – Trình phát nhạc Android mã nguồn mở tuyệt vời đã cung cấp nền tảng kiến trúc reverse engineering luồng YouTube InnerTube và thuật toán trích xuất lời bài hát để từ đó phát triển nên phiên bản dành cho Windows PC này.

---

## 📄 Giấy phép / License

Dự án này được phát hành dưới giấy phép mã nguồn mở **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)**. Bạn hoàn toàn có quyền sử dụng, chỉnh sửa và đóng góp cho dự án theo các điều khoản của giấy phép.
