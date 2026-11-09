# What to expect, a likely range (Nov 8, 10:46 pm — the owner: "same with the what to expect"). The page's own projection (nflWteHTML: recent-weighted
# average over this season and last, last season at .7, × the defense's allowed^a × the line's implied points vs usual^b), rebuilt on 2016–2026
# games; the band = the middle half (25th–75th percentile) of what players finished with, by how big the number was. Fit 2018–2024, scored 2025–26.
import pandas as pd, numpy as np, json
W = pd.concat([pd.read_csv(f'nflw/w{y}.csv', low_memory=False) for y in range(2015, 2027)]); W = W[W.season_type == 'REG'].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
K = {'pyd': 'passing_yards', 'cmp': 'completions', 'ptd': 'passing_tds', 'int': 'passing_interceptions', 'ryd': 'rushing_yards', 'car': 'carries', 'rtd': 'rushing_tds', 'rec': 'receptions', 'yds': 'receiving_yards', 'tgt': 'targets', 'att': 'attempts'}
for k, c in K.items(): W[k] = W[c].fillna(0)
NW = {'QB': [['pyd', .25, .25], ['cmp', .25, 0], ['ptd', 0, 1], ['int', .25, 0], ['ryd', .25, 0]], 'RB': [['ryd', .5, .25], ['car', .25, .25], ['rtd', .25, 1.25], ['rec', .5, 0], ['yds', 0, .5]],
      'WR': [['tgt', .25, 0], ['rec', .25, 0], ['yds', 0, .5]], 'TE': [['tgt', 0, 0], ['rec', 0, .25], ['yds', 0, .5]]}
g = pd.read_csv('stadjob/games.csv'); g = g[(g.game_type == 'REG') & (g.season >= 2015)]
for c in ('home_team', 'away_team'): g[c] = g[c].replace(fix)
h = g.assign(team=g.home_team, pts=g.home_score, imp=g.total_line / 2 + g.spread_line / 2); a = g.assign(team=g.away_team, pts=g.away_score, imp=g.total_line / 2 - g.spread_line / 2)
TP = pd.concat([h, a])[['season', 'week', 'team', 'pts', 'imp']].sort_values('week'); gt = TP.groupby(['season', 'team']); TP['n0'] = gt.cumcount(); TP['c0'] = (gt.pts.cumsum() - TP.pts) / TP.n0.replace(0, np.nan)
lp = TP.groupby(['season', 'team']).pts.mean(); TP['p0'] = [lp.get((s - 1, t), np.nan) for s, t in zip(TP.season, TP.team)]
w = TP.n0 / (TP.n0 + 3); TP['up'] = np.where(TP.c0.notna() & TP.p0.notna(), w * TP.c0 + (1 - w) * TP.p0, TP.c0.fillna(TP.p0))
LM = {(s, wk, t): float(np.clip(i / u, .4, 2.5)) for s, wk, t, i, u in zip(TP.season, TP.week, TP.team, TP.imp, TP.up) if u > 5 and i == i}
ALL = sorted({k for L in NW.values() for k, _, _ in L})
TA = W.groupby(['season', 'week', 'opponent_team'])[ALL].sum().reset_index().sort_values('week'); ga = TA.groupby(['season', 'opponent_team']); TA['n0'] = ga.cumcount()
la = TA.groupby(['season', 'opponent_team'])[ALL].mean(); lg = TA.groupby('season')[ALL].mean()
for s in ALL:
    cur = (ga[s].cumsum() - TA[s]) / TA.n0.replace(0, np.nan); prv = pd.Series([la[s].get((y - 1, t), np.nan) for y, t in zip(TA.season, TA.opponent_team)], index=TA.index)
    ww = TA.n0 / (TA.n0 + 3); TA['d_' + s] = (np.where(cur.notna() & prv.notna(), ww * cur + (1 - ww) * prv, cur.fillna(prv)) / TA.season.map(lg[s]).values)
rows = []
for pos, SL in NW.items():
    P = W[W.position == pos].merge(TA[['season', 'week', 'opponent_team'] + ['d_' + s for s in ALL]], on=['season', 'week', 'opponent_team'], how='left')
    P = P[(P.att >= 10) if pos == 'QB' else ((P.car + P.rec >= 5) if pos == 'RB' else (P.tgt + P.rec > 0))].sort_values(['player_id', 'season', 'week']).reset_index(drop=True)
    P['lm'] = [LM.get((s, wk, t), 1.0) for s, wk, t in zip(P.season, P.week, P.team)]; P['kk'] = P.groupby(['player_id', 'season']).cumcount()
    for k, ea, eb in SL:
        ew = np.full(len(P), np.nan)
        for pid, idx in P.groupby('player_id').indices.items():
            v = P[k].values[idx]; yy = P.season.values[idx]
            for i in range(1, len(idx)):
                j = np.arange(i - 1, -1, -1); j = j[yy[j] >= yy[i] - 1]
                if not len(j): continue
                wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
        pr = ew * P['d_' + k].fillna(1).clip(.3, 3).values ** ea * P.lm.values ** eb
        m = (P.kk >= 3).values & ~np.isnan(pr) & (P.season >= 2016).values
        rows.append(pd.DataFrame({'pos': pos, 'k': k, 'season': P.season.values[m], 'pr': pr[m], 'y': P[k].values[m]}))
R = pd.concat(rows)
BAND = {}; rep = []
for (pos, k), d in R.groupby(['pos', 'k']):
    tr, te = d[(d.season >= 2018) & (d.season <= 2024)], d[d.season >= 2025]
    edges = np.unique(np.quantile(tr.pr, np.linspace(0, 1, 9)))
    tb = []
    for lo_e, hi_e in zip(edges[:-1], edges[1:]):
        b = tr[(tr.pr >= lo_e) & (tr.pr <= hi_e)]
        if len(b) < 40: continue
        tb.append([round(float(b.pr.median()), 2), round(float(b.y.quantile(.25)), 1), round(float(b.y.quantile(.75)), 1)])
    BAND.setdefault(pos, {})[k] = tb
    P_ = np.array([t[0] for t in tb]); LO = np.array([t[1] for t in tb]); HI = np.array([t[2] for t in tb])
    lo = np.interp(te.pr, P_, LO); hi = np.interp(te.pr, P_, HI)
    disc = k in ('ptd', 'int', 'rtd')
    if not disc:
        f = np.where(te.pr > P_[-1], te.pr / P_[-1], np.where(te.pr < P_[0], te.pr / P_[0], 1)); lo, hi = lo * f, hi * f
    if disc: lo, hi = np.floor(lo + 1e-9), np.ceil(hi - 1e-9)
    else: lo, hi = np.round(lo), np.round(hi)
    inside = ((te.y >= lo) & (te.y <= hi)).mean(); below = (te.y < lo).mean(); above = (te.y > hi).mean()
    rep.append((pos, k, len(tr), len(te), 100 * inside, 100 * below, 100 * above))
print(pd.DataFrame(rep, columns=['pos', 'stat', 'fit games', 'test games', 'inside %', 'below %', 'above %']).round(1).to_string(index=False))
json.dump(BAND, open('nflband.json', 'w'), separators=(',', ':'))
print(json.dumps(BAND)[:900])
