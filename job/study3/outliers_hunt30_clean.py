# Study book (Nov 22, 2026): hunt 30's three-point-defense and close-game tests rerun with only real teams — the NBA's 30 (no All-Star or
# rookie games) and college teams with 20+ games that season (no non-Division I opponents). The first run (outliers_hunt30.py) let those in.
# Usage: python3 outliers_hunt30_clean.py BOX_DIR OUT.json
import sys, os, json, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
D = sys.argv[1]; KEEP = {}
def ratings(G):
    out = {}
    for s, g in G.groupby('season'):
        t = sorted(set(g.team) | set(g.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(g)
        A = coo_matrix((np.r_[np.ones(n), -np.ones(n), g.home.values], (np.r_[np.arange(n), np.arange(n), np.arange(n)], np.r_[[ix[x] for x in g.team], [ix[x] for x in g.opp], np.full(n, len(t))])), shape=(n, len(t) + 1)).tocsr()
        x = lsqr(A, g.margin.values)[0]; out.update({(s, k): x[i] for k, i in ix.items()}); out[(s, '_home')] = x[-1]
    return out
for lg, mg in (('nba', 60), ('mbb', 20)):
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2].copy()
    for c in ['three_point_field_goals_attempted', 'three_point_field_goals_made', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
    TN = B.groupby('team_id').team_location.last().to_dict()
    G = B.drop_duplicates(['game_id', 'team_id'])[['game_id', 'season', 'team_id', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score']].dropna()
    cnt = G.groupby(['season', 'team_id']).size(); real = set(cnt[cnt >= mg].index)
    G = G[[(s, t) in real and (s, o) in real for s, t, o in zip(G.season, G.team_id, G.opponent_team_id)]]
    B = B[[(s, t) in real and (s, o) in real for s, t, o in zip(B.season, B.team_id, B.opponent_team_id)]]
    G = G.rename(columns={'team_id': 'team', 'opponent_team_id': 'opp'}); G['home'] = np.where(G.home_away == 'home', 1.0, 0.0); G['margin'] = G.team_score - G.opponent_team_score
    R = ratings(G); G['exp'] = [R.get((s, t), 0) - R.get((s, o), 0) + (R.get((s, '_home'), 0) if h else -R.get((s, '_home'), 0)) for s, t, o, h in zip(G.season, G.team, G.opp, G.home)]
    sd = (G.margin - G.exp).std(); G['pw'] = stats.norm.cdf(G.exp / sd); G['win'] = (G.margin > 0).astype(float)
    C = G[G.margin.abs() <= 3].copy(); C['x'] = C.win - C.pw
    for top in (True, False):
        A_, B_, per, kept = [], [], [], 0
        for s in sorted(C.season.unique())[1:]:
            pr = C[C.season == s - 1].groupby('team').x.agg(['mean', 'size']); pr = pr[pr['size'] >= 4]
            cut = pr['mean'].quantile(.85 if top else .15); tg = set(pr.index[pr['mean'] >= cut] if top else pr.index[pr['mean'] <= cut])
            now = C[(C.season == s) & C.team.isin(pr.index)]; a = now[now.team.isin(tg)]; A_.append(a); B_.append(now[~now.team.isin(tg)])
            last = C[C.season == s - 1].groupby('team').win.agg(['sum', 'size']); cur = a.groupby('team').agg(w=('win', 'sum'), n=('win', 'size'), x=('x', 'mean'))
            for u, r in cur.iterrows():
                kept += int(r.x > 0 if top else r.x < 0); per.append((TN.get(u, u), int(s), f"{int(last.loc[u, 'sum'])}–{int(last.loc[u, 'size'] - last.loc[u, 'sum'])}", f"{int(r.w)}–{int(r.n - r.w)}", round(float(r.x), 3), int(r.n)))
        A_, B_ = pd.concat(A_), pd.concat(B_); t, p = stats.ttest_ind(A_.x, B_.x, equal_var=False); per = [x for x in per if x[5] >= 4]
        pe = sorted(per, key=lambda x: -x[4] if top else x[4])
        KEEP[f'{lg}|close|{"best" if top else "worst"}'] = {'tagged': round(float(A_.x.mean()), 3), 'others': round(float(B_.x.mean()), 3), 'p': round(float(p), 4), 'games': int(len(A_)), 'kept': kept, 'of': len(set((x[0], x[1]) for x in per)) if False else None, 'kept_it': pe[:4], 'flipped': pe[::-1][:4]}
        print(lg, 'close', 'best' if top else 'worst', KEEP[f'{lg}|close|{"best" if top else "worst"}'], flush=True)
    T3 = B.groupby(['season', 'opponent_team_id']).agg(m=('three_point_field_goals_made', 'sum'), a=('three_point_field_goals_attempted', 'sum')).reset_index()
    T3['pct'] = T3.m / T3.a; T3['x'] = T3.pct - T3.groupby('season').pct.transform('mean'); T3 = T3.rename(columns={'opponent_team_id': 'team'})
    for low in (True, False):
        out, per = [], []
        for s in sorted(T3.season.unique())[1:]:
            pr = T3[T3.season == s - 1].set_index('team').x; now = T3[T3.season == s].set_index('team').x
            cut = pr.quantile(.15 if low else .85); tg = pr.index[pr <= cut] if low else pr.index[pr >= cut]
            a = now.reindex(tg).dropna(); out.append(a); per += [(TN.get(u, u), int(s), round(100 * float(pr[u]), 1), round(100 * float(v), 1)) for u, v in a.items()]
        a = pd.concat(out); t, p = stats.ttest_1samp(a, 0); did = int(((a < 0) if low else (a > 0)).sum())
        pe = sorted(per, key=lambda x: x[3] if low else -x[3])
        KEEP[f'{lg}|3p|{"low" if low else "high"}'] = {'mean': round(100 * float(a.mean()), 2), 'p': round(float(p), 4), 'did': did, 'of': int(len(a)), 'kept_it': pe[:4], 'flipped': pe[::-1][:4],
            'most': pd.Series([x[0] for x in per if (x[3] < 0 if low else x[3] > 0)]).value_counts().head(5).to_dict()}
        print(lg, '3p', 'low' if low else 'high', KEEP[f'{lg}|3p|{"low" if low else "high"}'], flush=True)
json.dump(KEEP, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
