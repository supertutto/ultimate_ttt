// main.js — Game loop principale

// ── Worker (dichiarati PRIMA di tutto il resto) ───────────────────────────────
const worker       = new Worker('./js/ai.js');
const reviewWorker = new Worker('./js/ai.js');

// ── Canvas e UI ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ui     = new UI(canvas);

// ── Config ────────────────────────────────────────────────────────────────────
const SERVER = 'http://localhost:5000';
const T_MOVE = 1800;
const T_HINT = 3500;

// Comunica l'URL del server ai worker
worker.postMessage({ type: 'setServer', url: SERVER });
reviewWorker.postMessage({ type: 'setServer', url: SERVER });

// ── Stato partita ─────────────────────────────────────────────────────────────
let game      = new Game();
let aiPlayer  = null;     // 'X' | 'O' | null (due giocatori)
let showMenu  = true;
let hintMove  = null;
let showHint  = false;
let score     = 0;
let pv        = [];       // Principal Variation corrente
let menuRects = [];
let mouse     = { x: -1, y: -1 };
let thinking  = false;
let moveEvals = [];       // eval prima di ogni mossa
let movePVs   = [];       // PV prima di ogni mossa

// ── Post-game / Review ────────────────────────────────────────────────────────
let doneGame     = null;
let doneEvals    = [];
let donePVs      = [];
let showPostGame = false;
let reviewMode   = false;
let reviewStep   = 0;
let reviewStates = [];
let reviewPV     = [];
let reviewScore  = 0;
let reviewThink  = false;
let reviewLines  = [];    // linee alternative calcolate dal server

// ── Server ────────────────────────────────────────────────────────────────────
let srvOk     = false;
let srvMsg    = 'Server offline';
let srvPat    = '';
let srvDBHits = 0;        // quante volte l'AI ha usato il DB in questa sessione

// ── Worker onmessage ──────────────────────────────────────────────────────────
worker.onmessage = ({ data: msg }) => {
  if (msg.type === 'result') {
    score    = msg.score;
    hintMove = msg.move;
    if (msg.pv) pv = msg.pv;
    if (msg.fromDB) {
      srvDBHits++;
      srvPat = `DB hit #${srvDBHits} (depth ${msg.depth})`;
    }
    return;
  }
  if (msg.type === 'done') {
    thinking  = false;
    score     = msg.score;
    hintMove  = msg.move || hintMove;
    if (msg.pv) pv = msg.pv;
    if (!game.over && aiPlayer !== null && game.player === aiPlayer && msg.move) {
      const ok = game.moves().some(m => m.b === msg.move.b && m.c === msg.move.c);
      if (ok) _apply(msg.move.b, msg.move.c);
    }
  }
};

reviewWorker.onmessage = ({ data: msg }) => {
  if (msg.type === 'result') { reviewScore = msg.score; reviewPV = msg.pv || []; }
  if (msg.type === 'done')   { reviewThink = false; reviewScore = msg.score; reviewPV = msg.pv || []; }
};

// ── Server functions ──────────────────────────────────────────────────────────
async function pingSrv() {
  try {
    const r = await fetch(SERVER + '/ping', { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const d = await r.json();
      srvOk  = true;
      srvMsg = `DB: ${d.total_in_db || d.db || 0} | Hit: ${srvDBHits}`;
      return;
    }
  } catch(e) {}
  srvOk  = false;
  srvMsg = 'Server offline';
}
setInterval(pingSrv, 10000);
pingSrv();

async function analyzePos(g) {
  if (!srvOk) return;
  try {
    const r = await fetch(SERVER + '/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: g.board, big: g.big, player: g.player,
        active: g.active, over: g.over, winner: g.winner,
        hist: g.hist.map(({ b, c }) => [b, c]),
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const d = await r.json();
      srvPat = d.pattern || '';
      if (d.pv && d.pv.length > pv.length && !reviewMode && !showPostGame) {
        pv = d.pv.map(m => Array.isArray(m) ? { b: m[0], c: m[1] } : m);
      }
    }
  } catch(e) {}
}

async function fetchReviewLines(g) {
  reviewLines = [];
  if (!srvOk || g.over) return;
  try {
    const r = await fetch(SERVER + '/lines', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: g.board, big: g.big, player: g.player,
        active: g.active, over: g.over, winner: g.winner,
        hist: g.hist.map(({ b, c }) => [b, c]),
        n: 5, depth: 6,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) { const d = await r.json(); reviewLines = d.lines || []; }
  } catch(e) {}
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function getStats() {
  try { return JSON.parse(localStorage.getItem('uttt_s') || '{"w":0,"l":0,"d":0,"games":[]}'); }
  catch(e) { return { w: 0, l: 0, d: 0, games: [] }; }
}

function addStat(winner) {
  const s = getStats();
  if (aiPlayer !== null) {
    if (winner === 'D') s.d++;
    else if (winner === aiPlayer) s.l++;
    else s.w++;
  }
  s.games.unshift({ winner, ai: aiPlayer, moves: game.hist.length,
                    date: new Date().toLocaleDateString('it-IT') });
  if (s.games.length > 15) s.games.length = 15;
  localStorage.setItem('uttt_s', JSON.stringify(s));
}

// ── AI functions ──────────────────────────────────────────────────────────────
function _startAI(forMove) {
  if (game.over) { thinking = false; return; }
  thinking = true; hintMove = null; pv = [];
  worker.postMessage({
    type: 'start', timeMs: forMove ? T_MOVE : T_HINT,
    state: { board: game.board, big: game.big, player: game.player,
             active: game.active, over: game.over, winner: game.winner, hist: game.hist },
  });
}

function _apply(b, c) {
  moveEvals.push(score);
  movePVs.push([...pv]);
  game.push(b, c);
  showHint = false; hintMove = null; score = 0; pv = [];
  analyzePos(game);
  if (game.over) { _gameOver(); return; }
  _startAI(aiPlayer !== null && game.player === aiPlayer);
}

function _gameOver() {
  thinking     = false;
  doneGame     = game.copy();
  doneEvals    = [...moveEvals];
  donePVs      = [...movePVs];
  addStat(game.winner);
  showPostGame = true;
}

// ── Review functions ──────────────────────────────────────────────────────────
function _startReviewAnalysis() {
  if (reviewStep >= reviewStates.length) return;
  const g = reviewStates[reviewStep];
  if (g.over) { reviewPV = []; reviewScore = doneEvals[reviewStep - 1] || 0; return; }
  reviewThink = true; reviewPV = [];
  const saved = donePVs[reviewStep];
  if (saved && saved.length) reviewPV = saved;
  reviewWorker.postMessage({
    type: 'start', timeMs: 2500,
    state: { board: g.board, big: g.big, player: g.player,
             active: g.active, over: g.over, winner: g.winner, hist: g.hist },
  });
}

function enterReview() {
  const g = new Game();
  reviewStates = [g.copy()];
  for (const { b, c } of doneGame.hist) { g.push(b, c); reviewStates.push(g.copy()); }
  reviewStep   = 0;
  reviewMode   = true;
  showPostGame = false;
  reviewLines  = [];
  _startReviewAnalysis();
  fetchReviewLines(reviewStates[0]);
}

function exitReview() { reviewMode = false; showPostGame = true; }

function setReviewStep(s) {
  const n = Math.max(0, Math.min(reviewStates.length - 1, s));
  if (n === reviewStep) return;
  reviewStep  = n;
  reviewLines = [];
  // Ferma il worker review corrente
  reviewWorker.postMessage({
    type: 'start', timeMs: 1,
    state: { board: new Game().board, big: new Game().big, player: 'X',
             active: null, over: true, winner: null, hist: [] },
  });
  _startReviewAnalysis();
  if (reviewStep < reviewStates.length) fetchReviewLines(reviewStates[reviewStep]);
}

function _newGame() {
  thinking     = false;
  reviewMode   = false;
  showPostGame = false;
  game         = new Game();
  aiPlayer     = null;
  showMenu     = true;
  hintMove     = null;
  showHint     = false;
  score        = 0;
  pv           = [];
  moveEvals    = [];
  movePVs      = [];
  srvPat       = '';
}

// ── Render loop ───────────────────────────────────────────────────────────────
function render() {
  const { ctx, L } = ui;
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, L.W, L.H);

  if (showMenu) {
    ui.drawBoard(game, null, false, []);
    menuRects = ui.drawMenu(mouse);

  } else if (reviewMode) {
    const g = reviewStates[reviewStep];
    ui.drawBoard(g, null, false, reviewPV);
    ui.drawReview(reviewStates, doneEvals, reviewStep, doneGame.winner,
                  aiPlayer, mouse, reviewScore, reviewThink, reviewPV, reviewLines);

  } else {
    ui.drawEvalBar(score);
    const showPV = showHint || (aiPlayer !== null && game.player === aiPlayer);
    ui.drawBoard(game, showHint ? hintMove : null, showHint, showPV ? pv : []);
    ui.drawStatus(game, aiPlayer);
    if (!game.over)
      ui.drawPanel(game, score, aiPlayer, showHint, thinking, mouse);
    ui.drawServerBadge(srvOk, srvMsg, srvPat, srvDBHits);
    if (showPostGame) ui.drawPostGame(doneGame, doneEvals, getStats(), mouse);
  }
  requestAnimationFrame(render);
}

// ── Input ─────────────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx   = canvas.width / rect.width;
  const sy   = canvas.height / rect.height;
  let cx, cy;
  if (e.changedTouches?.length) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
  else if (e.touches?.length)   { cx = e.touches[0].clientX;        cy = e.touches[0].clientY; }
  else                          { cx = e.clientX;                    cy = e.clientY; }
  return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
}

const inR = (pos, r) => pos && r &&
  pos.x >= r.x && pos.x < r.x + r.w &&
  pos.y >= r.y && pos.y < r.y + r.h;

function handleUp(e) {
  const pos = getPos(e);
  const L   = ui.L;

  // ── Review ──────────────────────────────────────────────────────────
  if (reviewMode) {
    const rv = ui.reviewRects || {};
    if (inR(pos, rv.first)) { setReviewStep(0); return; }
    if (inR(pos, rv.prev))  { setReviewStep(reviewStep - 1); return; }
    if (inR(pos, rv.next))  { setReviewStep(reviewStep + 1); return; }
    if (inR(pos, rv.last))  { setReviewStep(reviewStates.length - 1); return; }
    if (inR(pos, rv.exit))  { exitReview(); return; }
    if (rv.moveItems)
      for (const { r, step } of rv.moveItems)
        if (inR(pos, r)) { setReviewStep(step); return; }
    return;
  }

  // ── Post-game ────────────────────────────────────────────────────────
  if (showPostGame) {
    const pg = ui.postGameRects || {};
    if (inR(pos, pg.review))  { enterReview(); return; }
    if (inR(pos, pg.newGame)) { _newGame();    return; }
    return;
  }

  // ── Menu ─────────────────────────────────────────────────────────────
  if (showMenu) {
    for (const { r, role } of menuRects)
      if (inR(pos, r)) {
        aiPlayer = role; showMenu = false;
        _startAI(aiPlayer !== null && game.player === aiPlayer);
        return;
      }
    return;
  }

  // ── Gioco normale ────────────────────────────────────────────────────
  if (game.over) return;
  if (inR(pos, L.newR)) { _newGame(); return; }

  const isAI = aiPlayer !== null && game.player === aiPlayer;
  if (!isAI && inR(pos, L.hintR)) {
    showHint = !showHint;
    if (showHint && !hintMove && !thinking) _startAI(false);
    return;
  }
  if (isAI || thinking) return;

  if (pos.x >= L.bx && pos.x < L.bx + L.bp &&
      pos.y >= L.by && pos.y < L.by + L.bp) {
    const rx = pos.x - L.bx, ry = pos.y - L.by;
    const b  = Math.floor(ry / L.gp) * 3 + Math.floor(rx / L.gp);
    const c  = Math.floor((ry % L.gp) / L.cp) * 3 + Math.floor((rx % L.gp) / L.cp);
    if (game.moves().some(m => m.b === b && m.c === c)) _apply(b, c);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
canvas.addEventListener('mousemove',  e => { mouse = getPos(e); });
canvas.addEventListener('mousedown',  e => { mouse = getPos(e); });
canvas.addEventListener('mouseup',    handleUp);
canvas.addEventListener('touchstart', e => { mouse = getPos(e); }, { passive: true });
canvas.addEventListener('touchmove',  e => { mouse = getPos(e); }, { passive: true });
canvas.addEventListener('touchend',   e => { e.preventDefault(); handleUp(e); }, { passive: false });
window.addEventListener('resize',     () => ui.update());

// ── Avvio ─────────────────────────────────────────────────────────────────────
render();