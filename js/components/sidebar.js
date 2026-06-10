import { state, STORE_KEY, SB_MIN, SB_MAX, SB_DEFAULT, _objUrls } from '../core/state.js';
import { persist } from '../core/storage.js';
import { _relTime, escH } from '../utils/helpers.js';

// ─── CANVAS SCALING ──────────────────────────────────────────
let _canvasW=0,_scaleRaf=null;

export function initCanvasScaling(){
  const scroll=document.getElementById('editorScroll');
  if(!scroll||typeof ResizeObserver==='undefined')return;
  _canvasW=scroll.offsetWidth||0;
  new ResizeObserver(entries=>{
    const newW=entries[0]?.contentRect?.width;
    if(!newW||Math.abs(newW-_canvasW)<1)return;
    cancelAnimationFrame(_scaleRaf);
    _scaleRaf=requestAnimationFrame(()=>_applyCanvasScale(newW));
  }).observe(scroll);
}

export function resetCanvasWidth(){
  const scroll=document.getElementById('editorScroll');
  if(scroll)_canvasW=scroll.offsetWidth||0;
}

function _applyCanvasScale(newW){
  if(!_canvasW||!newW||_canvasW===newW)return;
  const scale=newW/_canvasW;
  const oldW=_canvasW;
  _canvasW=newW;

  // Anchor = TOP-RIGHT corner of canvas
  // X: newLeft = newCanvasW - (oldCanvasW - el.left) × scale
  // Y: newTop = top × scale (anchor = top edge)

  document.querySelectorAll('#editorScroll .fmedia').forEach(el=>{
    const l=parseFloat(el.style.left)||0;
    const t=parseFloat(el.style.top)||0;
    const w=el.offsetWidth;
    const h=el.offsetHeight;
    const nw=Math.max(80, Math.round(w*scale));
    const nh=Math.max(50, Math.round(h*scale));
    const nl=Math.max(0, Math.round(newW-(oldW-l)*scale));
    const nt=Math.max(0, Math.round(t*scale));
    el.style.left=nl+'px';
    el.style.top=nt+'px';
    el.style.width=nw+'px';
    el.style.height=nh+'px';
  });

  document.querySelectorAll('#editorScroll .txtbox').forEach(el=>{
    const l=parseFloat(el.style.left)||0;
    const t=parseFloat(el.style.top)||0;
    const w=el.offsetWidth;
    const h=parseFloat(el.style.minHeight)||el.offsetHeight;
    const nw=Math.max(120, Math.round(w*scale));
    const nh=Math.max(40,  Math.round(h*scale));
    const nl=Math.max(0, Math.round(newW-(oldW-l)*scale));
    const nt=Math.max(0, Math.round(t*scale));
    el.style.left=nl+'px';
    el.style.top=nt+'px';
    el.style.width=nw+'px';
    el.style.minHeight=nh+'px';
  });

  if(typeof fmSaveAll==='function')fmSaveAll();if(typeof tbSaveAll==='function')tbSaveAll();
}

// ─── SIDEBAR RESIZE ──────────────────────────────────────────

export function _sbInitResize(){
  const handle=document.getElementById('sbResizer');
  const sidebar=document.getElementById('sidebar');
  if(!handle||!sidebar)return;

  handle.addEventListener('mousedown',function(e){
    if(sidebar.classList.contains('collapsed'))return;
    e.preventDefault();handle.classList.add('dragging');
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    const startX=e.clientX,startW=sidebar.offsetWidth;

    function onMove(e2){
      const w=Math.max(SB_MIN,Math.min(SB_MAX,startW+(e2.clientX-startX)));
      sidebar.style.width=w+'px';
    }
    function onUp(){
      handle.classList.remove('dragging');
      document.body.style.cursor='';document.body.style.userSelect='';
      localStorage.setItem('sb_width',sidebar.offsetWidth);
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      _updateFlyoutPos();
      // Scale canvas elements once after drag ends
      const scroll=document.getElementById('editorScroll');
      if(scroll){const newW=scroll.offsetWidth;if(newW&&newW!==_canvasW)_applyCanvasScale(newW);}
    }
    document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
  });

  handle.addEventListener('dblclick',function(){
    if(sidebar.classList.contains('collapsed')){sbExpand();return;}
    sidebar.style.transition='width .2s ease';sidebar.style.width=SB_DEFAULT+'px';
    setTimeout(()=>{sidebar.style.transition='';resetCanvasWidth();},220);
    localStorage.setItem('sb_width',SB_DEFAULT);
  });
}

export function sbCollapse(){
  const sb=document.getElementById('sidebar');
  const expBtn=document.getElementById('sbExpandBtn');
  sb.classList.add('collapsed');
  if(expBtn)expBtn.style.display='flex';
  localStorage.setItem('sb_collapsed','1');
  // Canvas width changes after transition → reset reference so next resize scales correctly
  setTimeout(resetCanvasWidth, 250);
}
export function sbExpand(){
  const sb=document.getElementById('sidebar');
  const expBtn=document.getElementById('sbExpandBtn');
  sb.classList.remove('collapsed');
  if(expBtn)expBtn.style.display='none';
  const savedW=localStorage.getItem('sb_width');
  if(savedW)sb.style.width=savedW+'px';
  localStorage.removeItem('sb_collapsed');
  setTimeout(resetCanvasWidth, 250);
}

// ─── SIDEBAR + DOCUMENT MANAGEMENT ───────────────────────────

let _secCollapsed={};  // section collapse state
let _nodeCollapsed={};  // per-doc node collapse state

// Helpers
function _getChildren(sec,parentId){
  return state.docs.filter(d=>d.section===sec&&(d.parentId||null)===(parentId||null));
}
function _hasChildren(sec,docId){
  return state.docs.some(d=>d.section===sec&&d.parentId===docId);
}
function _matchesFilter(doc,filter){
  if(!filter)return true;
  return (doc.title||'').toLowerCase().includes(filter.toLowerCase());
}
// Collect all docs in a subtree (for filter: show parent if any child matches)
function _subtreeMatches(sec,docId,filter){
  if(!filter)return true;
  const doc=state.docs.find(d=>d.id===docId);
  if(doc&&_matchesFilter(doc,filter))return true;
  return _getChildren(sec,docId).some(c=>_subtreeMatches(sec,c.id,filter));
}

// ── RECENT & STARRED FLYOUT ──────────────────────────────────
let _flyoutMode=null;
export function toggleFlyout(mode,triggerEl){
  if(_flyoutMode===mode){closeFlyout();return;}
  _flyoutMode=mode;
  document.querySelectorAll('.sb-primary-item').forEach(el=>el.classList.remove('flyout-open'));
  if(triggerEl)triggerEl.classList.add('flyout-open');
  const sb=document.getElementById('sidebar');
  const flyout=document.getElementById('sbFlyout');
  if(flyout&&sb){
    flyout.style.left=sb.offsetWidth+'px';
    // Position flyout starting at the trigger element's Y position
    if(triggerEl){
      const rect=triggerEl.getBoundingClientRect();
      flyout.style.top=rect.top+'px';
      flyout.style.height=(window.innerHeight-rect.top)+'px';
    } else {
      const headerH=document.querySelector('.header')?.offsetHeight||52;
      flyout.style.top=headerH+'px';
      flyout.style.height=(window.innerHeight-headerH)+'px';
    }
    flyout.classList.add('on');
  }
  document.getElementById('sbFlyoutBackdrop')?.classList.add('on');
  const _fbTitle=document.getElementById('sbFlyoutTitle');if(_fbTitle)_fbTitle.textContent=mode==='recent'?'Recent':'Starred';
  const _fbSearch=document.getElementById('sbFlyoutSearch');if(_fbSearch)_fbSearch.value='';
  buildFlyoutList('');
  const footer=document.getElementById('sbFlyoutFooter');
  if(footer)footer.innerHTML=mode==='recent'?'<button class="sb-flyout-footer-btn" onclick="clearRecent()"><i class="ti ti-trash" style="font-size:14px"></i> Xóa lịch sử Recent</button>':'';
  setTimeout(()=>document.getElementById('sbFlyoutSearch')?.focus(),80);
}
export function closeFlyout(){
  _flyoutMode=null;
  document.getElementById('sbFlyout')?.classList.remove('on');
  document.getElementById('sbFlyoutBackdrop')?.classList.remove('on');
  document.querySelectorAll('.sb-primary-item').forEach(el=>el.classList.remove('flyout-open'));
}
export function buildFlyoutList(filter){
  const list=document.getElementById('sbFlyoutList');if(!list)return;
  const q=(filter||'').toLowerCase();
  let items=_flyoutMode==='recent'
    ?(state.recent||[])
    :(state.docs||[]).filter(d=>(state.starred||[]).includes(d.id)).map(d=>({id:d.id,title:d.title,section:d.section,openedAt:null}));
  if(q)items=items.filter(it=>(it.title||'').toLowerCase().includes(q)||(it.section||'').toLowerCase().includes(q));
  list.innerHTML='';
  if(!items.length){
    const icon=_flyoutMode==='recent'?'history':q?'search':'star';
    list.innerHTML=`<div class="sb-flyout-empty"><i class="ti ti-${icon}" style="font-size:36px;opacity:.3;display:block;margin:0 auto 12px"></i>${q?'Không tìm thấy':_flyoutMode==='recent'?'Chưa có lịch sử':'Chưa đánh dấu trang nào'}</div>`;
    return;
  }
  if(_flyoutMode==='recent'){
    const now=Date.now();
    const g={t:[],y:[],e:[]};
    items.forEach(it=>{const d=now-(it.openedAt||0);if(d<86400000)g.t.push(it);else if(d<172800000)g.y.push(it);else g.e.push(it);});
    [['t','Hôm nay'],['y','Hôm qua'],['e','Trước đó']].forEach(([k,lbl])=>{
      if(!g[k].length)return;
      const sec=document.createElement('div');sec.className='sb-flyout-section';sec.textContent=lbl;list.appendChild(sec);
      g[k].forEach(it=>list.appendChild(_mkFlyoutItem(it)));
    });
  } else {items.forEach(it=>list.appendChild(_mkFlyoutItem(it)));}
}
function _mkFlyoutItem(it){
  const el=document.createElement('div');el.className='sb-flyout-item';
  const isS=(state.starred||[]).includes(it.id);
  el.innerHTML=`<div class="sb-flyout-item-icon"><i class="ti ti-file-text"></i></div><div class="sb-flyout-item-info"><div class="sb-flyout-item-title">${escH(it.title||'Untitled')}</div><div class="sb-flyout-item-meta">${escH(it.section||'')}${it.openedAt?' · '+_relTime(it.openedAt):''}</div></div><button class="sb-flyout-item-action${isS?' starred':''}" onclick="event.stopPropagation();toggleStar('${it.id}',this)" title="${isS?'Bỏ đánh dấu':'Đánh dấu'}"><i class="ti ti-star${isS?'-filled':''}"></i></button>`;
  el.onclick=()=>{openDoc(it.id);closeFlyout();};
  return el;
}
export function filterFlyout(q){buildFlyoutList(q);}
export function toggleStar(id,btn){
  if(!state.starred)state.starred=[];
  const idx=state.starred.indexOf(id);
  if(idx>=0){state.starred.splice(idx,1);btn.classList.remove('starred');btn.innerHTML='<i class="ti ti-star"></i>';btn.title='Đánh dấu';}
  else{state.starred.push(id);btn.classList.add('starred');btn.innerHTML='<i class="ti ti-star-filled"></i>';btn.title='Bỏ đánh dấu';}
  persist();renderSidebar();
  if(_flyoutMode==='starred')buildFlyoutList(document.getElementById('sbFlyoutSearch')?.value||'');
}
export function clearRecent(){if(!confirm('Xóa toàn bộ lịch sử?'))return;state.recent=[];persist();buildFlyoutList('');toast('Đã xóa','info');}
function _updateFlyoutPos(){const sb=document.getElementById('sidebar');const f=document.getElementById('sbFlyout');if(f?.classList.contains('on')&&sb)f.style.left=sb.offsetWidth+'px';}

// ── CONFLUENCE TOP NAV ─────────────────────────────────────────
let _hdrIsEditing=false;

export function renderSidebar(filter=''){
  const nav=document.getElementById('sbNav');nav.innerHTML='';

  // PAGE TREE label
  const treeLabel=document.createElement('div');treeLabel.className='sb-section-label';
  treeLabel.innerHTML='<span>Page Tree</span>';
  // "+" adds a child of current open page, or root page if none
  const addPageBtn=document.createElement('button');
  addPageBtn.className='sb-tree-add-btn';
  addPageBtn.title='Them trang con vao trang dang mo';
  addPageBtn.innerHTML='<i class="ti ti-plus" style="font-size:11px"></i> Trang moi';
  addPageBtn.onclick=()=>{
    const cur=currentDoc();
    if(cur)_quickNewDoc(cur.section,cur.id);
    else if(state.sections.length)_quickNewDoc(state.sections[0],null);
  };
  treeLabel.appendChild(addPageBtn);
  nav.appendChild(treeLabel);

  state.sections.forEach(sec=>{
    const rootDocs=_getChildren(sec,null);
    if(filter&&!rootDocs.some(d=>_subtreeMatches(sec,d.id,filter)))return;
    const isCollapsed=_secCollapsed[sec];
    const secWrap=document.createElement('div');secWrap.className='sb-section';

    // ── Section header row ───────────────────────────────────
    const toggleRow=document.createElement('div');toggleRow.className='sb-section-toggle';
    const chevron=document.createElement('button');chevron.className='sb-sec-chevron'+(isCollapsed?'':' open');
    chevron.innerHTML='<i class="ti ti-chevron-right" style="transition:transform .18s"></i>';
    if(!isCollapsed){const _ci=chevron.querySelector('i');if(_ci)_ci.style.transform='rotate(90deg)';}
    chevron.style.marginLeft='4px';
    chevron.onclick=()=>{
      _secCollapsed[sec]=!_secCollapsed[sec];
      const _ico=chevron.querySelector('i');
      if(_ico)_ico.style.transform=_secCollapsed[sec]?'':'rotate(90deg)';
      listEl.style.display=_secCollapsed[sec]?'none':'';
    };
    const secItem=document.createElement('div');secItem.className='doc-item';secItem.style.cssText='flex:1;margin:1px 6px 1px 0';
    secItem.innerHTML='<span class="doc-item-icon"><i class="ti ti-folder" style="font-size:12px"></i></span>';
    const secTitle=document.createElement('span');secTitle.className='doc-title';secTitle.style.cssText='font-weight:500;font-size:12px';secTitle.textContent=sec;
    // Double-click to rename inline
    secTitle.addEventListener('dblclick',e=>{e.stopPropagation();renameSection(sec,secTitle);});
    secTitle.title='Nhấn đúp để đổi tên';
    secItem.appendChild(secTitle);
    const secActs=document.createElement('div');secActs.className='doc-actions';
    const secAddBtn=document.createElement('button');
    secAddBtn.style.cssText='width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;border:none;background:transparent;color:var(--sb-txt3);cursor:pointer;font-size:13px;font-weight:500;transition:.12s;flex-shrink:0';
    secAddBtn.title='Tao trang moi trong section';
    secAddBtn.innerHTML='<i class="ti ti-plus" style="font-size:13px"></i>';
    secAddBtn.onmouseenter=()=>{secAddBtn.style.background='var(--sb-active-bg)';secAddBtn.style.color='var(--accent)';};
    secAddBtn.onmouseleave=()=>{secAddBtn.style.background='transparent';secAddBtn.style.color='var(--sb-txt3)';};
    secAddBtn.onclick=(e)=>{e.stopPropagation();_quickNewDoc(sec,null);};
    const secMenuBtn=document.createElement('button');secMenuBtn.className='doc-act-btn';secMenuBtn.title='Tuy chon section';secMenuBtn.innerHTML='<i class="ti ti-dots"></i>';
    secMenuBtn.onclick=(e)=>{e.stopPropagation();openSecCtx(e,sec);};
    secActs.appendChild(secAddBtn);secActs.appendChild(secMenuBtn);
    secItem.appendChild(secActs);
    toggleRow.appendChild(chevron);toggleRow.appendChild(secItem);
    secWrap.appendChild(toggleRow);

    // ── Doc tree ─────────────────────────────────────────────
    const listEl=document.createElement('div');listEl.style.display=isCollapsed?'none':'';
    _renderDocNodes(listEl,sec,null,0,filter);
    // Empty hint
    if(rootDocs.length===0&&!filter){
      const hint=document.createElement('div');
      hint.style.cssText='padding:4px 8px 4px 32px;font-size:11px;color:var(--sb-txt3)';
      hint.textContent='Chua co trang nao';listEl.appendChild(hint);
    }
    secWrap.appendChild(listEl);nav.appendChild(secWrap);
  });
}

// Recursively render doc nodes in a section
function _renderDocNodes(container,sec,parentId,depth,filter){
  const children=_getChildren(sec,parentId);
  children.forEach(doc=>{
    if(filter&&!_subtreeMatches(sec,doc.id,filter))return;

    const hasKids=_hasChildren(sec,doc.id);
    const isNodeCollapsed=_nodeCollapsed[doc.id];
    const indent=8+depth*16;  // 8px base + 16px per level

    // ── Doc item row ────────────────────────────────────────
    const row=document.createElement('div');row.style.cssText='display:flex;align-items:center';

    // Chevron (if has children) or bullet
    const indicator=document.createElement('button');
    indicator.style.cssText='flex-shrink:0;width:20px;height:24px;border:none;background:transparent;cursor:'+(hasKids?'pointer':'default')+';display:flex;align-items:center;justify-content:center;border-radius:3px;margin-left:'+indent+'px;color:var(--sb-txt3);font-size:10px;padding:0;transition:.12s';
    if(hasKids){
      indicator.innerHTML='<i class="ti ti-chevron-right" style="transition:transform .15s;'+(isNodeCollapsed?'':'transform:rotate(90deg)')+'"></i>';
      indicator.onclick=(e)=>{
        e.stopPropagation();
        _nodeCollapsed[doc.id]=!_nodeCollapsed[doc.id];
        const ic=indicator.querySelector('i');
        ic.style.transform=_nodeCollapsed[doc.id]?'':'rotate(90deg)';
        childContainer.style.display=_nodeCollapsed[doc.id]?'none':'';
      };
    } else {
      indicator.innerHTML='<span style="width:5px;height:5px;border-radius:50%;background:var(--sb-txt3);display:block"></span>';
    }

    const item=document.createElement('div');
    item.className='doc-item'+(doc.id===state.currentDocId?' active':'');
    item.style.cssText='flex:1;margin:1px 6px 1px 0;padding-left:3px;min-width:0';

    const icon=document.createElement('span');icon.className='doc-item-icon';
    icon.innerHTML=hasKids?'<i class="ti ti-file-text" style="font-size:12px"></i>':'<i class="ti ti-file" style="font-size:12px"></i>';
    const titleEl=document.createElement('span');titleEl.className='doc-title';titleEl.textContent=doc.title||'Untitled';

    // Actions row: [title] [+add-child] [⋯menu]
    // + button is OUTSIDE doc-actions so it's always visible on hover/active
    const addChildBtn=document.createElement('button');
    addChildBtn.className='doc-add-btn';
    addChildBtn.title='Them trang con';
    addChildBtn.innerHTML='<i class="ti ti-plus" style="font-size:12px"></i>';
    addChildBtn.onclick=(e)=>{e.stopPropagation();_quickNewDoc(sec,doc.id);};

    const acts=document.createElement('div');acts.className='doc-actions';acts.style.gap='1px';
    const menuBtn=document.createElement('button');menuBtn.className='doc-act-btn';menuBtn.title='Tuy chon';
    menuBtn.innerHTML='<i class="ti ti-dots-vertical" style="font-size:11px"></i>';
    menuBtn.onclick=(e)=>{e.stopPropagation();openDocCtx(e,doc.id);};
    acts.appendChild(menuBtn);

    item.appendChild(icon);item.appendChild(titleEl);
    // Star button
    const starBtn=document.createElement('button');
    const _isStar=(state.starred||[]).includes(doc.id);
    starBtn.className='doc-star'+(_isStar?' starred':'');
    starBtn.title=_isStar?'Bỏ đánh dấu':'Đánh dấu yêu thích';
    starBtn.innerHTML='<i class="ti ti-star'+(_isStar?'-filled':'')+'"></i>';
    starBtn.onclick=(e)=>{e.stopPropagation();toggleStar(doc.id,starBtn);};
    item.appendChild(starBtn);
    item.appendChild(addChildBtn);item.appendChild(acts);
    item.onclick=()=>openDoc(doc.id);

    row.appendChild(indicator);row.appendChild(item);
    container.appendChild(row);

    // ── Children container ──────────────────────────────────
    if(hasKids){
      const childContainer=document.createElement('div');
      childContainer.style.cssText=(isNodeCollapsed?'display:none':'');
      _renderDocNodes(childContainer,sec,doc.id,depth+1,filter);
      container.appendChild(childContainer);
    }
  });
}

function _quickNewDoc(section,parentId){
  const doc={
    id:uid(),title:'Untitled',section,parentId:parentId||null,
    content:'',images:[],textBoxes:[],
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  // Auto-expand parent node
  if(parentId)_nodeCollapsed[parentId]=false;
  state.docs.push(doc);persist();renderSidebar();openDoc(doc.id);
  setTimeout(()=>{
    const t=document.getElementById('docTitleInput');
    if(t){t.focus();t.select();}
  },80);
}

export function openSecCtx(e,sec){
  _ctxSec=sec;
  document.getElementById('docCtxMenu')?.classList.remove('on');
  const m=document.getElementById('secCtxMenu');
  m.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-100)+'px';
  m.classList.add('on');
}
let _ctxSec=null;

export function secCtxRename(){
  document.getElementById('secCtxMenu')?.classList.remove('on');
  const sec=_ctxSec;if(!sec)return;
  const newName=prompt('Đổi tên section:',sec);
  if(!newName||newName.trim()===sec)return;
  const n=newName.trim();
  if(state.sections.includes(n)){toast('Section đã tồn tại','error');return;}
  const idx=state.sections.indexOf(sec);
  if(idx>=0)state.sections[idx]=n;
  state.docs.forEach(d=>{if(d.section===sec)d.section=n;});
  persistNow();renderSidebar();
  toast('Đã đổi tên thành "'+n+'"','success');
}
export function secCtxDelete(){
  document.getElementById('secCtxMenu')?.classList.remove('on');
  const sec=_ctxSec;if(!sec)return;
  const count=state.docs.filter(d=>d.section===sec).length;
  if(!confirm(`Xóa section "${sec}"?${count?'\n⚠️ '+count+' trang trong section này cũng sẽ bị xóa.':''}`))return;
  state.sections=state.sections.filter(s=>s!==sec);
  state.docs=state.docs.filter(d=>d.section!==sec);
  persistNow();renderSidebar();
  toast('Đã xóa section','info');
}

// Close secCtxMenu on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('#secCtxMenu'))
    document.getElementById('secCtxMenu')?.classList.remove('on');
});

// Inline rename section (double-click)
export function renameSection(sec, titleEl){
  if(!titleEl)return;
  const inp=document.createElement('input');
  inp.value=sec;
  inp.style.cssText='width:100%;background:var(--surface);border:1.5px solid var(--accent);border-radius:4px;padding:1px 5px;font-size:12px;font-weight:500;font-family:var(--font);color:var(--text);outline:none;min-width:60px';
  titleEl.replaceWith(inp);inp.focus();inp.select();
  function commit(){
    const newName=inp.value.trim();
    if(!newName||newName===sec){renderSidebar();return;}
    if(state.sections.includes(newName)){toast('Section đã tồn tại','error');renderSidebar();return;}
    const idx=state.sections.indexOf(sec);
    if(idx>=0)state.sections[idx]=newName;
    state.docs.forEach(d=>{if(d.section===sec)d.section=newName;});
    persistNow();renderSidebar();
    toast('Đã đổi tên thành "'+newName+'"','success');
  }
  inp.addEventListener('blur',commit);
  inp.addEventListener('keydown',e2=>{
    if(e2.key==='Enter'){e2.preventDefault();inp.blur();}
    if(e2.key==='Escape'){e2.preventDefault();renderSidebar();}
  });
}
export function filterDocs(){renderSidebar(document.getElementById('searchInput').value.toLowerCase());}

// DOCS
export function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
export function newDoc(){
  const sel=document.getElementById('newDocSection');
  sel.innerHTML=state.sections.map(s=>`<option value="${escH(s)}">${escH(s)}</option>`).join('');
  document.getElementById('newDocTitle').value='';
  openModal('newDocModal');setTimeout(()=>document.getElementById('newDocTitle').focus(),100);
}
export function createDoc(){
  const title=document.getElementById('newDocTitle').value.trim()||'Untitled';
  const section=document.getElementById('newDocSection').value;
  const doc={id:uid(),title,section,parentId:null,content:'',images:[],textBoxes:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.docs.push(doc);persist();closeModal('newDocModal');renderSidebar();openDoc(doc.id);toast('Đã tạo tài liệu mới','success');
}
export function openDoc(id){
  const doc=state.docs.find(d=>d.id===id);if(!doc)return;
  // Track recent
  if(!state.recent)state.recent=[];
  state.recent=state.recent.filter(r=>r.id!==id);
  state.recent.unshift({id,title:doc.title||'Untitled',section:doc.section||'',openedAt:Date.now()});
  if(state.recent.length>30)state.recent=state.recent.slice(0,30);
  state.currentDocId=id;persist();
  document.getElementById('emptyState').style.display='none';
  document.getElementById('editorPanel').style.display='flex';
  document.getElementById('docTitleInput').value=doc.title||'';
  document.getElementById('editor').innerHTML=doc.content||'';
  renderMeta(doc);renderSidebar(document.getElementById('searchInput').value.toLowerCase());updatePageActionBar();hdrBuildNotif();
  // Reset undo stack for new doc (uses global fn exposed by app.js)
  if(typeof resetUndoStack==='function')resetUndoStack();
  setTimeout(()=>{
    if(typeof _cfImgLoadAll==='function')_cfImgLoadAll(document.getElementById('editor'));
    if(typeof _undoSnapshot==='function')_undoSnapshot(); // initial snapshot
  },80);
  setTimeout(async()=>{const ed=document.getElementById('editor');if(typeof _cfCarLoadAll==='function')await _cfCarLoadAll(ed);if(typeof _cfEmbedLoadAll==='function')_cfEmbedLoadAll(ed);},120);
  setTimeout(()=>{if(typeof tblAttachAll==='function')tblAttachAll();},50);
  setTimeout(()=>{if(typeof tbLoadAll==='function')tbLoadAll(doc);},60);
  setTimeout(()=>{if(typeof fmLoadAll==='function')fmLoadAll(doc);},80);
  // Re-apply theme colors, then reset canvas width reference
  setTimeout(()=>{if(typeof swapThemeColors==='function')swapThemeColors();},100);
  setTimeout(resetCanvasWidth,150);
}
export function currentDoc(){return state.docs.find(d=>d.id===state.currentDocId);}
export function onTitleChange(){const doc=currentDoc();if(!doc)return;doc.title=document.getElementById('docTitleInput').value;doc.updatedAt=new Date().toISOString();markDirty();renderSidebar(document.getElementById('searchInput').value.toLowerCase());updatePageActionBar();}
export function onContentChange(){
  const doc=currentDoc();if(!doc)return;
  if(typeof _undoSnapshotDebounced==='function')_undoSnapshotDebounced();
  const editor_el=document.getElementById('editor');if(!editor_el)return;
  const clone=editor_el.cloneNode(true);
  // Strip interactive chrome (not content)
  clone.querySelectorAll('.tbl-row-num,.tbl-col-resize-handle,.tbl-row-resize-handle,.tbl-col-sel,.tbl-row-sel,.tbl-img-btn,.tbl-cell-drop,.tbl-shadow-btn,.tbl-edge-h').forEach(e=>e.remove());
  // Save col widths to data attribute before stripping colgroup (persist across save/load)
  clone.querySelectorAll('table').forEach(tbl=>{
    const cg=tbl.querySelector('colgroup');
    if(!cg)return;
    const widths=Array.from(cg.querySelectorAll('col'))
      .map(col=>col.style.width||'')
      .join(',');
    if(widths.replace(/,/g,'').trim())tbl.dataset.colwidths=widths;
    else tbl.removeAttribute('data-colwidths');
  });
  // Save inner-row table widths BEFORE stripping colgroups
  clone.querySelectorAll('table.tbl-inner-row').forEach(innerTbl=>{
    const cg=innerTbl.querySelector('colgroup');if(!cg)return;
    const w=Array.from(cg.querySelectorAll('col')).map(c=>c.style.width||'').join(',');
    if(w.replace(/,/g,'').trim())innerTbl.dataset.innerwidths=w;
    else innerTbl.removeAttribute('data-innerwidths');
  });
  clone.querySelectorAll('colgroup').forEach(e=>e.remove());
  // Strip blob URLs from table cell images (only save data-tblimgid)
  clone.querySelectorAll('img[data-tblimgid]').forEach(img=>{
    img.removeAttribute('src'); // don't save blob: URL
  });
  // Strip carousel blob slide src too
  clone.querySelectorAll('.tbl-cell-car .tcc-slide img').forEach(img=>{
    img.removeAttribute('src');
  });
  // Strip cf-embed-toolbar from saved content (UI elements only)
  clone.querySelectorAll('.cf-embed-toolbar,.cf-img-toolbar,.cf-img-resize-h,.cf-col-toolbar,.cf-panel-actions').forEach(e=>e.remove());
  // Strip carousel slide blob URLs
  clone.querySelectorAll('.cf-carousel-block [data-slideid]').forEach(media=>{
    if(media.src&&!media.src.startsWith('data:'))media.removeAttribute('src');
  });
  clone.querySelectorAll('.cf-car-toolbar,.cf-car-add-slide').forEach(e=>e.remove());
  // Strip blob URLs from inline image blocks (only save data-cfimgid on outer div)
  clone.querySelectorAll('.cf-img-block[data-cfimgid] img,.cf-img-block[data-cfimgid] video').forEach(media=>{
    if(media.src&&!media.src.startsWith('data:'))media.removeAttribute('src');
  });
  // Strip cf-img-block toolbar/handles from saved content
  clone.querySelectorAll('.cf-img-toolbar,.cf-img-resize-h,.cf-img-ctx,.cf-col-toolbar,.cf-panel-actions,.editor-block-bar').forEach(e=>e.remove());
  // Preserve cp-mapped spans (theme-aware colors) in saved content
  doc.content=clone.innerHTML;doc.updatedAt=new Date().toISOString();
  if(typeof fmSaveAll==='function')fmSaveAll();if(typeof tbSaveAll==='function')tbSaveAll();markDirty();if(typeof tblAttachAll==='function')tblAttachAll();
}
export function renderMeta(doc){
  const el=document.getElementById('docMeta');
  const d=new Date(doc.updatedAt);
  const fmt=d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
  el.innerHTML=`<div class="meta-chip"><i class="ti ti-user"></i> ${escH(state.username)}</div><div class="meta-chip"><i class="ti ti-clock"></i> ${fmt}</div><div class="meta-chip"><i class="ti ti-folder"></i> ${escH(doc.section)}</div><span class="meta-tag">${escH(doc.section)}</span>`;
}

// DOC CTX
let docCtxId=null;
export function openDocCtx(e,id){docCtxId=id;const m=document.getElementById('docCtxMenu');m.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';m.style.top=Math.min(e.clientY,window.innerHeight-130)+'px';m.classList.add('on');}
export function docCtxRename(){const doc=state.docs.find(d=>d.id===docCtxId);if(!doc)return;const name=prompt('Doi ten:',doc.title);if(name!==null){doc.title=name||doc.title;persist();renderSidebar();if(state.currentDocId===docCtxId)document.getElementById('docTitleInput').value=doc.title;}document.getElementById('docCtxMenu')?.classList.remove('on');}
export function docCtxDuplicate(){const doc=state.docs.find(d=>d.id===docCtxId);if(!doc)return;const copy=JSON.parse(JSON.stringify(doc));copy.id=uid();copy.title+=' (copy)';copy.parentId=doc.parentId||null;copy.createdAt=new Date().toISOString();copy.updatedAt=new Date().toISOString();state.docs.push(copy);persist();renderSidebar();toast('Đã nhân bản','success');document.getElementById('docCtxMenu')?.classList.remove('on');}
export function docCtxDelete(){const doc=state.docs.find(d=>d.id===docCtxId);if(!doc)return;if(!confirm(`Xoá "${doc.title}"?`)){document.getElementById('docCtxMenu')?.classList.remove('on');return;}state.docs=state.docs.filter(d=>d.id!==docCtxId);if(state.currentDocId===docCtxId){state.currentDocId=null;document.getElementById('emptyState').style.display='';document.getElementById('editorPanel').style.display='none';}persist();renderSidebar();toast('Đã xoá','info');document.getElementById('docCtxMenu')?.classList.remove('on');}
