# Pattern hunt 30 (Nov 7, 2026): retest series, part 4 — basketball, prediction first (rule 12). STUDY ONLY.
# sportsdataverse box scores (ESPN's, republished; flagged), NBA and men's college 2015–2026, regular season, read locally.
# Each tag from EARLIER seasons only, scored on the season after. Usage: python3 hunt30.py BOX_DIR
#  B1 player-vs-team matchups (hunt 18: "a story, not a trait"): a player's points per 36 vs one team beyond his own average and that
#     defense's usual, tagged as his toughest (bottom 15%) or best (top 15%) from earlier seasons (2+ games) → the next season's meetings
#  B2 three-point % allowed (hunt 18: "mostly luck"): a defense's opponent 3P% minus the league, tagged low/high → the next season
#  B3 close games (hunt 22, college: "mostly luck"): win share in games decided by 3 or less beyond what the teams' ratings expected,
#     tagged top/bottom → the next season's close games
import sys, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

D = sys.argv[1]; OUT = []
def say(s): OUT.append(s); print(s, flush=True)
def ratings(G):   # schedule-adjusted margin per team-season (home court in)
    out = {}
    for s, g in G.groupby('season'):
        t = sorted(set(g.team) | set(g.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(g)
        rows = np.r_[np.arange(n), np.arange(n), np.arange(n)]; cols = np.r_[[ix[x] for x in g.team], [ix[x] for x in g.opp], np.full(n, len(t))]
        vals = np.r_[np.ones(n), -np.ones(n), g.home.values]
        A = coo_matrix((vals, (rows, cols)), shape=(n, len(t) + 1)).tocsr(); x = lsqr(A, g.margin.values)[0]
        out.update({(s, k): x[i] for k, i in ix.items()}); out[(s, '_home')] = x[-1]
    return out

for lg in ('nba', 'mbb'):
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False) for y in range(2015, 2027) if __import__('os').path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[(B.season_type == 2)].copy()
    for c in ['minutes', 'points', 'three_point_field_goals_attempted', 'three_point_field_goals_made', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
    # team games
    G = B.drop_duplicates(['game_id', 'team_id'])[['game_id', 'season', 'team_id', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score']].dropna()
    G = G.rename(columns={'team_id': 'team', 'opponent_team_id': 'opp'}); G['home'] = np.where(G.home_away == 'home', 1.0, 0.0); G['margin'] = G.team_score - G.opponent_team_score
    R = ratings(G); G['exp'] = [R.get((s, t), 0) - R.get((s, o), 0) + (R.get((s, '_home'), 0) if h else -R.get((s, '_home'), 0)) for s, t, o, h in zip(G.season, G.team, G.opp, G.home)]
    sd = (G.margin - G.exp).std(); G['pw'] = stats.norm.cdf(G.exp / sd); G['win'] = (G.margin > 0).astype(float)
    say(f'== {lg.upper()}: {G.game_id.nunique()} games, {G.season.min()}–{G.season.max()}')
    # B3 close games
    C = G[G.margin.abs() <= 3].copy(); C['x'] = C.win - C.pw
    for top in (True, False):
        tg_rows, rest_rows, kept, ntg = [], [], 0, 0
        for s in sorted(C.season.unique())[1:]:
            pr = C[C.season == s - 1].groupby('team').x.agg(['mean', 'size']); pr = pr[pr['size'] >= 4]
            if len(pr) < 10: continue
            cut = pr['mean'].quantile(.85 if top else .15); tg = set(pr.index[pr['mean'] >= cut] if top else pr.index[pr['mean'] <= cut])
            now = C[(C.season == s) & C.team.isin(pr.index)]; a = now[now.team.isin(tg)]; tg_rows.append(a); rest_rows.append(now[~now.team.isin(tg)])
            m = a.groupby('team').x.mean(); kept += int(((m > 0) if top else (m < 0)).sum()); ntg += len(m)
        A_, B_ = pd.concat(tg_rows), pd.concat(rest_rows); t, p = stats.ttest_ind(A_.x, B_.x, equal_var=False)
        say(f'B3 close games, {"best" if top else "worst"} 15% last season → this season: {A_.x.mean():+.3f} wins beyond the ratings a close game vs {B_.x.mean():+.3f} others (p {p:.2g}, {len(A_)} games) · tagged teams that stayed {"above" if top else "below"} zero: {kept} of {ntg}')
    # B2 three-point % allowed
    T3 = B.groupby(['season', 'opponent_team_id']).agg(m=('three_point_field_goals_made', 'sum'), a=('three_point_field_goals_attempted', 'sum')).reset_index()
    T3['pct'] = T3.m / T3.a; T3['x'] = T3.pct - T3.groupby('season').pct.transform('mean'); T3 = T3.rename(columns={'opponent_team_id': 'team'})
    for low in (True, False):
        out, kept, ntg = [], 0, 0
        for s in sorted(T3.season.unique())[1:]:
            pr = T3[T3.season == s - 1].set_index('team').x; now = T3[T3.season == s].set_index('team').x
            cut = pr.quantile(.15 if low else .85); tg = pr.index[pr <= cut] if low else pr.index[pr >= cut]
            a = now.reindex(tg).dropna(); out.append(a); kept += int(((a < 0) if low else (a > 0)).sum()); ntg += len(a)
        a = pd.concat(out); t, p = stats.ttest_1samp(a, 0)
        say(f'B2 three-point % allowed, {"lowest" if low else "highest"} 15% last season → this season {100 * a.mean():+.2f} points of 3P% vs the league (p {p:.2g}, {len(a)} team-seasons) · stayed {"below" if low else "above"} the league: {kept} of {ntg}')
    # B1 matchups: points per 36 beyond his average and the defense's
    P = B[(B.minutes >= 10)].copy(); P['p36'] = 36 * P.points / P.minutes
    P['own'] = P.groupby(['season', 'athlete_id']).p36.transform('mean'); P['dav'] = P.groupby(['season', 'opponent_team_id']).p36.transform('mean') - P.groupby('season').p36.transform('mean')
    P['x'] = P.p36 - P.own - P.dav; P = P[P.groupby(['season', 'athlete_id']).p36.transform('size') >= 20]
    pair = P.groupby(['athlete_id', 'opponent_team_id', 'season']).x.agg(['mean', 'size']).reset_index()
    for tough in (True, False):
        res, kept, ntg = [], 0, 0
        for s in sorted(pair.season.unique())[2:]:
            w = pair[(pair.season < s) & (pair.season >= s - 3)].assign(sx=lambda d: d['mean'] * d['size']).groupby(['athlete_id', 'opponent_team_id'])[['sx', 'size']].sum()
            pr = pd.DataFrame({'m': w.sx / w['size'], 'n': w['size']})
            pr = pr[pr.n >= 2]
            if not len(pr): continue
            cut = pr.m.quantile(.15 if tough else .85); tg = pr[pr.m <= cut] if tough else pr[pr.m >= cut]
            now = pair[pair.season == s].set_index(['athlete_id', 'opponent_team_id'])['mean']; a = now.reindex(tg.index).dropna(); res.append(a)
            kept += int(((a < 0) if tough else (a > 0)).sum()); ntg += len(a)
        a = pd.concat(res); t, p = stats.ttest_1samp(a, 0)
        say(f'B1 player-vs-team, {"toughest" if tough else "best"} 15% from earlier seasons → next season\'s meetings: {a.mean():+.2f} points per 36 beyond his norm and the defense (p {p:.2g}, {len(a)} player-team pairs) · kept the same side: {kept} of {ntg} ({kept / max(ntg, 1):.0%})')
