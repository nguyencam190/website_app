// STATE KEY
export const STORE_KEY = 'projectdocs_v3';

// DEFAULT STATE
export let state = {projectName:'My Project',username:'User',sections:['Chung','Pipeline','QC','Tools'],docs:[],currentDocId:null};

// SYSTEM FLAGS
export let _canvasW = 0;

export const _objUrls = {};   // id → url

export let _hoveredFm = null;   // id of currently hovered fmedia element
export let _hoveredTblImg = null; // <img> element hovered inside a table cell

export let _slashRecent = [];
export let _slashVisible = false;
export let _slashActiveIdx = 0;
export let _slashFiltered = [];
export let _slashSavedRange = null;

// SIDEBAR RESIZE CONSTANTS
export const SB_MIN = 160;
export const SB_MAX = 520;
export const SB_DEFAULT = 260;

// COLOR MATRICES
// TEXT_MATRIX[row][col] = [lightHex, darkHex] — 4 rows x 7 cols
export const TEXT_MATRIX = [
  [['#191919','#e8e8e8'],['#0d47a1','#82b1ff'],['#006064','#84ffff'],['#33691e','#ccff90'],['#4e342e','#ffccbc'],['#b71c1c','#ff8a80'],['#4a148c','#ea80fc']],
  [['#455a64','#b0bec5'],['#1565c0','#90caf9'],['#00838f','#80deea'],['#558b2f','#dce775'],['#e65100','#ffcc80'],['#c62828','#ef9a9a'],['#6a1b9a','#ce93d8']],
  [['#9e9e9e','#757575'],['#64b5f6','#1e88e5'],['#4dd0e1','#0097a7'],['#aed581','#7cb342'],['#ffcc80','#ef6c00'],['#ef9a9a','#e53935'],['#ce93d8','#8e24aa']],
  [['#eceff1','#37474f'],['#bbdefb','#1a237e'],['#b2ebf2','#006064'],['#dcedc8','#33691e'],['#fff9c4','#f57f17'],['#fce4ec','#880e4f'],['#f3e5f5','#4a148c']]
];

// HL_MATRIX[col] = [lightBg, darkBg] — 7 highlight colors
export const HL_MATRIX = [
  ['transparent','transparent'],
  ['#f1f3f4','#2d2f31'],
  ['#e8f0fe','#1c2a3e'],
  ['#e6f4ea','#1b2d20'],
  ['#fef9e7','#2c280e'],
  ['#fce8e6','#2d1e1e'],
  ['#f9edff','#261a2d']
];
