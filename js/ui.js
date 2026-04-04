// ui.js — Rendering canvas chess.com dark style

class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.L      = {};         // layout calcolato
    this.update();
  }

  update() {
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width  = W;
    this.canvas.height = H;
    const L = this.L;

    const EVAL_W  = 18, PANEL_W = 180, GAP = 8, TOP_H = 34;
    const availW  = W - EVAL_W - PANEL_W - GAP * 4;
    const availH  = H - TOP_H - GAP * 2;
    const raw     = Math.min(availW, availH);
    const cp      = Math.max(12, Math.floor(raw / 9));

    L.cp = cp; L.gp = cp * 3; L.bp = cp * 9;
    L.bx = EVAL_W + GAP * 2 + Math.max(0, Math.floor((availW - L.bp) / 2));
    L.by = TOP_H  + Math.max(0, Math.floor((availH - L.bp) / 2));
    L.ex = 4; L.ey = L.by; L.ew = EVAL_W - 4; L.eh = L.bp;
    L.px = L.bx + L.bp + GAP * 2;
    L.py = L.by; L.ph = L.bp; L.pw = PANEL_W;
    L.W  = W; L.H  = H;

    // Font
    const fs  = Math.max(10, Math.min(14, Math.floor(cp / 3) + 6));
    const fsm = fs + 3;
    L.fS   = `${fs}px 'Segoe UI',Arial,sans-serif`;
    L.fM   = `bold ${fsm}px 'Segoe UI',Arial,sans-serif`;
    L.fL   = `bold ${Math.min(36, cp*2)}px 'Segoe UI',Arial,sans-serif`;
    L.fXL  = `bold ${Math.min(72, Math.floor(L.gp*0.55))}px 'Segoe UI',Arial,sans-serif`;
    L.fTiny= `${Math.max(8, fs-2)}px 'Segoe UI',Arial,sans-serif`;
    L.fsz  = fs; L.fszm = fsm;

    // Bottoni
    const bw = L.pw - 16, bh = Math.max(28, fs + 14);
    L.newR  = { x: L.px+8, y: L.py+L.ph - bh - 8,       w: bw, h: bh };
    L.hintR = { x: L.px+8, y: L.py+L.ph - bh*2 - 20,    w: bw, h: bh };
    L.innerW = L.pw - 16;
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  _clipText(text, maxW, font) {
    const ctx = this.ctx;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW)
      text = text.slice(0, -1);
    return text + '…';
  }

  _btn(r, text, font, base, hover, border, isHover) {
    const ctx = this.ctx;
    ctx.fillStyle = isHover ? hover : base;
    this._roundRect(r.x, r.y, r.w, r.h, 5, true, false);
    ctx.strokeStyle = border; ctx.lineWidth = 1;
    this._roundRect(r.x, r.y, r.w, r.h, 5, false, true);
    ctx.fillStyle = C.TXT_A; ctx.font = font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, r.x + r.w/2, r.y + r.h/2);
  }

  _roundRect(x, y, w, h, r, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x+w,y,   x+w,y+r,   r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x+w,y+h, x+w-r,y+h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x,y+h, x,y+h-r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x,y, x+r,y, r);
    ctx.closePath();
    if (fill)   ctx.fill();
    if (stroke) ctx.stroke();
  }

  // ── Eval bar ─────────────────────────────────────────────────────────
  drawEvalBar(score) {
    const ctx = this.ctx, L = this.L;
    const { ex:x, ey:y, ew:w, eh:h } = L;
    const CLAMP = 3000;
    const cl    = Math.max(-CLAMP, Math.min(CLAMP, score));
    const ratio = (cl + CLAMP) / (CLAMP * 2);
    const fill  = Math.max(4, Math.floor(h * ratio));

    // sfondo scuro (O)
    ctx.fillStyle = C.EVAL_D;
    this._roundRect(x, y, w, h, 4, true, false);
    // riempimento chiaro (X)
    ctx.fillStyle = C.EVAL_L;
    ctx.beginPath();
    ctx.rect(x, y + h - fill, w, fill);
    ctx.fill();
    // bordo
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1;
    this._roundRect(x, y, w, h, 4, false, true);

    // label
    let label = null, isX = score > 0;
    if (Math.abs(score) >= 90000) { label = 'M'; }
    else if (score !== 0) {
      const v = Math.abs(score)/100;
      label = v < 10 ? v.toFixed(1) : Math.floor(v).toString();
    }
    if (label) {
      ctx.font = L.fTiny;
      ctx.textAlign = 'center';
      ctx.fillStyle = isX ? C.EVAL_D : C.EVAL_L;
      const th = L.fsz - 2;
      let ty = isX ? Math.min(y + h - fill + 3, y + h - th - 2)
                   : Math.max(y + h - fill - th - 3, y + 2);
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + w/2, ty);
    }
  }

  // ── Board ─────────────────────────────────────────────────────────────
  drawBoard(game, hintMove, showHint) {
    const ctx = this.ctx, L = this.L;
    const { bx, by, cp, gp, bp } = L;
    const ab   = game.active;
    const last = game.hist.length ? game.hist[game.hist.length-1] : null;

    // Sfondi celle
    for (let br=0; br<3; br++) for (let bc=0; bc<3; bc++) {
      const bi = br*3+bc, act = bi === ab;
      for (let r=0; r<3; r++) for (let c=0; c<3; c++) {
        const lt = (r+c)%2 === 0;
        ctx.fillStyle = act ? (lt ? C.CELL_AL : C.CELL_AD)
                            : (lt ? C.CELL_L  : C.CELL_D);
        ctx.fillRect(bx+bc*gp+c*cp, by+br*gp+r*cp, cp, cp);
      }
    }

    // Highlights
    const hl = (b, c, col) => {
      const [br2,bc2] = [Math.floor(b/3), b%3];
      const [r2, c2]  = [Math.floor(c/3), c%3];
      ctx.fillStyle = col;
      ctx.fillRect(bx+bc2*gp+c2*cp, by+br2*gp+r2*cp, cp, cp);
    };
    if (last)                   hl(last.b, last.c, C.LAST_HL);
    if (showHint && hintMove)   hl(hintMove.b, hintMove.c, C.HINT_HL);

    // Pezzi
    const tk = Math.max(2, Math.floor(cp/7));
    for (let b=0; b<9; b++) for (let c=0; c<9; c++) {
      const p = game.board[b][c];
      if (p === ' ') continue;
      const [br2,bc2] = [Math.floor(b/3), b%3];
      const [r2, c2]  = [Math.floor(c/3), c%3];
      const cx = bx+bc2*gp+c2*cp+cp/2, cy = by+br2*gp+r2*cp+cp/2;
      const off = Math.max(3, cp/2 - Math.max(3, cp/9));
      ctx.lineWidth = tk; ctx.lineCap = 'round';
      if (p === 'X') {
        ctx.strokeStyle = C.X_COL;
        ctx.beginPath(); ctx.moveTo(cx-off,cy-off); ctx.lineTo(cx+off,cy+off); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+off,cy-off); ctx.lineTo(cx-off,cy+off); ctx.stroke();
      } else {
        ctx.strokeStyle = C.O_COL;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(3, cp/2 - Math.max(2, cp/11)), 0, Math.PI*2);
        ctx.stroke();
      }
    }

    // Overlay griglie vinte
    for (let i=0; i<9; i++) {
      const cell = game.big[i];
      if (cell === ' ') continue;
      const [br2,bc2] = [Math.floor(i/3), i%3];
      const ox = bx+bc2*gp, oy = by+br2*gp;
      ctx.fillStyle = cell==='X' ? 'rgba(235,95,92,0.4)'
                    : cell==='O' ? 'rgba(82,176,228,0.4)'
                                 : 'rgba(90,88,84,0.4)';
      ctx.fillRect(ox+1, oy+1, gp-2, gp-2);
      if (cell === 'X' || cell === 'O') {
        ctx.font = L.fXL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = cell==='X' ? C.X_COL : C.O_COL;
        ctx.fillText(cell, ox+gp/2, oy+gp/2);
      }
    }

    // Linee
    for (let i=1; i<9; i++) {
      const big = i%3===0;
      ctx.strokeStyle = big ? C.LINE_OUT : C.LINE_IN;
      ctx.lineWidth   = big ? Math.max(3,Math.floor(cp/8)) : Math.max(1,Math.floor(cp/18));
      ctx.beginPath(); ctx.moveTo(bx+i*cp,by); ctx.lineTo(bx+i*cp,by+bp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx,by+i*cp); ctx.lineTo(bx+bp,by+i*cp); ctx.stroke();
    }
    ctx.strokeStyle = C.LINE_OUT; ctx.lineWidth = Math.max(2,Math.floor(cp/10));
    ctx.strokeRect(bx, by, bp, bp);

    // Ring griglia attiva
    if (ab !== null && !game.over) {
      const [ar,ac] = [Math.floor(ab/3), ab%3];
      ctx.strokeStyle = 'rgba(246,196,60,1)';
      ctx.lineWidth   = Math.max(2, Math.floor(cp/8));
      this._roundRect(bx+ac*gp, by+ar*gp, gp, gp, 2, false, true);
    }
  }

  // ── Pannello laterale ─────────────────────────────────────────────────
  drawPanel(game, score, aiPlayer, showHint, thinking, mouse) {
    const ctx = this.ctx, L = this.L;
    const { px, py, ph, pw, innerW } = L;

    // Sfondo
    ctx.fillStyle = C.PANEL_BG;
    this._roundRect(px-4, py, pw+4, ph, 6, true, false);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1;
    this._roundRect(px-4, py, pw+4, ph, 6, false, true);

    // Giocatori
    const playerLabel = (yp, p) => {
      const active = game.player === p && !game.over;
      ctx.fillStyle = active ? (p==='X'?C.X_COL:C.O_COL) : C.TXT_B;
      ctx.font = L.fM; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const role = aiPlayer ? (p===aiPlayer?' (AI)':' (Tu)') : '';
      const dot  = active ? '* ' : '  ';
      ctx.fillText(this._clipText(dot+p+role, innerW, L.fM), px+8, yp);
    };
    playerLabel(py + 6, 'O');
    playerLabel(py + ph - L.fszm - 8, 'X');

    // Mini meta-board
    const ms = Math.max(10, Math.floor(innerW/4)-4), mg = 3;
    const mt = ms*3+mg*2;
    const mx = px+8+Math.floor((innerW-mt)/2);
    const my = py + L.fszm + 14;
    for (let i=0; i<9; i++) {
      const cell = game.big[i];
      const [r2,c2] = [Math.floor(i/3), i%3];
      const rx = mx+c2*(ms+mg), ry = my+r2*(ms+mg);
      ctx.fillStyle = cell==='X'?C.X_DIM : cell==='O'?C.O_DIM : '#262422';
      this._roundRect(rx, ry, ms, ms, 2, true, false);
      if (cell==='X'||cell==='O') {
        ctx.fillStyle = cell==='X'?C.X_COL:C.O_COL;
        ctx.font = L.fTiny; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(cell, rx+ms/2, ry+ms/2);
      }
    }
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1;
    this._roundRect(mx-2, my-2, mt+4, mt+4, 3, false, true);

    // Score testuale
    const scoreY = my + mt + 10;
    let stxt, scol;
    if (Math.abs(score) >= 90000) {
      stxt = (score>0?'X':'O') + ' vince!';
      scol = score>0 ? C.X_COL : C.O_COL;
    } else if (score > 0) {
      stxt = `+${(score/100).toFixed(1)}  X avanti`; scol = C.X_COL;
    } else if (score < 0) {
      stxt = `-${(Math.abs(score)/100).toFixed(1)}  O avanti`; scol = C.O_COL;
    } else {
      stxt = 'Posizione pari'; scol = C.TXT_B;
    }
    ctx.fillStyle = scol; ctx.font = L.fS;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(this._clipText(stxt, innerW, L.fS), px+8+innerW/2, scoreY);

    // Storia mosse
    const histY  = scoreY + L.fsz + 8;
    const thinkH = thinking ? L.fsz + 4 : 0;
    const histBot = L.hintR.y - 10 - thinkH;
    const histH   = Math.max(0, histBot - histY);
    if (histH > 8) {
      ctx.fillStyle = '#121110';
      this._roundRect(px+4, histY, pw-8, histH, 4, true, false);
      const lh      = L.fsz + 3;
      const maxVis  = Math.max(1, Math.floor(histH/lh));
      const hist    = game.hist;
      const pairs   = [];
      for (let i=0; i<hist.length; i+=2)
        pairs.push([hist[i], hist[i+1]||null]);
      const vis   = pairs.slice(-maxVis);
      const baseN = pairs.length - vis.length + 1;
      let fy = histY + 4;
      ctx.fillStyle = C.TXT_B; ctx.font = L.fTiny;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let idx=0; idx<vis.length; idx++) {
        const [xm, om] = vis[idx];
        const mn = baseN + idx;
        const [xr,xcc] = [Math.floor(xm.c/3), xm.c%3];
        let row = `${mn}. X:g${xm.b+1}(${xr+1},${xcc+1})`;
        if (om) {
          const [or2,occ2] = [Math.floor(om.c/3), om.c%3];
          row += `  O:g${om.b+1}(${or2+1},${occ2+1})`;
        }
        ctx.fillText(this._clipText(row, innerW-4, L.fTiny), px+8, fy);
        fy += lh;
        if (fy + lh > histBot) break;
      }
    }

    // Thinking
    if (thinking) {
      ctx.fillStyle = '#d2b93a'; ctx.font = L.fS;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('AI sta pensando...', px+8+innerW/2, L.hintR.y - L.fsz - 6);
    }

    // Bottoni
    const hov = (r) => mouse && mouse.x>=r.x && mouse.x<r.x+r.w &&
                               mouse.y>=r.y && mouse.y<r.y+r.h;
    if (aiPlayer !== game.player && !game.over) {
      const htxt = showHint ? '[ Nascondi hint ]' : '[ Suggerimento ]';
      this._btn(L.hintR, htxt, L.fS, C.BTN_G, C.BTN_GH, C.BTN_GB, hov(L.hintR));
    }
    this._btn(L.newR, '[ Nuova partita ]', L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hov(L.newR));
  }

  // ── Header status ─────────────────────────────────────────────────────
  drawStatus(game, aiPlayer) {
    const ctx = this.ctx, L = this.L;
    let txt, col;
    if (game.over) {
      if (game.winner==='X'||game.winner==='O') {
        txt=`${game.winner} ha vinto!`; col=game.winner==='X'?C.X_COL:C.O_COL;
      } else { txt='Pareggio!'; col=C.TXT_B; }
    } else {
      const p    = game.player;
      const role = aiPlayer ? (p===aiPlayer?'AI':'Tu') : `Giocatore ${p}`;
      txt = `Turno: ${p}  --  ${role}`;
      col = p==='X' ? C.X_COL : C.O_COL;
    }
    ctx.font = L.fM; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, L.bx + L.bp/2, 17);
  }

  // ── Menu ──────────────────────────────────────────────────────────────
  drawMenu(mouse) {
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = 'rgba(10,9,8,0.88)';
    ctx.fillRect(0, 0, L.W, L.H);

    ctx.font = L.fL; ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ty = Math.max(18, Math.floor(L.H/8));
    ctx.fillText('ULTIMATE TIC-TAC-TOE', L.W/2, ty);

    ctx.font = L.fS; ctx.fillStyle = C.TXT_B;
    ctx.fillText('Minimax + Alpha-Beta + Euristica avanzata',
                 L.W/2, ty + L.fszm*2 + 8);

    const opts  = [['Gioca come X (Rosso)','O'],
                   ['Gioca come O (Azzurro)','X'],
                   ['Due Giocatori', null]];
    const bw    = Math.min(300, L.W - 80);
    const bh    = Math.max(40, L.fszm + 18);
    const total = opts.length * bh + (opts.length-1) * 12;
    let cy = Math.max(ty + L.fszm*2 + 40, Math.floor((L.H-total)/2));
    if (cy + total > L.H - 16) cy = Math.max(ty+L.fszm*2+20, L.H-16-total);

    const rects = [];
    for (const [txt, role] of opts) {
      const r = { x: L.W/2-bw/2, y: cy, w: bw, h: bh };
      const ho = mouse && mouse.x>=r.x && mouse.x<r.x+r.w &&
                          mouse.y>=r.y && mouse.y<r.y+r.h;
      ctx.fillStyle = ho ? '#484642' : '#302e2a';
      this._roundRect(r.x, r.y, r.w, r.h, 8, true, false);
      ctx.strokeStyle = ho ? '#696560' : '#3e3b37'; ctx.lineWidth=2;
      this._roundRect(r.x, r.y, r.w, r.h, 8, false, true);
      ctx.fillStyle='#fff'; ctx.font=L.fM;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(txt, r.x+r.w/2, r.y+r.h/2);
      rects.push({ r, role });
      cy += bh + 12;
    }
    return rects;
  }

  // ── Game over overlay ─────────────────────────────────────────────────
  drawGameOver(game) {
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0,0,L.W,L.H);
    let msg, col;
    if (game.winner==='X'||game.winner==='O') {
      msg=`${game.winner} vince!`; col=game.winner==='X'?C.X_COL:C.O_COL;
    } else { msg='Pareggio!'; col=C.TXT_B; }
    ctx.font=L.fXL; ctx.fillStyle=col;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(msg, L.W/2, L.H/2);
    ctx.font=L.fS; ctx.fillStyle=C.TXT_B;
    ctx.textBaseline='top';
    ctx.fillText('Tocca per tornare al menu', L.W/2, L.H/2+50);
  }
}
