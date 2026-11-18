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

## 📥 Tải về và Cài đặt nhanh (Dành cho Windows)

Bạn có thể tải ngay phiên bản chính thức mới nhất của Tày Music tại đây:

<p align="center">
  <a href="https://github.com/TeXfRuV50/tay-music/releases/latest">
    <img src="https://img.shields.io/badge/%E2%9E%A4%20T%E1%BA%A3i%20xu%E1%BB%91ng%20b%E1%BA%A3n%20m%E1%BB%9Bi%20nh%E1%BA%A5t%20(Releases)-2ea44f?style=for-the-badge&logo=github&logoColor=white" height="42" alt="Tải bản mới nhất" />
  </a>
</p>

Tại trang phát hành (Releases), bạn chọn một trong hai định dạng tệp tùy theo nhu cầu:

| Tệp tải về | Loại bản | Mô tả & Cách dùng |
| :--- | :--- | :--- |
| **`Tay Music Setup 1.0.0.exe`** | **Bộ cài đặt (Khuyên dùng)** | Tự động cài đặt vào máy tính, tạo shortcut trên màn hình Desktop và trong Start Menu để tiện mở ứng dụng hàng ngày. |
| **`Tay Music-1.0.0-Portable.exe`** | **Bản Portable (Chạy ngay)** | Không cần cài đặt. Tải về nhấp đúp chuột là nghe nhạc được ngay, có thể copy vào USB để nghe trên nhiều máy tính khác nhau. |

> [!NOTE]
> ### 🛡️ Lưu ý về cảnh báo bảo vệ của Windows (SmartScreen)
> Do **Tày Music** là phần mềm mã nguồn mở cá nhân và phi lợi nhuận (chưa đăng ký chứng chỉ số trả phí từ Microsoft), khi bạn mở file `.exe` lần đầu tiên, Windows có thể hiển thị hộp thoại màu xanh với thông báo:  
> **"Windows protected your PC" (Windows đã bảo vệ máy tính của bạn)**.  
> 
> **Cách xử lý rất đơn giản:**  
> 1. Nhấp vào dòng chữ gạch chân **"More info"** *(Thông tin khác)*.  
> 2. Chọn nút **"Run anyway"** *(Vẫn chạy)*. Ứng dụng sẽ khởi động bình thường và hoàn toàn an toàn.

---

## 🌟 Giới thiệu & Tính năng nổi bật

**Tày Music** là ứng dụng nghe nhạc desktop được thiết kế tối giản, tập trung vào sự mượt mà và chất lượng âm thanh cao:

### 1. 🎧 Nghe nhạc chất lượng cao & Không gián đoạn
- **Công nghệ Chunked Audio Proxy**: Phân tách luồng nhạc thành các chunk 512 KB mô phỏng cơ chế ExoPlayer, loại bỏ triệt để hiện tượng bị đứng bài hay ngắt kết nối sau 3 giây đầu.
- **Tua nhạc siêu tốc (Instant Seeking)**: Nhảy đến bất kỳ đoạn nào của bài hát ngay tức khắc, không có độ trễ tải lại.
- **Tự động thử lại khi mất mạng**: Giữ luồng phát liên tục ngay cả khi đường truyền chập chờn.

### 2. 🎤 Lời bài hát Karaoke đồng bộ thời gian thực
- **Tổng hợp đa nguồn (Multi-provider)**: Tự động tìm kiếm và đối chiếu lời bài hát từ **LrcLib**, **KuGou** và **NetEase**.
- **Chạy chữ chính xác từng giây**: Cuộn mượt mà và làm sáng rõ từng câu hát theo đúng giai điệu đang phát.

### 3. 🟢 Nhập & Đồng bộ danh sách phát từ Spotify
- **Lấy trọn vẹn 100% bài hát**: Dán link playlist Spotify công khai để nhập toàn bộ danh sách, không bị cắt xén ở 100 bài đầu tiên.
- **Đăng nhập Spotify tích hợp**: Đồng bộ nhanh danh sách *Bài hát đã thích (Liked Songs)* và các playlist cá nhân.
- **Thuật toán so khớp TrackMatcher**: Khớp bài chuẩn xác theo thời lượng bản thu ($\le 4\text{s}$) và ca sĩ chính; tự động loại trừ các bản remix/cover không mong muốn.
- **Đổi phiên bản dễ dàng (Fix Match)**: Cho phép chủ động chọn lại phiên bản hoặc bản live yêu thích chỉ với một cú nhấp chuột.

### 4. 🎨 Giao diện Dark Mode & Tối ưu hiệu năng
- Thiết kế tông tối hiện đại, thanh thoát, lấy cảm hứng từ phong cách trình phát nhạc đương đại.
- **Màu nhấn động (Dynamic Color)**: Màu sắc thanh điều khiển và hiệu ứng tự đổi nhẹ nhàng theo ảnh bìa của bài hát đang phát.
- **Nhẹ RAM và GPU**: Không sử dụng các hiệu ứng shader làm mờ phức tạp, đảm bảo máy tính cấu hình văn phòng hay tầm trung đều chạy mát và mượt.

### 5. 💾 Quản lý thư viện cục bộ (Offline Database)
- Toàn bộ danh sách yêu thích, playlist tạo thêm và lịch sử nghe nhạc được lưu trữ an toàn trong máy tính của bạn thông qua SQLite (`better-sqlite3`).

---

## 💻 Dành cho lập trình viên (Build từ mã nguồn)

Nếu bạn là lập trình viên và muốn đóng góp mã nguồn hoặc tự build ứng dụng từ source code:

### Yêu cầu môi trường
- Hệ điều hành: Windows 10 / 11 (64-bit)
- [Node.js](https://nodejs.org/) phiên bản 20 trở lên
- Quản lý gói `npm`

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

3. **Chạy ứng dụng trong môi trường phát triển (Development Mode)**:
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
   *Các file `.exe` hoàn chỉnh sẽ nằm trong thư mục `release/`.*

---

## 👏 Ghi nhận & Tri ân / Credits & Acknowledgments

Dự án **Tày Music** được phát triển với sự tham khảo sâu sắc về kiến trúc trích xuất luồng InnerTube và cơ chế xử lý âm thanh từ dự án mã nguồn mở Android:
- **[Mochy Music](https://github.com/)** – Ứng dụng nghe nhạc mã nguồn mở xuất sắc trên Android. Xin gửi lời cảm ơn và tri ân chân thành tới đội ngũ tác giả của Mochy Music vì những đóng góp quý báu cho cộng đồng.

---

## 📄 Giấy phép / License

Dự án này được phân phối theo giấy phép mã nguồn mở **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)**.
