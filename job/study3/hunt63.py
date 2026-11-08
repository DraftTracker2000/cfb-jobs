# Hunt 63 (Nov 8 — the leftovers list, 12:27 am "go with 1 through 3"; his 10:30 pm ask, college too: "elite players wr1 and rb1 against
# their ilk, wr2/wr3s against theirs … where they catch … if the receiver is the wr1 or wr2 … literally everything"). STUDY ONLY, prediction
# first (rule 12). College receivers and runners, FBS 2020–2025 per-play player file (cf_playstats).
# The read: his yards in a game against his usual (earlier games, half-life 5, last season at 0.7) moved by what the defense has allowed
# (earlier games this season blended with last season, n/(n+3)). Outcome log((yards+2)/(usual+2)). Fit on 2021–2023, scored on 2024–2025.
# Angles added one at a time and all together: A1 his ilk (team rank by targets or carries so far: 1, 2, 3+) and what this defense allowed to
# that rank; A2 home; A3 his own earlier games against this opponent; A4 conference game; A5 the defense's big-play share allowed (20+ yards)
# against his own big-play share; A6 the opponent's yards allowed late in the season (last 3 games) vs its season; A7 his last 3 games vs usual.
# Graded like the NFL read: leans 5%+ off his usual, right when he lands on that side of his usual (centered on the median of the training set).
import numpy as np, pandas as pd
from hunt5b import playstats
from load import frame, pick, num

def run(reg, log, D):
    P = playstats()
    if P is None: print('::notice title=hunt63::no per-play player file in this run'); return
    G = frame('cf_games'); gid = num(pick(G, 'id')).astype('Int64').astype(str)
    home = dict(zip(gid, pick(G, 'homeTeam').astype(str))); conf = dict(zip(gid, pick(G, 'conferenceGame'))); neu = dict(zip(gid, pick(G, 'neutralSite')))
    out = []
    for kind, types in (('rec', ['Reception', 'Target']), ('rush', ['Rush'])):
        X = P[P.st.isin(types)].copy(); X['yds'] = np.where(X.st.isin(['Reception', 'Rush']), X.stat, 0.0); X['big'] = (X.yds >= 20).astype(float)
        g = X.groupby(['athleteId', 'g', 'season', 'week', 'team', 'opponent']).agg(y=('yds', 'sum'), n=('yds', 'size'), big=('big', 'sum')).reset_index()
        g = g.sort_values(['season', 'week']).reset_index(drop=True); g['pid'] = g.athleteId.astype(str)
        # rank on his team by volume so far this season (earlier weeks only)
        g['cum'] = g.groupby(['pid', 'season', 'team']).n.cumsum() - g.n
        g['rank'] = g.groupby(['season', 'team', 'week']).cum.rank(ascending=False, method='first').clip(upper=3)
        g = g[g.n >= 2].copy()
        # his usual
        us, l3 = [], []
        for pid, d in g.groupby('pid', sort=False):
            ys, ss = d.y.values, d.season.values; u = np.full(len(d), np.nan); t3 = np.full(len(d), np.nan)
            for i in range(len(d)):
                if i < 3: continue
                h = np.arange(i - 1, -1, -1); w = 0.5 ** (np.arange(i) / 5) * np.where(ss[h] == ss[i], 1, .7); u[i] = (w * ys[h]).sum() / w.sum(); t3[i] = ys[i - 3:i].mean()
            us.append(pd.Series(u, index=d.index)); l3.append(pd.Series(t3, index=d.index))
        g['usual'] = pd.concat(us); g['last3'] = pd.concat(l3); g = g[g.usual.notna()].copy()
        # defense allowed: per game to this kind, overall and by rank, earlier weeks this season blended with last season
        A = g.groupby(['opponent', 'season', 'week', 'rank']).y.sum().reset_index()
        tot = A.groupby(['opponent', 'season', 'week']).y.sum().reset_index()
        lgv = tot.groupby('season').y.mean(); lgr = A.groupby(['season', 'rank']).y.mean()
        def blend(T, keys, val, lgf):
            T = T.sort_values('week'); T['cs'] = T.groupby(keys).y.cumsum() - T.y; T['cn'] = T.groupby(keys).cumcount()
            prev = T.groupby(keys).y.mean().rename('pm').reset_index(); prev['season'] += 1
            T = T.merge(prev, on=keys, how='left'); T['cm'] = np.where(T.cn > 0, T.cs / T.cn.replace(0, 1), np.nan); w = T.cn / (T.cn + 3)
            v = np.where(T.cm.notna() & T.pm.notna(), w * T.cm + (1 - w) * T.pm, np.where(T.cm.notna(), T.cm, T.pm)); T[val] = v / lgf(T) - 1; return T
        tot = blend(tot, ['opponent', 'season'], 'dall', lambda T: T.season.map(lgv).values)
        A = blend(A, ['opponent', 'season', 'rank'], 'drank', lambda T: np.array([lgr.get((s, r), np.nan) for s, r in zip(T.season, T['rank'])]))
        # late-season form of the defense: its last 3 games vs its season so far
        tot['l3d'] = tot.groupby(['opponent', 'season']).y.transform(lambda s: s.shift(1).rolling(3, min_periods=3).mean()) / tot.season.map(lgv).values - 1
        g = g.merge(tot[['opponent', 'season', 'week', 'dall', 'l3d']], on=['opponent', 'season', 'week'], how='left').merge(A[['opponent', 'season', 'week', 'rank', 'drank']], on=['opponent', 'season', 'week', 'rank'], how='left')
        g['ilk'] = (g.drank - g.dall).fillna(0)
        g['hm'] = [0.0 if neu.get(x) is True else (1.0 if home.get(x) == t else -1.0) for x, t in zip(g.g, g.team)]
        g['cg'] = [1.0 if conf.get(x) is True else 0.0 for x in g.g]
        # his own earlier games vs this opponent (relative to his usual then)
        g['rel'] = np.log((np.maximum(g.y, -1) + 2) / (np.maximum(g.usual, -1) + 2)); g['h2h'] = g.groupby(['pid', 'opponent']).rel.transform(lambda s: s.shift(1).expanding().mean()).fillna(0)
        # big plays: his share of yards on 20+ plays vs what the defense allows on 20+ plays
        g['bigme'] = g.groupby('pid').big.transform(lambda s: s.shift(1).expanding().sum()) / g.groupby('pid').n.transform(lambda s: s.shift(1).expanding().sum())
        Bd = g.groupby(['opponent', 'season', 'week']).agg(b=('big', 'sum'), nn=('n', 'sum')).reset_index().sort_values('week')
        Bd['bd'] = (Bd.groupby(['opponent', 'season']).b.cumsum() - Bd.b) / (Bd.groupby(['opponent', 'season']).nn.cumsum() - Bd.nn).replace(0, np.nan)
        g = g.merge(Bd[['opponent', 'season', 'week', 'bd']], on=['opponent', 'season', 'week'], how='left'); lb = g.bd.mean()
        g['bigx'] = ((g.bigme.fillna(lb) - lb) * (g.bd.fillna(lb) - lb) * 100).clip(-3, 3)
        g['form'] = np.log((np.maximum(g.last3, -1) + 2) / (np.maximum(g.usual, -1) + 2)).fillna(0); g['l3d'] = g.l3d.fillna(0); g['dall'] = g.dall.fillna(0)
        g = g[(g.usual >= (15 if kind == 'rec' else 20))].copy()
        F_ = ['dall', 'ilk', 'hm', 'h2h', 'cg', 'bigx', 'l3d', 'form', 'rel']; out.append(f'{kind} missing before fill: ' + ', '.join(f'{c} {int(g[c].isna().sum())}' for c in F_))
        for c in F_[:-1]: g[c] = g[c].replace([np.inf, -np.inf], np.nan).fillna(0)
        g = g[g.rel.notna()]
        tr, te = g[g.season.between(2021, 2023)], g[g.season >= 2024]
        def score(cols, lab):
            Xtr = np.column_stack([np.ones(len(tr))] + [tr[c].values for c in cols]); Xte = np.column_stack([np.ones(len(te))] + [te[c].values for c in cols])
            lam = 5.0 * np.eye(Xtr.shape[1]); lam[0, 0] = 0; b = np.linalg.solve(Xtr.T @ Xtr + lam, Xtr.T @ tr.rel.values)
            pc = np.median(Xtr @ b); p = Xte @ b - pc; c = np.median(tr.rel); ln = np.abs(p) >= np.log(1.05)
            right = ((p > 0) == (te.rel.values > c))[ln]; strong = np.abs(p) >= np.log(1.10)
            mae = np.abs(np.exp(Xte @ b) * (np.maximum(te.usual, -1) + 2) - 2 - te.y).mean()
            out.append(f'{kind} {lab}: leans {ln.sum()} right {right.mean():.1%} · strong {strong.sum()} right {((p > 0) == (te.rel.values > c))[strong].mean():.1%} · yards error {mae:.2f}')
            return b
        base = ['dall']; score(base, 'read (usual + defense)')
        for a, lab in (('ilk', 'A1 ilk'), ('hm', 'A2 home'), ('h2h', 'A3 own history vs them'), ('cg', 'A4 conference game'), ('bigx', 'A5 big plays'), ('l3d', 'A6 defense lately'), ('form', 'A7 his last 3')):
            score(base + [a], '+ ' + lab)
        b = score(base + ['ilk', 'hm', 'h2h', 'cg', 'bigx', 'l3d', 'form'], '+ all'); out.append(f'{kind} weights (all): ' + ' '.join(f'{x:+.3f}' for x in b))
        out.append(f'{kind} rows: train {len(tr)}, test {len(te)}')
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt63 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
