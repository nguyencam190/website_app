export function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

export function _relTime(ts){const d=Math.floor((Date.now()-ts)/60000);if(d<1)return'Vừa xong';if(d<60)return d+'ph trước';if(d<1440)return Math.floor(d/60)+'h trước';return Math.floor(d/1440)+' ngày';}
