// main.js — Game loop con touch mobile e AI continua

const canvas = document.getElementById('gameCanvas');
const ui     = new UI(canvas);

let game      = new Game();
let aiPlayer  = null;
let showMenu  = true;
let hintMove  = null;
let showHint  = false;
let score     = 0;
let menuRects = [];
let mouse     = { x: -1, y: -1 };
let thinking  = false;
let aiMovePending = false;

// ── Web Worker ────────────────────────────────────────────────────────────────
const worker = new Worker('./js/ai.js');

// Ogni volta che vogliamo riavviare l'AI usiamo un session ID:
// il worker manda il sessionId con ogni risultato, e noi ignoriamo
// i risultati di sessioni vecchie (arrivati dopo uno stop).
let aiSession = 0;

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'result') return;

  // Ignora risultati di sessioni precedenti
  if (msg.session !== aiSession) return;

  // Aggiorna sempre score e hint (barra eval in tempo reale)
  score    = msg.score;
  hintMove = msg.move;

  // Esegui mossa AI solo se è davvero il suo turno e non stiamo
  // già processando una mossa
  if (aiMovePending) return;
  if (game.over) return;
  if (aiPlayer === null) return;
  if (game.player !== aiPlayer) return;
  if (msg.depth < 4) return;
  if (msg.move === null) return;

  const legal = game.moves().some(m => m.b === msg.move.b && m.c === msg.move.c);
  if (!legal) return;

  aiMovePending = true;

  // Manda stop al worker (non aspettiamo — il session check farà il resto)
  worker.postMessage({ type: 'stop', session: aiSession });

  // Applica la mossa: questo chiama startAI() che incrementa aiSession,
  // quindi eventuali messaggi rimasti in coda dal vecchio session vengono scartati
  applyMove(msg.move.b, msg.move.c);

  aiMovePending = false;
};

function startAI() {
  if (game.over) { thinking = false; return; }

  // Incrementa session: i messaggi con session vecchio verranno ignorati
  aiSession++;
  thinking = true;

  worker.postMessage({
    type: 'start',
    session: aiSession,
    state: {
      board:  game.board,
      big:    game.big,
      player: game.player,
      active: game.active,
      over:   game.over,
      winner: game.winner,
      hist:   game.hist,
    }
  });
}

function applyMove(b, c) {
  game.push(b, c);
  showHint = false;
  hintMove = null;
  score    = 0;
  startAI();   // riavvia sempre — l'AI calcola sia per sé che per suggerimenti
}

function newGame() {
  // Invalida sessione corrente
  aiSession++;
  worker.postMessage({ type: 'stop', session: aiSession });
  thinking      = false;
  aiMovePending = false;

  game     = new Game();
  aiPlayer = null;
  showMenu = true;
  hintMove = null;
  showHint = false;
  score    = 0;
}

// ── Render loop ───────────────────────────────────────────────────────────────
function render() {
  const L = ui.L, ctx = ui.ctx;
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, L.W, L.H);

  if (showMenu) {
    ui.drawBoard(game, null, false);
    menuRects = ui.drawMenu(mouse);
  } else {
    ui.drawEvalBar(score);
    ui.drawBoard(game, hintMove, showHint);
    ui.drawPanel(game, score, aiPlayer, showHint, thinking, mouse);
    ui.drawStatus(game, aiPlayer);
    if (game.over) ui.drawGameOver(game);
  }
  requestAnimationFrame(render);
}

// ── Input ─────────────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  let cx, cy;
  if (e.changedTouches && e.changedTouches.length > 0) {
    cx = e.changedTouches[0].clientX;
    cy = e.changedTouches[0].clientY;
  } else if (e.touches && e.touches.length > 0) {
    cx = e.touches[0].clientX;
    cy = e.touches[0].clientY;
  } else {
    cx = e.clientX;
    cy = e.clientY;
  }
  return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}

function inRect(pos, r) {
  return r && pos.x >= r.x && pos.x < r.x + r.w &&
              pos.y >= r.y && pos.y < r.y + r.h;
}

function handlePointerMove(e) { mouse = getPos(e); }
function handlePointerDown(e) { mouse = getPos(e); }

function handlePointerUp(e) {
  const pos = getPos(e);
  const L   = ui.L;

  if (showMenu) {
    for (const {r, role} of menuRects) {
      if (inRect(pos, r)) {
        aiPlayer = role;
        showMenu = false;
        startAI();
        return;
      }
    }
    return;
  }

  if (game.over) { newGame(); return; }

  if (inRect(pos, L.newR)) { newGame(); return; }

  if (L.hintR && aiPlayer !== game.player && inRect(pos, L.hintR)) {
    showHint = !showHint;
    return;
  }

  // Mossa umana
  if (game.player !== aiPlayer &&
      pos.x >= L.bx && pos.x < L.bx + L.bp &&
      pos.y >= L.by && pos.y < L.by + L.bp) {
    const rx  = pos.x - L.bx;
    const ry  = pos.y - L.by;
    const bc2 = Math.floor(rx / L.gp);
    const br2 = Math.floor(ry / L.gp);
    const c2  = Math.floor((rx % L.gp) / L.cp);
    const r2  = Math.floor((ry % L.gp) / L.cp);
    const b   = br2 * 3 + bc2;
    const c   = r2  * 3 + c2;
    const legal = game.moves().some(m => m.b === b && m.c === c);
    if (legal) applyMove(b, c);
  }
}

// Mouse
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mouseup',   handlePointerUp);

// Touch
canvas.addEventListener('touchstart', handlePointerDown, { passive: true });
canvas.addEventListener('touchmove',  handlePointerMove, { passive: true });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  handlePointerUp(e);
}, { passive: false });

window.addEventListener('resize', () => { ui.update(); });

render();