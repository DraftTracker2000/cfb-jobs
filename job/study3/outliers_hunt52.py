# Outliers for the study book from pattern hunt 52 (QB–receiver EPA "chemistry"), Nov 22, 2026 — outliers on both sides of every test.
# STUDY ONLY. Same definitions as hunt52.py (nflverse pbp, regular season; 30+ targets for the pair, 60+ to the QB's other receivers).
# Adds the bottom 15% ("no chemistry") and the names at both ends: pairs that kept it, pairs that lost it; receivers who took it to a new QB.
# Usage: python3 outliers_hunt52.py <scratch dir with pbp/> <out.json>
import sys, glob, json, numpy as np, pandas as pd
S, OUT = sys.argv[1], sys.argv[2]; RES = {}
cols = ['season', 'season_type', 'play_type', 'passer_player_id', 'passer_player_name', 'receiver_player_id', 'receiver_player_name', 'epa', 'posteam']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[(P.season_type == 'REG') & (P.play_type == 'pass') & P.receiver_player_id.notna() & P.passer_player_id.notna() & P.epa.notna()]
NQ = P.groupby('passer_player_id').passer_player_name.last(); NR = P.groupby('receiver_player_id').receiver_player_name.last()
TM = P.groupby(['season', 'passer_player_id', 'receiver_player_id']).posteam.agg(lambda s: s.mode().iloc[0])
pr = P.groupby(['season', 'passer_player_id', 'receiver_player_id']).epa.agg(['sum', 'count']).reset_index()
qb = P.groupby(['season', 'passer_player_id']).epa.agg(['sum', 'count'])
pr['qs'] = [qb.loc[(s, q), 'sum'] for s, q in zip(pr.season, pr.passer_player_id)]; pr['qn'] = [qb.loc[(s, q), 'count'] for s, q in zip(pr.season, pr.passer_player_id)]
pr = pr[(pr['count'] >= 30) & (pr.qn - pr['count'] >= 60)].copy()
pr['ept'] = pr['sum'] / pr['count']; pr['chem'] = pr.ept - (pr.qs - pr['sum']) / (pr.qn - pr['count'])
nx = pr.assign(season=pr.season - 1).set_index(['season', 'passer_player_id', 'receiver_player_id'])[['chem', 'ept', 'count']]
j = pr.join(nx, on=['season', 'passer_player_id', 'receiver_player_id'], rsuffix='_n').dropna(subset=['chem_n'])
j['top'] = j.chem >= j.groupby('season').chem.transform(lambda s: s.quantile(.85)); j['bot'] = j.chem <= j.groupby('season').chem.transform(lambda s: s.quantile(.15))
def nm(r): return [f"{NQ.get(r.passer_player_id)} → {NR.get(r.receiver_player_id)}", TM.get((r.season, r.passer_player_id, r.receiver_player_id)), int(r.season), round(float(r.chem), 2), round(float(r.chem_n), 2), int(r['count']), int(r.count_n)]
for side, sel, sign in (('top', j.top, 1), ('bottom', j.bot, -1)):
    a = j[sel]; rest = j[~j.top & ~j.bot]
    RES['pairs_' + side] = {'n': int(len(a)), 'this': round(float(a.chem.mean()), 3), 'next': round(float(a.chem_n.mean()), 3), 'middle_next': round(float(rest.chem_n.mean()), 3),
        'same_side': int(((a.chem_n > 0) if sign > 0 else (a.chem_n < 0)).sum()),
        'kept': [nm(r) for _, r in a.assign(k=sign * np.minimum(sign * a.chem, sign * a.chem_n)).sort_values('k', ascending=(sign < 0)).head(6).iterrows()],
        'lost': [nm(r) for _, r in a.sort_values('chem_n', ascending=(sign > 0)).head(4).iterrows()]}
    print(side, {k: v for k, v in RES['pairs_' + side].items() if k not in ('kept', 'lost')}, flush=True)
rc = pr.groupby(['season', 'receiver_player_id']).apply(lambda g: pd.Series({'edge': np.average(g.chem, weights=g['count']), 'qbs': set(g.passer_player_id), 'n': g['count'].sum()})).reset_index()
nr = rc.assign(season=rc.season - 1).set_index(['season', 'receiver_player_id'])
k = rc.join(nr, on=['season', 'receiver_player_id'], rsuffix='_n').dropna(subset=['edge_n']); k = k[[len(a & b) == 0 for a, b in zip(k.qbs, k.qbs_n)]]
k['top'] = k.edge >= k.groupby('season').edge.transform(lambda s: s.quantile(.85))
def qn(s): return ', '.join(str(NQ.get(q)) for q in s)
a = k[k.top]
RES['receiver_new_qb'] = {'n': int(len(a)), 'this': round(float(a.edge.mean()), 3), 'next': round(float(a.edge_n.mean()), 3), 'others_next': round(float(k[~k.top].edge_n.mean()), 3), 'still_above': int((a.edge_n > 0).sum()),
    'kept': [[NR.get(r.receiver_player_id), int(r.season), qn(r.qbs), qn(r.qbs_n), round(float(r.edge), 2), round(float(r.edge_n), 2)] for _, r in a.assign(m=np.minimum(a.edge, a.edge_n)).sort_values('m', ascending=False).head(6).iterrows()],
    'lost': [[NR.get(r.receiver_player_id), int(r.season), qn(r.qbs), qn(r.qbs_n), round(float(r.edge), 2), round(float(r.edge_n), 2)] for _, r in a.sort_values('edge_n').head(4).iterrows()]}
print('new qb', {kk: v for kk, v in RES['receiver_new_qb'].items() if kk not in ('kept', 'lost')})
json.dump(RES, open(OUT, 'w'), indent=1, default=str); print('saved')
