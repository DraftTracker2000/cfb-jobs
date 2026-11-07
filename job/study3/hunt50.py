# Pattern hunt 50 (Nov 7, 2026): hunt 33 redone with defense ranks AS OF THE WEEK BEFORE each game (no leak). Original: pattern hunt 33 (Nov 7, 2026 — 2:16 pm: "also look into the utah coach not really facing a tough defense yet"). STUDY ONLY.
# Defenses rated by schedule-adjusted points allowed (each season: points = offense + opposing defense + home edge, least squares).
# For each team-game: how good the defenses it has faced so far were (weeks before), and how good this opponent's defense is.
# Prediction first (rule 12): an "untested" offense (faced the weakest defenses so far, bottom 25% that week, 4+ games played) meeting a
# top-25 defense — its points vs what the line and total implied, and its result vs the spread. Compared with tested offenses meeting one.
# Plus the facts for Utah and BYU this season.
import numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
import cfb_base
from load import frame, pick

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    l = frame('cf_lines', flat=False); ou = {}
    for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
        if not isinstance(L, list): continue
        v = [x.get('overUnder') for x in L if x.get('overUnder') not in (None, '')]
        try: v = [float(a) for a in v]
        except Exception: v = []
        if v: ou[gid] = float(np.mean(v))
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs].copy()
    # schedule-adjusted defense AS OF each week: fitted on that season's games before the week (weeks 1-3: last season's final)
    def fitdef(g):
        teams = sorted(set(g.team)); ix = {t: i for i, t in enumerate(teams)}; n = len(g); k = len(teams)
        A = coo_matrix((np.r_[np.ones(n), np.ones(n), g.ishome.values - .5], (np.r_[np.arange(n), np.arange(n), np.arange(n)],
                        np.r_[[ix[t] for t in g.team], [k + ix[o] for o in g.opp], np.full(n, 2 * k)])), shape=(n, 2 * k + 1)).tocsr()
        x = lsqr(A, g.pf.values.astype(float), damp=.5)[0]; dd = x[k:2 * k] - x[k:2 * k].mean(); return {t: dd[i] for t, i in ix.items()}
    final = {s: fitdef(g) for s, g in T.groupby('season')}
    T['odef'] = np.nan; T['orank'] = np.nan; RK = {}
    for s, g in T.groupby('season'):
        for w in sorted(g.week.unique()):
            past = g[g.week < w]; dr = fitdef(past) if past.week.nunique() >= 3 else final.get(s - 1, {})
            if not dr: continue
            order = {t: i + 1 for i, (v, t) in enumerate(sorted((v, t) for t, v in dr.items()))}
            idx = g.index[g.week == w]; T.loc[idx, 'odef'] = [dr.get(o, np.nan) for o in T.loc[idx, 'opp']]; T.loc[idx, 'orank'] = [order.get(o, np.nan) for o in T.loc[idx, 'opp']]
            RK[(s, w)] = order
    T = T.sort_values(['team', 'season', 'week'])
    T['faced'] = T.groupby(['team', 'season']).odef.transform(lambda s: s.shift().expanding().mean())
    T['gp'] = T.groupby(['team', 'season']).cumcount()
    T['ou'] = T.gid.map(ou); T['imp'] = T.ou / 2 + T.exp / 2; T['ptsx'] = T.pf - T.imp
    T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    X = T[(T.gp >= 4) & T.faced.notna() & T.exp.notna()].copy()
    X['untested'] = X.groupby(['season', 'week']).faced.transform(lambda s: s >= s.quantile(.75))   # weakest defenses faced (highest points allowed)
    X['tested'] = X.groupby(['season', 'week']).faced.transform(lambda s: s <= s.quantile(.25))
    top = X[X.orank <= 25]
    OUT = []
    def cmp(lab, a, b):
        t1, p1 = stats.ttest_ind(a.ptsx.dropna(), b.ptsx.dropna(), equal_var=False); t2, p2 = stats.ttest_ind(a.cover.dropna(), b.cover.dropna(), equal_var=False)
        OUT.append(f'{lab}: points vs what the line and total implied {a.ptsx.mean():+.2f} vs {b.ptsx.mean():+.2f} (p {p1:.2g}) · against the spread {a.cover.mean():+.2f} vs {b.cover.mean():+.2f} '
                   f'(p {p2:.2g}) · covered {a.covered.mean():.1%} · {len(a)} games')
    cmp('D1 untested offense (weakest 25% of defenses faced so far) vs a top-25 defense, compared with a tested offense (toughest 25%) vs one', top[top.untested], top[top.tested])
    cmp('D1b untested offense vs a top-25 defense, compared with every other offense vs one', top[top.untested], top[~top.untested])
    cmp('D1c 2019 on', top[top.untested & (top.season >= 2019)], top[~top.untested & (top.season >= 2019)])
    cmp('D2 untested offense vs a top-10 defense', X[(X.orank <= 10) & X.untested], X[(X.orank <= 10) & ~X.untested])
    # the facts this season
    s = int(T.season.max())
    for tm in ('Utah', 'BYU'):
        d = T[(T.team == tm) & (T.season == s)].sort_values('week')
        if not len(d): OUT.append(f'{tm}: no {s} games in the data'); continue
        nteams = T[T.season == s].team.nunique()
        OUT.append(f'{tm} {s}: ' + ' · '.join(f'wk{int(r.week)} {r.opp} (defense #{int(r.orank) if r.orank == r.orank else "?"} of {nteams}) {int(r.pf)}-{int(r.pa)}' for r in d.itertuples())
                   + f' · own defense now #{RK.get((s, int(d.week.max()) + 1), RK.get((s, int(d.week.max())), {})).get(tm, "?")} of {nteams}'
                   + f' · average defense faced: rank {d.orank.mean():.0f}')
    for o in OUT: log(o)
    s_ = ' ‖ '.join(OUT); [print(f'::notice title=hunt50 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
