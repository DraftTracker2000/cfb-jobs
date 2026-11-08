# Pattern hunt 37 (Nov 7, 2026): retest series, part 9, prediction first (rule 12). STUDY ONLY. Local files.
# Usage: python3 hunt37.py SCRATCH
#  K2 NFL head coaches who lift receivers (hunt 1): receivers new to a coach that season, PPR a game beyond their own earlier average
#  E1 bad weather at home (hunt 17: "worst place to play in bad weather — nothing clears"): a team's home margin vs the line in bad-weather
#     games (cold ≤32°F, wind 15+, rain/snow) minus its good-weather home games, from earlier seasons → its next bad-weather home games
#  F1 NBA fast starters (hunt 16: "doesn't repeat"): first-quarter shots made minus expected (his own rate for that distance and type)
import sys, glob, numpy as np, pandas as pd
from scipy import stats
S = sys.argv[1]; OUT = []
def say(s): OUT.append(s); print(s, flush=True)
def tag_score(lab, data, unit, val, min_n, prior=None, top=True, start=2010):
    seasons = sorted(data.season.unique()); tg_rows, rs_rows, kept, ntg = [], [], 0, 0
    for s in seasons:
        if s < start: continue
        pr = (prior if prior is not None else data); pr = pr[pr.season < s].groupby(unit)[val].agg(['mean', 'size']); pr = pr[pr['size'] >= min_n]
        if len(pr) < 10: continue
        tg = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)] if top else pr.index[pr['mean'] <= pr['mean'].quantile(.15)])
        now = data[(data.season == s) & data[unit].isin(pr.index)]; a = now[now[unit].isin(tg)]; tg_rows.append(a); rs_rows.append(now[~now[unit].isin(tg)])
        m = a.groupby(unit)[val].mean(); kept += int(((m > now[val].mean()) if top else (m < now[val].mean())).sum()); ntg += len(m)
    A, B = pd.concat(tg_rows), pd.concat(rs_rows); t, p = stats.ttest_ind(A[val].dropna(), B[val].dropna(), equal_var=False)
    say(f'{lab} ({"top" if top else "bottom"} 15%): {A[val].mean():+.3f} vs {B[val].mean():+.3f} others → {A[val].mean() - B[val].mean():+.3f} (p {p:.2g}, {len(A)} rows) · tagged ones that did it: {kept} of {ntg}')

# K2 coaches lifting receivers
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True); W = W[W.season_type == 'REG']
cols = ['game_id', 'home_team', 'away_team', 'home_coach', 'away_coach', 'season', 'season_type', 'temp', 'wind', 'roof', 'weather', 'result', 'spread_line']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False).drop_duplicates('game_id') for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
co = pd.concat([P[['game_id', 'home_team', 'home_coach']].rename(columns={'home_team': 'team', 'home_coach': 'coach'}), P[['game_id', 'away_team', 'away_coach']].rename(columns={'away_team': 'team', 'away_coach': 'coach'})])
co['team'] = co.team.replace(fix); W['team'] = W.team.replace(fix)
R = W[W.position.isin(['WR', 'TE', 'RB']) & (W.targets.fillna(0) >= 1)].copy(); R['ppr'] = R.receptions.fillna(0) + R.receiving_yards.fillna(0) / 10 + 6 * R.receiving_tds.fillna(0)
R = R.merge(co, on=['game_id', 'team'], how='inner')
rows = []
for s in sorted(R.season.unique())[2:]:
    pr = R[R.season < s]; base = pr.groupby('player_id').ppr.mean()
    wc = pr.groupby(['coach', 'player_id']).ppr.agg(['mean', 'size']).reset_index(); wc = wc[wc['size'] >= 6]; wc['lift'] = wc['mean'] - wc.player_id.map(base)
    lift = wc.groupby('coach').lift.agg(['mean', 'size']); lift = lift[lift['size'] >= 5]
    if len(lift) < 15: continue
    tg = set(lift.index[lift['mean'] >= lift['mean'].quantile(.85)]); seen = set(zip(pr.coach, pr.player_id))
    now = R[R.season == s]; new = now[np.array([(c, p) not in seen for c, p in zip(now.coach, now.player_id)]) & now.player_id.isin(base.index).values & now.coach.isin(lift.index).values].copy()
    new['x'] = new.ppr - new.player_id.map(base); new['tag'] = new.coach.isin(tg); rows.append(new)
N = pd.concat(rows); a, b = N[N.tag].x, N[~N.tag].x; t, p = stats.ttest_ind(a, b, equal_var=False)
m = N[N.tag].groupby(['coach', 'season']).x.agg(['mean', 'size']); m = m[m['size'] >= 6]
say(f'K2 coaches who lifted receivers (top 15%) → receivers new to them: {a.mean():+.2f} PPR a game beyond their own average vs {b.mean():+.2f} with other coaches → {a.mean() - b.mean():+.2f} (p {p:.2g}, {len(a)} receiver-games) · tagged coach-seasons above the others: {int((m["mean"] > b.mean()).sum())} of {len(m)}')

# E1 bad weather at home
P['bad'] = (((P.temp <= 32) | (P.wind >= 15)) & ~P.roof.isin(['dome', 'closed'])) | P.weather.astype(str).str.contains('rain|snow', case=False)
P = P.dropna(subset=['result', 'spread_line']); P['home'] = P.home_team.replace(fix); P['hc'] = P.result - P.spread_line
ts = P.groupby(['home', 'season', 'bad']).hc.mean().unstack('bad').dropna(); ts['edge'] = ts[True] - ts[False]
H = P[P.bad].copy()
tg_rows, rs_rows = [], []
for s in sorted(H.season.unique()):
    pr = P[P.season < s].groupby(['home', 'bad']).hc.agg(['mean', 'size']).unstack('bad')
    if ('size', True) not in pr.columns: continue
    pr = pr.dropna(); pr = pr[(pr[('size', True)] >= 8)]
    if len(pr) < 10: continue
    e = pr[('mean', True)] - pr[('mean', False)]; tg = set(e.index[e >= e.quantile(.85)]); now = H[(H.season == s) & H.home.isin(e.index)]
    tg_rows.append(now[now.home.isin(tg)]); rs_rows.append(now[~now.home.isin(tg)])
A, B = pd.concat(tg_rows), pd.concat(rs_rows); t, p = stats.ttest_ind(A.hc, B.hc, equal_var=False)
say(f'E1 best bad-weather home teams (top 15%, earlier seasons) → their next bad-weather home games: {A.hc.mean():+.2f} vs the line vs {B.hc.mean():+.2f} others → {A.hc.mean() - B.hc.mean():+.2f} (p {p:.2g}, {len(A)} games) · covered {(A.hc > 0).mean():.1%} · {", ".join(sorted(set(A.home)))}')

# F1 NBA fast starters
Sh = pd.concat([pd.read_pickle(f) for f in sorted(glob.glob(S + '/nbapbp/shots20*.pkl'))], ignore_index=True); G = Sh[~Sh.ft & Sh.dist.notna()].copy()
G['band'] = pd.cut(G.dist, [-1, 4, 10, 16, 22, 99]).astype(str) + G.three.astype(str); G['x'] = G.made.astype(float) - G.groupby(['season', 'pid', 'band']).made.transform('mean')
Q1 = G[G.per == 1].rename(columns={'pid': 'unit'})
tag_score('F1 NBA fast starters: 1st-quarter makes beyond expected', Q1, 'unit', 'x', 200, start=2021)
tag_score('F1 NBA slow starters', Q1, 'unit', 'x', 200, top=False, start=2021)
