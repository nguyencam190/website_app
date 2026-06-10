// ─── App Entry Point ───────────────────────────────────────────
// Imports all modules, exposes public functions as globals, then calls init().

import { loadState } from './core/storage.js';

// ─── Component imports ─────────────────────────────────────────
import {
  initCanvasScaling, resetCanvasWidth, _sbInitResize,
  sbCollapse, sbExpand,
  toggleFlyout, closeFlyout, buildFlyoutList, filterFlyout,
  toggleStar, clearRecent,
  renderSidebar,
  openSecCtx, secCtxRename, secCtxDelete,
  renameSection, filterDocs,
  uid, newDoc, createDoc, openDoc, currentDoc,
  onTitleChange, onContentChange,
  openDocCtx, docCtxRename, docCtxDuplicate, docCtxDelete,
} from './components/sidebar.js';

import {
  handleFileInput, loadMedia, loadImage, loadCarousel,
  addMedia, addImage, insertMediaInEditor, insertImageInEditor,
  SHADOW_COLORS, FM_SHADOW_PRESETS,
  tblImgOpenShadowPanel,
  fmOpenShadowPanel, fmCloseShadowPanel,
  createFloatingMedia,
  fmDragStart, _fmAutoHeight, fmDragFromPos,
  fmResizeStart, fmExtendEditor, fmDelete,
  fmOpenImg, fmPlayVideo,
  fmSaveAll, fmLoadAll,
  openVideoLightbox, closeVideoLightbox,
  lbShow, lbOpen, lbRender, lbGo, lbGoTo, lbClose, lbBgClick,
  _hoveredFm, _hoveredTblImg, setHoveredFm, setHoveredTblImg,
  _snapTargets, _snapApplyDrag, _snapApplyResize, _snapClear,
} from './components/media.js';

import {
  SLASH_ITEMS,
  slashOpen, slashClose, slashFilter, slashBuild, slashExec,
  slashAddCol, slashRemoveCol,
  cfInsertImageBlock, _cfInsertBlockAtRange,
  cfBuildCarouselBlock,
  _cfEmbedLoadAll, _cfCarLoadAll, _cfImgLoadAll,
  cfEmbedOpen, cfEmbedClose, cfEmbedValidate, cfEmbedInsert,
  cfGetEmbedUrl, cfEmbedPlatform, cfBuildEmbedBlock,
  emojiClose, emojiFilter, emojiInsert,
  _editorSlashKeydown, _slashMenuInputKeydown,
  _initSlashCommands,
} from './components/slashMenu.js';

import {
  tblClearSel, tblSelectCol, tblSelectRow,
  tblToggleRowNums,
  tblConvertRowToInner, tblRevertInnerRow,
  tblInnerAddCell, tblInnerSetCellCount, tblInnerDeleteCell,
  tblRevertInnerRowFromCell,
  tblEqualizeColumns, tblDistributeColumns,
  tblGetCellIndex, tblRealColIndex, tblGetRowIndex,
  tblHideDropdown,
  tblAddRowBelow, tblAddRowAbove,
  tblAddColRight, tblAddColLeft,
  tblDelRow, tblDelCol, tblDelTable,
  tblMergeCells, tblMergeColsOnly, tblMergeRowsOnly, tblUnmergeCells,
  tblClearCellSel,
  tblInsertImages, tblInsertCarousel,
  tblAttachAll,
  hideTableGrid,
} from './components/tables.js';

import {
  persistNow, markDirty,
  _undoSnapshot, _undoSnapshotDebounced, editorUndo, editorRedo, resetUndoStack,
  showKeyboardShortcuts,
  hdrToggleDd, hdrCloseAll, hdrOpenSearch, hdrHandleSearch,
  hdrToggleEdit, hdrExitEdit, hdrDeletePage,
  openShareModal, hdrCopyShareLink,
  pabLogoToggle, pabLogoColor, pabLogoUpload, pabLogoReset,
  hdrBuildNotif, updatePageActionBar,
  toggleTextBoxMode, tbDrawStart, createTextBox, deleteTextBox,
  tbSetBg, tbSetBorder, tbSetBdWidth, tbToggleShadow,
  tbOpenColorPalette, tbCloseColorPalette,
  tbInsertImages as tbInsertImagesEditor,
  tbCarNav, tbCarGo, tbCarFullscreen, tbCarInitSwipe, tbQuickColor,
  tbSaveAll, tbLoadAll,
  saveRange, restoreRange,
  bbShow, bbHide, bbFmt, bbApplyBlock, bbApplyFont,
  bbOpenSizeDD, bbCloseSizeDD, bbApplySize,
  bbTextColor, bbHighlight, bbRemoveHighlight, bbClear,
  bbAlign, bbInsertLink,
  bbOpenSpacingDD, bbCloseSpacingDD, bbApplySpacing,
  swapThemeColors,
  toggleColorPalette, applyColorFromPalette, closeAllPalettes,
  applyTableCellBg, clearTableCellBg, applyTextColor, applyHighlight,
  importMergePages, handleImportMerge, doImportMerge,
  toast,
  toggleTheme, updateUserUI, openModal, closeModal,
  init,
} from './components/editor.js';

import {
  exportProject, exportSelfContained, importProject, handleImport,
  openExportWebsiteModal, doExportWebsite,
  _showExportProgress,
} from './core/publishEngine.js';

// ─── Expose all public functions as globals ────────────────────
Object.assign(window, {
  // sidebar
  initCanvasScaling, resetCanvasWidth, _sbInitResize,
  sbCollapse, sbExpand,
  toggleFlyout, closeFlyout, buildFlyoutList, filterFlyout,
  toggleStar, clearRecent,
  renderSidebar,
  openSecCtx, secCtxRename, secCtxDelete,
  renameSection, filterDocs,
  uid, newDoc, createDoc, openDoc, currentDoc,
  onTitleChange, onContentChange,
  openDocCtx, docCtxRename, docCtxDuplicate, docCtxDelete,

  // media
  handleFileInput, loadMedia, loadImage, loadCarousel,
  addMedia, addImage, insertMediaInEditor, insertImageInEditor,
  SHADOW_COLORS, FM_SHADOW_PRESETS,
  tblImgOpenShadowPanel,
  fmOpenShadowPanel, fmCloseShadowPanel,
  createFloatingMedia,
  fmDragStart, _fmAutoHeight, fmDragFromPos,
  fmResizeStart, fmExtendEditor, fmDelete,
  fmOpenImg, fmPlayVideo,
  fmSaveAll, fmLoadAll,
  openVideoLightbox, closeVideoLightbox,
  lbShow, lbOpen, lbRender, lbGo, lbGoTo, lbClose, lbBgClick,
  setHoveredFm, setHoveredTblImg,

  // slashMenu
  SLASH_ITEMS,
  slashOpen, slashClose, slashFilter, slashBuild, slashExec,
  slashAddCol, slashRemoveCol,
  cfInsertImageBlock, _cfInsertBlockAtRange,
  cfBuildCarouselBlock,
  _cfEmbedLoadAll, _cfCarLoadAll, _cfImgLoadAll,
  cfEmbedOpen, cfEmbedClose, cfEmbedValidate, cfEmbedInsert,
  cfGetEmbedUrl, cfEmbedPlatform, cfBuildEmbedBlock,
  emojiClose, emojiFilter, emojiInsert,
  _initSlashCommands,

  // tables
  tblClearSel, tblSelectCol, tblSelectRow,
  tblToggleRowNums,
  tblConvertRowToInner, tblRevertInnerRow,
  tblInnerAddCell, tblInnerSetCellCount, tblInnerDeleteCell,
  tblRevertInnerRowFromCell,
  tblEqualizeColumns, tblDistributeColumns,
  tblGetCellIndex, tblRealColIndex, tblGetRowIndex,
  tblHideDropdown,
  tblAddRowBelow, tblAddRowAbove,
  tblAddColRight, tblAddColLeft,
  tblDelRow, tblDelCol, tblDelTable,
  tblMergeCells, tblMergeColsOnly, tblMergeRowsOnly, tblUnmergeCells,
  tblClearCellSel,
  tblInsertImages, tblInsertCarousel,
  tblAttachAll,
  hideTableGrid,

  // editor
  persistNow, markDirty,
  _undoSnapshot, _undoSnapshotDebounced, editorUndo, editorRedo, resetUndoStack,
  showKeyboardShortcuts,
  hdrToggleDd, hdrCloseAll, hdrOpenSearch, hdrHandleSearch,
  hdrToggleEdit, hdrExitEdit, hdrDeletePage,
  openShareModal, hdrCopyShareLink,
  pabLogoToggle, pabLogoColor, pabLogoUpload, pabLogoReset,
  hdrBuildNotif, updatePageActionBar,
  toggleTextBoxMode, tbDrawStart, createTextBox, deleteTextBox,
  tbSetBg, tbSetBorder, tbSetBdWidth, tbToggleShadow,
  tbOpenColorPalette, tbCloseColorPalette,
  tbInsertImages: tbInsertImagesEditor,
  tbCarNav, tbCarGo, tbCarFullscreen, tbCarInitSwipe, tbQuickColor,
  tbSaveAll, tbLoadAll,
  saveRange, restoreRange,
  bbShow, bbHide, bbFmt, bbApplyBlock, bbApplyFont,
  bbOpenSizeDD, bbCloseSizeDD, bbApplySize,
  bbTextColor, bbHighlight, bbRemoveHighlight, bbClear,
  bbAlign, bbInsertLink,
  bbOpenSpacingDD, bbCloseSpacingDD, bbApplySpacing,
  swapThemeColors,
  toggleColorPalette, applyColorFromPalette, closeAllPalettes,
  applyTableCellBg, clearTableCellBg, applyTextColor, applyHighlight,
  importMergePages, handleImportMerge, doImportMerge,
  toast,
  toggleTheme, updateUserUI, openModal, closeModal,

  // publish
  exportProject, exportSelfContained, importProject, handleImport,
  openExportWebsiteModal, doExportWebsite,
  _showExportProgress,
});

// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  init();
});
