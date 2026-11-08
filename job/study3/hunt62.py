# Hunt 62 (Nov 8 — the plan's notes list, item 3 of the owner's 12:27 am "go with 1 through 3"): this season's home-loving receivers, the tag
# hunt 36 tested (P6): receiver yards per target at home minus on the road, every season on file (20+ home targets, 60+ others); the best
# 15% gained +2.5 yards per target more at home again the next season (p .004, 18 of 22). Players with targets last season only.
# Prints JSON for public/data/cfb-home-wr.json: {season, cut, p: {athleteId: [name, team, home ypt, road ypt, home targets, road targets]}}.
import json, numpy as np, pandas as pd
from load import frame, pick, num
from hunt5b import playstats

def run(reg, log, D):
    P = playstats()
    if P is None: print('::notice title=hunt62::no per-play player file in this run'); return
    P['pid'] = P.athleteId.astype(str)
    G = frame('cf_games'); home = dict(zip(num(pick(G, 'id')).astype('Int64').astype(str), pick(G, 'homeTeam').astype(str))) if len(G) else {}
    neu = dict(zip(num(pick(G, 'id')).astype('Int64').astype(str), pick(G, 'neutralSite'))) if len(G) else {}
    P['hm'] = [np.nan if g not in home or neu.get(g) is True else home.get(g) == t for g, t in zip(P.g, P.team)]
    T = P[P.st.isin(['Reception', 'Target']) & P.hm.notna()].copy(); T['yds'] = np.where(T.st == 'Reception', T.stat, 0.0); T['f'] = T.hm.astype(bool)
    last = int(T.season.max()); cur = T[T.season == last].groupby('pid').agg(team=('team', 'last'))
    nm = T.groupby('pid').athleteName.last() if 'athleteName' in T.columns else pd.Series(dtype=str)
    g = T.groupby(['pid', 'f']).yds.agg(['sum', 'size']).unstack('f', fill_value=0); g.columns = [f'{a}_{int(b)}' for a, b in g.columns]
    g = g[(g.size_1 >= 20) & (g.size_0 >= 60)]; d = g.sum_1 / g.size_1 - g.sum_0 / g.size_0; cut = float(d.quantile(.85))
    tg = d[(d >= cut) & d.index.isin(cur.index)].sort_values(ascending=False)
    out = {'season': last, 'cut': round(cut, 2), 'pool': int(len(d)), 'p': {k: [str(nm.get(k, '')), str(cur.team.get(k, '')), round(float(g.sum_1[k] / g.size_1[k]), 1),
           round(float(g.sum_0[k] / g.size_0[k]), 1), int(g.size_1[k]), int(g.size_0[k])] for k in tg.index}}
    js = json.dumps(out, separators=(',', ':')); log(js)
    [print(f'::notice title=hunt62 {i + 1}::{js[i * 3900:(i + 1) * 3900]}') for i in range((len(js) + 3899) // 3900)]
