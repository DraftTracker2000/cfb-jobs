# Outliers for the study book, college basketball (Nov 22, 2026 — the owner, 11:48 pm: outliers on both sides of every test). STUDY ONLY.
# Same box scores and ratings as hunt 22 (2015–2026). Close games: the best and worst team seasons in games decided by 3 or less and what
# they did in close games the next season (the prediction test), plus programs that stayed on one side for years. Short rest: the teams
# with the most short-rest games and how they did beyond the ratings.
# Usage: python3 outliers_cbb.py <box dir> <out.json>
import sys, glob, json, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
BOX, OUT = sys.argv[1], sys.argv[2]; RES = {}
B = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(f'{BOX}/mbb20*.csv'))], ignore_index=True); B = B[(B.season_type == 2) & (B.did_not_play != True)]
for c in ['field_goals_attempted', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
NM = B.groupby('team_id').team_location.last()
T = B.groupby(['game_id', 'season', 'game_date', 'team_id', 'opponent_team_id']).agg(fga=('field_goals_attempted', 'sum'), pts=('team_score', 'first'), opp=('opponent_team_score', 'first'),
    ha=('home_away', 'first')).reset_index(); T = T[T.fga > 30]
T['m'] = T.pts - T.opp; T['home'] = np.where(T.ha == 'home', 1.0, -1.0)
srs = []
for y, d_ in T.groupby('season'):
    ids = pd.Index(sorted(set(d_.team_id) | set(d_.opponent_team_id))); i = np.arange(len(d_))
    M = coo_matrix((np.r_[np.ones(len(d_)), -np.ones(len(d_)), d_.home.values], (np.r_[i, i, i], np.r_[ids.get_indexer(d_.team_id), ids.get_indexer(d_.opponent_team_id), np.full(len(d_), len(ids))])), shape=(len(d_), len(ids) + 1)).tocsr()
    sol = lsqr(M, d_.m.values, damp=0.05)[0]; srs.append(pd.DataFrame({'team_id': ids, 'season': y, 'srs': sol[:-1]}))
S = pd.concat(srs); T = T.merge(S, on=['team_id', 'season']).merge(S.rename(columns={'team_id': 'opponent_team_id', 'srs': 'osrs'}), on=['opponent_team_id', 'season'])
X = np.column_stack([np.ones(len(T)), T.srs - T.osrs, T.home]); b, *_ = np.linalg.lstsq(X, T.m, rcond=None); T['res'] = T.m - X @ b
C = T[T.m.abs() <= 3]
cl = C.groupby(['team_id', 'season']).agg(n=('m', 'size'), w=('m', lambda s: int((s > 0).sum()))); cl['pct'] = cl.w / cl.n; cl = cl[cl.n >= 5].reset_index()
nx = cl.set_index(['team_id', 'season']); cl['n_next'] = nx.n.reindex(list(zip(cl.team_id, cl.season + 1))).values; cl['w_next'] = nx.w.reindex(list(zip(cl.team_id, cl.season + 1))).values
q = cl.dropna(subset=['n_next']).sort_values(['pct', 'n'])
def row(r): return {'team': NM.get(r.team_id, str(r.team_id)), 'season': int(r.season), 'rec': f'{int(r.w)}–{int(r.n - r.w)}', 'next': f'{int(r.w_next)}–{int(r.n_next - r.w_next)}'}
best = q[q.pct >= .85]; worst = q[q.pct <= .15]
# programs over many seasons: total close-game record, early seasons (to 2020) vs later (2021 on)
cs = C.assign(win=C.m > 0, late=C.season >= 2021).groupby(['team_id', 'late']).win.agg(['sum', 'size']).unstack()
cs = cs[(cs[('size', False)] >= 25) & (cs[('size', True)] >= 25)].copy(); cs['e'] = cs[('sum', False)] / cs[('size', False)]; cs['l'] = cs[('sum', True)] / cs[('size', True)]
r, p = stats.pearsonr(cs.e, cs.l); cs = cs.sort_values('e')
def prow(i, r): return {'team': NM.get(i, str(i)), 'early': f"{int(r[('sum', False)])}–{int(r[('size', False)] - r[('sum', False)])}", 'later': f"{int(r[('sum', True)])}–{int(r[('size', True)] - r[('sum', True)])}"}
RES['close'] = {'unit': 'team season', 'min_n': 5, 'seasons': int(len(q)),
    'best': [row(r) for _, r in q.iloc[::-1][:5].iterrows()], 'worst': [row(r) for _, r in q.iloc[:5].iterrows()],
    'best_group': {'teams': int(len(best)), 'this': round(float(best.w.sum() / best.n.sum()), 3), 'next': round(float(best.w_next.sum() / best.n_next.sum()), 3)},
    'worst_group': {'teams': int(len(worst)), 'this': round(float(worst.w.sum() / worst.n.sum()), 3), 'next': round(float(worst.w_next.sum() / worst.n_next.sum()), 3)},
    'programs': {'teams': int(len(cs)), 'r': round(float(r), 3), 'p': round(float(p), 4), 'top': [prow(i, x) for i, x in cs.iloc[::-1][:4].iterrows()], 'bottom': [prow(i, x) for i, x in cs.iloc[:4].iterrows()]}}
print('close', json.dumps(RES['close']), flush=True)
# short rest
T['dt'] = pd.to_datetime(T.game_date).dt.normalize(); T = T.sort_values(['team_id', 'dt']); gap = T.groupby('team_id').dt.diff().dt.days; T['g48'] = gap <= 2
og = T[['game_id', 'team_id', 'g48']].rename(columns={'team_id': 'opponent_team_id', 'g48': 'og48'}); T = T.merge(og, on=['game_id', 'opponent_team_id'])
a = T[T.g48 & ~T.og48]; base = T[~T.g48 & ~T.og48].res.mean()
tr = a.groupby('team_id').agg(n=('res', 'size'), res=('res', 'mean')); tr = tr[tr.n >= 12].sort_values('res')
def rrow(i, r): return {'team': NM.get(i, str(i)), 'games': int(r.n), 'res': round(float(r.res - base), 1)}
RES['rest'] = {'unit': 'team', 'min_n': 12, 'units': int(len(tr)), 'all': round(float(a.res.mean() - base), 2), 'top': [rrow(i, r) for i, r in tr.iloc[::-1][:4].iterrows()],
    'bottom': [rrow(i, r) for i, r in tr.iloc[:4].iterrows()], 'share_positive': round(float((tr.res - base > 0).mean()), 3)}
ev = a[a.season % 2 == 0].groupby('team_id').res.agg(['mean', 'size']); od = a[a.season % 2 == 1].groupby('team_id').res.agg(['mean', 'size']); jj = ev.join(od, lsuffix='e', rsuffix='o').dropna()
jj = jj[(jj.sizee >= 6) & (jj.sizeo >= 6)]
if len(jj) > 8: rr, pp = stats.pearsonr(jj.meane, jj.meano); RES['rest']['repeat'] = {'r': round(float(rr), 3), 'p': round(float(pp), 4), 'n': int(len(jj))}
print('rest', json.dumps(RES['rest']), flush=True)
json.dump(RES, open(OUT, 'w'), indent=1); print('saved', OUT)
