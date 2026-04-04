// ai.js — Minimax + Alpha-Beta + Iterative Deepening continuo
// Gira in un Web Worker separato per non bloccare la UI.

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
    const om   = openMeta(big, i);
    const mult = PV[i] + om * 2;
    const v    = W.META_WIN * mult / 10;
    s += cell === 'X' ? v : -v;
  }
  for (const line of WIN_LINES) {
    const vs = line.map(i => big[i]);
    if (!vs.includes('D')) {
      if (!vs.includes('O')) s += lscore(vs,'X', W.META_2, W.META_1);
      if (!vs.includes('X')) s -= lscore(vs,'O', W.META_2, W.META_1);
    }
  }
  for (let gi=0; gi<9; gi++) {
    if (big[gi] !== ' ') continue;
    const grid = g.board[gi];
    const ml   = Math.max(1, openMeta(big, gi));
    const pg   = PV[gi];
    for (const line of WIN_LINES) {
      const vs = line.map(i => grid[i]);
      const w2 = W.LOC_2 * ml * pg / 5;
      const w1 = W.LOC_1 * ml * pg / 5;
      s += lscore(vs,'X', w2, w1);
      s -= lscore(vs,'O', w2, w1);
    }
    for (let ci=0; ci<9; ci++) {
      const cell = grid[ci];
      if (cell !== 'X' && cell !== 'O') continue;
      const ol = openLocal(grid, ci, cell);
      const v  = (W.POS * PV[ci] + W.OL * ol) * ml * pg / 25;
      s += cell === 'X' ? v : -v;
    }
  }
  const mvs = g.moves();
  s += mvs.length * (g.player === 'X' ? 1 : -1);
  return s;
}

function orderMoves(g, mvs) {
  const p = g.player, e = opp(p);
  return mvs.sort((ma, mb) => {
    function sc({b,c}) {
      let n = 0;
      const gr = [...g.board[b]]; gr[c] = p;
      for (const [a,bb,cc] of WIN_LINES)
        if (gr[a]===p && gr[a]===gr[bb] && gr[a]===gr[cc]) { n+=1000; break; }
      const gr2 = [...g.board[b]]; gr2[c] = e;
      for (const [a,bb,cc] of WIN_LINES)
        if (gr2[a]===e && gr2[a]===gr2[bb] && gr2[a]===gr2[cc]) { n+=500; break; }
      n += PV[c]*10 + PV[b]*8;
      if (g.big[c] !== ' ') n -= 15;
      return -n;
    }
    return sc(ma) - sc(mb);
  });
}

let tt = new Map();

function ttKey(g) {
  return g.board.map(r=>r.join('')).join('|') + '|' +
         g.big.join('') + '|' + g.active + '|' + g.player;
}

function minimax(g, depth, alpha, beta, isMax, stopped) {
  if (stopped.v) return { v: evaluate(g), m: null };

  const key = ttKey(g);
  if (tt.has(key)) {
    const e = tt.get(key);
    if (e.d >= depth) {
      if (e.f === 'exact')               return { v: e.v, m: e.m };
      if (e.f === 'lower' && e.v >= beta)  return { v: e.v, m: e.m };
      if (e.f === 'upper' && e.v <= alpha) return { v: e.v, m: e.m };
    }
  }

  let mvs = g.moves();
  if (depth === 0 || g.over || mvs.length === 0)
    return { v: evaluate(g), m: null };

  if (mvs.length === 81) {
    const starts = [{b:4,c:4},{b:0,c:4},{b:4,c:0},{b:8,c:4},{b:4,c:8}];
    return { v: 0, m: starts[Math.floor(Math.random()*starts.length)] };
  }

  mvs = orderMoves(g, mvs);
  let bm = mvs[0], oa = alpha;

  if (isMax) {
    let bv = -Infinity;
    for (const m of mvs) {
      if (stopped.v) break;
      const ns = g.copy(); ns.push(m.b, m.c);
      const { v } = minimax(ns, depth-1, alpha, beta, false, stopped);
      if (v > bv) { bv = v; bm = m; }
      alpha = Math.max(alpha, bv);
      if (alpha >= beta) break;
    }
    if (!stopped.v) {
      const f = bv <= oa ? 'upper' : bv >= beta ? 'lower' : 'exact';
      tt.set(key, { d: depth, f, v: bv, m: bm });
    }
    return { v: bv, m: bm };
  } else {
    let bv = Infinity;
    for (const m of mvs) {
      if (stopped.v) break;
      const ns = g.copy(); ns.push(m.b, m.c);
      const { v } = minimax(ns, depth-1, alpha, beta, true, stopped);
      if (v < bv) { bv = v; bm = m; }
      beta = Math.min(beta, bv);
      if (alpha >= beta) break;
    }
    if (!stopped.v) {
      const f = bv <= oa ? 'upper' : bv >= beta ? 'lower' : 'exact';
      tt.set(key, { d: depth, f, v: bv, m: bm });
    }
    return { v: bv, m: bm };
  }
}

// ── Web Worker message handler ────────────────────────────────────────────────
// Riceve: { type:'start', gameState }  |  { type:'stop' }
let stopped = { v: false };

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'stop') {
    stopped.v = true;
    return;
  }

  if (msg.type === 'start') {
    stopped = { v: false };
    tt.clear();

    // Ricrea il Game dal plain object serializzato
    const g = new Game();
    g.board  = msg.state.board.map(r => [...r]);
    g.big    = [...msg.state.big];
    g.player = msg.state.player;
    g.active = msg.state.active;
    g.over   = msg.state.over;
    g.winner = msg.state.winner;
    g.hist   = msg.state.hist.map(m => ({...m}));

    const isMax = g.player === 'X';

    for (let depth = 1; depth <= AI_MAX_DEPTH; depth++) {
      if (stopped.v) break;
      const { v, m } = minimax(g, depth, -Infinity, Infinity, isMax, stopped);
      if (!stopped.v && m !== null) {
        self.postMessage({ type: 'result', score: v, move: m, depth });
        if (Math.abs(v) >= W.WIN - 200) break; // vittoria certa
      }
    }
  }
};
