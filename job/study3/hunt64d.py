# Hunt 64 part D (Nov 8, 2026 — the owner 10:08 am: "and you're looking at wr1, wr2, wr3 all separately and looking at effeciency and things like that
# as well as just yards?"). Prediction first (rule 12): each defense from the weeks before only (4+ games), this season's games included.
# Rank = his team's order by targets (WR, TE) or carries (RB) so far this season among the players who played that week.
# Reads compared for each rank: (a) PPR allowed to all players at the position (the list now); (b) PPR allowed to that rank; (c) that rank's
# PPR vs their own usual (adjusted); (d) efficiency allowed: yards a target, catch rate, YAC a catch (WR/TE), yards a carry (RB).
# Outcomes: his PPR vs his usual (the list's question) and his yards a target / a carry vs his usual (efficiency), lean hit toughest/easiest 15%.
import sys, glob, numpy as np, pandas as pd
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(sys.argv[1] + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
W['ppr'] = W.fantasy_points_ppr.fillna(0)
for c in ('targets', 'receptions', 'receiving_yards', 'receiving_yards_after_catch', 'carries', 'rushing_yards'): W[c] = W[c].fillna(0)
W = W[W.position.isin(['RB', 'WR', 'TE'])].sort_values(['season', 'week'])
CUR = int(W.season.max())
W['vol'] = np.where(W.position == 'RB', W.carries, W.targets)
W['cum'] = W.groupby(['player_id', 'season', 'team']).vol.cumsum() - W.vol
W['rank'] = W.groupby(['season', 'week', 'team', 'position']).cum.rank(ascending=False, method='first')
W['k'] = W.groupby(['player_id', 'season']).cumcount()
g = W.groupby(['player_id', 'season'])
W['usual'] = (g.ppr.cumsum() - W.ppr) / W.k.replace(0, np.nan); W['diff'] = W.ppr - W.usual
# his efficiency usual
W['ypt_u'] = (g.receiving_yards.cumsum() - W.receiving_yards) / (g.targets.cumsum() - W.targets).replace(0, np.nan)
W['ypc_u'] = (g.rushing_yards.cumsum() - W.rushing_yards) / (g.carries.cumsum() - W.carries).replace(0, np.nan)
W['ypt_d'] = np.where(W.targets >= 3, W.receiving_yards / W.targets.replace(0, np.nan) - W.ypt_u, np.nan)
W['ypc_d'] = np.where(W.carries >= 8, W.rushing_yards / W.carries.replace(0, np.nan) - W.ypc_u, np.nan)

def prior(df, key, cols):
    """per defense-season, the mean of each col over its earlier games (sums for ratios handled by the caller)"""
    df = df.sort_values('week'); gg = df.groupby(['season', key]); out = df[['season', 'week', key]].copy(); out['n'] = gg.cumcount()
    for c in cols: out[c] = (gg[c].cumsum() - df[c]) / out.n.replace(0, np.nan)
    return out
res = []
for pos, ranks in (('WR', [1, 2, 3]), ('TE', [1]), ('RB', [1, 2])):
    P = W[W.position == pos]
    allp = P.groupby(['season', 'week', 'opponent_team']).agg(all_ppr=('ppr', 'sum'), tg=('targets', 'sum'), rc=('receptions', 'sum'), ry=('receiving_yards', 'sum'),
                                                                 yac=('receiving_yards_after_catch', 'sum'), car=('carries', 'sum'), rush=('rushing_yards', 'sum')).reset_index()
    A = prior(allp, 'opponent_team', ['all_ppr', 'tg', 'rc', 'ry', 'yac', 'car', 'rush'])
    A['ypt'] = A.ry / A.tg; A['cr'] = A.rc / A.tg; A['yacc'] = A.yac / A.rc.replace(0, np.nan); A['ypcar'] = A.rush / A.car.replace(0, np.nan)
    for r in ranks:
        Rr = P[P['rank'] == r]
        rk = Rr.groupby(['season', 'week', 'opponent_team']).agg(rk_ppr=('ppr', 'sum'), rk_diff=('diff', 'sum')).reset_index()
        Rk = prior(rk, 'opponent_team', ['rk_ppr', 'rk_diff'])
        X = Rr[(Rr.k >= 3) & (Rr.usual >= 4)].merge(A, on=['season', 'week', 'opponent_team']).merge(Rk.drop(columns='n'), on=['season', 'week', 'opponent_team'])
        X = X[X.n >= 4]
        reads = [('all_ppr', f'PPR allowed to all {pos}s (now)'), ('rk_ppr', f'PPR allowed to {pos}{r}s'), ('rk_diff', f'{pos}{r}s vs their usual'),
                 ] + ([('ypt', 'yards a target allowed'), ('cr', 'catch rate allowed'), ('yacc', 'YAC a catch allowed')] if pos != 'RB' else [('ypcar', 'yards a carry allowed'), ('ypt', 'yards a target allowed')])
        for col, lab in reads:
            for out_, ol in (('diff', 'PPR'), ('ypt_d' if pos != 'RB' else 'ypc_d', 'efficiency')):
                Y = X.dropna(subset=[col, out_])
                if len(Y) < 200: continue
                q = Y.groupby(['season', 'week'])[col].rank(pct=True)
                lo, hi = Y[q <= .15], Y[q >= .85]
                hit = lambda a, b: np.r_[(a[out_] < 0).values, (b[out_] > 0).values].mean()
                c = Y.season == CUR; qc = q[c]; Yc = Y[c]
                hc = hit(Yc[qc <= .15], Yc[qc >= .85]) if c.sum() else np.nan; nc = int((qc <= .15).sum() + (qc >= .85).sum())
                res.append((f'{pos}{r}', ol, lab, len(Y), round(lo[out_].mean(), 2), round(hi[out_].mean(), 2), round(100 * hit(lo, hi), 1), f'{100 * hc:.1f} ({nc})'))
pd.set_option('display.width', 250)
print(pd.DataFrame(res, columns=['rank', 'outcome', 'defense read', 'player-games', 'toughest 15%', 'easiest 15%', 'lean hit % 2015–26', f'{CUR} (n)']).to_string(index=False))
