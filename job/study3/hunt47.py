# Pattern hunt 47 (Nov 7, 2026): backtest of the basketball pick terms (PLAN-NOV7.md), prediction first. STUDY ONLY. Box scores (flagged).
# No betting lines in the box scores, so the baseline is the schedule-adjusted ratings (+ home court), fitted on the season BEFORE (no leak)
# and on the season so far (games before this one, refit monthly). Terms, all tagged from earlier games/seasons only:
#   short  NBA: team that fell apart without a top-3 player last season, with one sitting tonight (−0.8)
#   h2h    college: coach who has been beating this opposing coach beyond ratings (best 15%, 2+ meetings) (−0.6, a fade)
# Measures: margin error (RMSE) and winner picked, baseline vs baseline + terms, on the games where a term fires and on all games.
import sys, os, numpy as np, pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
S = sys.argv[1]
def fit(d):
    t = sorted(set(d.team) | set(d.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(d)
    A = coo_matrix((np.r_[np.ones(n), -np.ones(n), d.home.values], (np.r_[np.arange(n), np.arange(n), np.arange(n)], np.r_[[ix[x] for x in d.team], [ix[x] for x in d.opp], np.full(n, len(t))])), shape=(n, len(t) + 1)).tocsr()
    x = lsqr(A, d.margin.values, damp=.3)[0]; return {k: x[i] for k, i in ix.items()}, x[-1]
for lg in ('nba', 'mbb'):
    cols = ['game_id', 'season', 'season_type', 'game_date', 'team_id', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score', 'athlete_id', 'minutes']
    B = pd.concat([pd.read_csv(f'{S}/box/{lg}{y}.csv', low_memory=False, usecols=cols) for y in range(2015, 2027) if os.path.exists(f'{S}/box/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2].copy(); B['minutes'] = pd.to_numeric(B.minutes, errors='coerce').fillna(0)
    G = B.drop_duplicates(['game_id', 'team_id']).rename(columns={'team_id': 'team', 'opponent_team_id': 'opp'}).dropna(subset=['team_score', 'opponent_team_score'])
    G['home'] = np.where(G.home_away == 'home', 1.0, 0.0); G['margin'] = G.team_score - G.opponent_team_score; G['date'] = pd.to_datetime(G.game_date, utc=True, errors='coerce')
    G['mon'] = G.date.dt.to_period('M').astype(str); G = G.sort_values('date')
    # ratings from games BEFORE this month, same season (first month: last season's)
    G['exp'] = np.nan; prev = None
    for s, d in G.groupby('season'):
        for m in sorted(d.mon.unique()):
            past = d[d.mon < m]
            if len(past) > (300 if lg == 'nba' else 1500): r, h = fit(past)
            elif prev is not None: r, h = prev
            else: continue
            idx = d.index[d.mon == m]; G.loc[idx, 'exp'] = [r.get(t, 0) - r.get(o, 0) + (h if hm else -h) for t, o, hm in zip(G.loc[idx, 'team'], G.loc[idx, 'opp'], G.loc[idx, 'home'])]
        prev = fit(d)
    G = G.dropna(subset=['exp']); G['term'] = 0.0
    if lg == 'nba':
        reg = B[B.minutes > 0].groupby(['season', 'team_id', 'athlete_id']).agg(mpg=('minutes', 'mean'), gp=('minutes', 'size')).reset_index(); reg = reg[(reg.mpg >= 20) & (reg.gp >= 20)]
        top3 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(3).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
        on = B[B.minutes > 0].groupby(['game_id', 'team_id']).athlete_id.apply(set)
        G['short'] = [bool(top3.get((s, t))) and not top3[(s, t)] <= on.get((g, t), set()) for g, s, t in zip(G.game_id, G.season, G.team)]
        G['x'] = G.margin - G.exp
        tsd = G.groupby(['team', 'season', 'short']).x.mean().unstack('short').dropna(); drop = (tsd[True] - tsd[False])
        tag = set()
        for s in G.season.unique():
            d = drop[drop.index.get_level_values(1) == s - 1]
            if len(d) >= 10: tag |= {(t, s) for t in d.index.get_level_values(0)[d.values <= np.quantile(d.values, .15)]}
        G['fires'] = [sh and (t, s) in tag for t, s, sh in zip(G.team, G.season, G.short)]
        G.loc[G.fires, 'term'] = -0.8
    else:
        C = pd.read_csv(S + '/coaches.psv', sep='|'); co = C.assign(g=C.w + C.l).sort_values('g').drop_duplicates(['sid', 'season'], keep='last').set_index(['sid', 'season']).nm.to_dict()
        G['coach'] = [co.get((t, s)) for t, s in zip(G.team, G.season)]; G['ocoach'] = [co.get((t, s)) for t, s in zip(G.opp, G.season)]
        G['x'] = G.margin - G.exp; cc = G.dropna(subset=['coach', 'ocoach']); key = [cc.coach, cc.ocoach]
        cs = cc.x.groupby(key).cumsum() - cc.x; cn = cc.x.groupby(key).cumcount(); pm = pd.Series(np.where(cn >= 2, cs / cn.replace(0, 1), np.nan), index=cc.index)
        cut = pm.groupby(cc.season).transform(lambda s: s.quantile(.85)); G['fires'] = False; G.loc[cc.index, 'fires'] = (pm >= cut) & pm.notna()
        G.loc[G.fires, 'term'] = -0.6
    for lab, d in (('games where a term fires', G[G.fires]), ('all games', G)):
        e0 = np.sqrt(((d.margin - d.exp) ** 2).mean()); e1 = np.sqrt(((d.margin - d.exp - d.term) ** 2).mean())
        w0 = ((np.sign(d.exp) == np.sign(d.margin)) & (d.margin != 0)).mean(); w1 = ((np.sign(d.exp + d.term) == np.sign(d.margin)) & (d.margin != 0)).mean()
        print(f'{lg.upper()} {lab} ({len(d)} team-games): margin error {e0:.3f} → {e1:.3f} ({100 * (e0 - e1) / e0:+.2f}%) · winner right {w0:.1%} → {w1:.1%} · beyond the ratings {(d.margin - d.exp).mean():+.2f}', flush=True)
