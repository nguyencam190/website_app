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

**Navigation Rail (`#mainHeader`, 48px fixed left) — thứ tự CHÍNH XÁC từ trên xuống (khớp design):**
1. `#headerLogoWrap` — [CŨ] **HIỆN** ở đỉnh rail, style như `.rail-logo` (32×32 gradient). KHÔNG ẩn. `order:1`. Logo là DUY NHẤT ở rail — sidebar header chỉ còn text.
2. `#railPagesBtn` — [MỚI] toggle sidebar. Icon ĐỔI theo trạng thái: `ti-files` (mở) ↔ `ti-layout-sidebar-left-expand` (thu) — swap trong `sbCollapse`/`sbExpand`. `order:2`
3. Save/Export (`hdrExportDd`, ti-device-floppy) — [CŨ] dropdown New/Open/Export project. `order:3`
4. `.rail-btn-new` Import (ti-file-import) — [MỚI] import folder/ZIP. `order:4`
5. `#railStarredBtn` (ti-star) — [MỚI] `railStarToggle()`: đánh dấu YÊU THÍCH **trang hiện tại** (fill `ti-star-filled` `#f59e0b` + `state.starred` + renderSidebar), KHÔNG mở flyout. `_railStarSync()` cập nhật icon theo trang mở (gọi trong `openDoc`). `order:5`

> **Logo rail** (`_hdrLogoInit`): ảnh upload PHẢI lấp đầy khung cố định 40×40 (`object-fit:cover`, box giữ `width:40px;height:40px`) — KHÔNG để box co giãn theo kích thước ảnh (`width:auto`).
6. Bell (`hdrNotifDd`, ti-bell) — [CŨ] thông báo. `order:6`
7. `.rail-div` separator. `order:7`
8. `.rail-space` (flex:1) đẩy nhóm dưới xuống đáy. `order:8`
9. Help (`hdrHelpDd`, ti-help-circle) — [CŨ] trợ giúp. `order:9`
10. `#hdrUserAv` avatar — [CŨ] menu người dùng. `order:10`

> **Actions (Focus/Theme/Accent/Push/Outline) nằm ở TABBAR** (`#newTabRight`), KHÔNG ở rail — theo design upload `259b2af7-preview_new_ui.html`.

### Outline panel "On this page" (`#tabOutlineBtn` ≡ → `#docOutline`)
- Nút ≡ (`ti-list`) cuối tabbar `toggleDocOutline()` → sổ panel `position:fixed;right:0` rộng 250px (giữa tabbar 42px và statusbar 28px).
- `buildDocOutline()` quét `#editor h1,h2,h3` (bỏ heading rỗng), dựng danh sách `.ol-item` (h2→`.lvl2`, h3→`.lvl3` thụt lề). Gắn `data-ol-id` lên heading.
- Click item → `_olScrollTo()` cuộn `#editorScroll` tới heading (smooth), set `.active`.
- Có mục **Page info** (`.ol-sep` + `.ol-h` + `.ol-meta-row`): Tạo (`doc.createdAt`), Cập nhật (`_relTime(doc.updatedAt)`), Số từ (`editor.innerText` — KHÔNG dùng `textContent` vì block dính liền), Trạng thái (locked→"Đã khóa" đỏ / "Đang sửa" xanh).
- Tự refresh khi panel đang mở: trong `onContentChange()` (gõ) và `openDoc()` (đổi trang), guard `#docOutline.open`.
- Focus mode ẩn panel (`body[data-focus="1"] .doc-outline{width:0}`).

### Theme toggle + Publisher trong tabbar — GIỮ style app cũ:
- `#tabThemeBtn`: hiển thị ký tự ☾ (`&#9790;` dark) / ☀ (`&#9728;` light) — `toggleTheme()` VÀ `applyTheme()` cập nhật cả `#themeToggleBtn` (rail cũ) lẫn `#tabThemeBtn`. KHÔNG dùng icon tĩnh `ti-sun-moon`.
- `#tabPushBtn`: nhãn "Published", nền XANH lá (`#e3fcef`/`#006644` light; `rgba(0,212,170,.15)`/`#00d4aa` dark) giống `.proj-live-btn` cũ — KHÔNG dùng gradient tím. Khi publishing (`.active`) dùng ĐÚNG hiệu ứng cũ: `_pubPulse` (light) / `_pubPulseDark` (dark) — glow + scale.

### Màu nền app = bảng màu file design:
- Override trong `<style id="new-ui-layout">`: light `--bg:#f4f6fb;--surface:#fff;--surface2:#edf0f8`; dark `--bg:#0c0e14;--surface:#111318;--surface2:#161a23` (dùng `!important`). Khớp `preview_new_ui.html`.
- **canvas** (`.editor-scroll`) = `--bg`; **sidebar/tabbar/statusbar** = `--surface` (panel); **rail** = `#09090f`. Sidebar phải trỏ `--sidebar-bg:var(--surface)!important` + `--sb:var(--surface)!important` (mặc định app là `var(--surface2)` → sai, sáng hơn design).
- **Publisher output** (chuỗi CSS optimized ~14843/14844) đồng bộ cùng bảng màu: `--sb:var(--surface)`, dark `--bg:#0c0e14;--surface:#111318;--surface2:#161a23`, light `--bg:#f4f6fb;--surface2:#edf0f8`. Push lại để website mới có màu design.
- **Glow nút Publisher:** `.pab-wrapper` phải `overflow:visible` (không thì `_pubPulse`/`_pubPulseDark` box-shadow bị cắt). Tabbar new UI luôn hiện (`.pab-hidden{height:42px}`), tab list tự clip (`#newTabList{overflow:hidden}`).

### Outline "Page info" = tiếng ANH, khớp hình design:
- Rows: **Created** (`en-US` "Jul 1"), **Updated** (relative EN: "Just now"/"5m ago"/"2h ago"/"3d ago"), **Views** (`doc.views`, +1 mỗi `openDoc`), **Status** ("Editing" xanh / "Locked" đỏ). Empty state EN.

**Cơ chế kỹ thuật rail (KHÔNG được phá):**
- `#mainHeader>.hdr-right-group{display:contents!important}` → các nút con (bell/save/help/avatar) trở thành flex item trực tiếp của rail, rồi dùng `order` để sắp xếp xen kẽ với các nút rail mới.
- **Dropdown rail phải mở sang PHẢI rail**, không dùng CSS `right:0` (sẽ bay ra ngoài màn hình bên trái vì rail chỉ 48px). Hàm `hdrToggleDd()` gọi `_hdrPlaceRailDd()` đặt `position:fixed; left:trigger.right+8; top:` (clamp trong viewport). `hdrLogoClick()` cũng đặt menu ở `left:r.right+8`.
- `.rail-btn-new[onclick*="_quickNewRootDoc"]` (nút New page +) → **ẨN** khỏi rail; tạo trang mới nằm ở hàng search trong sidebar (theo design).
- Light mode rail tint: `[data-theme="light"] #mainHeader{background:#1e1f2a}` (khớp `--rail` của design).
- **Rail rộng 56px** (không phải 48px). Khi đổi width phải sửa ĐỒNG BỘ: `#mainHeader width`, `.layout margin-left`, `#sidebar::before left`, `.statusbar left`, `--left-panels` (rail+sidebar) ở `:root` VÀ trong `sbExpand`/`sbCollapse` JS. Icon rail 23px, nút 46px.
- **Accent popup (`#accentPop`) nằm trong `#accentBtnWrap` (rail, display:none)** → `toggleAccentPop()` phải `document.body.appendChild(pop)` (thoát khỏi wrapper ẩn) rồi đặt fixed dưới `#tabAccentBtn` (nút accent ở tabbar). KHÔNG thì popup vô hình. Có handler click-ngoài để đóng.

**Tabbar (`#pabWrapper`, 42px) — chứa các action button MỚI:**
- `#tabLockBtn` — [MỚI] khóa trang
- Focus toggle — [MỚI, thay thế `#focusModeBtn` trong rail]
- Theme toggle — [MỚI, thay thế `#themeToggleBtn` trong rail]
- Accent dot — [MỚI, thay thế `#accentBtnWrap` trong rail]
- `#tabPushBtn` — [MỚI, thay thế `#projLiveBtn` trong rail]

**Các button/element cũ bị ẩn khỏi rail (HTML giữ nguyên cho JS):**
- `#projLiveBtn` — ẩn bằng `display:none!important` vì `#tabPushBtn` đảm nhiệm
- `#focusModeBtn` — ẩn vì tabbar có nút focus mới
- `#accentBtnWrap` — ẩn vì tabbar có accent dot mới
- `#themeToggleBtn` — ẩn vì tabbar có theme toggle mới
- `.rail-btn-new[onclick*="_quickNewRootDoc"]` (New page +) — ẩn vì tạo trang nằm ở sidebar

### Sidebar header — chỉ còn TEXT (khớp design):
- `#sbSpaceIcon` (`.sb-space-icon`) — **ẨN** (`display:none!important`) vì logo đã chuyển lên rail. Tránh hiện logo 2 nơi (rail + sidebar) gây trùng/khác chữ.
- `.sb-space-name` — `font-size:15px;font-weight:700` (chỉ hiện tên project, ví dụ "My Project").

### Khi thêm tính năng mới có button/icon:
1. Nếu là **navigation/context** → thêm vào rail
2. Nếu là **action trên document** → thêm vào tabbar
3. **KHÔNG** đưa cùng 1 chức năng vào cả hai nơi (tránh duplicate)
4. Button JS cũ (có `id` được JS tham chiếu) → **giữ HTML, ẩn bằng CSS**, tạo bản mới có styling mới
5. Dropdown đặt trong rail → PHẢI mở sang phải qua `_hdrPlaceRailDd()`, KHÔNG dùng `right:0` tĩnh
