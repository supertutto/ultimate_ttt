// game.js
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
    // board[bigIdx][cellIdx]
    this.board  = Array.from({length:9}, () => Array(9).fill(' '));
    this.big    = Array(9).fill(' ');
    this.player = 'X';
    this.active = null;   // null = libera scelta
    this.over   = false;
    this.winner = null;
    this.hist   = [];     // [{b,c}, ...]
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
    if (gr === 'X' || gr === 'O') {
      this.over = true; this.winner = gr; return;
    }

    // Calcola prossime mosse disponibili
    const nextBoards = this.big[c] === ' ' ? [c]
      : [...Array(9).keys()].filter(i => this.big[i] === ' ');
    let hasMove = false;
    outer: for (const nb of nextBoards)
      for (let cc=0; cc<9; cc++)
        if (this.board[nb][cc] === ' ') { hasMove = true; break outer; }

    if (!hasMove) { this.over = true; this.winner = 'D'; return; }

    this.active = (this.big[c] === ' ') ? c : null;
    this.player = opp(this.player);
  }
}
