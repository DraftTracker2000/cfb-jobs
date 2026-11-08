# Pattern hunt 46 (Nov 7, 2026): retest series, part 11 — college basketball coaches (hunt 19), prediction first (rule 12). STUDY ONLY.
# Box scores (flagged) + coaches by team-season (coaches.psv), local. Ratings = schedule-adjusted margin each season.
#  C2 coach vs coach: margin beyond the two teams' ratings in their earlier meetings (2+) → their next meeting
#  C3 "can't handle tempo": a coach's margin beyond ratings vs fast minus slow opponents (pace = shots + 0.44 FT + turnovers − offensive
#     rebounds a game), tagged worst 15% from earlier seasons → next season's games vs fast opponents
#  C5 late-season risers: margin beyond ratings in Jan–Mar minus Nov–Dec, tagged top 15% from earlier seasons → the next season's late games
import sys, os, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
S = sys.argv[1]; OUT = []
cols = ['game_id', 'season', 'season_type', 'game_date', 'team_id', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score', 'field_goals_attempted', 'free_throws_attempted', 'turnovers', 'offensive_rebounds']
B = pd.concat([pd.read_csv(f'{S}/box/mbb{y}.csv', low_memory=False, usecols=cols) for y in range(2015, 2027) if os.path.exists(f'{S}/box/mbb{y}.csv')], ignore_index=True)
B = B[B.season_type == 2]
for c in cols[7:]: B[c] = pd.to_numeric(B[c], errors='coerce')
tm = B.groupby(['game_id', 'team_id']).agg(season=('season', 'first'), date=('game_date', 'first'), opp=('opponent_team_id', 'first'), ha=('home_away', 'first'), pf=('team_score', 'first'),
       pa=('opponent_team_score', 'first'), fga=('field_goals_attempted', 'sum'), fta=('free_throws_attempted', 'sum'), tov=('turnovers', 'sum'), orb=('offensive_rebounds', 'sum')).reset_index().dropna(subset=['pf', 'pa'])
tm['poss'] = tm.fga + .44 * tm.fta + tm.tov - tm.orb; tm['margin'] = tm.pf - tm.pa; tm['home'] = np.where(tm.ha == 'home', 1.0, 0.0)
rt = {}
for s, d in tm.groupby('season'):
    t = sorted(set(d.team_id) | set(d.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(d)
    A = coo_matrix((np.r_[np.ones(n), -np.ones(n), d.home.values], (np.r_[np.arange(n), np.arange(n), np.arange(n)], np.r_[[ix[x] for x in d.team_id], [ix[x] for x in d.opp], np.full(n, len(t))])), shape=(n, len(t) + 1)).tocsr()
    x = lsqr(A, d.margin.values)[0]; rt.update({(s, k): x[i] for k, i in ix.items()}); rt[(s, '_h')] = x[-1]
tm['x'] = tm.margin - [rt.get((s, a), 0) - rt.get((s, b), 0) + (rt.get((s, '_h'), 0) if h else -rt.get((s, '_h'), 0)) for s, a, b, h in zip(tm.season, tm.team_id, tm.opp, tm.home)]
pace = tm.groupby(['season', 'team_id']).poss.mean(); tm['opace'] = [pace.get((s, o)) for s, o in zip(tm.season, tm.opp)]
tm['fast'] = tm.opace >= tm.groupby('season').opace.transform(lambda s: s.quantile(.67)); tm['slow'] = tm.opace <= tm.groupby('season').opace.transform(lambda s: s.quantile(.33))
C = pd.read_csv(S + '/coaches.psv', sep='|'); co = C.assign(g=C.w + C.l).sort_values('g').drop_duplicates(['sid', 'season'], keep='last').set_index(['sid', 'season']).nm.to_dict()
tm['coach'] = [co.get((t, s)) for t, s in zip(tm.team_id, tm.season)]; tm['ocoach'] = [co.get((t, s)) for t, s in zip(tm.opp, tm.season)]
tm['month'] = pd.to_datetime(tm.date, errors='coerce', utc=True).dt.month; tm['late'] = tm.month.isin([1, 2, 3])
# C2 coach vs coach
cc = tm.dropna(subset=['coach', 'ocoach']).sort_values('date').copy(); key = [cc.coach, cc.ocoach]
cs = cc.x.groupby(key).cumsum() - cc.x; cn = cc.x.groupby(key).cumcount(); cc['pm'] = np.where(cn > 0, cs / cn.replace(0, 1), np.nan); cc['pn'] = cn
d = cc[cc.pn >= 2].copy(); d['tag'] = d.pm >= d.groupby('season').pm.transform(lambda s: s.quantile(.85))
t, p = stats.ttest_ind(d[d.tag].x, d[~d.tag].x, equal_var=False)
OUT.append(f'C2 coach vs coach, best 15% edge in earlier meetings (2+) → next meeting: {d[d.tag].x.mean():+.2f} beyond ratings vs {d[~d.tag].x.mean():+.2f} → {d[d.tag].x.mean() - d[~d.tag].x.mean():+.2f} (p {p:.2g}, {int(d.tag.sum())} games)')
# C3 tempo, C5 late risers (by coach-season, tags from earlier seasons)
cs_ = tm.dropna(subset=['coach']).groupby(['coach', 'season']).apply(lambda g: pd.Series({'tempo': g[g.fast].x.mean() - g[g.slow].x.mean(), 'nf': g.fast.sum(), 'ns': g.slow.sum(),
       'rise': g[g.late].x.mean() - g[~g.late].x.mean(), 'nl': g.late.sum(), 'ne': (~g.late).sum()})).reset_index()
for lab, col, scol, low, filt in (('C3 can\'t handle tempo (worst 15% vs fast minus slow)', 'tempo', 'fast', True, lambda g: g.fast), ('C5 late-season risers (top 15%)', 'rise', 'late', False, lambda g: g.late)):
    a_, b_, kept, ntg = [], [], 0, 0
    for s in sorted(tm.season.unique())[2:]:
        pr = cs_[(cs_.season < s) & (cs_.season >= s - 3)].groupby('coach')[col].mean().dropna()
        if len(pr) < 30: continue
        tg = set(pr.index[pr <= pr.quantile(.15)] if low else pr.index[pr >= pr.quantile(.85)])
        now = tm[(tm.season == s) & tm.coach.isin(pr.index) & filt(tm)]; a = now[now.coach.isin(tg)]; a_.append(a.x); b_.append(now[~now.coach.isin(tg)].x)
        m = a.groupby('coach').x.mean(); kept += int(((m < 0) if low else (m > 0)).sum()); ntg += len(m)
    A, Bb = pd.concat(a_), pd.concat(b_); t, p = stats.ttest_ind(A, Bb, equal_var=False)
    OUT.append(f'{lab} → next season\'s {"games vs fast teams" if low else "Jan–Mar games"}: {A.mean():+.2f} beyond ratings vs {Bb.mean():+.2f} → {A.mean() - Bb.mean():+.2f} (p {p:.2g}, {len(A)} games) · tagged coaches on the same side again: {kept} of {ntg}')
for o in OUT: print(o, flush=True)
