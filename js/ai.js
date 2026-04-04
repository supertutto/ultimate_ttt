// ai.js — Web Worker autocontenuto
// Tutte le costanti e la logica di gioco sono replicate qui dentro
// perché il Worker non ha accesso ai file caricati nell'HTML.

// ── Costanti (replica di constants.js) ───────────────────────────────────────
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
const AI_MAX_DEPTH = 30;

// ── Logica di gioco (replica di game.js) ─────────────────────────────────────
function opp(p){ return p === 'X' ? 'O' : 'X'; }

function checkGrid(grid) {
  for (const [a,b,c] of WIN_LINES) {
    const v = grid[a];
    if ((v === 'X' || v === 'O') && v === grid[b] && v === grid[c]) return v;
  }
  if (!grid.includes(' ')) return 'D';
  return null;
}

class Game {
  constructor() {
    this.board  = Array.from({length:9}, () => Array(9).fill(' '));
    this.big    = Array(9).fill(' ');
    this.player = 'X';
    this.active = null;
    this.over   = false;
    this.winner = null;
    this.hist   = [];
  }
  copy() {
    const g   = new Game();
    g.board   = this.board.map(r => [...r]);
    g.big     = [...this.big];
    g.player  = this.player;
    g.active  = this.active;
    g.over    = this.over;
    g.winner  = this.winner;
    g.hist    = this.hist.map(m => ({...m}));
    return g;
  }
  moves() {
    if (this.over) return [];
    const ab = this.active;
    let boards;
    if (ab !== null && this.big[ab] === ' ') {
      boards = [ab];
    } else {
      boards = [];
      for (let i=0; i<9; i++) if (this.big[i] === ' ') boards.push(i);
    }
    const mvs = [];
    for (const b of boards)
      for (let c=0; c<9; c++)
        if (this.board[b][c] === ' ') mvs.push({b, c});
    return mvs;
  }
  push(b, c) {
    this.board[b][c] = this.player;
    this.hist.push({b, c});
    const res = checkGrid(this.board[b]);
    if (res && this.big[b] === ' ') this.big[b] = res;
    const gr = checkGrid(this.big);
    if (gr === 'X' || gr === 'O') { this.over=true; this.winner=gr; return; }
    const nextBoards = this.big[c] === ' ' ? [c]
      : [...Array(9).keys()].filter(i => this.big[i] === ' ');
    let hasMove = false;
    outer: for (const nb of nextBoards)
      for (let cc=0; cc<9; cc++)
        if (this.board[nb][cc] === ' ') { hasMove=true; break outer; }
    if (!hasMove) { this.over=true; this.winner='D'; return; }
    this.active = (this.big[c] === ' ') ? c : null;
    this.player = opp(this.player);
  }
}

// ── Euristica ─────────────────────────────────────────────────────────────────
function openMeta(big, idx) {
  let n = 0;
  for (const line of WIN_LINES) {
    if (!line.includes(idx)) continue;
    const vs = line.map(i => big[i]);
    if (vs.includes('D') || (vs.includes('X') && vs.includes('O'))) continue;
    n++;
  }
  return n;
}
function openLocal(grid, idx, p) {
  const e = opp(p);
  let n = 0;
  for (const line of WIN_LINES) {
    if (!line.includes(idx)) continue;
    if (line.some(i => grid[i] === e)) continue;
    n++;
  }
  return n;
}
function lscore(vs, p, w2, w1) {
  const e = opp(p);
  if (vs.some(v => v === e || v === 'D')) return 0;
  const pc = vs.filter(v => v === p).length;
  return pc === 2 ? w2 : pc === 1 ? w1 : 0;
}
function evaluate(g) {
  if (g.over) {
    const d = g.hist.length;
    if (g.winner === 'X') return  W.WIN - d;
    if (g.winner === 'O') return -W.WIN + d;
    return 0;
  }
  let s = 0;
  const big = g.big;
  for (let i=0; i<9; i++) {
    const cell = big[i];
    if (cell !== 'X' && cell !== 'O') continue;
    const om = openMeta(big, i);
    const v  = W.META_WIN * (PV[i] + om*2) / 10;
    s += cell === 'X' ? v : -v;
  }
  for (const line of WIN_LINES) {
    const vs = line.map(i => big[i]);
    if (!vs.includes('D')) {
      if (!vs.includes('O')) s += lscore(vs,'X',W.META_2,W.META_1);
      if (!vs.includes('X')) s -= lscore(vs,'O',W.META_2,W.META_1);
    }
  }
  for (let gi=0; gi<9; gi++) {
    if (big[gi] !== ' ') continue;
    const grid = g.board[gi];
    const ml   = Math.max(1, openMeta(big, gi));
    const pg   = PV[gi];
    for (const line of WIN_LINES) {
      const vs = line.map(i => grid[i]);
      s += lscore(vs,'X', W.LOC_2*ml*pg/5, W.LOC_1*ml*pg/5);
      s -= lscore(vs,'O', W.LOC_2*ml*pg/5, W.LOC_1*ml*pg/5);
    }
    for (let ci=0; ci<9; ci++) {
      const cell = grid[ci];
      if (cell !== 'X' && cell !== 'O') continue;
      const ol = openLocal(grid, ci, cell);
      const v  = (W.POS*PV[ci] + W.OL*ol) * ml * pg / 25;
      s += cell === 'X' ? v : -v;
    }
  }
  s += g.moves().length * (g.player === 'X' ? 1 : -1);
  return s;
}

// ── Ordinamento mosse ─────────────────────────────────────────────────────────
function orderMoves(g, mvs) {
  const p = g.player, e = opp(p);
  return [...mvs].sort((ma, mb) => {
    function sc({b,c}) {
      let n = 0;
      const gr = [...g.board[b]]; gr[c] = p;
      for (const [a,bb,cc] of WIN_LINES)
        if (gr[a]===p && gr[bb]===p && gr[cc]===p) { n+=1000; break; }
      const gr2 = [...g.board[b]]; gr2[c] = e;
      for (const [a,bb,cc] of WIN_LINES)
        if (gr2[a]===e && gr2[bb]===e && gr2[cc]===e) { n+=500; break; }
      n += PV[c]*10 + PV[b]*8;
      if (g.big[c] !== ' ') n -= 15;
      return -n;
    }
    return sc(ma) - sc(mb);
  });
}

// ── Minimax ───────────────────────────────────────────────────────────────────
let tt = new Map();

function ttKey(g) {
  return g.board.map(r=>r.join('')).join('|')+'|'+
         g.big.join('')+'|'+g.active+'|'+g.player;
}

function minimax(g, depth, alpha, beta, isMax, stopped) {
  if (stopped.v) return { v: evaluate(g), m: null };

  const key = ttKey(g);
  if (tt.has(key)) {
    const e = tt.get(key);
    if (e.d >= depth) {
      if (e.f==='exact')               return {v:e.v, m:e.m};
      if (e.f==='lower'&&e.v>=beta)    return {v:e.v, m:e.m};
      if (e.f==='upper'&&e.v<=alpha)   return {v:e.v, m:e.m};
    }
  }

  let mvs = g.moves();
  if (depth===0 || g.over || mvs.length===0)
    return { v: evaluate(g), m: null };

  if (mvs.length===81) {
    const starts=[{b:4,c:4},{b:0,c:4},{b:4,c:0},{b:8,c:4},{b:4,c:8}];
    return {v:0, m:starts[Math.floor(Math.random()*starts.length)]};
  }

  mvs = orderMoves(g, mvs);
  let bm = mvs[0], oa = alpha;

  if (isMax) {
    let bv = -Infinity;
    for (const m of mvs) {
      if (stopped.v) break;
      const ns = g.copy(); ns.push(m.b, m.c);
      const {v} = minimax(ns, depth-1, alpha, beta, false, stopped);
      if (v > bv) { bv=v; bm=m; }
      alpha = Math.max(alpha, bv);
      if (alpha >= beta) break;
    }
    if (!stopped.v) {
      const f = bv<=oa?'upper': bv>=beta?'lower':'exact';
      tt.set(key, {d:depth, f, v:bv, m:bm});
    }
    return {v:bv, m:bm};
  } else {
    let bv = Infinity;
    for (const m of mvs) {
      if (stopped.v) break;
      const ns = g.copy(); ns.push(m.b, m.c);
      const {v} = minimax(ns, depth-1, alpha, beta, true, stopped);
      if (v < bv) { bv=v; bm=m; }
      beta = Math.min(beta, bv);
      if (alpha >= beta) break;
    }
    if (!stopped.v) {
      const f = bv<=oa?'upper': bv>=beta?'lower':'exact';
      tt.set(key, {d:depth, f, v:bv, m:bm});
    }
    return {v:bv, m:bm};
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
let stopped   = { v: false };
let curSession = -1;

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'stop') {
    stopped.v = true;
    return;
  }

  if (msg.type !== 'start') return;

  // Ferma eventuale calcolo precedente
  stopped.v  = true;
  stopped    = { v: false };   // nuovo oggetto per il nuovo giro
  curSession = msg.session;
  tt.clear();

  const g = new Game();
  g.board  = msg.state.board.map(r => [...r]);
  g.big    = [...msg.state.big];
  g.player = msg.state.player;
  g.active = msg.state.active;
  g.over   = msg.state.over;
  g.winner = msg.state.winner;
  g.hist   = msg.state.hist.map(m => ({...m}));

  const isMax = g.player === 'X';
  const sess  = curSession;   // cattura locale per questo loop

  for (let depth = 1; depth <= AI_MAX_DEPTH; depth++) {
    if (stopped.v || curSession !== sess) break;
    const { v, m } = minimax(g, depth, -Infinity, Infinity, isMax, stopped);
    if (!stopped.v && curSession === sess && m !== null) {
      // Manda il session ID con il risultato così main.js può scartare
      // risultati di sessioni vecchie
      self.postMessage({ type: 'result', score: v, move: m, depth, session: sess });
      if (Math.abs(v) >= W.WIN - 200) break;
    }
  }
};