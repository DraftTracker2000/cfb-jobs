# Builds public/data/nfl-chem.json (Nov 7, 2026 — 6:46 pm go-ahead; pattern hunt 52): QB–receiver duos that ran well above the QB's average
# (top 15% "chemistry" that season, 30+ targets: the receiver's EPA per target from that QB minus the QB's EPA per target to his other
# receivers). Hunt 52: the same duo stays above the next season (+0.15 EPA a target vs other pairs; 157 of 198 stayed above).
# The two latest seasons on file; each receiver's latest tagged duo. nflverse play-by-play. Usage: python3 build_nfl_chem.py PBPDIR OUT
import sys, glob, json, numpy as np, pandas as pd
cols = ['season', 'season_type', 'play_type', 'passer_player_id', 'passer_player_name', 'receiver_player_id', 'receiver_player_name', 'epa']
F = sorted(glob.glob(sys.argv[1] + '/p20*.csv.gz'))[-2:]
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in F], ignore_index=True)
P = P[(P.season_type == 'REG') & (P.play_type == 'pass') & P.receiver_player_id.notna() & P.passer_player_id.notna() & P.epa.notna()]
nm = {**dict(zip(P.passer_player_id, P.passer_player_name)), **dict(zip(P.receiver_player_id, P.receiver_player_name))}
pr = P.groupby(['season', 'passer_player_id', 'receiver_player_id']).epa.agg(['sum', 'count']).reset_index(); qb = P.groupby(['season', 'passer_player_id']).epa.agg(['sum', 'count'])
pr = pr.join(qb, on=['season', 'passer_player_id'], rsuffix='_q'); pr = pr[(pr['count'] >= 30) & (pr.count_q - pr['count'] >= 60)].copy()
pr['chem'] = pr['sum'] / pr['count'] - (pr.sum_q - pr['sum']) / (pr.count_q - pr['count'])
pr['tag'] = pr.chem >= pr.groupby('season').chem.transform(lambda s: s.quantile(.85))
T = pr[pr.tag].sort_values('season').drop_duplicates('receiver_player_id', keep='last')
out = {'v': 1, 'seasons': [int(s) for s in sorted(pr.season.unique())], 'r': {r: [str(nm.get(q, q)), q, int(s), round(float(c), 2), int(n)] for r, q, s, c, n in zip(T.receiver_player_id, T.passer_player_id, T.season, T.chem, T['count'])}}
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(out['r']), 'receivers;', out['seasons'], [(nm.get(k), v[0], v[3]) for k, v in list(out['r'].items())[:6]])
