// main.js — Game loop principale

const canvas = document.getElementById('gameCanvas');
const ui     = new UI(canvas);

let game      = new Game();
let aiPlayer  = null;   // 'X' | 'O' | null (due giocatori)
let showMenu  = true;
let hintMove  = null;
let showHint  = false;
let score     = 0;
let menuRects = [];
let mouse     = { x: -1, y: -1 };
let thinking  = false;

const AI_TIME_MS = 1500;   // ms di ragionamento per mossa AI

// ── Web Worker ────────────────────────────────────────────────────────────────
const worker = new Worker('./js/ai.js');

worker.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === 'result') {
    // Aggiornamento in tempo reale: barra eval e hint
    score    = msg.score;
    hintMove = msg.move;
    return;
  }

  if (msg.type === 'done') {
    // Calcolo terminato
    thinking = false;
    score    = msg.score;

    if (game.over) return;

    // Se era il turno dell'AI → esegui la mossa
    if (aiPlayer !== null && game.player === aiPlayer && msg.move !== null) {
      const legal = game.moves().some(m => m.b===msg.move.b && m.c===msg.move.c);
      if (legal) {
        _applyMove(msg.move.b, msg.move.c);
        return;
      }
    }

    // Altrimenti (turno umano o due giocatori): aggiorna solo hint
    hintMove = msg.move;
  }
};

function _startAI(forMove) {
  if (game.over) { thinking = false; return; }
  thinking = true;
  hintMove = null;
  worker.postMessage({
    type:   'start',
    timeMs: forMove ? AI_TIME_MS : AI_TIME_MS * 2,  // hint ha più tempo
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

function _applyMove(b, c) {
  game.push(b, c);
  showHint  = false;
  hintMove  = null;
  score     = 0;
  // Riavvia AI per la nuova posizione
  // (sia per muovere se tocca all'AI, sia per aggiornare hint/eval)
  _startAI(aiPlayer !== null && game.player === aiPlayer);
}

function _newGame() {
  thinking  = false;
  game      = new Game();
  aiPlayer  = null;
  showMenu  = true;
  hintMove  = null;
  showHint  = false;
  score     = 0;
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
  const rect   = canvas.getBoundingClientRect();
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
    cx = e.clientX; cy = e.clientY;
  }
  return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}

function inRect(pos, r) {
  return r && pos.x >= r.x && pos.x < r.x+r.w &&
              pos.y >= r.y && pos.y < r.y+r.h;
}

function handlePointerMove(e) { mouse = getPos(e); }
function handlePointerDown(e) { mouse = getPos(e); }

function handlePointerUp(e) {
  const pos = getPos(e);
  const L   = ui.L;

  // ── Menu ────────────────────────────────────────────────────────────
  if (showMenu) {
    for (const {r, role} of menuRects) {
      if (inRect(pos, r)) {
        aiPlayer = role;
        showMenu = false;
        // Avvia AI subito per calcolare la prima mossa o hint
        _startAI(aiPlayer !== null && game.player === aiPlayer);
        return;
      }
    }
    return;
  }

  // ── Game over ────────────────────────────────────────────────────────
  if (game.over) { _newGame(); return; }

  // ── Nuova partita ────────────────────────────────────────────────────
  if (inRect(pos, L.newR)) { _newGame(); return; }

  // ── Suggerimento ─────────────────────────────────────────────────────
  // Disponibile sempre tranne durante il turno AI (quando l'AI sta muovendo)
  if (inRect(pos, L.hintR)) {
    const isAiTurn = aiPlayer !== null && game.player === aiPlayer;
    if (!isAiTurn) {
      showHint = !showHint;
      // Se richiesto e non c'è già un hint, avvia calcolo
      if (showHint && hintMove === null && !thinking) {
        _startAI(false);
      }
    }
    return;
  }

  // ── Mossa sulla board ─────────────────────────────────────────────────
  // Bloccata se è il turno dell'AI o se l'AI sta ancora pensando
  const isAiTurn = aiPlayer !== null && game.player === aiPlayer;
  if (isAiTurn || thinking) return;

  if (pos.x >= L.bx && pos.x < L.bx+L.bp &&
      pos.y >= L.by && pos.y < L.by+L.bp) {
    const rx  = pos.x - L.bx, ry = pos.y - L.by;
    const bc2 = Math.floor(rx / L.gp), br2 = Math.floor(ry / L.gp);
    const c2  = Math.floor((rx % L.gp) / L.cp);
    const r2  = Math.floor((ry % L.gp) / L.cp);
    const b   = br2*3 + bc2, c = r2*3 + c2;
    const legal = game.moves().some(m => m.b===b && m.c===c);
    if (legal) _applyMove(b, c);
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

// ── Start ─────────────────────────────────────────────────────────────────────
render();