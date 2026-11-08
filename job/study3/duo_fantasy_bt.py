# Does the QB–receiver duo help the fantasy number? (Nov 8 — the owner, 8:21 am: "if you think it helps"). Rule 12, prediction first.
# Pairs tagged in season s (top 15% chemistry, hunt 52), scored in season s+1 in the games that QB started (most dropbacks for the team):
# the receiver's PPR a game minus his season-s PPR a game (the plain carry-forward a projection starts from), tagged pairs vs every other
# pair with 30+ targets that season and the same QB the next. Usage: duo_fantasy_bt.py SCRATCH
import sys, glob, numpy as np, pandas as pd
from scipy import stats
S = sys.argv[1]
cols = ['season', 'season_type', 'play_type', 'passer_player_id', 'receiver_player_id', 'epa', 'posteam', 'game_id', 'week']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[(P.season_type == 'REG') & (P.play_type == 'pass') & P.passer_player_id.notna()]
st = P.groupby(['game_id', 'posteam']).passer_player_id.agg(lambda s: s.value_counts().index[0]).rename('qb').reset_index()
R = P[P.receiver_player_id.notna() & P.epa.notna()]
pr = R.groupby(['season', 'passer_player_id', 'receiver_player_id']).epa.agg(['sum', 'count']).reset_index()
qb = R.groupby(['season', 'passer_player_id']).epa.agg(['sum', 'count'])
pr['qs'] = [qb.loc[(s, q), 'sum'] for s, q in zip(pr.season, pr.passer_player_id)]; pr['qn'] = [qb.loc[(s, q), 'count'] for s, q in zip(pr.season, pr.passer_player_id)]
pr = pr[(pr['count'] >= 30) & (pr.qn - pr['count'] >= 60)].copy(); pr['chem'] = pr['sum'] / pr['count'] - (pr.qs - pr['sum']) / (pr.qn - pr['count'])
pr['tag'] = pr.chem >= pr.groupby('season').chem.transform(lambda s: s.quantile(.85))
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True); W = W[W.season_type == 'REG']
W['ppr'] = W.receptions.fillna(0) + W.receiving_yards.fillna(0) / 10 + 6 * W.receiving_tds.fillna(0) + W.rushing_yards.fillna(0) / 10 + 6 * W.rushing_tds.fillna(0)
gid = P.drop_duplicates(['season', 'week', 'posteam'])[['season', 'week', 'posteam', 'game_id']]
W = W.drop(columns=[c for c in ['game_id', 'posteam'] if c in W.columns]).merge(gid, left_on=['season', 'week', 'team'], right_on=['season', 'week', 'posteam'], how='inner').merge(st, on=['game_id', 'posteam'], how='inner')
base = W.groupby(['season', 'player_id']).ppr.mean()
rows = []
for r in pr.itertuples():
    g = W[(W.season == r.season + 1) & (W.player_id == r.receiver_player_id) & (W.qb == r.passer_player_id)]
    if len(g) < 4 or (r.season, r.receiver_player_id) not in base.index: continue
    rows.append((r.season + 1, r.tag, g.ppr.mean() - base.loc[(r.season, r.receiver_player_id)], len(g)))
D = pd.DataFrame(rows, columns=['season', 'tag', 'x', 'n'])
a, b = D[D.tag].x, D[~D.tag].x; t, p = stats.ttest_ind(a, b, equal_var=False)
print(f'tagged duos next season (same QB): {a.mean():+.2f} PPR a game vs their own last season · others {b.mean():+.2f} → {a.mean() - b.mean():+.2f} (p {p:.2g}; {len(a)} tagged, {len(b)} others)')
for y, g in D.groupby('season'): print(y, f'{g[g.tag].x.mean():+.2f} vs {g[~g.tag].x.mean():+.2f} ({int(g.tag.sum())} tagged)')
