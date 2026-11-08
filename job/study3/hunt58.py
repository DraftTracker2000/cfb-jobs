# Pattern hunt 58 (Nov 7, 2026 — plan item: the per-coach close-finish line, 5:53 pm question; 7:56 pm "why not done yet?"): for each
# current head coach, as an underdog in FBS regular-season games with play-by-play (2014 on): how often his team won or had the ball in the
# last 2:00 of the 4th (or overtime) trailing by 1–8 or tied, against every other underdog at the same lines (reweighted by spread bins).
# Kept only when his own rate clears the typical one by 5+ points over 15+ games (hunt 44: the per-coach version is accurate, the blanket
# one isn't). Prints JSON for public/data/cfb-close-coaches.json.
import json, numpy as np, pandas as pd
from scipy import stats
import cfb_base
from cfb_plays import plays

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy(); T['dog'] = T.exp < -0.5
    P = plays(); P = P[~P.post]
    late = P[((P.period == 4) & (P.clockSec <= 120)) | (P.period >= 5)].copy(); late['d'] = late.offenseScore - late.defenseScore
    ch = late[(late.d >= -8) & (late.d <= 0)][['gameId', 'offense']].drop_duplicates()
    K = lambda v: str(int(float(v))) if str(v) not in ('nan', 'None', '') else ''
    chance = set(zip(ch.gameId.map(K), ch.offense.astype(str))); have = set(P.gameId.map(K))
    X = T[T.dog & T.gid.map(K).isin(have) & T.coach.notna()].copy()
    X['either'] = np.array([(K(g), str(t)) in chance for g, t in zip(X.gid, X.team)]) | (X.win >= 1).values
    X['bin'] = pd.cut(-X.exp, [0.5, 3.5, 7.5, 14.5, 99]); base = X.groupby('bin', observed=False).either.mean()
    s = int(T.season.max()); cur = T[T.season == s].sort_values('week').groupby('coach').team.last()
    out = {'season': s, 'typical': round(float(X.either.mean()), 3), 'c': {}}
    for c, team in cur.items():
        a = X[X.coach == c]
        if len(a) < 15: continue
        w = a.bin.value_counts(normalize=True); e = float((w * base.reindex(w.index)).sum()); r = float(a.either.mean())
        if r - e >= .05: out['c'][c] = [team, int(len(a)), round(r, 3), round(e, 3)]
    js = json.dumps(out, separators=(',', ':')); log(js)
    [print(f'::notice title=hunt58 {i + 1}::{js[i * 3900:(i + 1) * 3900]}') for i in range((len(js) + 3899) // 3900)]
