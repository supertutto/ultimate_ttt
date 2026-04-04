// constants.js
const C = {
  BG:       '#16150f',
  PANEL_BG: '#1e1d19',
  BORDER:   '#3a3835',
  CELL_D:   '#2e2c2a',
  CELL_L:   '#3a3834',
  CELL_AD:  '#4e4826',
  CELL_AL:  '#5e562e',
  LINE_IN:  '#262422',
  LINE_OUT: '#a29e94',
  X_COL:    '#eb5f5c',
  O_COL:    '#52b0e4',
  X_DIM:    '#6e3030',
  O_DIM:    '#2a5c7e',
  EVAL_L:   '#e2e0da',
  EVAL_D:   '#1e1c1a',
  TXT_A:    '#d7d4cd',
  TXT_B:    '#7a7872',
  LAST_HL:  'rgba(248,196,60,0.45)',
  HINT_HL:  'rgba(52,190,80,0.55)',
  BTN_G:    '#264426',
  BTN_GH:   '#345c34',
  BTN_GB:   '#62d06a',
  BTN_N:    '#2d2c34',
  BTN_NH:   '#3e3c48',
  BTN_NB:   '#787890',
};

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

const PV = [3,2,3, 2,5,2, 3,2,3];

const W = {
  WIN:      100000,
  META_WIN:   1400,
  META_2:      280,
  META_1:       42,
  LOC_2:        32,
  LOC_1:         7,
  POS:           5,
  OL:            4,
};

const AI_MIN_DEPTH = 4;
const AI_MAX_DEPTH = 30;
