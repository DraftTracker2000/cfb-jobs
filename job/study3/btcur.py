# This season's backtests, every week (Nov 8, 2026 — the owner 10:03 am: "there are a lot of back test stuff that is important to be current";
# 2:16 pm "yes to all"). Scores the page's own models on this season's finished games only, with the weights and powers the pages use now
# (nothing refit), and writes study-data/findings/p<season>_btcur.json for the scorecard (uploaded by job/findings.mjs). STUDY ONLY.
#   college: the Player vs Team read (MU_W.college) · What to expect (WTE powers, team-totals version)
#   NFL: the matchups list's calls (QB/TE points allowed, backs yards a carry allowed, WR2s points allowed to WR2s) · What to expect (NWTE)
# The NFL part reads nflverse's weekly player stats and schedules on the runner. usage: python3 btcur.py study-data
import os, sys, json, io, gzip, urllib.request, time, traceback
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import load

D = sys.argv[1]; load.init(D); OUT = {}; ERR = []
def note(k, label, value, n, extra=None):
    OUT[k] = {'label': label, 'value': value, 'n': int(n), **(extra or {})}; print(f'{k}: {label} — {value} (n {n})', flush=True)

def lean_hit(p, t, th=.05):
    k = (np.abs(p) >= th) & (t != 0); return (100 * float((np.sign(p[k]) == np.sign(t[k])).mean()) if k.sum() else None), int(k.sum())

# ---------------- college ----------------
def college():
    import hunt65, hunt66, cfb_base
    X = hunt65.rows_of(lambda *a: None); CUR = int(X.y.max()); C = X[X.y == CUR]
    parts = []
    for pos in ['QB', 'RB', 'WR', 'TE']:
        P = C[C.pos == pos]
        if not len(P): continue
        p = np.c_[np.ones(len(P)), hunt65.feats(P)] @ np.array(hunt65.MU[pos]) - hunt65.PC[pos]; t = P.t.values - hunt65.CC[pos]
        h, n = lean_hit(p, t); parts.append((pos, h, n))
    note('cfb-pvt', f'{CUR} so far, right when it leans 5%+ (the page\'s weights)', ' · '.join(f'{a} {b:.1f}% ({c})' for a, b, c in parts if b is not None), sum(c for *_, c in parts), {'season': CUR})
    return CUR

# the page's college What to expect (WTE in public/lab/index.html): stat → (defense power, line power, team stat it reads)
WTE = {'QB': {'pyds': (.25, .25), 'cmp': (.25, 0), 'ptd': (.25, .75), 'int': (.25, 0), 'ryds': (.25, .5)},
       'RB': {'ryds': (.25, .5), 'car': (.25, .25), 'rtd': (.5, 1), 'rec': (.25, 0), 'recyds': (.25, .5)},
       'WR': {'rec': (.25, 0), 'recyds': (.25, .25), 'rectd': (.5, 1)}, 'TE': {'rec': (0, 0), 'recyds': (.25, .25), 'rectd': (.75, 1)}}
def college_wte(CUR):
    import hunt66, cfb_base
    G, T, CO, TS = cfb_base.build(); gi = G.set_index('gid'); B = hunt66.box(); B = B[B.gid.isin(gi.index) & B.conf.notna() & (B.y >= CUR - 1)].copy()
    import cfb_players
    role = cfb_players.player_seasons(); role = role[role.season >= CUR - 2].groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).to_dict()
    B['dt'] = B.gid.map(gi.date).astype(str); B['pos'] = B.pid.map(role)
    ALLS = ['pyds', 'cmp', 'ptd', 'int', 'ryds', 'car', 'rtd', 'rec', 'recyds', 'rectd']
    # team totals allowed (everyone on the other side of his position groups), this season's earlier games blended with last season
    TA = B[B.pos.isin(['QB', 'RB', 'WR', 'TE'])].groupby(['team_o', 'y', 'gid', 'dt'])[ALLS].sum().reset_index().sort_values('dt'); g = TA.groupby(['team_o', 'y']); TA['n0'] = g.cumcount()
    last = TA.groupby(['team_o', 'y'])[ALLS].mean(); lg = TA.groupby('y')[ALLS].mean()
    for s in ALLS:
        cur = (g[s].cumsum() - TA[s]) / TA.n0.replace(0, np.nan); prv = pd.Series([last[s].get((t, y - 1), np.nan) for t, y in zip(TA.team_o, TA.y)], index=TA.index)
        w = TA.n0 / (TA.n0 + 3); TA['t_' + s] = np.where(cur.notna() & prv.notna(), w * cur + (1 - w) * prv, cur.fillna(prv)) / TA.y.map(lg[s]).values
    LN = {}; l = load.frame('cf_lines', flat=False)
    for gid, ht, L in (zip(load.pick(l, 'id'), load.pick(l, 'homeTeam'), load.pick(l, 'lines')) if len(l) else []):
        if not isinstance(L, list) or not L: continue
        c = [x for x in L if str(x.get('provider', '')).lower() == 'consensus'] or L
        sp = [float(x['spread']) for x in c if x.get('spread') not in (None, '')]; ou = [float(x['overUnder']) for x in c if x.get('overUnder') not in (None, '')]
        if sp and ou: LN[gid] = (np.mean(sp), np.mean(ou), ht)
    TT = T.sort_values('date')[['gid', 'team', 'season', 'pf']].copy(); gt = TT.groupby(['team', 'season']); TT['n0'] = gt.cumcount(); TT['c0'] = (gt.pf.cumsum() - TT.pf) / TT.n0.replace(0, np.nan)
    lp = TT.groupby(['team', 'season']).pf.mean(); TT['p0'] = [lp.get((t, s - 1), np.nan) for t, s in zip(TT.team, TT.season)]
    w = TT.n0 / (TT.n0 + 3); TT['up'] = np.where(TT.c0.notna() & TT.p0.notna(), w * TT.c0 + (1 - w) * TT.p0, TT.c0.fillna(TT.p0)); up = TT.set_index(['gid', 'team']).up
    def lmul(gid, team):
        x = LN.get(gid); u = up.get((gid, team), np.nan)
        if not x or not (u > 5): return 1.0
        s, ou, ht = x; return float(np.clip((ou / 2 + ((-s) if ht == team else s) / 2) / u, .4, 2.5))
    res = []
    for pos, SL in WTE.items():
        P = B[B.pos == pos].merge(TA[['gid', 'team_o'] + ['t_' + x for x in ALLS]], on=['gid', 'team_o'], how='left').sort_values(['pid', 'dt']).reset_index(drop=True)
        if pos == 'QB': P = P[P.att >= 10]
        elif pos == 'RB': P = P[P.car >= 5]
        else: P = P[P.rec + P.recyds > 0]
        P = P.reset_index(drop=True); P['lm'] = [lmul(a, b) for a, b in zip(P.gid, P.team)]; gp = P.groupby(['pid', 'y']); P['k'] = gp.cumcount()
        errs = []
        for s, (a, b) in SL.items():
            P['avg'] = (gp[s].cumsum() - P[s]) / P.k.replace(0, np.nan); ew = np.full(len(P), np.nan)
            for pid, idx in P.groupby('pid').indices.items():
                v = P[s].values[idx]; yy = P.y.values[idx]
                for i in range(1, len(idx)):
                    j = np.arange(i - 1, -1, -1); wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
            X = P[(P.y == CUR) & (P.k >= 3)].copy(); X['ew'] = ew[X.index]; X = X.dropna(subset=['avg', 'ew'])
            if len(X) < 30: continue
            pr = X.ew * X['t_' + s].fillna(1).clip(.3, 3) ** a * X.lm ** b; e0 = np.abs(X[s] - X.avg).mean(); e1 = np.abs(X[s] - pr).mean()
            if e0: errs.append((s, 100 * (e0 - e1) / e0, len(X)))
        res.append((pos, errs))
    yd = [e for p, L in res for (s, e, n) in L if s in ('pyds', 'ryds', 'recyds')]; td = [e for p, L in res for (s, e, n) in L if s in ('ptd', 'rtd', 'rectd')]
    note('cfb-wte', f'{CUR} so far, closer than his season average (page\'s powers)', f'yards {min(yd):+.1f} to {max(yd):+.1f}% · TDs {min(td):+.1f} to {max(td):+.1f}%' if yd and td else '—',
         sum(n for p, L in res for (s, e, n) in L if s in ('pyds', 'ryds', 'recyds')), {'detail': {p: {s: round(e, 1) for s, e, n in L} for p, L in res}})

# ---------------- NFL ----------------
NF = 'https://github.com/nflverse/nflverse-data/releases/download/'
def get_csv(path):
    for k in range(3):
        try:
            with urllib.request.urlopen(NF + path, timeout=120) as r: return pd.read_csv(io.BytesIO(r.read()), low_memory=False)
        except Exception as e: err = e; time.sleep(5)
    raise err
def nfl():
    CUR = int(time.strftime('%Y')) if int(time.strftime('%m')) >= 8 else int(time.strftime('%Y')) - 1
    W = pd.concat([get_csv(f'stats_player/stats_player_week_{y}.csv') for y in (CUR - 1, CUR)]); W = W[W.season_type == 'REG'].copy()
    fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
    for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
    for c in ('fantasy_points_ppr', 'carries', 'rushing_yards', 'targets', 'receptions', 'receiving_yards', 'passing_yards', 'completions', 'passing_tds', 'passing_interceptions', 'rushing_tds', 'attempts'): W[c] = W[c].fillna(0)
    W['ppr'] = W.fantasy_points_ppr; W = W.sort_values(['season', 'week'])
    g = W.groupby(['player_id', 'season']); W['k'] = g.cumcount(); W['usual'] = (g.ppr.cumsum() - W.ppr) / W.k.replace(0, np.nan); W['diff'] = W.ppr - W.usual
    W['vol'] = np.where(W.position == 'RB', W.carries, np.where(W.position == 'QB', W.attempts, W.targets)); W['cum'] = W.groupby(['player_id', 'season', 'team']).vol.cumsum() - W.vol
    W['rank'] = W.groupby(['season', 'week', 'team', 'position']).cum.rank(ascending=False, method='first')
    def prior(df, cols):
        df = df.sort_values('week'); gg = df.groupby(['season', 'opponent_team']); o = df[['season', 'week', 'opponent_team']].copy(); o['n'] = gg.cumcount()
        for c in cols: o[c] = (gg[c].cumsum() - df[c]) / o.n.replace(0, np.nan)
        return o
    parts = []; tot = [0, 0]
    for lab, pos, rk, read in (('QB', 'QB', None, 'ppr'), ('RB', 'RB', 1, 'ypc'), ('WR2', 'WR', 2, 'rkppr'), ('TE', 'TE', None, 'ppr')):
        P = W[(W.position == pos) & (W.season == CUR)]
        if read == 'ppr': a = prior(P.groupby(['season', 'week', 'opponent_team']).ppr.sum().reset_index(), ['ppr']); col = 'ppr'
        elif read == 'ypc':
            a = prior(P.groupby(['season', 'week', 'opponent_team'])[['rushing_yards', 'carries']].sum().reset_index(), ['rushing_yards', 'carries']); a['ypc'] = a.rushing_yards / a.carries; col = 'ypc'
        else: a = prior(P[P['rank'] == rk].groupby(['season', 'week', 'opponent_team']).ppr.sum().rename('rkppr').reset_index(), ['rkppr']); col = 'rkppr'
        a = a[['season', 'week', 'opponent_team', 'n', col]].rename(columns={col: 'rd'}); col = 'rd'
        X = P[(P.k >= 3) & (P.usual >= (10 if pos == 'QB' else 4)) & ((P['rank'] == rk) if rk else True)].merge(a, on=['season', 'week', 'opponent_team'])
        X = X[X.n >= 4].dropna(subset=[col])
        if not len(X): continue
        q = X.groupby('week')[col].rank(pct=True); lo, hi = X[q <= .15], X[q >= .85]; r = np.r_[(lo['diff'] < 0).values, (hi['diff'] > 0).values]
        parts.append(f'{lab} {100 * r.mean():.1f}% ({len(r)})'); tot[0] += r.sum(); tot[1] += len(r)
    note('nfl-fmatchup', f'{CUR} so far, the list\'s calls right (toughest 15% under, easiest 15% over)', ' · '.join(parts) + (f' · all {100 * tot[0] / tot[1]:.1f}%' if tot[1] else ''), tot[1], {'season': CUR})
    # What to expect (QB / RB), the page's powers (NWTE)
    S = pd.concat([get_csv(f'schedules/games.csv')]) if False else None
    try:
        with urllib.request.urlopen('https://github.com/nflverse/nfldata/raw/master/data/games.csv', timeout=120) as r: Gm = pd.read_csv(io.BytesIO(r.read()))
    except Exception: Gm = None
    lm = {}
    if Gm is not None:
        Gm = Gm[(Gm.game_type == 'REG') & (Gm.season >= CUR - 1)]
        for c in ('home_team', 'away_team'): Gm[c] = Gm[c].replace(fix)
        h = Gm.assign(team=Gm.home_team, pts=Gm.home_score, imp=Gm.total_line / 2 + Gm.spread_line / 2); a2 = Gm.assign(team=Gm.away_team, pts=Gm.away_score, imp=Gm.total_line / 2 - Gm.spread_line / 2)
        TP = pd.concat([h, a2])[['season', 'week', 'team', 'pts', 'imp']].sort_values('week'); gt = TP.groupby(['season', 'team']); TP['n0'] = gt.cumcount(); TP['c0'] = (gt.pts.cumsum() - TP.pts) / TP.n0.replace(0, np.nan)
        lp = TP.groupby(['season', 'team']).pts.mean(); TP['p0'] = [lp.get((s - 1, t), np.nan) for s, t in zip(TP.season, TP.team)]
        w = TP.n0 / (TP.n0 + 3); TP['up'] = np.where(TP.c0.notna() & TP.p0.notna(), w * TP.c0 + (1 - w) * TP.p0, TP.c0.fillna(TP.p0))
        lm = {(s, wk, t): float(np.clip(i / u, .4, 2.5)) for s, wk, t, i, u in zip(TP.season, TP.week, TP.team, TP.imp, TP.up) if u > 5 and i == i}
    NW = {'QB': {'passing_yards': (.25, .25), 'completions': (.25, 0), 'passing_tds': (0, 1), 'passing_interceptions': (.25, 0), 'rushing_yards': (.25, 0)},
          'RB': {'rushing_yards': (.5, .25), 'carries': (.25, .25), 'rushing_tds': (.25, 1.25), 'receptions': (.5, 0), 'receiving_yards': (0, .5)}}
    ALL = sorted({s for d in NW.values() for s in d}); TA = W.groupby(['season', 'week', 'opponent_team'])[ALL].sum().reset_index().sort_values('week'); ga = TA.groupby(['season', 'opponent_team']); TA['n0'] = ga.cumcount()
    la = TA.groupby(['season', 'opponent_team'])[ALL].mean(); lg = TA.groupby('season')[ALL].mean()
    for s in ALL:
        cur = (ga[s].cumsum() - TA[s]) / TA.n0.replace(0, np.nan); prv = pd.Series([la[s].get((y - 1, t), np.nan) for y, t in zip(TA.season, TA.opponent_team)], index=TA.index)
        w = TA.n0 / (TA.n0 + 3); TA['d_' + s] = np.where(cur.notna() & prv.notna(), w * cur + (1 - w) * prv, cur.fillna(prv)) / TA.season.map(lg[s]).values
    out = {}
    for pos, SL in NW.items():
        P = W[W.position == pos].merge(TA[['season', 'week', 'opponent_team'] + ['d_' + s for s in ALL]], on=['season', 'week', 'opponent_team'], how='left')
        P = P[(P.attempts >= 10) if pos == 'QB' else (P.carries + P.receptions >= 5)].sort_values(['player_id', 'season', 'week']).reset_index(drop=True)
        P['lm'] = [lm.get((s, wk, t), 1.0) for s, wk, t in zip(P.season, P.week, P.team)]; gp = P.groupby(['player_id', 'season']); P['kk'] = gp.cumcount()
        for s, (a, b) in SL.items():
            P['avg'] = (gp[s].cumsum() - P[s]) / P.kk.replace(0, np.nan); ew = np.full(len(P), np.nan)
            for pid, idx in P.groupby('player_id').indices.items():
                v = P[s].values[idx]; yy = P.season.values[idx]
                for i in range(1, len(idx)):
                    j = np.arange(i - 1, -1, -1); wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
            X = P[(P.season == CUR) & (P.kk >= 3)].copy(); X['ew'] = ew[X.index]; X = X.dropna(subset=['avg', 'ew'])
            if len(X) < 20: continue
            pr = X.ew * X['d_' + s].fillna(1).clip(.3, 3) ** a * X.lm ** b; e0 = np.abs(X[s] - X.avg).mean(); e1 = np.abs(X[s] - pr).mean()
            if e0: out[f'{pos} {s}'] = (round(100 * (e0 - e1) / e0, 1), len(X))
    nice = {'passing_yards': 'yds', 'completions': 'cmp', 'passing_tds': 'TD', 'passing_interceptions': 'INT', 'rushing_yards': 'rush yds', 'carries': 'car', 'rushing_tds': 'rush TD', 'receptions': 'rec', 'receiving_yards': 'rec yds'}
    note('nfl-wte', f'{CUR} so far, closer than his season average (page\'s powers)', ' · '.join(f'{k.split()[0]} {nice[k.split()[1]]} {v[0]:+.1f}%' for k, v in out.items()), sum(v[1] for v in out.values()), {'season': CUR})
    return CUR

def step(name, f, *a):
    try: return f(*a)
    except Exception: ERR.append(name); print(f'::warning title=btcur {name}::{traceback.format_exc()[-1500:]}'); return None
C = step('college', college)
if C: step('college What to expect', college_wte, C)
N = step('nfl', nfl)
S = C or N or int(time.strftime('%Y'))
os.makedirs(os.path.join(D, 'findings'), exist_ok=True)
json.dump({'btcur': {'v': 1, 'at': time.strftime('%Y-%m-%d'), 'season': S, 'models': OUT, 'errors': ERR}}, open(os.path.join(D, 'findings', f'p{S}_btcur.json'), 'w'))
print(f'::notice title=btcur::{json.dumps(OUT)[:3900]}')
