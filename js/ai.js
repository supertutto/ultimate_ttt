// ai.js — Web Worker autocontenuto

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];
const CELL_LINES = [3,2,3, 2,4,2, 3,2,3]; // linee WIN per cella
const PV_TABLE   = [3,2,3, 2,5,2, 3,2,3]; // valore posizionale

const W = {
  WIN:        100000,
  META_WIN:     2000,
  META_FORK:    1000,
  META_2:        280,
  META_1:         45,
  LOC_FORK:      160,
  LOC_2:          30,
  LOC_1:           7,
  ACTIVITY:        5,
  CENTER_SEND:    35,  // penalità per mandare avversario al centro
};

const AI_MAX_DEPTH = 30;

// ── Gioco ─────────────────────────────────────────────────────────────────────
function opp(p){ return p==='X'?'O':'X'; }

function checkGrid(grid){
  for(const [a,b,c] of WIN_LINES){
    const v=grid[a];
    if((v==='X'||v==='O')&&v===grid[b]&&v===grid[c]) return v;
  }
  return grid.includes(' ')?null:'D';
}

class Game {
  constructor(){
    this.board  = Array.from({length:9},()=>Array(9).fill(' '));
    this.big    = Array(9).fill(' ');
    this.player = 'X';
    this.active = null;
    this.over   = false;
    this.winner = null;
    this.hist   = [];
  }
  copy(){
    const g=new Game();
    g.board=[...this.board.map(r=>[...r])];
    g.big=[...this.big]; g.player=this.player;
    g.active=this.active; g.over=this.over;
    g.winner=this.winner; g.hist=[...this.hist.map(m=>({...m}))];
    return g;
  }
  moves(){
    if(this.over) return [];
    const ab=this.active;
    const bds=(ab!==null&&this.big[ab]===' ')?[ab]
      :[...Array(9).keys()].filter(i=>this.big[i]===' ');
    return bds.flatMap(b=>
      [...Array(9).keys()].filter(c=>this.board[b][c]===' ').map(c=>({b,c}))
    );
  }
  push(b,c){
    this.board[b][c]=this.player;
    this.hist.push({b,c});
    const res=checkGrid(this.board[b]);
    if(res&&this.big[b]===' ') this.big[b]=res;
    const gr=checkGrid(this.big);
    if(gr==='X'||gr==='O'){this.over=true;this.winner=gr;return;}
    const nb=this.big[c]===' '?[c]:[...Array(9).keys()].filter(i=>this.big[i]===' ');
    if(!nb.some(b2=>this.board[b2].includes(' '))){this.over=true;this.winner='D';return;}
    this.active=(this.big[c]===' ')?c:null;
    this.player=opp(this.player);
  }
}

// ── Euristica (senza bias di turno) ──────────────────────────────────────────
// REGOLA FONDAMENTALE: evaluate() ritorna SEMPRE positivo=X vince, negativo=O vince
// NON dipende da chi deve muovere — elimina l'oscillazione

function openLinesMeta(big,idx){
  return WIN_LINES.filter(line=>{
    if(!line.includes(idx)) return false;
    const vs=line.map(i=>big[i]);
    return !vs.includes('D')&&!(vs.includes('X')&&vs.includes('O'));
  }).length;
}

function lineVal(vs,p,w2,w1){
  const e=opp(p);
  if(vs.some(v=>v===e||v==='D')) return 0;
  const n=vs.filter(v=>v===p).length;
  return n===2?w2:n===1?w1:0;
}

function countThreats(grid,p){
  const e=opp(p);
  return WIN_LINES.filter(([a,b,c])=>{
    const vs=[grid[a],grid[b],grid[c]];
    return vs.filter(v=>v===p).length===2&&vs.includes(' ')&&!vs.includes(e);
  }).length;
}

function boardValueFor(g, boardIdx, p){
  // Quanto vale la board per il giocatore p (chi ci dovrà giocare)
  if(g.big[boardIdx]!==' ') return 0;
  const grid=g.board[boardIdx], e=opp(p);
  let v=0;
  for(const [a,b,c] of WIN_LINES){
    const vs=[grid[a],grid[b],grid[c]];
    if(vs.includes(e)) continue;
    v+=vs.filter(x=>x===p).length*3+vs.filter(x=>x===' ').length;
  }
  return v;
}

function evaluate(g){
  if(g.over){
    const d=g.hist.length;
    if(g.winner==='X') return  W.WIN-d;
    if(g.winner==='O') return -W.WIN+d;
    return 0;
  }

  let s=0;
  const big=g.big;

  // 1. Quadranti vinti — valore = WIN * (posizione + linee meta aperte)
  for(let i=0;i<9;i++){
    const cell=big[i];
    if(cell!=='X'&&cell!=='O') continue;
    const om=openLinesMeta(big,i);
    const v=Math.floor(W.META_WIN*(PV_TABLE[i]+om)/6);
    s+=cell==='X'?v:-v;
  }

  // 2. Minacce 2-in-fila nella meta-board
  for(const [a,b,c] of WIN_LINES){
    const vs=[big[a],big[b],big[c]];
    if(!vs.includes('D')){
      if(!vs.includes('O')) s+=lineVal(vs,'X',W.META_2,W.META_1);
      if(!vs.includes('X')) s-=lineVal(vs,'O',W.META_2,W.META_1);
    }
  }

  // 3. Fork meta: 2+ minacce di vittoria meta simultanee
  for(const [p,sign] of [['X',1],['O',-1]]){
    const n=WIN_LINES.filter(([a,b,c])=>{
      const vs=[big[a],big[b],big[c]];
      return vs.filter(v=>v===p).length===2&&vs.includes(' ');
    }).length;
    if(n>=2) s+=sign*W.META_FORK;
  }

  // 4. Analisi locale quadranti aperti
  for(let gi=0;gi<9;gi++){
    if(big[gi]!==' ') continue;
    const grid=g.board[gi];
    const ml=Math.max(1,openLinesMeta(big,gi));
    const pg=PV_TABLE[gi];
    const scale=ml*pg;

    // Fork locale
    const tx=countThreats(grid,'X'), to=countThreats(grid,'O');
    if(tx>=2) s+=W.LOC_FORK*scale/5;
    if(to>=2) s-=W.LOC_FORK*scale/5;

    // 2-in-fila e 1-in-fila
    for(const [a,b,c] of WIN_LINES){
      const vs=[grid[a],grid[b],grid[c]];
      s+=lineVal(vs,'X',W.LOC_2*scale/5,W.LOC_1*scale/5);
      s-=lineVal(vs,'O',W.LOC_2*scale/5,W.LOC_1*scale/5);
    }

    // Attività pezzi: linee aperte × numero linee che passano per la cella
    for(let ci=0;ci<9;ci++){
      const cell=grid[ci];
      if(cell!=='X'&&cell!=='O') continue;
      const e=opp(cell);
      const openL=WIN_LINES.filter(ln=>ln.includes(ci)&&!ln.some(i=>grid[i]===e)).length;
      const v=W.ACTIVITY*openL*CELL_LINES[ci]*scale/20;
      s+=cell==='X'?v:-v;
    }
  }

  // 5. Penalità invio avversario in board strategicamente buona
  // (si calcola SIMMETRICAMENTE per entrambi — nessun bias di turno)
  if(g.hist.length>0){
    const last=g.hist[g.hist.length-1];
    const tgt=last.c;
    const mover=opp(g.player);          // chi ha appena mosso
    const receiver=g.player;            // chi giocherà nella board tgt
    const quality=boardValueFor(g,tgt,receiver);
    // Il mover ha mandato il receiver in una board buona → svantaggio per mover
    s+=(mover==='X'?-1:+1)*quality*W.CENTER_SEND/20;
  }

  // !! NESSUN TERMINE DI MOBILITÀ ASSOLUTA !!
  // La mobilità assoluta crea il bias di turno che fa oscillare l'eval.
  // Viene considerata implicitamente nel termine di fork e nelle minacce.

  return Math.round(s);
}

// ── Ordinamento mosse ─────────────────────────────────────────────────────────
function orderMoves(g,mvs){
  const p=g.player, e=opp(p);
  return [...mvs].sort((ma,mb)=>{
    function sc({b,c}){
      let n=0;
      // Vince quadrante?
      const gr=[...g.board[b]]; gr[c]=p;
      if(WIN_LINES.some(([a,bb,cc])=>gr[a]===p&&gr[bb]===p&&gr[cc]===p)) n+=3000;
      // Blocca vittoria avversario?
      const gr2=[...g.board[b]]; gr2[c]=e;
      if(WIN_LINES.some(([a,bb,cc])=>gr2[a]===e&&gr2[bb]===e&&gr2[cc]===e)) n+=1500;
      // Penalizza invio avversario in board buona
      n-=boardValueFor(g,c,e)*2;
      // Valore posizionale
      n+=PV_TABLE[c]*8+PV_TABLE[b]*6;
      return -n;
    }
    return sc(ma)-sc(mb);
  });
}

// ── Minimax + TT ──────────────────────────────────────────────────────────────
let tt=new Map();

function ttKey(g){
  return g.board.map(r=>r.join('')).join('|')+'|'+
         g.big.join('')+'|'+g.active+'|'+g.player;
}

function minimax(g,depth,alpha,beta,isMax,deadline){
  if(Date.now()>=deadline) return {v:evaluate(g),m:null,timeout:true};

  const key=ttKey(g);
  if(tt.has(key)){
    const e=tt.get(key);
    if(e.d>=depth){
      if(e.f==='exact')             return {v:e.v,m:e.m};
      if(e.f==='lower'&&e.v>=beta)  return {v:e.v,m:e.m};
      if(e.f==='upper'&&e.v<=alpha) return {v:e.v,m:e.m};
    }
  }

  const mvs=g.moves();
  if(depth===0||g.over||!mvs.length) return {v:evaluate(g),m:null};

  if(mvs.length===81){
    const starts=[{b:4,c:4},{b:0,c:4},{b:4,c:0},{b:8,c:4},{b:4,c:8}];
    return {v:0,m:starts[Math.floor(Math.random()*starts.length)]};
  }

  const ordered=orderMoves(g,mvs);
  let bm=ordered[0], oa=alpha, timedOut=false;

  if(isMax){
    let bv=-Infinity;
    for(const m of ordered){
      const ns=g.copy(); ns.push(m.b,m.c);
      const res=minimax(ns,depth-1,alpha,beta,false,deadline);
      if(res.timeout){timedOut=true;break;}
      if(res.v>bv){bv=res.v;bm=m;}
      alpha=Math.max(alpha,bv);
      if(alpha>=beta) break;
    }
    if(!timedOut) tt.set(key,{d:depth,f:bv<=oa?'upper':bv>=beta?'lower':'exact',v:bv,m:bm});
    return {v:bv,m:bm,timeout:timedOut};
  } else {
    let bv=Infinity;
    for(const m of ordered){
      const ns=g.copy(); ns.push(m.b,m.c);
      const res=minimax(ns,depth-1,alpha,beta,true,deadline);
      if(res.timeout){timedOut=true;break;}
      if(res.v<bv){bv=res.v;bm=m;}
      beta=Math.min(beta,bv);
      if(alpha>=beta) break;
    }
    if(!timedOut) tt.set(key,{d:depth,f:bv<=oa?'upper':bv>=beta?'lower':'exact',v:bv,m:bm});
    return {v:bv,m:bm,timeout:timedOut};
  }
}

// ── Principal Variation ───────────────────────────────────────────────────────
function extractPV(g,maxLen=8){
  const pv=[]; let cur=g.copy(); const seen=new Set();
  while(pv.length<maxLen&&!cur.over){
    const key=ttKey(cur);
    if(seen.has(key)||!tt.has(key)) break;
    seen.add(key);
    const {m}=tt.get(key);
    if(!m) break;
    // Verifica che la mossa sia legale
    const legal=cur.moves().find(mv=>mv.b===m.b&&mv.c===m.c);
    if(!legal) break;
    pv.push({b:m.b,c:m.c,player:cur.player});
    cur.push(m.b,m.c);
  }
  return pv;
}

// ── DB cache dal server (se disponibile) ─────────────────────────────────────
let serverUrl='';

async function lookupDB(g){
  if(!serverUrl) return null;
  try{
    const key=g.board.map(r=>r.join('')).join('')+g.big.join('')+(g.active??'N')+g.player;
    const r=await fetch(serverUrl+'/analyze',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        board:g.board,big:g.big,player:g.player,
        active:g.active,over:g.over,winner:g.winner,
        hist:g.hist.map(({b,c})=>[b,c])
      }),
      signal:AbortSignal.timeout(3000)
    });
    if(!r.ok) return null;
    const d=await r.json();
    if(d.move&&d.depth>=4) return d;
  }catch(e){}
  return null;
}

// ── Message handler ───────────────────────────────────────────────────────────
self.onmessage=async function(e){
  const msg=e.data;
  if(msg.type==='setServer'){ serverUrl=msg.url; return; }
  if(msg.type!=='start') return;

  tt.clear();
  const g=new Game();
  g.board  = msg.state.board.map(r=>[...r]);
  g.big    = [...msg.state.big];
  g.player = msg.state.player;
  g.active = msg.state.active;
  g.over   = msg.state.over;
  g.winner = msg.state.winner;
  g.hist   = msg.state.hist.map(m=>({...m}));

  const isMax=g.player==='X';
  const deadline=Date.now()+msg.timeMs;

  // Fallback immediato con mossa euristica
  const fallback=orderMoves(g,g.moves());
  let bestM=fallback[0]||null;
  let bestV=evaluate(g);

  // Controlla DB server prima di calcolare
  const cached=await lookupDB(g);
  if(cached&&cached.move){
    const cm=Array.isArray(cached.move)
      ?{b:cached.move[0],c:cached.move[1]}
      :cached.move;
    const legal=g.moves().find(mv=>mv.b===cm.b&&mv.c===cm.c);
    if(legal){
      bestM=cm; bestV=cached.score||bestV;
      const pv=extractPV(g,8);
      self.postMessage({type:'result',score:bestV,move:bestM,depth:cached.depth||0,pv,fromDB:true});
    }
  }

  // Iterative deepening entro la deadline
  for(let depth=1;depth<=AI_MAX_DEPTH;depth++){
    if(Date.now()>=deadline) break;
    const res=minimax(g,depth,-Infinity,Infinity,isMax,deadline);
    if(res.m!==null){
      bestV=res.v; bestM=res.m;
      const pv=extractPV(g,8);
      self.postMessage({type:'result',score:bestV,move:bestM,depth,pv});
    }
    if(res.timeout) break;
    if(Math.abs(bestV)>=W.WIN-200) break;
  }

  const pv=extractPV(g,8);
  self.postMessage({type:'done',score:bestV,move:bestM,pv});
};