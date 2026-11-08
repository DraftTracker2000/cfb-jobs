# Pattern hunt 28 (Nov 7, 2026): retest series, part 2 — NFL quarterback splits, prediction first (rule 12). STUDY ONLY.
# Hunt 17 called "cold-weather QB" not a trait (even/odd r −.48); here each QB is tagged from his EARLIER seasons only, then scored after.
# nflverse play-by-play 2006–2025, read locally. Usage: python3 hunt28.py PBP_DIR
#  Q1 cold-weather QBs: EPA a dropback outdoors at 40°F or colder minus his own other dropbacks (earlier seasons, 60+ cold dropbacks)
#     → his cold games after: the same split, and his team against the line in those games
#  Q2 big-game QBs: EPA a dropback vs that season's top-10 pass defenses minus his own other dropbacks → after: same, and against the line
#  Q3 clutch QBs: EPA a dropback in the 4th quarter within 8 points minus his own other dropbacks → after: same, and his team's 4th-quarter
#     net points beyond the line in games within 8 entering the 4th
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats

PBP = sys.argv[1]
cols = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'posteam', 'defteam', 'qtr', 'score_differential', 'epa', 'qb_dropback',
        'passer_player_id', 'passer_player_name', 'temp', 'roof', 'result', 'spread_line', 'total_home_score', 'total_away_score']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team', 'posteam', 'defteam'): P[c] = P[c].replace(fix)
# game table: team cover and 4th-quarter net in games within 8 entering the 4th
g = P.groupby('game_id').agg(season=('season', 'first'), home=('home_team', 'first'), away=('away_team', 'first'), result=('result', 'first'), spread=('spread_line', 'first'),
                             cold=('temp', 'first'), roof=('roof', 'first')).dropna(subset=['result', 'spread'])
q3 = P[P.qtr <= 3].groupby('game_id')[['total_home_score', 'total_away_score']].max(); g['q3'] = q3.total_home_score - q3.total_away_score
g['isCold'] = (g.cold <= 40) & ~g.roof.isin(['dome', 'closed'])
TG = pd.concat([pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.home, 'opp': g.away, 'cover': g.result - g.spread, 'q4x': (g.result - g.q3) - g.spread / 4, 'close': g.q3.abs() <= 8, 'cold': g.isCold}),
                pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.away, 'opp': g.home, 'cover': -(g.result - g.spread), 'q4x': -(g.result - g.q3) + g.spread / 4, 'close': g.q3.abs() <= 8, 'cold': g.isCold})])
TG['covered'] = np.where(TG.cover > 0, 1.0, np.where(TG.cover < 0, 0.0, np.nan))
D = P[(P.qb_dropback == 1) & P.passer_player_id.notna() & P.epa.notna()].copy()
D['cold'] = (D.temp <= 40) & ~D.roof.isin(['dome', 'closed'])
dpass = D.groupby(['season', 'defteam']).epa.mean(); D['dr'] = D.groupby('season').defteam.transform(lambda s: s.map(dpass.loc[s.name].rank()))
D['big'] = D.dr <= 10                      # top-10 pass defense that season (lowest EPA allowed)
top10 = {(s, t) for (s, t), v in dpass.items() if v <= dpass.loc[s].nsmallest(10).max()}
TG['oppbig'] = [(s, o) in top10 for s, o in zip(TG.season, TG.opp)]
D['clutch'] = (D.qtr == 4) & (D.score_differential.abs() <= 8)
# the QB who started each team-game: most dropbacks
st = D.groupby(['game_id', 'posteam', 'passer_player_id']).size().reset_index(name='n').sort_values('n').drop_duplicates(['game_id', 'posteam'], keep='last')
TG = TG.merge(st.rename(columns={'game_id': 'gid', 'posteam': 'team', 'passer_player_id': 'qb'})[['gid', 'team', 'qb']], on=['gid', 'team'], how='left')
nm = D.groupby('passer_player_id').passer_player_name.agg(lambda s: s.value_counts().index[0])
OUT = []

def split(df, flag):   # per QB-season: EPA in the spot minus EPA otherwise, and dropbacks in the spot
    a = df.groupby(['passer_player_id', 'season', flag]).epa.agg(['mean', 'size']).unstack(flag)
    return pd.DataFrame({'d': a[('mean', True)] - a[('mean', False)], 'n': a[('size', True)], 'sum_in': a[('mean', True)] * a[('size', True)],
                         'n_out': a[('size', False)], 'sum_out': a[('mean', False)] * a[('size', False)]}).dropna(subset=['n'])

def test(key, lab, flag, min_n, gamefilter, scorecol, pct=.15):
    S = split(D, flag).reset_index()
    tag_d, rest_d, tg_games, rest_games, per = [], [], [], [], []
    for s in range(2009, int(D.season.max()) + 1):
        pr = S[(S.season < s) & (S.season >= s - 4)].groupby('passer_player_id')[['n', 'sum_in', 'n_out', 'sum_out']].sum()
        pr = pr[(pr.n >= min_n) & (pr.n_out >= 300)]; pr['d'] = pr.sum_in / pr.n - pr.sum_out / pr.n_out
        if len(pr) < 15: continue
        cut = pr.d.quantile(1 - pct); tg = set(pr.index[pr.d >= cut])
        now = S[S.season == s]; now = now[now.passer_player_id.isin(pr.index)]
        tag_d.append(now[now.passer_player_id.isin(tg)]); rest_d.append(now[~now.passer_player_id.isin(tg)])
        gm = TG[(TG.season == s) & gamefilter(TG) & TG.qb.isin(pr.index)]
        tg_games.append(gm[gm.qb.isin(tg)]); rest_games.append(gm[~gm.qb.isin(tg)])
        for q, d in now[now.passer_player_id.isin(tg)].iterrows(): per.append((d.passer_player_id, s, d.d, d.n))
    A, B = pd.concat(tag_d), pd.concat(rest_d); A = A[A.n >= 15]; B = B[B.n >= 15]
    t, p = stats.ttest_ind(A.d.dropna(), B.d.dropna(), equal_var=False)
    GA, GB = pd.concat(tg_games), pd.concat(rest_games); t2, p2 = stats.ttest_ind(GA[scorecol].dropna(), GB[scorecol].dropna(), equal_var=False)
    pe = pd.DataFrame(per, columns=['q', 's', 'd', 'n']); pe = pe[pe.n >= 15]
    line = (f'{key} {lab} (top {int(pct * 100)}%): his split after being tagged {A.d.mean():+.3f} EPA a dropback vs {B.d.mean():+.3f} others (p {p:.2g}, {len(A)} QB-seasons; '
            f'{int((pe.d > 0).sum())} of {len(pe)} tagged QB-seasons kept a positive split) · his team in those games: {GA[scorecol].mean():+.2f} vs {GB[scorecol].mean():+.2f} '
            f'→ edge {GA[scorecol].mean() - GB[scorecol].mean():+.2f} (p {p2:.2g}, {len(GA)} games)')
    if scorecol == 'cover': line += f' · covered {GA.covered.mean():.1%}'
    line += ' · e.g. ' + ', '.join(sorted({nm.get(q, q) for q in pe.q})[:12])
    OUT.append(line); print(line, flush=True)

for pct in (.15, .25):
    test('Q1', 'cold-weather QBs', 'cold', 60, lambda T: T.cold, 'cover', pct)
    test('Q2', 'big-game QBs (vs top-10 pass defenses)', 'big', 250, lambda T: T.oppbig, 'cover', pct)
    test('Q3', 'clutch QBs (4th quarter within 8)', 'clutch', 80, lambda T: T.close, 'q4x', pct)
