/* ── Viewer Runtime — loaded by publishEngine at export time ──────────────
   All static viewer logic lives here. Dynamic data (_wsTM, _wsHL,
   _WS_DOCS, _WS_FIRST) is injected before this script runs.
   ──────────────────────────────────────────────────────────────────────── */

// ── Color palette swapper ───────────────────────────────────────────────────
function wsSwapColors(){
  var dk=document.documentElement.getAttribute('data-theme')==='dark';
  document.querySelectorAll(".cp-mapped[data-cptype='text']").forEach(function(s){
    var r=parseInt(s.dataset.cprow),c=parseInt(s.dataset.cpcol);
    if(_wsTM[r]&&_wsTM[r][c])s.style.color=_wsTM[r][c][dk?1:0];
  });
  document.querySelectorAll(".cp-mapped[data-cptype='hl']").forEach(function(s){
    var c=parseInt(s.dataset.cpcol);
    if(_wsHL[c])s.style.backgroundColor=_wsHL[c][dk?1:0];
  });
}

// ── Theme toggle ────────────────────────────────────────────────────────────
function wsToggleTheme(){
  var dk=document.documentElement.getAttribute('data-theme')==='dark';
  var next=dk?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  document.documentElement.style.colorScheme=next;
  localStorage.setItem('wst',next);
  var b=document.getElementById('wsThemeBtn');
  if(b)b.textContent=next==='dark'?'☽':'☀';
  wsSwapColors();
}

// ── Theme init ──────────────────────────────────────────────────────────────
(function(){
  var appDef=document.documentElement.getAttribute('data-theme')||'light';
  var t=localStorage.getItem('wst')||appDef;
  document.documentElement.setAttribute('data-theme',t);
  document.documentElement.style.colorScheme=t;
  var b=document.getElementById('wsThemeBtn');
  if(b)b.textContent=t==='dark'?'☽':'☀';
  setTimeout(wsSwapColors,0);
})();

// ── Canvas scaling ──────────────────────────────────────────────────────────
function fitCanvas(d,_retry){
  var cv=d.querySelector('.ws-canvas'),wp=d.querySelector('.ws-canvas-wrap');
  if(!cv||!wp)return;
  var av=wp.getBoundingClientRect().width;
  if(!av){if(!_retry)setTimeout(function(){fitCanvas(d,true);},120);return;}
  var nat=parseInt(cv.dataset.natW)||0;
  if(!nat){
    cv.style.zoom='';cv.style.transform='';cv.style.transformOrigin='';cv.style.width='';
    wp.style.height='';wp.style.overflow='';wp.style.width='';return;
  }
  if(Math.abs(nat-av)>2){
    var sc=Math.round((av/nat)*100)/100;
    var ffVer=parseInt((navigator.userAgent.match(/Firefox\/(\d+)/)||[0,0])[1]);
    var useZoom=('zoom' in document.body.style)&&(!ffVer||ffVer>=126);
    cv.style.width=nat+'px';
    if(useZoom){
      cv.style.zoom=sc;cv.style.transform='';wp.style.height='';wp.style.width='';wp.style.overflow='hidden';
    }else{
      cv.style.zoom='';cv.style.transform='scale('+sc+')';cv.style.transformOrigin='top left';
      var scaled=Math.ceil(cv.scrollHeight*sc);
      wp.style.height=(scaled||400)+'px';wp.style.width=Math.ceil(nat*sc)+'px';wp.style.overflow='hidden';
    }
  }else{
    cv.style.zoom='';cv.style.transform='';cv.style.width='';
    wp.style.height='';wp.style.overflow='';wp.style.width='';
  }
}

function _animFit(d,dur){
  var t0=performance.now();
  (function loop(){fitCanvas(d);if(performance.now()-t0<(dur||260))requestAnimationFrame(loop);})();
}

// ── localStorage helpers ────────────────────────────────────────────────────
var _WS_REC_KEY='wsRecent_'+location.pathname;
var _WS_STR_KEY='wsStarred_'+location.pathname;
function _wsGetRec(){try{return JSON.parse(localStorage.getItem(_WS_REC_KEY)||'[]');}catch(e){return[];}}
function _wsGetStr(){try{return JSON.parse(localStorage.getItem(_WS_STR_KEY)||'[]');}catch(e){return[];}}
function _wsSaveRec(r){try{localStorage.setItem(_WS_REC_KEY,JSON.stringify(r));}catch(e){}}
function _wsSaveStr(s){try{localStorage.setItem(_WS_STR_KEY,JSON.stringify(s));}catch(e){}}

// ── Show document ───────────────────────────────────────────────────────────
function showDoc(id){
  document.querySelectorAll('.ws-doc').forEach(function(e){e.style.display='none';});
  document.querySelectorAll('.ws-nav-item').forEach(function(e){e.classList.remove('active');});
  var el=document.getElementById('doc-'+id),nav=document.getElementById('nav-'+id);
  if(el){el.style.display='';wsInitAll(el);wsSwapColors();setTimeout(function(){fitCanvas(el);},0);}
  if(nav){nav.classList.add('active');nav.scrollIntoView({block:'nearest'});}
  document.getElementById('wsMain').scrollTop=0;_cur=id;
  var doc=_WS_DOCS.find(function(d){return d.id===id;});
  if(doc){
    var rec=_wsGetRec().filter(function(r){return r.id!==id;});
    rec.unshift({id:id,title:doc.title,section:doc.section,time:Date.now()});
    if(rec.length>20)rec=rec.slice(0,20);
    _wsSaveRec(rec);
  }
  var str=_wsGetStr();
  document.querySelectorAll('.ws-star-btn').forEach(function(b){
    var nv=b.closest('.ws-nav-item');if(!nv)return;
    b.classList.toggle('starred',str.indexOf(nv.dataset.docid)>-1);
    b.textContent=str.indexOf(nv.dataset.docid)>-1?'★':'☆';
  });
  wsSbRefreshRecent();
}

// ── Sidebar panel mode ──────────────────────────────────────────────────────
function wsSbMode(mode){
  document.getElementById('wsSbRecent').style.display=mode==='recent'?'':'none';
  document.getElementById('wsSbStarred').style.display=mode==='starred'?'':'none';
  document.getElementById('wsSbPages').style.display=mode==='pages'?'':'none';
  document.querySelectorAll('.ws-pnav-item').forEach(function(b){
    b.classList.toggle('active',b.id==='wsPNavBtn-'+mode);
  });
  if(mode==='recent')wsSbRefreshRecent();
  if(mode==='starred')wsSbRefreshStarred();
}

// ── Nav item builder ────────────────────────────────────────────────────────
function _wsMkNavItem(docId,docTitle,relTime,starred){
  var d=document.createElement('div');d.className='ws-nav-item';d.dataset.docid=docId;
  var ic=document.createElement('i');ic.className='ti ti-file-text ws-nav-icon';
  var nt=document.createElement('span');nt.className='ws-nav-title';nt.textContent=docTitle;
  var sb=document.createElement('button');sb.className='ws-star-btn'+(starred?' starred':'');
  sb.textContent=starred?'★':'☆';sb.dataset.docid=docId;
  if(relTime){
    var rt=document.createElement('div');rt.style.cssText='font-size:10.5px;color:var(--text3)';rt.textContent=relTime;
    var wrap=document.createElement('div');wrap.style.cssText='flex:1;overflow:hidden';
    wrap.appendChild(nt);wrap.appendChild(rt);
    d.appendChild(ic);d.appendChild(wrap);
  }else{d.appendChild(ic);d.appendChild(nt);}
  d.appendChild(sb);return d;
}

function _wsRelTime(ts){
  var ago=Math.round((Date.now()-ts)/60000);
  return ago<1?'Vừa xong':ago<60?ago+' phút trước':ago<1440?Math.round(ago/60)+'h trước':Math.round(ago/1440)+'d trước';
}

function wsSbRefreshRecent(){
  var panel=document.getElementById('wsSbRecent');if(!panel)return;
  var rec=_wsGetRec();panel.innerHTML='';
  if(!rec.length){panel.innerHTML='<div class="ws-sb-empty">Chưa xem trang nào</div>';return;}
  var str=_wsGetStr();
  rec.forEach(function(r){panel.appendChild(_wsMkNavItem(r.id,r.title,_wsRelTime(r.time),str.indexOf(r.id)>-1));});
}

function wsSbRefreshStarred(){
  var panel=document.getElementById('wsSbStarred');if(!panel)return;
  var str=_wsGetStr();panel.innerHTML='';
  if(!str.length){panel.innerHTML='<div class="ws-sb-empty">Chưa có trang yêu thích</div>';return;}
  str.forEach(function(id){
    var doc=_WS_DOCS.find(function(d){return d.id===id;});
    if(!doc)return;
    panel.appendChild(_wsMkNavItem(id,doc.title,'',true));
  });
}

function wsToggleStar(id,btn){
  var str=_wsGetStr();var idx=str.indexOf(id);
  if(idx>-1){str.splice(idx,1);}else{str.unshift(id);}
  _wsSaveStr(str);var isStarred=str.indexOf(id)>-1;
  document.querySelectorAll('.ws-nav-item[data-docid="'+id+'"] .ws-star-btn').forEach(function(b){
    b.classList.toggle('starred',isStarred);b.textContent=isStarred?'★':'☆';
  });
  if(btn){btn.classList.toggle('starred',isStarred);btn.textContent=isStarred?'★':'☆';}
  if(document.getElementById('wsSbStarred').style.display!=='none')wsSbRefreshStarred();
}

window.addEventListener('resize',function(){
  if(_cur){var el=document.getElementById('doc-'+_cur);if(el)fitCanvas(el);}
});

// ── Init all interactive widgets in a doc ───────────────────────────────────
function wsInitAll(d){
  d.querySelectorAll('.ws-canvas img').forEach(function(img){
    img.onclick=function(){wsImgLb(img.src);};
  });
  d.querySelectorAll('.ws-canvas video').forEach(function(v){v.controls=true;});
  wsInitTbCars(d);wsInitFmCars(d);wsInitTblCars(d);
}

// ── Floating media carousels ────────────────────────────────────────────────
function wsFmNav(car,dir){
  var tot=parseInt(car.dataset.cartotal)||1;
  var idx=Math.max(0,Math.min(tot-1,(parseInt(car.dataset.caridx||0))+dir));
  car.dataset.caridx=idx;
  var inner=car.querySelector('.ws-fm-inner');if(inner)inner.style.transform='translateX(-'+idx+'00%)';
  var badge=car.querySelector('.ws-fm-badge');if(badge)badge.textContent=(idx+1)+'/'+tot;
}

function wsInitFmCars(d){
  d.querySelectorAll('.ws-fm-car').forEach(function(car){
    var p=car.querySelector('.ws-fm-btn.prev'),n=car.querySelector('.ws-fm-btn.next');
    if(p)p.onclick=function(e){e.stopPropagation();wsFmNav(car,-1);};
    if(n)n.onclick=function(e){e.stopPropagation();wsFmNav(car,1);};
  });
}

// ── Table cell carousels ────────────────────────────────────────────────────
function wsInitTblCars(d){
  d.querySelectorAll('.tbl-cell-car').forEach(function(car){
    var tot=parseInt(car.dataset.cartotal)||1,idx=0;
    var inner=car.querySelector('.tcc-inner'),badge=car.querySelector('.tcc-badge');
    var thumbs=car.querySelectorAll('.tcc-thumb');
    var prev=car.querySelector('.tcc-btn.prev'),next=car.querySelector('.tcc-btn.next');
    function goTo(i){
      idx=Math.max(0,Math.min(tot-1,i));
      if(inner)inner.style.transform='translateX(-'+idx+'00%)';
      if(badge)badge.textContent=(idx+1)+'/'+tot;
      thumbs.forEach(function(t,ti){t.classList.toggle('on',ti===idx);});
      if(prev)prev.disabled=idx===0;if(next)next.disabled=idx>=tot-1;
    }
    if(prev)prev.onclick=function(e){e.stopPropagation();goTo(idx-1);};
    if(next)next.onclick=function(e){e.stopPropagation();goTo(idx+1);};
    thumbs.forEach(function(t,ti){t.onclick=function(e){e.stopPropagation();goTo(ti);};});
    var stage=car.querySelector('.tcc-stage');
    if(stage)stage.onclick=function(){wsImgLb(car.querySelectorAll('.tcc-slide img')[idx]?.src||'');};
    goTo(0);
  });
}

// ── Legacy tb-carousel ──────────────────────────────────────────────────────
function wsInitTbCars(d){
  d.querySelectorAll('.tb-carousel').forEach(function(car){
    var p=car.querySelector('.tb-car-btn.prev'),n=car.querySelector('.tb-car-btn.next');
    if(p)p.onclick=function(e){e.stopPropagation();tbCarNav(car,-1);};
    if(n)n.onclick=function(e){e.stopPropagation();tbCarNav(car,1);};
    car.querySelectorAll('.tb-car-dot').forEach(function(dot,i){
      dot.onclick=function(e){e.stopPropagation();tbCarNav(car,i-parseInt(car.dataset.idx||0));};
    });
    car.querySelectorAll('.tb-car-slide img').forEach(function(img){img.onclick=function(){wsImgLb(img.src);};});
  });
}

function tbCarNav(car,dir){
  var idx=Math.max(0,Math.min((parseInt(car.dataset.count)||1)-1,parseInt(car.dataset.idx||0)+dir));
  car.dataset.idx=idx;
  var inner=car.querySelector('.tb-car-inner');if(inner)inner.style.transform='translateX(-'+idx+'00%)';
  car.querySelectorAll('.tb-car-dot').forEach(function(d,i){d.classList.toggle('on',i===idx);});
  var ctr=car.querySelector('.tb-car-counter');if(ctr)ctr.textContent=(idx+1)+'/'+(parseInt(car.dataset.count)||1);
  var p=car.querySelector('.tb-car-btn.prev'),n=car.querySelector('.tb-car-btn.next');
  if(p)p.disabled=idx===0;if(n)n.disabled=idx>=(parseInt(car.dataset.count)||1)-1;
}

// ── Search filter ───────────────────────────────────────────────────────────
function wsFilter(q){
  q=q.toLowerCase();var found=0;
  document.querySelectorAll('.ws-doc').forEach(function(el){
    var id=el.id.replace('doc-','');
    var nav=document.getElementById('nav-'+id);
    var match=!q||(el.textContent||'').toLowerCase().includes(q);
    if(nav)nav.style.display=match?'':'none';
    if(match)found++;
  });
  document.getElementById('wsDocCount').textContent=found+' tài liệu';
  document.getElementById('wsNoResult').style.display=found?'none':'';
}

// ── Lightbox ────────────────────────────────────────────────────────────────
function wsImgLb(src){
  if(!src)return;
  var ov=document.getElementById('wsImgOv');
  if(!ov){
    ov=document.createElement('div');ov.id='wsImgOv';ov.className='lb';
    var img=document.createElement('img');img.className='lb-img';img.id='wsImgEl';
    var btn=document.createElement('button');btn.className='lb-x';btn.textContent='✕';
    btn.onclick=function(){ov.classList.remove('on');};
    ov.appendChild(img);ov.appendChild(btn);
    ov.onclick=function(e){if(e.target===ov)ov.classList.remove('on');};
    document.body.appendChild(ov);
  }
  document.getElementById('wsImgEl').src=src;ov.classList.add('on');
}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){var i=document.getElementById('wsImgOv');if(i)i.classList.remove('on');}
});

// ── Carousel rewiring (cf-car-track style) ──────────────────────────────────
(function(){
  document.querySelectorAll('.cf-carousel-block').forEach(function(block){
    var track=block.querySelector('.cf-car-track');
    var prev=block.querySelector('.cf-car-btn.prev'),next=block.querySelector('.cf-car-btn.next');
    var dots=block.querySelector('.cf-car-dots'),counter=block.querySelector('.cf-car-counter');
    if(!track)return;
    block._ci=0;
    function go(i){
      var slides=track.querySelectorAll('.cf-car-slide'),n=slides.length;
      i=Math.max(0,Math.min(n-1,i));block._ci=i;
      track.style.transform='translateX(-'+i*100+'%)';
      if(dots)dots.querySelectorAll('.cf-car-dot').forEach(function(d,j){d.classList.toggle('on',j===i);});
      if(counter)counter.textContent=(i+1)+' / '+n;
      if(prev)prev.disabled=i===0;if(next)next.disabled=i===n-1;
    }
    if(prev)prev.onclick=function(){go(block._ci-1);};
    if(next)next.onclick=function(){go(block._ci+1);};
    if(dots)dots.querySelectorAll('.cf-car-dot').forEach(function(d,j){d.onclick=function(){go(j);};});
    go(0);
  });
})();

// ── Carousel rewiring (cf-carousel-slides style) ───────────────────────────
(function(){
  document.querySelectorAll('.cf-carousel-block').forEach(function(block){
    var slides=block.querySelector('.cf-carousel-slides');
    var arrows=block.querySelectorAll('.cf-car-arrow');
    var dots=block.querySelectorAll('.cf-car-dot');
    var counter=block.querySelector('.cf-car-counter');
    if(!slides)return;
    var n=slides.children.length,idx=0;
    function goTo(i){
      i=Math.max(0,Math.min(n-1,i));idx=i;
      slides.style.transform='translateX(-'+i*100+'%)';
      dots.forEach(function(d,j){d.classList.toggle('active',j===i);});
      if(counter)counter.textContent=(i+1)+' / '+n;
      arrows.forEach(function(a){
        if(a.classList.contains('left'))a.disabled=i===0;
        else a.disabled=i>=n-1;
      });
    }
    arrows.forEach(function(a){a.onclick=function(){goTo(a.classList.contains('left')?idx-1:idx+1);};});
    dots.forEach(function(d,j){d.onclick=function(){goTo(j);};});
    goTo(0);
  });
})();

// ── Sidebar resizer ─────────────────────────────────────────────────────────
(function(){
  var WS_SB_KEY='ws_sb_width_'+location.pathname;
  var WS_SB_MIN=60,WS_SB_MAX=520,WS_SB_DEFAULT=260;
  var rz=document.getElementById('wsSbRz');
  var sb=document.getElementById('wsSidebar');
  if(!rz||!sb)return;
  var savedW=parseInt(localStorage.getItem(WS_SB_KEY)||'',10);
  if(savedW>=WS_SB_MIN&&savedW<=WS_SB_MAX){sb.style.width=savedW+'px';}
  rz.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    e.preventDefault();rz.classList.add('dragging');
    document.body.style.cursor='col-resize';document.body.style.userSelect='none';
    var startX=e.clientX;var startW=sb.getBoundingClientRect().width;
    function onMove(e2){
      var w=Math.max(WS_SB_MIN,Math.min(WS_SB_MAX,startW+(e2.clientX-startX)));
      sb.style.width=w+'px';
    }
    function onUp(){
      rz.classList.remove('dragging');
      document.body.style.cursor='';document.body.style.userSelect='';
      try{localStorage.setItem(WS_SB_KEY,Math.round(sb.getBoundingClientRect().width));}catch(er){}
      if(_cur){var el=document.getElementById('doc-'+_cur);if(el)fitCanvas(el);}
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
  rz.addEventListener('dblclick',function(){
    sb.style.transition='width .2s ease';
    sb.style.width=WS_SB_DEFAULT+'px';
    try{localStorage.setItem(WS_SB_KEY,WS_SB_DEFAULT);}catch(er){}
    setTimeout(function(){sb.style.transition='';if(_cur){var el=document.getElementById('doc-'+_cur);if(el)fitCanvas(el);}},220);
  });
})();

// ── Sidebar event delegation ────────────────────────────────────────────────
(function(){
  var sb=document.getElementById('wsSidebar');if(!sb)return;
  sb.addEventListener('click',function(e){
    var starBtn=e.target.closest('.ws-star-btn');
    if(starBtn){
      e.stopPropagation();
      var id=starBtn.dataset.docid||starBtn.closest('.ws-nav-item[data-docid]')?.dataset.docid;
      if(id)wsToggleStar(id,starBtn);return;
    }
    var modeBtn=e.target.closest('[data-wsmode]');
    if(modeBtn){wsSbMode(modeBtn.dataset.wsmode);return;}
    var navItem=e.target.closest('.ws-nav-item[data-docid]');
    if(navItem)showDoc(navItem.dataset.docid);
  });
})();

// ── Theme button + search ───────────────────────────────────────────────────
(function(){
  var thBtn=document.getElementById('wsThemeBtn');
  if(thBtn)thBtn.addEventListener('click',wsToggleTheme);
  var srch=document.getElementById('wsSearch');
  if(srch)srch.addEventListener('input',function(){wsFilter(this.value);});
})();

// ── Sidebar toggle (collapse / expand) — restores saved width on expand ─────
(function(){
  var WK='ws_sb_width_'+location.pathname;
  var WMN=60,WMX=520,WDF=260;
  var tog=document.getElementById('wsSbToggle');
  var rz=document.getElementById('wsSbRz');
  var sb=document.getElementById('wsSidebar');
  var ov=document.getElementById('wsSbOverlay');
  if(!tog||!sb)return;
  function isMobile(){return window.innerWidth<=768;}
  function doCollapse(){
    if(isMobile()){sb.removeAttribute('data-mob-open');if(ov)ov.classList.remove('on');return;}
    sb.classList.add('collapsed');if(rz)rz.classList.add('hidden');
    try{localStorage.setItem('ws_sb_col_'+location.pathname,'1');}catch(er){}
    if(_cur){var el=document.getElementById('doc-'+_cur);if(el)_animFit(el,260);}
  }
  function doExpand(){
    if(isMobile()){sb.setAttribute('data-mob-open','');if(ov)ov.classList.add('on');return;}
    var sw=parseInt(localStorage.getItem(WK)||'',10);
    sb.style.width=((sw>=WMN&&sw<=WMX)?sw:WDF)+'px';
    sb.classList.remove('collapsed');if(rz)rz.classList.remove('hidden');
    try{localStorage.setItem('ws_sb_col_'+location.pathname,'0');}catch(er){}
    if(_cur){var el=document.getElementById('doc-'+_cur);if(el)_animFit(el,260);}
  }
  var colKey='ws_sb_col_'+location.pathname;
  if(localStorage.getItem(colKey)==='1'){sb.classList.add('collapsed');if(rz)rz.classList.add('hidden');}
  tog.addEventListener('click',function(){
    if(sb.classList.contains('collapsed'))doExpand();else doCollapse();
  });
  if(ov)ov.addEventListener('click',doCollapse);
})();

// ── Restore embed iframes from data-embed-url ────────────────────────────────
// Ensures YouTube/social media iframes always have their src set correctly,
// even if the browser stripped or lost it during serialization.
(function(){
  document.querySelectorAll('.cf-embed-block[data-embed-url]').forEach(function(block){
    var url=block.dataset.embedUrl;if(!url)return;
    var wrap=block.querySelector('.cf-embed-wrap');if(!wrap)return;
    var iframe=block.querySelector('iframe');
    if(!iframe){
      iframe=document.createElement('iframe');
      iframe.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share';
      iframe.setAttribute('allowfullscreen','');
      iframe.setAttribute('loading','lazy');
      wrap.appendChild(iframe);
    }
    if(!iframe.src||iframe.src==='about:blank'||iframe.src===location.href)iframe.src=url;
    // Ensure aspect ratio is applied
    if(!wrap.style.paddingBottom)wrap.style.paddingBottom='56.25%';
  });
})();
