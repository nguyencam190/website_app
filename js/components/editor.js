import { state, TEXT_MATRIX, HL_MATRIX } from '../core/state.js';
import { persist, loadState, _idbGet } from '../core/storage.js';
import { escH } from '../utils/helpers.js';
import { currentDoc, openDoc, renderSidebar, uid, onContentChange, toggleStar, buildFlyoutList, closeFlyout } from './sidebar.js';
import { lbShow, _snapTargets, _snapApplyDrag, _snapApplyResize, _snapClear } from './media.js';
import { slashOpen } from './slashMenu.js';

// ── Module-level vars ─────────────────────────────────────────
let _savedRange = null;
let _bubbleHideTimer = null;
let _hoveredTb = null;
let _tgHideTimer = null;
let _dirty = false;
let _saveTimer = null;

// ── Save status helpers ────────────────────────────────────────
export function persistNow() {
  const toSave = JSON.parse(JSON.stringify(state));
  toSave.docs.forEach(doc => {
    if (doc.images) doc.images = doc.images.map(m => { const { src, ...meta } = m; return src && src.startsWith('data:') ? { ...meta, src } : meta; });
  });
  localStorage.setItem('projectdocs_v3', JSON.stringify(toSave));
}

export function markDirty() {
  _dirty = true;
  const el = document.getElementById('saveStatusEl');
  if (el) { el.className = 'save-dirty'; el.innerHTML = '<i class="ti ti-loader" style="font-size:12px"></i> Đang lưu...'; }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { persist(); _dirty = false; if (el) { el.className = 'save-ok'; el.innerHTML = '<i class="ti ti-circle-check" style="font-size:12px"></i> Đã lưu'; } }, 1000);
}

// ══ UNDO / REDO ══════════════════════════════════════════
const _UNDO_MAX = 50;
let _undoStack = [], _redoStack = [];
let _undoPaused = false, _undoTimer = null;

export function _undoSnapshot() {
  if (_undoPaused) return;
  const editor = document.getElementById('editor'); if (!editor) return;
  const snap = editor.innerHTML;
  if (_undoStack.length && _undoStack[_undoStack.length - 1] === snap) return;
  _undoStack.push(snap);
  if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
  _redoStack = [];
}

export function _undoSnapshotDebounced() {
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(_undoSnapshot, 500);
}

export function editorUndo() {
  if (_undoStack.length < 2) return;
  const editor = document.getElementById('editor'); if (!editor) return;
  _redoStack.push(_undoStack.pop());
  _undoPaused = true;
  editor.innerHTML = _undoStack[_undoStack.length - 1] || '<p><br></p>';
  _cfImgLoadAll(editor);
  setTimeout(async () => { await _cfCarLoadAll(editor); _cfEmbedLoadAll(editor); }, 50);
  _undoPaused = false;
  onContentChange();
  toast('Đã hoàn tác', 'info');
}

export function editorRedo() {
  if (!_redoStack.length) return;
  const editor = document.getElementById('editor'); if (!editor) return;
  const snap = _redoStack.pop();
  _undoStack.push(snap);
  _undoPaused = true;
  editor.innerHTML = snap;
  _cfImgLoadAll(editor);
  setTimeout(async () => { await _cfCarLoadAll(editor); _cfEmbedLoadAll(editor); }, 50);
  _undoPaused = false;
  onContentChange();
  toast('Đã làm lại', 'info');
}

// ── CONFLUENCE TOP NAV ─────────────────────────────────────────
let _hdrIsEditing = false;

export function showKeyboardShortcuts() {
  const shortcuts = [
    ['Ctrl + S', 'Lưu tài liệu'], ['Ctrl + Z / Y', 'Undo / Redo'], ['Ctrl + B', 'In đậm'],
    ['Ctrl + I', 'In nghiêng'], ['Ctrl + U', 'Gạch chân'], ['Ctrl + V', 'Dán (hỗ trợ ảnh)'],
    ['/', 'Mở slash command menu'], ['Delete', 'Xoá ảnh / media đang chọn'], ['Escape', 'Đóng menu / bỏ chọn'],
  ];
  const rows = shortcuts.map(([k, d]) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px;color:var(--text)">${d}</span><kbd>${k}</kbd></div>`).join('');
  const bg = document.createElement('div'); bg.className = 'modal-bg on'; bg.style.zIndex = '9998';
  bg.innerHTML = `<div class="modal" style="width:400px"><h3><i class="ti ti-keyboard" style="margin-right:8px;color:var(--accent)"></i>Phím tắt</h3><div>${rows}</div><div class="modal-actions" style="margin-top:16px"><button class="hbtn primary" onclick="this.closest('.modal-bg').remove()">Đóng</button></div></div>`;
  document.body.appendChild(bg);
}

export function hdrToggleDd(id) {
  const target = document.getElementById(id); if (!target) return;
  const wasOpen = target.classList.contains('on');
  hdrCloseAll();
  if (!wasOpen) target.classList.add('on');
}

export function hdrCloseAll() {
  document.querySelectorAll('.hdr-dd').forEach(d => d.classList.remove('on'));
  document.getElementById('hdrSearchDrop')?.classList.remove('on');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.hdr-dd') && !e.target.closest('[onclick*="hdrToggleDd"]') &&
    !e.target.closest('.hdr-user-av') && !e.target.closest('.pab-more-btn') &&
    !e.target.closest('.header-search-wrap') && !e.target.closest('.header-icon-btn'))
    hdrCloseAll();
});

export function hdrOpenSearch() {
  hdrCloseAll();
  const recents = (state.recent || []).slice(0, 3);
  ['hsdRecent1', 'hsdRecent2', 'hsdRecent3'].forEach((rid, i) => {
    const el = document.getElementById(rid); if (!el) return;
    if (recents[i]) {
      el.style.display = 'flex';
      const _rq = el.querySelector('div div:first-child'); if (_rq) _rq.textContent = recents[i].title || 'Untitled';
      const _rm = el.querySelector('.hsd-item-meta'); if (_rm) _rm.textContent = (recents[i].section || '') + ' · ' + _relTime(recents[i].openedAt || 0);
      el.onclick = () => { openDoc(recents[i].id); hdrCloseAll(); };
    } else { el.style.display = 'none'; }
  });
  document.getElementById('hdrSearchDrop')?.classList.add('on');
}

export function hdrHandleSearch(v) {
  const adv = document.getElementById('hsdAdvancedLbl');
  const sec = document.getElementById('hsdResultSection');
  const res = document.getElementById('hsdResults');
  if (adv) adv.textContent = v ? `Tìm "${v}"` : 'Tìm kiếm...';
  if (v) {
    const q = v.toLowerCase();
    const matches = (state.docs || []).filter(d => (d.title || '').toLowerCase().includes(q) || (d.content || '').replace(/<[^>]+>/g, ' ').toLowerCase().includes(q)).slice(0, 6);
    if (sec) sec.style.display = matches.length ? '' : 'none';
    if (res) res.innerHTML = matches.map(d => `<div class="hsd-item" onclick="openDoc('${d.id}');hdrCloseAll()"><div class="hsd-item-icon"><i class="ti ti-file-text"></i></div><div><div>${escH(d.title || 'Untitled')}</div><div class="hsd-item-meta">${escH(d.section || '')}</div></div></div>`).join('');
  } else {
    if (sec) sec.style.display = 'none';
    if (res) res.innerHTML = '';
  }
}

export function hdrToggleEdit() {
  _hdrIsEditing = !_hdrIsEditing;
  const btn = document.getElementById('pabEditBtn');
  const status = document.getElementById('pabStatus');
  const banner = document.getElementById('editBanner');
  const editor = document.getElementById('editor');
  if (_hdrIsEditing) {
    if (btn) { btn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save'; btn.classList.add('primary'); }
    if (status) { status.innerHTML = '<i class="ti ti-pencil" style="font-size:11px"></i>Editing'; status.classList.add('editing'); status.onclick = null; status.style.cursor = 'default'; }
    if (banner) banner.classList.add('on');
    if (editor) editor.focus();
  } else {
    if (btn) { btn.innerHTML = '<i class="ti ti-pencil" style="font-size:13px"></i> Edit'; btn.classList.remove('primary'); }
    if (status) { status.innerHTML = '<i class="ti ti-world-upload" style="font-size:11px"></i>Published'; status.classList.remove('editing'); status.onclick = openExportWebsiteModal; status.style.cursor = 'pointer'; }
    if (banner) banner.classList.remove('on');
    onContentChange(); toast('Đã lưu', 'success');
  }
}

export function hdrExitEdit() { if (_hdrIsEditing) hdrToggleEdit(); }

export function hdrDeletePage() {
  const doc = currentDoc(); if (!doc) return;
  hdrCloseAll();
  if (!confirm(`Xóa trang "${doc.title || 'Untitled'}"?\nThao tác này không thể hoàn tác.`)) return;
  // Remove from state immediately
  state.docs = state.docs.filter(d => d.id !== doc.id);
  // Also remove from recent/starred
  state.recent = (state.recent || []).filter(r => r.id !== doc.id);
  state.starred = (state.starred || []).filter(id => id !== doc.id);
  persistNow(); // ← save immediately, not debounced
  renderSidebar();
  const rem = state.docs.find(d => d.section === doc.section) || state.docs[0];
  if (rem) openDoc(rem.id);
  else { document.getElementById('editor').innerHTML = '<p><br></p>'; updatePageActionBar(); }
  toast('Đã xóa trang', 'info');
}

export function openShareModal() {
  hdrCloseAll();
  const doc = currentDoc();
  const sl = document.getElementById('shareLink');
  if (sl && doc) sl.value = `projectdocs://page/${doc.id}`;
  openModal('shareModal');
}

export function hdrCopyShareLink() {
  const sl = document.getElementById('shareLink');
  if (sl) navigator.clipboard?.writeText(sl.value).catch(() => {});
  const btn = document.getElementById('shareCopyBtn');
  if (btn) { btn.innerHTML = '<i class="ti ti-check"></i> Copied!'; setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> Copy'; }, 2000); }
  toast('Đã sao chép liên kết', 'success');
}

// ── PAB Logo ─────────────────────────────────────────────────
function _pabLogoInit() {
  const logo = document.getElementById('pabLogo');
  const txt = document.getElementById('pabLogoText');
  if (!logo || !txt) return;
  const L = state.projectLogo || {};
  logo.style.background = L.color || 'var(--accent)';
  if (L.imgDataUrl) {
    txt.style.display = 'none';
    let img = logo.querySelector('img');
    if (!img) { img = document.createElement('img'); logo.insertBefore(img, logo.firstChild); }
    img.src = L.imgDataUrl;
  } else {
    logo.querySelectorAll('img').forEach(i => i.remove());
    txt.style.display = '';
    txt.textContent = (state.projectName || 'P')[0].toUpperCase();
  }
  // Mark active color
  logo.closest('[style]')?.querySelectorAll?.('.pab-logo-color')?.forEach(el => {
    el.classList.toggle('active', el.style.background === L.color || el.dataset.color === L.color);
  });
}

export function pabLogoToggle() {
  const menu = document.getElementById('pabLogoMenu'); if (!menu) return;
  menu.classList.toggle('on');
  // Close on outside click
  setTimeout(() => document.addEventListener('click', function once(e) {
    if (!e.target.closest('#pabLogoMenu') && !e.target.closest('#pabLogo')) {
      menu.classList.remove('on'); document.removeEventListener('click', once);
    }
  }), 50);
}

export function pabLogoColor(color) {
  if (!state.projectLogo) state.projectLogo = {};
  state.projectLogo.color = color;
  delete state.projectLogo.imgDataUrl;
  persistNow(); _pabLogoInit();
  document.getElementById('pabLogoMenu')?.classList.remove('on');
}

export function pabLogoUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    if (!state.projectLogo) state.projectLogo = {};
    state.projectLogo.imgDataUrl = ev.target.result;
    persistNow(); _pabLogoInit();
    document.getElementById('pabLogoMenu')?.classList.remove('on');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

export function pabLogoReset() {
  if (!state.projectLogo) state.projectLogo = {};
  delete state.projectLogo.imgDataUrl;
  persistNow(); _pabLogoInit();
  document.getElementById('pabLogoMenu')?.classList.remove('on');
}

export function hdrBuildNotif() {
  const list = document.getElementById('notifList'); if (!list) return;
  const recent = (state.recent || []).slice(0, 4);
  if (!recent.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Chưa có thông báo</div>'; return; }
  list.innerHTML = recent.map((r, i) => `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border)" onclick="openDoc('${r.id}');hdrCloseAll()"><div style="width:8px;height:8px;border-radius:50%;background:${i < 2 ? 'var(--accent)' : 'var(--border)'};flex-shrink:0;margin-top:5px"></div><div><div style="font-size:13px;color:var(--text)">Trang <strong>${escH(r.title || 'Untitled')}</strong></div><div style="font-size:11px;color:var(--text3);margin-top:2px">${typeof _relTime === 'function' ? _relTime(r.openedAt || 0) : ''}</div></div></div>`).join('');
}

export function updatePageActionBar() {
  try { _pabLogoInit(); } catch (e) {}
  const doc = currentDoc();
  const titleEl = document.getElementById('pabTitle');
  const sectionEl = document.getElementById('pabSection');
  const dateEl = document.getElementById('pabDate');
  const statusEl = document.getElementById('pabStatus');
  if (!doc) {
    if (titleEl) titleEl.textContent = 'Chọn một trang để bắt đầu';
    if (sectionEl) sectionEl.textContent = '—';
    if (dateEl) dateEl.textContent = '';
    return;
  }
  if (titleEl) titleEl.textContent = doc.title || 'Untitled';
  if (sectionEl) sectionEl.textContent = doc.section || '—';
  const d = new Date(doc.updatedAt || doc.createdAt || Date.now());
  if (dateEl) dateEl.textContent = 'Saved ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (statusEl) { statusEl.textContent = _hdrIsEditing ? 'Editing' : 'Published'; statusEl.className = 'pab-status' + (_hdrIsEditing ? ' editing' : ''); }
  const sl = document.getElementById('shareLink');
  if (sl && doc) sl.value = window.location.href.split('?')[0] + '?doc=' + doc.id;
}

export function resetUndoStack() { _undoStack = []; _redoStack = []; }

// ── TEXT BOX ─────────────────────────────────────────────────
let _tbDrawMode = false, _tbDrawRect = null;
let _tbDrawStart = {};
let _tbCpBoxId = null, _tbCpMode = null, _tbCpTrigger = null;
let _sizeCloseTimer = null, _spacingCloseTimer = null;

export function toggleTextBoxMode() {
  _tbDrawMode = !_tbDrawMode;
  const btn = document.getElementById('tbDrawBtn');
  btn.classList.toggle('active', _tbDrawMode);
  document.body.classList.toggle('tb-draw-mode', _tbDrawMode);
  if (_tbDrawMode) {
    document.getElementById('editorScroll').addEventListener('mousedown', tbDrawStart);
  } else {
    document.getElementById('editorScroll').removeEventListener('mousedown', tbDrawStart);
    if (_tbDrawRect) { _tbDrawRect.remove(); _tbDrawRect = null; }
  }
}

export function tbDrawStart(e) {
  if (!_tbDrawMode) return;
  if (e.target.closest('.txtbox,.tbl-dropdown')) return;
  e.preventDefault();
  const scroll = document.getElementById('editorScroll');
  const rect = scroll.getBoundingClientRect();
  _tbDrawStart = { x: e.clientX - rect.left + scroll.scrollLeft, y: e.clientY - rect.top + scroll.scrollTop };
  _tbDrawRect = document.createElement('div');
  _tbDrawRect.style.cssText = `position:absolute;border:2px dashed var(--accent);background:rgba(37,99,235,.04);pointer-events:none;z-index:50;left:${_tbDrawStart.x}px;top:${_tbDrawStart.y}px;width:0;height:0`;
  scroll.appendChild(_tbDrawRect);

  function onMove(e2) {
    if (!_tbDrawRect) return;
    const cx = e2.clientX - rect.left + scroll.scrollLeft, cy = e2.clientY - rect.top + scroll.scrollTop;
    const x = Math.min(cx, _tbDrawStart.x), y = Math.min(cy, _tbDrawStart.y), w = Math.abs(cx - _tbDrawStart.x), h = Math.abs(cy - _tbDrawStart.y);
    _tbDrawRect.style.left = x + 'px'; _tbDrawRect.style.top = y + 'px'; _tbDrawRect.style.width = w + 'px'; _tbDrawRect.style.height = h + 'px';
  }

  function onUp(e2) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!_tbDrawRect) return;
    const x = parseInt(_tbDrawRect.style.left), y = parseInt(_tbDrawRect.style.top), w = Math.max(120, parseInt(_tbDrawRect.style.width)), h = Math.max(60, parseInt(_tbDrawRect.style.height));
    _tbDrawRect.remove(); _tbDrawRect = null;
    if (w < 20 && h < 20) return;
    createTextBox(x, y, w, h); toggleTextBoxMode();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function createTextBox(x, y, w, h, content = '', options = {}) {
  const scroll = document.getElementById('editorScroll'); const id = 'tb_' + uid();
  const DEFAULT_BG = '#ffffff'; const DEFAULT_BD = '#2563eb';
  const bgColor = options.bg || DEFAULT_BG; const bdColor = options.bd || DEFAULT_BD;
  const isDefaultBg = bgColor === DEFAULT_BG || bgColor === 'var(--surface)' || bgColor === '';
  const isDefaultBd = bdColor === DEFAULT_BD || bdColor === 'var(--accent)' || bdColor === '';
  const bdWidth = options.bdw || 1.5; const shadow = options.shadow || false;
  const box = document.createElement('div'); box.className = 'txtbox'; box.id = id;
  box.style.left = x + 'px'; box.style.top = y + 'px'; box.style.width = w + 'px'; box.style.height = h + 'px';
  // Only set inline styles for NON-default colors; let CSS vars handle defaults
  if (!isDefaultBg) box.style.background = bgColor; else box.dataset.defaultBg = '1';
  if (!isDefaultBd) box.style.borderColor = bdColor; else box.dataset.defaultBd = '1';
  box.style.borderWidth = bdWidth + 'px';
  box.style.boxShadow = shadow ? '0 4px 8px rgba(0,0,0,.32)' : 'none';
  box.innerHTML = `<div class="txtbox-handle-bar"><span>Text Box</span><div class="txtbox-sep"></div><button class="txtbox-del" style="width:22px;height:22px;background:transparent;border:none;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;font-weight:700;transition:.12s" onmousedown="event.preventDefault();event.stopPropagation();tbQuickColor('${id}',this)" title="Mau chu">A</button><div class="txtbox-sep"></div><button class="txtbox-color-btn" id="bgBtn_${id}" title="Mau nen" onmousedown="event.preventDefault();event.stopPropagation();tbOpenColorPalette('${id}','bg',this)"><span class="txtbox-color-swatch" id="bgSwatch_${id}" style="background:${bgColor}"></span></button><button class="txtbox-color-btn" id="bdBtn_${id}" title="Mau vien" onmousedown="event.preventDefault();event.stopPropagation();tbOpenColorPalette('${id}','bd',this)"><span class="txtbox-color-swatch" id="bdSwatch_${id}" style="background:${bdColor}"></span></button><div class="txtbox-sep"></div><div class="txtbox-ctrl" title="Do day vien"><label>vien</label><input type="range" class="txtbox-range" id="bdwRange_${id}" min="0" max="12" step="0.5" value="${bdWidth}" oninput="tbSetBdWidth('${id}',this.value)" onchange="tbSetBdWidth('${id}',this.value)"></div><div class="txtbox-sep"></div><button class="txtbox-shadow-btn${shadow ? ' on' : ''}" id="shadowBtn_${id}" onclick="tbToggleShadow('${id}')" title="Do bong"><i class="ti ti-shadow" style="font-size:12px"></i></button><div class="txtbox-sep"></div><button class="txtbox-del" onclick="deleteTextBox('${id}')" title="Xoa [Del]"><i class="ti ti-x" style="font-size:11px"></i></button></div><div class="txtbox-body" contenteditable="true" spellcheck="true">${content}</div><div class="txtbox-nw" data-dir="nw"></div><div class="txtbox-ne" data-dir="ne"></div><div class="txtbox-sw" data-dir="sw"></div><div class="txtbox-resize" data-dir="se" title="Resize"></div>`;
  scroll.appendChild(box);
  const hbar = box.querySelector('.txtbox-handle-bar');
  hbar.addEventListener('mousedown', e => { if (e.target.closest('.txtbox-color-btn,.txtbox-del,.txtbox-shadow-btn,.txtbox-range,input')) return; e.preventDefault(); tbBoxDragStart(e, box); });
  box.querySelectorAll('[data-dir]').forEach(h => { h.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); tbBoxResizeStart(e, box, h.dataset.dir); }); });
  box.addEventListener('mousedown', e => { document.querySelectorAll('.txtbox').forEach(b => b.classList.remove('selected')); box.classList.add('selected'); _hoveredTb = id; });
  // Track hover for keyboard delete
  box.addEventListener('mouseenter', () => { _hoveredTb = id; });
  box.addEventListener('mouseleave', e => {
    // Only clear if not entering a child element outside the box
    if (!e.relatedTarget || !box.contains(e.relatedTarget)) _hoveredTb = null;
  });
  // Add delete hint tooltip
  const delHint = document.createElement('div'); delHint.className = 'txtbox-del-hint'; delHint.textContent = '⌫ Delete';
  box.appendChild(delHint);

  setTimeout(() => box.querySelector('.txtbox-body')?.focus(), 50);
  box.querySelector('.txtbox-body')?.addEventListener('input', tbSaveAll);
  tbSaveAll(); return box;
}

function tbBoxDragStart(e, box) {
  const sX = e.clientX - box.offsetLeft, sY = e.clientY - box.offsetTop;
  const targets = _snapTargets(box.id);
  function move(e2) {
    const lx = Math.max(0, e2.clientX - sX);
    const ly = Math.max(0, e2.clientY - sY);
    _snapApplyDrag(box, lx, ly, targets);
  }
  function up() { _snapClear(); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); tbSaveAll(); }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}

function tbBoxResizeStart(e, box, dir) {
  const sX = e.clientX, sY = e.clientY, sW = box.offsetWidth, sH = box.offsetHeight, sL = box.offsetLeft, sT = box.offsetTop;
  const targets = _snapTargets(box.id);
  function move(e2) {
    const dx = e2.clientX - sX, dy = e2.clientY - sY;
    let nw = sW, nh = sH, nl = sL, nt = sT;
    if (dir === 'se') { nw = Math.max(120, sW + dx); nh = Math.max(60, sH + dy); }
    else if (dir === 'nw') { nw = Math.max(120, sW - dx); nl = sL + sW - nw; nh = Math.max(60, sH - dy); nt = sT + sH - nh; }
    else if (dir === 'ne') { nw = Math.max(120, sW + dx); nh = Math.max(60, sH - dy); nt = sT + sH - nh; }
    else if (dir === 'sw') { nw = Math.max(120, sW - dx); nl = sL + sW - nw; nh = Math.max(60, sH + dy); }
    const snapped = _snapApplyResize(box, nl, nt, nw, nh, dir, targets);
    box.style.left = snapped.l + 'px'; box.style.top = snapped.t + 'px';
    box.style.width = snapped.w + 'px'; box.style.height = snapped.h + 'px';
  }
  function up() { _snapClear(); document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); tbSaveAll(); }
  document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
}

export function tbSetBg(id, c, row, col) {
  const b = document.getElementById(id); if (!b) return;
  if (c === null || c === '') {
    b.style.background = ''; b.dataset.defaultBg = '1';
    delete b.dataset.cpBgRow; delete b.dataset.cpBgCol;
  } else {
    b.style.background = c; b.dataset.defaultBg = '';
    if (row != null) { b.dataset.cpBgRow = row; b.dataset.cpBgCol = col; }
    else { delete b.dataset.cpBgRow; delete b.dataset.cpBgCol; }
  }
  const s = document.getElementById('bgSwatch_' + id); if (s) s.style.background = c || 'var(--surface)';
  tbSaveAll();
}

export function tbSetBorder(id, c, row, col) {
  const b = document.getElementById(id); if (!b) return;
  if (c === null || c === '') {
    b.style.borderColor = ''; b.dataset.defaultBd = '1';
    delete b.dataset.cpBdRow; delete b.dataset.cpBdCol;
  } else {
    b.style.borderColor = c; b.dataset.defaultBd = '';
    if (row != null) { b.dataset.cpBdRow = row; b.dataset.cpBdCol = col; }
    else { delete b.dataset.cpBdRow; delete b.dataset.cpBdCol; }
  }
  const s = document.getElementById('bdSwatch_' + id); if (s) s.style.background = c || 'var(--accent)';
  tbSaveAll();
}

// ── Textbox color palette ────────────────────────────────
export function tbOpenColorPalette(id, mode, triggerEl) {
  const el = document.getElementById('tbColorPalette'); if (!el) return;
  // Toggle off if same
  if (_tbCpBoxId === id && _tbCpMode === mode && el.classList.contains('on')) {
    tbCloseColorPalette(); return;
  }
  tbCloseColorPalette();
  _tbCpBoxId = id; _tbCpMode = mode; _tbCpTrigger = triggerEl;
  triggerEl.classList.add('active-palette');
  tbBuildColorPalette(el, id, mode);
  el.style.visibility = 'hidden'; el.classList.add('on');
  const rect = triggerEl.getBoundingClientRect();
  const w = el.offsetWidth || 210, h = el.offsetHeight || 300;
  let left = rect.left, top = rect.bottom + 4;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = rect.top - h - 4;
  el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.visibility = '';
}

export function tbCloseColorPalette() {
  const el = document.getElementById('tbColorPalette'); if (el) el.classList.remove('on');
  if (_tbCpTrigger) _tbCpTrigger.classList.remove('active-palette');
  _tbCpBoxId = null; _tbCpMode = null; _tbCpTrigger = null;
}

function tbBuildColorPalette(el, id, mode) {
  const dark = _isDarkMode();
  const isNone = mode === 'bg';
  el.innerHTML = '';

  // Header
  const hdr = document.createElement('div'); hdr.className = 'tb-cp-header';
  const lbl = document.createElement('div'); lbl.className = 'tb-cp-title';
  lbl.textContent = mode === 'bg' ? 'Màu nền text box' : 'Màu viền text box';
  hdr.appendChild(lbl); el.appendChild(hdr);

  // No-color reset
  const resetRow = document.createElement('div'); resetRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
  const resetBtn = document.createElement('button');
  resetBtn.style.cssText = 'flex:1;padding:4px 8px;border:1px dashed #334155;border-radius:5px;background:transparent;color:#64748b;cursor:pointer;font-size:10.5px;font-family:var(--font);transition:.12s;text-align:left;display:flex;align-items:center;gap:5px';
  resetBtn.innerHTML = '<span style="font-size:12px">✕</span> Xóa màu (mặc định)';
  resetBtn.onmousedown = e => e.preventDefault();
  resetBtn.onclick = () => {
    if (mode === 'bg') tbSetBg(id, null);
    else tbSetBorder(id, null);
    tbCloseColorPalette();
  };
  resetBtn.onmouseenter = () => { resetBtn.style.borderColor = 'var(--danger)'; resetBtn.style.color = '#f87171'; };
  resetBtn.onmouseleave = () => { resetBtn.style.borderColor = '#334155'; resetBtn.style.color = '#64748b'; };
  resetRow.appendChild(resetBtn); el.appendChild(resetRow);

  // Theme badge
  const badge = document.createElement('div'); badge.className = 'cp-theme-badge'; badge.style.cssText = 'font-size:9px;color:#475569;padding:1px 5px;background:rgba(255,255,255,.05);border-radius:3px;text-align:center;letter-spacing:.3px;margin-bottom:3px';
  badge.textContent = (dark ? 'Dark' : 'Light') + ' palette';
  el.appendChild(badge);

  // 4×7 color grid
  TEXT_MATRIX.forEach((row, r) => {
    const rowEl = document.createElement('div');
    rowEl.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:2px';
    row.forEach(([lc, dc], c) => {
      const color = dark ? dc : lc;
      const sw = document.createElement('div');
      sw.style.cssText = 'height:18px;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:all .1s;background:' + color;
      sw.title = color;
      sw.onmouseenter = () => sw.style.transform = 'scale(1.2)';
      sw.onmouseleave = () => sw.style.transform = '';
      sw.onmousedown = e => e.preventDefault();
      sw.onclick = () => {
        if (mode === 'bg') tbSetBg(id, color, r, c);
        else tbSetBorder(id, color, r, c);
        tbCloseColorPalette();
      };
      rowEl.appendChild(sw);
    });
    el.appendChild(rowEl);
  });

  // Custom color
  const customRow = document.createElement('div');
  customRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid #334155';
  const customLbl = document.createElement('span'); customLbl.style.cssText = 'font-size:10.5px;color:#64748b;flex:1'; customLbl.textContent = 'Màu tùy chỉnh';
  const customBtn = document.createElement('div');
  customBtn.style.cssText = 'width:22px;height:22px;border-radius:5px;border:1.5px dashed #475569;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:.12s';
  customBtn.innerHTML = '<i class="ti ti-plus" style="font-size:11px;color:#64748b;pointer-events:none"></i>';
  const customInp = document.createElement('input'); customInp.type = 'color'; customInp.value = '#ffffff';
  customInp.style.cssText = 'position:absolute;inset:-4px;opacity:0;cursor:pointer;width:200%;height:200%';
  customInp.addEventListener('change', function () {
    if (mode === 'bg') tbSetBg(id, this.value);
    else tbSetBorder(id, this.value);
    tbCloseColorPalette();
  });
  customBtn.appendChild(customInp);
  customRow.appendChild(customLbl); customRow.appendChild(customBtn);
  el.appendChild(customRow);
}

// Close textbox palette on outside click
document.addEventListener('mousedown', e => {
  if (_tbCpBoxId && !e.target.closest('#tbColorPalette') && !e.target.closest('.txtbox-color-btn'))
    tbCloseColorPalette();
});

export function tbSetBdWidth(id, v) { const b = document.getElementById(id); if (!b) return; b.style.borderWidth = v + 'px'; tbSaveAll(); }
export function tbToggleShadow(id) { const b = document.getElementById(id); if (!b) return; const btn = document.getElementById('shadowBtn_' + id); const on = btn && btn.classList.contains('on'); b.style.boxShadow = on ? 'none' : '0 4px 8px rgba(0,0,0,.32)'; if (btn) btn.classList.toggle('on', !on); tbSaveAll(); }
export function deleteTextBox(id) { const b = document.getElementById(id); if (b) b.remove(); tbSaveAll(); }

// Compress image for textbox (max 1200px, 85% JPEG)
function _tbCompressImg(file) {
  return new Promise(res => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200; let { width: w, height: h } = img;
      if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (file.type === 'image/png') { ctx.fillStyle = 'transparent'; }
      ctx.drawImage(img, 0, 0, w, h);
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      res(c.toDataURL(mime, 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

export async function tbInsertImages(id, inputEl, filesOverride) {
  const box = document.getElementById(id); if (!box) return;
  const bodyEl = box.querySelector('.txtbox-body'); if (!bodyEl) return;
  const files = filesOverride || Array.from(inputEl.files || []);
  if (!files.length) return;
  if (inputEl.value !== undefined) inputEl.value = ''; // reset file input

  // Focus textbox body and place cursor at end
  bodyEl.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(bodyEl); range.collapse(false);
  sel.removeAllRanges(); sel.addRange(range);

  // Insert images: if single → block, if multiple → gallery row
  const srcs = [];
  for (const file of files.filter(f => f && f.type && f.type.startsWith('image/'))) {
    const src = await _tbCompressImg(file);
    if (src) srcs.push({ src, name: file.name || 'image' });
  }
  if (!srcs.length) return;

  if (srcs.length === 1) {
    // Single image: block, click → lightbox
    const img = document.createElement('img');
    img.src = srcs[0].src; img.alt = srcs[0].name;
    img.style.cssText = 'max-width:100%;display:block;margin:6px 0;border-radius:6px;cursor:zoom-in';
    img.onclick = () => { lbShow([{ src: srcs[0].src, name: srcs[0].name }]); };
    const br = document.createElement('br');
    const curSel = window.getSelection();
    if (curSel && curSel.rangeCount) {
      const r = curSel.getRangeAt(0); r.deleteContents(); r.insertNode(br); r.insertNode(img); r.setStartAfter(br); r.collapse(true); curSel.removeAllRanges(); curSel.addRange(r);
    } else { bodyEl.appendChild(img); bodyEl.appendChild(br); }
  } else {
    // Multiple images: IMAGE CAROUSEL
    const carousel = tbBuildCarousel(srcs);
    const curSel = window.getSelection();
    if (curSel && curSel.rangeCount) {
      const r = curSel.getRangeAt(0); r.deleteContents(); r.insertNode(carousel); r.setStartAfter(carousel); r.collapse(true); curSel.removeAllRanges(); curSel.addRange(r);
    } else { bodyEl.appendChild(carousel); }
    // Init swipe on touch
    tbCarInitSwipe(carousel);
  }
  tbSaveAll();
  toast(srcs.length > 1 ? srcs.length + ' anh da duoc them' : 'Anh da duoc them', 'success');
}

// ═══ IMAGE CAROUSEL — full version ══════════════════════════
function tbBuildCarousel(srcs) {
  const total = srcs.length;
  const car = document.createElement('div');
  car.className = 'tb-carousel'; car.dataset.idx = '0'; car.dataset.count = total;
  car.setAttribute('contenteditable', 'false');
  car.setAttribute('tabindex', '0');

  // ── Main stage ───────────────────────────────────────────
  const stage = document.createElement('div'); stage.className = 'tb-car-stage';
  const inner = document.createElement('div'); inner.className = 'tb-car-inner';
  srcs.forEach(({ src, name }, i) => {
    const slide = document.createElement('div'); slide.className = 'tb-car-slide';
    const img = document.createElement('img');
    img.src = src; img.alt = name; img.loading = i === 0 ? 'eager' : 'lazy';
    slide.appendChild(img); inner.appendChild(slide);
  });
  stage.appendChild(inner);

  // ── Counter badge ─────────────────────────────────────────
  const counter = document.createElement('div'); counter.className = 'tb-car-counter';
  stage.appendChild(counter);

  // ── Fullscreen button ─────────────────────────────────────
  const fsBtn = document.createElement('button'); fsBtn.className = 'tb-car-fsBtn';
  fsBtn.innerHTML = '<i class="ti ti-maximize" style="font-size:13px"></i>'; fsBtn.title = 'Xem toan man hinh';
  fsBtn.onmousedown = e => e.preventDefault();
  fsBtn.onclick = e => { e.stopPropagation(); tbCarFullscreen(car, parseInt(car.dataset.idx || 0)); };
  stage.appendChild(fsBtn);

  // ── Caption ───────────────────────────────────────────────
  const caption = document.createElement('div'); caption.className = 'tb-car-caption';
  stage.appendChild(caption);

  // ── Prev / Next arrows ────────────────────────────────────
  const prev = document.createElement('button'); prev.className = 'tb-car-btn prev';
  prev.innerHTML = '&#8249;'; prev.title = 'Anh truoc (←)';
  prev.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
  prev.onclick = e => { e.stopPropagation(); tbCarNav(car, -1); };
  stage.appendChild(prev);

  const next = document.createElement('button'); next.className = 'tb-car-btn next';
  next.innerHTML = '&#8250;'; next.title = 'Anh tiep (→)';
  next.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
  next.onclick = e => { e.stopPropagation(); tbCarNav(car, 1); };
  stage.appendChild(next);

  car.appendChild(stage);

  // ── Thumbnail strip ───────────────────────────────────────
  const thumbs = document.createElement('div'); thumbs.className = 'tb-car-thumbs';
  srcs.forEach(({ src, name }, i) => {
    const th = document.createElement('div'); th.className = 'tb-car-thumb' + (i === 0 ? ' on' : '');
    const thImg = document.createElement('img'); thImg.src = src; thImg.alt = name; thImg.loading = 'lazy';
    th.appendChild(thImg);
    th.onmousedown = e => e.preventDefault();
    th.onclick = e => { e.stopPropagation(); tbCarGo(car, i); };
    thumbs.appendChild(th);
  });
  car.appendChild(thumbs);

  _tbCarUpdate(car, 0);
  return car;
}

function _tbCarUpdate(car, idx) {
  const total = parseInt(car.dataset.count) || 1;
  idx = ((idx % total) + total) % total; // wrap around
  car.dataset.idx = idx;

  const inner = car.querySelector('.tb-car-inner');
  if (inner) inner.style.transform = 'translateX(-' + idx + '00%)';

  // Counter
  const ctr = car.querySelector('.tb-car-counter');
  if (ctr) ctr.textContent = (idx + 1) + ' / ' + total;

  // Caption (filename)
  const caption = car.querySelector('.tb-car-caption');
  if (caption) {
    const img = car.querySelectorAll('.tb-car-slide img')[idx];
    caption.textContent = img ? (img.alt || '') : '';
    caption.style.opacity = img && img.alt ? '1' : '0';
  }

  // Arrows
  const prevBtn = car.querySelector('.tb-car-btn.prev');
  const nextBtn = car.querySelector('.tb-car-btn.next');
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.disabled = idx === total - 1;

  // Thumbnails
  car.querySelectorAll('.tb-car-thumb').forEach((th, i) => {
    th.classList.toggle('on', i === idx);
  });
  // Scroll active thumb into view
  const activeTh = car.querySelectorAll('.tb-car-thumb')[idx];
  if (activeTh) activeTh.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

export function tbCarNav(car, dir) {
  const total = parseInt(car.dataset.count) || 1;
  const cur = parseInt(car.dataset.idx || 0);
  const next = (cur + dir + total) % total;
  _tbCarUpdate(car, next);
}

export function tbCarGo(car, idx) { _tbCarUpdate(car, parseInt(idx)); }

export function tbCarInitSwipe(car) {
  const stage = car.querySelector('.tb-car-stage') || car;
  // Touch swipe
  let tx = 0, tmoved = false;
  stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; tmoved = false; }, { passive: true });
  stage.addEventListener('touchmove', e => { if (Math.abs(e.touches[0].clientX - tx) > 8) tmoved = true; }, { passive: true });
  stage.addEventListener('touchend', e => { if (!tmoved) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 36) tbCarNav(car, d < 0 ? 1 : -1); });

  // Mouse drag on desktop
  let mx = 0, mdragging = false, mhasMoved = false;
  stage.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    mx = e.clientX; mdragging = true; mhasMoved = false;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!mdragging) return;
    if (Math.abs(e.clientX - mx) > 6) mhasMoved = true;
  });
  document.addEventListener('mouseup', e => {
    if (!mdragging) return;
    mdragging = false;
    if (mhasMoved) { const d = e.clientX - mx; if (Math.abs(d) > 40) tbCarNav(car, d < 0 ? 1 : -1); }
    else {
      // Treat as click → fullscreen
      const idx = parseInt(car.dataset.idx || 0);
      tbCarFullscreen(car, idx);
    }
  });

  // Keyboard navigation when focused
  car.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tbCarNav(car, -1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); tbCarNav(car, 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tbCarFullscreen(car, parseInt(car.dataset.idx || 0)); }
  });
}

export function tbCarFullscreen(car, startIdx) {
  const imgs = Array.from(car.querySelectorAll('.tb-car-slide img')).map(img => ({ src: img.src, name: img.alt || '' }));
  lbShow(imgs, Math.max(0, Math.min(startIdx, imgs.length - 1)));
}

export function tbQuickColor(id, triggerEl) {
  const box = document.getElementById(id); if (!box) return;
  const body = box.querySelector('.txtbox-body'); if (!body) return;
  // Select all text in the textbox body if nothing selected, then open palette
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    const range = document.createRange(); range.selectNodeContents(body);
    sel.removeAllRanges(); sel.addRange(range);
  }
  saveRange();
  toggleColorPalette('textCP', triggerEl);
}

export function tbSaveAll() {
  const doc = currentDoc(); if (!doc) return;
  const boxes = [];
  document.querySelectorAll('.txtbox').forEach(b => {
    boxes.push({
      id: b.id, x: parseInt(b.style.left), y: parseInt(b.style.top),
      w: b.offsetWidth, h: b.offsetHeight,
      content: b.querySelector('.txtbox-body')?.innerHTML || '',
      bg: b.dataset.defaultBg === '1' ? '' : b.style.background,
      bd: b.dataset.defaultBd === '1' ? '' : b.style.borderColor,
      bdw: parseFloat(b.style.borderWidth) || 1.5,
      shadow: !!(b.style.boxShadow && b.style.boxShadow !== 'none'),
      cpBgRow: b.dataset.cpBgRow, cpBgCol: b.dataset.cpBgCol,
      cpBdRow: b.dataset.cpBdRow, cpBdCol: b.dataset.cpBdCol
    });
  });
  doc.textBoxes = boxes;
  markDirty();
}

export function tbLoadAll(doc) {
  document.querySelectorAll('.txtbox').forEach(b => b.remove());
  if (!doc.textBoxes) return;
  doc.textBoxes.forEach(tb => {
    const box = createTextBox(tb.x, tb.y, tb.w, tb.h, tb.content, { bg: tb.bg, bd: tb.bd, bdw: tb.bdw, shadow: tb.shadow });
    if (box && tb.cpBgRow != null) { box.dataset.cpBgRow = tb.cpBgRow; box.dataset.cpBgCol = tb.cpBgCol; }
    if (box && tb.cpBdRow != null) { box.dataset.cpBdRow = tb.cpBdRow; box.dataset.cpBdCol = tb.cpBdCol; }
  });
}

// BUBBLE TOOLBAR
const BB_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const BB_SPACINGS = [{ label: '1.0', val: '1' }, { label: '1.15 (Mac dinh)', val: '1.15' }, { label: '1.5', val: '1.5' }, { label: '1.75', val: '1.75' }, { label: '2.0', val: '2' }, { label: '2.5', val: '2.5' }, { label: '3.0', val: '3' }];

export function saveRange() { const sel = window.getSelection(); if (sel && sel.rangeCount > 0) _savedRange = sel.getRangeAt(0).cloneRange(); }
export function restoreRange() { if (!_savedRange) return; const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(_savedRange); }

function _isEditableNode(node) {
  if (!node) return false;
  const el = node.nodeType === 3 ? node.parentElement : node;
  if (!el) return false;
  const editor = document.getElementById('editor');
  if (editor && editor.contains(el)) return true;
  if (el.closest && el.closest('.txtbox-body')) return true;
  return false;
}

export function bbShow() {
  const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) { bbHide(); return; }
  if (!_isEditableNode(sel.anchorNode)) { bbHide(); return; }
  const range = sel.getRangeAt(0); const rect = range.getBoundingClientRect(); if (!rect.width && !rect.height) { bbHide(); return; }
  const bb = document.getElementById('bubbleToolbar'); if (!bb) return;
  bb.style.visibility = 'hidden'; bb.style.left = '-9999px'; bb.style.top = '-9999px'; bb.classList.add('on');
  requestAnimationFrame(() => {
    const bbW = bb.offsetWidth, bbH = bb.offsetHeight;
    let left = rect.left + rect.width / 2 - bbW / 2; let top = rect.top - bbH - 10;
    if (left < 8) left = 8; if (left + bbW > window.innerWidth - 8) left = window.innerWidth - bbW - 8;
    if (top < 58) top = rect.bottom + 10;
    bb.style.left = left + 'px'; bb.style.top = top + 'px'; bb.style.visibility = '';
    bbUpdateState();
  });
}

export function bbHide() { const bb = document.getElementById('bubbleToolbar'); if (bb) bb.classList.remove('on'); }

function bbUpdateState() {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode; const el = node && node.nodeType === 3 ? node.parentElement : node; if (!el) return;
  // Show/hide table cell bg button
  const inCell = !!(el.closest && el.closest('.editor-content td,.editor-content th'));
  const cellWrap = document.getElementById('bbTableCellWrap');
  if (cellWrap) cellWrap.style.display = inCell ? 'flex' : 'none';
  if (inCell) {
    const cell = el.closest('td,th');
    const cellBar = document.getElementById('bbCellBar');
    if (cellBar && cell) {
      const bg = cell.dataset.cellBg || cell.style.backgroundColor || '';
      cellBar.style.background = bg || '#f1f5f9';
    }
  }
  // Update block selector — include td/th as text
  const block = el.closest('h1,h2,h3,h4,h5,h6,p,div,td,th');
  const bbBlock = document.getElementById('bbBlock');
  if (bbBlock && block) {
    const tag = block.tagName.toLowerCase();
    const opt = Array.from(bbBlock.options).find(o => o.value === tag);
    bbBlock.value = opt ? tag : 'p';
  }
  [['bbBold', 'bold'], ['bbItalic', 'italic'], ['bbUnder', 'underline'], ['bbStrike', 'strikeThrough']].forEach(([id, cmd]) => { const btn = document.getElementById(id); if (btn) btn.classList.toggle('active', document.queryCommandState(cmd)); });
  _updateAlignBtns();
}

export function bbFmt(cmd) {
  const activeEl = document.activeElement;
  const inBox = activeEl && activeEl.closest && activeEl.closest('.txtbox-body');
  const inTbl = activeEl && activeEl.closest && activeEl.closest('.editor-content td,.editor-content th');
  document.execCommand(cmd, false, null);
  if (!inBox && !inTbl) document.getElementById('editor')?.focus();
  onContentChange(); bbUpdateState(); setTimeout(bbShow, 10);
}

export function bbApplyBlock(val) { document.execCommand('formatBlock', false, val); document.getElementById('editor')?.focus(); onContentChange(); setTimeout(bbShow, 10); }
export function bbApplyFont(font) { document.execCommand('fontName', false, font); document.getElementById('editor')?.focus(); onContentChange(); setTimeout(bbShow, 10); }

export function bbOpenSizeDD(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  clearTimeout(_sizeCloseTimer); saveRange();
  const dd = document.getElementById('bbSizeDD');
  const cur = parseInt(document.getElementById('bbSizeNum').value) || 16;
  dd.innerHTML = BB_SIZES.map(s => `<div class="bb-size-opt${s === cur ? ' active' : ''}" onmousedown="event.preventDefault();bbApplySize(${s})">${s}</div>`).join('');
  const inp = document.getElementById('bbSizeNum');
  const r = inp.getBoundingClientRect();
  dd.style.visibility = 'hidden'; dd.classList.add('on');
  const ddH = dd.offsetHeight || 200;
  let top = r.bottom + 2; if (top + ddH > window.innerHeight - 8) top = r.top - ddH - 2;
  dd.style.top = top + 'px'; dd.style.left = r.left + 'px'; dd.style.visibility = '';
  setTimeout(() => { const a = dd.querySelector('.active'); if (a) a.scrollIntoView({ block: 'center' }); }, 50);
}

export function bbCloseSizeDD() { _sizeCloseTimer = setTimeout(() => document.getElementById('bbSizeDD').classList.remove('on'), 120); }

export function bbApplySize(size) {
  const editor = document.getElementById('editor');
  restoreRange(); editor.focus();
  document.execCommand('fontSize', false, '7');
  editor.querySelectorAll('font[size="7"]').forEach(f => {
    const span = document.createElement('span');
    span.style.fontSize = size + 'px';
    span.innerHTML = f.innerHTML;
    f.replaceWith(span);
  });
  document.getElementById('bbSizeNum').value = size;
  document.getElementById('bbSizeDD').classList.remove('on');
  onContentChange(); setTimeout(bbShow, 10);
}

export function bbTextColor(color) {
  document.getElementById('bbTextBar').style.background = color;
  document.getElementById('textColorBar').style.background = color;
  document.execCommand('foreColor', false, color);
  addRecentColor('text', color); onContentChange(); setTimeout(bbShow, 10);
}

export function bbHighlight(color) {
  document.getElementById('bbHlBar').style.background = color;
  document.getElementById('bgColorBar').style.background = color;
  document.execCommand('hiliteColor', false, color);
  addRecentColor('hl', color); onContentChange(); setTimeout(bbShow, 10);
}

// ─── COLOR PALETTE (LIGHT/DARK POSITION MAPPING) ──────────
// HL_TEXT_MATRIX[col] = [lightTextColor, darkTextColor]
const HL_TEXT_MATRIX = [
  ['#5f6368', '#9aa0a6'],
  ['#5f6368', '#9aa0a6'],
  ['#1967d2', '#8ab4f8'],
  ['#1e8e3e', '#81c995'],
  ['#b07800', '#fdd663'],
  ['#c5221f', '#f28b82'],
  ['#8430ce', '#c58af9']
];

let _activePalette = null;

function _isDarkMode() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

// Wrap selection in a tracked <span> for theme-swap support
function _applyMappedColor(row, col, type) {
  const dark = _isDarkMode();
  const color = type === 'text' ? TEXT_MATRIX[row][col][dark ? 1 : 0] : HL_MATRIX[col][dark ? 1 : 0];
  // Do NOT steal focus — works in editor, textbox-body, AND table cells
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);

  // Unwrap any existing cp-mapped spans inside selection first
  const existing = [];
  const tmpDiv = document.createElement('div');
  tmpDiv.appendChild(range.cloneContents());
  tmpDiv.querySelectorAll('.cp-mapped').forEach(s => existing.push(s));

  // Try surroundContents (works for simple same-element selections)
  let applied = false;
  try {
    const span = document.createElement('span');
    span.className = 'cp-mapped';
    span.dataset.cptype = type;
    span.dataset.cprow = row;
    span.dataset.cpcol = col;
    if (type === 'text') span.style.color = color;
    else span.style.backgroundColor = color;
    range.surroundContents(span);
    applied = true;
  } catch (e) {
    // Multi-element selection: wrap each text node individually
    try {
      const nodes = [];
      const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (range.intersectsNode(node)) nodes.push(node);
      }
      nodes.forEach(textNode => {
        const nodeRange = document.createRange();
        nodeRange.selectNode(textNode);
        if (textNode === range.startContainer) nodeRange.setStart(textNode, range.startOffset);
        if (textNode === range.endContainer) nodeRange.setEnd(textNode, range.endOffset);
        const span = document.createElement('span');
        span.className = 'cp-mapped';
        span.dataset.cptype = type;
        span.dataset.cprow = row;
        span.dataset.cpcol = col;
        if (type === 'text') span.style.color = color;
        else span.style.backgroundColor = color;
        try { nodeRange.surroundContents(span); } catch (e2) { }
      });
      applied = true;
    } catch (e2) {
      // Last resort: execCommand (loses tracking but still colors)
      if (type === 'text') document.execCommand('foreColor', false, color);
      else document.execCommand('hiliteColor', false, color);
    }
  }

  // Update bubble bar indicators and cache for re-render
  if (type === 'text') {
    const bar = document.getElementById('bbTextBar');
    if (bar) { bar.style.background = color; bar._cprow = row; bar._cpcol = col; }
    document.getElementById('textColorBar').style.background = color;
  } else {
    const bar = document.getElementById('bbHlBar');
    if (bar) { bar.style.background = color; bar._cprow = row; bar._cpcol = col; }
    document.getElementById('bgColorBar').style.background = color;
  }
  onContentChange(); setTimeout(bbShow, 10);
}

// Auto-swap ALL mapped colors when theme changes (editor + textboxes + anywhere)
export function swapThemeColors() {
  const dark = _isDarkMode();
  // Text color spans — ALL containers
  document.querySelectorAll('.cp-mapped[data-cptype="text"]').forEach(span => {
    const r = parseInt(span.dataset.cprow), c = parseInt(span.dataset.cpcol);
    if (!isNaN(r) && !isNaN(c) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c])
      span.style.color = TEXT_MATRIX[r][c][dark ? 1 : 0];
  });
  // Highlight spans — ALL containers
  document.querySelectorAll('.cp-mapped[data-cptype="hl"]').forEach(span => {
    const c = parseInt(span.dataset.cpcol);
    if (!isNaN(c) && HL_MATRIX[c])
      span.style.backgroundColor = HL_MATRIX[c][dark ? 1 : 0];
  });
  // Text boxes: swap bg/bd only if they are using theme-tracked colors
  document.querySelectorAll('.txtbox').forEach(box => {
    // bg: if flagged as default, let CSS var handle it (remove inline override)
    if (box.dataset.defaultBg === '1') {
      box.style.background = '';  // let CSS class var(--surface) take over
    }
    // bd: if flagged as default accent, let CSS var handle it
    if (box.dataset.defaultBd === '1') {
      box.style.borderColor = '';  // let CSS class var(--accent) take over
    }
    // Also swap cp-mapped inside textbox-body
    box.querySelectorAll('.cp-mapped[data-cptype="text"]').forEach(span => {
      const r = parseInt(span.dataset.cprow), c = parseInt(span.dataset.cpcol);
      if (!isNaN(r) && !isNaN(c) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c])
        span.style.color = TEXT_MATRIX[r][c][dark ? 1 : 0];
    });
    box.querySelectorAll('.cp-mapped[data-cptype="hl"]').forEach(span => {
      const c = parseInt(span.dataset.cpcol);
      if (!isNaN(c) && HL_MATRIX[c])
        span.style.backgroundColor = HL_MATRIX[c][dark ? 1 : 0];
    });
  });
  // Swap table cell bg colors (data-cpbgrow/col tracked)
  document.querySelectorAll('.editor-content td[data-cpbgrow],.editor-content th[data-cpbgrow]').forEach(cell => {
    const r = parseInt(cell.dataset.cpbgrow), c = parseInt(cell.dataset.cpbgcol);
    if (!isNaN(r) && !isNaN(c) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c]) {
      cell.style.background = TEXT_MATRIX[r][c][dark ? 1 : 0];
      cell.dataset.customBg = TEXT_MATRIX[r][c][dark ? 1 : 0];
    }
  });
  // Swap table cell backgrounds that were set via palette
  document.querySelectorAll('.editor-content td[data-cell-row],.editor-content th[data-cell-row]').forEach(cell => {
    const r = parseInt(cell.dataset.cellRow), c = parseInt(cell.dataset.cellCol);
    if (!isNaN(r) && !isNaN(c) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c]) {
      const color = TEXT_MATRIX[r][c][dark ? 1 : 0];
      cell.style.backgroundColor = color;
      cell.dataset.cellBg = color;
    }
  });
  // Swap textbox background and border colors
  document.querySelectorAll('.txtbox[data-cp-bg-row]').forEach(box => {
    const r = parseInt(box.dataset.cpBgRow), c = parseInt(box.dataset.cpBgCol);
    if (!isNaN(r) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c]) {
      const color = TEXT_MATRIX[r][c][dark ? 1 : 0];
      box.style.background = color;
      const s = document.getElementById('bgSwatch_' + box.id); if (s) s.style.background = color;
    }
  });
  document.querySelectorAll('.txtbox[data-cp-bd-row]').forEach(box => {
    const r = parseInt(box.dataset.cpBdRow), c = parseInt(box.dataset.cpBdCol);
    if (!isNaN(r) && TEXT_MATRIX[r] && TEXT_MATRIX[r][c]) {
      const color = TEXT_MATRIX[r][c][dark ? 1 : 0];
      box.style.borderColor = color;
      const s = document.getElementById('bdSwatch_' + box.id); if (s) s.style.background = color;
    }
  });
  // Swap cell image shadow colors (filter:drop-shadow)
  document.querySelectorAll('.editor-content td img,.editor-content th img').forEach(img => {
    if (img.dataset.shadowXyb && img.dataset.shadowLight) {
      const color = dark ? (img.dataset.shadowDark || img.dataset.shadowLight) : img.dataset.shadowLight;
      img.style.filter = img.dataset.shadowXyb + ' ' + color + ')';
    }
  });
  // Swap fmedia shadow colors
  document.querySelectorAll('.fmedia[data-shadowxyb]').forEach(fm => {
    const xyb = fm.dataset.shadowXyb || fm.dataset.shadowxyb;
    const color = dark ? fm.dataset.shadowDarkColor : fm.dataset.shadowLightColor;
    if (xyb && color) fm.style.boxShadow = xyb + ' ' + color;
  });
  // Update bubble bar indicator if palette was used
  const textBar = document.getElementById('bbTextBar');
  if (textBar && textBar._cprow !== undefined && !isNaN(textBar._cprow))
    textBar.style.background = TEXT_MATRIX[textBar._cprow][textBar._cpcol][dark ? 1 : 0];
}

// Apply table cell background color (position-mapped, swaps with theme)
export function applyTableCellBg(row, col) {
  const dark = _isDarkMode();
  const color = TEXT_MATRIX[row][col][dark ? 1 : 0];
  // Find current cell from selection
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  const cell = el && el.closest('.editor-content td,.editor-content th');
  if (!cell) return;
  cell.style.backgroundColor = color;
  // Mark cell with position for theme-swap
  cell.dataset.cellBg = color;
  cell.dataset.cellRow = row;
  cell.dataset.cellCol = col;
  // Update bar
  const cellBar = document.getElementById('bbCellBar');
  if (cellBar) cellBar.style.background = color;
  onContentChange();
}

export function clearTableCellBg() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  const el = node && node.nodeType === 3 ? node.parentElement : node;
  const cell = el && el.closest('.editor-content td,.editor-content th');
  if (!cell) return;
  cell.style.backgroundColor = '';
  delete cell.dataset.cellBg; delete cell.dataset.cellRow; delete cell.dataset.cellCol;
  const cellBar = document.getElementById('bbCellBar');
  if (cellBar) cellBar.style.background = '#f1f5f9';
  onContentChange();
}

function buildPalette(paletteId, mode) {
  const el = document.getElementById(paletteId); if (!el) return;
  const dark = _isDarkMode();
  const themeLabel = dark ? 'Dark' : 'Light';
  let html = '';

  // Theme badge
  html += `<div class="cp-theme-badge">${themeLabel} palette</div>`;

  if (mode === 'cell') {
    // Table cell background — same TEXT_MATRIX positions (row 0-3, col 0-6)
    html += '<div class="cp-title">Mau nen o bang</div>';
    TEXT_MATRIX.forEach((row, r) => {
      html += '<div class="cp-grid">';
      row.forEach(([lc, dc], c) => {
        const color = dark ? dc : lc;
        html += `<div class="cp-cell" style="background:${color}" data-r="${r}" data-c="${c}" title="${color}"></div>`;
      });
      html += '</div>';
    });
    html += '<div class="cp-divider"></div>';
    html += '<div class="cp-custom-row"><span class="cp-custom-label">Xoa mau nen</span></div>';
  } else if (mode === 'text') {
    // 4 rows x 7 cols
    TEXT_MATRIX.forEach((row, r) => {
      html += '<div class="cp-grid">';
      row.forEach(([lc, dc], c) => {
        const color = dark ? dc : lc;
        html += `<div class="cp-cell" style="background:${color}" data-r="${r}" data-c="${c}" title="${color}"></div>`;
      });
      html += '</div>';
    });
    html += '<div class="cp-divider"></div>';
    // Custom color
    html += '<div class="cp-custom-row"><span class="cp-custom-label">Mau tuy chinh</span></div>';
  } else {
    // Highlight: 7 swatches as A-letter tiles
    html += '<div class="cp-grid">';
    HL_MATRIX.forEach(([lb, db], c) => {
      const bg = dark ? db : lb;
      const tx = dark ? HL_TEXT_MATRIX[c][1] : HL_TEXT_MATRIX[c][0];
      const isTrans = bg === 'transparent';
      const bgStyle = isTrans ? 'background:repeating-conic-gradient(#555 0% 25%,#222 0% 50%) 0 0/8px 8px' : ('background:' + bg);
      html += `<div class="cp-hl-swatch" style="${bgStyle};color:${tx}" data-r="0" data-c="${c}" title="${isTrans ? 'Xoa mau' : bg}">A</div>`;
    });
    html += '</div>';
    html += '<div class="cp-divider"></div>';
    html += '<div class="cp-custom-row"><span class="cp-custom-label">Mau tuy chinh</span></div>';
  }

  el.innerHTML = html;

  // Attach click handlers via DOM (no string quoting issues)
  el.querySelectorAll('.cp-cell,.cp-hl-swatch').forEach(swatch => {
    swatch.addEventListener('mousedown', function (e) {
      e.preventDefault();
      const r = parseInt(this.dataset.r), c = parseInt(this.dataset.c);
      restoreRange();
      if (mode === 'cell') {
        applyTableCellBg(r, c);
      } else if (mode === 'text') {
        _applyMappedColor(r, c, 'text');
      } else {
        _applyMappedColor(r, c, 'hl');
      }
      closeAllPalettes();
    });
  });

  // Custom color / clear row
  const customRow = el.querySelector('.cp-custom-row');
  if (customRow) {
    if (mode === 'cell') {
      // "Clear" button for cell bg
      const clearBtn = document.createElement('button');
      clearBtn.className = 'fmedia-ibtn'; clearBtn.title = 'Xoa mau nen';
      clearBtn.style.cssText = 'width:auto;padding:0 8px;font-size:11px;color:#94a3b8;border:1px solid #334155;border-radius:4px;height:22px;cursor:pointer;background:transparent;font-family:var(--font)';
      clearBtn.textContent = 'Xoa mau';
      clearBtn.addEventListener('mousedown', function (ev) { ev.preventDefault(); restoreRange(); clearTableCellBg(); closeAllPalettes(); });
      customRow.appendChild(clearBtn);
    } else {
      const btn = document.createElement('div'); btn.className = 'cp-custom-btn'; btn.title = 'Mau tuy chinh';
      const icon = document.createElement('i'); icon.className = 'ti ti-plus'; icon.style.fontSize = '11px';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = '#ffffff';
      const _pid = paletteId, _mode = mode;
      inp.addEventListener('change', function (ev) {
        restoreRange();
        if (_mode === 'text') { bbTextColor(this.value); }
        else { bbHighlight(this.value); }
        closeAllPalettes(); setTimeout(bbShow, 10);
      });
      btn.appendChild(icon); btn.appendChild(inp);
      customRow.appendChild(btn);
    }
  }
}

export function toggleColorPalette(paletteId, triggerEl) {
  const el = document.getElementById(paletteId); if (!el) return;
  const mode = el.dataset.mode;
  if (_activePalette === paletteId && el.classList.contains('on')) { closeAllPalettes(); return; }
  closeAllPalettes();
  buildPalette(paletteId, mode);
  const rect = triggerEl.getBoundingClientRect();
  el.style.visibility = 'hidden'; el.classList.add('on');
  const w = el.offsetWidth || 200, h = el.offsetHeight || 300;
  let left = rect.left; let top = rect.bottom + 6;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = rect.top - h - 6;
  el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.visibility = '';
  _activePalette = paletteId;
}

export function applyColorFromPalette(paletteId, color, mode) {
  restoreRange();
  if (mode === 'text') { bbTextColor(color); }
  else { bbHighlight(color); }
  closeAllPalettes();
  setTimeout(bbShow, 10);
}

export function closeAllPalettes() {
  document.querySelectorAll('.color-palette').forEach(el => el.classList.remove('on'));
  _activePalette = null;
}

// Close on outside click
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.color-palette') && !e.target.closest('.bb-color-btn')) closeAllPalettes();
});

export function applyTextColor(color) { document.getElementById('textColorBar').style.background = color; document.getElementById('editor')?.focus(); document.execCommand('foreColor', false, color); onContentChange(); }
export function applyHighlight(color) { document.getElementById('bgColorBar').style.background = color; document.getElementById('editor')?.focus(); document.execCommand('hiliteColor', false, color); onContentChange(); }
export function bbRemoveHighlight() { restoreRange(); document.getElementById('editor')?.focus(); document.execCommand('hiliteColor', false, 'transparent'); onContentChange(); setTimeout(bbShow, 10); }
export function bbClear() { document.execCommand('removeFormat', false, null); onContentChange(); setTimeout(bbShow, 10); }

export function bbAlign(cmd) {
  // Works on collapsed cursor too — applies to whole paragraph
  document.execCommand(cmd, false, null);
  const editor = document.getElementById('editor'); if (editor) editor.focus();
  onContentChange();
  _updateAlignBtns();
  setTimeout(bbShow, 10);
}

function _updateAlignBtns() {
  const alignCmds = [['bbAlignL', 'justifyLeft'], ['bbAlignC', 'justifyCenter'], ['bbAlignR', 'justifyRight'], ['bbAlignJ', 'justifyFull']];
  alignCmds.forEach(([id, cmd]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
  // Also update main toolbar
  [['tbAlignL', 'justifyLeft'], ['tbAlignC', 'justifyCenter'], ['tbAlignR', 'justifyRight'], ['tbAlignJ', 'justifyFull']].forEach(([id, cmd]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
  });
}

export function bbInsertLink() { const url = prompt('Nhap URL:'); if (!url) return; document.execCommand('createLink', false, url); onContentChange(); bbHide(); }

export function bbOpenSpacingDD() {
  clearTimeout(_spacingCloseTimer); saveRange();
  const dd = document.getElementById('bbSpacingDD');
  const sel = window.getSelection(); let curLH = '1.15';
  if (sel && sel.rangeCount) {
    const node = sel.anchorNode; const el = node && node.nodeType === 3 ? node.parentElement : node;
    if (el) { const lh = window.getComputedStyle(el).lineHeight; curLH = lh === 'normal' ? '1.15' : parseFloat(lh).toFixed(2); }
  }
  dd.innerHTML = BB_SPACINGS.map(s => `<div class="bb-spacing-opt${parseFloat(s.val).toFixed(2) === parseFloat(curLH).toFixed(2) ? ' active' : ''}" onmousedown="event.preventDefault();bbApplySpacing('${s.val}')">${s.label}</div>`).join('');
  const wrap = document.getElementById('bbSpacingWrap');
  const r = wrap.getBoundingClientRect();
  dd.style.visibility = 'hidden'; dd.classList.add('on');
  const ddH = dd.offsetHeight || 200;
  let top = r.bottom + 2; if (top + ddH > window.innerHeight - 8) top = r.top - ddH - 2;
  dd.style.top = top + 'px'; dd.style.left = r.left + 'px'; dd.style.visibility = '';
}

export function bbCloseSpacingDD() { _spacingCloseTimer = setTimeout(() => document.getElementById('bbSpacingDD').classList.remove('on'), 120); }

export function bbApplySpacing(val) {
  restoreRange();
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const editor = document.getElementById('editor');
  const blocks = new Set();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    if (range.intersectsNode(node)) {
      let block = node.parentElement;
      while (block && block !== editor && !['P', 'H1', 'H2', 'H3', 'LI', 'DIV', 'BLOCKQUOTE'].includes(block.tagName)) { block = block.parentElement; }
      if (block && block !== editor) blocks.add(block);
    }
  }
  if (blocks.size === 0) {
    const span = document.createElement('span');
    span.style.lineHeight = val;
    try { range.surroundContents(span); } catch (e) { }
  } else { blocks.forEach(b => b.style.lineHeight = val); }
  document.getElementById('bbSpacingDD').classList.remove('on');
  onContentChange(); setTimeout(bbShow, 10);
}

function _checkBubble() {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount > 0 && _isEditableNode(sel.anchorNode)) { clearTimeout(_bubbleHideTimer); _bubbleHideTimer = setTimeout(bbShow, 30); }
  else { clearTimeout(_bubbleHideTimer); _bubbleHideTimer = setTimeout(() => { const bb = document.getElementById('bubbleToolbar'); if (bb && bb.matches(':hover')) return; bbHide(); }, 150); }
}

document.addEventListener('mouseup', _checkBubble);
document.addEventListener('keyup', _checkBubble);
document.addEventListener('selectionchange', () => { const sel = window.getSelection(); if (sel && !sel.isCollapsed && sel.rangeCount > 0 && _isEditableNode(sel.anchorNode)) { clearTimeout(_bubbleHideTimer); _bubbleHideTimer = setTimeout(bbShow, 30); } });

// ══ IMPORT MERGE (Nhập trang từ file) ══════════════════════
let _importMergeDocs = [];

export function importMergePages() {
  document.getElementById('importMergeInput').click();
}

export function handleImportMerge(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    // ── Project Docs JSON ──────────────────────────────────
    if (ext === 'json') {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.docs || !Array.isArray(imported.docs)) throw new Error('Invalid');
        _importMergeDocs = imported.docs;
        // Populate section selector
        const sel = document.getElementById('importMergeSection');
        sel.innerHTML = state.sections.map(s => `<option value="${escH(s)}">${escH(s)}</option>`).join('');
        // Build doc list
        const list = document.getElementById('importMergeList');
        const info = document.getElementById('importMergeInfo');
        info.style.display = '';
        info.innerHTML = `<i class="ti ti-file-description" style="font-size:14px;margin-right:6px;color:var(--accent)"></i>File: <strong>${escH(imported.projectName || file.name)}</strong> — ${imported.docs.length} trang`;
        list.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
          <button onclick="document.querySelectorAll('#importMergeList input').forEach(i=>i.checked=true)" style="font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;color:var(--text)">✓ Chọn tất cả</button>
          <button onclick="document.querySelectorAll('#importMergeList input').forEach(i=>i.checked=false)" style="font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;color:var(--text)">✕ Bỏ chọn</button>
        </div>`;
        const bySec = {};
        imported.docs.forEach(d => { const s = d.section || '(Không có nhóm)'; if (!bySec[s]) bySec[s] = []; bySec[s].push(d); });
        Object.entries(bySec).forEach(([sec, docs]) => {
          const grp = document.createElement('div'); grp.style.marginBottom = '8px';
          grp.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:4px 4px 2px">${escH(sec)}</div>`;
          docs.forEach(d => {
            const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background .1s';
            row.onmouseenter = () => row.style.background = 'var(--surface2)'; row.onmouseleave = () => row.style.background = '';
            const chk = document.createElement('input'); chk.type = 'checkbox'; chk.value = d.id; chk.checked = true; chk.style.accentColor = 'var(--accent)';
            const icon = document.createElement('i'); icon.className = 'ti ti-file-text'; icon.style.cssText = 'font-size:13px;color:var(--text2);flex-shrink:0';
            const title = document.createElement('span'); title.style.flex = '1'; title.textContent = d.title || 'Untitled';
            const preview = document.createElement('span'); preview.style.cssText = 'font-size:11px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
            preview.textContent = (d.content || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 60) || '(trống)';
            row.appendChild(chk); row.appendChild(icon); row.appendChild(title); row.appendChild(preview);
            grp.appendChild(row);
          });
          list.appendChild(grp);
        });
        openModal('importMergeModal');
      } catch (err) { toast('File JSON không hợp lệ', 'error'); }
      return;
    }
    // ── HTML / TXT / MD — nhập như một trang mới ──────────
    if (['html', 'htm', 'txt', 'md'].includes(ext)) {
      let content = ''; const rawName = file.name.replace(/\.[^.]+$/, '');
      if (ext === 'html' || ext === 'htm') {
        // Extract body content
        const tmp = document.createElement('div'); tmp.innerHTML = ev.target.result;
        const body = tmp.querySelector('body') || tmp;
        // Remove scripts/styles
        body.querySelectorAll('script,style,meta,link').forEach(e2 => e2.remove());
        content = body.innerHTML;
      } else if (ext === 'md') {
        // Basic markdown → html
        content = ev.target.result
          .replace(/^#{6}\s(.+)/gm, '<h6>$1</h6>')
          .replace(/^#{5}\s(.+)/gm, '<h5>$1</h5>')
          .replace(/^#{4}\s(.+)/gm, '<h4>$1</h4>')
          .replace(/^#{3}\s(.+)/gm, '<h3>$1</h3>')
          .replace(/^#{2}\s(.+)/gm, '<h2>$1</h2>')
          .replace(/^#{1}\s(.+)/gm, '<h1>$1</h1>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code>$1</code>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>');
        content = '<p>' + content + '</p>';
      } else {
        // Plain text → wrap in paragraphs
        content = ev.target.result.split(/\n\n+/).map(p => `<p>${escH(p.replace(/\n/g, '<br>'))}</p>`).join('');
      }
      // Show single-page import preview
      _importMergeDocs = [{ id: uid(), title: rawName, section: '', content, images: [], textBoxes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      const sel = document.getElementById('importMergeSection');
      sel.innerHTML = state.sections.map(s => `<option value="${escH(s)}">${escH(s)}</option>`).join('');
      const info = document.getElementById('importMergeInfo'); info.style.display = '';
      info.innerHTML = `<i class="ti ti-file-text" style="font-size:14px;margin-right:6px;color:var(--accent)"></i>File: <strong>${escH(file.name)}</strong> — 1 trang sẽ được tạo`;
      const list = document.getElementById('importMergeList');
      list.innerHTML = '';
      const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;background:var(--accent-light)';
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.value = _importMergeDocs[0].id; chk.checked = true; chk.style.accentColor = 'var(--accent)';
      const ic = document.createElement('i'); ic.className = 'ti ti-file-text'; ic.style.cssText = 'font-size:13px;color:var(--accent)';
      const t = document.createElement('span'); t.style.flex = '1'; t.textContent = rawName;
      const badge = document.createElement('span'); badge.style.cssText = 'font-size:10px;background:var(--accent);color:#fff;padding:1px 7px;border-radius:10px'; badge.textContent = ext.toUpperCase();
      row.appendChild(chk); row.appendChild(ic); row.appendChild(t); row.appendChild(badge);
      list.appendChild(row);
      openModal('importMergeModal');
      return;
    }
    toast('Chỉ hỗ trợ .json, .html, .txt, .md', 'error');
  };
  reader.readAsText(file); e.target.value = '';
}

export function doImportMerge() {
  const checkedIds = Array.from(document.querySelectorAll('#importMergeList input:checked')).map(i => i.value);
  if (!checkedIds.length) { toast('Chọn ít nhất 1 trang', 'error'); return; }
  const selected = _importMergeDocs.filter(d => checkedIds.includes(d.id));
  // Determine target section
  const newSecName = document.getElementById('importMergeNewSec')?.value.trim();
  let targetSec = newSecName || document.getElementById('importMergeSection')?.value;
  if (!targetSec) targetSec = state.sections[0] || 'Imported';
  // Add new section if needed
  if (newSecName && !state.sections.includes(newSecName)) state.sections.push(newSecName);
  // Import docs with new IDs to avoid conflicts
  const imported = selected.map(d => ({
    ...d,
    id: uid(), // new unique id
    section: targetSec,
    parentId: null,
    importedFrom: d.id,
    updatedAt: new Date().toISOString(),
  }));
  state.docs.push(...imported);
  persistNow(); renderSidebar();
  closeModal('importMergeModal');
  // Open the first imported doc
  if (imported.length) openDoc(imported[0].id);
  toast(`Đã nhập ${imported.length} trang vào section "${targetSec}"`, 'success');
}

// TOAST NOTIFICATION
export function toast(msg, type = 'info') {
  const w = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icons = { success: 'ti-circle-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  t.innerHTML = `<i class="ti ${icons[type] || 'ti-info-circle'}"></i> ${escH(msg)}`;
  w.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// THEME / INIT FUNCTIONS
export function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = next === 'dark' ? '&#9790;' : '&#9728;';
  document.documentElement.style.setProperty('color-scheme', next);
  // Auto-swap all palette-mapped colors in editor
  swapThemeColors();
}

export function updateUserUI() {
  const nameEl = document.getElementById('sbUsernameEl'); if (nameEl) nameEl.textContent = state.username;
  const avatarEl = document.getElementById('sbAvatarEl'); if (avatarEl) avatarEl.textContent = (state.username || 'U').charAt(0).toUpperCase();
}

export function openModal(id) { document.getElementById(id).classList.add('on'); }
export function closeModal(id, e) { if (e && e.target !== document.getElementById(id)) return; document.getElementById(id).classList.remove('on'); }

function applyTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('color-scheme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.innerHTML = theme === 'dark' ? '&#9790;' : '&#9728;';
}

function _checkShowWelcome() {
  const hasData = state.docs && state.docs.length > 0;
  if (!hasData) {
    const modal = document.getElementById('welcomeModal');
    if (modal) modal.style.display = 'flex';
  }
}

export function init() {
  applyTheme();
  _sbInitResize();
  _initSlashCommands();
  _pabLogoInit();
  initCanvasScaling();
  // Restore saved width
  const savedW = localStorage.getItem('sb_width');
  if (savedW) { const sb = document.getElementById('sidebar'); if (sb) sb.style.width = savedW + 'px'; }
  // Restore collapsed state
  if (localStorage.getItem('sb_collapsed') === '1') sbCollapse();
  loadState();
  document.getElementById('projectNameEl').textContent = state.projectName;
  const _spIcon = document.getElementById('sbSpaceIcon'); if (_spIcon) _spIcon.textContent = (state.projectName || 'P').charAt(0).toUpperCase();
  updateUserUI(); renderSidebar();
  if (state.currentDocId) openDoc(state.currentDocId);
  // Show welcome/restore modal if no data (new file or new path)
  setTimeout(_checkShowWelcome, 300);
  const tw = document.getElementById('drawTableWrap');
  const tg = document.getElementById('tableGrid');
  if (tw) tw.addEventListener('mouseleave', () => { _tgHideTimer = setTimeout(hideTableGrid, 200); });
  if (tg) tg.addEventListener('mouseenter', () => { clearTimeout(_tgHideTimer); });
}
