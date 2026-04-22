// js/ui.js — Rendering canvas completo

class UI {
  constructor(canvas) {
    this.canvas        = canvas;
    this.ctx           = canvas.getContext('2d');
    this.L             = {};
    this.reviewRects   = null;
    this.postGameRects = null;
    this.update();
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  update() {
    const dpr  = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.width        = Math.round(cssW * dpr);
    this.canvas.height       = Math.round(cssH * dpr);
    this.canvas.style.width  = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const L = this.L;
    L.W = cssW; L.H = cssH;
    L.portrait = cssH > cssW;
    if (L.portrait) this._calcPortrait(cssW, cssH, L);
    else            this._calcLandscape(cssW, cssH, L);

    const cp  = L.cp;
    const fs  = Math.max(10, Math.min(14, Math.floor(cp / 3) + 6));
    const fsm = fs + 3;
    L.fTiny = `${Math.max(8, fs - 2)}px 'Segoe UI',Arial,sans-serif`;
    L.fS    = `${fs}px 'Segoe UI',Arial,sans-serif`;
    L.fM    = `bold ${fsm}px 'Segoe UI',Arial,sans-serif`;
    L.fL    = `bold ${Math.min(34, cp * 2)}px 'Segoe UI',Arial,sans-serif`;
    L.fXL   = `bold ${Math.min(68, Math.floor(L.gp * 0.52))}px 'Segoe UI',Arial,sans-serif`;
    L.fsz   = fs;
    L.fszm  = fsm;

    const bw = L.pw - 16;
    const bh = Math.max(28, fs + 14);
    if (L.portrait) {
      const half = Math.floor(L.pw / 2) - 8;
      L.hintR = { x: L.px + 4,             y: L.py + 8, w: half, h: bh };
      L.newR  = { x: L.px + 4 + half + 8,  y: L.py + 8, w: half, h: bh };
    } else {
      L.newR  = { x: L.px + 8, y: L.py + L.ph - bh - 8,     w: bw, h: bh };
      L.hintR = { x: L.px + 8, y: L.py + L.ph - bh * 2 - 20, w: bw, h: bh };
    }
    L.innerW = L.pw - 16;
  }

  _calcLandscape(W, H, L) {
    const EW = 18, PW = 190, GAP = 8, TH = 34;
    const aw = W - EW - PW - GAP * 4;
    const ah = H - TH - GAP * 2;
    const cp = Math.max(12, Math.floor(Math.min(aw, ah) / 9));
    L.cp = cp; L.gp = cp * 3; L.bp = cp * 9;
    L.bx = EW + GAP * 2 + Math.max(0, Math.floor((aw - L.bp) / 2));
    L.by = TH  + Math.max(0, Math.floor((ah - L.bp) / 2));
    L.ex = 4; L.ey = L.by; L.ew = EW - 4; L.eh = L.bp;
    L.px = L.bx + L.bp + GAP * 2;
    L.py = L.by; L.ph = L.bp; L.pw = PW; L.topH = TH;
  }

  _calcPortrait(W, H, L) {
    const TH = 32, PH = Math.max(100, Math.floor(H * 0.22)), EW = 14, GAP = 6;
    const aw = W - EW - GAP * 2;
    const ah = H - TH - PH - GAP * 3;
    const cp = Math.max(10, Math.floor(Math.min(aw, ah) / 9));
    L.cp = cp; L.gp = cp * 3; L.bp = cp * 9;
    L.bx = EW + GAP + Math.max(0, Math.floor((aw - L.bp) / 2));
    L.by = TH  + GAP + Math.max(0, Math.floor((ah - L.bp) / 2));
    L.ex = 2; L.ey = L.by; L.ew = EW - 4; L.eh = L.bp;
    L.px = 0; L.py = L.by + L.bp + GAP;
    L.pw = W; L.ph = PH; L.topH = TH;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _ir(pos, r) {
    return pos && r &&
           pos.x >= r.x && pos.x < r.x + r.w &&
           pos.y >= r.y && pos.y < r.y + r.h;
  }

  _clip(text, maxW, font) {
    const ctx = this.ctx;
    ctx.font = font;
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxW)
      text = text.slice(0, -1);
    return text + '…';
  }

  _rr(x, y, w, h, r, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);   ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);   ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);       ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
    if (fill)   ctx.fill();
    if (stroke) ctx.stroke();
  }

  _btn(r, text, font, base, hov, bord, isHov) {
    if (!r) return;
    const ctx = this.ctx;
    ctx.fillStyle = isHov ? hov : base;
    this._rr(r.x, r.y, r.w, r.h, 5, true, false);
    ctx.strokeStyle = bord; ctx.lineWidth = 1;
    this._rr(r.x, r.y, r.w, r.h, 5, false, true);
    ctx.fillStyle = C.TXT_A; ctx.font = font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this._clip(text, r.w - 8, font), r.x + r.w / 2, r.y + r.h / 2);
  }

  // ── Eval bar ──────────────────────────────────────────────────────────────
  drawEvalBar(score) {
    const ctx = this.ctx, L = this.L;
    const x = L.ex, y = L.ey, w = L.ew, h = L.eh;
    const cl   = Math.max(-3000, Math.min(3000, score));
    const fill = Math.max(4, Math.floor(h * (cl + 3000) / 6000));

    ctx.fillStyle = C.EVAL_D; this._rr(x, y, w, h, 4, true, false);
    ctx.fillStyle = C.EVAL_L;
    ctx.beginPath(); ctx.rect(x, y + h - fill, w, fill); ctx.fill();
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1;
    this._rr(x, y, w, h, 4, false, true);

    if (score !== 0) {
      const isX  = score > 0;
      const v    = Math.abs(score) / 100;
      const lbl  = Math.abs(score) >= 90000 ? 'M'
                 : v < 10 ? v.toFixed(1) : Math.floor(v).toString();
      const th   = L.fsz - 2;
      const ty   = isX ? Math.min(y + h - fill + 3, y + h - th - 2)
                       : Math.max(y + h - fill - th - 3, y + 2);
      ctx.font = L.fTiny; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = isX ? C.EVAL_D : C.EVAL_L;
      ctx.fillText(lbl, x + w / 2, ty);
    }
  }

  // ── Frecce PV ─────────────────────────────────────────────────────────────
  _pvArrows(pvList) {
    if (!pvList || !pvList.length) return;
    const ctx = this.ctx, L = this.L;
    const cp = L.cp, gp = L.gp, bx = L.bx, by = L.by;

    const center = (b, c) => {
      const br = Math.floor(b / 3), bc = b % 3;
      const r  = Math.floor(c / 3), cc = c % 3;
      return { x: bx + bc * gp + cc * cp + cp / 2,
               y: by + br * gp + r  * cp + cp / 2 };
    };

    pvList.forEach((mv, i) => {
      const alpha = Math.max(0.18, 0.72 - i * 0.14);
      const isX   = mv.player === 'X';
      const col   = isX ? `rgba(235,95,92,${alpha})` : `rgba(82,176,228,${alpha})`;
      const pos   = center(mv.b, mv.c);
      const rad   = Math.max(3, cp * 0.28);

      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `bold ${Math.max(7, Math.floor(rad))}px 'Segoe UI',Arial,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), pos.x, pos.y);

      if (i < pvList.length - 1) {
        const np  = center(pvList[i + 1].b, pvList[i + 1].c);
        const dx  = np.x - pos.x, dy = np.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 2) return;
        const ux = dx / dist, uy = dy / dist;
        const sx = pos.x + ux * (rad + 1), sy = pos.y + uy * (rad + 1);
        const ex = np.x  - ux * (rad + 2), ey = np.y  - uy * (rad + 2);

        ctx.strokeStyle = col;
        ctx.lineWidth   = Math.max(1.5, cp / 14);
        ctx.setLineDash([Math.max(3, cp / 10), Math.max(2, cp / 14)]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);

        const ang = Math.atan2(dy, dx);
        const al  = Math.max(4, cp / 7);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - al * Math.cos(ang - 0.42), ey - al * Math.sin(ang - 0.42));
        ctx.lineTo(ex - al * Math.cos(ang + 0.42), ey - al * Math.sin(ang + 0.42));
        ctx.closePath(); ctx.fill();
      }
    });
  }

  // ── Board ─────────────────────────────────────────────────────────────────
  drawBoard(game, hintMove, showHint, pvList) {
    pvList = pvList || [];
    const ctx = this.ctx, L = this.L;
    const bx = L.bx, by = L.by, cp = L.cp, gp = L.gp, bp = L.bp;
    const ab   = game.active;
    const last = game.hist.length ? game.hist[game.hist.length - 1] : null;

    // Sfondi celle
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const bi  = br * 3 + bc;
        const act = bi === ab;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const lt = (r + c) % 2 === 0;
            ctx.fillStyle = act ? (lt ? C.CELL_AL : C.CELL_AD)
                                : (lt ? C.CELL_L  : C.CELL_D);
            ctx.fillRect(bx + bc * gp + c * cp, by + br * gp + r * cp, cp, cp);
          }
        }
      }
    }

    // Highlight
    const hl = (b, c, col) => {
      const br2 = Math.floor(b / 3), bc2 = b % 3;
      const r2  = Math.floor(c / 3), c2  = c % 3;
      ctx.fillStyle = col;
      ctx.fillRect(bx + bc2 * gp + c2 * cp, by + br2 * gp + r2 * cp, cp, cp);
    };
    if (last)                  hl(last.b, last.c, C.LAST_HL);
    if (showHint && hintMove)  hl(hintMove.b, hintMove.c, C.HINT_HL);

    // Pezzi
    const tk = Math.max(2, Math.floor(cp / 7));
    for (let b = 0; b < 9; b++) {
      for (let c = 0; c < 9; c++) {
        const p = game.board[b][c];
        if (p === ' ') continue;
        const br2 = Math.floor(b / 3), bc2 = b % 3;
        const r2  = Math.floor(c / 3), c2  = c % 3;
        const cx  = bx + bc2 * gp + c2 * cp + cp / 2;
        const cy  = by + br2 * gp + r2 * cp + cp / 2;
        const off = Math.max(3, cp / 2 - Math.max(3, cp / 9));
        ctx.lineWidth = tk; ctx.lineCap = 'round';
        if (p === 'X') {
          ctx.strokeStyle = C.X_COL;
          ctx.beginPath(); ctx.moveTo(cx - off, cy - off); ctx.lineTo(cx + off, cy + off); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + off, cy - off); ctx.lineTo(cx - off, cy + off); ctx.stroke();
        } else {
          ctx.strokeStyle = C.O_COL;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(3, cp / 2 - Math.max(2, cp / 11)), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Overlay griglie vinte
    for (let i = 0; i < 9; i++) {
      const cell = game.big[i];
      if (cell === ' ') continue;
      const br2 = Math.floor(i / 3), bc2 = i % 3;
      const ox  = bx + bc2 * gp, oy = by + br2 * gp;
      ctx.fillStyle = cell === 'X' ? 'rgba(235,95,92,0.42)'
                    : cell === 'O' ? 'rgba(82,176,228,0.42)'
                                   : 'rgba(90,88,84,0.42)';
      ctx.fillRect(ox + 1, oy + 1, gp - 2, gp - 2);
      if (cell === 'X' || cell === 'O') {
        ctx.font = L.fXL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = cell === 'X' ? C.X_COL : C.O_COL;
        ctx.fillText(cell, ox + gp / 2, oy + gp / 2);
      }
    }

    // Linee griglia
    for (let i = 1; i < 9; i++) {
      const big = i % 3 === 0;
      ctx.strokeStyle = big ? C.LINE_OUT : C.LINE_IN;
      ctx.lineWidth   = big ? Math.max(3, Math.floor(cp / 8))
                            : Math.max(1, Math.floor(cp / 18));
      ctx.beginPath(); ctx.moveTo(bx + i * cp, by); ctx.lineTo(bx + i * cp, by + bp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + i * cp); ctx.lineTo(bx + bp, by + i * cp); ctx.stroke();
    }
    ctx.strokeStyle = C.LINE_OUT;
    ctx.lineWidth   = Math.max(2, Math.floor(cp / 10));
    ctx.strokeRect(bx, by, bp, bp);

    // Ring griglia attiva
    if (ab !== null && !game.over) {
      const ar = Math.floor(ab / 3), ac = ab % 3;
      ctx.strokeStyle = 'rgba(246,196,60,1)';
      ctx.lineWidth   = Math.max(2, Math.floor(cp / 8));
      this._rr(bx + ac * gp, by + ar * gp, gp, gp, 2, false, true);
    }

    // Frecce PV
    this._pvArrows(pvList);
  }

  // ── Pannello laterale ─────────────────────────────────────────────────────
  drawPanel(game, score, aiPlayer, showHint, thinking, mouse) {
    const L = this.L;
    if (L.portrait) this._panelPortrait(game, score, aiPlayer, showHint, thinking, mouse);
    else            this._panelLandscape(game, score, aiPlayer, showHint, thinking, mouse);
  }

  _panelLandscape(game, score, aiPlayer, showHint, thinking, mouse) {
    const ctx = this.ctx, L = this.L;
    const px = L.px, py = L.py, ph = L.ph, pw = L.pw, iw = L.innerW;

    ctx.fillStyle = C.PANEL_BG; this._rr(px - 4, py, pw + 4, ph, 6, true, false);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; this._rr(px - 4, py, pw + 4, ph, 6, false, true);

    const playerLabel = (yp, p) => {
      const act  = game.player === p && !game.over;
      const col  = act ? (p === 'X' ? C.X_COL : C.O_COL) : C.TXT_B;
      const role = aiPlayer ? (p === aiPlayer ? ' (AI)' : ' (Tu)') : '';
      ctx.fillStyle = col; ctx.font = L.fM;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(this._clip((act ? '* ' : '  ') + p + role, iw, L.fM), px + 8, yp);
    };
    playerLabel(py + 6, 'O');
    playerLabel(py + ph - L.fszm - 8, 'X');

    // Mini meta-board
    const ms = Math.max(10, Math.floor(iw / 4) - 4), mg = 3, mt = ms * 3 + mg * 2;
    const mx = px + 8 + Math.floor((iw - mt) / 2);
    const my = py + L.fszm + 14;
    this._metaBoard(mx, my, ms, mg, game.big);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1;
    this._rr(mx - 2, my - 2, mt + 4, mt + 4, 3, false, true);

    // Score
    const sy = my + mt + 10;
    this._scoreText(score, px + 8 + iw / 2, sy, 'center', iw);

    // Historia
    const thH     = thinking ? L.fsz + 4 : 0;
    const histBot = L.hintR.y - 10 - thH;
    const histY   = sy + L.fsz + 8;
    this._history(game.hist, px + 4, histY, pw - 8, histBot - histY, px + 8, iw - 4);

    if (thinking) {
      ctx.fillStyle = '#d2b93a'; ctx.font = L.fS;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('AI sta pensando...', px + 8 + iw / 2, L.hintR.y - L.fsz - 6);
    }

    const hv = r => this._ir(mouse, r);
    const isAiTurn = aiPlayer !== null && game.player === aiPlayer;
    if (!isAiTurn && !game.over)
      this._btn(L.hintR, showHint ? '[ Nascondi hint ]' : '[ Suggerimento ]',
                L.fS, C.BTN_G, C.BTN_GH, C.BTN_GB, hv(L.hintR));
    this._btn(L.newR, '[ Nuova partita ]', L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(L.newR));
  }

  _panelPortrait(game, score, aiPlayer, showHint, thinking, mouse) {
    const ctx = this.ctx, L = this.L;
    const px = L.px, py = L.py, pw = L.pw, ph = L.ph;

    ctx.fillStyle = C.PANEL_BG; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);

    const hv = r => this._ir(mouse, r);
    const isAiTurn = aiPlayer !== null && game.player === aiPlayer;
    if (!isAiTurn && !game.over)
      this._btn(L.hintR, 'Suggerimento', L.fS, C.BTN_G, C.BTN_GH, C.BTN_GB, hv(L.hintR));
    this._btn(L.newR, 'Nuova partita', L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(L.newR));

    const sy = py + L.hintR.h + 18;
    this._scoreText(score, pw / 2, sy, 'center', pw - 16);

    const ry = sy + L.fsz + 8;
    const pt = p => {
      const act  = game.player === p && !game.over;
      const role = aiPlayer ? (p === aiPlayer ? ' AI' : ' Tu') : '';
      return (act ? '* ' : '') + p + role;
    };
    ctx.font = L.fM; ctx.textBaseline = 'top';
    ctx.fillStyle = game.player === 'O' && !game.over ? C.O_COL : C.TXT_B;
    ctx.textAlign = 'left'; ctx.fillText(pt('O'), 16, ry);
    ctx.fillStyle = game.player === 'X' && !game.over ? C.X_COL : C.TXT_B;
    ctx.textAlign = 'right'; ctx.fillText(pt('X'), pw - 16, ry);

    if (thinking) {
      ctx.fillStyle = '#d2b93a'; ctx.font = L.fS;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('AI sta pensando...', pw / 2, ry + L.fszm + 4);
    }
  }

  _metaBoard(mx, my, ms, mg, big) {
    const ctx = this.ctx, L = this.L;
    for (let i = 0; i < 9; i++) {
      const cell = big[i];
      const r2 = Math.floor(i / 3), c2 = i % 3;
      const rx  = mx + c2 * (ms + mg), ry = my + r2 * (ms + mg);
      ctx.fillStyle = cell === 'X' ? C.X_DIM : cell === 'O' ? C.O_DIM : '#262422';
      this._rr(rx, ry, ms, ms, 2, true, false);
      if (cell === 'X' || cell === 'O') {
        ctx.fillStyle = cell === 'X' ? C.X_COL : C.O_COL;
        ctx.font = L.fTiny; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cell, rx + ms / 2, ry + ms / 2);
      }
    }
  }

  _scoreText(score, cx, y, align, maxW) {
    const ctx = this.ctx, L = this.L;
    let stxt, scol;
    if (Math.abs(score) >= 90000) {
      stxt = (score > 0 ? 'X' : 'O') + ' vince!';
      scol = score > 0 ? C.X_COL : C.O_COL;
    } else if (score > 0) {
      stxt = `+${(score / 100).toFixed(1)} X avanti`; scol = C.X_COL;
    } else if (score < 0) {
      stxt = `-${(Math.abs(score) / 100).toFixed(1)} O avanti`; scol = C.O_COL;
    } else {
      stxt = 'Posizione pari'; scol = C.TXT_B;
    }
    ctx.fillStyle = scol; ctx.font = L.fS;
    ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillText(this._clip(stxt, maxW, L.fS), cx, y);
  }

  _history(hist, bx, by, bw, bh, tx, tw) {
    if (bh < 8) return;
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = '#121110'; this._rr(bx, by, bw, bh, 4, true, false);
    const lh   = L.fsz + 3;
    const maxV = Math.max(1, Math.floor(bh / lh));
    const pairs = [];
    for (let i = 0; i < hist.length; i += 2)
      pairs.push([hist[i], hist[i + 1] || null]);
    const vis   = pairs.slice(-maxV);
    const baseN = pairs.length - vis.length + 1;
    let fy = by + 4;
    ctx.fillStyle = C.TXT_B; ctx.font = L.fTiny;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < vis.length; i++) {
      const [xm, om] = vis[i], mn = baseN + i;
      const [xr, xcc] = [Math.floor(xm.c / 3), xm.c % 3];
      let row = `${mn}. X:g${xm.b + 1}(${xr + 1},${xcc + 1})`;
      if (om) {
        const [or2, occ2] = [Math.floor(om.c / 3), om.c % 3];
        row += `  O:g${om.b + 1}(${or2 + 1},${occ2 + 1})`;
      }
      ctx.fillText(this._clip(row, tw, L.fTiny), tx, fy);
      fy += lh;
      if (fy + lh > by + bh) break;
    }
  }

  // ── Eval graph ────────────────────────────────────────────────────────────
  _evalGraph(evals, step, x, y, w, h) {
    if (!evals || evals.length < 2) return;
    const ctx = this.ctx, n = evals.length, mid = y + h / 2;
    const clamp = v => Math.max(-3000, Math.min(3000, v));
    const xp = i => x + (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const yp = v => mid - (clamp(v) / 3000) * (h / 2 - 1);

    ctx.fillStyle = '#161412'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); ctx.stroke();

    const buildPath = () => {
      ctx.beginPath(); ctx.moveTo(xp(0), mid);
      for (let i = 0; i < n; i++) ctx.lineTo(xp(i), yp(evals[i]));
      ctx.lineTo(xp(n - 1), mid); ctx.closePath();
    };

    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h / 2 + 1); ctx.clip();
    ctx.fillStyle = 'rgba(220,215,205,0.75)'; buildPath(); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(x, mid, w, h / 2 + 1); ctx.clip();
    ctx.fillStyle = 'rgba(30,55,85,0.80)'; buildPath(); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(200,196,188,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++)
      i === 0 ? ctx.moveTo(xp(i), yp(evals[i])) : ctx.lineTo(xp(i), yp(evals[i]));
    ctx.stroke();

    if (step >= 0 && step < n) {
      ctx.strokeStyle = 'rgba(246,196,60,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xp(step), y); ctx.lineTo(xp(step), y + h); ctx.stroke();
      ctx.fillStyle = 'rgb(246,196,60)';
      ctx.beginPath(); ctx.arc(xp(step), yp(evals[step]), 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Lista PV testuale ─────────────────────────────────────────────────────
  _pvList(pv, score, x, y, w, maxH, fTiny, fsz) {
    if (!pv || !pv.length) return 0;
    const ctx  = this.ctx;
    const lh   = fsz + 4;
    const rows = Math.min(pv.length, Math.floor(maxH / lh));
    if (rows === 0) return 0;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, rows * lh + 4);

    pv.slice(0, rows).forEach((mv, i) => {
      const p   = mv.player || '?';
      const mr  = Math.floor(mv.c / 3), mc = mv.c % 3;
      const lbl = `${i + 1}. ${p}: g${mv.b + 1}(${mr + 1},${mc + 1})`;
      ctx.font      = fTiny;
      ctx.fillStyle = p === 'X' ? C.X_COL : C.O_COL;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(lbl, x + 4, y + 2 + i * lh);
    });
    return rows * lh + 6;
  }

  // ── Status header ─────────────────────────────────────────────────────────
  drawStatus(game, aiPlayer) {
    const ctx = this.ctx, L = this.L;
    let txt, col;
    if (game.over) {
      if (game.winner === 'X' || game.winner === 'O') {
        txt = `${game.winner} ha vinto!`;
        col = game.winner === 'X' ? C.X_COL : C.O_COL;
      } else {
        txt = 'Pareggio!'; col = C.TXT_B;
      }
    } else {
      const p    = game.player;
      const role = aiPlayer ? (p === aiPlayer ? 'AI' : 'Tu') : `Giocatore ${p}`;
      txt = `Turno: ${p}  --  ${role}`;
      col = p === 'X' ? C.X_COL : C.O_COL;
    }
    ctx.font = L.fM; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, L.bx + L.bp / 2, L.topH / 2);
  }

  // ── Server badge ──────────────────────────────────────────────────────────
  drawServerBadge(connected, msg, pattern, dbHits) {
    const ctx = this.ctx, L = this.L;
    const bw = Math.min(190, Math.floor(L.W / 4));
    const bh = L.fsz + 8;
    const bx = L.W - bw - 6, by = 4;

    // Riga 1: stato connessione + DB size
    ctx.fillStyle = connected ? 'rgba(30,60,30,0.92)' : 'rgba(50,20,20,0.92)';
    this._rr(bx, by, bw, bh, 4, true, false);
    ctx.strokeStyle = connected ? '#3a8a3a' : '#8a3a3a'; ctx.lineWidth = 1;
    this._rr(bx, by, bw, bh, 4, false, true);
    ctx.font = L.fTiny; ctx.fillStyle = connected ? '#80d080' : '#d08080';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this._clip(msg, bw - 8, L.fTiny), bx + bw / 2, by + bh / 2);

    if (!connected) return;

    // Riga 2: hit del DB usati dall'AI
    const ay = by + bh + 2;
    const hitTxt = dbHits > 0 ? `AI DB hits: ${dbHits}` : 'AI DB: in attesa...';
    ctx.fillStyle = dbHits > 0 ? 'rgba(20,50,40,0.92)' : 'rgba(18,18,16,0.88)';
    this._rr(bx, ay, bw, bh, 4, true, false);
    ctx.strokeStyle = dbHits > 0 ? '#2a6a4a' : '#3a3835';
    this._rr(bx, ay, bw, bh, 4, false, true);
    ctx.fillStyle = dbHits > 0 ? '#60d0a0' : C.TXT_B;
    ctx.fillText(this._clip(hitTxt, bw - 8, L.fTiny), bx + bw / 2, ay + bh / 2);

    // Riga 3: pattern corrente (se disponibile)
    if (pattern) {
      const py2 = ay + bh + 2;
      ctx.fillStyle = 'rgba(18,18,16,0.88)';
      this._rr(bx, py2, bw, bh, 4, true, false);
      ctx.strokeStyle = '#3a3835';
      this._rr(bx, py2, bw, bh, 4, false, true);
      ctx.fillStyle = '#90b890';
      ctx.fillText(this._clip(pattern, bw - 8, L.fTiny), bx + bw / 2, py2 + bh / 2);
    }
  }

  // ── Post-game ─────────────────────────────────────────────────────────────
  drawPostGame(game, evals, stats, mouse) {
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = 'rgba(0,0,0,0.84)'; ctx.fillRect(0, 0, L.W, L.H);

    const bw = Math.min(420, L.W - 32);
    const bh = Math.min(540, L.H - 32);
    const bx = (L.W - bw) / 2, by = (L.H - bh) / 2;
    ctx.fillStyle = C.PANEL_BG; this._rr(bx, by, bw, bh, 12, true, false);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; this._rr(bx, by, bw, bh, 12, false, true);

    let msg, col;
    if (game.winner === 'X' || game.winner === 'O') {
      msg = `${game.winner} vince!`;
      col = game.winner === 'X' ? C.X_COL : C.O_COL;
    } else {
      msg = 'Pareggio!'; col = C.TXT_B;
    }
    ctx.font = L.fL; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(msg, L.W / 2, by + 18);
    ctx.font = L.fS; ctx.fillStyle = C.TXT_B;
    ctx.fillText(`${game.hist.length} mosse totali`, L.W / 2, by + 18 + parseInt(L.fL) + 6);

    const gy = by + 18 + parseInt(L.fL) + 28;
    const gh = Math.min(65, bh * 0.13);
    this._evalGraph(evals, evals.length - 1, bx + 14, gy, bw - 28, gh);
    ctx.font = L.fTiny; ctx.fillStyle = C.TXT_B; ctx.textAlign = 'left';
    ctx.fillText('Andamento partita', bx + 14, gy + gh + 3);

    const sy = gy + gh + 24;
    const sw = (bw - 28) / 3;
    const statItems = [
      { lbl: 'Vittorie',  val: stats.w, col: C.X_COL },
      { lbl: 'Pareggi',   val: stats.d, col: C.TXT_B },
      { lbl: 'Sconfitte', val: stats.l, col: C.O_COL },
    ];
    statItems.forEach(({ lbl, val, col: c }, i) => {
      const sx2 = bx + 14 + i * sw;
      ctx.fillStyle = C.PANEL_BG; this._rr(sx2, sy, sw - 6, L.fszm * 2 + 8, 4, true, false);
      ctx.fillStyle = c; ctx.font = L.fM; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(val), sx2 + sw / 2 - 3, sy + 4);
      ctx.font = L.fTiny; ctx.fillStyle = C.TXT_B;
      ctx.fillText(lbl, sx2 + sw / 2 - 3, sy + 4 + L.fszm + 2);
    });

    const ry = sy + L.fszm * 2 + 20;
    ctx.font = L.fTiny; ctx.fillStyle = C.TXT_B;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('Ultime partite:', bx + 14, ry);
    (stats.games || []).slice(0, 5).forEach((g, i) => {
      const w2  = g.winner === 'D' ? 'Patta' : g.winner + ' vince';
      const row = `${g.date}  ${w2}  (${g.moves} mosse)`;
      ctx.fillStyle = g.winner === 'X' ? C.X_COL
                    : g.winner === 'O' ? C.O_COL : C.TXT_B;
      ctx.fillText(this._clip(row, bw - 28, L.fTiny), bx + 14,
                   ry + L.fsz + 2 + i * (L.fsz + 3));
    });

    const btnY = by + bh - 46;
    const ew   = (bw - 36) / 2;
    const rR   = { x: bx + 12,      y: btnY, w: ew, h: 36 };
    const nR   = { x: bx + 24 + ew, y: btnY, w: ew, h: 36 };
    this._btn(rR, 'Revisione partita', L.fS, C.BTN_G, C.BTN_GH, C.BTN_GB, this._ir(mouse, rR));
    this._btn(nR, 'Nuova partita',     L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, this._ir(mouse, nR));
    this.postGameRects = { review: rR, newGame: nR };
  }

  // ── Review ────────────────────────────────────────────────────────────────
  drawReview(states, evals, step, winner, aiPlayer, mouse,
             reviewScore, reviewThink, reviewPV, reviewLines) {
    const ctx   = this.ctx, L = this.L;
    const total = states.length - 1;

    let px, py, pw, ph;
    if (L.portrait) {
      px = 0; py = L.by + L.bp + 6; pw = L.W; ph = L.H - py - 2;
    } else {
      px = L.bx + L.bp + 8; py = L.by; pw = L.W - px - 6; ph = L.bp;
    }

    ctx.fillStyle = C.PANEL_BG; this._rr(px, py, pw, ph, 6, true, false);
    ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; this._rr(px, py, pw, ph, 6, false, true);

    const iw = pw - 16;
    let fy = py + 8;

    // ── Linee alternative (sinistra della board) ──────────────────────────
    if (!L.portrait && reviewLines && reviewLines.length) {
      const lx = 6, ly = L.by, lw = Math.max(120, L.bx - 12), lh = L.bp;
      ctx.fillStyle = C.PANEL_BG; this._rr(lx, ly, lw, lh, 6, true, false);
      ctx.strokeStyle = C.BORDER; ctx.lineWidth = 1; this._rr(lx, ly, lw, lh, 6, false, true);

      ctx.font = L.fTiny; ctx.fillStyle = C.TXT_B;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('Linee possibili:', lx + 6, ly + 6);

      const liw = lw - 12;
      let lfy = ly + L.fsz + 10;
      const llineH = L.fsz + 3;

      reviewLines.forEach((line, li) => {
        if (lfy + llineH * 3 > ly + lh - 8) return;
        const isX   = states[step] && states[step].player === 'X';
        const good  = isX ? line.score > 0 : line.score < 0;
        const mc    = Array.isArray(line.move) ? line.move : [line.move.b, line.move.c];
        const mr    = Math.floor(mc[1] / 3), mcc = mc[1] % 3;
        const lbl   = `${li+1}. g${mc[0]+1}(${mr+1},${mcc+1})`;
        const sv    = Math.abs(line.score) >= 90000 ? (line.score>0?'+M':'-M')
                    : (line.score>=0?'+':'')+((line.score/100).toFixed(1));

        ctx.fillStyle = good ? C.X_COL : (line.score===0 ? C.TXT_B : C.O_COL);
        ctx.fillText(this._clip(`${lbl} (${sv})`, liw, L.fTiny), lx + 6, lfy);
        lfy += llineH;

        // Mosse della PV di questa linea
        if (line.pv && line.pv.length) {
          const pvTxt = line.pv.slice(0, 4).map((m,i) => {
            const p  = m.player||'?';
            const r2 = Math.floor((m.c||m[1])/3), c2=(m.c||m[1])%3;
            return `${p}:g${(m.b||m[0])+1}(${r2+1},${c2+1})`;
          }).join(' ');
          ctx.fillStyle = C.TXT_B;
          ctx.fillText(this._clip(pvTxt, liw, L.fTiny), lx + 6, lfy);
          lfy += llineH;
        }
        lfy += 3; // separatore tra linee
      });
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('REVISIONE PARTITA', px + pw / 2, fy);
    fy += L.fszm + 4;

    // Step + eval
    const curEval = step === 0 ? 0 : (evals[step - 1] !== undefined ? evals[step - 1] : (reviewScore || 0));
    let etxt, ecol;
    if (Math.abs(curEval) >= 90000) {
      etxt = (curEval > 0 ? 'X' : 'O') + ' vince'; ecol = curEval > 0 ? C.X_COL : C.O_COL;
    } else if (curEval > 0) { etxt = `+${(curEval / 100).toFixed(1)} X`; ecol = C.X_COL; }
    else if (curEval < 0)   { etxt = `${(curEval / 100).toFixed(1)} O`;  ecol = C.O_COL; }
    else                    { etxt = '='; ecol = C.TXT_B; }

    ctx.font = L.fS;
    ctx.fillStyle = C.TXT_B; ctx.textAlign = 'left';
    ctx.fillText(`Mossa ${step}/${total}`, px + 8, fy);
    ctx.fillStyle = ecol; ctx.textAlign = 'right';
    ctx.fillText(reviewThink ? '...' : etxt, px + pw - 8, fy);
    fy += L.fsz + 6;

    // Grafico eval
    const gh = Math.min(52, Math.floor(ph * 0.10));
    this._evalGraph(evals, step - 1, px + 8, fy, iw, gh);
    fy += gh + 4;

    // Lista PV
    if (reviewPV && reviewPV.length) {
      const pvUsable = Math.min(Math.floor(ph * 0.18), 100);
      const pvH = this._pvList(reviewPV, curEval, px + 8, fy, iw, pvUsable, L.fTiny, L.fsz);
      fy += pvH + 4;
    }

    // Bottoni (dal fondo)
    const btnH = Math.max(28, L.fsz + 12);
    const exitY = py + ph - btnH - 8;
    const navY  = exitY - btnH - 6;

    // Lista mosse
    const listH = Math.max(0, navY - fy - 8);
    if (listH > 16) {
      ctx.fillStyle = '#121110'; this._rr(px + 4, fy, pw - 8, listH, 4, true, false);
      const lh    = L.fsz + 3;
      const maxV  = Math.floor(listH / lh);
      const start = Math.max(0, Math.min(total - maxV, step - Math.floor(maxV / 2)));
      const moveItems = [];

      for (let i = start; i < Math.min(total, start + maxV); i++) {
        const st = states[i + 1];
        const mv = st && st.hist && st.hist[i];
        if (!mv) continue;
        const pl     = i % 2 === 0 ? 'X' : 'O';
        const mr2    = Math.floor(mv.c / 3), mc2 = mv.c % 3;
        const txt    = `${i + 1}. ${pl}: g${mv.b + 1}(${mr2 + 1},${mc2 + 1})`;
        const active = i === step - 1;
        const itemY  = fy + 2 + (i - start) * lh;
        const itemR  = { x: px + 4, y: itemY, w: pw - 8, h: lh };
        moveItems.push({ r: itemR, step: i + 1 });

        if (active) {
          ctx.fillStyle = 'rgba(246,196,60,0.12)';
          ctx.fillRect(px + 4, itemY, pw - 8, lh);
        } else if (this._ir(mouse, itemR)) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px + 4, itemY, pw - 8, lh);
        }

        ctx.font = L.fTiny; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = active ? (pl === 'X' ? C.X_COL : C.O_COL) : C.TXT_B;
        ctx.fillText(txt, px + 10, itemY);

        const ev = evals[i];
        if (ev !== undefined) {
          const bw2 = 18, bh2 = lh - 2, bx2 = px + pw - 12 - bw2;
          const ratio = (Math.max(-3000, Math.min(3000, ev)) + 3000) / 6000;
          ctx.fillStyle = C.EVAL_D; ctx.fillRect(bx2, itemY, bw2, bh2);
          ctx.fillStyle = C.EVAL_L;
          const fh = Math.max(1, Math.floor(bh2 * ratio));
          ctx.fillRect(bx2, itemY + bh2 - fh, bw2, fh);
        }
      }
      this.reviewRects = { ...(this.reviewRects || {}), moveItems };
    }

    // Navigazione
    const nb = Math.floor(iw / 4) - 3;
    const r1 = { x: px + 8,          y: navY, w: nb, h: btnH };
    const r2 = { x: px + 8 + nb + 4, y: navY, w: nb, h: btnH };
    const r3 = { x: px + 8 + nb * 2 + 8,  y: navY, w: nb, h: btnH };
    const r4 = { x: px + 8 + nb * 3 + 12, y: navY, w: nb, h: btnH };
    const hv = r => this._ir(mouse, r);
    this._btn(r1, '|<', L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(r1));
    this._btn(r2, '<',  L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(r2));
    this._btn(r3, '>',  L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(r3));
    this._btn(r4, '>|', L.fS, C.BTN_N, C.BTN_NH, C.BTN_NB, hv(r4));

    const exitR = { x: px + 8, y: exitY, w: iw, h: btnH };
    this._btn(exitR, '[ Esci dalla revisione ]', L.fS,
              C.BTN_N, C.BTN_NH, C.BTN_NB, hv(exitR));

    this.reviewRects = { ...(this.reviewRects || {}), first: r1, prev: r2, next: r3, last: r4, exit: exitR };
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  drawMenu(mouse) {
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = 'rgba(10,9,8,0.88)'; ctx.fillRect(0, 0, L.W, L.H);

    ctx.font = L.fL; ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ty = Math.max(16, Math.floor(L.H / 9));
    ctx.fillText('ULTIMATE TIC-TAC-TOE', L.W / 2, ty);
    ctx.font = L.fS; ctx.fillStyle = C.TXT_B;
    ctx.fillText('Minimax + Alpha-Beta + Euristica avanzata', L.W / 2, ty + L.fszm * 2 + 6);

    const opts = [
      ['Gioca come X (Rosso)',   'O'],
      ['Gioca come O (Azzurro)', 'X'],
      ['Due Giocatori',          null],
    ];
    const bw    = Math.min(300, L.W - 60);
    const bh    = Math.max(40, L.fszm + 18);
    const total = opts.length * bh + (opts.length - 1) * 12;
    let cy = Math.max(ty + L.fszm * 2 + 36, Math.floor((L.H - total) / 2));
    if (cy + total > L.H - 12) cy = Math.max(ty + L.fszm * 2 + 20, L.H - 12 - total);

    const rects = [];
    for (const [txt, role] of opts) {
      const r  = { x: L.W / 2 - bw / 2, y: cy, w: bw, h: bh };
      const ho = this._ir(mouse, r);
      ctx.fillStyle = ho ? '#484642' : '#302e2a';
      this._rr(r.x, r.y, r.w, r.h, 8, true, false);
      ctx.strokeStyle = ho ? '#696560' : '#3e3b37'; ctx.lineWidth = 2;
      this._rr(r.x, r.y, r.w, r.h, 8, false, true);
      ctx.fillStyle = '#fff'; ctx.font = L.fM;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, r.x + r.w / 2, r.y + r.h / 2);
      rects.push({ r, role });
      cy += bh + 12;
    }
    return rects;
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  drawGameOver(game) {
    const ctx = this.ctx, L = this.L;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, L.W, L.H);
    let msg, col;
    if (game.winner === 'X' || game.winner === 'O') {
      msg = `${game.winner} vince!`;
      col = game.winner === 'X' ? C.X_COL : C.O_COL;
    } else {
      msg = 'Pareggio!'; col = C.TXT_B;
    }
    ctx.font = L.fXL; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, L.W / 2, L.H / 2);
    ctx.font = L.fS; ctx.fillStyle = C.TXT_B; ctx.textBaseline = 'top';
    ctx.fillText('Tocca per tornare al menu', L.W / 2, L.H / 2 + 54);
  }
}