import { state, STORE_KEY, _objUrls } from './state.js';

// ─── INDEXEDDB BLOB STORE ─────────────────────────────────
const MEDIA_DB = 'pd_media_v1';
let _idb = null;

export function _openIDB(){
  if(_idb)return Promise.resolve(_idb);
  return new Promise((res,rej)=>{
    const req=indexedDB.open(MEDIA_DB,1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');
    };
    req.onsuccess=e=>{_idb=e.target.result;res(_idb);};
    req.onerror=e=>rej(e);
  });
}

export function _idbGet(id){
  return _openIDB().then(db=>new Promise((res,rej)=>{
    const tx=db.transaction('blobs','readonly');
    const req=tx.objectStore('blobs').get(id);
    req.onsuccess=e=>res(e.target.result);
    req.onerror=rej;
  }));
}

export function _idbSet(id,blob){
  return _openIDB().then(db=>new Promise((res,rej)=>{
    const tx=db.transaction('blobs','readwrite');
    tx.objectStore('blobs').put(blob,id);
    tx.oncomplete=res;tx.onerror=rej;
  }));
}

export function _idbDel(id){
  return _openIDB().then(db=>new Promise(res=>{
    const tx=db.transaction('blobs','readwrite');
    tx.objectStore('blobs').delete(id);
    tx.oncomplete=res;tx.onerror=res;
  }));
}

// ── LRU Object URL Cache ─────────────────────────────────
const OBJ_URL_MAX = 80;
const _objUrlOrder = []; // LRU order (oldest first)

export function _revokeUrl(id){
  if(_objUrls[id]){
    URL.revokeObjectURL(_objUrls[id]);
    delete _objUrls[id];
    const i=_objUrlOrder.indexOf(id);
    if(i>-1)_objUrlOrder.splice(i,1);
  }
}

// PERSIST / LOAD STATE
export function persist(){
  // Strip blob Object URLs from media before saving (only store metadata)
  // Blobs live in IndexedDB; Object URLs are session-only
  const toSave=JSON.parse(JSON.stringify(state));
  toSave.docs.forEach(doc=>{
    if(doc.images){
      doc.images=doc.images.map(m=>{
        const {src,...meta}=m;
        // Keep src only if it's a base64 legacy entry
        return src&&src.startsWith('data:')?{...meta,src}:meta;
      });
    }
  });
  localStorage.setItem(STORE_KEY,JSON.stringify(toSave));
}

export function loadState(){
  const saved=localStorage.getItem(STORE_KEY);
  if(saved){try{Object.assign(state,JSON.parse(saved));}catch(e){}}
  if(!state.docs)state.docs=[];
  if(!state.sections)state.sections=['Chung'];
  if(!state.recent)state.recent=[];
  if(!state.starred)state.starred=[];
}

// Compress image blob before export (reduce HTML file size)
export async function _compressForExport(blob){
  if(!blob)return null;
  const {mode,maxDim,quality}=_getExportSettings();

  // Videos: no compression regardless of mode
  if(blob.type.startsWith('video/'))return _blobToB64(blob);
  // GIF: no compression (loses animation)
  if(blob.type==='image/gif')return _blobToB64(blob);
  // Original mode: keep as-is
  if(mode==='original')return _blobToB64(blob);

  // Compress mode: resize + JPEG
  return new Promise(res=>{
    const img=new Image();
    const url=URL.createObjectURL(blob);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let {width:w,height:h}=img;
      const needResize=w>maxDim||h>maxDim;
      if(needResize){
        const ratio=Math.min(maxDim/w,maxDim/h);
        w=Math.round(w*ratio);h=Math.round(h*ratio);
      }
      // If PNG has transparency and quality=100 → keep PNG
      if(!needResize&&quality>=1&&blob.type==='image/png'){
        _blobToB64(blob).then(res);return;
      }
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      // White background for PNG → JPEG (avoid black background)
      if(blob.type==='image/png'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
      ctx.drawImage(img,0,0,w,h);
      const mimeOut=blob.type==='image/png'&&quality>=1?'image/png':'image/jpeg';
      res(canvas.toDataURL(mimeOut,quality));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);_blobToB64(blob).then(res);};
    img.src=url;
  });
}

// Internal helpers
function _blobToB64(blob){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result);
    r.readAsDataURL(blob);
  });
}

function _getExportSettings(){
  const mode=(document.querySelector('input[name="imgQuality"]:checked')||{}).value||'compress';
  const maxDim=parseInt((document.getElementById('sliderMaxDim')||{}).value||1280);
  const quality=parseInt((document.getElementById('sliderQuality')||{}).value||82)/100;
  return {mode,maxDim,quality};
}
