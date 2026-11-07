# Pattern hunt 56 (Nov 7, 2026 — 6:46 pm go-ahead on the plan): the college pick terms' tags for THIS season, made exactly as the backtests
# made them (hunts 26 and 31): Upset Artist = top 15% of coaches in wins beyond the line as an underdog (15+ such games, all earlier seasons);
# Big-Game Hunter = top 15% against the spread vs top-25 opponents (10+ games, all earlier seasons); poor home program = bottom 15% in home
# cover minus road cover over the two seasons before (6+ each). Prints the current season's tagged teams (by their current coach) as JSON.
import json, numpy as np, pandas as pd
from scipy import stats
import cfb_base

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy()
    s = int(T.season.max())
    sd = (T.margin - T.exp).std(); T['wbeyond'] = T.win - stats.norm.cdf(T.exp / sd)
    T['dog'] = T.exp < -0.5; T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False); T['big'] = T.orank <= 25
    P = T[T.season < s]
    def tag(pool, key, min_n):
        pr = pool[pool.coach.notna()].groupby('coach').agg(n=(key, 'size'), v=(key, 'mean')); pr = pr[pr.n >= min_n]; cut = pr.v.quantile(.85)
        return set(pr.index[pr.v >= cut]), len(pr)
    ua, nua = tag(P[P.dog], 'wbeyond', 15); bg, nbg = tag(P[P.big], 'cover', 10)
    pr = T[(T.season >= s - 2) & (T.season < s)].copy(); pr['h'] = pr.ishome == 1
    m = pr.groupby(['team', 'h']).cover.agg(['mean', 'size']).unstack()
    v = (m[('mean', True)] - m[('mean', False)])[(m[('size', True)] >= 6) & (m[('size', False)] >= 6)]; poor = set(v.index[v <= v.quantile(.15)])
    cur = T[T.season == s].sort_values('week').groupby('team').coach.last().dropna()
    out = {'season': s, 'ua': sorted(t for t, c in cur.items() if c in ua), 'bgh': sorted(t for t, c in cur.items() if c in bg), 'poorhome': sorted(poor),
           'coach': {t: c for t, c in cur.items() if c in ua or c in bg}, 'n': {'ua_pool': nua, 'bgh_pool': nbg, 'home_pool': int(len(v))}}
    js = json.dumps(out, separators=(',', ':')); log(js)
    [print(f'::notice title=hunt56 {i + 1}::{js[i * 3900:(i + 1) * 3900]}') for i in range((len(js) + 3899) // 3900)]
