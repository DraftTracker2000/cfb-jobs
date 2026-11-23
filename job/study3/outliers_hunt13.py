# Study book outliers (Nov 22, 2026) for hunt 13: college home courts by program and NBA back-to-backs by team, both ends, with the
# prediction test (2015–20 → 2021–26). Margins opponent-adjusted (plus the opponent's average margin that season), as in hunt 13.
# Only real teams: NBA teams with 60+ games a season, college teams with 20+. Usage: python3 outliers_hunt13.py BOX_DIR OUT.json
import sys, os, json, numpy as np, pandas as pd
from scipy import stats
D = sys.argv[1]; OUT = {}
for lg, mg in (('nba', 60), ('mbb', 20)):
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False, usecols=['game_id', 'season', 'season_type', 'game_date', 'team_id', 'team_location', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score']) for y in range(2015, 2027) if os.path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2]; TN = B.groupby('team_id').team_location.last().to_dict()
    G = B.drop_duplicates(['game_id', 'team_id']).dropna(subset=['team_score', 'opponent_team_score']).copy()
    cnt = G.groupby(['season', 'team_id']).size(); real = set(cnt[cnt >= mg].index); G = G[[(s, t) in real and (s, o) in real for s, t, o in zip(G.season, G.team_id, G.opponent_team_id)]].copy()
    G['m'] = pd.to_numeric(G.team_score) - pd.to_numeric(G.opponent_team_score); om = G.groupby(['season', 'team_id']).m.mean()
    G['adj'] = G.m + [om.get((s, o), 0) for s, o in zip(G.season, G.opponent_team_id)]; G['late'] = G.season >= 2021
    if lg == 'mbb':
        h = G[G.home_away == 'home'].groupby(['team_id', 'late']).adj.agg(['mean', 'size']).unstack(); a = G[G.home_away == 'away'].groupby(['team_id', 'late']).adj.agg(['mean', 'size']).unstack()
        e = (h[('mean', False)] - a[('mean', False)]).rename('e'); l = (h[('mean', True)] - a[('mean', True)]).rename('l')
        ok = (h[('size', False)] >= 40) & (h[('size', True)] >= 40) & (a[('size', False)] >= 40) & (a[('size', True)] >= 40)
        j = pd.concat([e, l], axis=1)[ok].dropna(); r, p = stats.pearsonr(j.e, j.l)
        allh = G[G.home_away == 'home'].groupby('team_id').adj.mean() - G[G.home_away == 'away'].groupby('team_id').adj.mean(); allh = allh.reindex(j.index).sort_values()
        lgavg = float(G[G.home_away == 'home'].adj.mean() - G[G.home_away == 'away'].adj.mean())
        OUT['mbb_home'] = {'league': round(lgavg, 1), 'programs': int(len(j)), 'r': round(float(r), 3), 'top': [[TN.get(i, i), round(float(allh[i]), 1), round(float(j.e[i]), 1), round(float(j.l[i]), 1)] for i in allh.index[::-1][:6]],
                           'bottom': [[TN.get(i, i), round(float(allh[i]), 1), round(float(j.e[i]), 1), round(float(j.l[i]), 1)] for i in allh.index[:6]]}
    else:
        G['dt'] = pd.to_datetime(G.game_date).dt.normalize(); G = G.sort_values(['team_id', 'dt']); G['b2b'] = G.groupby('team_id').dt.diff().dt.days == 1
        k = G.groupby(['team_id', 'late', 'b2b']).adj.agg(['mean', 'size']).unstack('b2b')
        d = (k[('mean', True)] - k[('mean', False)]).unstack('late'); n = k[('size', True)].unstack('late'); d = d[(n[False] >= 30) & (n[True] >= 30)].dropna()
        r, p = stats.pearsonr(d[False], d[True]); tot = (G[G.b2b].groupby('team_id').adj.mean() - G[~G.b2b].groupby('team_id').adj.mean()).reindex(d.index).sort_values()
        lgb = float(G[G.b2b].adj.mean() - G[~G.b2b].adj.mean())
        OUT['nba_b2b'] = {'league': round(lgb, 1), 'teams': int(len(d)), 'r': round(float(r), 3), 'p': round(float(p), 4), 'worst': [[TN.get(i, i), round(float(tot[i]), 1), round(float(d.loc[i, False]), 1), round(float(d.loc[i, True]), 1)] for i in tot.index[:5]],
                          'best': [[TN.get(i, i), round(float(tot[i]), 1), round(float(d.loc[i, False]), 1), round(float(d.loc[i, True]), 1)] for i in tot.index[::-1][:5]]}
print(json.dumps(OUT, ensure_ascii=False)); json.dump(OUT, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
