# Hunt 65 (Nov 8, 2026 — the owner 8:21 am on the college Player vs Team read: "do this, i don't know how to make it so you can sign in on the back
# end"). STUDY ONLY, prediction first (rule 12). The page's college Player vs Team read (MU_W.college, tools/backtest/colbt.py + coleval.py)
# rebuilt from the study archive instead of the Lab export, so it can be scored on every season since 2014, not only 2026's first weeks.
#   Rows: every QB / RB / WR / TE game in the CFBD box scores (cf_box), his main number (QB passing yards; RB rushing + receiving; WR/TE
#   receiving), his usual from earlier games (half-life 5 games, last season at 0.7), usual 15+. The read's 11 inputs exactly as colbt:
#   the defense's yards allowed (this season so far blended with last, n/(n+3)), his own history vs them, home/away split, his program's
#   points vs them, his coach vs them, coach vs coach, the Elo edge, home, the implied team total vs his team's usual points, no line, last 3.
#   Outcome log((m+10)/(B+10)). "Right" = leans 5%+ (strong 10%+) landing on that side of the middle (median of the training set).
# Tests: (1) refit each season on all earlier seasons, score that season (2018–2025); (2) the page's own weights (fit on 2022–2026) applied to
# 2014–2021, years they never saw; (3) which inputs carry it — the defense alone, the line alone (implied total), last 3 alone.
import numpy as np, pandas as pd
from load import frame, pick, num
import cfb_base, cfb_box, cfb_players

MU = {'QB': [-0.0527, 0.075, -0.0074, 0.017, 0.015, -0.0085, -0.0008, 0.0461, 0.0067, 0.145, -0.0216, -0.0283],
      'RB': [-0.0621, 0.1153, -0.0339, 0.0598, -0.0095, -0.0157, 0.0159, 0.034, 0.0026, 0.1736, 0.0304, -0.0622],
      'WR': [-0.0649, 0.0341, 0.001, -0.0139, 0.0402, -0.0083, -0.0512, 0.0243, -0.0012, 0.138, 0.0004, -0.0668],
      'TE': [-0.0812, -0.0229, 0.0036, 0.0296, 0.0326, -0.0044, 0.0129, 0.045, -0.0046, -0.0289, 0.0038, -0.033]}
PC = {'QB': -0.0512, 'RB': -0.0591, 'WR': -0.0668, 'TE': -0.0784}; CC = {'QB': 0.009, 'RB': -0.0257, 'WR': -0.0449, 'TE': -0.1107}
K_, HF_ = 0.04304, 3.385
mean = lambda L: float(np.mean(L)) if len(L) else None

def rows_of(log):
    G, T, CO, TS = cfb_base.build()
    B = cfb_box.box(); B = B[~B.post].copy()
    PS = cfb_players.player_seasons(); role = PS.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).to_dict()
    gi = G.set_index('gid'); B['gid'] = B.game_id
    B = B[B.gid.isin(gi.index)].copy()
    B['dt'] = B.gid.map(gi.date).astype(str); B['wk'] = B.gid.map(gi.week); B['y'] = B.season.astype(int)
    B['home'] = np.where(B.gid.map(gi.neutral).astype(bool), 0, np.where(B.ha.astype(str) == 'home', 1, -1)); B['opp'] = B.team_o
    for c in ('att', 'pyds', 'car', 'ryds', 'rec', 'recyds'): B[c] = B[c].fillna(0)
    B = B[(B.att > 0) | (B.car > 0) | (B.rec > 0)]
    log(f'hunt65 box rows {len(B)}, games {B.gid.nunique()}, seasons {B.y.min()}–{B.y.max()}, with a position {B.pid.map(role).notna().mean():.2f}')
    # lines: home spread (negative = home favored) and total, consensus first
    LN = {}; l = frame('cf_lines', flat=False)
    if len(l):
        for gid, ht, L in zip(pick(l, 'id'), pick(l, 'homeTeam'), pick(l, 'lines')):
            if not isinstance(L, list) or not L: continue
            c = [x for x in L if str(x.get('provider', '')).lower() == 'consensus'] or L
            sp = [float(x['spread']) for x in c if x.get('spread') not in (None, '')]; ou = [float(x['overUnder']) for x in c if x.get('overUnder') not in (None, '')]
            if sp and ou: LN[gid] = (np.mean(sp), np.mean(ou), ht)
    COd = {f'{t}|{int(s)}': c for t, s, c in zip(CO.team, CO.season, CO.coach)}
    Gd = {g: dict(h=h, n=bool(n), he=he, ae=ae) for g, h, n, he, ae in zip(G.gid, G.home, G.neutral, G.helo, G.aelo)}
    # team game yards (from the box) → allowed
    TG = B.groupby(['team', 'gid']).agg(y=('y', 'first'), dt=('dt', 'first'), opp=('opp', 'first'), py=('pyds', 'sum'), ry=('ryds', 'sum')).reset_index()
    tgk = set(zip(TG.team, TG.gid)); allow = {}
    for r in TG.itertuples():
        if (r.opp, r.gid) in tgk: allow.setdefault((r.opp, r.y), []).append((r.dt, r.py, r.ry))
    lg = {}
    for y, d in TG.groupby('y'): lg[y] = (d.py.mean(), d.ry.mean())
    def defF(team, y, dt, ki):
        cur = [a[ki] for a in allow.get((team, y), []) if a[0] < dt]; prev = [a[ki] for a in allow.get((team, y - 1), [])]
        n = len(cur); w = n / (n + 3); c = mean(cur); p = mean(prev)
        v = w * c + (1 - w) * p if (c is not None and p is not None) else (c if c is not None else p)
        return None if v is None or y not in lg else v / lg[y][ki - 1] - 1
    Gc = G.sort_values('date'); tp = {}
    for r in Gc.itertuples():
        tp.setdefault((r.home, int(r.season)), []).append((str(r.date), r.hpts)); tp.setdefault((r.away, int(r.season)), []).append((str(r.date), r.apts))
    savg = {k: np.mean([p for _, p in v]) for k, v in tp.items()}
    offVs, coVs, ccVs = {}, {}, {}
    for r in Gc.itertuples():
        y = int(r.season)
        for t, o, pts in ((r.home, r.away, r.hpts), (r.away, r.home, r.apts)):
            av = savg.get((t, y))
            if not av: continue
            rel = pts / av - 1; d = str(r.date); offVs.setdefault((t, o), []).append((d, rel))
            c = COd.get(f'{t}|{y}'); oc = COd.get(f'{o}|{y}')
            if c: coVs.setdefault((c, o), []).append((d, rel))
            if c and oc: ccVs.setdefault((c, oc), []).append((d, rel))
    def avgpts(t, y, dt):
        cur = [p for d, p in tp.get((t, y), []) if d < dt]; prev = [p for _, p in tp.get((t, y - 1), [])]; n = len(cur); w = n / (n + 3)
        c = mean(cur); p = mean(prev)
        return w * c + (1 - w) * p if (c is not None and p is not None) else (c if c is not None else p)
    def mainOf(r, pos):
        if pos == 'QB': return r.pyds if r.att >= 10 else None
        if pos == 'RB': return r.ryds + r.recyds if r.car >= 5 else None
        return r.recyds if r.rec >= 2 else None
    rows = []
    B['pos'] = B.pid.map(role); B = B[B.pos.isin(['QB', 'RB', 'WR', 'TE'])]
    for pid, L in B.groupby('pid', sort=False):
        pos = L.pos.iat[0]; L = L.sort_values('dt'); R = []
        for r in L.itertuples():
            m = mainOf(r, pos)
            if m is not None: R.append((r, m))
        rel = [None] * len(R)
        for i, (r, m) in enumerate(R):
            if i < 3: continue
            w = s = 0.0
            for h, j in enumerate(range(i - 1, -1, -1)):
                ww = 0.5 ** (h / 5) * (1 if R[j][0].y == r.y else .7); w += ww; s += ww * R[j][1]
            Bv = s / w
            if Bv < 15: continue
            pr = [(R[j][0], rel[j]) for j in range(i) if rel[j] is not None]
            h2 = [v for x, v in pr if x.opp == r.opp]; same = [v for x, v in pr if x.home == r.home]; allr = [v for x, v in pr]
            dfac = defF(r.opp, r.y, r.dt, 2 if pos == 'RB' else 1)
            tv = [v for d, v in offVs.get((r.team, r.opp), []) if d < r.dt and int(d[:4]) >= r.y - 15]
            c = COd.get(f'{r.team}|{r.y}'); oc = COd.get(f'{r.opp}|{r.y}')
            cv = [v for d, v in coVs.get((c, r.opp), []) if d < r.dt] if c else []
            cc = [v for d, v in ccVs.get((c, oc), []) if d < r.dt] if c and oc else []
            x = Gd.get(r.gid); ex = None
            if x and x['he'] == x['he'] and x['ae'] == x['ae'] and x['he'] is not None and x['ae'] is not None:
                e = K_ * (x['he'] - x['ae']) + HF_ * (0 if x['n'] else 1); ex = e if x['h'] == r.team else -e
            itt = None; l = LN.get(r.gid)
            if l:
                homeT = l[2] == r.team; imp = l[1] / 2 + ((-l[0]) if homeT else l[0]) / 2; av = avgpts(r.team, r.y, r.dt)
                if av: itt = imp / av - 1
            l3 = [R[j][1] for j in range(max(0, i - 3), i)]
            rows.append(dict(pos=pos, y=r.y, wk=r.wk, m=m, B=Bv, home=r.home, def_=dfac, h2hm=mean(h2) or 0, h2hn=len(h2),
                             sitem=(mean(same) - mean(allr)) if same and allr else 0, siten=len(same), tmm=mean(tv) or 0, tmn=len(tv),
                             com=mean(cv) or 0, con=len(cv), ccm=mean(cc) or 0, ccn=len(cc), ex=ex, itt=itt, tr3=np.mean(l3) / Bv - 1))
            rel[i] = m / Bv - 1
    X = pd.DataFrame(rows)
    for c in X.columns:
        if c != 'pos': X[c] = pd.to_numeric(X[c], errors='coerce')
    X['t'] = np.log((X.m.clip(lower=0) + 10) / (X.B + 10)); return X

sh = lambda m, n, K: m * n / (n + K)
def feats(D):
    return np.column_stack([D.def_.fillna(0), sh(D.h2hm, D.h2hn, 2), sh(D.sitem, D.siten, 5), sh(D.tmm, D.tmn, 3), sh(D.com, D.con, 3), sh(D.ccm, D.ccn, 3),
                            D.ex.fillna(0) / 14, D.home, D.itt.fillna(0), D.itt.isna().astype(int), D.tr3.clip(-1, 1)])
NAMES = ['defense', 'his history vs them', 'home/away split', 'program vs them', 'coach vs them', 'coach vs coach', 'Elo edge', 'home', 'implied total', 'no line', 'last 3']
def ridge(F, y, a=50.0):
    mu, my = F.mean(0), y.mean(); Fc = F - mu; b = np.linalg.solve(Fc.T @ Fc + a * np.eye(F.shape[1]), Fc.T @ (y - my)); return np.r_[my - mu @ b, b]
def grade(p, pc, t, c):
    p = p - pc; t = t - c; k = (np.abs(p) >= .05) & (t != 0); k2 = (np.abs(p) >= .10) & (t != 0); ev = t != 0
    f = lambda m: (int(m.sum()), round(100 * float((np.sign(p[m]) == np.sign(t[m])).mean()), 1) if m.sum() else None)
    return f(k), f(k2), f(ev)

def run(reg, log, D):
    X = rows_of(log); out = [f'rows {len(X)}: ' + ', '.join(f'{p} {n}' for p, n in X.groupby('pos').size().items()) + f'; seasons {X.y.min()}–{X.y.max()}']
    for pos in ['QB', 'RB', 'WR', 'TE']:
        P = X[X.pos == pos]; tot = {'lean': [0, 0], 'strong': [0, 0], 'every': [0, 0]}; per = []
        for y in range(2018, int(P.y.max()) + 1):
            tr, te = P[P.y < y], P[P.y == y]
            if len(tr) < 500 or not len(te): continue
            b = ridge(feats(tr), tr.t.values); a = np.c_[np.ones(len(tr)), feats(tr)] @ b; p = np.c_[np.ones(len(te)), feats(te)] @ b
            L, S, E = grade(p, np.median(a), te.t.values, np.median(tr.t))
            per.append(f'{y} {L[1]}% ({L[0]})')
            for k, v in (('lean', L), ('strong', S), ('every', E)):
                if v[1] is not None: tot[k][0] += v[0]; tot[k][1] += v[0] * v[1] / 100
        f = lambda k: f'{100 * tot[k][1] / tot[k][0]:.1f}% of {tot[k][0]}' if tot[k][0] else '—'
        out.append(f'{pos} (1) refit each season, 2018–{int(P.y.max())}: leans {f("lean")} · strong {f("strong")} · every game {f("every")} | by season: ' + ', '.join(per))
        # (2) the page's own weights on years they never saw
        old = P[P.y <= 2021]
        if len(old):
            p = np.c_[np.ones(len(old)), feats(old)] @ np.array(MU[pos]); L, S, E = grade(p, PC[pos], old.t.values, CC[pos])
            out.append(f'{pos} (2) the page\'s weights on 2014–2021: leans {L[1]}% of {L[0]} · strong {S[1]}% of {S[0]} · every {E[1]}% of {E[0]}')
        # (3) one input at a time (fit ≤2021, scored 2022–), and everything
        tr, te = P[P.y <= 2021], P[P.y >= 2022]
        if len(tr) > 500 and len(te):
            Ft, Fe = feats(tr), feats(te); one = []
            for j, nm in enumerate(NAMES):
                b = ridge(Ft[:, [j]], tr.t.values); a = b[0] + Ft[:, j] * b[1]; p = b[0] + Fe[:, j] * b[1]; L, _, _ = grade(p, np.median(a), te.t.values, np.median(tr.t))
                one.append(f'{nm} {L[1]}% ({L[0]})')
            b = ridge(Ft, tr.t.values); a = np.c_[np.ones(len(tr)), Ft] @ b; p = np.c_[np.ones(len(te)), Fe] @ b; L, S, E = grade(p, np.median(a), te.t.values, np.median(tr.t))
            out.append(f'{pos} (3) fit 2014–2021, scored 2022–{int(P.y.max())}: all {L[1]}% of {L[0]} (strong {S[1]}% of {S[0]}) | alone: ' + ', '.join(one))
            out.append(f'{pos} weights (fit ≤2021): ' + ' '.join(f'{nm} {v:+.3f}' for nm, v in zip(['const'] + NAMES, b)))
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt65 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
