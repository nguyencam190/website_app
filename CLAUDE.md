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
- Click → mở file picker chỉ cho `.zip`
- Kéo thả → nhận thư mục hoặc file ZIP
- `accept='.zip,application/zip,application/x-zip-compressed'` — KHÔNG thêm `.json`

### Nút 📁 trên header (`_openProjectFile`)
- **Chỉ mở file JSON** — đây là nơi duy nhất để mở JSON data
- `accept='.json'`

**Hai nút này có chức năng riêng biệt, không được gộp hay nhầm lẫn.**
