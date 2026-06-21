# Project Rules for Claude

## Git — Luôn commit và push sau mỗi thay đổi

Sau **mỗi lần thay đổi code** trong dự án này, bắt buộc phải:

1. `git add` các file đã thay đổi
2. `git commit` với message mô tả rõ nội dung
3. `git push -u origin claude/refactor-spa-modular-es6-ez2miz`

**Không được bỏ qua bước push.** Mọi thay đổi dù nhỏ cũng phải được publish lên remote.

## Quy tắc UI — Không được thay đổi

### Nút import trên sidebar (`_sbImportClickSmart`)
- **Chỉ chấp nhận ZIP và thư mục** — KHÔNG nhận file JSON
- Click → mở **folder picker** (`importMergePagesFromFolder()`) — KHÔNG mở file picker
- Kéo thả → nhận thư mục hoặc file ZIP
- KHÔNG dùng `<input type="file">` cho click — browser không cho phép chọn cả folder lẫn file ZIP trong cùng một dialog

### "Open project" trong menu 💾 (`_projOpenFolder`)
- **Mở thư mục project** — tải cả data.json + ảnh/video cùng lúc
- Gọi `_projOpenFolder()` — KHÔNG gọi `_openProjectFile()`
- Nằm trong dropdown menu 💾 (item giữa: New project · Open project · Export backup), KHÔNG còn nút 📁 riêng trên header
- KHÔNG đặt trên page action bar — vì khi không có trang nào thì page action bar bị ẩn, sẽ không thấy nút
- Header chỉ còn nút **Push** (`_projToggleLive`) bên cạnh menu 💾

**Nút import sidebar và "Open project" có chức năng riêng biệt, không được gộp hay nhầm lẫn.**

## Quy tắc Publisher — Light/Dark Mode phải khớp App

**Nguyên tắc bất biến:** Bất kỳ thay đổi UI nào trên app cũng PHẢI được phản ánh đúng trên website được publisher, đặc biệt về light/dark mode.

### Quy tắc cụ thể:
- **App dùng màu cố định** (ví dụ header `#1a1a1a` không đổi theo theme) → Publisher phải dùng màu cố định giống hệt, KHÔNG dùng `var(--surface)` hay biến theme
- **App dùng `var(--...)` thay đổi theo theme** (sidebar, main content, PAB) → Publisher phải dùng biến theme tương ứng, KHÔNG hardcode màu cố định
- **App có `[data-theme="dark"]` override** → Publisher phải có override tương đương

### Mapping app → publisher:
| App selector | Publisher equivalent | Ghi chú |
|---|---|---|
| `.header` | `.ws-header` | Luôn dark: `#1a1a1a` / `#0d1117` |
| `.sidebar` | `.ws-sidebar` | Theme-aware: `var(--sb)` |
| `.page-action-bar` | `.ws-pab` | Theme-aware: `var(--surface)` |
| `.editor-content` | `.ws-canvas .editor-content` | Theme-aware |
| Header search `.header-search-inp` | `.ws-search` | Cùng style dark (white text on dark header) |

**Khi thêm tính năng mới có UI:** Luôn kiểm tra và cập nhật cả app CSS lẫn publisher CSS strings (có 2 đường: SPA ~line 12224+ và optimized ~line 14xxx).
