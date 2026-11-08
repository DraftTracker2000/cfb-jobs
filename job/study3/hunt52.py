# Pattern hunt 52 (Nov 7, 2026): QB–receiver EPA "chemistry" (qb-receiver-study.md), prediction first (rule 12). STUDY ONLY. nflverse pbp.
# Chemistry = a receiver's EPA per target from a QB minus that QB's EPA per target to his other receivers that season (30+ targets).
# Tag the top 15% pairs one season → the same pair next season (30+ targets): chemistry and EPA per target vs other pairs.
# Also the same test for the receiver alone (his EPA per target minus his QBs' average to others) → next season with a NEW QB.
import sys, glob, numpy as np, pandas as pd
from scipy import stats
S = sys.argv[1]
cols = ['season', 'season_type', 'play_type', 'passer_player_id', 'receiver_player_id', 'epa', 'posteam']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[(P.season_type == 'REG') & (P.play_type == 'pass') & P.receiver_player_id.notna() & P.passer_player_id.notna() & P.epa.notna()]
pr = P.groupby(['season', 'passer_player_id', 'receiver_player_id']).epa.agg(['sum', 'count']).reset_index()
qb = P.groupby(['season', 'passer_player_id']).epa.agg(['sum', 'count'])
pr['qs'] = [qb.loc[(s, q), 'sum'] for s, q in zip(pr.season, pr.passer_player_id)]; pr['qn'] = [qb.loc[(s, q), 'count'] for s, q in zip(pr.season, pr.passer_player_id)]
pr = pr[(pr['count'] >= 30) & (pr.qn - pr['count'] >= 60)].copy()
pr['ept'] = pr['sum'] / pr['count']; pr['chem'] = pr.ept - (pr.qs - pr['sum']) / (pr.qn - pr['count'])
nx = pr.assign(season=pr.season - 1).set_index(['season', 'passer_player_id', 'receiver_player_id'])[['chem', 'ept']]
j = pr.join(nx, on=['season', 'passer_player_id', 'receiver_player_id'], rsuffix='_n').dropna(subset=['chem_n'])
j['tag'] = j.chem >= j.groupby('season').chem.transform(lambda s: s.quantile(.85))
for c, lab in (('chem_n', 'chemistry'), ('ept_n', 'EPA per target')):
    a, b = j[j.tag][c], j[~j.tag][c]; t, p = stats.ttest_ind(a, b, equal_var=False)
    print(f'E1 top-15% chemistry pairs → same pair next season, {lab}: {a.mean():+.3f} vs {b.mean():+.3f} → {a.mean() - b.mean():+.3f} (p {p:.2g}, {len(a)} tagged of {len(j)} pairs) · still above 0: {int((a > 0).sum())} of {len(a)}' if c == 'chem_n' else
          f'E1 ... {lab}: {a.mean():+.3f} vs {b.mean():+.3f} → {a.mean() - b.mean():+.3f} (p {p:.2g})', flush=True)
print(f'E1 r (chemistry this season, next season) {stats.pearsonr(j.chem, j.chem_n)[0]:+.3f} over {len(j)} pairs', flush=True)
# E2 receiver's own edge → next season with a different QB
rc = pr.groupby(['season', 'receiver_player_id']).apply(lambda g: pd.Series({'edge': np.average(g.chem, weights=g['count']), 'qbs': set(g.passer_player_id)})).reset_index()
nr = rc.assign(season=rc.season - 1).set_index(['season', 'receiver_player_id'])
k = rc.join(nr, on=['season', 'receiver_player_id'], rsuffix='_n').dropna(subset=['edge_n'])
k = k[[len(a & b) == 0 for a, b in zip(k.qbs, k.qbs_n)]]
k['tag'] = k.edge >= k.groupby('season').edge.transform(lambda s: s.quantile(.85))
a, b = k[k.tag].edge_n, k[~k.tag].edge_n; t, p = stats.ttest_ind(a, b, equal_var=False)
print(f'E2 receivers beating their QB\'s average most (top 15%) → next season with a NEW QB: {a.mean():+.3f} vs {b.mean():+.3f} → {a.mean() - b.mean():+.3f} EPA/target (p {p:.2g}, {len(a)} of {len(k)}) · still above: {int((a > 0).sum())} of {len(a)}', flush=True)
