import { state, _objUrls } from '../core/state.js';
import { _idbGet, _idbSet, _idbDel, _revokeUrl, _compressForExport, persist } from '../core/storage.js';
import { escH } from '../utils/helpers.js';

// _idbPut is the same as _idbSet (alias for legacy calls in this module)
function _idbPut(id, blob) { return _idbSet(id, blob); }

// ── Object URL cache (local LRU — mirrors _cacheUrl logic from index.html) ──
const OBJ_URL_MAX = 80;
const _objUrlOrder = [];
function _cacheUrl(id, url) {
  const existing = _objUrlOrder.indexOf(id);
  if (existing > -1) _objUrlOrder.splice(existing, 1);
  _objUrlOrder.push(id);
  _objUrls[id] = url;
  while (_objUrlOrder.length > OBJ_URL_MAX) {
    const oldest = _objUrlOrder.shift();
    if (_objUrls[oldest]) {
      URL.revokeObjectURL(_objUrls[oldest]);
      delete _objUrls[oldest];
    }
  }
}

// Per rule 6: redeclare as local let and export so assignment works in module scope
export let _hoveredFm = null;     // id of currently hovered fmedia element
export let _hoveredTblImg = null; // <img> element hovered inside a table cell
// Setters for cross-module writes (tables.js, editor.js)
export function setHoveredFm(id){ _hoveredFm = id; }
export function setHoveredTblImg(el){ _hoveredTblImg = el; }

// ─── MEDIA UPLOAD ─────────────────────────────────────────
export function handleFileInput(e){
  const files=Array.from(e.target.files);
  e.target.value='';
  if(!files.length)return;
  // Separate images vs videos/gifs
  const imgs=files.filter(f=>f.type.startsWith('image/')&&!isGif(f));
  const others=files.filter(f=>!imgs.includes(f));
  // Single file: normal fmedia
  if(files.length===1){loadMedia(files[0]);return;}
  // Multiple images only → carousel
  if(imgs.length>=2&&others.length===0){loadCarousel(imgs);return;}
  // Mixed or multiple: each individually
  files.forEach(loadMedia);
}
export function isVideo(f){return f.type.startsWith('video/')||/\.(mp4|webm|ogg|mov)$/i.test(f.name);}
export function isGif(f){return f.type==='image/gif'||/\.gif$/i.test(f.name);}

export async function loadMedia(file){
  if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))return;
  const id=uid();
  const type=isVideo(file)?'video':isGif(file)?'gif':'image';
  // 1. Create Object URL immediately — zero encoding delay
  const objUrl=URL.createObjectURL(file);
  _cacheUrl(id,objUrl);
  // 2. Store raw Blob in IndexedDB asynchronously
  try{ await _idbPut(id,file); }
  catch(e){ toast('Luu media that bai','error'); }
  // 3. Register in doc (no base64 in src — just marker)
  const doc=currentDoc();if(!doc)return;
  if(!doc.images)doc.images=[];
  const media={id,name:file.name||'media',type,size:file.size};
  doc.images.push(media);
  insertMediaInEditor({...media,src:objUrl});
  doc.updatedAt=new Date().toISOString();markDirty();
}
export function loadImage(f){loadMedia(f);}

// ─── IMAGE CAROUSEL (fmedia type) ─────────────────────────

/** Upload multiple image files → store each blob → create carousel fmedia */
export async function loadCarousel(files){
  const doc=currentDoc();if(!doc)return;
  if(!doc.images)doc.images=[];
  const carId=uid();
  const slides=[];
  // 1. Store each image blob in IndexedDB independently (same as fmedia images)
  for(const file of files){
    if(!file.type.startsWith('image/'))continue;
    const sid=uid();
    try{await _idbPut(sid,file);}catch(e){toast('Luu anh that bai','error');continue;}
    slides.push({id:sid,name:file.name||'image',size:file.size});
  }
  if(!slides.length){toast('Khong co anh nao duoc luu','error');return;}
  // 2. Create carousel metadata in doc.images
  const scroll=document.getElementById('editorScroll');
  const editor=document.getElementById('editor');
  const existing=scroll.querySelectorAll('.fmedia').length;
  const x=48+(existing%4)*20;const y=40+existing*20+Math.max(200,editor.offsetHeight*0.1);
  const carData={id:carId,type:'carousel',name:slides.length+' anh',slides};
  doc.images.push(carData);
  // 3. Render carousel element
  createCarouselMedia(carData,x,y,520,340);
  doc.updatedAt=new Date().toISOString();markDirty();
  toast(slides.length+' anh da tao carousel','success');
}

/** Create a floating carousel fmedia element */
export function createCarouselMedia(carData,x,y,w,h){
  const scroll=document.getElementById('editorScroll');
  const fmId='fm_'+carData.id;
  if(document.getElementById(fmId))return document.getElementById(fmId);
  const fm=document.createElement('div');
  fm.className='fmedia';fm.id=fmId;
  fm.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.2)';
  fm.dataset.mediaid=carData.id;fm.dataset.mtype='carousel';fm.dataset.loaded='0';
  // hover/select/drag handled by _fmAttachDrag below
  // Build carousel UI
  fm.innerHTML=`<div class="fmedia-bar">
    <i class="ti ti-grip-horizontal fmedia-ibtn" style="cursor:move;color:#475569" title="Di chuyen"></i>
    <span class="fmedia-bar-label">${escH(carData.name)} · Carousel</span>
    <button class="fmedia-ibtn danger" onclick="fmDelete('${fmId}')" title="Xoa carousel [Del]"><i class="ti ti-trash" style="font-size:12px"></i></button>
  </div>
  <div class="fm-car" id="car_${carData.id}"></div>
  <div class="fmedia-border"></div>
  <div class="fmedia-del-hint">&#9003; Delete</div>
  <div class="fmedia-nw" data-dir="nw"></div><div class="fmedia-ne" data-dir="ne"></div>
  <div class="fmedia-sw" data-dir="sw"></div><div class="fmedia-se" data-dir="se"></div>`;
  // Resize handles
  fm.querySelectorAll('.fmedia-nw,.fmedia-ne,.fmedia-sw,.fmedia-se').forEach(h=>{
    h.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();fmResizeStart(e,fm,h.dataset.dir);});
  });
  // Hover + select
  fm.addEventListener('mouseenter',()=>{_hoveredFm=fmId;});
  fm.addEventListener('mouseleave',()=>{if(_hoveredFm===fmId)_hoveredFm=null;});
  // Smart drag on carousel container (outside carousel stage)
  _fmAttachDrag(fm,fmId,false);
  scroll.appendChild(fm);
  // Build carousel internal UI
  _buildCarouselUI(fm,carData);
  return fm;
}

/** Build carousel UI inside fm-car div, lazy-loading blobs */
function _buildCarouselUI(fm,carData){
  const car=fm.querySelector('.fm-car');if(!car)return;
  const slides=carData.slides||[];const total=slides.length;
  if(!total){car.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#334155;font-size:12px">Khong co anh</div>';return;}
  // Stage
  car.innerHTML='';
  const stage=document.createElement('div');stage.className='fm-car-stage';
  const inner=document.createElement('div');inner.className='fm-car-inner';inner.id='cari_'+carData.id;
  slides.forEach((sl,i)=>{
    const slide=document.createElement('div');slide.className='fm-car-slide';slide.dataset.slid=sl.id;
    // Loading spinner until blob is ready
    slide.innerHTML='<div class="fm-car-loading">&#9696;</div>';
    inner.appendChild(slide);
  });
  stage.appendChild(inner);
  // Controls
  const badge=document.createElement('div');badge.className='fm-car-badge';badge.id='carb_'+carData.id;badge.textContent='1 / '+total;
  const fsBtn=document.createElement('button');fsBtn.className='fm-car-fs';fsBtn.innerHTML='<i class="ti ti-maximize" style="font-size:12px"></i>';fsBtn.onmousedown=e=>e.preventDefault();
  fsBtn.onclick=e=>{e.stopPropagation();_carFullscreen(carData.id,parseInt(fm.dataset.caridx||0));};
  const caption=document.createElement('div');caption.className='fm-car-caption';caption.id='carc_'+carData.id;caption.textContent=slides[0].name||'';
  const prev=document.createElement('button');prev.className='fm-car-btn prev';prev.innerHTML='&#8249;';prev.onmousedown=e=>e.preventDefault();prev.onclick=e=>{e.stopPropagation();_carNav(fm,carData,-1);};
  const next=document.createElement('button');next.className='fm-car-btn next';next.innerHTML='&#8250;';next.onmousedown=e=>e.preventDefault();next.onclick=e=>{e.stopPropagation();_carNav(fm,carData,1);};
  stage.appendChild(badge);stage.appendChild(fsBtn);stage.appendChild(caption);stage.appendChild(prev);stage.appendChild(next);
  car.appendChild(stage);
  // Thumbnail strip
  const thumbs=document.createElement('div');thumbs.className='fm-car-thumbs';thumbs.id='cart_'+carData.id;
  slides.forEach((sl,i)=>{
    const th=document.createElement('div');th.className='fm-car-thumb'+(i===0?' on':'');th.dataset.thi=i;
    th.innerHTML='&#128248;'; // camera emoji placeholder
    th.onmousedown=e=>e.preventDefault();
    th.onclick=e=>{e.stopPropagation();_carGoTo(fm,carData,i);};
    thumbs.appendChild(th);
  });
  car.appendChild(thumbs);
  // Mouse drag for carousel stage
  _carInitDrag(stage,fm,carData);
  // Load first 2 slides immediately + thumbnails
  fm.dataset.caridx='0';
  _carLoadSlide(fm,carData,0,true);
  if(total>1)_carLoadSlide(fm,carData,1,false);
  _carUpdateNav(fm,carData,0);
}

/** Load a single slide's image from IndexedDB */
async function _carLoadSlide(fm,carData,idx,asThumbnail){
  const sl=carData.slides[idx];if(!sl)return;
  const inner=fm.querySelector('.fm-car-inner');if(!inner)return;
  const slide=inner.children[idx];if(!slide||slide.dataset.imgloaded==='1')return;
  let src=_objUrls[sl.id]||'';
  if(!src){
    try{const blob=await _idbGet(sl.id);if(blob){src=URL.createObjectURL(blob);_cacheUrl(sl.id,src);}}
    catch(e){}
  }
  if(!src)return;
  // Set image in slide
  slide.innerHTML='';
  const img=document.createElement('img');img.src=src;img.alt=sl.name||'';img.loading='lazy';
  img.ondragstart=e=>e.preventDefault();
  slide.appendChild(img);slide.dataset.imgloaded='1';
  // Set thumbnail
  if(asThumbnail){
    const th=fm.querySelector('.fm-car-thumb:nth-child('+(idx+1)+')');
    if(th){th.innerHTML='';const ti=document.createElement('img');ti.src=src;ti.loading='lazy';ti.style.pointerEvents='none';th.appendChild(ti);}
  }
}

/** Navigate carousel */
function _carNav(fm,carData,dir){
  const total=carData.slides.length;
  const cur=parseInt(fm.dataset.caridx||0);
  const next=((cur+dir)%total+total)%total;
  _carGoTo(fm,carData,next);
}
function _carGoTo(fm,carData,idx){
  const total=carData.slides.length;
  idx=Math.max(0,Math.min(total-1,idx));
  fm.dataset.caridx=idx;
  // Move inner track
  const inner=fm.querySelector('.fm-car-inner');
  if(inner)inner.style.transform='translateX(-'+idx+'00%)';
  _carUpdateNav(fm,carData,idx);
  // Lazy-load: load this slide + next
  _carLoadSlide(fm,carData,idx,true);
  if(idx+1<total)_carLoadSlide(fm,carData,idx+1,true);
  if(idx>0)_carLoadSlide(fm,carData,idx-1,true);
}
function _carUpdateNav(fm,carData,idx){
  const total=carData.slides.length;
  const badge=document.getElementById('carb_'+carData.id);if(badge)badge.textContent=(idx+1)+' / '+total;
  const caption=document.getElementById('carc_'+carData.id);if(caption)caption.textContent=carData.slides[idx]?.name||'';
  fm.querySelector('.fm-car-btn.prev').disabled=idx===0;
  fm.querySelector('.fm-car-btn.next').disabled=idx===total-1;
  // Thumbnails
  const thumbsEl=document.getElementById('cart_'+carData.id);
  if(thumbsEl){thumbsEl.querySelectorAll('.fm-car-thumb').forEach((th,i)=>th.classList.toggle('on',i===idx));const active=thumbsEl.children[idx];if(active)active.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});}
}
function _carInitDrag(stage,fm,carData){
  let sx=0,dragging=false,moved=false;
  stage.addEventListener('mousedown',e=>{if(e.button!==0)return;sx=e.clientX;dragging=true;moved=false;e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!dragging)return;if(Math.abs(e.clientX-sx)>5)moved=true;});
  document.addEventListener('mouseup',e=>{
    if(!dragging)return;dragging=false;
    if(moved){const d=e.clientX-sx;if(Math.abs(d)>36)_carNav(fm,carData,d<0?1:-1);}
    else{_carFullscreen(carData.id,parseInt(fm.dataset.caridx||0));}
  });
  // Touch
  stage.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;moved=false;},{passive:true});
  stage.addEventListener('touchend',e=>{const d=e.changedTouches[0].clientX-sx;if(Math.abs(d)>36)_carNav(fm,carData,d<0?1:-1);});
  // Keyboard when stage focused
  stage.setAttribute('tabindex','0');
  stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();_carNav(fm,carData,-1);}if(e.key==='ArrowRight'){e.preventDefault();_carNav(fm,carData,1);}});
}
function _carFullscreen(carId,startIdx){
  // Find doc carousel data
  const doc=currentDoc();if(!doc||!doc.images)return;
  const carData=doc.images.find(m=>m.id===carId&&m.type==='carousel');if(!carData)return;
  // Collect loaded src from slides
  const srcs=carData.slides.map(sl=>({src:_objUrls[sl.id]||'',name:sl.name||''})).filter(s=>s.src);
  if(!srcs.length)return;
  lbImages=srcs;lbIndex=Math.min(startIdx,srcs.length-1);lbRender();
  document.getElementById('lightbox').classList.add('on');
  document.body.style.overflow='hidden';
}
// Legacy: called when src is already available (e.g. paste base64 fallback)
export function addMedia(src,name,type='image'){
  const doc=currentDoc();if(!doc)return;
  if(!doc.images)doc.images=[];
  const id=uid();
  const media={id,name:name||'media',type,src};
  doc.images.push(media);
  insertMediaInEditor(media);
  doc.updatedAt=new Date().toISOString();markDirty();
}
export function addImage(src,name){addMedia(src,name,'image');}
export function insertMediaInEditor(media){
  const scroll=document.getElementById('editorScroll');
  const editor=document.getElementById('editor');
  const existing=scroll.querySelectorAll('.fmedia').length;
  const x=48+(existing%4)*20;const y=40+existing*20+Math.max(200,editor.offsetHeight*0.1);
  const w=media.type==='video'?480:320;const h=media.type==='video'?270:220;
  createFloatingMedia(media,x,y,w,h);onContentChange();
}
export function insertImageInEditor(m){insertMediaInEditor(m);}


// ── FMEDIA SHADOW ENGINE ─────────────────────────────────────────
// Shadow color pairs: [light-mode shadow, dark-mode shadow]
export const SHADOW_COLORS=[
  // [light-mode color,           dark-mode color]
  ['rgba(0,0,0,0.20)',      'rgba(200,200,200,0.22)'],  // xám đen ↔ xám trắng (mặc định)
  ['rgba(0,0,0,0.45)',      'rgba(220,220,220,0.38)'],  // xám đen đậm ↔ xám trắng đậm
  ['rgba(37,99,235,0.30)',  'rgba(77,138,255,0.40)'],   // blue
  ['rgba(16,185,129,0.30)', 'rgba(0,212,170,0.40)'],    // teal/green
  ['rgba(239,68,68,0.30)',  'rgba(248,113,113,0.40)'],  // red
  ['rgba(168,85,247,0.30)', 'rgba(192,132,252,0.40)'],  // purple
  ['rgba(245,158,11,0.30)', 'rgba(251,191,36,0.40)'],   // amber
  ['rgba(255,255,255,0.50)','rgba(255,255,255,0.20)'],  // white glow
];

export const FM_SHADOW_PRESETS=[
  {label:'Không',  x:0, y:0, blur:0,  spread:0, colorIdx:0, opacity:0},
  {label:'Nhẹ',    x:0, y:2, blur:8,  spread:0, colorIdx:0, opacity:1},
  {label:'Vừa',    x:0, y:4, blur:16, spread:0, colorIdx:0, opacity:1},
  {label:'Mạnh',   x:0, y:8, blur:24, spread:2, colorIdx:1, opacity:1},
  {label:'Nổi',    x:4, y:4, blur:20, spread:2, colorIdx:0, opacity:1},
  {label:'Phát sáng',x:0,y:0,blur:20, spread:6, colorIdx:2, opacity:1},
];

let _fmShadowId=null,_fmShadowTrigger=null;
let _fmShadowState={}; // fmId → {x,y,blur,spread,colorIdx,opacity}

// Shadow for images inside table cells — uses same panel as fmedia
let _tblShadowImg=null; // current <img> being edited

export function tblImgOpenShadowPanel(imgEl,triggerEl){
  const panel=document.getElementById('fmShadowPanel');if(!panel)return;
  // Use img's dataset as key for shadow state
  if(!imgEl.dataset.shadowkey)imgEl.dataset.shadowkey='tblimg_'+Math.random().toString(36).slice(2);
  const key=imgEl.dataset.shadowkey;
  if(_tblShadowImg===imgEl&&panel.classList.contains('on')){fmCloseShadowPanel();return;}
  fmCloseShadowPanel();
  _tblShadowImg=imgEl;_fmShadowId='__tblimg__';_fmShadowTrigger=triggerEl;
  triggerEl.style.background='rgba(37,99,235,.7)';
  const state=_fmShadowState[key]||{x:0,y:4,blur:12,spread:0,colorIdx:0,opacity:1};
  // Build panel but wire apply to the img element
  _fmBuildShadowPanelForTarget(panel,key,state,imgEl);
  panel.style.visibility='hidden';panel.classList.add('on');
  const rect=triggerEl.getBoundingClientRect();
  const pw=panel.offsetWidth||244,ph=panel.offsetHeight||320;
  let left=rect.left-(pw/2),top=rect.bottom+6;
  if(left+pw>window.innerWidth-8)left=window.innerWidth-pw-8;
  if(left<8)left=8;if(top+ph>window.innerHeight-8)top=rect.top-ph-6;
  panel.style.left=left+'px';panel.style.top=top+'px';panel.style.visibility='';
}

// Generic shadow panel builder that applies to any element
function _fmBuildShadowPanelForTarget(panel,key,state,target){
  const dark=_isDarkMode();
  panel.innerHTML='';
  const hdr=document.createElement('h4');
  hdr.innerHTML='<span>Bóng đổ hình</span>';
  const closeBtn=document.createElement('button');closeBtn.textContent='✕';
  closeBtn.onclick=fmCloseShadowPanel;hdr.appendChild(closeBtn);panel.appendChild(hdr);

  // Presets
  const presetsEl=document.createElement('div');presetsEl.className='fm-shadow-presets';
  FM_SHADOW_PRESETS.forEach(preset=>{
    const btn=document.createElement('button');btn.className='fm-shadow-preset';btn.textContent=preset.label;
    btn.onmousedown=e=>e.preventDefault();
    btn.onclick=()=>{
      Object.assign(state,preset);_fmShadowState[key]={...state};
      _applyImgShadow(target,state,dark);
      _fmBuildShadowPanelForTarget(panel,key,state,target);
    };
    presetsEl.appendChild(btn);
  });
  panel.appendChild(presetsEl);

  // Sliders
  const sliders=[
    {key:'x',label:'X',min:-40,max:40,val:state.x},
    {key:'y',label:'Y',min:-40,max:40,val:state.y},
    {key:'blur',label:'Blur',min:0,max:60,val:state.blur},
    {key:'spread',label:'Lan',min:-10,max:30,val:state.spread},
    {key:'opacity',label:'Độ',min:0,max:1,step:.05,val:state.opacity},
  ];
  sliders.forEach(({key:sk,label,min,max,step,val})=>{
    const row=document.createElement('div');row.className='fm-shadow-row';
    const lbl=document.createElement('label');lbl.textContent=label;
    const inp=document.createElement('input');inp.type='range';inp.min=min;inp.max=max;inp.step=step||1;inp.value=val;
    const valEl=document.createElement('span');valEl.textContent=sk==='opacity'?Math.round(val*100)+'%':val;
    inp.oninput=()=>{
      state[sk]=parseFloat(inp.value);
      valEl.textContent=sk==='opacity'?Math.round(state[sk]*100)+'%':state[sk];
      _fmShadowState[key]={...state};_applyImgShadow(target,state,dark);
    };
    row.appendChild(lbl);row.appendChild(inp);row.appendChild(valEl);panel.appendChild(row);
  });

  // Color
  const colLbl=document.createElement('div');colLbl.style.cssText='font-size:10px;color:#475569;margin-bottom:5px;margin-top:8px;padding-top:8px;border-top:1px solid #1e293b';colLbl.textContent='Màu bóng';panel.appendChild(colLbl);
  const colGrid=document.createElement('div');colGrid.className='fm-shadow-colors';
  SHADOW_COLORS.forEach(([lc,dc],ci)=>{
    const sw=document.createElement('div');sw.className='fm-shadow-swatch';
    sw.style.background=dark?dc:lc;if(ci===state.colorIdx)sw.classList.add('active');
    sw.onmousedown=e=>e.preventDefault();
    sw.onclick=()=>{state.colorIdx=ci;_fmShadowState[key]={...state};_applyImgShadow(target,state,dark);colGrid.querySelectorAll('.fm-shadow-swatch').forEach((s,i)=>s.classList.toggle('active',i===ci));};
    colGrid.appendChild(sw);
  });
  panel.appendChild(colGrid);

  // Reset
  const resetBtn=document.createElement('button');
  resetBtn.style.cssText='margin-top:8px;width:100%;padding:5px;border:1px dashed #334155;border-radius:5px;background:transparent;color:#64748b;cursor:pointer;font-size:11px;font-family:var(--font);transition:.12s';
  resetBtn.textContent='✕ Xóa bóng đổ';
  resetBtn.onmouseenter=()=>{resetBtn.style.borderColor='#ef4444';resetBtn.style.color='#f87171';};
  resetBtn.onmouseleave=()=>{resetBtn.style.borderColor='#334155';resetBtn.style.color='#64748b';};
  resetBtn.onmousedown=e=>e.preventDefault();
  resetBtn.onclick=()=>{const clear={x:0,y:0,blur:0,spread:0,colorIdx:0,opacity:0};_fmShadowState[key]=clear;_applyImgShadow(target,clear,dark);fmCloseShadowPanel();};
  panel.appendChild(resetBtn);
}

// Apply shadow to <img> element using filter:drop-shadow (follows image shape)
function _applyImgShadow(imgEl,state,dark){
  if(!state||state.opacity===0){imgEl.style.filter='';delete imgEl.dataset.shadowLight;delete imgEl.dataset.shadowDark;delete imgEl.dataset.shadowXyb;return;}
  const [lc,dc]=SHADOW_COLORS[state.colorIdx]||SHADOW_COLORS[0];
  const color=(dark?dc:lc).replace(/[\d.]+\)$/,state.opacity+')');
  // Use filter:drop-shadow for better visual (follows PNG transparency)
  imgEl.style.filter=`drop-shadow(${state.x}px ${state.y}px ${state.blur}px ${color})`;
  // Save for dark mode swap
  imgEl.dataset.shadowLight=(lc).replace(/[\d.]+\)$/,state.opacity+')');
  imgEl.dataset.shadowDark=(dc).replace(/[\d.]+\)$/,state.opacity+')');
  imgEl.dataset.shadowXyb=`drop-shadow(${state.x}px ${state.y}px ${state.blur}px`;
  onContentChange();
}

export function fmOpenShadowPanel(fmId,triggerEl){
  const panel=document.getElementById('fmShadowPanel');if(!panel)return;
  if(_fmShadowId===fmId&&panel.classList.contains('on')){fmCloseShadowPanel();return;}
  fmCloseShadowPanel();
  _fmShadowId=fmId;_fmShadowTrigger=triggerEl;
  triggerEl.style.background='rgba(37,99,235,.3)';

  const state=_fmShadowState[fmId]||{x:0,y:4,blur:12,spread:0,colorIdx:0,opacity:1};
  _fmBuildShadowPanel(panel,fmId,state);

  panel.style.visibility='hidden';panel.classList.add('on');
  const rect=triggerEl.getBoundingClientRect();
  const pw=panel.offsetWidth||244,ph=panel.offsetHeight||320;
  let left=rect.left-(pw/2),top=rect.bottom+6;
  if(left+pw>window.innerWidth-8)left=window.innerWidth-pw-8;
  if(left<8)left=8;
  if(top+ph>window.innerHeight-8)top=rect.top-ph-6;
  panel.style.left=left+'px';panel.style.top=top+'px';panel.style.visibility='';
}

export function fmCloseShadowPanel(){
  const panel=document.getElementById('fmShadowPanel');
  if(panel)panel.classList.remove('on');
  if(_fmShadowTrigger)_fmShadowTrigger.style.background='';
  _fmShadowId=null;_fmShadowTrigger=null;
}

function _fmBuildShadowPanel(panel,fmId,state){
  const dark=_isDarkMode();
  panel.innerHTML='';

  // Header
  const hdr=document.createElement('h4');
  hdr.innerHTML='<span>Bóng đổ</span>';
  const closeBtn=document.createElement('button');closeBtn.textContent='✕';
  closeBtn.onclick=fmCloseShadowPanel;hdr.appendChild(closeBtn);
  panel.appendChild(hdr);

  // Presets
  const presetsEl=document.createElement('div');presetsEl.className='fm-shadow-presets';
  FM_SHADOW_PRESETS.forEach((preset,pi)=>{
    const btn=document.createElement('button');btn.className='fm-shadow-preset';
    btn.textContent=preset.label;
    btn.onmousedown=e=>e.preventDefault();
    btn.onclick=()=>{
      Object.assign(state,preset);
      _fmShadowState[fmId]={...state};
      _fmApplyShadow(fmId,state,dark);
      _fmBuildShadowPanel(panel,fmId,state); // rebuild to sync sliders
    };
    presetsEl.appendChild(btn);
  });
  panel.appendChild(presetsEl);

  // Sliders
  const sliders=[
    {key:'x',    label:'X',     min:-40,max:40,  val:state.x},
    {key:'y',    label:'Y',     min:-40,max:40,  val:state.y},
    {key:'blur', label:'Blur',  min:0,  max:60,  val:state.blur},
    {key:'spread',label:'Lan',  min:-10,max:30,  val:state.spread},
    {key:'opacity',label:'Độ',  min:0,  max:1, step:.05, val:state.opacity},
  ];
  sliders.forEach(({key,label,min,max,step,val})=>{
    const row=document.createElement('div');row.className='fm-shadow-row';
    const lbl=document.createElement('label');lbl.textContent=label;
    const inp=document.createElement('input');inp.type='range';
    inp.min=min;inp.max=max;inp.step=step||1;inp.value=val;
    const valEl=document.createElement('span');valEl.textContent=key==='opacity'?Math.round(val*100)+'%':val;
    inp.oninput=()=>{
      state[key]=parseFloat(inp.value);
      valEl.textContent=key==='opacity'?Math.round(state[key]*100)+'%':state[key];
      _fmShadowState[fmId]={...state};
      _fmApplyShadow(fmId,state,dark);
    };
    row.appendChild(lbl);row.appendChild(inp);row.appendChild(valEl);
    panel.appendChild(row);
  });

  // Color swatches
  const colLbl=document.createElement('div');
  colLbl.style.cssText='font-size:10px;color:#475569;margin-bottom:5px;margin-top:8px;padding-top:8px;border-top:1px solid #1e293b';
  colLbl.textContent='Màu bóng';panel.appendChild(colLbl);

  const colGrid=document.createElement('div');colGrid.className='fm-shadow-colors';
  SHADOW_COLORS.forEach(([lc,dc],ci)=>{
    const color=dark?dc:lc;
    const sw=document.createElement('div');sw.className='fm-shadow-swatch';
    sw.style.background=color;sw.title=color;
    if(ci===state.colorIdx)sw.classList.add('active');
    sw.onmousedown=e=>e.preventDefault();
    sw.onclick=()=>{
      state.colorIdx=ci;
      _fmShadowState[fmId]={...state};
      _fmApplyShadow(fmId,state,dark);
      colGrid.querySelectorAll('.fm-shadow-swatch').forEach((s,i)=>s.classList.toggle('active',i===ci));
    };
    colGrid.appendChild(sw);
  });
  panel.appendChild(colGrid);

  // Reset button
  const resetBtn=document.createElement('button');
  resetBtn.style.cssText='margin-top:8px;width:100%;padding:5px;border:1px dashed #334155;border-radius:5px;background:transparent;color:#64748b;cursor:pointer;font-size:11px;font-family:var(--font);transition:.12s';
  resetBtn.textContent='✕ Xóa bóng đổ';
  resetBtn.onmouseenter=()=>{resetBtn.style.borderColor='#ef4444';resetBtn.style.color='#f87171';};
  resetBtn.onmouseleave=()=>{resetBtn.style.borderColor='#334155';resetBtn.style.color='#64748b';};
  resetBtn.onmousedown=e=>e.preventDefault();
  resetBtn.onclick=()=>{
    const clear={x:0,y:0,blur:0,spread:0,colorIdx:0,opacity:0};
    _fmShadowState[fmId]=clear;
    _fmApplyShadow(fmId,clear,dark);
    fmCloseShadowPanel();
  };
  panel.appendChild(resetBtn);
}

// Apply shadow to fmedia element
function _fmApplyShadow(fmId,state,dark){
  const fm=document.getElementById(fmId);if(!fm)return;
  if(!state||state.opacity===0){fm.style.boxShadow='none';fm.style.filter='';return;}
  const [lc,dc]=SHADOW_COLORS[state.colorIdx]||SHADOW_COLORS[0];
  const color=dark?dc:lc;
  // Blend opacity into the color value
  const shadowColor=color.replace(/[\d.]+\)$/,state.opacity+')');
  fm.style.boxShadow=`${state.x}px ${state.y}px ${state.blur}px ${state.spread}px ${shadowColor}`;
  // Store dark/light for theme swap
  fm.dataset.shadowLightColor=(SHADOW_COLORS[state.colorIdx]||SHADOW_COLORS[0])[0].replace(/[\d.]+\)$/,state.opacity+')');
  fm.dataset.shadowDarkColor= (SHADOW_COLORS[state.colorIdx]||SHADOW_COLORS[0])[1].replace(/[\d.]+\)$/,state.opacity+')');
  fm.dataset.shadowXyb=`${state.x}px ${state.y}px ${state.blur}px ${state.spread}px`;
  // Persist to doc.images
  const doc=currentDoc();if(!doc||!doc.images)return;
  const media=doc.images.find(m=>m.id===fm.dataset.mediaid);
  if(media)media.shadow=state;
  markDirty();
}

// Close shadow panel on outside click
document.addEventListener('mousedown',e=>{
  if(_fmShadowId&&!e.target.closest('#fmShadowPanel')&&!e.target.closest('.fmedia-ibtn'))
    fmCloseShadowPanel();
});

// FLOATING MEDIA
export function createFloatingMedia(media,x,y,w,h){
  const scroll=document.getElementById('editorScroll');
  const fmId='fm_'+media.id;
  const old=document.getElementById(fmId);if(old)old.remove();
  const fm=document.createElement('div');
  fm.className='fmedia';fm.id=fmId;fm.dataset.mediaid=media.id;fm.dataset.mtype=media.type||'image';
  fm.style.left=x+'px';fm.style.top=y+'px';fm.style.width=w+'px';fm.style.height=h+'px';
  const isVid=media.type==='video';
  const hasSrc=!!(media.src&&media.src.length>0);
  const mediaEl=!hasSrc
    ?`<div class="fmedia-placeholder"><i class="ti ti-photo-off" style="font-size:28px"></i><span>Media khong co san</span></div>`
    :isVid
      ?`<video src="${media.src}" style="width:100%;height:100%;border-radius:8px;display:block;background:#000;object-fit:contain"></video>`
      :`<img src="${media.src}" alt="${escH(media.name)}" style="width:100%;height:100%;border-radius:8px;display:block;object-fit:contain;background:transparent" onload="_fmAutoHeight(this)">`;
  fm.innerHTML=`
    <div class="fmedia-bar">
      <i class="ti ti-grip-horizontal fmedia-ibtn" style="cursor:move;color:#475569" title="Di chuyen"></i>
      <span class="fmedia-bar-label">${escH(media.name)}${media.size?" ("+Math.round(media.size/1024)+"KB)":""}</span>
      ${isVid?`<button class="fmedia-ibtn play" onclick="fmPlayVideo('${fmId}')" title="Xem fullscreen"><i class="ti ti-player-play" style="font-size:12px"></i></button>`:`<button class="fmedia-ibtn" onclick="fmOpenImg('${fmId}')" title="Xem fullscreen"><i class="ti ti-maximize" style="font-size:12px"></i></button>`}
      <button class="fmedia-ibtn" id="shadowBtn_${fmId}" onclick="fmOpenShadowPanel('${fmId}',this)" title="Bóng đổ"><i class="ti ti-shadow" style="font-size:12px"></i></button>
      <button class="fmedia-ibtn danger" onclick="fmDelete('${fmId}')" title="Xoa [Del]"><i class="ti ti-trash" style="font-size:12px"></i></button>
    </div>
    ${mediaEl}
    <div class="fmedia-border"></div>
    <div class="fmedia-del-hint">&#9003; Delete</div>
    <div class="fmedia-nw" data-dir="nw"></div><div class="fmedia-ne" data-dir="ne"></div>
    <div class="fmedia-sw" data-dir="sw"></div><div class="fmedia-se" data-dir="se"></div>`;
  scroll.appendChild(fm);
  // Resize handles
  fm.querySelectorAll('[data-dir]').forEach(h=>{
    h.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();fmResizeStart(e,fm,h.dataset.dir);});
  });
  // Hover + select tracking
  fm.addEventListener('mouseenter',()=>{_hoveredFm=fmId;});
  fm.addEventListener('mouseleave',()=>{if(_hoveredFm===fmId)_hoveredFm=null;});
  // ── Smart whole-element drag (click vs drag threshold) ────
  _fmAttachDrag(fm,fmId,isVid);
  fmExtendEditor(fm);return fm;
}

// ═══════════════════════════════════════════════════════════════
// SNAP ENGINE — Drag & Resize Snapping + Smart Guides (Figma-style)
// Applies to: .fmedia (images/videos) + .txtbox (text boxes)
// ═══════════════════════════════════════════════════════════════
const SNAP_THRESHOLD = 5; // px — snapping sensitivity

/** Compute 6-axis bounding box of an absolutely-positioned element */
function _snapBBox(el) {
  const x1 = el.offsetLeft;
  const y1 = el.offsetTop;
  const w  = el.offsetWidth;
  const h  = el.offsetHeight;
  return { x1, y1, x2: x1+w, y2: y1+h, cx: x1+w/2, cy: y1+h/2, w, h };
}

/** Collect all snappable elements except the one being moved */
export function _snapTargets(excludeId) {
  const els = [];
  document.querySelectorAll('.fmedia, .txtbox').forEach(el => {
    if (el.id !== excludeId) els.push(el);
  });
  return els;
}

/**
 * Core: compare A's axes vs all B's axes.
 * Returns { dx, dy, snappedX, snappedY, guides[] }
 *
 * @param {DOMRect-like} A  — live bbox of dragged element
 * @param {HTMLElement[]} targets — other elements
 * @param {'x'|'y'|'xy'} axes — which axes to snap (for resize only relevant ones)
 */
function _snapCompute(A, targets, axes = 'xy') {
  let bestX = null, bestY = null;
  const guideMap = new Map();

  const axesA_X = [A.x1, A.cx, A.x2];
  const axesA_Y = [A.y1, A.cy, A.y2];

  for (const el of targets) {
    const B = _snapBBox(el);
    const axesB_X = [B.x1, B.cx, B.x2];
    const axesB_Y = [B.y1, B.cy, B.y2];

    // ── X-axis comparisons ──────────────────────────────────
    if (axes !== 'y') {
      for (const aX of axesA_X) {
        for (const bX of axesB_X) {
          const dist = Math.abs(aX - bX);
          if (dist <= SNAP_THRESHOLD) {
            const offset = bX - aX;
            if (bestX === null || dist < Math.abs(bestX.offset)) {
              bestX = { offset, axis: bX };
            }
            const key = 'V' + bX;
            if (!guideMap.has(key)) {
              guideMap.set(key, { type:'vertical', x:bX, y1:Math.min(A.y1,B.y1), y2:Math.max(A.y2,B.y2) });
            } else {
              const g = guideMap.get(key);
              g.y1 = Math.min(g.y1, A.y1, B.y1);
              g.y2 = Math.max(g.y2, A.y2, B.y2);
            }
          }
        }
      }
    }

    // ── Y-axis comparisons ──────────────────────────────────
    if (axes !== 'x') {
      for (const aY of axesA_Y) {
        for (const bY of axesB_Y) {
          const dist = Math.abs(aY - bY);
          if (dist <= SNAP_THRESHOLD) {
            const offset = bY - aY;
            if (bestY === null || dist < Math.abs(bestY.offset)) {
              bestY = { offset, axis: bY };
            }
            const key = 'H' + bY;
            if (!guideMap.has(key)) {
              guideMap.set(key, { type:'horizontal', y:bY, x1:Math.min(A.x1,B.x1), x2:Math.max(A.x2,B.x2) });
            } else {
              const g = guideMap.get(key);
              g.x1 = Math.min(g.x1, A.x1, B.x1);
              g.x2 = Math.max(g.x2, A.x2, B.x2);
            }
          }
        }
      }
    }
  }

  return {
    dx: bestX ? bestX.offset : 0,
    dy: bestY ? bestY.offset : 0,
    snappedX: bestX !== null,
    snappedY: bestY !== null,
    guides: Array.from(guideMap.values())
  };
}

// ── SVG Guide Overlay ───────────────────────────────────────
let _snapRafId = null;
const GUIDE_COLOR   = '#ff007f';
const GUIDE_WIDTH   = '1.5';
const GUIDE_DASH    = '6 4';
const GUIDE_EXTEND  = 2000; // px — extend lines far beyond elements

function _snapSvg() {
  const scroll = document.getElementById('editorScroll');
  if (!scroll) return null;
  let svg = document.getElementById('_snapSvg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = '_snapSvg';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'pointer-events:none;z-index:999;overflow:visible;';
    scroll.appendChild(svg);
  }
  return svg;
}

function _snapDraw(guides) {
  cancelAnimationFrame(_snapRafId);
  _snapRafId = requestAnimationFrame(() => {
    const svg = _snapSvg(); if (!svg) return;
    // Clear via replaceChildren for performance (no innerHTML)
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!guides || !guides.length) return;

    const ns = 'http://www.w3.org/2000/svg';
    guides.forEach(g => {
      // ── Dashed line ──────────────────────────────────────
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('stroke', GUIDE_COLOR);
      line.setAttribute('stroke-width', GUIDE_WIDTH);
      line.setAttribute('stroke-dasharray', GUIDE_DASH);
      line.setAttribute('stroke-linecap', 'round');

      if (g.type === 'vertical') {
        line.setAttribute('x1', g.x); line.setAttribute('x2', g.x);
        line.setAttribute('y1', Math.max(0, g.y1 - GUIDE_EXTEND));
        line.setAttribute('y2', g.y2 + GUIDE_EXTEND);
      } else {
        line.setAttribute('y1', g.y); line.setAttribute('y2', g.y);
        line.setAttribute('x1', Math.max(0, g.x1 - GUIDE_EXTEND));
        line.setAttribute('x2', g.x2 + GUIDE_EXTEND);
      }
      svg.appendChild(line);

      // ── Snap dot at intersection midpoint ────────────────
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', g.type === 'vertical' ? g.x : (g.x1 + g.x2) / 2);
      dot.setAttribute('cy', g.type === 'horizontal' ? g.y : (g.y1 + g.y2) / 2);
      dot.setAttribute('r', '3');
      dot.setAttribute('fill', GUIDE_COLOR);
      svg.appendChild(dot);
    });
  });
}

export function _snapClear() {
  cancelAnimationFrame(_snapRafId);
  const svg = document.getElementById('_snapSvg');
  if (svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
}

/**
 * Augment an element's position after a raw move, snapping and drawing guides.
 * @param {HTMLElement} el — element being dragged
 * @param {number} rawL — raw left
 * @param {number} rawT — raw top
 * @param {HTMLElement[]} targets — cached snap targets
 * @returns {{ left, top }} — snapped coordinates
 */
export function _snapApplyDrag(el, rawL, rawT, targets) {
  el.style.left = rawL + 'px';
  el.style.top  = rawT + 'px';
  const A = _snapBBox(el);
  const { dx, dy, snappedX, snappedY, guides } = _snapCompute(A, targets, 'xy');
  if (snappedX) el.style.left = (rawL + dx) + 'px';
  if (snappedY) el.style.top  = (rawT + dy) + 'px';
  _snapDraw(guides);
  return { left: el.offsetLeft, top: el.offsetTop };
}

/**
 * Augment element resize, snapping the active corner/edge.
 * @param {HTMLElement} el
 * @param {number} nl,nt,nw,nh — computed (pre-snap) geometry
 * @param {string} dir — 'se'|'sw'|'ne'|'nw'
 * @param {HTMLElement[]} targets
 * @returns {{ l, t, w, h }} — snapped geometry
 */
export function _snapApplyResize(el, nl, nt, nw, nh, dir, targets) {
  el.style.left = nl + 'px'; el.style.top = nt + 'px';
  el.style.width = nw + 'px'; el.style.height = nh + 'px';
  const A = _snapBBox(el);
  const { dx, dy, guides } = _snapCompute(A, targets, 'xy');

  let fl = nl, ft = nt, fw = nw, fh = nh;
  if (dx !== 0) {
    if (dir === 'se' || dir === 'ne') { fw = nw + dx; } // right edge snaps
    else { fl = nl + dx; fw = nw - dx; }                // left edge snaps
  }
  if (dy !== 0) {
    if (dir === 'se' || dir === 'sw') { fh = nh + dy; } // bottom edge snaps
    else { ft = nt + dy; fh = nh - dy; }                // top edge snaps
  }
  _snapDraw(guides);
  return { l: fl, t: ft, w: fw, h: fh };
}

export function fmDragStart(e,fm){
  fmDragFromPos(e.clientX,e.clientY,fm);
}

// Auto-size fmedia container to match image's natural aspect ratio
export function _fmAutoHeight(imgEl){
  const fm=imgEl.closest('.fmedia');if(!fm)return;
  const r=imgEl.naturalWidth/imgEl.naturalHeight;
  if(!r||r<=0)return;
  fm.dataset.ratio=r.toFixed(4);
  const curW=fm.offsetWidth||320;
  const newH=Math.max(50,Math.round(curW/r));
  if(Math.abs(fm.offsetHeight-newH)>4){fm.style.height=newH+'px';fmSaveAll();}
}

// Core drag — anchored to where the click first landed
export function fmDragFromPos(anchorX,anchorY,fm){
  const sX=anchorX-fm.offsetLeft,sY=anchorY-fm.offsetTop;
  const targets=_snapTargets(fm.id);
  fm.classList.add('fm-dragging');
  document.body.style.userSelect='none';
  function move(e2){
    let lx=Math.max(0,e2.clientX-sX);
    let ly=Math.max(0,e2.clientY-sY);
    _snapApplyDrag(fm,lx,ly,targets);
    fmExtendEditor(fm);
  }
  function up(){
    fm.classList.remove('fm-dragging');
    document.body.style.userSelect='';
    _snapClear();
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
    onContentChange();
  }
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
}
// ── Smart drag: rê chuột + giữ trái = kéo, click nhanh = lightbox ──
const FM_DRAG_THRESHOLD = 4; // px before drag activates

function _fmAttachDrag(fm, fmId, isVid) {
  fm.addEventListener('mousedown', e => {
    // Ignore right-click, resize handles, toolbar buttons, carousel controls
    if (e.button !== 0) return;
    if (e.target.closest(
      '[data-dir], .fmedia-ibtn, .fmedia-bar button, ' +
      '.fm-car-btn, .fm-car-fs, .fm-car-thumb, .fm-car-thumbs, ' +
      '.tb-car-btn, .tb-car-fsBtn, .txtbox-handle-bar'
    )) return;

    e.preventDefault();
    // Select element
    document.querySelectorAll('.fmedia').forEach(f => f.classList.remove('sel'));
    fm.classList.add('sel');
    _hoveredFm = fmId;

    const startX = e.clientX, startY = e.clientY;
    let dragActive = false;

    function onMove(e2) {
      if (dragActive) return;
      const moved = Math.abs(e2.clientX - startX) > FM_DRAG_THRESHOLD ||
                    Math.abs(e2.clientY - startY) > FM_DRAG_THRESHOLD;
      if (moved) {
        dragActive = true;
        cleanup();
        fmDragFromPos(startX, startY, fm);
      }
    }

    function onUp(e2) {
      cleanup();
      if (!dragActive) {
        // Was a click — open lightbox/video (not on the toolbar bar)
        if (!e2.target.closest('.fmedia-bar, .fm-car-stage')) {
          if (isVid) fmPlayVideo(fmId);
          else fmOpenImg(fmId);
        }
      }
    }

    function cleanup() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function fmResizeStart(e,fm,dir){
  const sX=e.clientX,sY=e.clientY,sW=fm.offsetWidth,sH=fm.offsetHeight,sL=fm.offsetLeft,sT=fm.offsetTop;
  // Get stored aspect ratio (naturalWidth/naturalHeight)
  const ratio=parseFloat(fm.dataset.ratio)||sW/Math.max(sH,1);
  const targets=_snapTargets(fm.id);

  function move(e2){
    const dx=e2.clientX-sX,dy=e2.clientY-sY;
    let nw,nh,nl=sL,nt=sT;

    // Use larger delta to determine scale direction → always proportional
    if(dir==='se'||dir==='ne'){
      // Right/top-right: use dx as primary
      nw=Math.max(80,sW+dx);
    } else {
      // Left/top-left: use -dx as primary
      nw=Math.max(80,sW-dx);
      nl=sL+sW-nw;
    }
    // Height always derived from width and ratio → no distortion
    nh=Math.max(40,Math.round(nw/ratio));

    // Adjust top anchor for N-side corners
    if(dir==='nw'||dir==='ne') nt=sT+sH-nh;

    const snapped=_snapApplyResize(fm,nl,nt,nw,nh,dir,targets);
    fm.style.left=snapped.l+'px';fm.style.top=snapped.t+'px';
    fm.style.width=snapped.w+'px';fm.style.height=snapped.h+'px';
    fmExtendEditor(fm);
  }
  function up(){_snapClear();document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);onContentChange();}
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up);
}
export function fmExtendEditor(fm){const editor=document.getElementById('editor');const needed=fm.offsetTop+fm.offsetHeight+80;if(editor.offsetHeight<needed)editor.style.minHeight=needed+'px';}
export function fmDelete(fmId){
  const fm=document.getElementById(fmId);if(!fm)return;
  const doc=currentDoc();if(!doc)return;
  const mid=fm.dataset.mediaid;
  fm.remove();
  // Find media entry
  const mediaEntry=doc.images&&doc.images.find(m=>m.id===mid);
  if(mediaEntry&&mediaEntry.type==='carousel'){
    // Delete each slide blob from IndexedDB
    (mediaEntry.slides||[]).forEach(sl=>{_revokeUrl(sl.id);_idbDel(sl.id).catch(()=>{});});
  } else {
    _revokeUrl(mid);
    _idbDel(mid).catch(()=>{});
  }
  if(doc.images)doc.images=doc.images.filter(i=>i.id!==mid);
  if(doc.content){const tmp=document.createElement('div');tmp.innerHTML=doc.content;tmp.querySelectorAll('[data-mediaid="'+mid+'"],[data-imgid="'+mid+'"]').forEach(e=>e.remove());doc.content=tmp.innerHTML;document.getElementById('editor').innerHTML=doc.content;tblAttachAll();}
  markDirty();toast('Da xoa','info');
}
export function fmOpenImg(fmId){const fm=document.getElementById(fmId);if(!fm)return;const img=fm.querySelector('img');if(!img)return;const imgs=Array.from(document.querySelectorAll('.fmedia img'));lbOpen(imgs.indexOf(img));}
export function fmPlayVideo(fmId){const fm=document.getElementById(fmId);if(!fm)return;const vid=fm.querySelector('video');if(vid)openVideoLightbox(vid);}
export function fmSaveAll(){
  const doc=currentDoc();if(!doc||!doc.images)return;
  document.querySelectorAll('.fmedia').forEach(fm=>{
    const mid=fm.dataset.mediaid;const img=doc.images.find(i=>i.id===mid);
    if(img){img.fmx=parseInt(fm.style.left);img.fmy=parseInt(fm.style.top);img.fmw=fm.offsetWidth;img.fmh=fm.offsetHeight;}
  });
}
// ── LAZY LOAD: IntersectionObserver chỉ load ảnh khi visible ──
let _fmObserver=null;
function _initFmObserver(){
  if(_fmObserver)_fmObserver.disconnect();
  const root=document.getElementById('editorScroll');
  _fmObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const fm=entry.target;
      if(fm.dataset.loaded==='1')return;
      fm.dataset.loaded='1';
      _fmObserver.unobserve(fm);
      _fmLoadSrc(fm);
    });
  },{root,rootMargin:'300px'});
}

async function _fmLoadSrc(fm){
  const mid=fm.dataset.mediaid;if(!mid)return;
  let src=_objUrls[mid]||'';
  if(!src){
    try{
      const blob=await _idbGet(mid);
      if(blob){src=URL.createObjectURL(blob);_cacheUrl(mid,src);}
    }catch(e){}
  }
  if(!src)return;
  const isVid=fm.dataset.mtype==='video';
  const el=fm.querySelector(isVid?'video':'img');
  if(el&&!el.src){
    el.src=src;
    // Remove placeholder if present
    const ph=fm.querySelector('.fmedia-placeholder');if(ph)ph.remove();
  }
}

export async function fmLoadAll(doc){
  document.querySelectorAll('.fmedia').forEach(f=>f.remove());
  if(!doc.images||!doc.images.length)return;
  _initFmObserver();

  // Step 1: Create all frames instantly
  for(let i=0;i<doc.images.length;i++){
    const media=doc.images[i];
    const x=media.fmx!=null?media.fmx:48+(i%4)*20;
    const y=media.fmy!=null?media.fmy:40+i*20;

    if(media.type==='carousel'){
      // Carousel: restore from metadata
      const w=media.fmw??520;const h=media.fmh??340;
      createCarouselMedia(media,x,y,w,h);
      continue;
    }

    const w=media.fmw!=null?media.fmw:(media.type==='video'?480:320);
    const h=media.fmh!=null?media.fmh:(media.type==='video'?270:220);
    const cachedSrc=_objUrls[media.id]||'';
    const fm=createFloatingMedia({...media,src:cachedSrc},x,y,w,h);
    if(!fm)continue;
    if(cachedSrc){fm.dataset.loaded='1';}
    else{if(_fmObserver)_fmObserver.observe(fm);}
  }
}

// VIDEO LIGHTBOX
export function openVideoLightbox(videoEl){
  let ov=document.getElementById('videoLbOverlay');
  if(!ov){ov=document.createElement('div');ov.id='videoLbOverlay';ov.style.cssText='position:fixed;inset:0;z-index:700;background:rgba(0,0,0,.93);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
  ov.innerHTML='<video id="videoLbPlayer" controls autoplay style="max-width:92vw;max-height:88vh;border-radius:10px;background:#000;box-shadow:0 24px 80px rgba(0,0,0,.6)"></video><button onclick="closeVideoLightbox()" style="position:fixed;top:16px;right:18px;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center">x</button>';
  ov.addEventListener('click',e=>{if(e.target===ov)closeVideoLightbox();});document.body.appendChild(ov);}
  document.getElementById('videoLbPlayer').src=videoEl.src;ov.style.display='flex';document.body.style.overflow='hidden';
  document.addEventListener('keydown',_videoLbKey);
}
export function closeVideoLightbox(){const ov=document.getElementById('videoLbOverlay');if(ov){ov.style.display='none';document.getElementById('videoLbPlayer').pause();}document.body.style.overflow='';document.removeEventListener('keydown',_videoLbKey);}
function _videoLbKey(e){if(e.key==='Escape')closeVideoLightbox();}

// LIGHTBOX
export let lbIndex=0,lbImages=[];
// Set images array and show lightbox immediately (used by slashMenu.js and tables.js)
export function lbShow(images, startIdx=0){
  lbImages=images;
  lbIndex=Math.max(0,Math.min(startIdx,images.length-1));
  lbRender();
  document.getElementById('lightbox').classList.add('on');
  document.body.style.overflow='hidden';
}
export function lbOpen(startIdx){
  const domImgs=Array.from(document.querySelectorAll('.fmedia img,.editor-content img'));
  if(!domImgs.length)return;
  const doc=currentDoc();
  lbImages=domImgs.map(el=>{const id=el.dataset.imgid||(el.closest('.fmedia')?el.closest('.fmedia').dataset.mediaid:'');const stored=(doc&&doc.images||[]).find(i=>i.id===id);return{src:el.src,name:stored?stored.name:(el.alt||'image')};});
  lbIndex=Math.max(0,Math.min(startIdx,lbImages.length-1));lbRender();
  document.getElementById('lightbox').classList.add('on');document.body.style.overflow='hidden';
}
export function lbRender(){
  const img=lbImages[lbIndex];if(!img)return;
  const el=document.getElementById('lbImg');el.classList.add('switching');
  setTimeout(()=>{el.src=img.src;el.alt=img.name;el.classList.remove('switching');},200);
  document.getElementById('lbCounter').textContent=(lbIndex+1)+' / '+lbImages.length;
  document.getElementById('lbName').textContent=img.name;
  document.getElementById('lbPrev').classList.toggle('disabled',lbIndex===0);
  document.getElementById('lbNext').classList.toggle('disabled',lbIndex===lbImages.length-1);
  const dotsEl=document.getElementById('lbDots');
  if(lbImages.length<=12)dotsEl.innerHTML=lbImages.map((_,i)=>`<span class="lb-dot${i===lbIndex?' on':''}" onclick="lbGoTo(${i})"></span>`).join('');
  else dotsEl.innerHTML='';
}
export function lbGo(dir){const n=lbIndex+dir;if(n<0||n>=lbImages.length)return;lbIndex=n;lbRender();}
export function lbGoTo(i){lbIndex=i;lbRender();}
export function lbClose(){document.getElementById('lightbox').classList.remove('on');document.body.style.overflow='';}
export function lbBgClick(e){if(e.target===document.getElementById('lightbox'))lbClose();}
