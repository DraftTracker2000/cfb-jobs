# Pattern hunt 45 (Nov 7, 2026): retest series, part 10 — the NFL leftovers from hunts 2, 8 and 9, prediction first (rule 12). STUDY ONLY.
# Teams and coaches tagged from their two earlier seasons only, scored on the season after. nflverse play-by-play, local.
#  S2 coaches' second-half swing: 2nd-half net points minus 1st-half net points (hunt 2: r .06/.04)
#  S3 comeback skill: wins when trailing entering the 4th, beyond the win-probability model at that moment (hunt 2: r .05; hunt 8 "barely")
#  S4 fourth-down conversion over expected: conversions minus the league rate at the same yards to go (hunt 2: r .14)
#  S5 the opening script: first-drive EPA a play minus the rest of the game (hunt 9: not a trait)
#  Each also against the line in the next season's games.
import sys, glob, numpy as np, pandas as pd
from scipy import stats
PBP = sys.argv[1]
cols = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'posteam', 'defteam', 'qtr', 'drive', 'epa', 'play_type', 'down', 'ydstogo',
        'fourth_down_converted', 'fourth_down_failed', 'total_home_score', 'total_away_score', 'result', 'spread_line', 'home_coach', 'away_coach', 'home_wp', 'game_seconds_remaining']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team', 'posteam', 'defteam'): P[c] = P[c].replace(fix)
g = P.groupby('game_id').agg(season=('season', 'first'), home=('home_team', 'first'), away=('away_team', 'first'), result=('result', 'first'), spread=('spread_line', 'first'),
                             hc=('home_coach', 'first'), ac=('away_coach', 'first')).dropna(subset=['result', 'spread'])
h2 = P[P.qtr <= 2].groupby('game_id')[['total_home_score', 'total_away_score']].max(); g['h1'] = h2.total_home_score - h2.total_away_score
q3 = P[P.qtr <= 3].groupby('game_id')[['total_home_score', 'total_away_score']].max(); g['q3'] = q3.total_home_score - q3.total_away_score
wp4 = P[P.qtr == 4].groupby('game_id').home_wp.first(); g['wp4'] = wp4
T = pd.concat([pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.home, 'coach': g.hc, 'cover': g.result - g.spread, 'swing': (g.result - g.h1) - g.h1,
                             'trail4': g.q3 < 0, 'win': (g.result > 0).astype(float), 'wp': g.wp4}),
               pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.away, 'coach': g.ac, 'cover': -(g.result - g.spread), 'swing': (-(g.result) + g.h1) + g.h1,
                             'trail4': g.q3 > 0, 'win': (g.result < 0).astype(float), 'wp': 1 - g.wp4})], ignore_index=True)
T['comeback'] = np.where(T.trail4, T.win - T.wp, np.nan)
fd = P[(P.down == 4) & P.play_type.isin(['run', 'pass'])].copy(); fd['conv'] = fd.fourth_down_converted.fillna(0); fd['yb'] = fd.ydstogo.clip(upper=10)
fd['x'] = fd.conv - fd.groupby(['season', 'yb']).conv.transform('mean'); f4 = fd.groupby(['game_id', 'posteam']).x.sum()
T['fdx'] = [f4.get((a, t), np.nan) for a, t in zip(T.gid, T.team)]
plays = P[P.play_type.isin(['run', 'pass']) & P.epa.notna()]
first = plays.groupby(['game_id', 'posteam']).drive.transform('min') == plays.drive
sc = plays.assign(first=first).groupby(['game_id', 'posteam', 'first']).epa.mean().unstack()
T['script'] = [sc.loc[(a, t), True] - sc.loc[(a, t), False] if (a, t) in sc.index else np.nan for a, t in zip(T.gid, T.team)]
OUT = []
def test(lab, unit, col, min_n=12):
    tg_rows, rs_rows, kept, ntg = [], [], 0, 0
    for s in range(2008, int(T.season.max()) + 1):
        pr = T[(T.season >= s - 2) & (T.season < s)].groupby(unit)[col].agg(['mean', 'count']); v = pr['mean'][pr['count'] >= min_n]
        if len(v) < 10: continue
        tg = set(v.index[v >= v.quantile(.85)]); now = T[(T.season == s) & T[unit].isin(v.index)]; a = now[now[unit].isin(tg)]
        tg_rows.append(a); rs_rows.append(now[~now[unit].isin(tg)]); m = a.groupby(unit)[col].mean(); kept += int((m > now[col].mean()).sum()); ntg += len(m)
    A, B = pd.concat(tg_rows), pd.concat(rs_rows); a1, b1 = A[col].dropna(), B[col].dropna(); t, p = stats.ttest_ind(a1, b1, equal_var=False); t2, p2 = stats.ttest_ind(A.cover, B.cover, equal_var=False)
    line = (f'{lab} (top 15%): next season {a1.mean():+.3f} vs {b1.mean():+.3f} others → {a1.mean() - b1.mean():+.3f} (p {p:.2g}) · tagged ones above the others: {kept} of {ntg} · '
            f'against the line {A.cover.mean() - B.cover.mean():+.2f} a game (p {p2:.2g})')
    OUT.append(line); print(line, flush=True)
test('S2 coaches\' second-half swing (2nd-half net minus 1st-half net)', 'coach', 'swing')
test('S3 comeback skill (wins when trailing entering the 4th, beyond win probability)', 'team', 'comeback', 5)
test('S3 comeback skill, by coach', 'coach', 'comeback', 5)
test('S4 fourth-down conversions over expected (a game)', 'team', 'fdx')
test('S5 opening script (first-drive EPA a play minus the rest)', 'team', 'script')
test('S5 opening script, by coach', 'coach', 'script')
