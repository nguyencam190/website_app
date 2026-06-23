# Archive — Ghi chú bug đã fix

## Session 2026-06-23

### Bug 1 — `toggleTheme` không swap tức thì (`editor.js`)

**Triệu chứng:** Khi đổi light/dark mode, một số element fade 0.25s trong khi element khác snap ngay → tạo trạng thái nửa-vời xám xịt trông như lỗi/chậm.

**Nguyên nhân:** Hàm `toggleTheme` trong module `js/components/editor.js` thiếu trick `no-transition`. Fix đã được áp dụng cho `index.html` nhưng chưa mirror sang module.

**Fix:**
```js
export function toggleTheme() {
  const html = document.documentElement;
  html.classList.add('no-transition');      // tắt transition
  // ... đổi data-theme, setProperty, swapThemeColors ...
  void html.offsetWidth;                    // force reflow
  html.classList.remove('no-transition');   // bật lại transition
}
```

---

### Bug 2 — Embed block không render sau khi đổi URL (`slashMenu.js`)

**Triệu chứng:** Khi block được save mà không có `<iframe>` (edge case), click nút "Sửa URL" cập nhật `dataset.embedUrl` nhưng video không hiện.

**Nguyên nhân:** `_cfEmbedLoadAll` chỉ gán `iframe.src` nếu iframe đã tồn tại, không tạo mới nếu thiếu.

**Fix:** Tạo `<iframe>` mới rồi prepend vào `wrap` trước khi gán `src`.

---

### Bug 3 — Drop/paste ảnh vào bảng tạo ra N bản sao (`tables.js`)

**Triệu chứng:** Sau N lần `openDoc()`, mỗi lần thả hoặc dán ảnh vào ô bảng sẽ chèn N bản sao thay vì 1.

**Nguyên nhân:** `tblAttachTable` không có guard kiểm tra xem cell đã wire listener chưa. Mỗi lần gọi hàm này (khi openDoc, thêm/xóa cột/hàng, paste) đều wire thêm 1 bộ `drop` + `paste` listener vào mỗi cell.

**Fix:** Thêm flag `cell._tblListened = true` để mỗi cell chỉ được wire một lần.

---

### Ghi chú chung

Cả 3 bug đều có cùng pattern: fix đã được áp dụng cho code monolithic trong `index.html` nhưng **chưa được mirror sang các file module** (`js/components/*.js`). Khi refactor SPA → modular, cần đảm bảo sync cả hai.
