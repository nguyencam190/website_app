import { state } from './state.js';
import { _idbGet, _compressForExport, persist } from './storage.js';
import { escH } from '../utils/helpers.js';

// ── Shadow color palette (matches media.js SHADOW_COLORS) ─────────────────
const SHADOW_COLORS=[
  ['rgba(0,0,0,0.20)','rgba(200,200,200,0.22)'],
  ['rgba(0,0,0,0.45)','rgba(220,220,220,0.38)'],
  ['rgba(37,99,235,0.30)','rgba(77,138,255,0.40)'],
  ['rgba(16,185,129,0.30)','rgba(0,212,170,0.40)'],
  ['rgba(239,68,68,0.30)','rgba(248,113,113,0.40)'],
  ['rgba(168,85,247,0.30)','rgba(192,132,252,0.40)'],
  ['rgba(245,158,11,0.30)','rgba(251,191,36,0.40)'],
  ['rgba(255,255,255,0.50)','rgba(255,255,255,0.20)'],
];

// ── Fetch app CSS files and inline them ────────────────────────────────────
async function _fetchAppCss(){
  const files=['css/variables.css','css/layout.css','css/components.css'];
  const sheets=await Promise.all(
    files.map(f=>fetch(f).then(r=>r.ok?r.text():'').catch(()=>''))
  );
  return sheets.join('\n');
}

// ── Fetch viewer runtime JS ────────────────────────────────────────────────
async function _fetchViewerRuntime(){
  try{
    const r=await fetch('js/viewer-runtime.js');
    if(r.ok)return await r.text();
  }catch(e){}
  return '';
}

// ── Export progress toast ──────────────────────────────────────────────────
export function _showExportProgress(current,total,label){
  let el=document.getElementById('_exportProgress');
  if(!el){
    el=document.createElement('div');el.id='_exportProgress';
    el.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#e2e8f0;border-radius:12px;padding:14px 22px;font-size:13px;font-family:var(--font);z-index:600;box-shadow:0 8px 32px rgba(0,0,0,.4);min-width:280px;text-align:center';
    document.body.appendChild(el);
  }
  const pct=Math.round((current/Math.max(total,1))*100);
  el.innerHTML='<div style="font-weight:600;margin-bottom:8px">'+escH(label)+'</div>'
    +'<div style="background:#334155;border-radius:4px;height:6px;overflow:hidden">'
    +'<div style="background:var(--accent);height:100%;width:'+pct+'%;transition:width .2s;border-radius:4px"></div></div>'
    +'<div style="font-size:11px;color:#64748b;margin-top:6px">'+current+' / '+total+' ('+pct+'%)</div>';
  if(current>=total){setTimeout(()=>el.remove(),600);}
}

// ── JSON backup export ─────────────────────────────────────────────────────
export function exportProject(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=(state.projectName||'project').replace(/\s+/g,'_')+'.projectdocs.json';
  a.click();toast('Đã xuất JSON backup','success');
}

// ── Self-contained app backup (embed state in HTML) ────────────────────────
export async function exportSelfContained(){
  toast('Đang tạo file...','info');
  try{
    let html='';
    try{
      const resp=await fetch(location.href);
      if(!resp.ok)throw new Error('fetch failed');
      html=await resp.text();
    }catch(e){
      // file:// or offline — build minimal shell from current document
      html=document.documentElement.outerHTML;
    }
    html=html.replace(/<script id="pd-embedded-state"[\s\S]*?<\/script>\s*/g,'');
    const toSave=JSON.parse(JSON.stringify(state));
    toSave.docs.forEach(doc=>{
      if(doc.images)doc.images=doc.images.map(m=>{const{src,...meta}=m;return src&&src.startsWith('data:')?{...meta,src}:meta;});
    });
    const embedTag='<script id="pd-embedded-state" type="application/json">\n'+JSON.stringify(toSave)+'\n<\/script>\n';
    html=html.replace('</head>',embedTag+'</head>');
    const fname=(state.projectName||'project-docs').replace(/[^a-zA-Z0-9\-_]/g,'-')+'.html';
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
    a.download=fname;a.click();
    toast('✅ File HTML có sẵn dữ liệu — mở bất kỳ đâu đều đúng project','success');
  }catch(err){toast('Lỗi: '+err.message,'error');}
}

export function importProject(){document.getElementById('importInput').click();}
export function handleImport(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const imported=JSON.parse(ev.target.result);
      if(!imported.docs)throw new Error('Invalid');
      if(!confirm(`Import "${imported.projectName||'Unknown'}" với ${imported.docs.length} tài liệu? Dữ liệu hiện tại sẽ bị ghi đè.`))return;
      Object.assign(state,imported);
      persist();
      document.getElementById('projectNameEl').textContent=state.projectName;
      updateUserUI();renderSidebar();
      state.currentDocId=null;
      document.getElementById('emptyState').style.display='';
      document.getElementById('editorPanel').style.display='none';
      toast(`Đã import ${state.docs.length} tài liệu`,'success');
    }catch(err){toast('File không hợp lệ','error');}
  };
  reader.readAsText(file);e.target.value='';
}

// ── Export website modal ───────────────────────────────────────────────────
export function openExportWebsiteModal(){
  {const _e=document.getElementById('webTitle');if(_e)_e.value=state.projectName||'Project Docs';}
  const list=document.getElementById('webDocList');
  const currentId=state.currentDocId;
  const activeSecs=new Set(state.sections||[]);
  const validDocs=state.docs.filter(d=>!d._deleted&&(activeSecs.size===0||activeSecs.has(d.section)));
  if(validDocs.length===0){
    list.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">Không có trang nào để xuất.</div>';
    openModal('exportWebModal');return;
  }
  const bySection={};
  validDocs.forEach(d=>{
    const s=d.section||'(Không có nhóm)';
    if(!bySection[s])bySection[s]=[];
    bySection[s].push(d);
  });
  let html='';
  html+=`<div style="display:flex;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)">
    <button id="_selAll" style="font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;color:var(--text)">✓ Chọn tất cả</button>
    <button id="_deselAll" style="font-size:11px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);cursor:pointer;color:var(--text)">✕ Bỏ chọn tất cả</button>
    <button id="_selCurrent" style="font-size:11px;padding:2px 8px;border:1px solid var(--accent);border-radius:4px;background:var(--accent-light);cursor:pointer;color:var(--accent)">Chỉ trang hiện tại</button>
  </div>`;
  Object.entries(bySection).forEach(([sec,docs])=>{
    html+=`<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px">${escH(sec)}</div>`;
    docs.forEach(d=>{
      const isCurrent=d.id===currentId;
      html+=`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:4px 6px;border-radius:4px;${isCurrent?'background:var(--accent-light)':''}">
        <input type="checkbox" value="${escH(d.id)}" ${isCurrent?'checked':''} style="accent-color:var(--accent)">
        <i class="ti ti-file-text" style="color:${isCurrent?'var(--accent)':'var(--text2)'};font-size:13px"></i>
        <span style="flex:1;${isCurrent?'color:var(--accent);font-weight:500':''}">${escH(d.title||'Untitled')}</span>
        ${isCurrent?'<span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:10px">Hiện tại</span>':''}
      </label>`;
    });
  });
  list.innerHTML=html;
  // Wire select/deselect buttons without inline handlers
  list.querySelector('#_selAll')?.addEventListener('click',()=>list.querySelectorAll('input').forEach(i=>i.checked=true));
  list.querySelector('#_deselAll')?.addEventListener('click',()=>list.querySelectorAll('input').forEach(i=>i.checked=false));
  list.querySelector('#_selCurrent')?.addEventListener('click',()=>list.querySelectorAll('input').forEach(i=>i.checked=i.value===currentId));
  openModal('exportWebModal');
  setTimeout(()=>{
    const dim=document.getElementById('sliderMaxDim');
    const qual=document.getElementById('sliderQuality');
    if(dim){
      const sync=()=>{document.getElementById('maxDimDisplay').textContent=dim.value;const el2=document.getElementById('maxDimDisplay2');if(el2)el2.textContent=dim.value;};
      dim.oninput=sync;sync();
    }
    if(qual){
      const sync=()=>{document.getElementById('qualDisplay').textContent=qual.value+'%';const el2=document.getElementById('qualDisplay2');if(el2)el2.textContent=qual.value+'%';};
      qual.oninput=sync;sync();
    }
    document.querySelectorAll('input[name="imgQuality"]').forEach(r=>{
      r.addEventListener('change',()=>{
        const isCompress=r.value==='compress'&&r.checked;
        const opts=document.getElementById('compressOptions');
        if(opts)opts.style.display=isCompress?'':'none';
        const warn=document.getElementById('exportSizeWarn');
        if(warn)warn.style.display=(!isCompress&&state.docs.some(d=>(d.images||[]).length>10))?'flex':'none';
        ['qualOpt_original','qualOpt_compress'].forEach(id=>{
          const el=document.getElementById(id);if(!el)return;
          el.style.borderColor=el.id==='qualOpt_'+r.value&&r.checked?'var(--accent)':'var(--border)';
          el.style.background=el.id==='qualOpt_'+r.value&&r.checked?'var(--accent-light)':'';
        });
      });
    });
  },50);
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH WEB — Confluence-style, CSS fetched from external files
//   Phase 0: Flush editor state
//   Phase 1: Gather settings & docs
//   Phase 2: Build navigation sidebar (no inline handlers)
//   Phase 3: Build each page (clean DOM + resolve media to base64)
//   Phase 4: Assemble CSS (viewer shell + fetched app CSS)
//   Phase 5: Assemble lightweight viewer JS (event delegation)
//   Phase 6: Build HTML template & download
// ═══════════════════════════════════════════════════════════════════════════
export async function doExportWebsite(){
  try{
  // ── Phase 0 ───────────────────────────────────────────────
  fmSaveAll();tbSaveAll();
  const curDoc=currentDoc();
  if(curDoc){
    const clone=document.getElementById('editor').cloneNode(true);
    clone.querySelectorAll([
      '.tbl-row-num','.tbl-col-resize-handle','.tbl-row-resize-handle',
      '.tbl-col-sel','.tbl-row-sel','.tbl-img-btn','.tbl-shadow-btn',
      '.tbl-cell-drop','.tbl-edge-h','.cf-img-toolbar','.cf-img-resize-h',
      '.cf-col-toolbar','.cf-panel-actions','.cf-car-toolbar','.editor-block-bar','.slash-hint'
    ].join(',')).forEach(e=>e.remove());
    clone.querySelectorAll('.cf-img-block img,.cf-img-block video').forEach(el=>{if(el.src&&!el.src.startsWith('data:'))el.removeAttribute('src');});
    clone.querySelectorAll('colgroup').forEach(e=>e.remove());
    clone.querySelectorAll('img[data-tblimgid]').forEach(img=>img.removeAttribute('src'));
    curDoc.content=clone.innerHTML;
  }
  persist();

  // ── Phase 1 ───────────────────────────────────────────────
  const title=(document.getElementById('webTitle')?.value.trim()||state.projectName||'Project Docs');
  const accent=document.querySelector('input[name="webTheme"]:checked')?.value||'#2563eb';
  const exportDark=document.documentElement.getAttribute('data-theme')==='dark';
  const checkedIds=Array.from(document.querySelectorAll('#webDocList input[type=checkbox]:checked')).map(i=>i.value);
  const activeSecs2=new Set(state.sections||[]);
  const validAll=state.docs.filter(d=>!d._deleted&&(activeSecs2.size===0||activeSecs2.has(d.section)));
  const docs=validAll.filter(d=>checkedIds.includes(d.id));
  if(!docs.length){toast('Chọn ít nhất một tài liệu','error');return;}

  let _tot=0,_cnt=0;
  docs.forEach(d=>{
    _tot+=(d.images||[]).length;
    const tmp=document.createElement('div');tmp.innerHTML=d.content||'';
    _tot+=tmp.querySelectorAll('img[data-tblimgid]').length;
    _tot+=tmp.querySelectorAll('.cf-img-block[data-cfimgid]').length;
    _tot+=tmp.querySelectorAll('.cf-carousel-block img[data-carid]').length;
    tmp.querySelectorAll('.cf-carousel-block[data-cfcarids]').forEach(b=>{_tot+=(b.dataset.cfcarids||'').split(',').filter(Boolean).length;});
    tmp.querySelectorAll('.tbl-cell-car[data-slideids]').forEach(c=>{_tot+=(c.dataset.slideids||'').split(',').filter(Boolean).length;});
  });
  if(_tot>0)_showExportProgress(0,_tot,'Chuẩn bị xuất...');

  // IDB → base64 helpers (local to this function)
  const _objUrls_local={};
  try{const m=await import('./storage.js');Object.assign(_objUrls_local,m._objUrls||{});}catch(e){}
  async function toB64(blob){if(!blob)return'';return await _compressForExport(blob);}
  async function idbToB64(id){
    try{
      const cached=_objUrls_local[id]||(window._objUrls&&window._objUrls[id]);
      if(cached){const r=await fetch(cached);const b=await r.blob();return await toB64(b);}
    }catch(e){}
    try{const b=await _idbGet(id);if(b)return await toB64(b);}catch(e){}
    return'';
  }

  // ── Phase 2: Navigation sidebar ───────────────────────────
  const sections=[...new Set(docs.map(d=>d.section))];
  const docIndex=docs.map(d=>({id:d.id,title:d.title||'Untitled',section:d.section||''}));

  const navRoot=document.createElement('div');
  const sh=document.createElement('div');sh.className='ws-space-hdr';
  sh.innerHTML=`<div class="ws-space-icon"><i class="ti ti-notebook"></i></div><div class="ws-space-name">${escH(title)}</div>`;
  navRoot.appendChild(sh);

  const pnav=document.createElement('div');pnav.className='ws-pnav';
  ['recent','starred','pages'].forEach((mode,i)=>{
    const btn=document.createElement('div');btn.className='ws-pnav-item'+(i===2?' active':'');
    btn.id='wsPNavBtn-'+mode;
    const icons={recent:'ti-history',starred:'ti-star',pages:'ti-files'};
    const labels={recent:'Recent',starred:'Starred',pages:'Pages'};
    btn.innerHTML=`<i class="ti ${icons[mode]}"></i><span>${labels[mode]}</span>`;
    btn.dataset.wsmode=mode;
    pnav.appendChild(btn);
  });
  navRoot.appendChild(pnav);

  const recPanel=document.createElement('div');recPanel.id='wsSbRecent';recPanel.className='ws-sb-panel';
  recPanel.style.display='none';
  recPanel.innerHTML='<div class="ws-sb-empty"><i class="ti ti-history"></i><div>Chưa có trang nào gần đây</div></div>';
  navRoot.appendChild(recPanel);

  const starPanel=document.createElement('div');starPanel.id='wsSbStarred';starPanel.className='ws-sb-panel';
  starPanel.style.display='none';
  starPanel.innerHTML='<div class="ws-sb-empty"><i class="ti ti-star"></i><div>Chưa có trang yêu thích</div></div>';
  navRoot.appendChild(starPanel);

  const pagesPanel=document.createElement('div');pagesPanel.id='wsSbPages';pagesPanel.className='ws-sb-panel';
  sections.forEach(sec=>{
    const sg=document.createElement('div');sg.className='ws-sec-grp';
    const sl=document.createElement('div');sl.className='ws-sec-lbl';
    sl.innerHTML=`<i class="ti ti-folder" style="font-size:12px"></i>${escH(sec)}`;
    sg.appendChild(sl);
    docs.filter(d=>d.section===sec).forEach(d=>{
      const item=document.createElement('div');item.className='ws-nav-item';item.id='nav-'+d.id;
      item.dataset.docid=d.id;
      item.innerHTML=`<i class="ti ti-file-text ws-nav-icon"></i><span class="ws-nav-title">${escH(d.title||'Untitled')}</span><button class="ws-star-btn" data-docid="${escH(d.id)}" title="Đánh dấu yêu thích">☆</button>`;
      sg.appendChild(item);
    });
    pagesPanel.appendChild(sg);
  });
  navRoot.appendChild(pagesPanel);

  const navHTML=navRoot.innerHTML;
  const docIndexJSON=JSON.stringify(docIndex);

  // ── Phase 3: Build pages ───────────────────────────────────
  const pageRoot=document.createElement('div');
  for(const d of docs){
    const updated=new Date(d.updatedAt||d.createdAt||Date.now());
    const dateStr=updated.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
    const docDiv=document.createElement('div');docDiv.className='ws-doc';docDiv.id='doc-'+d.id;docDiv.style.display='none';
    const h1=document.createElement('h1');h1.className='ws-doc-title';h1.textContent=d.title||'Untitled';
    const meta=document.createElement('div');meta.className='ws-doc-meta';
    ['📁 '+d.section,'📅 '+dateStr,'✍ '+(state.username||'')].forEach(t=>{const s=document.createElement('span');s.textContent=t;meta.appendChild(s);});
    const canvasWrap=document.createElement('div');canvasWrap.className='ws-canvas-wrap';
    const canvas=document.createElement('div');canvas.className='ws-canvas';
    const _editorEl=document.getElementById('editor');
    canvas.dataset.natW=(_editorEl?_editorEl.offsetWidth:0)||900;
    const allItems=[...(d.images||[]),...(d.textBoxes||[])];
    canvas.style.minHeight=allItems.reduce((m,it)=>Math.max(m,(it.fmy??it.y??0)+(it.fmh??it.h??200)+80),400)+'px';

    const ec=document.createElement('div');ec.className='editor-content';
    const tmp=document.createElement('div');tmp.innerHTML=d.content||'';

    // 3a. Remove editor-only UI
    tmp.querySelectorAll('.tbl-outer').forEach(w=>{
      w.querySelectorAll('.tbl-edge-h').forEach(e=>e.remove());
      w.style.marginLeft='';
      w.style.cssText='display:block;margin:14px 0;width:100%;overflow-x:auto;overflow-y:visible';
    });
    tmp.querySelectorAll('table.tbl-inner-row').forEach(innerTbl=>{
      const cg=innerTbl.querySelector('colgroup');if(!cg)return;
      const w=Array.from(cg.querySelectorAll('col')).map(c=>c.style.width||'').join(',');
      if(w.replace(/,/g,'').trim())innerTbl.dataset.innerwidths=w;
    });
    tmp.querySelectorAll('.tbl-inner-resize,.tbl-inner-add-btn').forEach(e=>e.remove());
    tmp.querySelectorAll([
      '.tbl-row-num','.tbl-col-resize-handle','.tbl-row-resize-handle',
      '.tbl-col-sel','.tbl-row-sel','.tbl-img-btn','.tbl-shadow-btn',
      '.tbl-cell-drop','.tbl-merge-bar','colgroup','.fmedia','.txtbox',
      'script','style',
      '.cf-col-toolbar','.cf-col-count-dd','.cf-col-more-dd','.cf-col-sep-v',
      '.cf-img-toolbar','.cf-img-resize-h','.cf-img-ctx',
      '.cf-panel-actions','.cf-car-toolbar','.cf-embed-toolbar',
      '.cf-car-add-slide','.editor-block-bar','.slash-hint','.pab-logo-menu'
    ].join(',')).forEach(e=>e.remove());

    // 3b. Strip editor-mode attributes
    tmp.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));
    tmp.querySelectorAll('[spellcheck]').forEach(el=>el.removeAttribute('spellcheck'));
    tmp.querySelectorAll('[oninput],[onfocus],[onblur],[onkeydown]').forEach(el=>{
      ['oninput','onfocus','onblur','onkeydown'].forEach(a=>el.removeAttribute(a));
    });
    tmp.querySelectorAll('.cf-col-empty').forEach(el=>el.classList.remove('cf-col-empty'));
    tmp.querySelectorAll('[data-placeholder]').forEach(el=>el.removeAttribute('data-placeholder'));

    // 3c. Rebuild table colgroups for fixed layout
    tmp.querySelectorAll('table:not(.tbl-inner-row)').forEach(tbl=>{
      const savedW=tbl.dataset.colwidths;
      if(savedW){
        const wArr=savedW.split(',');
        const cg=document.createElement('colgroup');
        let trueCols=0;
        if(tbl.rows[0])Array.from(tbl.rows[0].cells).forEach(c=>trueCols+=(c.colSpan||1));
        for(let i=0;i<trueCols;i++){
          const col=document.createElement('col');
          col.style.width=wArr[i]||(i===0?'36px':'120px');
          cg.appendChild(col);
        }
        tbl.insertBefore(cg,tbl.firstChild);
      }
      tbl.style.setProperty('table-layout','fixed','important');
      tbl.style.setProperty('width','max-content','important');
      tbl.style.borderCollapse='collapse';
    });
    tmp.querySelectorAll('table.tbl-inner-row').forEach(innerTbl=>{
      const savedW=innerTbl.dataset.innerwidths;
      if(savedW){
        const wArr=savedW.split(',');
        const cells=innerTbl.querySelectorAll('tr td');
        const cg=document.createElement('colgroup');
        for(let i=0;i<cells.length;i++){
          const col=document.createElement('col');
          col.style.width=wArr[i]||(Math.round(100/cells.length)+'%');
          cg.appendChild(col);
        }
        innerTbl.insertBefore(cg,innerTbl.firstChild);
      }
      innerTbl.style.setProperty('table-layout','fixed','important');
      innerTbl.style.width='100%';
      innerTbl.style.borderCollapse='collapse';
    });

    // 3d. Resolve IDB media → base64
    for(const block of Array.from(tmp.querySelectorAll('.cf-carousel-block[data-cfcarids]'))){
      const ids=(block.dataset.cfcarids||'').split(',').filter(Boolean);
      const slides=Array.from(block.querySelectorAll('.cf-carousel-slide'));
      for(let i=0;i<ids.length;i++){
        const b64=await idbToB64(ids[i]);
        const media=slides[i]?.querySelector('img,video');
        if(b64&&media){media.src=b64;}else if(slides[i])slides[i].remove();
        _showExportProgress(++_cnt,_tot,'Xuất carousel...');
        if(_cnt%3===0)await new Promise(r=>setTimeout(r,0));
      }
      block.removeAttribute('data-cfcarids');
      block.querySelectorAll('.cf-car-toolbar,.cf-car-add-slide').forEach(e=>e.remove());
    }
    for(const block of Array.from(tmp.querySelectorAll('.cf-carousel-block[data-carids]'))){
      const ids=(block.dataset.carids||'').split(',').filter(Boolean);
      const imgs=Array.from(block.querySelectorAll('img[data-carid]'));
      for(let i=0;i<ids.length;i++){
        const b64=await idbToB64(ids[i]);
        if(b64&&imgs[i]){imgs[i].src=b64;imgs[i].removeAttribute('data-carid');}
        else if(imgs[i])imgs[i].closest('.cf-car-slide')?.remove();
        _showExportProgress(++_cnt,_tot,'Xuất carousel...');
        if(_cnt%3===0)await new Promise(r=>setTimeout(r,0));
      }
      block.querySelector('.cf-car-toolbar')?.remove();
      block.removeAttribute('data-carids');
    }
    for(const block of Array.from(tmp.querySelectorAll('.cf-img-block[data-cfimgid]'))){
      const id=block.dataset.cfimgid;if(!id)continue;
      const media=block.querySelector('img,video');
      const b64=await idbToB64(id);
      if(b64&&media){
        media.src=b64;
        media.style.cssText='display:block;max-width:100%;height:auto;border-radius:4px;cursor:zoom-in';
        block.removeAttribute('data-cfimgid');
      }else{block.remove();}
      _showExportProgress(++_cnt,_tot,'Xuất ảnh nội tuyến...');
      if(_cnt%3===0)await new Promise(r=>setTimeout(r,0));
    }
    // 3e. Final cleanup
    tmp.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));
    tmp.querySelectorAll('.cf-img-block img,.cf-car-slide img,.cf-carousel-slide img').forEach(img=>{img.style.cursor='zoom-in';img.dataset.wslb='1';});
    tmp.querySelectorAll('.cf-embed-wrap').forEach(wrap=>{if(!wrap.style.paddingBottom)wrap.style.paddingBottom='56.25%';});
    tmp.querySelectorAll('.cf-col-sep-line').forEach(el=>{el.style.cursor='default';});
    for(const img of Array.from(tmp.querySelectorAll('img[data-tblimgid]'))){
      const id=img.dataset.tblimgid;if(!id)continue;
      const b64=await idbToB64(id);
      if(b64){img.src=b64;img.removeAttribute('data-tblimgid');}else img.remove();
      _showExportProgress(++_cnt,_tot,'Xuất ảnh bảng...');
      if(_cnt%3===0)await new Promise(r=>setTimeout(r,0));
    }
    for(const car of Array.from(tmp.querySelectorAll('.tbl-cell-car'))){
      const ids=(car.dataset.slideids||'').split(',').filter(Boolean);
      const imgs=car.querySelectorAll('.tcc-slide img');
      for(let i=0;i<ids.length;i++){const b64=await idbToB64(ids[i]);if(imgs[i]&&b64)imgs[i].src=b64;_showExportProgress(++_cnt,_tot,'Xuất carousel bảng...');}
    }
    tmp.querySelectorAll('img').forEach(img=>{
      img.style.outline='';img.style.outlineOffset='';
      if(img.dataset.shadowXyb&&img.dataset.shadowLight){
        const col=exportDark?(img.dataset.shadowDark||img.dataset.shadowLight):img.dataset.shadowLight;
        img.style.filter=img.dataset.shadowXyb+' '+col+')';
      }
      ['shadowkey','shadowLight','shadowDark','shadowXyb'].forEach(k=>delete img.dataset[k]);
    });
    if(!tmp.textContent.trim()&&!tmp.querySelector('table,img'))tmp.innerHTML='<p><em>Chưa có nội dung.</em></p>';
    ec.innerHTML=tmp.innerHTML;
    canvas.appendChild(ec);

    // 3f. Floating media
    for(const m of (d.images||[])){
      const x=m.fmx??48,y=m.fmy??40,w=m.fmw??(m.type==='video'?480:320),h=m.fmh??(m.type==='video'?270:220);
      let shadow='0 2px 12px rgba(0,0,0,.1)';
      if(m.shadow&&m.shadow.opacity>0){
        const[lc,dc]=SHADOW_COLORS[m.shadow.colorIdx||0]||SHADOW_COLORS[0];
        const col=(exportDark?dc:lc).replace(/[\d.]+\)$/,m.shadow.opacity+')');
        shadow=`${m.shadow.x||0}px ${m.shadow.y||4}px ${m.shadow.blur||12}px ${m.shadow.spread||0}px ${col}`;
      }
      const fm=document.createElement('div');
      fm.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:10px;overflow:hidden;box-shadow:${shadow}`;
      if(m.type==='carousel'){
        const srcs=[];
        for(const sl of (m.slides||[])){const b64=await idbToB64(sl.id);_showExportProgress(++_cnt,_tot,'Xuất carousel...');if(b64)srcs.push(b64);if(_cnt%3===0)await new Promise(r=>setTimeout(r,0));}
        if(!srcs.length)continue;
        const carEl=document.createElement('div');carEl.className='ws-fm-car';carEl.dataset.cartotal=srcs.length;carEl.dataset.caridx='0';
        const inner=document.createElement('div');inner.className='ws-fm-inner';
        srcs.forEach(src=>{
          const slide=document.createElement('div');slide.className='ws-fm-slide';
          const img=document.createElement('img');img.src=src;img.loading='lazy';img.dataset.wslb='1';
          slide.appendChild(img);inner.appendChild(slide);
        });
        const prev=document.createElement('button');prev.className='ws-fm-btn prev';prev.innerHTML='&#8249;';
        const next=document.createElement('button');next.className='ws-fm-btn next';next.innerHTML='&#8250;';
        const badge=document.createElement('div');badge.className='ws-fm-badge';badge.textContent='1/'+srcs.length;
        carEl.appendChild(inner);carEl.appendChild(prev);carEl.appendChild(next);carEl.appendChild(badge);
        fm.appendChild(carEl);
      }else if(m.type==='video'){
        const b64=await idbToB64(m.id);
        _showExportProgress(++_cnt,_tot,'Xuất video...');if(!b64)continue;
        const v=document.createElement('video');v.src=b64;v.controls=true;v.style.cssText='width:100%;height:100%;object-fit:contain;background:#000;display:block';
        fm.appendChild(v);
      }else{
        const b64=await idbToB64(m.id);_showExportProgress(++_cnt,_tot,'Xuất ảnh...');if(!b64)continue;
        const img=document.createElement('img');img.src=b64;img.loading='lazy';img.style.cssText='width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in';img.dataset.wslb='1';
        fm.appendChild(img);
      }
      canvas.appendChild(fm);
      if(_cnt%5===0)await new Promise(r=>setTimeout(r,0));
    }

    // 3g. Text boxes
    for(const tb of (d.textBoxes||[])){
      const box=document.createElement('div');
      box.style.cssText=`position:absolute;left:${tb.x}px;top:${tb.y}px;width:${tb.w}px;min-height:${tb.h||80}px;border:${tb.bdw||1.5}px solid ${tb.bd||'var(--accent)'};border-radius:6px;background:${tb.bg||'var(--surface)'};box-shadow:${tb.shadow?'0 4px 8px rgba(0,0,0,.24)':'none'};box-sizing:border-box;overflow:auto;padding:10px 12px;font-size:14px;line-height:1.7;color:var(--text)`;
      const tbT=document.createElement('div');tbT.innerHTML=tb.content||'';
      tbT.querySelectorAll('.txtbox-handle-bar,.rh,script,[contenteditable]').forEach(e=>{
        if(e.tagName==='SCRIPT'||e.classList.contains('txtbox-handle-bar')||e.classList.contains('rh'))e.remove();
        else e.removeAttribute('contenteditable');
      });
      box.innerHTML=tbT.innerHTML;canvas.appendChild(box);
    }

    canvasWrap.appendChild(canvas);
    docDiv.appendChild(h1);docDiv.appendChild(meta);docDiv.appendChild(canvasWrap);
    pageRoot.appendChild(docDiv);
  }
  const pagesHTML=pageRoot.innerHTML;
  const firstId=docs[0].id;

  // ── Phase 4: CSS ───────────────────────────────────────────
  // Viewer shell CSS (self-contained viewer layout)
  const shellCss=[
    '*{box-sizing:border-box;margin:0;padding:0}',
    `:root{--accent:${accent};--accent-light:${accent}22;--sb:var(--surface2);--sb-nav:#42526e;--sb-nav-hbg:var(--surface3);--sb-sec:#6b778c;--sb-active-bg:rgba(37,99,235,.08);--sb-active-txt:var(--accent);--bg:#f8fafc;--surface:#ffffff;--surface2:#f1f5f9;--surface3:#e8edf5;--border:#e2e8f0;--border2:#cbd5e1;--text:#0f172a;--text2:#475569;--text3:#94a3b8;--tbl-hbg:#f1f5f9;--tbl-htxt:#1e293b;--tbl-border:#d1dae8;--tbl-hover:#eff6ff;--tbl-stripe:#f8fafc;--shadow-sm:0 1px 3px rgba(0,0,0,.06);--mono:'Consolas','Monaco','Courier New',monospace;--font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--tr:.25s ease}`,
    `[data-theme="dark"]{--accent:#4d8aff;--accent-light:rgba(77,138,255,.12);--sb:var(--surface2);--sb-nav:#8b949e;--sb-nav-hbg:var(--surface3);--sb-sec:#6e7681;--sb-active-bg:rgba(77,138,255,.1);--sb-active-txt:var(--accent);--bg:#0d1117;--surface:#161b22;--surface2:#21262d;--surface3:#30363d;--border:#30363d;--border2:#484f58;--text:#e6edf3;--text2:#8b949e;--text3:#6e7681;--tbl-hbg:#21262d;--tbl-htxt:#c9d1d9;--tbl-border:#30363d;--tbl-hover:#1c2128;--tbl-stripe:#161b22;--shadow-sm:0 1px 3px rgba(0,0,0,.3)}`,
    'html,body{height:100%;font-family:var(--font);background:var(--bg);color:var(--text);overflow-x:hidden}',
    'body{display:flex;flex-direction:column;height:100vh;overflow:hidden;transition:background var(--tr),color var(--tr)}',
    '.ws-header{height:52px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;transition:background var(--tr),border-color var(--tr)}',
    '.ws-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:var(--accent)}',
    '.ws-logo-box{width:30px;height:30px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px}',
    '.ws-spacer{flex:1}',
    '.ws-search{padding:7px 11px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:var(--surface2);color:var(--text);outline:none;font-family:var(--font);width:200px;transition:all var(--tr)}',
    '.ws-search:focus{border-color:var(--accent)}',
    '.ws-theme-btn{width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer;font-size:16px;transition:.15s;flex-shrink:0}',
    '.ws-theme-btn:hover{background:var(--surface3);color:var(--text)}',
    '.ws-sb-toggle-btn{width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);cursor:pointer;font-size:18px;transition:.15s;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1}',
    '.ws-sb-toggle-btn:hover{background:var(--surface3);color:var(--text)}',
    '.ws-layout{display:flex;flex:1;overflow:hidden}',
    '.ws-sidebar{width:260px;min-width:60px;max-width:520px;background:var(--sb);overflow-y:auto;overflow-x:hidden;padding:14px 0;flex-shrink:0;position:relative;transition:background var(--tr),width .22s cubic-bezier(.4,0,.2,1)}',
    '.ws-sidebar.collapsed{width:0!important;min-width:0!important;overflow:hidden;padding:0;border-right:none}',
    '.ws-sidebar::-webkit-scrollbar{width:3px}',
    '.ws-sidebar::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}',
    '.ws-sb-resizer{width:5px;flex-shrink:0;align-self:stretch;cursor:col-resize;background:transparent;transition:background .15s;position:relative;z-index:10}',
    '.ws-sb-resizer::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:3px;height:32px;border-left:1.5px solid rgba(37,99,235,.5);border-right:1.5px solid rgba(37,99,235,.5);border-radius:2px;opacity:0;transition:opacity .15s}',
    '.ws-sb-resizer:hover::after,.ws-sb-resizer.dragging::after{opacity:1}',
    '.ws-sb-resizer:hover,.ws-sb-resizer.dragging{background:rgba(37,99,235,.35)}',
    '.ws-sb-resizer.hidden{display:none}',
    '.ws-section{margin-bottom:4px}',
    '.ws-sec-title{padding:6px 16px;font-size:10px;font-weight:600;color:var(--sb-sec);text-transform:uppercase;letter-spacing:.8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;transition:color var(--tr)}',
    '.ws-space-hdr{display:flex;align-items:center;gap:10px;padding:14px 12px 12px;flex-shrink:0}',
    '.ws-space-icon{width:32px;height:32px;border-radius:7px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}',
    '.ws-space-name{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ws-pnav{display:flex;flex-direction:column;gap:1px;padding:4px 8px}',
    '.ws-pnav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--sb-nav);transition:background .12s;user-select:none}',
    '.ws-pnav-item:hover{background:var(--sb-nav-hbg)}',
    '.ws-pnav-item.active{background:var(--sb-active-bg);color:var(--accent);font-weight:500}',
    '.ws-pnav-item i{font-size:15px;flex-shrink:0}',
    '.ws-sb-panel{flex:1;overflow-y:auto;padding:4px 0}',
    '.ws-sb-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px 16px;color:var(--text3);font-size:12px;text-align:center}',
    '.ws-sb-empty i{font-size:24px;opacity:.4}',
    '.ws-sec-grp{margin-bottom:4px}',
    '.ws-sec-lbl{display:flex;align-items:center;gap:6px;padding:5px 12px;font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px}',
    '.ws-nav-item{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 16px;cursor:pointer;color:var(--sb-nav);font-size:13px;border-left:2px solid transparent;transition:.12s;border-radius:0 5px 5px 0;margin-right:6px;position:relative}',
    '.ws-nav-item:hover{background:var(--sb-nav-hbg);color:var(--text)}',
    '.ws-nav-item.active{background:var(--sb-active-bg);color:var(--sb-active-txt);border-left-color:var(--accent);font-weight:500}',
    '.ws-nav-icon{font-size:13px;flex-shrink:0;color:var(--text3)}',
    '.ws-nav-title{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.ws-star-btn{display:none;background:transparent;border:none;cursor:pointer;font-size:14px;color:var(--text3);padding:0 2px;line-height:1;transition:.12s;flex-shrink:0}',
    '.ws-nav-item:hover .ws-star-btn{display:block}',
    '.ws-star-btn.starred{display:block;color:#f59e0b}',
    '.ws-nav-item.active .ws-star-btn{display:block}',
    '.ws-main{flex:1;overflow-y:auto;overflow-x:hidden;background:var(--bg);transition:background var(--tr)}',
    '.ws-doc{padding:40px 32px}',
    '.ws-doc-title{font-size:28px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:-.3px;line-height:1.2;transition:color var(--tr)}',
    '.ws-doc-meta{display:flex;gap:14px;font-size:12px;color:var(--text2);margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);flex-wrap:wrap;transition:all var(--tr)}',
    '.ws-canvas-wrap{border-radius:4px;min-height:40px}',
    '.ws-canvas{position:relative;padding:40px 52px;font-family:var(--font);background:var(--bg);transform-origin:top left;transition:background var(--tr)}',
    '.ws-canvas .editor-content{font-size:.875rem;line-height:1.75;color:var(--text);word-wrap:break-word;overflow-wrap:break-word;min-height:120px}',
    '.ws-canvas .editor-content *{max-width:100%;box-sizing:border-box}',
    '.ws-canvas .editor-content p{margin-bottom:12px}',
    '.ws-canvas .editor-content h1{font-size:1.5rem;font-weight:600;margin:24px 0 10px}',
    '.ws-canvas .editor-content h2{font-size:1.25rem;font-weight:600;margin:20px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--border)}',
    '.ws-canvas .editor-content h3{font-size:1rem;font-weight:600;margin:16px 0 7px}',
    '.ws-canvas .editor-content h4,.ws-canvas .editor-content h5,.ws-canvas .editor-content h6{font-size:.875rem;font-weight:600;margin:14px 0 6px}',
    '.ws-canvas .editor-content ul,.ws-canvas .editor-content ol{padding-left:24px;margin-bottom:12px}',
    '.ws-canvas .editor-content li{margin-bottom:4px}',
    '.ws-canvas .editor-content a{color:var(--accent);text-decoration:underline}',
    '.ws-canvas .editor-content pre{background:#0f172a;color:#a5f3c4;border-radius:10px;padding:16px 20px;font-size:13px;overflow-x:auto;font-family:var(--mono);line-height:1.65;white-space:pre-wrap;word-break:break-all;margin:14px 0}',
    '.ws-canvas .editor-content blockquote{border-left:3px solid var(--accent);background:var(--accent-light);padding:11px 18px;border-radius:0 8px 8px 0;color:var(--text2);font-style:italic;margin:14px 0}',
    '.ws-canvas .editor-content code{background:var(--surface2);border-radius:4px;padding:1px 6px;font-family:var(--mono);font-size:.85em}',
    '.ws-canvas .editor-content img{max-width:100%;height:auto;border-radius:8px;display:block;margin:10px 0}',
    '.ws-canvas .editor-content .tbl-outer{display:block;margin:14px 0;width:100%;overflow-x:auto;overflow-y:visible}',
    '.ws-canvas .editor-content table{border-collapse:collapse;width:max-content;max-width:none;min-width:100%;font-size:.875rem;table-layout:fixed !important;word-break:break-word;border:1px solid var(--tbl-border)}',
    '.ws-canvas .editor-content th{border:1px solid var(--tbl-border);padding:9px 14px;background:var(--tbl-hbg);font-weight:600;text-align:left;color:var(--tbl-htxt);transition:all var(--tr)}',
    '.ws-canvas .editor-content td{border:1px solid var(--tbl-border);padding:9px 14px;background:var(--surface);color:var(--text);transition:all var(--tr);position:relative;vertical-align:middle;word-break:break-word}',
    '.ws-canvas .editor-content tr:nth-child(even) td{background:var(--tbl-stripe)}',
    '.ws-canvas .editor-content td.tbl-inner-container{padding:0!important;overflow:visible!important;vertical-align:top;background:transparent}',
    '.ws-canvas .editor-content .tbl-inner-row{width:100%;table-layout:fixed;border-collapse:collapse;border:none;margin:0;background:transparent;display:table}',
    '.ws-canvas .editor-content .tbl-inner-row td{padding:9px 14px;border-right:1px solid var(--tbl-border);border-top:none;border-bottom:none;border-left:none;position:relative;vertical-align:top;word-break:break-word}',
    '.ws-canvas .editor-content .tbl-inner-row td:last-child{border-right:none}',
    '.ws-canvas .editor-content tr:hover td,.ws-canvas .editor-content tr:hover th{background:var(--tbl-hover)}',
    '.ws-canvas .editor-content td.tbl-has-img,.ws-canvas .editor-content th.tbl-has-img{padding:0;overflow:hidden;text-align:center;vertical-align:middle;line-height:0}',
    '.ws-canvas .editor-content td.tbl-has-img img,.ws-canvas .editor-content th.tbl-has-img img{width:100%;height:auto;display:block;object-fit:cover;margin:0}',
    '.ws-canvas .editor-content td img,.ws-canvas .editor-content th img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;margin:0 auto;border-radius:5px}',
    '.tbl-cell-car{display:flex;flex-direction:column;width:100%;height:100%;min-height:100px;border-radius:4px;overflow:hidden}',
    '.tbl-cell-car .tcc-stage{position:relative;flex:1;overflow:hidden;cursor:pointer;min-height:0}',
    '.tbl-cell-car .tcc-inner{display:flex;height:100%;transition:transform .3s}',
    '.tbl-cell-car .tcc-slide{min-width:100%;height:100%;display:flex;align-items:center;justify-content:center}',
    '.tbl-cell-car .tcc-slide img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;margin:auto}',
    '.tbl-cell-car .tcc-btn{position:absolute;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.5);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;z-index:5;padding:0;line-height:1}',
    '.tbl-cell-car .tcc-btn.prev{left:4px}.tbl-cell-car .tcc-btn.next{right:4px}',
    '.tbl-cell-car .tcc-btn:disabled{opacity:0;pointer-events:none}',
    '.tbl-cell-car .tcc-badge{position:absolute;top:4px;right:5px;background:rgba(0,0,0,.55);color:#fff;font-size:9px;font-family:var(--mono);padding:1px 6px;border-radius:8px;z-index:5}',
    '.tbl-cell-car .tcc-thumbs{display:flex;gap:3px;padding:4px 5px;background:#111827;overflow-x:auto;scrollbar-width:none;flex-shrink:0}',
    '.tbl-cell-car .tcc-thumbs::-webkit-scrollbar{display:none}',
    '.tbl-cell-car .tcc-thumb{flex-shrink:0;width:36px;height:30px;border-radius:3px;overflow:hidden;cursor:pointer;border:1.5px solid transparent;opacity:.5}',
    '.tbl-cell-car .tcc-thumb.on{opacity:1;border-color:var(--accent)}',
    '.tbl-cell-car .tcc-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '.ws-fm-car{position:relative;width:100%;height:100%;overflow:hidden}',
    '.ws-fm-inner{display:flex;height:100%;transition:transform .35s}',
    '.ws-fm-slide{min-width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.ws-fm-slide img{width:100%;height:100%;object-fit:contain;display:block;cursor:zoom-in}',
    '.ws-fm-btn{position:absolute;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-size:18px;z-index:5;padding:0;line-height:1}',
    '.ws-fm-btn.prev{left:6px}.ws-fm-btn.next{right:6px}',
    '.ws-fm-badge{position:absolute;top:5px;right:7px;background:rgba(0,0,0,.55);color:#fff;font-size:9px;font-family:var(--mono);padding:1px 6px;border-radius:8px;z-index:5}',
    '.ws-canvas .cf-column-layout{display:flex;align-items:stretch;width:100%;margin:16px 0;position:relative;min-height:60px;gap:0;border:1.5px dashed var(--border)!important;border-radius:4px}',
    '.ws-canvas .cf-column-item{flex:1;min-height:60px;padding:20px;font-size:1rem;line-height:1.8;color:var(--text);word-break:break-word;background:var(--surface)!important;outline:none!important;border-radius:4px}',
    '.ws-canvas .cf-col-sep-line{width:10px;background:transparent;flex-shrink:0;cursor:default;position:relative;display:flex;align-items:center;justify-content:center}',
    '.ws-canvas .cf-col-sep-line::after{content:"";position:absolute;top:16px;bottom:16px;width:2px;background:var(--border2);border-radius:2px;opacity:1}',
    '.ws-canvas .cf-panel{display:flex;gap:12px;padding:14px 16px;border-radius:8px;margin:12px 0;border-left:4px solid;position:relative}',
    '.ws-canvas .cf-panel.info{background:rgba(37,99,235,.07);border-color:#3b82f6}',
    '.ws-canvas .cf-panel.success{background:rgba(34,197,94,.07);border-color:#22c55e}',
    '.ws-canvas .cf-panel.warning{background:rgba(245,158,11,.08);border-color:#f59e0b}',
    '.ws-canvas .cf-panel.error{background:rgba(239,68,68,.07);border-color:#ef4444}',
    '.ws-canvas .cf-panel.note{background:rgba(168,85,247,.07);border-color:#a855f7}',
    '.ws-canvas .cf-panel-icon{font-size:18px;flex-shrink:0;line-height:1.6;user-select:none}',
    '.ws-canvas .cf-panel-content{flex:1;min-width:0;font-size:1rem;line-height:1.75;color:var(--text)}',
    '.ws-canvas .cf-img-block{display:block;margin:16px 0;position:relative;user-select:none}',
    '.ws-canvas .cf-img-wrap{position:relative;display:flex;width:100%}',
    '.ws-canvas .cf-img-block[data-align="left"] .cf-img-wrap{justify-content:flex-start}',
    '.ws-canvas .cf-img-block[data-align="center"] .cf-img-wrap{justify-content:center}',
    '.ws-canvas .cf-img-block[data-align="right"] .cf-img-wrap{justify-content:flex-end}',
    '.ws-canvas .cf-img-inner{position:relative;display:inline-block;max-width:100%;border-radius:4px;overflow:hidden;line-height:0}',
    '.ws-canvas .cf-img-inner img,.ws-canvas .cf-img-inner video{display:block;max-width:100%;height:auto;border-radius:4px;cursor:zoom-in}',
    '.ws-canvas .cf-img-caption{display:block;text-align:center;font-size:12.5px;color:var(--text3);padding:6px 8px;min-height:20px}',
    '.ws-canvas .cf-img-caption:empty{display:none}',
    '.ws-canvas .cf-carousel-block{display:block;margin:16px 0;border-radius:10px;overflow:hidden;background:#111827;position:relative}',
    '.ws-canvas .cf-carousel-stage{position:relative;width:100%;overflow:hidden}',
    '.ws-canvas .cf-carousel-slides{display:flex;transition:transform .35s ease;will-change:transform}',
    '.ws-canvas .cf-carousel-slide{min-width:100%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#000;min-height:200px}',
    '.ws-canvas .cf-carousel-slide img,.ws-canvas .cf-carousel-slide video{max-width:100%;max-height:520px;object-fit:contain;display:block}',
    '.ws-canvas .cf-car-arrow{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;background:rgba(0,0,0,.5);border:none;border-radius:50%;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10}',
    '.ws-canvas .cf-car-arrow.left{left:10px}.ws-canvas .cf-car-arrow.right{right:10px}',
    '.ws-canvas .cf-car-wrap{position:relative;overflow:hidden;border-radius:10px;line-height:0}',
    '.ws-canvas .cf-car-track{display:flex;transition:transform .35s cubic-bezier(.4,0,.2,1)}',
    '.ws-canvas .cf-car-slide{min-width:100%;position:relative;line-height:0}',
    '.ws-canvas .cf-car-slide img{width:100%;max-height:520px;object-fit:contain;display:block;background:#000}',
    '.ws-canvas .cf-car-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;width:38px;height:38px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10}',
    '.ws-canvas .cf-car-btn.prev{left:12px}.ws-canvas .cf-car-btn.next{right:12px}',
    '.ws-canvas .cf-car-dots{display:flex;justify-content:center;gap:6px;padding:8px}',
    '.ws-canvas .cf-car-dot{width:7px;height:7px;border-radius:50%;background:var(--border2);cursor:pointer;border:none;padding:0;transition:.15s}',
    '.ws-canvas .cf-car-dot.active,.ws-canvas .cf-car-dot.on{background:var(--accent);transform:scale(1.3)}',
    '.ws-canvas .cf-car-counter{position:absolute;top:10px;right:12px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;z-index:10}',
    '.ws-canvas .cf-car-caption{padding:6px 12px 8px;font-size:12.5px;color:var(--text3);text-align:center}',
    '.ws-canvas .editor-content hr.cf-divider{border:none;border-top:2px solid var(--border);margin:16px 0;display:block}',
    '.ws-canvas .cf-embed-block{display:block;margin:16px 0;position:relative}',
    '.ws-canvas .cf-embed-wrap{position:relative;width:100%;background:#000;border-radius:10px;overflow:hidden}',
    '.ws-canvas .cf-embed-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none;display:block}',
    '.ws-canvas .cf-embed-caption{text-align:center;font-size:12.5px;color:var(--text3);padding:6px 8px}',
    '.ws-canvas .cf-embed-caption:empty{display:none}',
    '[data-theme="dark"] .ws-canvas .editor-content pre{background:#0d1117;border:1px solid var(--border)}',
    '[data-theme="dark"] .ws-canvas .editor-content blockquote{background:rgba(77,138,255,.08)}',
    '[data-theme="dark"] .ws-canvas .cf-panel.info{background:rgba(77,138,255,.09)}',
    '.lb{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.93);align-items:center;justify-content:center;flex-direction:column}',
    '.lb.on{display:flex}',
    '.lb-img{max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px}',
    '.lb-vid{max-width:90vw;max-height:85vh;border-radius:8px;background:#000}',
    '.lb-x{position:absolute;top:16px;right:20px;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:22px;cursor:pointer;border-radius:8px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;transition:.15s}',
    '.lb-x:hover{background:rgba(255,255,255,.25)}',
    '.ws-no{text-align:center;padding:60px 20px;color:var(--text3)}',
  ].join('\n');

  // Fetch app CSS (variables + layout + components) for editor-content styles
  const appCss=await _fetchAppCss();

  // ── Phase 5: Viewer JS — fetch runtime + inject dynamic data ─
  const tm=JSON.stringify(typeof TEXT_MATRIX!=='undefined'?TEXT_MATRIX:[]);
  const hl=JSON.stringify(typeof HL_MATRIX!=='undefined'?HL_MATRIX:[]);
  const viewerRuntime=await _fetchViewerRuntime();

  // Dynamic data script (must come before runtime)
  const dataScript='<script>\nvar _cur=null,_wsTM='+tm+',_wsHL='+hl+';\nvar _WS_DOCS='+docIndexJSON+';\n'+'<'+'/script>';
  // Runtime script (fetched from js/viewer-runtime.js — update there to update all exports)
  const runtimeScript='<script>\n'+viewerRuntime+'\n'+'<'+'/script>';
  // Init calls (must come after runtime)
  const initScript='<script>\nwsSbMode("pages");\nshowDoc('+JSON.stringify(firstId)+');\n'+'<'+'/script>';

  const jsTag=dataScript+'\n'+runtimeScript+'\n'+initScript;


  // ── Phase 6: Build HTML ────────────────────────────────────
  const htmlParts=[
    '<!DOCTYPE html>',
    '<html lang="vi"'+(exportDark?' data-theme="dark"':'')+'>',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>'+escH(title)+'</title>',
    '<style>'+shellCss+'\n'+appCss+'</style>',
    '</head>',
    '<body>',
    '<div class="ws-header">',
    '<button class="ws-sb-toggle-btn" id="wsSbToggle" title="Thu/mở sidebar">&#9776;</button>',
    '<div class="ws-logo"><div class="ws-logo-box">&#128218;</div>'+escH(title)+'</div>',
    '<span style="font-size:13px;color:var(--text2)">'+escH(state.projectName||'')+'</span>',
    '<div class="ws-spacer"></div>',
    '<input class="ws-search" id="wsSearch" type="text" placeholder="Tìm kiếm...">',
    '<span id="wsDocCount" style="font-size:12px;color:var(--text2)">'+docs.length+' tài liệu</span>',
    '<button class="ws-theme-btn" id="wsThemeBtn">&#9728;</button>',
    '</div>',
    '<div id="wsSbOverlay" class="ws-sb-overlay"></div>',
    '<div class="ws-layout" id="wsLayout">',
    '<div class="ws-sidebar" id="wsSidebar">'+navHTML+'</div>',
    '<div class="ws-sb-resizer" id="wsSbRz" title="Kéo để thay đổi độ rộng"></div>',
    '<div class="ws-main" id="wsMain">',
    pagesHTML,
    '<div id="wsNoResult" class="ws-no" style="display:none">Không tìm thấy tài liệu.</div>',
    '</div>',
    '</div>',
    jsTag,
    '</body>',
    '</html>'
  ].join('\n');

  // ── Phase 6b: Download ─────────────────────────────────────
  const encoder=new TextEncoder();
  const outBlob=new Blob([encoder.encode(htmlParts)],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(outBlob);
  const a=document.createElement('a');
  a.href=url;a.download=title.replace(/[^a-z0-9À-ɏ\s]/gi,'_').replace(/\s+/g,'-')+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  closeModal('exportWebModal');
  _showExportProgress(0,0,'');
  const fileSizeKb=Math.round(outBlob.size/1024);
  toast('Đã xuất '+docs.length+' tài liệu ('+fileSizeKb+' KB)','success');
  }catch(err){
    console.error('[Publish Web] error:',err);
    _showExportProgress(0,0,'');
    toast('Lỗi xuất: '+err.message,'error');
  }
}
