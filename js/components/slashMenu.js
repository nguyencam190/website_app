import { state } from '../core/state.js';
import { _idbGet, _idbSet, _compressForExport } from '../core/storage.js';
import { escH } from '../utils/helpers.js';
import { lbShow } from './media.js';

// Local shadow of state.js flags (reassignable)
export let _slashVisible = false;
export let _slashActiveIdx = 0;
export let _slashFiltered = [];
export let _slashSavedRange = null;

// ═══════════════════════════════════════════════════════════
// SLASH COMMANDS ENGINE
// ═══════════════════════════════════════════════════════════
export const SLASH_ITEMS=[
  // ── Văn bản ─────────────────────────────────────────────
  {id:'paragraph',icon:'<i class="ti ti-align-left"></i>',    name:'Đoạn văn bản', desc:'Chuyển về văn bản thông thường',     cat:'Văn bản', alias:'p text normal'},
  {id:'h1',       icon:'<span class="si-text">H1</span>',     name:'Tiêu đề 1',    desc:'Heading lớn nhất',                   cat:'Văn bản', alias:'heading1 h1'},
  {id:'h2',       icon:'<span class="si-text">H2</span>',     name:'Tiêu đề 2',    desc:'Heading cấp 2',                      cat:'Văn bản', alias:'heading2 h2'},
  {id:'h3',       icon:'<span class="si-text">H3</span>',     name:'Tiêu đề 3',    desc:'Heading cấp 3',                      cat:'Văn bản', alias:'heading3 h3'},
  {id:'h4',       icon:'<span class="si-text">H4</span>',     name:'Tiêu đề 4',    desc:'Heading cấp 4',                      cat:'Văn bản', alias:'heading4 h4'},
  {id:'h5',       icon:'<span class="si-text">H5</span>',     name:'Tiêu đề 5',    desc:'Heading cấp 5',                      cat:'Văn bản', alias:'heading5 h5'},
  {id:'h6',       icon:'<span class="si-text">H6</span>',     name:'Tiêu đề 6',    desc:'Heading cấp 6',                      cat:'Văn bản', alias:'heading6 h6'},
  {id:'quote',    icon:'<i class="ti ti-quote"></i>',          name:'Trích dẫn',    desc:'Blockquote có viền bên trái',        cat:'Văn bản', alias:'blockquote cite quote'},
  {id:'ul',       icon:'<i class="ti ti-list"></i>',           name:'Danh sách chấm', desc:'Bullet list không có thứ tự',      cat:'Văn bản', alias:'bullet ul list'},
  {id:'ol',       icon:'<i class="ti ti-list-numbers"></i>',   name:'Danh sách số', desc:'Numbered list có thứ tự',           cat:'Văn bản', alias:'numbered ol list 1'},
  {id:'task',     icon:'<i class="ti ti-checkbox"></i>',       name:'Danh sách việc', desc:'Checkbox todo list',               cat:'Văn bản', alias:'todo checkbox task check'},
  // ── Cấu trúc ─────────────────────────────────────────────
  {id:'table',    icon:'<i class="ti ti-table"></i>',          name:'Bảng',         desc:'Chèn bảng dữ liệu tùy chỉnh',       cat:'Cấu trúc', alias:'table grid'},
  {id:'col2',     icon:'<i class="ti ti-layout-columns"></i>', name:'2 Cột',        desc:'Chia bố cục thành 2 cột ngang',      cat:'Cấu trúc', alias:'column layout 2col two'},
  {id:'col3',     icon:'<i class="ti ti-layout-board"></i>',   name:'3 Cột',        desc:'Chia bố cục thành 3 cột ngang',      cat:'Cấu trúc', alias:'column layout 3col three'},
  {id:'divider',  icon:'<i class="ti ti-separator"></i>',      name:'Đường kẻ ngang', desc:'Thêm đường phân cách nội dung',    cat:'Cấu trúc', alias:'divider hr separator line'},
  // ── Media ─────────────────────────────────────────────────
  {id:'image',    icon:'<i class="ti ti-photo"></i>',           name:'Hình ảnh / GIF', desc:'Tải ảnh, GIF từ máy tính',       cat:'Media',    alias:'image photo picture img gif'},
  {id:'carousel', icon:'<i class="ti ti-slideshow"></i>',       name:'Carousel / Slider', desc:'Nhiều ảnh dạng trình chiếu', cat:'Media',    alias:'carousel slider gallery'},
  {id:'video',    icon:'<i class="ti ti-video"></i>',           name:'Video',        desc:'Tải file video từ máy tính',        cat:'Media',    alias:'video mp4 film'},
  {id:'embed',    icon:'<i class="ti ti-brand-youtube"></i>',   name:'Nhúng video',  desc:'YouTube, TikTok, Vimeo, Facebook',  cat:'Media',    alias:'embed youtube tiktok vimeo'},
  {id:'emoji',    icon:'<i class="ti ti-mood-smile"></i>',      name:'Emoji',        desc:'Chèn biểu tượng cảm xúc',          cat:'Media',    alias:'emoji icon smiley'},
  // ── Định dạng ─────────────────────────────────────────────
  {id:'code',     icon:'<i class="ti ti-code"></i>',            name:'Code Block',   desc:'Khối code với font mono',           cat:'Định dạng', alias:'code pre block monospace'},
  {id:'callout',  icon:'<i class="ti ti-bulb"></i>',            name:'Callout',      desc:'Hộp văn bản nổi bật có màu',       cat:'Định dạng', alias:'callout highlight box'},
  // ── Panel ─────────────────────────────────────────────────
  {id:'info',     icon:'<i class="ti ti-info-circle"></i>',     name:'Info Panel',   desc:'Hộp thông tin nền xanh',            cat:'Panel', alias:'info note tip blue'},
  {id:'success',  icon:'<i class="ti ti-circle-check"></i>',    name:'Success Panel', desc:'Hộp thành công nền xanh lá',      cat:'Panel', alias:'success done ok green'},
  {id:'warning',  icon:'<i class="ti ti-alert-triangle"></i>',  name:'Warning Panel', desc:'Hộp cảnh báo nền vàng',           cat:'Panel', alias:'warning caution yellow'},
  {id:'error',    icon:'<i class="ti ti-alert-circle"></i>',    name:'Error Panel',  desc:'Hộp lỗi nền đỏ',                   cat:'Panel', alias:'error danger red'},
  {id:'note',     icon:'<i class="ti ti-pin"></i>',             name:'Note Panel',   desc:'Hộp ghi chú nền tím',               cat:'Panel', alias:'note purple pin'},
];

// Recently used command IDs (max 3, persisted in localStorage)
let _slashRecent=[];
try{_slashRecent=JSON.parse(localStorage.getItem('slash_recent')||'[]');}catch(e){_slashRecent=[];}

export function slashOpen(){
  const sel=window.getSelection();
  if(!sel.rangeCount)return;
  _slashSavedRange=sel.getRangeAt(0).cloneRange();
  const rect=_slashGetCaretRect();
  const menu=document.getElementById('slashMenu');
  const vw=window.innerWidth,vh=window.innerHeight;
  const menuH=380;
  let top=rect.bottom+8, left=rect.left-4;
  if(top+menuH>vh-8)top=Math.max(8,rect.top-menuH-8);
  if(left+304>vw-8)left=Math.max(8,vw-308);
  menu.style.top=top+'px';
  menu.style.left=left+'px';
  menu.classList.add('on');
  _slashVisible=true;
  _slashActiveIdx=0;
  const inp=document.getElementById('slashMenuInp');
  inp.value='';
  slashBuild('');
  setTimeout(()=>inp.focus(),30);
}

export function slashClose(){
  document.getElementById('slashMenu')?.classList.remove('on');
  _slashVisible=false;
  _slashActiveIdx=0;
  const editor=document.getElementById('editor');
  if(editor)editor.focus();
}

export function slashFilter(q){
  _slashActiveIdx=0;
  slashBuild(q.toLowerCase().trim());
}

export function slashBuild(q){
  const list=document.getElementById('slashMenuList');
  let items;
  let showingRecent=false;

  if(!q){
    // Show recent commands first, then all
    const recentItems=_slashRecent
      .map(id=>SLASH_ITEMS.find(it=>it.id===id))
      .filter(Boolean)
      .map(it=>({...it,_isRecent:true}));
    const rest=SLASH_ITEMS;
    items=[...recentItems,...rest];
    if(recentItems.length)showingRecent=true;
  } else {
    items=SLASH_ITEMS.filter(it=>{
      const needle=q.toLowerCase();
      return it.name.toLowerCase().includes(needle)||
             it.desc.toLowerCase().includes(needle)||
             it.cat.toLowerCase().includes(needle)||
             (it.alias||'').toLowerCase().includes(needle);
    });
  }
  _slashFiltered=items;

  if(!items.length){
    list.innerHTML=`<div class="slash-menu-empty"><i class="ti ti-search"></i>Không tìm thấy "<strong>${escH(q)}</strong>"<br><span style="font-size:11px;margin-top:4px;display:block;color:var(--text3)">Thử tìm: table, h1, image, panel...</span></div>`;
    return;
  }

  // Build grouped HTML using DocumentFragment for performance
  const frag=document.createDocumentFragment();

  if(showingRecent&&_slashRecent.length){
    const sec=document.createElement('div');
    sec.className='slash-menu-section';
    sec.innerHTML='<i class="ti ti-history" style="font-size:10px"></i> Gần đây';
    frag.appendChild(sec);
    items.filter(it=>it._isRecent).forEach((item,idx)=>{
      frag.appendChild(_slashMakeItem(item,idx));
    });
  }

  const cats=[...new Set(items.filter(it=>!it._isRecent).map(i=>i.cat))];
  let flatIdx=showingRecent?_slashRecent.length:0;
  cats.forEach(cat=>{
    const sec=document.createElement('div');
    sec.className='slash-menu-section';
    sec.textContent=cat;
    frag.appendChild(sec);
    items.filter(it=>it.cat===cat&&!it._isRecent).forEach(item=>{
      frag.appendChild(_slashMakeItem(item,flatIdx));
      flatIdx++;
    });
  });

  list.innerHTML='';
  list.appendChild(frag);
}

function _slashMakeItem(item,idx){
  const el=document.createElement('div');
  el.className='slash-item'+(idx===_slashActiveIdx?' active':'');
  el.dataset.id=item.id;
  el.dataset.cat=item._isRecent?'Recent':item.cat;
  el.setAttribute('role','option');
  el.innerHTML=`<div class="slash-item-icon">${item.icon}</div><div class="slash-item-info"><div class="slash-item-name">${escH(item.name)}</div><div class="slash-item-desc">${escH(item.desc)}</div></div>`;
  el.addEventListener('mousedown',e=>{e.preventDefault();slashExec(item.id);});
  el.addEventListener('mouseenter',()=>{_slashActiveIdx=idx;slashHighlight();});
  return el;
}

function slashHighlight(){
  const items=document.querySelectorAll('.slash-item');
  items.forEach((el,i)=>el.classList.toggle('active',i===_slashActiveIdx));
  items[_slashActiveIdx]?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

// Delete the "/" that triggered the menu, then execute command
export function slashExec(id){
  // Track recent usage
  _slashRecent=_slashRecent.filter(r=>r!==id);
  _slashRecent.unshift(id);
  if(_slashRecent.length>3)_slashRecent.length=3;
  try{localStorage.setItem('slash_recent',JSON.stringify(_slashRecent));}catch(e){}

  slashClose();
  const sel=window.getSelection();
  try{
    if(_slashSavedRange){sel.removeAllRanges();sel.addRange(_slashSavedRange);}
  }catch(e){}
  _slashDeleteSlash();
  try{
    if(sel.rangeCount)_slashSavedRange=sel.getRangeAt(0).cloneRange();
  }catch(e){}
  setTimeout(()=>_slashInsert(id),10);
}

// Walk backwards from cursor to find '/' and delete from there to cursor.
// This correctly handles both: (a) user typed "/cmd" in editor, (b) user typed in search input.
function _slashDeleteSlash(){
  const sel=window.getSelection();
  if(!sel.rangeCount)return;
  const range=sel.getRangeAt(0);
  const node=range.startContainer;

  if(node.nodeType===Node.TEXT_NODE){
    const txt=node.textContent;
    const offset=range.startOffset;
    // Walk backwards to find the triggering '/'
    let si=offset-1;
    while(si>=0&&txt[si]!=='/')si--;
    if(si<0)return;
    const r=document.createRange();
    r.setStart(node,si);r.setEnd(node,offset);
    r.deleteContents();
  } else if(node.nodeType===Node.ELEMENT_NODE){
    // Cursor at element level (empty td, etc.) — search child text nodes
    const offset=range.startOffset;
    for(let i=offset-1;i>=0;i--){
      const ch=node.childNodes[i];
      if(ch&&ch.nodeType===Node.TEXT_NODE){
        const txt=ch.textContent;
        let si=txt.length-1;
        while(si>=0&&txt[si]!=='/')si--;
        if(si>=0){
          const r=document.createRange();
          r.setStart(ch,si);r.setEnd(ch,txt.length);
          r.deleteContents();
        }
        break;
      }
    }
  }
}

function _slashInsert(id){
  const editor=document.getElementById('editor');
  const sel=window.getSelection();

  // Helper: find nearest block ancestor (direct child of editor or container)
  function _nearestBlock(sel2,ed){
    if(!sel2||!sel2.rangeCount)return null;
    let node=sel2.getRangeAt(0).startContainer;
    while(node&&node.parentElement!==ed&&
          !['TD','TH'].includes(node.parentElement?.tagName)&&
          !node.parentElement?.classList.contains('cf-column-item'))
      node=node.parentElement;
    return (node&&node!==ed)?node:null;
  }

  // Helper: insert block after current block, focus inside it
  function _insertAfterCurrent(block,focusTarget){
    const sel2=window.getSelection();
    const cur=_nearestBlock(sel2,editor);
    const p=document.createElement('p');p.innerHTML='<br>';
    if(cur&&cur.parentElement){
      cur.parentElement.insertBefore(block,cur.nextSibling);
      cur.parentElement.insertBefore(p,block.nextSibling);
      if((cur.tagName==='P'||cur.tagName==='DIV')&&!cur.textContent.trim())cur.remove();
    } else {
      editor.appendChild(block);editor.appendChild(p);
    }
    if(focusTarget){
      try{
        const r=document.createRange();
        r.setStart(focusTarget,0);r.collapse(true);
        sel2.removeAllRanges();sel2.addRange(r);
        editor.focus();
      }catch(e){}
    }
  }

  // ── Table ────────────────────────────────────────────────
  if(id==='table'){_slashShowTableGrid();return;}

  // ── Media file pickers ───────────────────────────────────
  if(id==='image'||id==='video'){
    const accept=id==='image'?'image/*,image/gif':'video/mp4,video/webm,video/ogg,video/mov,.mp4,.webm,.mov';
    const inp=document.createElement('input');
    inp.type='file';inp.accept=accept;inp.multiple=(id==='image');
    inp.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(inp);
    inp.addEventListener('change',async function(){
      const files=Array.from(this.files);
      document.body.removeChild(inp);
      if(!files.length)return;
      for(const f of files)await cfInsertImageBlock(f);
    });
    inp.click();return;
  }
  if(id==='carousel'){
    const inp=document.createElement('input');
    inp.type='file';inp.accept='image/*,image/gif';inp.multiple=true;
    inp.style.cssText='position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(inp);
    inp.addEventListener('change',async function(){
      const files=Array.from(this.files);
      document.body.removeChild(inp);
      if(!files.length)return;
      const block=await cfBuildCarouselBlock(files);
      if(block)_cfInsertBlockAtRange(block,_slashSavedRange);
      onContentChange();
    });
    inp.click();return;
  }
  if(id==='embed'){cfEmbedOpen();return;}
  if(id==='emoji'){_slashShowEmoji();return;}

  // ── Paragraph (convert to normal text) ──────────────────
  if(id==='paragraph'){
    const cur=_nearestBlock(sel,editor);
    if(cur&&cur!==editor&&cur.tagName!=='P'){
      const p=document.createElement('p');
      p.innerHTML=cur.innerHTML||'<br>';
      cur.parentElement.replaceChild(p,cur);
      try{const r=document.createRange();r.selectNodeContents(p);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}catch(e){}
    }
    onContentChange();return;
  }

  // ── Headings ─────────────────────────────────────────────
  if(/^h[1-6]$/.test(id)){
    const cur=_nearestBlock(sel,editor);
    if(cur&&cur!==editor){
      const heading=document.createElement(id);
      heading.innerHTML=cur.innerHTML||'<br>';
      cur.parentElement.replaceChild(heading,cur);
      try{const r=document.createRange();r.selectNodeContents(heading);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}catch(e){}
      onContentChange();return;
    }
    document.execCommand('formatBlock',false,id);
    onContentChange();return;
  }

  // ── Blockquote ───────────────────────────────────────────
  if(id==='quote'){
    const cur=_nearestBlock(sel,editor);
    const bq=document.createElement('blockquote');
    bq.innerHTML=(cur&&cur.textContent.trim()?cur.innerHTML:'')||'<br>';
    _insertAfterCurrent(bq,bq);
    onContentChange();return;
  }

  // ── Lists ────────────────────────────────────────────────
  if(id==='ul'||id==='ol'){
    const list=document.createElement(id);
    const li=document.createElement('li');li.innerHTML='<br>';
    list.appendChild(li);
    _insertAfterCurrent(list,li);
    onContentChange();return;
  }

  // ── Task list (checkbox) ─────────────────────────────────
  if(id==='task'){
    const ul=document.createElement('ul');
    ul.className='task-list';ul.style.listStyle='none';ul.style.paddingLeft='4px';
    const li=document.createElement('li');
    li.className='task-item';li.style.display='flex';li.style.alignItems='flex-start';li.style.gap='8px';
    const cb=document.createElement('input');
    cb.type='checkbox';cb.contentEditable='false';cb.style.cssText='flex-shrink:0;margin-top:4px;cursor:pointer;accent-color:var(--accent)';
    cb.addEventListener('change',()=>onContentChange());
    const span=document.createElement('span');span.contentEditable='true';span.innerHTML='<br>';
    span.style.flex='1';
    li.appendChild(cb);li.appendChild(span);ul.appendChild(li);
    _insertAfterCurrent(ul,span);
    onContentChange();return;
  }

  // ── Divider ──────────────────────────────────────────────
  if(id==='divider'){
    const hr=document.createElement('hr');
    hr.className='cf-divider';hr.contentEditable='false';
    _cfInsertBlockAtRange(hr,_slashSavedRange);
    onContentChange();return;
  }

  // ── Code Block ───────────────────────────────────────────
  if(id==='code'){insertCode();onContentChange();return;}

  // ── Column Layouts ───────────────────────────────────────
  if(id==='col2'||id==='col3'){
    const n=id==='col2'?2:3;
    const layout=_cfBuildColumnLayout(n);
    _cfInsertBlockAtRange(layout,_slashSavedRange);
    onContentChange();
    setTimeout(()=>{const first=layout.querySelector('.cf-column-item');if(first)first.focus();},30);
    return;
  }

  // ── Panels ───────────────────────────────────────────────
  if(['info','success','warning','error','note','callout'].includes(id)){
    const icons={info:'ℹ️',success:'✅',warning:'⚠️',error:'🚨',note:'📌',callout:'💡'};
    const type=id==='callout'?'info':id;
    const panel=document.createElement('div');
    panel.className='cf-panel '+type;panel.contentEditable='false';
    const iconEl=document.createElement('span');iconEl.className='cf-panel-icon';iconEl.textContent=icons[id];
    const content=document.createElement('div');content.className='cf-panel-content';content.contentEditable='true';
    const actions=document.createElement('div');actions.className='cf-panel-actions';
    actions.innerHTML='<button class="cf-panel-type-btn" onclick="cfPanelChangeType(this)" title="Đổi loại">⚙️</button><button class="cf-panel-del" onclick="this.closest(\'.cf-panel\').remove();onContentChange()" title="Xóa">✕</button>';
    panel.appendChild(iconEl);panel.appendChild(content);panel.appendChild(actions);
    _insertAfterCurrent(panel,null);
    onContentChange();
    setTimeout(()=>content.focus(),30);
    return;
  }
}

// Show inline table grid at caret position — theme-aware via CSS classes
function _slashShowTableGrid(){
  document.getElementById('slashTgPopup')?.remove();
  const popup=document.createElement('div');
  popup.id='slashTgPopup';
  popup.className='slash-tg-popup';

  const TG_ROWS=8,TG_COLS=10;
  const grid=document.createElement('div');
  grid.id='slashTgGrid';grid.style.cssText='display:flex;flex-direction:column;gap:3px';

  for(let r=0;r<TG_ROWS;r++){
    const row=document.createElement('div');row.style.cssText='display:flex;gap:3px';
    for(let cc=0;cc<TG_COLS;cc++){
      const cell=document.createElement('div');
      cell.className='slash-tg-cell';
      cell.dataset.r=r;cell.dataset.c=cc;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  popup.appendChild(grid);

  const label=document.createElement('div');
  label.id='slashTgLabel';label.className='slash-tg-label';label.textContent='Chọn kích thước bảng';
  popup.appendChild(label);

  const customRow=document.createElement('div');
  customRow.className='slash-tg-custom';
  customRow.innerHTML=`<input class="slash-tg-inp" id="slashTgC" type="number" min="1" max="20" value="3" title="Số cột"><span style="color:var(--text3);font-size:12px">×</span><input class="slash-tg-inp" id="slashTgR" type="number" min="1" max="50" value="3" title="Số hàng"><button class="slash-tg-btn" id="slashTgBtn">Tạo bảng</button>`;
  popup.appendChild(customRow);
  document.body.appendChild(popup);

  // Position near caret
  const rect=_slashGetCaretRect();
  const vw=window.innerWidth,vh=window.innerHeight;
  const pw=306,ph=320;
  let top=rect.bottom+8,left=rect.left-4;
  if(top+ph>vh-8)top=Math.max(8,rect.top-ph-8);
  if(left+pw>vw-8)left=Math.max(8,vw-pw-8);
  popup.style.top=top+'px';popup.style.left=left+'px';

  function setHighlight(row,col){
    popup.querySelectorAll('.slash-tg-cell').forEach(c=>{
      c.classList.toggle('on',+c.dataset.r<=row&&+c.dataset.c<=col);
    });
    label.textContent=(col+1)+' cột × '+(row+1)+' hàng';
    document.getElementById('slashTgC').value=col+1;
    document.getElementById('slashTgR').value=row+1;
  }

  popup.querySelectorAll('.slash-tg-cell').forEach(cell=>{
    cell.addEventListener('mouseenter',()=>setHighlight(+cell.dataset.r,+cell.dataset.c));
    cell.addEventListener('click',()=>{popup.remove();tgInsert(+cell.dataset.r+1,+cell.dataset.c+1);});
  });
  document.getElementById('slashTgBtn').addEventListener('click',()=>{
    const r=Math.max(1,Math.min(50,parseInt(document.getElementById('slashTgR').value)||3));
    const cc=Math.max(1,Math.min(20,parseInt(document.getElementById('slashTgC').value)||3));
    popup.remove();tgInsert(r,cc);
  });
  setTimeout(()=>document.addEventListener('mousedown',function once(e){
    if(!popup.contains(e.target)){popup.remove();document.removeEventListener('mousedown',once);}
  }),80);
}

// ═══ COLUMN LAYOUT ENGINE ═══════════════════════════════════
// Distribution presets: [flex values per column]
const CF_DISTS={
  'equal':  null, // all flex:1
  'left':   [2,1,1],
  'center': [1,2,1],
  'right':  [1,1,2],
};
const CF_DIST_ICONS={
  'equal': `<svg class="cf-col-dist-svg" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="4.5" height="12" rx="1"/><rect x="6.75" y="1" width="4.5" height="12" rx="1"/><rect x="12.5" y="1" width="4.5" height="12" rx="1"/></svg>`,
  'left':   `<svg class="cf-col-dist-svg" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="8" height="12" rx="1"/><rect x="10.5" y="1" width="3" height="12" rx="1"/><rect x="14.5" y="1" width="3" height="12" rx="1"/></svg>`,
  'center': `<svg class="cf-col-dist-svg" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="3" height="12" rx="1"/><rect x="5.5" y="1" width="7" height="12" rx="1"/><rect x="14" y="1" width="3" height="12" rx="1"/></svg>`,
  'right':  `<svg class="cf-col-dist-svg" viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="3" height="12" rx="1"/><rect x="5" y="1" width="3" height="12" rx="1"/><rect x="9.5" y="1" width="8" height="12" rx="1"/></svg>`,
};

function _cfBuildColumnLayout(n, dist='equal'){
  const layout=document.createElement('div');
  layout.className='cf-column-layout';
  layout.contentEditable='false'; // block là atomic, columns bên trong mới editable
  layout.dataset.cols=n;layout.dataset.dist=dist;
  layout.appendChild(_cfBuildToolbar(layout,n,dist));
  _cfRebuildCols(layout,n,dist,null);
  return layout;
}

function _cfBuildToolbar(layout,n,dist){
  const tb=document.createElement('div');tb.className='cf-col-toolbar';
  // ── Count selector ──────────────────────────────────
  const cntWrap=document.createElement('div');cntWrap.className='cf-col-count-wrap';
  const cntBtn=document.createElement('button');cntBtn.className='cf-col-count-btn';
  cntBtn.innerHTML=n+' Columns <i class="ti ti-chevron-down" style="font-size:10px"></i>';
  const cntDd=document.createElement('div');cntDd.className='cf-col-count-dd';
  [2,3,4,5,6].forEach(num=>{
    const item=document.createElement('div');item.className='cf-col-count-item'+(num===n?' active':'');
    item.textContent=num+' Columns';
    item.addEventListener('click',()=>{
      cntDd.classList.remove('on');
      _cfSetCols(layout,num);
    });
    cntDd.appendChild(item);
  });
  cntBtn.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});cntBtn.addEventListener('click',e=>{e.stopPropagation();cntDd.classList.toggle('on');});
  cntWrap.appendChild(cntBtn);cntWrap.appendChild(cntDd);
  // ── Separator ──────────────────────────────────────
  const sep1=document.createElement('div');sep1.className='cf-col-sep-v';
  // ── Distribution buttons ────────────────────────────
  const distWrap=document.createElement('div');distWrap.style.cssText='display:flex;align-items:center;gap:2px';
  // Only show relevant distributions for 3-col layouts
  const dists=n===2?['equal','left','right']:['equal','left','center','right'];
  dists.forEach(key=>{
    const btn=document.createElement('button');btn.className='cf-col-dist-btn'+(key===dist?' active':'');
    btn.innerHTML=CF_DIST_ICONS[key];btn.title=key;btn.dataset.dist=key;
    btn.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      _cfSetDist(layout,key);
      distWrap.querySelectorAll('.cf-col-dist-btn').forEach(b=>b.classList.toggle('active',b.dataset.dist===key));
    });
    distWrap.appendChild(btn);
  });
  // ── Separator ──────────────────────────────────────
  const sep2=document.createElement('div');sep2.className='cf-col-sep-v';
  // ── More menu ───────────────────────────────────────
  const moreWrap=document.createElement('div');moreWrap.className='cf-col-more-wrap';
  const moreBtn=document.createElement('button');moreBtn.className='cf-col-more-btn';
  moreBtn.innerHTML='<i class="ti ti-dots"></i>';
  const moreDd=document.createElement('div');moreDd.className='cf-col-more-dd';
  const copyItem=document.createElement('div');copyItem.className='cf-col-more-item';
  copyItem.innerHTML='<i class="ti ti-copy" style="font-size:14px;color:var(--text2)"></i> Sao chép';
  copyItem.addEventListener('click',()=>{
    moreDd.classList.remove('on');
    const clone=layout.cloneNode(true);_cfInitLayout(clone);
    layout.parentElement.insertBefore(clone,layout.nextSibling);onContentChange();
  });
  const delItem=document.createElement('div');delItem.className='cf-col-more-item danger';
  delItem.innerHTML='<i class="ti ti-trash" style="font-size:14px"></i> Xóa layout';
  delItem.addEventListener('mousedown',e=>{
    e.preventDefault();e.stopPropagation();
  });
  delItem.addEventListener('click',e=>{
    e.stopPropagation();
    moreDd.style.display='none';
    // Find the layout by walking up from the delete item itself
    const actualLayout=delItem.closest('.cf-column-layout')||layout;
    if(actualLayout&&actualLayout.parentNode){
      // Insert a replacement paragraph so cursor has somewhere to go
      const fallback=document.createElement('p');fallback.innerHTML='<br>';
      actualLayout.parentNode.insertBefore(fallback,actualLayout);
      actualLayout.remove();
      // Focus editor
      const sel=window.getSelection();const r=document.createRange();
      try{r.setStart(fallback,0);r.collapse(true);sel.removeAllRanges();sel.addRange(r);}catch(er){}
      document.getElementById('editor')?.focus();
      onContentChange();
    }
  });
  moreDd.appendChild(copyItem);moreDd.appendChild(delItem);
  moreBtn.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});
  moreBtn.addEventListener('click',e=>{
    e.stopPropagation();
    const isOpen=moreDd.style.display==='block';
    // Close all other dropdowns first
    document.querySelectorAll('.cf-col-more-dd').forEach(d=>{d.style.display='';});
    document.querySelectorAll('.cf-col-count-dd').forEach(d=>d.classList.remove('on'));
    moreDd.style.display=isOpen?'':'block';
  });
  moreWrap.appendChild(moreBtn);moreWrap.appendChild(moreDd);
  tb.appendChild(cntWrap);tb.appendChild(sep1);tb.appendChild(distWrap);tb.appendChild(sep2);tb.appendChild(moreWrap);
  // Close dropdowns on outside click
  document.addEventListener('click',e=>{
    if(!e.target.closest('.cf-col-more-wrap'))moreDd.style.display='';
    if(!e.target.closest('.cf-col-count-wrap'))cntDd.classList.remove('on');
  });
  return tb;
}

function _cfUpdateEmpty(col){
  // Column is 'empty' if it has no real text (ignoring <br> that browser adds)
  const txt=col.textContent||'';
  const hasRealContent=txt.trim().length>0||col.querySelectorAll('img,video,table,.cf-img-block,.cf-panel').length>0;
  col.classList.toggle('cf-col-empty',!hasRealContent);
}

function _cfRebuildCols(layout,n,dist,existingContent){
  layout.querySelectorAll('.cf-column-item,.cf-col-sep-line').forEach(el=>el.remove());
  const distVals=CF_DISTS[dist]||(Array(n).fill(1));
  const flexVals=Array.from({length:n},(_,i)=>distVals[i]||1);
  const cols=[];
  for(let i=0;i<n;i++){
    const col=document.createElement('div');col.className='cf-column-item';
    col.contentEditable='true';col.dataset.placeholder='Cột '+(i+1)+'...';
    col.style.flex=flexVals[i];
    // Restore saved content
    if(existingContent&&existingContent[i])col.innerHTML=existingContent[i];
    // Tab → next/prev column
    col.addEventListener('keydown',e=>{
      if(e.key==='Tab'){
        e.preventDefault();
        const items=Array.from(layout.querySelectorAll('.cf-column-item'));
        const idx=items.indexOf(col);
        const next=e.shiftKey?items[idx-1]:items[idx+1];
        if(next)next.focus();
        else if(!e.shiftKey){
          // Tab from last column → insert paragraph after layout
          const p=document.createElement('p');p.innerHTML='<br>';
          layout.parentElement.insertBefore(p,layout.nextSibling);
          const sel=window.getSelection();const r=document.createRange();
          r.setStart(p,0);r.collapse(true);sel.removeAllRanges();sel.addRange(r);
          document.getElementById('editor')?.focus();
        }
      }
    });
    col.addEventListener('input',()=>{_cfUpdateEmpty(col);onContentChange();});
    col.addEventListener('focus',()=>{_cfUpdateEmpty(col);layout.classList.add('focused');});
    col.addEventListener('blur',()=>{
      _cfUpdateEmpty(col);
      setTimeout(()=>{if(!layout.querySelector(':focus'))layout.classList.remove('focused');},80);
    });
    // Initialize empty state
    setTimeout(()=>_cfUpdateEmpty(col),0);
    // Drag-drop image into column
    col.addEventListener('dragover',e=>{
      if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();col.style.outline='2px solid var(--accent)';}
    });
    col.addEventListener('dragleave',()=>{col.style.outline='';});
    col.addEventListener('drop',async e=>{
      e.preventDefault();e.stopPropagation();col.style.outline='';
      const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));
      for(const f of files){
        const block=await _cfMakeImgBlock(f);
        if(block)col.appendChild(block);
      }
      if(files.length)onContentChange();
    });
    // Paste image into column
    col.addEventListener('paste',async e=>{
      const items=Array.from(e.clipboardData?.items||[]);
      const imgItem=items.find(it=>it.type.startsWith('image/'));
      if(imgItem){e.preventDefault();const f=imgItem.getAsFile();if(f){const b=await _cfMakeImgBlock(f);if(b){col.appendChild(b);onContentChange();}}}
    });
    cols.push(col);
    layout.appendChild(col);
    if(i<n-1){
      const sep=document.createElement('div');sep.className='cf-col-sep-line';
      // Draggable separator — resize adjacent columns
      _cfInitSepDrag(sep,col,null,layout,i);
      layout.appendChild(sep);
    }
  }
  // Set right column for each separator after all cols created
  // Sep drag already initialized in loop — skip duplicate
  // (removing duplicate that caused cloneNode race)
}

function _cfInitSepDrag(sep,leftCol,rightCol,layout,idx){
  // Attach directly without cloning (cloning removes data-* and listeners)
  sep.addEventListener('mousedown',e=>{
    e.preventDefault();
    if(!leftCol||!rightCol){
      // Find fresh refs
      const items=Array.from(layout.querySelectorAll('.cf-column-item'));
      leftCol=items[idx];rightCol=items[idx+1];
      if(!leftCol||!rightCol)return;
    }
    const startX=e.clientX;
    const startLeft=leftCol.offsetWidth;
    const startRight=rightCol.offsetWidth;
    sep.style.background='var(--accent)';
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    function mm(e2){
      const dx=e2.clientX-startX;
      const newL=Math.max(80,startLeft+dx);
      const newR=Math.max(80,startRight-dx);
      leftCol.style.flex='none';leftCol.style.width=newL+'px';
      rightCol.style.flex='none';rightCol.style.width=newR+'px';
    }
    function mu(){
      sep.style.background='';document.body.style.cursor='';document.body.style.userSelect='';
      document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);
      // Convert px to flex ratio
      const total=leftCol.offsetWidth+rightCol.offsetWidth;
      const lFlex=(leftCol.offsetWidth/total).toFixed(3);
      const rFlex=(rightCol.offsetWidth/total).toFixed(3);
      leftCol.style.flex=lFlex;leftCol.style.width='';
      rightCol.style.flex=rFlex;rightCol.style.width='';
      onContentChange();
    }
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
  });
}

function _cfSetCols(layout,n){
  const dist=layout.dataset.dist||'equal';
  layout.dataset.cols=n;
  const existing=Array.from(layout.querySelectorAll('.cf-column-item')).map(col=>col.innerHTML);
  const oldTb=layout.querySelector('.cf-col-toolbar');if(oldTb)oldTb.remove();
  layout.insertBefore(_cfBuildToolbar(layout,n,dist),layout.firstChild);
  _cfRebuildCols(layout,n,dist,existing);
  onContentChange();
}

function _cfSetDist(layout,dist){
  layout.dataset.dist=dist;
  const n=parseInt(layout.dataset.cols)||2;
  const distVals=CF_DISTS[dist]||(Array(n).fill(1));
  const flexVals=Array.from({length:n},(_,i)=>distVals[i]||1);
  layout.querySelectorAll('.cf-column-item').forEach((col,i)=>{
    col.style.flex=flexVals[i];col.style.width='';
  });
  onContentChange();
}

// Re-initialize a cloned layout (rewire event handlers)
function _cfInitLayout(layout){
  const n=parseInt(layout.dataset.cols)||2;
  const dist=layout.dataset.dist||'equal';
  const existing=Array.from(layout.querySelectorAll('.cf-column-item')).map(col=>col.innerHTML);
  const oldTb=layout.querySelector('.cf-col-toolbar');if(oldTb)oldTb.remove();
  layout.insertBefore(_cfBuildToolbar(layout,n,dist),layout.firstChild);
  _cfRebuildCols(layout,n,dist,existing);
}

export function slashAddCol(btn){
  const layout=btn.closest('.cf-column-layout');if(!layout)return;
  const n=parseInt(layout.dataset.cols||2)+1;
  _cfSetCols(layout,Math.min(6,n));
}
export function slashRemoveCol(btn){
  const layout=btn.closest('.cf-column-layout');if(!layout)return;
  const n=parseInt(layout.dataset.cols||2)-1;
  _cfSetCols(layout,Math.max(1,n));
}

// Get caret bounding rect
function _slashGetCaretRect(){
  const sel=window.getSelection();
  if(!sel.rangeCount)return{top:100,bottom:116,left:100,right:116};
  const range=sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect=range.getBoundingClientRect();
  if(!rect||(!rect.top&&!rect.left)){
    const editor=document.getElementById('editor');
    const er=editor.getBoundingClientRect();
    return{top:er.top+20,bottom:er.top+36,left:er.left+20,right:er.left+36};
  }
  return rect;
}

// ═══ INLINE IMAGE / VIDEO BLOCK ENGINE ═════════════════════
let _cfImgSelected=null;

async function _cfMakeImgBlock(file){
  if(!file)return null;
  const id=uid();
  const isVid=file.type.startsWith('video/');
  try{await _idbPut(id,file);}catch(e){}
  const objUrl=URL.createObjectURL(file);
  _cacheUrl(id,objUrl);
  return _cfBuildImgBlock(id,objUrl,isVid,file.name||'image');
}
export async function cfInsertImageBlock(file){
  if(!file)return;
  // Store in IDB
  const id=uid();
  const isVid=file.type.startsWith('video/');
  let blob=file;
  if(!isVid){
    // Compress image
    blob=await new Promise(res=>{
      const img=new Image(),url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const MAX=1800;let{width:w,height:h}=img;
        if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        const ctx=cv.getContext('2d');ctx.drawImage(img,0,0,w,h);
        const mime=file.type==='image/png'?'image/png':'image/jpeg';
        cv.toBlob(b=>res(b),mime,0.88);
      };
      img.onerror=()=>res(file);img.src=url;
    });
  }
  try{await _idbPut(id,blob);}catch(e){}
  const objUrl=URL.createObjectURL(blob);
  _cacheUrl(id,objUrl);
  const block=_cfBuildImgBlock(id,objUrl,isVid,file.name||'image');
  // Use saved slash range to insert at correct position (column OR main editor)
  _cfInsertBlockAtRange(block,_slashSavedRange);
  onContentChange();
  setTimeout(()=>_cfImgSelect(block),30);
}

// Generic: insert a block element at the saved range position
// Works inside column items, panels, table cells, or main editor
export function _cfInsertBlockAtRange(block, savedRange){
  const editor=document.getElementById('editor');
  if(!editor)return;
  let insertParent=null, insertBefore=null;

  // Try to find insertion point from range
  const range=savedRange||(window.getSelection()?.rangeCount?window.getSelection().getRangeAt(0):null);
  if(range){
    try{
      let node=range.startContainer;
      // Climb up DOM to find a direct-child-of-editor or valid container
      while(node&&node!==document){
        const par=node.parentElement||node.parentNode;
        if(!par)break;
        if(par.classList?.contains('cf-column-item')||
           par.classList?.contains('cf-panel-content')||
           par.tagName==='TD'||par.tagName==='TH'||
           par===editor){
          // Found the container — insert after current node
          insertParent=par;
          // If node is an empty block, replace it; otherwise insert after
          const isEmptyBlock=(node.tagName==='P'||node.tagName==='DIV')&&
                             !node.textContent.trim()&&(node.children.length<=1);
          if(isEmptyBlock){
            insertBefore=node;
          } else {
            insertBefore=node.nextSibling||null;
          }
          break;
        }
        node=par;
      }
    }catch(e){}
  }

  // Fallback: append to editor
  if(!insertParent){insertParent=editor;insertBefore=null;}

  // Insert block
  insertParent.insertBefore(block, insertBefore);
  // Insert trailing <p> after block
  const p=document.createElement('p');p.innerHTML='<br>';
  insertParent.insertBefore(p, block.nextSibling);
  // Remove the original empty block if we replaced it
  if(insertBefore&&insertParent.contains(insertBefore)){
    const isEmptyBlock=(insertBefore.tagName==='P'||insertBefore.tagName==='DIV')&&
                       !insertBefore.textContent.trim()&&(insertBefore.children.length<=1);
    if(isEmptyBlock)insertBefore.remove();
  }
}

function _cfBuildImgBlock(id,src,isVid,name){
  const block=document.createElement('div');
  block.className='cf-img-block';block.contentEditable='false';
  block.dataset.cfimgid=id;block.dataset.cfimgtype=isVid?'video':'image';
  block.dataset.align='center';block.dataset.name=name||'image';

  // Wrap + inner + media
  const wrap=document.createElement('div');wrap.className='cf-img-wrap';
  const inner=document.createElement('div');inner.className='cf-img-inner';inner.style.width='100%';
  const media=isVid?document.createElement('video'):document.createElement('img');
  if(isVid){media.src=src;media.controls=true;media.muted=true;media.loop=true;media.autoplay=true;media.setAttribute('playsinline','');}
  else{media.src=src;media.alt=name||'image';}

  // Resize handles
  const lh=document.createElement('div');lh.className='cf-img-resize-h left';
  const rh=document.createElement('div');rh.className='cf-img-resize-h right';
  _cfImgInitResize(inner,lh,'left');_cfImgInitResize(inner,rh,'right');

  inner.appendChild(media);wrap.appendChild(lh);wrap.appendChild(inner);wrap.appendChild(rh);
  block.appendChild(wrap);

  // Caption
  const cap=document.createElement('div');cap.className='cf-img-caption';
  cap.contentEditable='true';cap.setAttribute('data-placeholder','Thêm chú thích — nhấn đúp để chỉnh sửa');
  block.appendChild(cap);

  // Toolbar
  block.appendChild(_cfBuildImgToolbar(block));

  // Click to select
  block.addEventListener('mousedown',e=>{
    if(e.target===cap||cap.contains(e.target))return;
    e.preventDefault();_cfImgSelect(block);
  });
  media.addEventListener('dblclick',()=>{
    lbShow([{src,name:name||'image'}]);
  });

  return block;
}

function _cfBuildImgToolbar(block){
  const tb=document.createElement('div');tb.className='cf-img-toolbar';

  // Alignment group
  const aligns=[
    {key:'left',icon:'ti-align-left',title:'Căn trái'},
    {key:'center',icon:'ti-align-center',title:'Căn giữa'},
    {key:'right',icon:'ti-align-right',title:'Căn phải'},
  ];
  aligns.forEach(a=>{
    const btn=document.createElement('button');btn.className='cf-img-tb-btn'+(block.dataset.align===a.key?' active':'');
    btn.innerHTML=`<i class="ti ${a.icon}" style="font-size:13px"></i>`;btn.title=a.title;btn.dataset.align=a.key;
    btn.addEventListener('click',()=>{
      block.dataset.align=a.key;
      tb.querySelectorAll('[data-align]').forEach(b=>b.classList.toggle('active',b.dataset.align===a.key));
      onContentChange();
    });
    tb.appendChild(btn);
  });

  const sep1=document.createElement('div');sep1.className='cf-img-tb-sep';tb.appendChild(sep1);

  // Width presets
  const widths=[
    {w:'50%',title:'50%',icon:'<span style="font-size:10px;font-weight:600">50%</span>'},
    {w:'75%',title:'75%',icon:'<span style="font-size:10px;font-weight:600">75%</span>'},
    {w:'100%',title:'100%',icon:'<span style="font-size:10px;font-weight:600">100%</span>'},
  ];
  widths.forEach(wt=>{
    const btn=document.createElement('button');btn.className='cf-img-tb-btn';
    btn.innerHTML=wt.icon;btn.title=wt.title;
    btn.addEventListener('click',()=>{
      const inner=block.querySelector('.cf-img-inner');
      if(inner){inner.style.width=wt.w;onContentChange();}
    });
    tb.appendChild(btn);
  });

  const sep2=document.createElement('div');sep2.className='cf-img-tb-sep';tb.appendChild(sep2);

  // Fullscreen
  const fsBtn=document.createElement('button');fsBtn.className='cf-img-tb-btn';
  fsBtn.innerHTML='<i class="ti ti-arrows-maximize" style="font-size:13px"></i>';fsBtn.title='Toàn màn hình';
  fsBtn.addEventListener('click',()=>{
    const media=block.querySelector('img,video');if(!media)return;
    const src=media.src||media.getAttribute('data-src')||'';
    lbShow([{src,name:block.dataset.name||'image'}]);
  });
  tb.appendChild(fsBtn);

  const sep3=document.createElement('div');sep3.className='cf-img-tb-sep';tb.appendChild(sep3);

  // More (...)
  const moreWrap=document.createElement('div');moreWrap.style.position='relative';
  const moreBtn=document.createElement('button');moreBtn.className='cf-img-tb-btn';
  moreBtn.innerHTML='<i class="ti ti-dots" style="font-size:14px"></i>';moreBtn.title='Thêm';
  const ctx=document.createElement('div');ctx.className='cf-img-ctx';

  const ctxItems=[
    {icon:'ti-link',label:'Thêm liên kết',fn:()=>{const url=prompt('Nhập URL liên kết:');if(url){block.dataset.link=url;toast('Đã thêm link','success');}}},
    {icon:'ti-text-caption',label:'Thêm alt text',fn:()=>{const t=prompt('Nhập mô tả (alt text):',block.querySelector('img')?.alt||'');if(t!=null){const img=block.querySelector('img');if(img)img.alt=t;block.dataset.name=t;toast('Đã cập nhật alt text','success');}}},
    {icon:'ti-resize',label:'Thay đổi kích thước',fn:()=>{const v=prompt('Nhập chiều rộng (%, vd: 80):',parseInt(block.querySelector('.cf-img-inner')?.style.width||'100'));if(v){const inner=block.querySelector('.cf-img-inner');if(inner){inner.style.width=parseInt(v)+'%';onContentChange();}}}},
    {sep:true},
    {icon:'ti-copy',label:'Sao chép',fn:()=>{
      const clone=block.cloneNode(true);_cfImgRewireBlock(clone);
      block.parentElement.insertBefore(clone,block.nextSibling);onContentChange();
    }},
    {sep:true},
    {icon:'ti-trash',label:'Xóa',danger:true,fn:()=>{
      const id=block.dataset.cfimgid;
      if(id){_revokeUrl(id);_idbDel(id).catch(()=>{});}
      block.remove();onContentChange();
    }},
  ];
  ctxItems.forEach(item=>{
    if(item.sep){const d=document.createElement('div');d.className='cf-img-ctx-sep';ctx.appendChild(d);return;}
    const el=document.createElement('div');el.className='cf-img-ctx-item'+(item.danger?' danger':'');
    el.innerHTML=`<i class="ti ${item.icon}"></i>${item.label}`;
    el.addEventListener('click',()=>{ctx.classList.remove('on');item.fn();});
    ctx.appendChild(el);
  });
  moreBtn.addEventListener('click',e=>{e.stopPropagation();ctx.classList.toggle('on');});
  document.addEventListener('click',()=>ctx.classList.remove('on'));
  moreWrap.appendChild(moreBtn);moreWrap.appendChild(ctx);tb.appendChild(moreWrap);
  return tb;
}

function _cfImgInitResize(inner,handle,side){
  handle.addEventListener('mousedown',e=>{
    e.preventDefault();e.stopPropagation();
    const startX=e.clientX;
    const startW=inner.offsetWidth;
    const container=inner.closest('.cf-img-wrap');
    const maxW=container?.offsetWidth||800;
    handle.style.opacity='1';
    document.body.style.cursor='ew-resize';document.body.style.userSelect='none';
    function mm(e2){
      const dx=e2.clientX-startX;
      const newW=side==='right'?Math.max(80,startW+dx):Math.max(80,startW-dx);
      inner.style.width=Math.min(maxW,newW)+'px';
    }
    function mu(){
      document.body.style.cursor='';document.body.style.userSelect='';
      document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);
      onContentChange();
    }
    document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);
  });
}

function _cfImgSelect(block){
  if(_cfImgSelected&&_cfImgSelected!==block)_cfImgSelected.classList.remove('selected');
  _cfImgSelected=block;block.classList.add('selected');
}

// Deselect on click outside
document.addEventListener('click',e=>{
  if(_cfImgSelected&&!_cfImgSelected.contains(e.target))
    _cfImgSelected.classList.remove('selected');
});
// Delete key on selected block
document.addEventListener('keydown',e=>{
  if(e.key==='Delete'&&_cfImgSelected&&document.activeElement===document.body){
    const id=_cfImgSelected.dataset.cfimgid;
    if(id){_revokeUrl(id);_idbDel(id).catch(()=>{});}
    _cfImgSelected.remove();_cfImgSelected=null;onContentChange();
  }
});

// Rewire event handlers after clone
function _cfImgRewireBlock(block){
  const id=uid();block.dataset.cfimgid=id;
  const inner=block.querySelector('.cf-img-inner');
  const lh=block.querySelector('.cf-img-resize-h.left');
  const rh=block.querySelector('.cf-img-resize-h.right');
  if(inner&&lh)_cfImgInitResize(inner,lh,'left');
  if(inner&&rh)_cfImgInitResize(inner,rh,'right');
  // Replace toolbar
  block.querySelector('.cf-img-toolbar')?.remove();
  block.appendChild(_cfBuildImgToolbar(block));
}

// Load saved inline image blocks from IDB
// ═══ INLINE CAROUSEL BLOCK ENGINE ══════════════════════════
export async function cfBuildCarouselBlock(files){
  if(!files||!files.length)return null;
  const slides=[];
  for(const file of files){
    const id=uid();
    let blob=file;
    if(!file.type.startsWith('video/')){
      blob=await new Promise(res=>{
        const img2=new Image(),url=URL.createObjectURL(file);
        img2.onload=()=>{
          URL.revokeObjectURL(url);
          const MAX=1800;let{width:w,height:h}=img2;
          if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
          const cv=document.createElement('canvas');cv.width=w;cv.height=h;
          cv.getContext('2d').drawImage(img2,0,0,w,h);
          cv.toBlob(b=>res(b||file),file.type==='image/png'?'image/png':'image/jpeg',0.88);
        };
        img2.onerror=()=>res(file);img2.src=url;
      });
    }
    try{await _idbPut(id,blob);}catch(e){}
    const src=URL.createObjectURL(blob);_cacheUrl(id,src);
    slides.push({id,src,name:file.name||'image'});
  }
  return _cfBuildCarousel(slides);
}

function _cfBuildCarousel(slides){
  const block=document.createElement('div');
  block.className='cf-carousel-block';block.contentEditable='false';
  block.dataset.carids=slides.map(s=>s.id).join(',');
  block._carIdx=0;

  const wrap=document.createElement('div');wrap.className='cf-car-wrap';
  const track=document.createElement('div');track.className='cf-car-track';
  slides.forEach(s=>{
    const slide=document.createElement('div');slide.className='cf-car-slide';
    const img2=document.createElement('img');img2.src=s.src;img2.alt=s.name;img2.dataset.carid=s.id;
    img2.addEventListener('dblclick',()=>{lbShow([{src:img2.src,name:s.name}]);});
    slide.appendChild(img2);track.appendChild(slide);
  });
  const counter=document.createElement('div');counter.className='cf-car-counter';
  counter.textContent=`1 / ${slides.length}`;
  const prev=document.createElement('button');prev.className='cf-car-btn prev';prev.innerHTML='&#8249;';prev.setAttribute('aria-label','Trước');
  const next=document.createElement('button');next.className='cf-car-btn next';next.innerHTML='&#8250;';next.setAttribute('aria-label','Tiếp');
  wrap.appendChild(track);wrap.appendChild(counter);wrap.appendChild(prev);wrap.appendChild(next);
  block.appendChild(wrap);

  // Dots
  const dotsWrap=document.createElement('div');dotsWrap.className='cf-car-dots';
  slides.forEach((_,i)=>{
    const dot=document.createElement('div');dot.className='cf-car-dot'+(i===0?' on':'');
    dot.addEventListener('click',()=>_cfCarGoTo(block,i));
    dotsWrap.appendChild(dot);
  });
  block.appendChild(dotsWrap);

  // Toolbar
  const tb=document.createElement('div');tb.className='cf-car-toolbar';
  const addBtn=document.createElement('button');addBtn.className='cf-car-tb-btn';
  addBtn.innerHTML='<i class="ti ti-plus" style="font-size:13px"></i> Thêm ảnh';
  addBtn.addEventListener('click',()=>_cfCarAddImages(block,track,dotsWrap,counter));
  const delBtn=document.createElement('button');delBtn.className='cf-car-tb-btn danger';
  delBtn.innerHTML='<i class="ti ti-trash" style="font-size:13px"></i> Xóa carousel';
  delBtn.addEventListener('click',()=>{
    if(!confirm('Xóa carousel này?'))return;
    (block.dataset.carids||'').split(',').filter(Boolean).forEach(id=>{try{_idbDel(id);}catch(e){}});
    const fb=document.createElement('p');fb.innerHTML='<br>';
    block.parentNode?.insertBefore(fb,block);block.remove();onContentChange();
  });
  tb.appendChild(addBtn);tb.appendChild(delBtn);
  block.appendChild(tb);

  _cfCarWireNav(block,track,prev,next,dotsWrap,counter);
  return block;
}

function _cfCarWireNav(block,track,prev,next,dots,counter){
  function goTo(idx){
    const slides=track.querySelectorAll('.cf-car-slide');
    const n=slides.length;if(!n)return;
    idx=Math.max(0,Math.min(n-1,idx));
    block._carIdx=idx;
    track.style.transform=`translateX(-${idx*100}%)`;
    if(dots)dots.querySelectorAll('.cf-car-dot').forEach((d,i)=>d.classList.toggle('on',i===idx));
    if(counter)counter.textContent=`${idx+1} / ${n}`;
    if(prev)prev.disabled=idx===0;
    if(next)next.disabled=idx===n-1;
  }
  if(prev)prev.onclick=()=>goTo((block._carIdx||0)-1);
  if(next)next.onclick=()=>goTo((block._carIdx||0)+1);
  let sx=0;
  track.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;},{passive:true});
  track.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>40)goTo((block._carIdx||0)+(dx<0?1:-1));});
  goTo(block._carIdx||0);
}

function _cfCarGoTo(block,idx){
  const track=block.querySelector('.cf-car-track');
  const prev=block.querySelector('.cf-car-btn.prev');
  const next=block.querySelector('.cf-car-btn.next');
  const dots=block.querySelector('.cf-car-dots');
  const counter=block.querySelector('.cf-car-counter');
  if(track){_cfCarWireNav(block,track,prev,next,dots,counter);
    const slides=track.querySelectorAll('.cf-car-slide');const n=slides.length;
    block._carIdx=Math.max(0,Math.min(n-1,idx));
    track.style.transform=`translateX(-${block._carIdx*100}%)`;
    if(dots)dots.querySelectorAll('.cf-car-dot').forEach((d,i)=>d.classList.toggle('on',i===block._carIdx));
    if(counter)counter.textContent=`${block._carIdx+1} / ${n}`;
    if(prev)prev.disabled=block._carIdx===0;if(next)next.disabled=block._carIdx===n-1;
  }
}

function _cfCarAddImages(block,track,dotsWrap,counter){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*,image/gif';inp.multiple=true;
  inp.style.cssText='position:fixed;top:-9999px;opacity:0';document.body.appendChild(inp);
  inp.addEventListener('change',async function(){
    const files=Array.from(this.files);document.body.removeChild(inp);if(!files.length)return;
    for(const file of files){
      const id=uid();
      try{await _idbPut(id,file);}catch(e){}
      const src=URL.createObjectURL(file);_cacheUrl(id,src);
      const slide=document.createElement('div');slide.className='cf-car-slide';
      const img2=document.createElement('img');img2.src=src;img2.dataset.carid=id;
      slide.appendChild(img2);track.appendChild(slide);
      const dot=document.createElement('div');dot.className='cf-car-dot';
      const dotIdx=dotsWrap.children.length;
      dot.addEventListener('click',()=>_cfCarGoTo(block,dotIdx));
      dotsWrap.appendChild(dot);
      const ids=(block.dataset.carids||'').split(',').filter(Boolean);ids.push(id);
      block.dataset.carids=ids.join(',');
    }
    const total=track.querySelectorAll('.cf-car-slide').length;
    if(counter)counter.textContent=`${(block._carIdx||0)+1} / ${total}`;
    onContentChange();
  });
  inp.click();
}

// Restore embed blocks after doc load (rewire toolbar, ensure iframe src)
export function _cfEmbedLoadAll(editor){
  editor.querySelectorAll('.cf-embed-block[data-embed-url]').forEach(block=>{
    // Remove old toolbar if exists (was stripped on save)
    block.querySelector('.cf-embed-toolbar')?.remove();
    const embedUrl=block.dataset.embedUrl;
    const origUrl=block.dataset.origUrl||embedUrl;
    if(!embedUrl)return;
    // Ensure iframe has src
    const iframe=block.querySelector('iframe');
    if(iframe&&!iframe.src)iframe.src=embedUrl;
    // Rebuild toolbar
    const wrap=block.querySelector('.cf-embed-wrap');
    if(!wrap)return;
    const tb=document.createElement('div');tb.className='cf-embed-toolbar';
    const platform=cfEmbedPlatform(embedUrl);
    const openBtn=document.createElement('button');openBtn.className='cf-embed-tb-btn';
    openBtn.innerHTML='<i class="ti ti-external-link" style="font-size:13px"></i> Mở '+platform;
    openBtn.addEventListener('click',()=>window.open(origUrl,'_blank'));
    const editBtn=document.createElement('button');editBtn.className='cf-embed-tb-btn';
    editBtn.innerHTML='<i class="ti ti-edit" style="font-size:13px"></i>';editBtn.title='Đổi URL';
    editBtn.addEventListener('click',()=>{
      const newUrl=prompt('Nhập URL mới:',origUrl);if(!newUrl)return;
      const newEmbed=cfGetEmbedUrl(newUrl.trim());
      if(!newEmbed){toast('URL không hỗ trợ','error');return;}
      if(iframe)iframe.src=newEmbed;block.dataset.embedUrl=newEmbed;block.dataset.origUrl=newUrl;onContentChange();
    });
    const delBtn=document.createElement('button');delBtn.className='cf-embed-tb-btn danger';
    delBtn.innerHTML='<i class="ti ti-trash" style="font-size:13px"></i>';delBtn.title='Xóa';
    delBtn.addEventListener('click',()=>{const fb=document.createElement('p');fb.innerHTML='<br>';block.parentNode?.insertBefore(fb,block);block.remove();onContentChange();});
    tb.appendChild(openBtn);tb.appendChild(editBtn);tb.appendChild(delBtn);
    wrap.appendChild(tb);
  });
}

// Restore carousel from IDB on doc load
export async function _cfCarLoadAll(editor){
  const blocks=editor.querySelectorAll('.cf-carousel-block[data-carids]');
  for(const block of blocks){
    const ids=(block.dataset.carids||'').split(',').filter(Boolean);
    const imgs=Array.from(block.querySelectorAll('img[data-carid]'));
    for(let i=0;i<ids.length;i++){
      const id=ids[i];const img2=imgs[i];
      if(!img2)continue;
      let src=(_objUrls&&_objUrls[id])||'';
      if(!src){try{const b=await _idbGet(id);if(b){src=URL.createObjectURL(b);_cacheUrl&&_cacheUrl(id,src);}}catch(e){}}
      if(src&&img2)img2.src=src;
    }
    const track=block.querySelector('.cf-car-track');
    const prev=block.querySelector('.cf-car-btn.prev');
    const next=block.querySelector('.cf-car-btn.next');
    const dots=block.querySelector('.cf-car-dots');
    const counter=block.querySelector('.cf-car-counter');
    if(track&&counter){block._carIdx=0;_cfCarWireNav(block,track,prev,next,dots,counter);}
  }
}

export function _cfImgLoadAll(editor){
  editor.querySelectorAll('.cf-img-block[data-cfimgid]').forEach(async block=>{
    const id=block.dataset.cfimgid;if(!id)return;
    const media=block.querySelector('img,video');if(!media||media.src)return;
    let src=_objUrls[id]||'';
    if(!src){try{const b=await _idbGet(id);if(b){src=URL.createObjectURL(b);_cacheUrl(id,src);}}catch(e){}}
    if(src){
      media.src=src;
      // Auto-play restored videos
      if(media.tagName==='VIDEO'){
        media.muted=true;media.loop=true;media.autoplay=true;
        media.controls=true;media.setAttribute('playsinline','');
        media.play().catch(()=>{}); // ignore autoplay policy errors
      }
    }
    // Rewire events
    _cfImgRewireBlock(block);
    block.addEventListener('mousedown',ev=>{
      if(ev.target.closest('.cf-img-caption'))return;
      ev.preventDefault();_cfImgSelect(block);
    });
  });
}

// ═══ EMBED VIDEO ENGINE (Social Media) ══════════════════════
export function cfEmbedOpen(){
  const popup=document.getElementById('cfEmbedPopup');
  if(!popup)return;
  // Position near caret
  const rect=_slashGetCaretRect?.()??{top:200,bottom:220,left:200};
  const vw=window.innerWidth,vh=window.innerHeight;
  const pw=440,ph=240;
  let top=rect.bottom+8,left=rect.left;
  if(top+ph>vh-8)top=Math.max(8,rect.top-ph-8);
  if(left+pw>vw-8)left=Math.max(8,vw-pw-8);
  popup.style.top=top+'px';popup.style.left=left+'px';
  popup.classList.add('on');
  const inp=document.getElementById('cfEmbedInp');
  if(inp){inp.value='';inp.focus();}
  const _errEl=document.getElementById('cfEmbedErr');if(_errEl)_errEl.style.display='none';
  const _okEl=document.getElementById('cfEmbedOkBtn');if(_okEl)_okEl.disabled=false;
}
export function cfEmbedClose(){
  document.getElementById('cfEmbedPopup')?.classList.remove('on');
}
export function cfEmbedValidate(url){
  const err=document.getElementById('cfEmbedErr');
  const btn=document.getElementById('cfEmbedOkBtn');
  if(!url.trim()){if(err)err.style.display='none';return false;}
  const embedUrl=cfGetEmbedUrl(url.trim());
  if(err)err.style.display=embedUrl?'none':'block';
  if(btn)btn.disabled=!embedUrl;
  return !!embedUrl;
}
export function cfEmbedInsert(){
  const inp=document.getElementById('cfEmbedInp');
  if(!inp)return;
  const url=inp.value.trim();if(!url)return;
  const embedUrl=cfGetEmbedUrl(url);
  if(!embedUrl){{const _e=document.getElementById('cfEmbedErr');if(_e)_e.style.display='block';}return;}
  cfEmbedClose();
  const block=cfBuildEmbedBlock(embedUrl,url);
  _cfInsertBlockAtRange(block,_slashSavedRange);
  onContentChange();
}

// Parse URL → embed URL
export function cfGetEmbedUrl(url){
  try{
    // YouTube: watch, shorts, youtu.be, live
    let m=url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if(m)return 'https://www.youtube.com/embed/'+m[1]+'?rel=0&autoplay=0';
    // Vimeo
    m=url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if(m)return 'https://player.vimeo.com/video/'+m[1]+'?h=&color=ffffff';
    // TikTok
    m=url.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
    if(m)return 'https://www.tiktok.com/embed/v2/'+m[1];
    // Twitter/X
    m=url.match(/(?:twitter|x)\.com\/(?:#!\/)?\w+\/status\/(\d+)/);
    if(m)return 'https://platform.twitter.com/embed/Tweet.html?id='+m[1];
    // Instagram (Reels/Posts)
    m=url.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/);
    if(m)return 'https://www.instagram.com/'+(/reel/.test(url)?'reel':'p')+'/'+m[1]+'/embed/';
    // Facebook video
    m=url.match(/facebook\.com\/.+\/videos\/(\d+)/)||url.match(/fb\.watch\/(\w+)/);
    if(m)return 'https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(url)+'&show_text=false';
    // Dailymotion
    m=url.match(/dailymotion\.com\/video\/([\w]+)/);
    if(m)return 'https://www.dailymotion.com/embed/video/'+m[1];
    // Direct iframe embed URLs (already embed)
    if(/\/embed\/|player\.(vimeo|youtube)|platform\.twitter|tiktok\.com\/embed/.test(url))return url;
  }catch(e){}
  return null;
}

// Get platform name from embed URL
export function cfEmbedPlatform(embedUrl){
  if(embedUrl.includes('youtube.com'))return 'YouTube';
  if(embedUrl.includes('vimeo.com'))return 'Vimeo';
  if(embedUrl.includes('tiktok.com'))return 'TikTok';
  if(embedUrl.includes('twitter.com')||embedUrl.includes('platform.twitter'))return 'Twitter/X';
  if(embedUrl.includes('instagram.com'))return 'Instagram';
  if(embedUrl.includes('facebook.com'))return 'Facebook';
  if(embedUrl.includes('dailymotion.com'))return 'Dailymotion';
  return 'Video';
}

export function cfBuildEmbedBlock(embedUrl, origUrl){
  const block=document.createElement('div');
  block.className='cf-embed-block';block.contentEditable='false';
  block.dataset.embedUrl=embedUrl;block.dataset.origUrl=origUrl||embedUrl;

  // 16:9 wrapper
  const wrap=document.createElement('div');
  wrap.className='cf-embed-wrap';
  wrap.style.paddingBottom='56.25%'; // 16:9

  const iframe=document.createElement('iframe');
  iframe.src=embedUrl;
  iframe.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share';
  iframe.setAttribute('allowfullscreen','');
  iframe.setAttribute('loading','lazy');
  wrap.appendChild(iframe);

  // Toolbar
  const tb=document.createElement('div');tb.className='cf-embed-toolbar';
  const platform=cfEmbedPlatform(embedUrl);
  const openBtn=document.createElement('button');openBtn.className='cf-embed-tb-btn';
  openBtn.innerHTML='<i class="ti ti-external-link" style="font-size:13px"></i> Mở '+platform;
  openBtn.addEventListener('click',()=>window.open(origUrl||embedUrl,'_blank'));
  const editBtn=document.createElement('button');editBtn.className='cf-embed-tb-btn';
  editBtn.innerHTML='<i class="ti ti-edit" style="font-size:13px"></i>';editBtn.title='Đổi URL';
  editBtn.addEventListener('click',()=>{
    const newUrl=prompt('Nhập URL mới:',origUrl||embedUrl);
    if(!newUrl)return;
    const newEmbed=cfGetEmbedUrl(newUrl.trim());
    if(!newEmbed){toast('URL không hỗ trợ','error');return;}
    iframe.src=newEmbed;block.dataset.embedUrl=newEmbed;block.dataset.origUrl=newUrl;onContentChange();
  });
  const delBtn=document.createElement('button');delBtn.className='cf-embed-tb-btn danger';
  delBtn.innerHTML='<i class="ti ti-trash" style="font-size:13px"></i>';delBtn.title='Xóa';
  delBtn.addEventListener('click',()=>{
    const fb=document.createElement('p');fb.innerHTML='<br>';
    block.parentNode?.insertBefore(fb,block);block.remove();onContentChange();
  });
  tb.appendChild(openBtn);tb.appendChild(editBtn);tb.appendChild(delBtn);
  wrap.appendChild(tb);

  // Caption
  const cap=document.createElement('div');cap.className='cf-embed-caption';cap.contentEditable='true';

  block.appendChild(wrap);block.appendChild(cap);
  return block;
}

// Close embed popup on outside click
document.addEventListener('mousedown',e=>{
  const popup=document.getElementById('cfEmbedPopup');
  if(popup?.classList.contains('on')&&!popup.contains(e.target)&&!e.target.closest('#cfEmbedPopup'))
    cfEmbedClose();
});

// ═══ EMOJI DATA — Confluence style ══════════════════════════
const EMOJIS={
  'Phổ biến':['😀','😊','😂','🤣','❤️','👍','🎉','✅','⭐','🔥','💡','📌','⚠️','❌','🚀','💪','👏','🙏','💯','✨'],
  'Cảm xúc':['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  'Người':['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸'],
  'Động vật':['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🪳','🕷️','🦂','🐢','🐍','🦎','🦕','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  'Thức ăn':['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🫒','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🫕','🥙','🧆','🥚','🍲','🫘','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
  'Hoạt động':['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🪀','🪆','🎮','🕹️','🎲','♟️','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎷','🪗','🎸','🎹','🎺','🎻','🥁','🪘','🎙️','📻','🎚️','🎛️'],
  'Du lịch':['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚧','⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛸','🚀','🛶','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩️'],
  'Vật thể':['💡','🔦','🕯️','💡','🔋','🔌','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💽','💾','💿','📀','📱','☎️','📞','📟','📠','📺','📷','📸','📹','🎥','📽️','📼','🔍','🔎','🕯️','💡','🔦','🪔','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','💰','🪙','💴','💵','💶','💷','💸','💳','🧾','📊','📈','📉','🗂️','📁','📂','📋','📌','📍','🖇️','📎','🖊️','✏️','🔏','🔓','🔐','🔒','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🛡️','🪚','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🪝','🧲','🪜','⚗️','🔭','🔬','🩺','💊','💉','🩸','🩹','🩼','🩺','🌡️','🧬','🧫','🧪','🌂','☂️','🧵','🪡','🧶','🪢','👓','🕶️','🥽','🌂','☂️','🧤','🧣','🎩','🧢','⛑️','👑','💍','💎','👜','👝','🛍️','🎒','🧳','📦','📫','📪','📬','📭','📮','🗳️','📯','📢','📣','🔔','🔕','🃏','🀄','🎴'],
  'Ký hiệu':['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','❤️‍🔥','❤️‍🩹','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔢','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔀','🔁','🔂','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🔰','⭕','✅','☑️','✔️','❎','🔲','🔳','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔵','⬛','⬜','◼️','◻️','▪️','▫️'],
};

// ── Emoji names for search (Latin keywords)
const EMOJI_NAMES={
  '😀':'smile happy grin','😊':'smile happy blush','❤️':'heart love red','👍':'thumbs up like good','🎉':'party celebration','✅':'check done ok','⭐':'star','🔥':'fire hot','💡':'idea light bulb','📌':'pin','⚠️':'warning','❌':'cross wrong no','🚀':'rocket space','💪':'muscle strong','👏':'clap applause','🙏':'pray thanks','💯':'100 perfect','✨':'sparkles','😂':'laugh cry funny','🥰':'love hearts','🤔':'thinking','😎':'cool sunglasses','🎯':'target dart','📊':'chart graph','📋':'clipboard','🔑':'key','💰':'money cash','🎂':'birthday cake','🏆':'trophy win','🌟':'star glow','✏️':'pen edit write','🗑️':'trash delete','📷':'camera photo','🔍':'search zoom',
};

let _emojiInsertRange=null;
function _slashShowEmoji(){
  // Save the slash range for correct insertion
  _emojiInsertRange=_slashSavedRange||(window.getSelection()?.rangeCount?window.getSelection().getRangeAt(0).cloneRange():null);
  const rect=_slashGetCaretRect();
  const picker=document.getElementById('emojiPicker');
  const vw=window.innerWidth,vh=window.innerHeight;
  let top=rect.bottom+6,left=rect.left;
  const ph=320,pw=320;
  if(top+ph>vh-8)top=Math.max(8,rect.top-ph-6);
  if(left+pw>vw-8)left=Math.max(8,vw-pw-8);
  picker.style.top=top+'px';picker.style.left=left+'px';
  picker.classList.add('on');
  const inp=document.getElementById('emojiSearchInp');
  if(inp){inp.value='';emojiFilter('');}
  setTimeout(()=>inp?.focus(),30);
}
export function emojiClose(){document.getElementById('emojiPicker')?.classList.remove('on');}
export function emojiFilter(q){
  const grid=document.getElementById('emojiGrid');if(!grid)return;
  const Q=(q||'').toLowerCase().trim();
  let html='';
  if(Q){
    // Search across all emojis by name keywords
    const results=[];
    Object.values(EMOJIS).flat().forEach(em=>{
      if(results.includes(em))return;
      const name=(EMOJI_NAMES[em]||em)+' '+em;
      if(name.toLowerCase().includes(Q))results.push(em);
    });
    if(results.length){
      html+=`<div class="emoji-cat">Kết quả</div>`;
      results.forEach(em=>{html+=`<button class="emoji-btn" onmousedown="event.preventDefault();emojiInsert('${em}')" title="${em}">${em}</button>`;});
    } else {
      html='<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--text3);font-size:13px">Không tìm thấy 😕</div>';
    }
  } else {
    Object.entries(EMOJIS).forEach(([cat,emojis])=>{
      html+=`<div class="emoji-cat">${cat}</div>`;
      emojis.forEach(em=>{html+=`<button class="emoji-btn" onmousedown="event.preventDefault();emojiInsert('${em}')" title="${em}">${em}</button>`;});
    });
  }
  grid.innerHTML=html;
}
export function emojiInsert(emoji){
  emojiClose();
  // Restore saved range and insert at correct position
  const sel=window.getSelection();
  if(_emojiInsertRange){
    sel.removeAllRanges();sel.addRange(_emojiInsertRange);
  }
  document.execCommand('insertText',false,emoji);
  _emojiInsertRange=null;
  onContentChange();
}
document.addEventListener('mousedown',e=>{
  // Close emoji picker when clicking outside — use mousedown so it fires before click
  if(!e.target.closest('#emojiPicker')){
    const picker=document.getElementById('emojiPicker');
    if(picker?.classList.contains('on'))emojiClose();
  }
  if(!e.target.closest('#slashMenu')&&_slashVisible)slashClose();
});
// Prevent mousedown on emoji buttons from closing picker (already handled by onmousedown=preventDefault)

// ═══ KEYBOARD HOOK in EDITOR ════════════════════════════════
// Detect '/' → open slash menu (works after text too)
export function _editorSlashKeydown(e){
  if(_slashVisible){
    const total=_slashFiltered.length;
    if(e.key==='ArrowDown'){
      e.preventDefault();
      _slashActiveIdx=(_slashActiveIdx+1)%total; // wrap around
      slashHighlight();
    } else if(e.key==='ArrowUp'){
      e.preventDefault();
      _slashActiveIdx=(_slashActiveIdx-1+total)%total; // wrap around
      slashHighlight();
    } else if(e.key==='Enter'||e.key==='Tab'){
      e.preventDefault();
      if(_slashFiltered[_slashActiveIdx])slashExec(_slashFiltered[_slashActiveIdx].id);
    } else if(e.key==='Escape'){
      e.preventDefault();slashClose();
    }
    return;
  }
}

// Also handle keys on the slash menu input for arrow navigation
export function _slashMenuInputKeydown(e){
  if(!_slashVisible)return;
  const total=_slashFiltered.length;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    _slashActiveIdx=(_slashActiveIdx+1)%total;
    slashHighlight();
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    _slashActiveIdx=(_slashActiveIdx-1+total)%total;
    slashHighlight();
  } else if(e.key==='Enter'||e.key==='Tab'){
    e.preventDefault();
    if(_slashFiltered[_slashActiveIdx])slashExec(_slashFiltered[_slashActiveIdx].id);
  } else if(e.key==='Escape'){
    e.preventDefault();slashClose();
  }
}

export function _isInNestedEditable(node){
  // Returns true ONLY for contexts that should BLOCK the slash menu.
  // Table cells (td/th), cf-column-item, cf-panel-content all ALLOW slash menu → return false.
  // Only txtbox-body blocks slash menu (text boxes have their own toolbar).
  let el=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
  const editor=document.getElementById('editor');
  while(el&&el!==editor){
    const tag=el.tagName?.toLowerCase();
    // Table cells: always allow slash menu and text editing
    if(tag==='td'||tag==='th')return false;
    // Text box body: block slash menu (has its own UI)
    if(el.classList?.contains('txtbox-body'))return true;
    el=el.parentElement;
  }
  return false;
}

export function _editorSlashInput(){
  const sel=window.getSelection();if(!sel.rangeCount)return;
  const range=sel.getRangeAt(0);
  const node=range.startContainer;

  if(_isInNestedEditable(node)){
    if(_slashVisible)slashClose();
    return;
  }

  if(_slashVisible){
    // Sync filter text — handle both text and element nodes
    let ftxt='',foffset=0;
    if(node.nodeType===Node.TEXT_NODE){
      ftxt=node.textContent||'';foffset=range.startOffset;
    } else if(node.nodeType===Node.ELEMENT_NODE){
      const lc=node.childNodes[range.startOffset-1];
      if(lc&&lc.nodeType===Node.TEXT_NODE){ftxt=lc.textContent||'';foffset=ftxt.length;}
      else{ftxt=node.textContent||'';foffset=ftxt.length;}
    }
    if(ftxt){
      let si=foffset-1;
      while(si>=0&&ftxt[si]!=='/')si--;
      if(si>=0&&ftxt[si]==='/'){
        const filterTxt=ftxt.slice(si+1,foffset);
        const inp=document.getElementById('slashMenuInp');
        if(inp){inp.value=filterTxt;slashFilter(filterTxt);}
      } else {slashClose();}
    }
    return;
  }

  // ── Trigger slash menu when '/' is typed ANYWHERE ──
  // Handle both TEXT_NODE and ELEMENT_NODE (e.g. empty table cell)
  let triggerTxt='', triggerOffset=0;
  if(node.nodeType===Node.TEXT_NODE){
    triggerTxt=node.textContent||'';
    triggerOffset=range.startOffset;
  } else if(node.nodeType===Node.ELEMENT_NODE){
    // Walk backwards through childNodes to find the nearest TEXT_NODE before the cursor.
    // Skip UI elements (.tbl-cell-drop, .tbl-row-resize-handle, .tbl-row-sel, etc.)
    const offset=range.startOffset;
    let found=null;
    for(let i=offset-1;i>=0;i--){
      const ch=node.childNodes[i];
      if(ch&&ch.nodeType===Node.TEXT_NODE){found=ch;break;}
    }
    if(found){
      triggerTxt=found.textContent||'';
      triggerOffset=triggerTxt.length;
    } else {
      // Fallback: collect only text node content from all children up to cursor
      let combined='';
      for(let i=0;i<offset;i++){
        const ch=node.childNodes[i];
        if(ch&&ch.nodeType===Node.TEXT_NODE)combined+=ch.textContent||'';
      }
      triggerTxt=combined;
      triggerOffset=combined.length;
    }
  }
  if(triggerOffset>0&&triggerTxt[triggerOffset-1]==='/'){
    const before=triggerTxt.slice(0,triggerOffset-1);
    const noTrigger=/[a-zA-Z0-9]$/.test(before)&&!before.endsWith(' ');
    if(!noTrigger)slashOpen();
  }
}

// ── Block Action Bar ─────────────────────────────────────
let _blockBar=null,_blockBarTarget=null,_blockBarTimer=null;

function _getBlockBar(){
  if(_blockBar)return _blockBar;
  _blockBar=document.createElement('div');
  _blockBar.className='editor-block-bar';
  _blockBar.id='editorBlockBar';
  const plus=document.createElement('button');
  plus.className='editor-block-btn';plus.title='Thêm khối (hoặc gõ /)';
  plus.innerHTML='<i class="ti ti-plus"></i>';
  plus.addEventListener('mousedown',e=>{
    e.preventDefault();
    const editor=document.getElementById('editor');
    if(_blockBarTarget&&editor.contains(_blockBarTarget)){
      const sel=window.getSelection();
      const range=document.createRange();
      range.setStart(_blockBarTarget,0);range.collapse(true);
      sel.removeAllRanges();sel.addRange(range);
      editor.focus();
    }
    slashOpen();
  });
  const drag=document.createElement('button');
  drag.className='editor-block-btn editor-block-drag';drag.title='Kéo để di chuyển';
  drag.innerHTML='<i class="ti ti-grip-vertical"></i>';
  _blockBar.appendChild(plus);_blockBar.appendChild(drag);
  document.body.appendChild(_blockBar);
  return _blockBar;
}

function _showBlockBar(targetEl){
  if(!targetEl)return;
  _blockBarTarget=targetEl;
  const bar=_getBlockBar();
  const rect=targetEl.getBoundingClientRect();
  bar.style.position='fixed';
  bar.style.top=(rect.top+2)+'px';
  bar.style.left=(rect.left-56)+'px';
  bar.classList.add('on');
}

function _hideBlockBar(){
  const bar=document.getElementById('editorBlockBar');
  if(bar)bar.classList.remove('on');
  _blockBarTarget=null;
}

function _updateBlockBar(){
  clearTimeout(_blockBarTimer);
  _blockBarTimer=setTimeout(()=>{
    const sel=window.getSelection();if(!sel.rangeCount)return;
    const range=sel.getRangeAt(0);
    let node=range.startContainer;
    const editor=document.getElementById('editor');
    if(!editor)return;
    while(node&&node.parentElement!==editor)node=node.parentElement;
    if(!node||node===editor){_hideBlockBar();return;}
    editor.querySelectorAll('.slash-hint').forEach(el=>el.classList.remove('slash-hint'));
    if(node.nodeType!==Node.TEXT_NODE&&node.tagName==='P'&&
       !node.textContent.trim()&&node.children.length<=1){
      node.classList.add('slash-hint');
    }
    _showBlockBar(node);
  },50);
}

function _onEditorMouseMove(e){
  clearTimeout(_blockBarTimer);
  _blockBarTimer=setTimeout(()=>{
    const editor=document.getElementById('editor');if(!editor)return;
    let el=e.target;
    if(el===editor){_hideBlockBar();return;}
    while(el&&el.parentElement!==editor)el=el.parentElement;
    if(!el||el===editor){return;}
    if(el.tagName==='TABLE'||el.classList.contains('fmedia')||
       el.classList.contains('txtbox')||el.classList.contains('tbl-outer'))return;
    _showBlockBar(el);
  },30);
}

// Wire keyboard hooks into editor on init
export function _initSlashCommands(){
  const editor=document.getElementById('editor');
  if(!editor)return;
  editor.addEventListener('keydown',_editorSlashKeydown);
  editor.addEventListener('input',_editorSlashInput);
  editor.addEventListener('keyup',_updateBlockBar);
  editor.addEventListener('mouseup',_updateBlockBar);
  editor.addEventListener('focus',_updateBlockBar);
  editor.addEventListener('blur',()=>{setTimeout(_hideBlockBar,150);});
  editor.addEventListener('mousemove',_onEditorMouseMove);
  editor.addEventListener('mouseleave',()=>{if(!document.activeElement?.closest('.editor-content'))_hideBlockBar();});
  // Wire slash menu input handlers (replaces inline oninput/onkeydown)
  const inp=document.getElementById('slashMenuInp');
  if(inp){
    inp.addEventListener('input',()=>slashFilter(inp.value));
    inp.addEventListener('keydown',_slashMenuInputKeydown);
  }
}
