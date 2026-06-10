import { state } from '../core/state.js';
import { _idbGet, _idbSet, _idbDel, _revokeUrl, _compressForExport, persist } from '../core/storage.js';
import { escH } from '../utils/helpers.js';
import { lbShow, setHoveredTblImg, _hoveredTblImg } from './media.js';

// TABLE EDITING
let _activeTd=null;
// ══════════════════════════════════════════════════════════
// TABLE COLUMN / ROW SELECTOR + COLOR SAVER
// ══════════════════════════════════════════════════════════
let _selTable=null,_selType=null,_selIdx=-1; // active selection state

// Clear all col/row selections
export function tblClearSel(){
  document.querySelectorAll('.tbl-col-selected,.tbl-row-selected').forEach(e=>{
    e.classList.remove('tbl-col-selected','tbl-row-selected');
  });
  document.querySelectorAll('tr.tbl-row-selected').forEach(e=>e.classList.remove('tbl-row-selected'));
  _selTable=null;_selType=null;_selIdx=-1;
  const p=document.getElementById('tblSelPanel');if(p)p.classList.remove('on');
}

// Select entire column (by th index in row-0)
export function tblSelectCol(table,colIdx,triggerEl){
  tblClearSel();
  _selTable=table;_selType='col';_selIdx=colIdx;
  // Set _activeTd so add/delete functions know which column
  _activeTd=table.rows[0]&&table.rows[0].cells[colIdx]||null;
  // Highlight all cells in this column
  Array.from(table.rows).forEach(row=>{
    const cell=row.cells[colIdx];if(cell)cell.classList.add('tbl-col-selected');
  });
  _openSelPanel('Cột','col',colIdx,table,triggerEl);
}

// Select entire row
export function tblSelectRow(table,rowIdx,triggerEl){
  tblClearSel();
  _selTable=table;_selType='row';_selIdx=rowIdx;
  // Set _activeTd to first data cell (not row-num) in this row
  const row=table.rows[rowIdx];
  if(row){
    row.classList.add('tbl-row-selected');
    const numCell=row.querySelector('.tbl-row-num');if(numCell)numCell.classList.add('tbl-row-selected');
    // Find first non-row-num cell for _activeTd
    _activeTd=Array.from(row.cells).find(c=>!c.classList.contains('tbl-row-num'))||null;
  }
  _openSelPanel('Hàng','row',rowIdx,table,triggerEl);
}

// Build and show the color selection panel (actions + color)
function _openSelPanel(title,type,idx,table,triggerEl){
  const panel=document.getElementById('tblSelPanel');if(!panel)return;
  const dark=_isDarkMode();
  panel.innerHTML='';

  // ── Header ──────────────────────────────────────────────
  const hdr=document.createElement('div');hdr.className='tbl-sel-panel-title';
  hdr.innerHTML='<span>'+title+'</span>';
  const closeBtn=document.createElement('button');closeBtn.textContent='✕';closeBtn.title='Đóng';
  closeBtn.onclick=tblClearSel;
  hdr.appendChild(closeBtn);panel.appendChild(hdr);

  // ── Action buttons (Add/Delete col or row) ───────────────
  const actWrap=document.createElement('div');
  actWrap.style.cssText='display:flex;flex-direction:column;gap:2px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #334155';

  function mkBtn(icon,label,danger,onClick){
    const btn=document.createElement('button');
    btn.style.cssText='display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:5px;background:transparent;color:'+(danger?'#f87171':'#cbd5e1')+';cursor:pointer;font-size:12px;font-family:var(--font);transition:.12s;text-align:left';
    btn.innerHTML='<i class="ti ti-'+icon+'" style="font-size:14px;flex-shrink:0"></i><span>'+label+'</span>';
    btn.onmouseenter=()=>btn.style.background=danger?'rgba(239,68,68,.15)':'rgba(255,255,255,.07)';
    btn.onmouseleave=()=>btn.style.background='transparent';
    btn.onclick=()=>{tblClearSel();onClick();};
    return btn;
  }

  if(type==='col'){
    actWrap.appendChild(mkBtn('column-insert-left','Thêm cột bên trái',false,tblAddColLeft));
    actWrap.appendChild(mkBtn('column-insert-right','Thêm cột bên phải',false,tblAddColRight));
    actWrap.appendChild(mkBtn('trash','Xóa cột này',true,tblDelCol));
    // Divider + distribute equally (keeps # column fixed)
    const divD=document.createElement('div');divD.style.cssText='border-top:1px solid #1e293b;margin:3px 0';actWrap.appendChild(divD);
    actWrap.appendChild(mkBtn('layout-distribute-horizontal','Chia đều độ rộng các cột',false,
      ()=>tblDistributeColumns(table)));
  } else {
    // ── Check if this row is a Custom Layout Row ──────────────
    const currentRow=table&&idx>=0?table.rows[idx]:null;
    const isInnerRow=currentRow&&currentRow.dataset.innerrow==='1';
    const innerTbl=currentRow?.querySelector('table.tbl-inner-row');

    if(isInnerRow&&innerTbl){
      // ── Số ô hiện tại ─────────────────────────────────────
      const curCells=innerTbl.querySelectorAll('tr td').length;

      // ── Quick-set số ô: [1][2][3][4][5][6] ───────────────
      const cellCountWrap=document.createElement('div');
      cellCountWrap.style.cssText='margin-bottom:6px';
      const cellCountLbl=document.createElement('div');
      cellCountLbl.style.cssText='font-size:10px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px';
      cellCountLbl.textContent='Số ô ('+ curCells +' hiện tại)';
      cellCountWrap.appendChild(cellCountLbl);
      const presetRow=document.createElement('div');
      presetRow.style.cssText='display:flex;gap:4px;flex-wrap:wrap';
      [1,2,3,4,5,6].forEach(n=>{
        const btn=document.createElement('button');
        btn.textContent=n;
        btn.title=n+' ô';
        const isActive=n===curCells;
        btn.style.cssText='flex:1;min-width:28px;padding:5px 2px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--font);border:1px solid '+(isActive?'var(--accent)':'#334155')+';background:'+(isActive?'var(--accent)':'transparent')+';color:'+(isActive?'#fff':'#94a3b8')+';transition:.1s';
        btn.onmouseenter=()=>{if(!isActive)btn.style.background='rgba(255,255,255,.07)';};
        btn.onmouseleave=()=>{if(!isActive)btn.style.background='transparent';};
        btn.onclick=()=>{tblClearSel();tblInnerSetCellCount(innerTbl,n);};
        presetRow.appendChild(btn);
      });
      cellCountWrap.appendChild(presetRow);
      actWrap.appendChild(cellCountWrap);

      // ── Divider ────────────────────────────────────────────
      const divI0=document.createElement('div');divI0.style.cssText='border-top:1px solid #1e293b;margin:3px 0 5px';actWrap.appendChild(divI0);

      // ── Thêm / Xóa ô thủ công ────────────────────────────
      actWrap.appendChild(mkBtn('layout-columns-insert-right','Thêm 1 ô vào hàng',false,
        ()=>tblInnerAddCell(innerTbl)));
      actWrap.appendChild(mkBtn('column-remove-right','Xóa ô cuối cùng',false,()=>{
        const cells=innerTbl.querySelectorAll('tr td');
        if(cells.length>1)tblInnerDeleteCell(cells[cells.length-1],innerTbl);
        else toast('Đã là 1 ô, không thể xóa thêm','error');
      }));

      // ── Divider ────────────────────────────────────────────
      const divI=document.createElement('div');divI.style.cssText='border-top:1px solid #1e293b;margin:5px 0 3px';actWrap.appendChild(divI);
      actWrap.appendChild(mkBtn('row-insert-top','Thêm hàng thường phía trên',false,tblAddRowAbove));
      actWrap.appendChild(mkBtn('row-insert-bottom','Thêm hàng thường phía dưới',false,tblAddRowBelow));
      const divI2=document.createElement('div');divI2.style.cssText='border-top:1px solid #1e293b;margin:3px 0';actWrap.appendChild(divI2);
      actWrap.appendChild(mkBtn('table','Hoàn nguyên về hàng thường',false,
        ()=>tblRevertInnerRow(idx,table)));
      actWrap.appendChild(mkBtn('trash','Xóa hàng này',true,tblDelRow));
    } else {
      // ── Normal row controls ───────────────────────────────
      actWrap.appendChild(mkBtn('row-insert-top','Thêm hàng phía trên',false,tblAddRowAbove));
      actWrap.appendChild(mkBtn('row-insert-bottom','Thêm hàng phía dưới',false,tblAddRowBelow));
      actWrap.appendChild(mkBtn('trash','Xóa hàng này',true,tblDelRow));
      // Divider + Custom Layout Row converter
      const div=document.createElement('div');div.style.cssText='border-top:1px solid #1e293b;margin:3px 0';actWrap.appendChild(div);
      // Convert to Nested Row button
      actWrap.appendChild(mkBtn('layout-board-split','Chuyển thành hàng tùy biến',false,
        ()=>tblConvertRowToInner(idx,table)));
      // Toggle row numbers
      const hasNums=table&&table.dataset.rownums!=='0';
      actWrap.appendChild(mkBtn(hasNums?'eye-off':'list-numbers',
        hasNums?'Ẩn cột số thứ tự':'Hiện cột số thứ tự',false,tblToggleRowNums));
      // Delete entire table
      actWrap.appendChild(mkBtn('table-off','Xóa toàn bộ bảng',true,tblDelTable));
      // Unmerge if active cell is merged
      if(_activeTd&&(((_activeTd.colSpan||1)>1)||((_activeTd.rowSpan||1)>1))){
        const div2=document.createElement('div');div2.style.cssText='border-top:1px solid #1e293b;margin:3px 0';actWrap.appendChild(div2);
        actWrap.appendChild(mkBtn('layout-grid','Bỏ gộp ô hiện tại',false,()=>{
          _mergeTable=_activeTd.closest('table');
          if(_mergeTable){_mergeSelStart=_cellRC(_activeTd);_mergeSelEnd={..._mergeSelStart};}
          tblUnmergeCells();tblClearSel();
        }));
      }
    }
  }
  panel.appendChild(actWrap);

  // ── Color section label ──────────────────────────────────
  const colorLbl=document.createElement('div');
  colorLbl.style.cssText='font-size:10px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px';
  colorLbl.textContent='Màu nền';
  panel.appendChild(colorLbl);

  // Clear color button
  const clearRow=document.createElement('div');clearRow.style.cssText='margin-bottom:7px';
  const clearBtn=document.createElement('button');
  clearBtn.style.cssText='width:100%;padding:4px 8px;border:1px dashed #334155;border-radius:5px;background:transparent;color:#64748b;cursor:pointer;font-size:11px;font-family:var(--font);transition:.12s;text-align:left;display:flex;align-items:center;gap:5px';
  clearBtn.innerHTML='<span>✕</span> Xóa màu';
  clearBtn.onmouseenter=()=>{clearBtn.style.borderColor='#ef4444';clearBtn.style.color='#f87171';};
  clearBtn.onmouseleave=()=>{clearBtn.style.borderColor='#334155';clearBtn.style.color='#64748b';};
  clearBtn.onclick=()=>{_applySelColor(null,null,null,type,idx,table);tblClearSel();};
  clearRow.appendChild(clearBtn);panel.appendChild(clearRow);

  // Color grid from TEXT_MATRIX
  TEXT_MATRIX.forEach((row,r)=>{
    const rowEl=document.createElement('div');rowEl.style.cssText='display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:2px';
    row.forEach(([lc,dc],c)=>{
      const color=dark?dc:lc;
      const sw=document.createElement('div');
      sw.style.cssText='height:18px;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:all .1s;background:'+color;
      sw.title=color;
      sw.onmouseenter=()=>sw.style.transform='scale(1.22)';
      sw.onmouseleave=()=>sw.style.transform='';
      sw.onmousedown=e=>e.preventDefault();
      sw.onclick=()=>{_applySelColor(color,r,c,type,idx,table);tblClearSel();};
      rowEl.appendChild(sw);
    });
    panel.appendChild(rowEl);
  });

  // Custom color
  const customRow=document.createElement('div');
  customRow.style.cssText='display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid #334155';
  const customLbl=document.createElement('span');customLbl.style.cssText='font-size:10.5px;color:#64748b;flex:1';customLbl.textContent='Màu tùy chỉnh';
  const customBtn=document.createElement('div');
  customBtn.style.cssText='width:22px;height:22px;border-radius:5px;border:1.5px dashed #475569;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden';
  customBtn.innerHTML='<i class="ti ti-plus" style="font-size:11px;color:#64748b;pointer-events:none"></i>';
  const customInp=document.createElement('input');customInp.type='color';customInp.value='#ffffff';
  customInp.style.cssText='position:absolute;inset:-4px;opacity:0;cursor:pointer;width:200%;height:200%';
  customInp.onchange=function(){_applySelColor(this.value,null,null,type,idx,table);tblClearSel();};
  customBtn.appendChild(customInp);
  customRow.appendChild(customLbl);customRow.appendChild(customBtn);
  panel.appendChild(customRow);

  // Position panel near trigger
  panel.style.visibility='hidden';panel.classList.add('on');
  const rect=triggerEl.getBoundingClientRect();
  const pw=panel.offsetWidth||210,ph=panel.offsetHeight||260;
  let left=rect.left+(rect.width/2)-(pw/2),top=rect.bottom+6;
  if(left+pw>window.innerWidth-8)left=window.innerWidth-pw-8;
  if(left<8)left=8;
  if(top+ph>window.innerHeight-8)top=rect.top-ph-4;
  panel.style.left=left+'px';panel.style.top=top+'px';panel.style.visibility='';
}

// Apply color to all cells in col or row, with dark-mode tracking
function _applySelColor(color,r,c,type,idx,table){
  if(!table)return;
  const applyCell=(cell)=>{
    if(cell.classList.contains('tbl-row-num'))return;
    if(color===null){
      cell.style.background='';
      delete cell.dataset.cpbgrow;delete cell.dataset.cpbgcol;delete cell.dataset.customBg;
    } else {
      cell.style.background=color;
      cell.dataset.customBg=color;
      if(r!=null){cell.dataset.cpbgrow=r;cell.dataset.cpbgcol=c;}
    }
  };
  if(type==='col'){
    Array.from(table.rows).forEach(row=>{if(row.cells[idx])applyCell(row.cells[idx]);});
  } else {
    const row=table.rows[idx];if(row)Array.from(row.cells).forEach(applyCell);
  }
  onContentChange();
}

// Close panel on outside click
document.addEventListener('mousedown',e=>{
  if(_selTable&&!e.target.closest('#tblSelPanel')&&!e.target.closest('.tbl-col-sel')&&!e.target.closest('.tbl-row-sel'))
    tblClearSel();
},{capture:true});

// ── Toggle số thứ tự hàng ───────────────────────────────────
export function tblToggleRowNums(){
  const td=_activeTd;if(!td)return;
  const table=td.closest('table');if(!table)return;
  const current=table.dataset.rownums!=='0'; // currently showing?
  table.dataset.rownums=current?'0':'1';     // toggle
  tblHideDropdown();
  tblEqualizeColumns(table);
  tblAttachTable(table);
  onContentChange();
  toast(current?'Da an cot so thu tu':'Da hien cot so thu tu','info');
}

// ═══════════════════════════════════════════════════════════════════════
// NESTED ROW ENGINE — Confluence-style Custom Layout Row
// ═══════════════════════════════════════════════════════════════════════
const INNER_ROW_DEFAULT_CELLS=3;

// ── Count DATA columns of outer table (excludes row-num col) ─────────────
function _tblDataCols(table){
  // Use a non-inner-row row to count true data cols
  let dataCols=0;
  for(const row of Array.from(table.rows)){
    if(row.dataset.innerrow==='1')continue; // skip custom rows
    let n=0;
    Array.from(row.cells).forEach(c=>{
      if(!c.classList.contains('tbl-row-num'))n+=(c.colSpan||1);
    });
    if(n>dataCols)dataCols=n;
  }
  if(!dataCols){
    // Fallback: use colgroup minus row-num col
    const cg=table.querySelector('colgroup');
    const showNums=table.dataset.rownums!=='0';
    dataCols=(cg?cg.querySelectorAll('col').length:1)-(showNums?1:0);
  }
  return Math.max(1,dataCols);
}

// ── Convert a normal row → Custom Layout Row ─────────────────────────────
export function tblConvertRowToInner(rowIdx,table){
  const row=table.rows[rowIdx];
  if(!row||row.dataset.innerrow==='1')return;

  // Gather current data cells (excluding row-num)
  const dataCells=Array.from(row.cells).filter(c=>!c.classList.contains('tbl-row-num'));
  let colSpanSum=0;dataCells.forEach(c=>colSpanSum+=(c.colSpan||1));
  if(colSpanSum<1)colSpanSum=_tblDataCols(table);

  // Remove all data cells from this row
  dataCells.forEach(c=>c.remove());

  // Create container cell spanning all data columns
  const container=document.createElement('td');
  container.className='tbl-inner-container';
  container.setAttribute('colspan',colSpanSum);
  container.contentEditable='false'; // container itself is NOT editable
  row.appendChild(container);
  row.dataset.innerrow='1';
  row.dataset.innercols=colSpanSum; // remember original span for revert

  // Build inner table with default cells
  const innerTbl=_tblBuildInnerTable(INNER_ROW_DEFAULT_CELLS);
  container.appendChild(innerTbl);
  _tblAttachInnerRow(innerTbl);

  onContentChange();
  toast('Đã chuyển sang hàng tùy biến ('+INNER_ROW_DEFAULT_CELLS+' ô)','success');
}

// ── Revert Custom Layout Row → normal row ────────────────────────────────
export function tblRevertInnerRow(rowIdx,table){
  const row=table.rows[rowIdx];
  if(!row||row.dataset.innerrow!=='1')return;

  // Remove container + inner table
  Array.from(row.cells).forEach(c=>{if(!c.classList.contains('tbl-row-num'))c.remove();});
  delete row.dataset.innerrow;

  // Restore normal data cells from outer table data-cols count
  const dataCols=_tblDataCols(table);
  for(let i=0;i<dataCols;i++){
    const td=document.createElement('td');
    td.contentEditable='true';
    row.appendChild(td);
  }

  // Re-attach full outer table
  tblAttachTable(table);
  onContentChange();
  toast('Đã khôi phục hàng thông thường','info');
}

// ── Build inner table DOM ─────────────────────────────────────────────────
function _tblBuildInnerTable(cellCount,savedWidths){
  const innerTbl=document.createElement('table');
  innerTbl.className='tbl-inner-row';
  innerTbl.dataset.innercells=cellCount;

  // Colgroup: equal widths by default, or restored from saved data
  const cg=document.createElement('colgroup');
  const wArr=savedWidths?(savedWidths.split(',')):[]; // may be empty
  for(let i=0;i<cellCount;i++){
    const col=document.createElement('col');
    const w=wArr[i]||(Math.round(100/cellCount)+'%');
    col.style.width=w;
    cg.appendChild(col);
  }
  innerTbl.appendChild(cg);

  // Single data row
  const tr=document.createElement('tr');
  for(let i=0;i<cellCount;i++){
    const td=document.createElement('td');
    td.contentEditable='true';
    tr.appendChild(td);
  }
  innerTbl.appendChild(tr);

  // Add-cell button at the right end
  const addBtn=document.createElement('button');
  addBtn.className='tbl-inner-add-btn';
  addBtn.contentEditable='false';
  addBtn.title='Thêm ô vào hàng tùy biến';
  addBtn.innerHTML='+';
  addBtn.addEventListener('mousedown',e=>e.preventDefault());
  addBtn.addEventListener('click',e=>{e.stopPropagation();tblInnerAddCell(innerTbl);});
  innerTbl.appendChild(addBtn);

  return innerTbl;
}

// ── Attach full interactivity to inner table ──────────────────────────────
function _tblAttachInnerRow(innerTbl){
  if(!innerTbl)return;
  const cells=Array.from(innerTbl.querySelectorAll('tr td'));
  const cellCount=cells.length;
  if(!cellCount)return;

  // Rebuild colgroup to match current cells
  let cg=innerTbl.querySelector('colgroup');
  if(!cg){cg=document.createElement('colgroup');innerTbl.insertBefore(cg,innerTbl.firstChild);}
  while(cg.children.length<cellCount)cg.appendChild(document.createElement('col'));
  while(cg.children.length>cellCount)cg.removeChild(cg.lastChild);
  // Restore from data-innerwidths if present
  const wArr=(innerTbl.dataset.innerwidths||'').split(',');
  Array.from(cg.children).forEach((col,i)=>{
    if(!col.style.width)col.style.width=wArr[i]||(Math.round(100/cellCount)+'%');
  });

  cells.forEach((cell,ci)=>{
    // Ensure editability — critical for text input and slash menu
    cell.contentEditable='true';
    cell.style.position='relative';

    // Remove stale resize handles and drop overlays
    cell.querySelectorAll('.tbl-inner-resize,.tbl-cell-drop').forEach(e=>e.remove());

    // ── Column resize handle (on all except last cell) ────
    if(ci<cells.length-1){
      const rh=document.createElement('div');
      rh.className='tbl-inner-resize';
      rh.contentEditable='false';
      rh.addEventListener('mousedown',e=>{
        e.preventDefault();e.stopPropagation();
        _tblInnerResizeStart(e,innerTbl,cell,ci);
      });
      cell.appendChild(rh);
    }

    // ── Click: set _activeTd so slash menu context is correct ──
    cell.addEventListener('click',()=>{_activeTd=cell;});

    // ── Right-click: inner cell context menu ─────────────────
    cell.addEventListener('contextmenu',e=>{
      e.preventDefault();e.stopPropagation();
      _activeTd=cell;
      _openInnerCellMenu(e.clientX,e.clientY,cell,innerTbl);
    });

    // ── Drag & drop image support ─────────────────────────────
    const dropOv=document.createElement('div');dropOv.className='tbl-cell-drop';
    dropOv.contentEditable='false';
    dropOv.innerHTML='<i class="ti ti-photo-up"></i>';
    cell.appendChild(dropOv);
    cell.addEventListener('dragover',e=>{
      if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.stopPropagation();dropOv.classList.add('on');}
    });
    cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))dropOv.classList.remove('on');});
    cell.addEventListener('drop',async e=>{
      e.preventDefault();e.stopPropagation();dropOv.classList.remove('on');
      const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
      if(files.length)await tblInsertImages(cell,files);
    });
    cell.addEventListener('paste',async e=>{
      const imgs=Array.from(e.clipboardData?.items||[]).filter(i=>i.type.startsWith('image/'));
      if(imgs.length){e.preventDefault();await tblInsertImages(cell,imgs.map(i=>i.getAsFile()));}
    });
  });

  innerTbl.dataset.innercells=cellCount;
}

// ── Inner column resize (pixel → renormalise to % after drag) ────────────
function _tblInnerResizeStart(e,innerTbl,cell,colIdx){
  const handle=e.currentTarget;handle.classList.add('dragging');
  const startX=e.clientX;
  const cg=innerTbl.querySelector('colgroup');
  const cgCols=cg?Array.from(cg.querySelectorAll('col')):[];
  const thisCol=cgCols[colIdx];
  const nextCol=cgCols[colIdx+1];
  const startPx=cell.offsetWidth;
  const nextStartPx=innerTbl.querySelectorAll('tr td')[colIdx+1]?.offsetWidth||100;
  const minPx=40;

  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;cursor:col-resize;z-index:9999';
  document.body.appendChild(overlay);

  function move(e2){
    const dx=e2.clientX-startX;
    const newPx=Math.max(minPx,startPx+dx);
    if(thisCol)thisCol.style.width=newPx+'px';
    // Don't touch other columns — inner table uses max-content-like behaviour
  }
  function up(){
    handle.classList.remove('dragging');
    overlay.remove();
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
    // Normalise ALL cols to % so resize is proportional on window resize
    const cells=Array.from(innerTbl.querySelectorAll('tr td'));
    const totalRendered=innerTbl.offsetWidth||400;
    if(cg&&totalRendered>0){
      Array.from(cg.children).forEach((col,i)=>{
        const w=cells[i]?.offsetWidth||0;
        col.style.width=Math.max(10,Math.round(w/totalRendered*100))+'%';
      });
    }
    onContentChange();
  }
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',up);
}

// ── Add cell to inner table ───────────────────────────────────────────────
export function tblInnerAddCell(innerTbl){
  if(!innerTbl)return;
  const tr=innerTbl.querySelector('tr');if(!tr)return;
  const td=document.createElement('td');td.contentEditable='true';
  tr.appendChild(td);
  _tblAttachInnerRow(innerTbl);
  onContentChange();
  toast('Đã thêm ô','success');
}

// ── Set exact number of cells in inner table ─────────────────────────────
export function tblInnerSetCellCount(innerTbl,n){
  if(!innerTbl||n<1||n>20)return;
  const tr=innerTbl.querySelector('tr');if(!tr)return;
  const current=tr.cells.length;
  if(n===current)return; // nothing to do

  if(n>current){
    // Add cells
    for(let i=current;i<n;i++){
      const td=document.createElement('td');td.contentEditable='true';tr.appendChild(td);
    }
  } else {
    // Remove trailing cells (keep content of remaining ones)
    while(tr.cells.length>n)tr.cells[tr.cells.length-1].remove();
  }

  // Equalise colgroup to new count with equal % widths
  let cg=innerTbl.querySelector('colgroup');
  if(!cg){cg=document.createElement('colgroup');innerTbl.insertBefore(cg,innerTbl.firstChild);}
  while(cg.children.length<n)cg.appendChild(document.createElement('col'));
  while(cg.children.length>n)cg.removeChild(cg.lastChild);
  Array.from(cg.children).forEach(col=>{col.style.width=Math.round(100/n)+'%';});

  _tblAttachInnerRow(innerTbl);
  onContentChange();
  toast('Đã đặt '+n+' ô','success');
}

// ── Delete a specific cell from inner table ───────────────────────────────
export function tblInnerDeleteCell(cell,innerTbl){
  if(!cell||!innerTbl)return;
  const tr=innerTbl.querySelector('tr');
  if(!tr||tr.cells.length<=1){toast('Phải giữ ít nhất 1 ô','error');return;}
  cell.remove();
  _tblAttachInnerRow(innerTbl);
  onContentChange();
  toast('Đã xoá ô','info');
}

// ── Context menu for inner cell (right-click) ─────────────────────────────
function _openInnerCellMenu(x,y,cell,innerTbl){
  let menu=document.getElementById('tblInnerCellMenu');
  if(!menu){
    menu=document.createElement('div');menu.id='tblInnerCellMenu';
    menu.className='tbl-dropdown';document.body.appendChild(menu);
  }
  // Store refs on window for onclick handlers
  window._innerCell=cell;window._innerTbl=innerTbl;
  menu.innerHTML=
    '<div class="tbl-label">Ô tùy biến</div>'+
    '<button class="tbl-item" onclick="tblInnerAddCell(window._innerTbl);document.getElementById(\'tblInnerCellMenu\').classList.remove(\'on\')">'+
      '<i class="ti ti-layout-columns-insert-right" style="font-size:15px;color:var(--text3)"></i> Thêm ô bên phải</button>'+
    '<div class="tbl-divider"></div>'+
    '<button class="tbl-item danger" onclick="tblInnerDeleteCell(window._innerCell,window._innerTbl);document.getElementById(\'tblInnerCellMenu\').classList.remove(\'on\')">'+
      '<i class="ti ti-trash"></i> Xoá ô này</button>'+
    '<div class="tbl-divider"></div>'+
    '<button class="tbl-item" onclick="_activeTd=window._innerCell.closest(\'table.tbl-inner-row\')?.closest(\'td.tbl-inner-container\')?.closest(\'tr\');tblRevertInnerRowFromCell(window._innerCell);document.getElementById(\'tblInnerCellMenu\').classList.remove(\'on\')">'+
      '<i class="ti ti-table" style="font-size:15px;color:var(--text3)"></i> Hoàn nguyên hàng thường</button>';
  const vw=window.innerWidth,vh=window.innerHeight;
  menu.style.left=Math.min(x,vw-240)+'px';
  menu.style.top=Math.min(y,vh-120)+'px';
  menu.classList.add('on');
  setTimeout(()=>document.addEventListener('mousedown',function once(e2){
    if(!menu.contains(e2.target)){menu.classList.remove('on');document.removeEventListener('mousedown',once);}
  }),60);
}

// ── Helper: revert inner row from a reference cell inside it ─────────────
export function tblRevertInnerRowFromCell(innerCell){
  const innerTbl=innerCell?.closest('table.tbl-inner-row');
  const container=innerTbl?.closest('td.tbl-inner-container');
  const row=container?.closest('tr');
  const outerTable=row?.closest('table');
  if(!row||!outerTable)return;
  const rowIdx=Array.from(outerTable.rows).indexOf(row);
  tblRevertInnerRow(rowIdx,outerTable);
}

// ── Wrap table in .tbl-outer (for edge resize) ──────────────
function _tblWrapOuter(table){
  if(table.parentElement&&table.parentElement.classList.contains('tbl-outer'))return;
  const wrap=document.createElement('div');wrap.className='tbl-outer';
  table.parentNode.insertBefore(wrap,table);wrap.appendChild(table);
  // Do NOT force table.style.width='100%' — CSS width:max-content locks actual column sizes
  table.style.width='';
}

function _tblAddEdgeHandles(table){
  const wrap=table.parentElement;
  if(!wrap||!wrap.classList.contains('tbl-outer'))return;
  wrap.querySelectorAll('.tbl-edge-h').forEach(e=>e.remove());
  ['left','right'].forEach(side=>{
    const h=document.createElement('div');
    h.className='tbl-edge-h tbl-edge-'+side;
    h.title=side==='left'?'Kéo để thay đổi vị trí/độ rộng':'Kéo để thay đổi độ rộng';
    h.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      _tblEdgeDragStart(e,wrap,table,side);
    });
    wrap.appendChild(h);
  });
}

function _tblEdgeDragStart(e,wrap,table,side){
  const startX=e.clientX;
  const startW=wrap.offsetWidth;
  const startL=parseFloat(wrap.style.marginLeft)||0;
  const handle=e.target;handle.classList.add('dragging');
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;cursor:ew-resize;z-index:9999';
  document.body.appendChild(overlay);

  function move(e2){
    const dx=e2.clientX-startX;
    if(side==='right'){
      const nw=Math.max(160,startW+dx);
      wrap.style.width=nw+'px';
    } else {
      // Left edge: move left boundary → resize from left
      const nw=Math.max(160,startW-dx);
      const nl=startL+dx;
      wrap.style.width=nw+'px';
      wrap.style.marginLeft=nl+'px';
    }
  }
  function up(){
    handle.classList.remove('dragging');
    overlay.remove();
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
    onContentChange();
  }
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',up);
}

// ══════════════════════════════════════════════════════════
// tblEqualizeColumns — dùng <colgroup> thay vì calc() trên cell
// Đây là cách duy nhất đảm bảo không có ghost column với table-layout:fixed
// ══════════════════════════════════════════════════════════
// Default pixel width per new data column (≈ 7mm at 96dpi = ~26px, use 120px for readability)
const TBL_DEFAULT_COL_W = 120;
const TBL_ROWNUM_W      = 36;

export function tblEqualizeColumns(table){
  if(!table)return;
  table.style.tableLayout='fixed';
  table.style.borderCollapse='collapse';
  table.style.width=''; // Let CSS (width:max-content) determine table width from colgroup

  const firstRow=table.rows[0];if(!firstRow)return;
  const hasRowNum=firstRow.cells[0]&&firstRow.cells[0].classList.contains('tbl-row-num');
  const totalCols=firstRow.cells.length;

  // ── Remove any existing colgroup ─────────────────────────
  const existingCg=table.querySelector('colgroup');
  if(existingCg)existingCg.remove();

  // ── Build fresh colgroup with EXPLICIT pixel widths ───────
  // Every col gets a fixed pixel width so width:max-content has a concrete anchor.
  // Row-num col → 36px; data cols → TBL_DEFAULT_COL_W (120px).
  const cg=document.createElement('colgroup');
  cg.dataset.auto='1'; // marks as auto-equalized — user drag will clear this flag
  for(let i=0;i<totalCols;i++){
    const col=document.createElement('col');
    col.style.width=(i===0&&hasRowNum)?TBL_ROWNUM_W+'px':TBL_DEFAULT_COL_W+'px';
    cg.appendChild(col);
  }
  table.insertBefore(cg,table.firstChild);

  // ── Clear ALL inline widths from cells ────────────────────
  // colgroup is the ONLY width source with table-layout:fixed
  Array.from(table.rows).forEach(row=>{
    Array.from(row.cells).forEach(cell=>{
      cell.style.width='';
      cell.style.maxWidth='';
      if(!cell.classList.contains('tbl-row-num'))cell.style.minWidth='40px';
    });
  });
}

// ── Distribute data columns equally — KEEP row-num (#) column fixed ───────
export function tblDistributeColumns(table){
  if(!table)return;
  table.style.tableLayout='fixed';
  table.style.borderCollapse='collapse';

  const firstRow=table.rows[0];if(!firstRow)return;
  const hasRowNum=firstRow.cells[0]&&firstRow.cells[0].classList.contains('tbl-row-num');

  // True data-column count (sum of colSpan, excluding row-num)
  let dataCols=0;
  Array.from(firstRow.cells).forEach(c=>{
    if(!c.classList.contains('tbl-row-num'))dataCols+=(c.colSpan||1);
  });
  if(dataCols<1)return;

  // Available width = current rendered table width minus the fixed # column
  const tableW=table.offsetWidth||table.parentElement?.offsetWidth||800;
  const avail=Math.max(dataCols*40, tableW-(hasRowNum?TBL_ROWNUM_W:0));
  const eachW=Math.floor(avail/dataCols);

  // Rebuild colgroup: # stays fixed, all data cols get equal width
  let cg=table.querySelector('colgroup');
  if(!cg){cg=document.createElement('colgroup');table.insertBefore(cg,table.firstChild);}
  const totalColCount=(hasRowNum?1:0)+dataCols;
  while(cg.children.length<totalColCount)cg.appendChild(document.createElement('col'));
  while(cg.children.length>totalColCount)cg.removeChild(cg.lastChild);

  Array.from(cg.children).forEach((col,i)=>{
    if(hasRowNum&&i===0){col.style.width=TBL_ROWNUM_W+'px';return;}
    col.style.width=eachW+'px';
  });

  // This is a deliberate user action → NOT auto, so widths persist
  delete cg.dataset.auto;

  // Clear inline cell widths so colgroup is the single source of truth
  Array.from(table.rows).forEach(row=>{
    Array.from(row.cells).forEach(cell=>{
      if(cell.classList.contains('tbl-row-num'))return;
      cell.style.width='';cell.style.maxWidth='';
    });
  });

  tblClearSel();
  onContentChange();
  toast('Đã chia đều '+dataCols+' cột','success');
}

export function tblGetCellIndex(td){
  // Offset by 1 to skip the .tbl-row-num column
  const idx=Array.from(td.parentElement.cells).indexOf(td);
  return idx;
}
export function tblRealColIndex(td){
  // The actual data column index (0-based, excluding row-num col)
  return tblGetCellIndex(td)-1;
}
export function tblGetRowIndex(td){return Array.from(td.closest('table').rows).indexOf(td.parentElement);}

export function tblHideDropdown(){const dd=document.getElementById('tblDropdown');if(dd)dd.classList.remove('on');_activeTd=null;}
export function tblAddRowBelow(){const td=_activeTd;if(!td)return;const table=td.closest('table');
  // Count data columns only (skip row-num col)
  const dataCols=table.rows[0].cells.length-1;
  const nr=table.insertRow(tblGetRowIndex(td)+1);
  for(let i=0;i<dataCols;i++){nr.insertCell(i).innerHTML='Dữ liệu';}
  tblHideDropdown();onContentChange();tblAttachAll();toast('Đã thêm hàng','success');}
export function tblAddRowAbove(){const td=_activeTd;if(!td)return;const table=td.closest('table');
  const dataCols=table.rows[0].cells.length-1;
  const nr=table.insertRow(tblGetRowIndex(td));
  for(let i=0;i<dataCols;i++){nr.insertCell(i).innerHTML='Dữ liệu';}
  tblHideDropdown();onContentChange();tblAttachAll();toast('Đã thêm hàng','success');}
export function tblAddColRight(){const td=_activeTd;if(!td)return;const table=td.closest('table');const ci=tblGetCellIndex(td);Array.from(table.rows).forEach((row,ri)=>{const cell=ri===0?document.createElement('th'):document.createElement('td');cell.innerHTML=ri===0?'Cột mới':'Dữ liệu';row.insertBefore(cell,row.cells[ci+1]||null);});tblEqualizeColumns(table);tblHideDropdown();onContentChange();tblAttachAll();toast('Đã thêm cột','success');}
export function tblAddColLeft(){const td=_activeTd;if(!td)return;const table=td.closest('table');const ci=tblGetCellIndex(td);Array.from(table.rows).forEach((row,ri)=>{const cell=ri===0?document.createElement('th'):document.createElement('td');cell.innerHTML=ri===0?'Cột mới':'';row.insertBefore(cell,row.cells[ci]);});const cg=table.querySelector('colgroup');if(cg)cg.dataset.auto='1';tblEqualizeColumns(table);tblHideDropdown();onContentChange();tblAttachAll();toast('Đã thêm cột','success');}
export function tblDelRow(){const td=_activeTd;if(!td)return;const table=td.closest('table');if(table.rows.length<=1){toast('Phải có ít nhất 1 hàng','error');return;}table.deleteRow(tblGetRowIndex(td));tblHideDropdown();onContentChange();tblAttachAll();toast('Đã xoá hàng','info');}
export function tblDelCol(){const td=_activeTd;if(!td)return;const table=td.closest('table');if(table.rows[0].cells.length<=1){toast('Phải có ít nhất 1 cột','error');return;}const ci=tblGetCellIndex(td);Array.from(table.rows).forEach(row=>{if(row.cells[ci])row.deleteCell(ci);});tblEqualizeColumns(table);tblHideDropdown();onContentChange();tblAttachAll();toast('Đã xoá cột','info');}
export function tblDelTable(){
  const td=_activeTd;if(!td)return;
  const table=td.closest('table');if(!table)return;
  if(!confirm('Xóa bảng này?'))return;
  // Remove .tbl-outer wrapper if exists, else just the table
  const wrapper=table.closest('.tbl-outer');
  if(wrapper)wrapper.remove();else table.remove();
  _activeTd=null;
  tblHideDropdown();
  onContentChange();
  toast('Đã xóa bảng','info');
}

// ═══════════════════════════════════════════════════════════
// MERGE & CENTER ENGINE — simple, no virtual grid
// ═══════════════════════════════════════════════════════════
let _mergeTable=null;



function _cellRC(cell){
  const row=cell.closest('tr');
  return{ri:Array.from(row.closest('table').rows).indexOf(row),ci:Array.from(row.cells).indexOf(cell)};
}

function _selectRect(table){
  const all=Array.from(table.querySelectorAll('.tbl-cell-sel'));
  if(_activeTd&&!all.includes(_activeTd))all.push(_activeTd);
  if(!all.length)return;
  const pos=all.filter(c=>!c.classList.contains('tbl-row-num')).map(_cellRC);
  if(!pos.length)return;
  const minRi=Math.min(...pos.map(p=>p.ri)),maxRi=Math.max(...pos.map(p=>p.ri));
  const minCi=Math.min(...pos.map(p=>p.ci)),maxCi=Math.max(...pos.map(p=>p.ci));
  table.querySelectorAll('.tbl-cell-sel').forEach(c=>c.classList.remove('tbl-cell-sel'));
  Array.from(table.rows).forEach((row,ri)=>{
    if(ri<minRi||ri>maxRi)return;
    Array.from(row.cells).forEach((cell,ci)=>{
      if(ci>=minCi&&ci<=maxCi&&!cell.classList.contains('tbl-row-num'))
        cell.classList.add('tbl-cell-sel');
    });
  });
}

function _updateMergeBar(){
  const bar=document.getElementById('tblMergeBar');if(!bar)return;
  if(!_mergeTable){bar.classList.remove('on');return;}
  const cells=Array.from(_mergeTable.querySelectorAll('.tbl-cell-sel'))
    .filter(c=>!c.classList.contains('tbl-row-num'));
  if(cells.length>=1){
    bar.classList.add('on');
    // Update cell count
    const cnt=document.getElementById('tblMergeCount');
    if(cnt)cnt.textContent=cells.length+' ô đã chọn';
    // Show/hide merge buttons based on selection
    const mergeBtn=bar.querySelector('[onclick="tblMergeCells()"]');
    const colBtn=bar.querySelector('[onclick="tblMergeColsOnly()"]');
    const rowBtn=bar.querySelector('[onclick="tblMergeRowsOnly()"]');
    if(mergeBtn)mergeBtn.style.display=cells.length>=2?'flex':'none';
    if(colBtn)colBtn.style.display=cells.length>=2?'flex':'none';
    if(rowBtn)rowBtn.style.display=cells.length>=2?'flex':'none';
    // Position bar above table
    const rect=_mergeTable.getBoundingClientRect();
    const bw=bar.offsetWidth||380;
    const left=Math.max(8,Math.min(window.innerWidth-bw-8,rect.left+rect.width/2-bw/2));
    const top=rect.top>52?rect.top-48:rect.bottom+8;
    bar.style.left=left+'px';
    bar.style.top=Math.max(8,top)+'px';
  } else {
    bar.classList.remove('on');
  }
}

export function tblMergeCells(){
  if(!_mergeTable)return;
  const cells=Array.from(_mergeTable.querySelectorAll('.tbl-cell-sel'))
    .filter(c=>!c.classList.contains('tbl-row-num'));
  if(cells.length<2){tblClearCellSel();return;}
  const pos=cells.map(_cellRC);
  const minRi=Math.min(...pos.map(p=>p.ri)),maxRi=Math.max(...pos.map(p=>p.ri));
  const minCi=Math.min(...pos.map(p=>p.ci)),maxCi=Math.max(...pos.map(p=>p.ci));
  const anchorRow=_mergeTable.rows[minRi];
  const anchor=anchorRow&&anchorRow.cells[minCi];
  if(!anchor)return;
  anchor.innerHTML='';
  anchor.colSpan=maxCi-minCi+1;
  anchor.rowSpan=maxRi-minRi+1;
  anchor.style.textAlign='center';
  anchor.style.verticalAlign='middle';
  cells.filter(c=>c!==anchor).forEach(c=>c.remove());
  // Preserve colgroup widths across merge + tblAttachAll
  const _cg=_mergeTable.querySelector('colgroup');
  if(_cg){
    const ws=Array.from(_cg.querySelectorAll('col')).map(col=>col.style.width||'').join(',');
    _mergeTable.dataset.colwidths=ws;
  }
  tblClearCellSel();
  onContentChange();setTimeout(tblAttachAll,50);
  toast('Đã gộp '+cells.length+' ô','success');
}

// Merge only columns (colspan) on a single row
export function tblMergeColsOnly(){
  if(!_mergeTable)return;
  const cells=Array.from(_mergeTable.querySelectorAll('.tbl-cell-sel'))
    .filter(c=>!c.classList.contains('tbl-row-num'));
  if(cells.length<2){toast('Chọn ít nhất 2 ô trên cùng hàng','info');return;}
  const rows=[...new Set(cells.map(c=>c.closest('tr')))];
  rows.forEach(row=>{
    const rowCells=cells.filter(c=>c.closest('tr')===row);
    if(rowCells.length<2)return;
    const poss=rowCells.map(_cellRC);
    const minCi=Math.min(...poss.map(p=>p.ci));
    const anchor=rowCells.find(c=>_cellRC(c).ci===minCi);
    if(!anchor)return;
    anchor.colSpan=rowCells.length;
    anchor.style.textAlign='center';
    rowCells.filter(c=>c!==anchor).forEach(c=>c.remove());
  });
  tblClearCellSel();
  onContentChange();setTimeout(tblAttachAll,50);
  toast('Đã gộp cột','success');
}

// Merge only rows (rowspan) on a single column
export function tblMergeRowsOnly(){
  if(!_mergeTable)return;
  const cells=Array.from(_mergeTable.querySelectorAll('.tbl-cell-sel'))
    .filter(c=>!c.classList.contains('tbl-row-num'));
  if(cells.length<2){toast('Chọn ít nhất 2 ô trên cùng cột','info');return;}
  const poss=cells.map(_cellRC);
  const cols=[...new Set(poss.map(p=>p.ci))];
  cols.forEach(ci=>{
    const colCells=cells.filter(c=>_cellRC(c).ci===ci);
    if(colCells.length<2)return;
    const minRi=Math.min(...colCells.map(c=>_cellRC(c).ri));
    const anchor=colCells.find(c=>_cellRC(c).ri===minRi);
    if(!anchor)return;
    anchor.rowSpan=colCells.length;
    anchor.style.verticalAlign='middle';
    colCells.filter(c=>c!==anchor).forEach(c=>c.remove());
  });
  tblClearCellSel();
  onContentChange();setTimeout(tblAttachAll,50);
  toast('Đã gộp hàng','success');
}

export function tblUnmergeCells(){
  const cell=_activeTd;if(!cell)return;
  const table=cell.closest('table');if(!table)return;
  const cs=cell.colSpan||1,rs=cell.rowSpan||1;
  if(cs===1&&rs===1){toast('Ô chưa được gộp','info');return;}
  const ri=Array.from(table.rows).indexOf(cell.closest('tr'));
  const ci=Array.from(cell.closest('tr').cells).indexOf(cell);
  cell.colSpan=1;cell.rowSpan=1;
  for(let r=ri;r<ri+rs;r++){
    for(let c=ci;c<ci+cs;c++){
      if(r===ri&&c===ci)continue;
      const newCell=document.createElement(r===0?'th':'td');
      const targetRow=table.rows[r];if(!targetRow)continue;
      const ref=targetRow.cells[c]||null;
      if(ref)targetRow.insertBefore(newCell,ref);else targetRow.appendChild(newCell);
    }
  }
  tblClearCellSel();
  onContentChange();setTimeout(tblAttachAll,50);
  toast('Đã bỏ gộp ô','success');
}

export function tblClearCellSel(){
  if(_mergeTable)_mergeTable.querySelectorAll('.tbl-cell-sel').forEach(c=>c.classList.remove('tbl-cell-sel'));
  _mergeTable=null;
  const bar=document.getElementById('tblMergeBar');if(bar)bar.classList.remove('on');
}

document.addEventListener('mousedown',e=>{
  if(!e.target.closest('#tblMergeBar')&&!e.target.closest('.editor-content td')&&!e.target.closest('.editor-content th'))
    tblClearCellSel();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&_mergeTable)tblClearCellSel();
  // Undo / Redo
  if((e.ctrlKey||e.metaKey)&&!e.altKey){
    if(e.key==='z'&&!e.shiftKey){e.preventDefault();editorUndo();}
    else if((e.key==='y')||(e.key==='z'&&e.shiftKey)){e.preventDefault();editorRedo();}
  }
});

// ── Smart entry: 1 file → image, 2+ files → carousel ──────────
export async function tblInsertImages(cell, files){
  const imgs=Array.from(files).filter(f=>f&&f.type&&f.type.startsWith('image/'));
  if(!imgs.length)return;
  if(imgs.length===1){await tblInsertImage(cell,imgs[0]);}
  else{await tblInsertCarousel(cell,imgs);}
}

// ── Insert multiple images as carousel in a table cell ──────────
export async function tblInsertCarousel(cell,files){
  const srcs=[];
  for(const file of files){
    const blob=await _tblCompressBlob(file);
    if(!blob)continue;
    const sid=uid();
    try{await _idbPut(sid,blob);}catch(e){continue;}
    const objUrl=URL.createObjectURL(blob);
    _cacheUrl(sid,objUrl);
    srcs.push({src:objUrl,id:sid,name:file.name||'image'});
  }
  if(!srcs.length)return;
  // Clear existing content, keep UI buttons
  Array.from(cell.childNodes).forEach(node=>{
    if(node.nodeType===Node.TEXT_NODE||
       (node.nodeType===Node.ELEMENT_NODE&&!node.classList.contains('tbl-img-btn')&&!node.classList.contains('tbl-shadow-btn')&&!node.classList.contains('tbl-cell-drop')&&!node.classList.contains('tbl-row-resize-handle')&&!node.classList.contains('tbl-row-sel'))){
      node.remove();
    }
  });
  cell.classList.add('tbl-has-img','tbl-has-car');
  if(cell.offsetHeight<150)cell.style.height='180px';
  const car=_tblBuildCellCarousel(srcs,cell);
  // Store slide IDs for restore on page reload
  car.dataset.slideids=srcs.map(s=>s.id||'').join(',');
  car.dataset.slidenames=srcs.map(s=>s.name||'').join('|');
  cell.appendChild(car);
  onContentChange();
  toast('Đã tạo carousel '+srcs.length+' ảnh trong ô','success');
}

// ── Compress image for table cell (max 800px, 85%) ──────────────
// Compress image → returns Blob (stored in IDB, not base64)
export function _tblCompressBlob(file){
  return new Promise(res=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const MAX=1200;let{width:w,height:h}=img;
      if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      const mime=file.type==='image/png'?'image/png':'image/jpeg';
      c.toBlob(blob=>res(blob),mime,0.85);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);res(null);};
    img.src=url;
  });
}

// ── Build carousel DOM for a table cell ─────────────────────────
export function _tblBuildCellCarousel(srcs,cell){
  const total=srcs.length;
  const car=document.createElement('div');car.className='tbl-cell-car';
  car.dataset.caridx='0';car.dataset.cartotal=total;

  // Stage
  const stage=document.createElement('div');stage.className='tcc-stage';
  const inner=document.createElement('div');inner.className='tcc-inner';inner.id='tcci_'+Math.random().toString(36).slice(2);
  srcs.forEach(({src,name})=>{
    const slide=document.createElement('div');slide.className='tcc-slide';
    const img=document.createElement('img');img.src=src;img.alt=name;img.loading='lazy';
    slide.appendChild(img);inner.appendChild(slide);
  });
  stage.appendChild(inner);

  // Fullscreen btn
  const fsBtn=document.createElement('button');fsBtn.className='tcc-fs';
  fsBtn.innerHTML='<i class="ti ti-maximize" style="font-size:10px"></i>';
  fsBtn.onmousedown=e=>e.preventDefault();
  fsBtn.onclick=e=>{e.stopPropagation();_tccFullscreen(car,srcs);};
  stage.appendChild(fsBtn);

  // Counter
  const badge=document.createElement('div');badge.className='tcc-badge';badge.textContent='1/'+total;
  stage.appendChild(badge);

  // Arrows
  const prev=document.createElement('button');prev.className='tcc-btn prev';prev.innerHTML='&#8249;';
  prev.onmousedown=e=>e.preventDefault();prev.onclick=e=>{e.stopPropagation();_tccNav(car,-1,inner,badge,thumbsEl);};
  const next=document.createElement('button');next.className='tcc-btn next';next.innerHTML='&#8250;';
  next.onmousedown=e=>e.preventDefault();next.onclick=e=>{e.stopPropagation();_tccNav(car,1,inner,badge,thumbsEl);};
  stage.appendChild(prev);stage.appendChild(next);
  car.appendChild(stage);

  // Thumbnail strip
  const thumbsEl=document.createElement('div');thumbsEl.className='tcc-thumbs';
  srcs.forEach(({src},i)=>{
    const th=document.createElement('div');th.className='tcc-thumb'+(i===0?' on':'');
    const ti=document.createElement('img');ti.src=src;ti.loading='lazy';
    th.appendChild(ti);
    th.onmousedown=e=>e.preventDefault();
    th.onclick=e=>{e.stopPropagation();_tccGoTo(car,i,inner,badge,thumbsEl);};
    thumbsEl.appendChild(th);
  });
  car.appendChild(thumbsEl);

  // Mouse drag for stage navigation
  let mx=0,mdrag=false,mmoved=false;
  stage.addEventListener('mousedown',e=>{mx=e.clientX;mdrag=true;mmoved=false;e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!mdrag)return;if(Math.abs(e.clientX-mx)>5)mmoved=true;});
  document.addEventListener('mouseup',e=>{
    if(!mdrag)return;mdrag=false;
    if(mmoved){const d=e.clientX-mx;if(Math.abs(d)>30)_tccNav(car,d<0?1:-1,inner,badge,thumbsEl);}
    else{_tccFullscreen(car,srcs);}
  });

  // Hover tracking for delete
  car.addEventListener('mouseenter',()=>{setHoveredTblImg(car);});
  car.addEventListener('mouseleave',()=>{if(_hoveredTblImg===car)setHoveredTblImg(null);});

  return car;
}

function _tccNav(car,dir,inner,badge,thumbs){
  const total=parseInt(car.dataset.cartotal)||1;
  const cur=parseInt(car.dataset.caridx||0);
  _tccGoTo(car,((cur+dir)%total+total)%total,inner,badge,thumbs);
}
function _tccGoTo(car,idx,inner,badge,thumbs){
  const total=parseInt(car.dataset.cartotal)||1;
  idx=Math.max(0,Math.min(total-1,idx));
  car.dataset.caridx=idx;
  if(inner)inner.style.transform='translateX(-'+idx+'00%)';
  if(badge)badge.textContent=(idx+1)+'/'+total;
  if(thumbs){thumbs.querySelectorAll('.tcc-thumb').forEach((t,i)=>t.classList.toggle('on',i===idx));const at=thumbs.children[idx];if(at)at.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});}
  // Disable arrows
  const prev=car.querySelector('.tcc-btn.prev');const next=car.querySelector('.tcc-btn.next');
  if(prev)prev.disabled=idx===0;if(next)next.disabled=idx===total-1;
}
function _tccFullscreen(car,srcs){
  const idx=parseInt(car.dataset.caridx||0);
  const images=srcs.map(s=>({src:s.src,name:s.name||''}));
  lbShow(images, Math.min(idx,images.length-1));
}

// ── Insert image into a table cell (base64 — stored inline in HTML) ──
async function tblInsertImage(cell,file){
  if(!file||!file.type.startsWith('image/'))return;
  // Compress → Blob → IDB (không dùng base64 để tiết kiệm dung lượng)
  const blob=await _tblCompressBlob(file);
  if(!blob)return;
  const imgId=uid();
  try{await _idbPut(imgId,blob);}catch(e){toast('Lưu ảnh thất bại','error');return;}
  // Object URL for display
  const objUrl=URL.createObjectURL(blob);
  _cacheUrl(imgId,objUrl);
  const el=document.createElement('img');
  el.src=objUrl;el.alt=file.name||'image';
  el.dataset.tblimgid=imgId; // IDB reference (không lưu blob URL vào HTML)
  el.style.cssText='display:block;max-width:100%;max-height:100%;width:auto;height:auto;margin:0 auto;border-radius:5px;cursor:zoom-in;background:transparent';
  cell.classList.add('tbl-has-img');
  if(!cell.style.height&&cell.offsetHeight<80)cell.style.height='120px';
  el.onclick=()=>{lbShow([{src:objUrl,name:el.alt}]);};
  el.addEventListener('mouseenter',()=>{setHoveredTblImg(el);el.style.outline='2px solid var(--accent)';el.style.outlineOffset='2px';});
  el.addEventListener('mouseleave',()=>{if(_hoveredTblImg===el){setHoveredTblImg(null);}el.style.outline='';el.style.outlineOffset='';});
  // Clear existing text/content in cell, then insert image
  // (prevent text from overlapping image)
  const prevContent=cell.innerHTML;
  // Remove non-UI children (text, other imgs, but keep .tbl-img-btn, .tbl-shadow-btn, .tbl-cell-drop)
  Array.from(cell.childNodes).forEach(node=>{
    if(node.nodeType===Node.TEXT_NODE||
       (node.nodeType===Node.ELEMENT_NODE&&!node.classList.contains('tbl-img-btn')&&!node.classList.contains('tbl-shadow-btn')&&!node.classList.contains('tbl-cell-drop')&&!node.classList.contains('tbl-row-resize-handle')&&!node.classList.contains('tbl-row-sel'))){
      node.remove();
    }
  });
  cell.insertBefore(el,cell.querySelector('.tbl-img-btn')||null);
  // Add/refresh shadow button on cell
  const cell2=el.closest('td,th');
  if(cell2&&!cell2.querySelector('.tbl-shadow-btn')){
    const sb=document.createElement('button');sb.className='tbl-shadow-btn';sb.title='Bóng đổ hình';
    sb.innerHTML='<i class="ti ti-shadow" style="font-size:11px"></i>';
    sb.onmousedown=e=>{e.preventDefault();e.stopPropagation();};
    sb.onclick=e=>{e.stopPropagation();tblImgOpenShadowPanel(el,sb);};
    cell2.appendChild(sb);
  }
  onContentChange();toast('Đã thêm hình vào ô','success');
}
// Mini color swatch for table cell bg
// Apply color to cell(s) based on scope
function _tblApplyCellColor(color,r,c,scope){
  if(!_activeTd)return;
  const table=_activeTd.closest('table');
  const rowEl=_activeTd.closest('tr');

  const applyToCell=(cell,row,col)=>{
    if(cell.classList.contains('tbl-row-num'))return;
    if(color===null){
      cell.style.background='';
      delete cell.dataset.customBg;
      delete cell.dataset.cpbgrow;
      delete cell.dataset.cpbgcol;
    } else {
      cell.style.background=color;
      cell.dataset.customBg=color;
      cell.dataset.cpbgrow=row;
      cell.dataset.cpbgcol=col;
    }
  };

  if(scope==='cell'){
    applyToCell(_activeTd,r,c);
  } else if(scope==='row'){
    Array.from(rowEl.cells).forEach(cell=>applyToCell(cell,r,c));
  } else if(scope==='col'){
    const ci=Array.from(rowEl.cells).indexOf(_activeTd);
    Array.from(table.rows).forEach(row=>{
      if(row.cells[ci])applyToCell(row.cells[ci],r,c);
    });
  }
  onContentChange();
  tblHideDropdown();
}

export function tblBuildCellColorGrid(container){
  const dark=_isDarkMode();
  const wrap=document.createElement('div');
  wrap.style.cssText='padding:6px 8px;border-top:1px solid var(--border)';

  // ── Scope tab header ──────────────────────────────────────
  const header=document.createElement('div');
  header.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:6px';
  const title=document.createElement('div');
  title.style.cssText='font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.5px';
  title.textContent='Màu nền';
  header.appendChild(title);

  const tabs=document.createElement('div');tabs.className='tbl-scope-tabs';
  const scopeLabels=[['cell','Ô'],['row','Hàng'],['col','Cột']];
  let _scope='cell';
  scopeLabels.forEach(([val,label])=>{
    const tab=document.createElement('button');tab.className='tbl-scope-tab'+(val==='cell'?' active':'');
    tab.textContent=label;tab.type='button';
    tab.onmousedown=e=>e.preventDefault();
    tab.onclick=e=>{
      e.stopPropagation();
      _scope=val;
      tabs.querySelectorAll('.tbl-scope-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      // Update title
      const labels={cell:'Màu nền — Ô',row:'Màu nền — Cả hàng',col:'Màu nền — Cả cột'};
      title.textContent=labels[val];
    };
    tabs.appendChild(tab);
  });
  header.appendChild(tabs);
  wrap.appendChild(header);

  // ── Color grid ────────────────────────────────────────────
  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:repeat(8,1fr);gap:3px';

  // "No color" reset cell
  const none=document.createElement('div');
  none.style.cssText='width:18px;height:18px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3)';
  none.innerHTML='✕';none.title='Xóa màu nền';
  none.addEventListener('mouseenter',()=>{none.style.borderColor='var(--danger)';none.style.color='var(--danger)';});
  none.addEventListener('mouseleave',()=>{none.style.borderColor='var(--border)';none.style.color='var(--text3)';});
  none.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();_tblApplyCellColor(null,null,null,_scope);});
  grid.appendChild(none);

  // Palette swatches
  TEXT_MATRIX.forEach((row,r)=>{
    row.slice(0,7).forEach(([lc,dc],c)=>{
      const color=dark?dc:lc;
      const sw=document.createElement('div');
      sw.style.cssText='width:18px;height:18px;border-radius:4px;cursor:pointer;border:2px solid transparent;transition:transform .1s;background:'+color;
      sw.title=color;
      sw.addEventListener('mouseenter',()=>sw.style.transform='scale(1.22)');
      sw.addEventListener('mouseleave',()=>sw.style.transform='');
      sw.addEventListener('mousedown',e=>{
        e.preventDefault();e.stopPropagation();
        _tblApplyCellColor(color,r,c,_scope);
      });
      grid.appendChild(sw);
    });
  });
  wrap.appendChild(grid);

  // ── Custom color ──────────────────────────────────────────
  const customRow=document.createElement('div');
  customRow.style.cssText='display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:5px;border-top:1px solid var(--border)';
  const customLbl=document.createElement('span');customLbl.style.cssText='font-size:10.5px;color:var(--text2);flex:1';customLbl.textContent='Màu tùy chỉnh';
  const customBtn=document.createElement('div');
  customBtn.style.cssText='width:22px;height:22px;border-radius:5px;border:1.5px dashed var(--border2);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text3);position:relative;overflow:hidden';
  customBtn.innerHTML='<i class="ti ti-plus" style="font-size:11px;pointer-events:none"></i>';
  const customInp=document.createElement('input');customInp.type='color';customInp.value='#ffffff';
  customInp.style.cssText='position:absolute;inset:-4px;opacity:0;cursor:pointer;width:200%;height:200%';
  customInp.addEventListener('change',function(){
    _tblApplyCellColor(this.value,null,null,_scope);
  });
  customBtn.appendChild(customInp);
  customRow.appendChild(customLbl);customRow.appendChild(customBtn);
  wrap.appendChild(customRow);

  container.appendChild(wrap);
}

export function tblShowDropdown(td,triggerEl){
  _activeTd=td;let dd=document.getElementById('tblDropdown');
  if(!dd){dd=document.createElement('div');dd.id='tblDropdown';dd.className='tbl-dropdown';document.body.appendChild(dd);}
  // Rebuild content every time (reflects current table state)
  const _tbl=td.closest('table');
  const _hasRowNums=_tbl&&_tbl.dataset.rownums!=='0';
  dd.innerHTML='<div class="tbl-label">Hang</div>'
    +'<button class="tbl-item" onclick="tblAddRowAbove()"><i class="ti ti-row-insert-top"></i> Them hang phia tren</button>'
    +'<button class="tbl-item" onclick="tblAddRowBelow()"><i class="ti ti-row-insert-bottom"></i> Them hang phia duoi</button>'
    +'<button class="tbl-item danger" onclick="tblDelRow()"><i class="ti ti-trash"></i> Xoa hang nay</button>'
    +'<div class="tbl-divider"></div>'
    +'<div class="tbl-label">Cot</div>'
    +'<button class="tbl-item" onclick="tblAddColLeft()"><i class="ti ti-column-insert-left"></i> Them cot ben trai</button>'
    +'<button class="tbl-item" onclick="tblAddColRight()"><i class="ti ti-column-insert-right"></i> Them cot ben phai</button>'
    +'<button class="tbl-item danger" onclick="tblDelCol()"><i class="ti ti-trash"></i> Xoa cot nay</button>'
    +'<div class="tbl-divider"></div>'
    +'<div class="tbl-label">Cot so thu tu</div>'
    +'<button class="tbl-item" onclick="tblToggleRowNums()">'
      +'<i class="ti ti-'+(_hasRowNums?'eye-off':'list-numbers')+'"></i> '
      +(_hasRowNums?'An cot so thu tu':'Hien cot so thu tu')
    +'</button>'
    +'<div class="tbl-divider"></div>'
    +'<button class="tbl-item danger" onclick="tblDelTable()"><i class="ti ti-table-off"></i> Xoa bang</button>';

  const r=triggerEl.getBoundingClientRect();dd.style.visibility='hidden';dd.classList.add('on');
  const ddW=dd.offsetWidth||220,ddH=dd.offsetHeight||320;
  let top=r.bottom+4,left=r.right-ddW;
  if(top+ddH>window.innerHeight-8)top=r.top-ddH-4;if(left<8)left=8;
  dd.style.top=top+'px';dd.style.left=left+'px';dd.style.visibility='';
}

export function tblAttachAll(){
  document.querySelectorAll('.editor-content table').forEach(table=>{
    // Skip inner tables — they are handled by _tblAttachInnerRow, not tblAttachTable
    if(table.classList.contains('tbl-inner-row'))return;
    tblAttachTable(table);
  });
}

export function tblAttachTable(table){
  // ── Helper: get ACTUAL column count (sum of all colSpan) ──
  function _tblTrueCols(tbl){
    let max=0;
    Array.from(tbl.rows).forEach(row=>{
      let n=0;Array.from(row.cells).forEach(c=>n+=(c.colSpan||1));
      if(n>max)max=n;
    });
    return max;
  }

  // 1. ── Row numbers — toggleable via data-rownums ────────────
  table.querySelectorAll('.tbl-row-num').forEach(e=>e.remove());
  // Default ON unless data-rownums="0"
  const showRowNums=table.dataset.rownums!=='0';
  if(showRowNums){
    const ROW_NUM_W=36;
    const allRows=Array.from(table.rows);
    allRows.forEach((row,ri)=>{
      const numCell=ri===0?document.createElement('th'):document.createElement('td');
      numCell.className='tbl-row-num';
      numCell.contentEditable='false';
      numCell.textContent=ri===0?'#':String(ri);
      // MUST be inline for table-layout:fixed to respect it
      numCell.style.width=ROW_NUM_W+'px';
      numCell.style.minWidth=ROW_NUM_W+'px';
      numCell.style.maxWidth=ROW_NUM_W+'px';
      row.insertBefore(numCell,row.cells[0]);
    });
  }

  // Restore column widths from saved data-colwidths (preserved across save/load)
  const savedWidths=table.dataset.colwidths;
  if(savedWidths){
    let cg=table.querySelector('colgroup');
    if(!cg){cg=document.createElement('colgroup');table.insertBefore(cg,table.firstChild);}
    const wArr=savedWidths.split(',');
    // Use TRUE column count (sum of colSpans) — NOT cells.length which is wrong after merge
    const totalCols=_tblTrueCols(table);
    while(cg.children.length<totalCols){cg.appendChild(document.createElement('col'));}
    while(cg.children.length>totalCols){cg.removeChild(cg.lastChild);}
    const hasRowNum=table.rows[0]?.cells[0]?.classList.contains('tbl-row-num');
    Array.from(cg.children).forEach((col,i)=>{
      if(hasRowNum&&i===0){col.style.width=TBL_ROWNUM_W+'px';return;}
      // FIX: use wArr[i] directly — wArr[0]=rownum-width, wArr[1]=col1, wArr[2]=col2…
      // Old wi=i-1 was wrong: it mapped col1 → wArr[0] (rownum width) instead of wArr[1]
      const w=wArr[i]||(i===0?TBL_ROWNUM_W+'px':TBL_DEFAULT_COL_W+'px');
      if(w)col.style.width=w;
    });
    table.style.tableLayout='fixed';
    table.style.width=''; // Let CSS max-content lock actual size
  }

  // 2. ── Column resize handles + column selector on each th ──────
  table.querySelectorAll('th:not(.tbl-row-num)').forEach((th,ci)=>{
    th.querySelectorAll('.tbl-col-resize-handle,.tbl-col-sel').forEach(e=>e.remove());
    th.style.position='relative';
    // Resize handle — MUST be contentEditable=false so caret never lands inside it
    const handle=document.createElement('div');
    handle.className='tbl-col-resize-handle';
    handle.contentEditable='false';
    handle.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();tblColResizeStart(e,table,th,ci+1);});
    th.appendChild(handle);
    // Column selector grip (⁞⁞⁞) — shows on hover
    const colSel=document.createElement('div');colSel.className='tbl-col-sel';
    colSel.contentEditable='false';
    colSel.title='Chon ca cot · To mau';
    [0,1,2].forEach(()=>{const d=document.createElement('span');d.className='tbl-col-sel-dot';colSel.appendChild(d);});
    colSel.addEventListener('mousedown',e=>e.preventDefault());
    colSel.addEventListener('click',e=>{
      e.stopPropagation();
      // colIdx in actual table = ci+1 (offset for row-num col)
      tblSelectCol(table,ci+1,colSel);
    });
    th.appendChild(colSel);
  });

  // 3. ── Row resize handles + row selector ──────────────────
  // Row selector goes in: .tbl-row-num cell (if shown) OR first data cell (if hidden)
  table.querySelectorAll('tr').forEach(row=>{
    // Remove stale handles/selectors from any cell in this row
    row.querySelectorAll('.tbl-row-resize-handle,.tbl-row-sel').forEach(e=>e.remove());

    // ── Decide which cell hosts the selector ──────────────
    const numCell=row.querySelector('.tbl-row-num');
    // First non-row-num cell in the row
    const firstDataCell=Array.from(row.cells).find(c=>!c.classList.contains('tbl-row-num'))||null;
    // Host = row-num cell if it exists (row numbers ON), else first data cell
    const hostCell=numCell||firstDataCell;
    if(!hostCell)return;
    hostCell.style.position='relative';

    // ── Row resize handle — on LAST cell of every row (always visible) ──
    const lastCell=row.cells[row.cells.length-1];
    if(lastCell){
      // Remove existing
      lastCell.querySelectorAll('.tbl-row-resize-handle').forEach(e=>e.remove());
      lastCell.style.position='relative';
      const rh=document.createElement('div');
      rh.className='tbl-row-resize-handle';
      rh.contentEditable='false';
      rh.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();tblRowResizeStart(e,row);});
      lastCell.appendChild(rh);
    }
    // Also keep on numCell if shown (kept for backward compat)
    if(numCell&&numCell!==lastCell){
      const rh2=document.createElement('div');
      rh2.className='tbl-row-resize-handle';
      rh2.contentEditable='false';
      rh2.style.cssText='position:absolute;bottom:-3px;left:0;right:0;height:6px;cursor:row-resize;z-index:20;background:transparent';
      rh2.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();tblRowResizeStart(e,row);});
      numCell.appendChild(rh2);
    }

    // ── Row selector handle (⁞) — moves to hostCell ──────
    const rowSel=document.createElement('div');rowSel.className='tbl-row-sel';
    rowSel.contentEditable='false';
    rowSel.title='Chọn cả hàng · Tô màu';
    [0,1,2].forEach(()=>{const d=document.createElement('span');d.className='tbl-row-sel-dot';rowSel.appendChild(d);});
    rowSel.addEventListener('mousedown',e=>e.preventDefault());
    rowSel.addEventListener('click',e=>{
      e.stopPropagation();
      const rowIdx=Array.from(table.rows).indexOf(row);
      tblSelectRow(table,rowIdx,rowSel);
    });
    hostCell.appendChild(rowSel);
  });

  // 4a. ── Re-attach inner row interactivity for existing inner-row rows ──
  table.querySelectorAll('tr[data-innerrow="1"]').forEach(row=>{
    const innerTbl=row.querySelector('table.tbl-inner-row');
    if(innerTbl)_tblAttachInnerRow(innerTbl);
  });

  // 4. ── Per-cell setup: ensure editability, drag&drop + paste ────
  table.querySelectorAll('td:not(.tbl-row-num),th:not(.tbl-row-num)').forEach(cell=>{
    // Skip inner-row container cells — their inner table handles everything
    if(cell.classList.contains('tbl-inner-container'))return;
    cell.querySelectorAll('.tbl-img-btn,.tbl-cell-drop').forEach(e=>e.remove());
    cell.style.position='relative';
    // Explicitly ensure every data cell is editable (row-num cells are false, data cells must be true)
    if(cell.contentEditable!=='true')cell.contentEditable='true';
    // Use 'click' (fires AFTER browser places cursor) — not 'mousedown' (fires BEFORE)
    // This prevents ANY interference with the browser's natural cursor placement
    cell.addEventListener('click',e=>{
      _activeTd=cell;
      if(e.shiftKey||e.ctrlKey){
        // Multi-cell selection for Merge & Center
        _mergeTable=table;
        _selectRect(table);_updateMergeBar();
      } else {
        // Regular click: clear merge selection if any
        if(_mergeTable)tblClearCellSel();
      }
    });
    // Shift+mousedown: prevent text selection range
    cell.addEventListener('mousedown',e=>{
      if(e.shiftKey||e.ctrlKey)e.preventDefault();
    });

    // Drop overlay (visual feedback when dragging over cell)
    const dropOv=document.createElement('div');dropOv.className='tbl-cell-drop';
    dropOv.contentEditable='false';
    dropOv.innerHTML='<i class="ti ti-photo-up"></i>';
    cell.appendChild(dropOv);

    // Drag & drop handler
    cell.addEventListener('dragover',e=>{
      if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.stopPropagation();dropOv.classList.add('on');}
    });
    cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))dropOv.classList.remove('on');});
    cell.addEventListener('drop',async e=>{
      e.preventDefault();e.stopPropagation();dropOv.classList.remove('on');
      const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
      await tblInsertImages(cell,files);
    });

    // Paste image handler
    cell.addEventListener('paste',async e=>{
      const imgs=Array.from(e.clipboardData?.items||[]).filter(i=>i.type.startsWith('image/'));
      if(imgs.length){e.preventDefault();await tblInsertImages(cell,imgs.map(i=>i.getAsFile()));}
    });

    // Mark cells with images/carousels
    if(cell.querySelectorAll('img').length||cell.querySelector('.tbl-cell-car'))cell.classList.add('tbl-has-img');
    // Load table cell images from IDB (restore src from data-tblimgid)
    cell.querySelectorAll('img[data-tblimgid]').forEach(async img=>{
      const id=img.dataset.tblimgid;if(!id){img.remove();return;}
      let src=_objUrls[id]||'';
      if(!src){try{const b=await _idbGet(id);if(b){src=URL.createObjectURL(b);_cacheUrl(id,src);}}catch(e){}}
      if(src){
        img.src=src;
        img.onclick=()=>{lbShow([{src,name:img.alt||'image'}]);};
      } else {
        // IDB data missing — remove broken img and clean up cell
        img.remove();
        if(!cell.textContent.trim()&&!cell.querySelector('img,video,.tbl-cell-car'))
          cell.classList.remove('tbl-has-img');
      }
    });
    // Load carousel slide images from IDB
    const existingCar=cell.querySelector('.tbl-cell-car');
    if(existingCar){
      existingCar.addEventListener('mouseenter',()=>{setHoveredTblImg(existingCar);});
      existingCar.addEventListener('mouseleave',()=>{if(_hoveredTblImg===existingCar)setHoveredTblImg(null);});
      // Restore slide images
      const slideIds=(existingCar.dataset.slideids||'').split(',').filter(Boolean);
      const slideImgs=existingCar.querySelectorAll('.tcc-slide img');
      slideIds.forEach(async(sid,i)=>{
        if(!slideImgs[i])return;
        let src=_objUrls[sid]||'';
        if(!src){try{const b=await _idbGet(sid);if(b){src=URL.createObjectURL(b);_cacheUrl(sid,src);}}catch(e){}}
        if(src)slideImgs[i].src=src;
      });
    }
    cell.querySelectorAll('img').forEach(img=>{
      img.style.cssText=(img.style.cssText||'')+'display:block;max-width:100%;max-height:100%;width:auto;height:auto;margin:0 auto;background:transparent';
      img.onclick=()=>{lbShow([{src:img.src,name:img.alt||'image'}]);};
      img.addEventListener('mouseenter',()=>{setHoveredTblImg(img);img.style.outline='2px solid var(--accent)';img.style.outlineOffset='2px';});
      img.addEventListener('mouseleave',()=>{if(_hoveredTblImg===img){setHoveredTblImg(null);}img.style.outline='';img.style.outlineOffset='';});
    });
  });

  // 5. ── Equalize columns — only if no user-customized widths ──
  const existCg=table.querySelector('colgroup');
  const hasCustom=existCg&&!existCg.dataset.auto&&existCg.querySelectorAll('col').length>0;
  if(!hasCustom){
    tblEqualizeColumns(table);
  } else {
    // Preserve existing colgroup widths — just ensure table layout is correct
    table.style.tableLayout='fixed';
    table.style.borderCollapse='collapse';
    table.style.width=''; // Let CSS max-content determine table size from colgroup
  }
  // 6. ── Add left/right edge resize handles ──
  _tblAddEdgeHandles(table);
}

// ── COLUMN RESIZE ────────────────────────────────────────────
export function tblColResizeStart(e,table,th,colIndex){
  const handle=e.currentTarget;handle.classList.add('dragging');
  const startX=e.clientX;
  const tableW=table.offsetWidth-36; // subtract row-num column width
  const startPct=th.offsetWidth/tableW*100;
  const minPct=Math.max(5,60/tableW*100); // min 60px or 5%
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;cursor:col-resize;z-index:9999';
  document.body.appendChild(overlay);

  // Find the next data column to adjust (maintain total width)
  // Use colgroup cols for resize — reliable with table-layout:fixed
  const cg=table.querySelector('colgroup');
  const cgCols=cg?Array.from(cg.querySelectorAll('col')):[];
  // colIndex is the index in ALL cells (including row-num col at 0)
  const thisCol=cgCols[colIndex]||null;
  const startPx=th.offsetWidth;
  const minPx=40; // minimum column width in pixels

  function move(e2){
    const dx=e2.clientX-startX;
    const newPx=Math.max(minPx,startPx+dx);
    // Fixed layout: only resize the dragged column.
    // Adjacent columns keep their widths — total table width grows/shrinks naturally.
    // width:max-content on the table makes .tbl-outer scroll if needed.
    if(thisCol)thisCol.style.width=newPx+'px';
    // Mark colgroup as user-customized → prevent tblAttachTable from resetting widths
    if(cg)delete cg.dataset.auto;
  }
  function up(){
    overlay.remove();handle.classList.remove('dragging');
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
    onContentChange();
  }
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',up);
}

// ── ROW RESIZE ───────────────────────────────────────────────
export function tblRowResizeStart(e,row){
  const handle=e.currentTarget;handle.classList.add('dragging');
  const startY=e.clientY;
  const startH=row.offsetHeight;
  const minH=28;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;cursor:row-resize;z-index:9999';
  document.body.appendChild(overlay);

  function move(e2){
    const dy=e2.clientY-startY;
    const newH=Math.max(minH,startH+dy);
    row.style.height=newH+'px';
    Array.from(row.cells).forEach(cell=>{
      cell.style.height=newH+'px';
      // Scale carousel explicitly (height:100% unreliable in td)
      const car=cell.querySelector('.tbl-cell-car');
      if(car){
        car.style.height=newH+'px';
        const thumbs=car.querySelector('.tcc-thumbs');
        const thumbH=thumbs?thumbs.offsetHeight:38;
        const stage=car.querySelector('.tcc-stage');
        if(stage)stage.style.minHeight=Math.max(40,newH-thumbH-8)+'px';
      }
      // Images also scale via CSS (width:100%;height:100%)
      if(cell.querySelectorAll('img').length||car)cell.classList.add('tbl-has-img');
    });
  }
  function up(){
    overlay.remove();handle.classList.remove('dragging');
    document.removeEventListener('mousemove',move);
    document.removeEventListener('mouseup',up);
    onContentChange();
  }
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',up);
}
document.addEventListener('mousedown',e=>{const dd=document.getElementById('tblDropdown');if(dd&&!dd.contains(e.target)&&!e.target.classList.contains('tbl-trigger'))tblHideDropdown();});

// TABLE GRID PICKER
const TG_ROWS=8,TG_COLS=10;let _tgHideTimer=null;
export function showTableGrid(triggerEl){
  clearTimeout(_tgHideTimer);
  const grid=document.getElementById('tableGrid');
  if(!grid)return;
  let html='<div>';
  for(let r=0;r<TG_ROWS;r++){html+='<div class="tg-row">';for(let c=0;c<TG_COLS;c++){html+=`<div class="tg-cell" data-r="${r}" data-c="${c}" onmouseenter="tgHover(${r},${c})" onmousedown="event.preventDefault();tgInsert(${r+1},${c+1})"></div>`;}html+='</div>';}
  html+='</div>';
  html+='<div class="tg-label" id="tgLabel">Bảng</div>';
  html+='<div class="tg-manual">';
  html+='<input type="number" id="tgManualCols" min="1" max="20" value="3" title="Số cột">';
  html+='<span>×</span>';
  html+='<input type="number" id="tgManualRows" min="1" max="50" value="3" title="Số hàng">';
  html+='<button onmousedown="event.preventDefault();tgManualInsert()">Tạo</button>';
  html+='</div>';
  grid.innerHTML=html;
  // Position: near trigger element or near cursor
  const wrap=document.getElementById('drawTableWrap');
  if(wrap){
    const ref=triggerEl||document.getElementById('editor');
    const rect=ref.getBoundingClientRect();
    const vw=window.innerWidth,vh=window.innerHeight;
    let top=rect.bottom+4,left=rect.left;
    if(top+340>vh)top=Math.max(8,rect.top-344);
    if(left+290>vw)left=Math.max(8,vw-294);
    wrap.style.top=top+'px';wrap.style.left=left+'px';
  }
  grid.classList.add('on');
}
export function hideTableGrid(){const g=document.getElementById('tableGrid');if(g)g.classList.remove('on');}
export function tgHover(row,col){
  document.querySelectorAll('.tg-cell').forEach(cell=>{
    const r2=parseInt(cell.dataset.r),c2=parseInt(cell.dataset.c);
    cell.classList.toggle('hi',r2<=row&&c2<=col);
  });
  const lbl=document.getElementById('tgLabel');
  if(lbl)lbl.textContent=(col+1)+' cột × '+(row+1)+' hàng';
  const mc=document.getElementById('tgManualCols');
  const mr=document.getElementById('tgManualRows');
  if(mc)mc.value=col+1;
  if(mr)mr.value=row+1;
}
export function tgManualInsert(){
  const r=Math.max(1,Math.min(50,parseInt(document.getElementById('tgManualRows')?.value)||3));
  const cc=Math.max(1,Math.min(20,parseInt(document.getElementById('tgManualCols')?.value)||3));
  tgInsert(r,cc);
}
export function tgInsert(rows,cols){
  hideTableGrid();
  const editor=document.getElementById('editor');editor.focus();

  // ── Build table via DOM ──────────────────────────────────
  const table=document.createElement('table');

  // ── Colgroup FIRST — explicit pixel widths lock column sizes immediately
  // This is the skeleton that table-layout:fixed + width:max-content respects.
  const cg=document.createElement('colgroup');
  for(let c=0;c<cols;c++){
    const col=document.createElement('col');
    col.style.width=TBL_DEFAULT_COL_W+'px';
    cg.appendChild(col);
  }
  table.appendChild(cg);

  // ── Build rows + cells ────────────────────────────────────
  for(let r=0;r<rows;r++){
    const tr=document.createElement('tr');
    for(let cc=0;cc<cols;cc++){
      const cell=document.createElement(r===0?'th':'td');
      cell.textContent='';
      tr.appendChild(cell);
    }
    table.appendChild(tr);
  }

  // Insert using generic range-based insertion (works inside columns too)
  _cfInsertBlockAtRange(table,_slashSavedRange||(window.getSelection()?.rangeCount?window.getSelection().getRangeAt(0):null));

  // ── Place cursor inside first data cell ───────────────────
  try{
    const firstCell=table.rows[1]?.cells[0]||table.rows[0]?.cells[0];
    if(firstCell){
      const r2=document.createRange();r2.setStart(firstCell,0);r2.collapse(true);
      const sel2=window.getSelection();sel2.removeAllRanges();sel2.addRange(r2);
    }
  }catch(e){}

  onContentChange();
  setTimeout(tblAttachAll,50);
}
