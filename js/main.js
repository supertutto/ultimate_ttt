// main.js — Game loop con touch mobile corretto

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

// ── Web Worker ────────────────────────────────────────────────────────────────
const worker = new Worker('./js/ai.js');

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'result') return;
  score    = msg.score;
  hintMove = msg.move;

  if (!game.over && aiPlayer !== null && game.player === aiPlayer
      && msg.move !== null && msg.depth >= 4) {
    const legal = game.moves().some(m => m.b===msg.move.b && m.c===msg.move.c);
    if (legal) { stopAI(); applyMove(msg.move.b, msg.move.c); }
  }
};

function startAI() {
  if (game.over) return;
  thinking = true;
  worker.postMessage({
    type: 'start',
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

function stopAI() {
  worker.postMessage({type:'stop'});
  thinking = false;
}

function applyMove(b, c) {
  game.push(b, c);
  showHint = false;
  hintMove = null;
  score    = 0;
  startAI();
}

function newGame() {
  stopAI();
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

// ── Input unificato mouse + touch ─────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  // scaleX/scaleY gestiscono il caso canvas CSS != canvas pixels
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
  return {
    x: (cx - rect.left) * scaleX,
    y: (cy - rect.top)  * scaleY,
  };
}

function inRect(pos, r) {
  return pos.x >= r.x && pos.x < r.x + r.w &&
         pos.y >= r.y && pos.y < r.y + r.h;
}

function handlePointerMove(e) {
  mouse = getPos(e);
}

function handlePointerDown(e) {
  // Aggiorna mouse subito anche al touch, così i bottoni mostrano hover
  mouse = getPos(e);
}

function handlePointerUp(e) {
  // Usa changedTouches per touchend (touches è vuoto al momento del rilascio)
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

  // Nuova partita
  if (L.newR && inRect(pos, L.newR)) { newGame(); return; }

  // Toggle hint (solo turno umano)
  if (L.hintR && aiPlayer !== game.player && inRect(pos, L.hintR)) {
    showHint = !showHint;
    return;
  }

  // Click/tap sulla board — solo se turno umano
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
canvas.addEventListener('mousemove',  handlePointerMove);
canvas.addEventListener('mousedown',  handlePointerDown);
canvas.addEventListener('mouseup',    handlePointerUp);

// Touch — touchstart registra posizione, touchend esegue azione
// NON usiamo { passive: false } su touchstart per non bloccare lo scroll
canvas.addEventListener('touchstart', (e) => {
  handlePointerDown(e);
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  handlePointerMove(e);
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  // preventDefault qui blocca il click fantasma che arriva 300ms dopo
  e.preventDefault();
  handlePointerUp(e);
}, { passive: false });

// NON aggiungere listener su 'click' — touchend + preventDefault lo sopprime già

// Resize
window.addEventListener('resize', () => { ui.update(); });

// ── Avvio ─────────────────────────────────────────────────────────────────────
render();