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

## Quy tắc Chuyển tiếp (Transition) — Phải luôn mượt mà

**Nguyên tắc bất biến:** MỌI chuyển tiếp trên **app** lẫn **web publisher** đều PHẢI mượt mà — không giật, không có trạng thái nửa-vời (half-state), không chậm. Áp dụng cho: đổi light/dark mode, đổi accent, mở/đóng sidebar, ẩn/hiện PAB, focus mode…

### Đổi light/dark mode — bắt buộc swap tức thì (instant), không fade lệch nhau:
- **Vấn đề kinh điển:** một số element có `transition` (body, main, canvas dùng `var(--tr)`) trong khi element khác KHÔNG có (ví dụ `.ws-header` màu cố định `#1a1a1a`→`#0d1117`). Khi đổi theme, cái thì fade 0.25s, cái thì snap ngay → tạo trạng thái nửa-vời xám xịt, trông như "lỗi/chậm".
- **Cách fix đúng (đã áp dụng cho cả app lẫn publisher):**
  1. Thêm class tắt transition: `html.no-transition *` (app) / `html.ws-anim-off *` (publisher) → `{transition:none!important;animation:none!important}`
  2. Trong hàm toggle (`toggleTheme` / `wsToggleTheme`): **add class → đổi `data-theme` → swap màu/accent → `void html.offsetWidth` (FORCE REFLOW) → remove class**
  3. **BẮT BUỘC dùng `void html.offsetWidth` để ép reflow, KHÔNG dùng `requestAnimationFrame`.** rAF chạy TRƯỚC khi browser paint → class bị gỡ trước khi theme mới được vẽ → transition vẫn chạy → class tắt-transition thành vô dụng. Force reflow commit style mới ngay trong lúc transition đang tắt → swap tức thì 1 frame.

### Verify (bắt buộc, không chỉ đọc code):
- Toggle theme → đọc `getComputedStyle(mainEl).backgroundColor` qua 6–8 frame liên tiếp (`requestAnimationFrame`). Nếu mượt-đúng: chỉ có **1 giá trị duy nhất** (light→dark trong 1 frame). Nếu còn nhiều giá trị trung gian → vẫn còn fade lệch, CHƯA đạt.
- Chụp screenshot ngay sau toggle → KHÔNG được thấy vùng xám nửa-vời.

### Khi thêm transition mới:
- Nếu element đổi màu theo theme nhưng nằm ngoài luồng tắt-transition, phải đảm bảo nó cũng được class `*` quét tới (đặt selector đủ rộng).
- KHÔNG để một element fade lâu hơn các element khác trong cùng một thao tác đổi theme.

## Quy tắc Block tương tác — Phải REWIRE khi load lại nội dung

**Nguyên tắc bất biến:** MỌI block tương tác (checklist, tabs, toggle, panel, layout cột, progress, status, carousel, embed, image, table…) PHẢI hoạt động đầy đủ chức năng edit sau khi `openDoc()` (mở lại trang), mở lại project, hoặc publish-rồi-edit-tiếp.

### Vì sao dễ hỏng:
- Nội dung lưu bằng `innerHTML` (`_commitContent`) → **mọi event listener bị mất**, và các thanh công cụ UI (`.cf-col-toolbar`, `.cf-panel-actions`, `.cf-img-toolbar`…) **bị strip khi lưu** (chúng là chrome, không phải content).
- Khi load lại (`openDoc`), phải **rewire** lại listener VÀ **dựng lại** toolbar/actions đã bị strip, nếu không block mất khả năng edit (không resize được, không thêm/xóa được, không đổi loại được…).

### Bắt buộc khi thêm block tương tác mới:
1. Viết hàm rewire (`_cfWireXxx` / `_cfXxxRewire` / `_cfXxxLoadAll`) tái tạo listener + UI chrome.
2. Thêm vào **`openDoc()`** (setTimeout block ~line 3668) — gọi cho mọi block trong editor.
3. Thêm vào hàm hợp nhất **`_cfRewireBlock()`** (~line 7887) — dùng cho paste/clone.
4. **Layout cột (`_cfInitLayout`) phải chạy TRƯỚC** các wiring chung, vì nó rebuild column-item từ innerHTML (block lồng bên trong sẽ được wiring chung quét lại sau).
5. **Verify thực tế**: insert block → `_commitContent()` → `openDoc()` lại → kiểm tra toolbar/actions có mặt và listener còn sống (click thử). KHÔNG chỉ dựa vào việc đọc code.

**Lịch sử lỗi:** panel mất nút action (`.cf-panel-actions`) và layout cột mất toolbar/resize sau khi mở lại — do `openDoc` thiếu `_cfInitLayout` và không dựng lại `.cf-panel-actions`. Đã fix bằng `_cfWirePanel`/`_cfPanelLoadAll` + gọi `_cfInitLayout` trong `openDoc`.

## Quy tắc Push/Publisher — Ảnh phải xuất đầy đủ, không lưu trùng

### Nguyên tắc bất biến:
- **Mọi ảnh/video được referenced trong `state.docs` PHẢI có file trong thư mục project sau khi Push** — không được bỏ sót.
- **Không lưu file trùng nội dung** vào folder — cùng blob content chỉ lưu 1 lần.

### Kiến trúc Push (`_projFullSync`):

**Phase 0 — Scan folder thực tế:**
- Quét `images/` và `videos/` để biết chính xác file nào đang tồn tại → `folderFileIds`
- Đồng thời build `folderHashMap` (hash → id) từ các file *đang được referenced* để dedup cross-session
- Đảm bảo tất cả file này có blob trong IDB (tránh race condition với `_projLoadAssetsPromise`)
- **KHÔNG dùng `_projSavedIds` làm nguồn sự thật** — `_projSavedIds` có thể stale nếu file bị xóa ngoài app

**Phase 1 — Lưu ảnh mới, dedup:**
- Với mỗi referenced id:
  - Nếu đã có trong `folderFileIds` → skip (file confirmed exists)
  - Lấy blob từ `_fetchAssetBlob(id)` (IDB → `_objUrls` → folder fallback)
  - Compute SHA-256 hash
  - Nếu hash đã có trong `folderHashMap` → dedup cross-session: lưu `idRedirects[id] = canonId`, không tạo file mới
  - Nếu hash đã có trong `seenHashes` (session hiện tại) → dedup within-session tương tự
  - Còn lại → save file, cập nhật `folderHashMap` và `seenHashes`
- `idRedirects` được truyền sang `_projPublishWebsite` → `doExportOptimized`

**Phase 2 — Xóa orphan + dedup files:**
- File không còn được referenced → xóa
- File là dedup non-canonical (đã có `idRedirects[id]`) → xóa

**Phase 5 — Publish website:**
- `_projPublishWebsite(idRedirects)` nhận map redirects
- `idbToZipAsset(id)` trong reuseAssets mode: kiểm tra `opts.idRedirects` trước — nếu id là dedup, dùng canonical id's file path

### Race condition đã fix:
- `_projLoadFolderAssets` (startup reconnect) chạy background async — lưu promise vào `_projLoadAssetsPromise`
- `_projFullSync` await `_projLoadAssetsPromise` trước khi làm gì — tránh `_idbGet` trả null cho ảnh chưa load vào IDB
- `idbToZipAsset` có fallback đọc thẳng từ folder nếu IDB vẫn thiếu (defense-in-depth)

### Khi thêm loại media mới:
1. Thêm ID collection vào `_collectDocAssetIds` (cả `doc.images` array lẫn `innerHTML` scan)
2. Thêm xử lý trong `idbToZipAsset` nếu cần format đặc biệt
3. Verify: insert media → Push → kiểm tra file trong folder → mở website → ảnh hiển thị

## Quy tắc Dọn dẹp Media — Luôn xóa ảnh/video rác

### Nguyên tắc bất biến:
- **LUÔN xóa ảnh/video không còn được dùng** (orphan) khỏi folder project và IDB sau mỗi Push.
- **LUÔN xóa file trùng nội dung** (deduped non-canonical) — chỉ giữ 1 file duy nhất cho mỗi content.
- Mục tiêu: folder project không bao giờ chứa file rác, tiết kiệm dung lượng, tránh tích lũy theo thời gian.

### Các nguồn sinh ra rác:
- Xóa ảnh khỏi trang → id còn trong IDB và folder nhưng không ai reference
- Import trang có ảnh trùng content với ảnh đã có → 2 file cùng nội dung khác id
- Upload lại cùng 1 ảnh nhiều lần → nhiều id, cùng blob
- Xóa trang nhưng ảnh của trang đó chưa được dọn

### Cơ chế dọn dẹp hiện tại (đã implement):

**Folder (mỗi Push — Phase 2 của `_projFullSync`):**
- File không có id trong `referencedIds` → orphan → xóa ngay
- File có `idRedirects[id]` (dedup non-canonical) → xóa ngay

**IDB (mỗi Push — Phase 3 của `_projFullSync`):**
- Key không có trong `referencedIds` và không phải `PROJ_DIR_IDB_KEY` → xóa khỏi IDB
- Revoke `_objUrls[key]` để giải phóng memory
- Xóa khỏi `_pendingFolderSaves`

**Khi xóa trang (`_purgeDocMedia`):**
- Dọn IDB và `_objUrls` ngay lập tức cho các id chỉ dùng bởi trang đó
- KHÔNG xóa folder ngay — để Push orphan-cleanup xử lý (phòng case user undo)

### Không được bỏ qua:
- Khi thêm tính năng mới có media, phải đảm bảo `_collectDocAssetIds` thu thập đủ id → Phase 2/3 mới dọn được đúng
- Không được xóa file khỏi folder trong luồng edit realtime (chỉ xóa khi Push) — tránh mất ảnh nếu user undo
- Sau khi import trang có ảnh trùng → Push sẽ tự dedup và xóa file thừa, KHÔNG cần xóa thủ công

## Quy tắc Block — Không publish khoảng trống rỗng

**Nguyên tắc bất biến:** Bất kỳ vùng text tùy chọn nào (caption, description, title, subtitle…) **không có nội dung** thì KHÔNG được xuất ra website. Khoảng trắng rỗng mất thẩm mỹ.

### Áp dụng cho TẤT CẢ block có text tùy chọn (trong `doExportOptimized`, bước post-process HTML):

| Block | Element cần kiểm tra | Hành động nếu rỗng |
|---|---|---|
| **Hình / Video** (`.cf-img-block`) | `.cf-img-caption` | `caption.remove()` |
| **Carousel** (`.cf-carousel`) | `.cf-car-slide-caption` | `caption.remove()` |
| **Spotlight** (`.cf-spotlight`) | `.cf-spotlight-title` | `el.remove()` |
| **Spotlight** | `.cf-spotlight-desc` | `el.remove()` |
| **Cards** (`.cf-cards`) | `.cf-card-body` | `body.remove()` nếu cả title lẫn desc rỗng |

### Quy tắc kiểm tra "rỗng":
- `textContent.trim() === ''` VÀ không có ký tự không-khoảng-trắng trong `innerHTML`
- Dùng helper: `const _capEmpty = el => !(el.textContent||'').trim() && !/\S/.test(el.innerHTML||'')`

### Khi thêm block mới có text tùy chọn:
- Thêm vào bước post-process trong `doExportOptimized` ngay sau card body cleanup
- KHÔNG để thẻ rỗng trong HTML xuất ra

## Quy tắc New UI — Icon Rail & Tabbar

### Nguyên tắc bất biến: icon CŨ giữ nguyên, icon MỚI mới thêm

**KHÔNG được style lại hoặc di chuyển icon cũ của app sang vị trí mới trong new UI.**
- Icon/button cũ (đã tồn tại trong old UI) → **giữ nguyên HTML, ẩn bằng CSS nếu đã có bản thay thế ở nơi mới**
- Icon/button mới (thêm riêng cho new UI) → có thể style mới hoàn toàn

### Nguồn sự thật về layout: file thiết kế `/tmp/preview_new_ui.html`

Đây là **bản mockup chuẩn** mà app phải khớp. Mọi quyết định về thứ tự/vị trí icon trong rail, tabbar, statusbar đều theo file này.

### Phân loại icon trong new UI:

**Navigation Rail (`#mainHeader`, 48px fixed left) — CHỨA TẤT CẢ nav + action, thứ tự CHÍNH XÁC (khớp design):**

*Nhóm TRÊN:*
1. `#headerLogoWrap` — [CŨ] **HIỆN** ở đỉnh, style `.rail-logo` (32×32 gradient). `order:1`. Logo DUY NHẤT ở rail — sidebar header chỉ còn text.
2. `#railPagesBtn` (ti-files) — [MỚI] toggle context panel/sidebar. `order:2`
3. `#railSearchBtn` (ti-search) — [MỚI] focus `#searchInput`. `order:3`
4. `#railRecentBtn` (ti-history) — [MỚI] `toggleFlyout('recent',#sbRecentBtn)`. `order:4`
5. `#railStarredBtn` (ti-star) — [MỚI] `toggleFlyout('starred',#sbStarredBtn)`. `order:5`
6. `.rail-div` separator. `order:6`
7. Bell (`hdrNotifDd`, ti-bell) — [CŨ] thông báo. `order:7`
8. `.rail-btn-new` Import (ti-file-import) — [MỚI] import folder/ZIP. `order:8`

*`.rail-space` (flex:1) `order:9` — đẩy nhóm dưới xuống đáy*

*Nhóm DƯỚI:*
10. Save/Export (`hdrExportDd`, ti-device-floppy) — [CŨ] dropdown New/Open/Export. `order:10`
11. `#accentBtnWrap` (accent dot) — [CŨ] `toggleAccentPop()`. `order:11`
12. `#themeToggleBtn` (ti-sun-moon) — [CŨ] `toggleTheme()`. `order:12`
13. `#focusModeBtn` (ti-focus-2) — [CŨ] `toggleFocusMode()`. `order:13`
14. `#projLiveBtn` (Push, ti-world-upload) — [CŨ] `_projToggleLive()`. **Style GRADIENT** (`.rail-push`), `font-size:0` ẩn chữ, chỉ hiện icon. `order:14`
15. `#hdrUserAv` avatar — [CŨ] menu người dùng. `order:15`

**Cơ chế kỹ thuật rail (KHÔNG được phá):**
- `#mainHeader>.hdr-right-group{display:contents!important}` → các nút con (bell/save/accent/theme/focus/push/avatar) trở thành flex item trực tiếp của rail, rồi dùng `order` sắp xen kẽ với các nút rail mới.
- **Dropdown/popup rail phải mở sang PHẢI rail**, KHÔNG dùng CSS `right:0` (bay ra ngoài màn hình trái vì rail chỉ 48px):
  - `hdrToggleDd()` → `_hdrPlaceRailDd()`: `position:fixed; left:trigger.right+8; top:` (clamp viewport).
  - `toggleAccentPop()`: đặt `#accentPop` fixed ở `left:#accentPopBtn.right+8`, clamp.
  - `hdrLogoClick()`: menu ở `left:r.right+8`.
- Help (`hdrHelpDd`) + New-page (+) (`_quickNewRootDoc`) → **ẨN** khỏi rail (design mới không có). Tạo trang mới ở hàng search sidebar.
- Light mode rail tint: `[data-theme="light"] #mainHeader{background:#1e1f2a}`.

**Tabbar (`#newTabRight`, 42px) — CHỈ còn tab + Lock:**
- `#newTabList` — danh sách tab (title đồng bộ trong `updatePageActionBar`).
- `#tabLockBtn` — [MỚI] khóa trang (per-page, không có bản ở rail → GIỮ).
- Focus/Theme/Accent/Push trong tabbar → **ẨN** (`#newTabRight button[onclick*="toggleFocusMode/toggleTheme/toggleAccentPop"]`, `#tabPushBtn`, `.tb-sep-new`) vì đã chuyển hết xuống rail.

### Sidebar header — chỉ còn TEXT (khớp design):
- `#sbSpaceIcon` (`.sb-space-icon`) — **ẨN** vì logo đã ở rail. Tránh 2 logo.
- `.sb-space-name` — `font-size:15px;font-weight:700`.

### Khi thêm tính năng mới có button/icon:
1. Nav/context/action toàn cục → thêm vào **rail** (nav → nhóm trên, action → nhóm dưới).
2. Action per-page (như lock) → tabbar.
3. **KHÔNG** đưa cùng 1 chức năng vào cả hai nơi (tránh duplicate).
4. Button JS cũ (có `id` được JS tham chiếu) → giữ HTML, style lại, dùng `order` đặt vị trí.
5. Dropdown/popup đặt trong rail → PHẢI mở sang phải (fixed + left=trigger.right+8), KHÔNG dùng `right:0` tĩnh.
