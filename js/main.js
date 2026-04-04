// main.js — Game loop PWA

const canvas  = document.getElementById('gameCanvas');
const ui      = new UI(canvas);

let game      = new Game();
let aiPlayer  = null;
let showMenu  = true;
let hintMove  = null;
let showHint  = false;
let score     = 0;
let menuRects = [];
let mouse     = { x: 0, y: 0 };
let thinking  = false;

// ── Web Worker AI ──────────────────────────────────────────────────────────
const worker = new Worker('./js/ai.js');

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'result') return;

  score    = msg.score;
  hintMove = msg.move;

  if (!game.over && aiPlayer !== null && game.player === aiPlayer
      && msg.move !== null && msg.depth >= 4) {
    const mvs = game.moves();
    const legal = mvs.some(m => m.b === msg.move.b && m.c === msg.move.c);
    if (legal) {
      stopAI();
      applyMove(msg.move.b, msg.move.c);
    }
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
  worker.postMessage({ type: 'stop' });
  thinking = false;
}

function applyMove(b, c) {
  game.push(b, c);
  showHint  = false;
  hintMove  = null;
  score     = 0;   // verrà aggiornato dall'AI
  startAI();
}

function newGame() {
  stopAI();
  game      = new Game();
  aiPlayer  = null;
  showMenu  = true;
  hintMove  = null;
  showHint  = false;
  score     = 0;
}

// ── Render loop ────────────────────────────────────────────────────────────
function render() {
  const ctx = ui.ctx, L = ui.L;
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

// ── Input (mouse + touch) ─────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src  = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function handleMove(e) {
  mouse = getPos(e);
}

function handleClick(e) {
  e.preventDefault();
  const pos = getPos(e);
  const L   = ui.L;

  if (showMenu) {
    for (const { r, role } of menuRects) {
      if (pos.x>=r.x && pos.x<r.x+r.w && pos.y>=r.y && pos.y<r.y+r.h) {
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
  const nr = L.newR;
  if (pos.x>=nr.x && pos.x<nr.x+nr.w && pos.y>=nr.y && pos.y<nr.y+nr.h) {
    newGame(); return;
  }

  // Toggle hint
  const hr = L.hintR;
  if (aiPlayer !== game.player &&
      pos.x>=hr.x && pos.x<hr.x+hr.w && pos.y>=hr.y && pos.y<hr.y+hr.h) {
    showHint = !showHint; return;
  }

  // Click board (solo turno umano)
  if (game.player !== aiPlayer &&
      pos.x >= L.bx && pos.x < L.bx+L.bp &&
      pos.y >= L.by && pos.y < L.by+L.bp) {
    const rx  = pos.x - L.bx, ry = pos.y - L.by;
    const bc2 = Math.floor(rx / L.gp), br2 = Math.floor(ry / L.gp);
    const c2  = Math.floor((rx % L.gp) / L.cp);
    const r2  = Math.floor((ry % L.gp) / L.cp);
    const b   = br2*3 + bc2, c = r2*3 + c2;
    const legal = game.moves().some(m => m.b===b && m.c===c);
    if (legal) applyMove(b, c);
  }
}

canvas.addEventListener('mousemove',  handleMove);
canvas.addEventListener('touchmove',  handleMove, { passive: true });
canvas.addEventListener('click',      handleClick);
canvas.addEventListener('touchend',   handleClick);

window.addEventListener('resize', () => { ui.update(); });

// ── Avvio ──────────────────────────────────────────────────────────────────
render();
