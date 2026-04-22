"""
server.py  —  Analysis server per Ultimate Tic-Tac-Toe
=======================================================
Avvia:    python server.py
Testa:    http://localhost:5000/ping

Il server fa TRE cose:
  1. Serve i file del gioco (index.html, js/, ecc.)
  2. Analizza posizioni in background (avvia automaticamente)
  3. Espone API REST per il browser

Dipendenze:  pip install flask flask-cors
"""

import threading, time, json, hashlib, os, random, socket, traceback
from collections import defaultdict
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DB_FILE = 'analysis_db.json'

# ─────────────────────────────────────────────────────────────────────────────
# COSTANTI
# ─────────────────────────────────────────────────────────────────────────────
WIN_LINES = [(0,1,2),(3,4,5),(6,7,8),
             (0,3,6),(1,4,7),(2,5,8),
             (0,4,8),(2,4,6)]

# Numero di linee WIN che passano per ogni cella (0-8)
# corner=3, edge=2, center=4
CELL_LINES = [3,2,3, 2,4,2, 3,2,3]

# Valore posizionale: centro > angolo > lato
PV = [3,2,3, 2,5,2, 3,2,3]

W = dict(
    WIN       = 100_000,
    META_WIN  =   2_000,   # vincere un quadrante
    META_FORK =   1_200,   # avere 2 minacce meta contemporaneamente
    META_2    =     300,   # 2 quadranti in fila nella meta
    META_1    =      50,
    LOC_FORK  =     180,   # doppia minaccia locale (fork)
    LOC_2     =      35,   # 2 in fila locale
    LOC_1     =       8,
    ACTIVITY  =       6,   # bonus per linee aperte del pezzo
    TARGET    =      40,   # penalità per mandare avversario in board buona
)

# ─────────────────────────────────────────────────────────────────────────────
# STATO GLOBALE
# ─────────────────────────────────────────────────────────────────────────────
analysis_db   = {}   # key -> {score, depth, move, count, phase, pattern, pv}
db_lock       = threading.Lock()
worker_thread = None
worker_stop   = threading.Event()
status        = {"running": False,
                 "session_analyzed": 0,   # contatore sessione corrente
                 "total_in_db": 0,        # posizioni nel DB (persiste)
                 "last_error": ""}

# ─────────────────────────────────────────────────────────────────────────────
# LOGICA DI GIOCO
# ─────────────────────────────────────────────────────────────────────────────
def opp(p): return 'O' if p == 'X' else 'X'

def check_grid(grid):
    for a,b,c in WIN_LINES:
        v = grid[a]
        if v in ('X','O') and v == grid[b] == grid[c]:
            return v
    return 'D' if ' ' not in grid else None

class Game:
    def __init__(self):
        self.board  = [[' ']*9 for _ in range(9)]
        self.big    = [' ']*9
        self.player = 'X'
        self.active = None
        self.over   = False
        self.winner = None
        self.hist   = []

    def copy(self):
        g = object.__new__(Game)
        g.board  = [r[:] for r in self.board]
        g.big    = self.big[:]
        g.player = self.player
        g.active = self.active
        g.over   = self.over
        g.winner = self.winner
        g.hist   = self.hist[:]
        return g

    def moves(self):
        if self.over: return []
        ab = self.active
        bds = [ab] if (ab is not None and self.big[ab]==' ') \
              else [i for i,v in enumerate(self.big) if v==' ']
        return [(b,c) for b in bds for c in range(9) if self.board[b][c]==' ']

    def push(self, b, c):
        self.board[b][c] = self.player
        self.hist.append((b,c))
        res = check_grid(self.board[b])
        if res and self.big[b]==' ':
            self.big[b] = res
        gr = check_grid(self.big)
        if gr in ('X','O'):
            self.over=True; self.winner=gr; return
        bds2 = [c] if self.big[c]==' ' else [i for i,v in enumerate(self.big) if v==' ']
        ok = any(self.board[b2][cc]==' ' for b2 in bds2 for cc in range(9))
        if not ok: self.over=True; self.winner='D'; return
        self.active = c if self.big[c]==' ' else None
        self.player = opp(self.player)

    def key(self):
        b = ''.join(''.join(r) for r in self.board)
        s = f"{b}|{''.join(self.big)}|{self.active}|{self.player}"
        return hashlib.md5(s.encode()).hexdigest()

def parse_hist(raw):
    result = []
    for m in raw:
        if isinstance(m, (list,tuple)): result.append((int(m[0]), int(m[1])))
        elif isinstance(m, dict):       result.append((int(m['b']), int(m['c'])))
    return result

# ─────────────────────────────────────────────────────────────────────────────
# EURISTICA AVANZATA
# ─────────────────────────────────────────────────────────────────────────────
def count_threats(grid, p):
    """Linee con 2 di p e 1 vuota = minacce immediate."""
    e = opp(p); t = 0
    for a,b,c in WIN_LINES:
        vs = [grid[a],grid[b],grid[c]]
        if vs.count(p)==2 and vs.count(' ')==1: t+=1
    return t

def open_lines_meta(big, idx):
    """Linee meta ancora vincibili che passano per idx."""
    n = 0
    for line in WIN_LINES:
        if idx not in line: continue
        vs = [big[i] for i in line]
        if 'D' in vs or ('X' in vs and 'O' in vs): continue
        n += 1
    return n

def target_board_quality(g, board_idx, for_player):
    """Quanto è buona la board_idx per for_player (chi ci giocherà)."""
    if g.big[board_idx] != ' ':
        return 0
    grid = g.board[board_idx]
    score = 0
    for a,b,c in WIN_LINES:
        vs = [grid[a],grid[b],grid[c]]
        if vs.count(opp(for_player)) > 0:
            continue
        score += vs.count(for_player)*3 + vs.count(' ')
    return score

def ls(vs, p, w2, w1):
    """Punteggio per una linea: ignora se bloccata dall'avversario."""
    e = opp(p)
    if any(v==e or v=='D' for v in vs): return 0
    pc = vs.count(p)
    return w2 if pc==2 else (w1 if pc==1 else 0)

def evaluate(g):
    if g.over:
        d = len(g.hist)
        if g.winner=='X': return  W['WIN']-d
        if g.winner=='O': return -W['WIN']+d
        return 0

    s   = 0
    big = g.big

    # ── 1. Meta-board: quadranti vinti ───────────────────────────────────────
    for i, cell in enumerate(big):
        if cell not in ('X','O'): continue
        om = open_lines_meta(big, i)
        v  = W['META_WIN'] * (PV[i] + om) // 6
        s += v if cell=='X' else -v

    # ── 2. Meta-board: minacce 2-in-fila e fork ──────────────────────────────
    for line in WIN_LINES:
        vs = [big[i] for i in line]
        if 'D' not in vs:
            if 'O' not in vs: s += ls(vs,'X',W['META_2'],W['META_1'])
            if 'X' not in vs: s -= ls(vs,'O',W['META_2'],W['META_1'])

    # Fork meta: 2+ minacce contemporanee sulla meta-board
    for p, sign in [('X',+1),('O',-1)]:
        threats = 0
        for line in WIN_LINES:
            vs = [big[i] for i in line]
            if vs.count(p)==2 and vs.count(' ')==1:
                threats += 1
        if threats >= 2:
            s += sign * W['META_FORK']

    # ── 3. Analisi locale per ogni quadrante aperto ──────────────────────────
    for gi in range(9):
        if big[gi] != ' ': continue
        grid = g.board[gi]
        ml   = max(1, open_lines_meta(big, gi))   # importanza strategica
        pg   = PV[gi]

        # Fork locale (doppia minaccia)
        tx = count_threats(grid,'X'); to = count_threats(grid,'O')
        if tx >= 2: s += W['LOC_FORK'] * ml * pg // 5
        if to >= 2: s -= W['LOC_FORK'] * ml * pg // 5

        # 2-in-fila e 1-in-fila locale
        for line in WIN_LINES:
            vs = [grid[i] for i in line]
            s += ls(vs,'X', W['LOC_2']*ml*pg//5, W['LOC_1']*ml*pg//5)
            s -= ls(vs,'O', W['LOC_2']*ml*pg//5, W['LOC_1']*ml*pg//5)

        # Attività dei pezzi: quante linee aperte taglia ogni pezzo
        for ci, cell in enumerate(grid):
            if cell not in ('X','O'): continue
            e = opp(cell)
            # Linee WIN che passano per ci e non sono bloccate dall'avversario
            open_l = sum(1 for ln in WIN_LINES if ci in ln
                         and not any(grid[i]==e for i in ln))
            v = W['ACTIVITY'] * open_l * CELL_LINES[ci] * ml * pg // 20
            s += v if cell=='X' else -v

    # ── 4. Penalità per mandare l'avversario in board buona ──────────────────
    if g.hist:
        last_b, last_c = g.hist[-1]
        mover   = opp(g.player)          # chi ha appena mosso
        tgt     = last_c                  # dove andrà il prossimo
        quality = target_board_quality(g, tgt, g.player)   # qualità per chi giocherà
        sign    = -1 if mover=='X' else +1  # penalizza chi ha mandato lì
        s      += sign * quality * W['TARGET'] // 20

    # ── 5. Mobilità (corretta: non crea falsa vittoria di turno) ─────────────
    # Usiamo differenza di mobilità, non la mobilità assoluta
    own_moves = len(g.moves())
    # Non cambiare turno: stima le mosse avversarie
    s += (1 if g.player=='X' else -1) * own_moves * 2

    return s

# ─────────────────────────────────────────────────────────────────────────────
# ORDINAMENTO MOSSE
# ─────────────────────────────────────────────────────────────────────────────
def order_moves(g, mvs):
    p = g.player; e = opp(p)
    def sc(m):
        b, c = m; n = 0
        # Vince quadrante?
        gr = g.board[b][:]
        gr[c] = p
        if any(gr[a]==p and gr[bb]==p and gr[cc]==p for a,bb,cc in WIN_LINES):
            n += 3000
        # Blocca vittoria avversario?
        gr2 = g.board[b][:]
        gr2[c] = e
        if any(gr2[a]==e and gr2[bb]==e and gr2[cc]==e for a,bb,cc in WIN_LINES):
            n += 1500
        # Penalizza invio in board buona per avversario
        tq = target_board_quality(g, c, e)
        n -= tq * 3
        # Valore posizionale
        n += PV[c]*8 + PV[b]*6
        return -n
    return sorted(mvs, key=sc)

# ─────────────────────────────────────────────────────────────────────────────
# MINIMAX CON ESTRAZIONE PV
# ─────────────────────────────────────────────────────────────────────────────
def minimax(g, depth, alpha, beta, is_max, stop, tt):
    if stop.is_set(): return evaluate(g), None
    key = g.key()
    if key in tt:
        td,tf,tv,tm = tt[key]
        if td >= depth:
            if tf=='exact':               return tv, tm
            if tf=='lower' and tv>=beta:  return tv, tm
            if tf=='upper' and tv<=alpha: return tv, tm
    mvs = g.moves()
    if depth==0 or g.over or not mvs:
        return evaluate(g), None
    if len(mvs)==81:
        return 0, (4,4)
    mvs = order_moves(g, mvs)
    bm = mvs[0]; oa = alpha
    if is_max:
        bv = float('-inf')
        for m in mvs:
            if stop.is_set(): break
            ns = g.copy(); ns.push(*m)
            v,_ = minimax(ns, depth-1, alpha, beta, False, stop, tt)
            if v > bv: bv,bm = v,m
            alpha = max(alpha, bv)
            if alpha >= beta: break
    else:
        bv = float('inf')
        for m in mvs:
            if stop.is_set(): break
            ns = g.copy(); ns.push(*m)
            v,_ = minimax(ns, depth-1, alpha, beta, True, stop, tt)
            if v < bv: bv,bm = v,m
            beta = min(beta, bv)
            if alpha >= beta: break
    if not stop.is_set():
        flag = 'upper' if bv<=oa else 'lower' if bv>=beta else 'exact'
        tt[key] = (depth, flag, bv, bm)
    return bv, bm

def extract_pv(g, tt, max_len=8):
    """Estrae la Principal Variation dalla TT."""
    pv = []; cur = g
    seen = set()
    while len(pv) < max_len:
        key = cur.key()
        if key in seen or key not in tt: break
        seen.add(key)
        _,_,_,bm = tt[key]
        if bm is None: break
        mvs = cur.moves()
        if not mvs or cur.over: break
        if bm not in mvs: break
        pv.append(list(bm))
        nxt = cur.copy(); nxt.push(*bm)
        cur = nxt
    return pv

# ─────────────────────────────────────────────────────────────────────────────
# WORKER DI ANALISI BACKGROUND
# ─────────────────────────────────────────────────────────────────────────────
def make_random_game():
    """Genera una partita fino a N mosse in modo casuale ma non stupido."""
    g = Game()
    n_moves = random.randint(2, 16)
    for _ in range(n_moves):
        mvs = g.moves()
        if not mvs or g.over: break
        ordered = order_moves(g, mvs)
        # 60% scelta intelligente, 40% random tra prime 4
        top = ordered[:min(4, len(ordered))]
        m = top[0] if random.random() < 0.6 else random.choice(top)
        g.push(*m)
    return g

def analysis_worker():
    """Analizza posizioni casuali in background e salva nel DB."""
    print("[Worker] Avviato — inizio analisi posizioni")
    tt = {}
    last_save   = time.time()
    last_print  = time.time()
    loop_count  = 0
    errors      = 0

    while not worker_stop.is_set():
        loop_count += 1
        try:
            # ── Genera posizione ──────────────────────────────────────────
            g = make_random_game()
            if g.over:
                continue

            key = g.key()

            with db_lock:
                ex_depth = analysis_db.get(key, {}).get('depth', 0)
            if ex_depth >= 7:
                continue   # già analizzata abbastanza

            # ── Minimax ───────────────────────────────────────────────────
            is_max   = g.player == 'X'
            mvs      = g.moves()
            if not mvs:
                continue

            best_v   = evaluate(g)
            best_m   = order_moves(g, mvs)[0]
            reached  = 0

            for depth in range(1, 8):
                if worker_stop.is_set():
                    break
                v, m = minimax(g, depth,
                               float('-inf'), float('inf'),
                               is_max, worker_stop, tt)
                if worker_stop.is_set():
                    break
                if m is not None:
                    best_v, best_m = v, m
                    reached = depth
                if abs(best_v) >= W['WIN'] - 200:
                    break

            if worker_stop.is_set():
                break
            if reached == 0:
                continue

            # ── Pattern ───────────────────────────────────────────────────
            nm  = len(g.hist)
            bwx = sum(1 for v in g.big if v == 'X')
            bwo = sum(1 for v in g.big if v == 'O')
            phase   = 'apertura' if nm <= 6 else ('mediogioco' if nm <= 20 else 'finale')
            if abs(best_v) > W['META_WIN'] * 2: pattern = 'vantaggio decisivo'
            elif bwx >= 2 or bwo >= 2:          pattern = 'attacco'
            elif nm > 0 and g.hist[-1][1] == 4: pattern = 'controllo centro'
            else:                               pattern = 'sviluppo'

            pv_line = extract_pv(g, tt, max_len=6)

            # ── Salva nel DB ──────────────────────────────────────────────
            entry = {
                'score':   int(best_v),
                'depth':   reached,
                'move':    list(best_m),
                'pv':      pv_line,
                'count':   analysis_db.get(key, {}).get('count', 0) + 1,
                'phase':   phase,
                'pattern': pattern,
                'hist':    [list(h) for h in g.hist],
                'big':     g.big[:],
                'player':  g.player,
            }

            with db_lock:
                analysis_db[key] = entry
                status['session_analyzed'] += 1
                status['total_in_db']       = len(analysis_db)

            errors = 0   # reset error counter on success

            # ── Log ogni 10 secondi ───────────────────────────────────────
            now = time.time()
            if now - last_print >= 10:
                print(f"[Worker] loop={loop_count} | "
                      f"this_session={status['session_analyzed']} | "
                      f"total_in_db={status['total_in_db']} | "
                      f"last_depth={reached}")
                last_print = now

            # ── Salva su file ogni 60 secondi ─────────────────────────────
            if now - last_save >= 60:
                _save_db()
                last_save = now

        except Exception as exc:
            errors += 1
            msg = f"{type(exc).__name__}: {exc}"
            status['last_error'] = msg
            print(f"[Worker] Errore #{errors}: {msg}")
            if errors <= 3:
                traceback.print_exc()
            if errors > 30:
                print("[Worker] Troppi errori, pausa 5s")
                time.sleep(5)
                errors = 0

    _save_db()
    status['running'] = False
    print(f"[Worker] Fermato. Sessione: {status['session_analyzed']}, DB totale: {status['total_in_db']}")

# ─────────────────────────────────────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────────────────────────────────────
def _save_db():
    try:
        with db_lock:
            tmp = dict(analysis_db)
        with open(DB_FILE, 'w') as f:
            json.dump(tmp, f)
        print(f"[DB] Salvato: {len(tmp)} posizioni → {DB_FILE}")
    except Exception as e:
        print(f"[DB] Errore salvataggio: {e}")

def _load_db():
    global analysis_db
    if not os.path.exists(DB_FILE):
        print(f"[DB] {DB_FILE} non esiste, parto da zero")
        return
    try:
        with open(DB_FILE) as f:
            data = json.load(f)
        with db_lock:
            analysis_db = data
            status['total_in_db'] = len(data)
        print(f"[DB] Caricato: {len(data)} posizioni")
    except Exception as e:
        print(f"[DB] Errore caricamento: {e}")
        analysis_db = {}

# ─────────────────────────────────────────────────────────────────────────────
# ROUTE FILE STATICI
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# ─────────────────────────────────────────────────────────────────────────────
# API
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/ping')
def ping():
    return jsonify({'ok': True,
                    'db': len(analysis_db),
                    'session_analyzed': status['session_analyzed'],
                    'total_in_db':      status['total_in_db'],
                    'running':          status['running']})

@app.route('/status')
def get_status():
    return jsonify(status)

@app.route('/start', methods=['POST'])
def start():
    global worker_thread
    if status['running']:
        return jsonify({'ok': False, 'msg': 'Già in esecuzione'})
    worker_stop.clear()
    status['running'] = True
    worker_thread = threading.Thread(target=analysis_worker, daemon=True)
    worker_thread.start()
    return jsonify({'ok': True, 'msg': 'Avviato'})

@app.route('/stop', methods=['POST'])
def stop():
    worker_stop.set()
    status['running'] = False
    return jsonify({'ok': True, 'msg': 'Stop inviato'})

@app.route('/toggle', methods=['POST'])
def toggle():
    return stop() if status['running'] else start()

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        g = Game()
        g.board  = [list(r) for r in data['board']]
        g.big    = list(data['big'])
        g.player = data['player']
        g.active = data.get('active')
        g.over   = bool(data.get('over', False))
        g.winner = data.get('winner')
        g.hist   = parse_hist(data.get('hist', []))

        if g.over:
            return jsonify({'score': evaluate(g), 'move': None,
                            'pv': [], 'pattern': 'terminale'})

        key = g.key()
        with db_lock:
            cached = analysis_db.get(key)
        if cached and cached.get('depth', 0) >= 5:
            return jsonify({**cached, 'cached': True})

        # Analisi diretta
        stop_ev = threading.Event()
        tt = {}
        is_max = g.player == 'X'
        best_v, best_m = evaluate(g), None
        mvs = g.moves()
        if mvs: best_m = order_moves(g, mvs)[0]

        for depth in range(1, 7):
            v, m = minimax(g, depth, float('-inf'), float('inf'),
                           is_max, stop_ev, tt)
            if m is not None:
                best_v, best_m = v, m
            if abs(best_v) >= W['WIN']-200: break

        pv = extract_pv(g, tt, max_len=8)

        # Salva nel DB
        nm = len(g.hist)
        phase = 'apertura' if nm<=6 else ('mediogioco' if nm<=20 else 'finale')
        pattern = 'sviluppo'
        if abs(best_v) > W['META_WIN']*2: pattern='vantaggio decisivo'

        entry = {'score': best_v, 'depth': depth,
                 'move': list(best_m) if best_m else None,
                 'pv': pv, 'phase': phase, 'pattern': pattern,
                 'count': 1, 'cached': False}
        with db_lock:
            analysis_db[key] = {**entry, 'hist': list(g.hist),
                                 'big': g.big, 'player': g.player}
            status['db_size'] = len(analysis_db)

        return jsonify(entry)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/lines', methods=['POST'])
def get_lines():
    """
    Per una posizione data, restituisce le N mosse candidate
    con la loro valutazione e la linea principale (PV) per ciascuna.
    Usato dalla revisione per mostrare le linee alternative.
    """
    try:
        data = request.json
        g = Game()
        g.board  = [list(r) for r in data['board']]
        g.big    = list(data['big'])
        g.player = data['player']
        g.active = data.get('active')
        g.over   = bool(data.get('over', False))
        g.winner = data.get('winner')
        g.hist   = parse_hist(data.get('hist', []))

        if g.over:
            return jsonify({'lines': [], 'score': evaluate(g)})

        n_lines = min(int(data.get('n', 5)), 10)
        max_depth = min(int(data.get('depth', 6)), 8)

        stop_ev = threading.Event()
        tt_local = {}
        is_max   = g.player == 'X'
        mvs      = g.moves()
        if not mvs:
            return jsonify({'lines': [], 'score': evaluate(g)})

        # Valuta ogni mossa candidata
        ordered = order_moves(g, mvs)[:n_lines]
        lines   = []

        for m in ordered:
            ns = g.copy(); ns.push(*m)
            best_v = evaluate(ns)
            best_m2 = None
            tt_m = {}
            for depth in range(1, max_depth + 1):
                if stop_ev.is_set(): break
                v, m2 = minimax(ns, depth, float('-inf'), float('inf'),
                                not is_max, stop_ev, tt_m)
                if m2 is not None:
                    best_v, best_m2 = v, m2
                if abs(best_v) >= W_WIN - 200: break

            # Estrai PV per questa linea
            pv = []
            cur = ns.copy()
            seen = set()
            for _ in range(6):
                k = cur.key()
                if k in seen or k not in tt_m: break
                seen.add(k)
                _,_,_,bm = tt_m[k]
                if bm is None: break
                if not any(mv==bm for mv in cur.moves()): break
                pv.append({'b': bm[0], 'c': bm[1], 'player': cur.player})
                cur.push(*bm)
                if cur.over: break

            lines.append({
                'move':  list(m),
                'score': int(best_v),
                'depth': depth,
                'pv':    pv,
            })

        # Ordina per vantaggio del giocatore corrente
        lines.sort(key=lambda x: x['score'] * (1 if is_max else -1), reverse=True)
        return jsonify({'lines': lines, 'player': g.player})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'lines': []}), 500
def db_stats():
    with db_lock:
        phases = defaultdict(int); patterns = defaultdict(int)
        for v in analysis_db.values():
            phases[v.get('phase','?')]    += 1
            patterns[v.get('pattern','?')] += 1
    return jsonify({'total': len(analysis_db), 'analyzed': status['analyzed'],
                    'phases': dict(phases), 'patterns': dict(patterns),
                    'last_error': status['last_error']})

@app.route('/save', methods=['POST'])
def save():
    _save_db()
    return jsonify({'ok': True, 'size': len(analysis_db)})

# ─────────────────────────────────────────────────────────────────────────────
# AVVIO
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    _load_db()

    # Avvia worker automaticamente
    worker_stop.clear()
    status['running'] = True
    t = threading.Thread(target=analysis_worker, daemon=True)
    t.start()
    worker_thread = t

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close()
    except:
        ip = 'localhost'

    print(f"""
  ╔══════════════════════════════════════════════╗
  ║  Ultimate TTT — Analysis Server             ║
  ╠══════════════════════════════════════════════╣
  ║  PC:      http://localhost:5000             ║
  ║  Telefono: http://{ip}:5000          ║
  ╠══════════════════════════════════════════════╣
  ║  Test:  http://localhost:5000/ping          ║
  ║  Stats: http://localhost:5000/db_stats      ║
  ╚══════════════════════════════════════════════╝
    """)

    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)