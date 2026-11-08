# Pattern hunt 27 (Nov 7, 2026): the retest series, part 1 — NFL teams and coaches against the line, prediction first (rule 12).
# Earlier hunts (2, 3, 10, 13) threw these out because they "don't repeat" year to year. Here each team/coach is tagged from its two earlier
# seasons only, then that season's games score it against the closing line; then how many of the tagged ones did it. STUDY ONLY.
# nflverse play-by-play 2006–2025, read locally. Usage: python3 hunt27.py PBP_DIR
#  N1 team against the spread (top and bottom)        N2 team home edge against the line (home cover minus road cover)
#  N3 head coach against the spread (top and bottom)  N4 team totals (overs and unders)
#  N5 closers: fourth-quarter net points in games within 8 entering the 4th (beyond what the line implies for a quarter)
#  N6 fast starters: first-quarter net points beyond a quarter of the line
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats

PBP = sys.argv[1]
cols = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'qtr', 'total_home_score', 'total_away_score', 'result', 'total',
        'spread_line', 'total_line', 'home_coach', 'away_coach']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    fr.append(pd.read_csv(f, usecols=cols, low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team'): P[c] = P[c].replace(fix)
g = P.groupby('game_id').agg(season=('season', 'first'), week=('week', 'first'), home=('home_team', 'first'), away=('away_team', 'first'),
                             result=('result', 'first'), total=('total', 'first'), spread=('spread_line', 'first'), tline=('total_line', 'first'),
                             hc=('home_coach', 'first'), ac=('away_coach', 'first')).dropna(subset=['result', 'spread'])
def at_end(q):
    d = P[P.qtr <= q].groupby('game_id')[['total_home_score', 'total_away_score']].max(); return (d.total_home_score - d.total_away_score)
g['q1'] = at_end(1); g['q3'] = at_end(3)
h = pd.DataFrame({'gid': g.index, 'season': g.season, 'week': g.week, 'team': g.home, 'coach': g.hc, 'home': 1, 'margin': g.result, 'exp': g.spread,
                  'over': g.total - g.tline, 'q1': g.q1, 'q3': g.q3})
a = pd.DataFrame({'gid': g.index, 'season': g.season, 'week': g.week, 'team': g.away, 'coach': g.ac, 'home': 0, 'margin': -g.result, 'exp': -g.spread,
                  'over': g.total - g.tline, 'q1': -g.q1, 'q3': -g.q3})
T = pd.concat([h, a], ignore_index=True)
T['cover'] = T.margin - T.exp; T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
T['overed'] = np.where(T.over > 0, 1.0, np.where(T.over < 0, 0.0, np.nan))
T['q1x'] = T.q1 - T.exp / 4; T['q4'] = T.margin - T.q3; T['q4x'] = T.q4 - T.exp / 4; T['close4'] = T.q3.abs() <= 8
print(f'hunt27: {T.gid.nunique()} NFL regular-season games with a line, {T.season.min()}–{T.season.max()}', flush=True)
OUT = []

def tagtest(lab, unit, tagcol, scorecol, rate=None, tagpool=None, scorepool=None, pct=.15, min_n=12, top=True, homeedge=False):
    tp = T if tagpool is None else tagpool; sp = T if scorepool is None else scorepool
    tagged, rest, per = [], [], []
    for s in range(2008, int(T.season.max()) + 1):
        pr = tp[(tp.season >= s - 2) & (tp.season < s)]
        if homeedge:
            m = pr.groupby([unit, 'home'])[tagcol].agg(['mean', 'size']).unstack(); v = (m[('mean', 1)] - m[('mean', 0)]); n = m[('size', 1)]
            v = v[n >= 8]
        else:
            m = pr.groupby(unit)[tagcol].agg(['mean', 'size']); v = m['mean'][m['size'] >= min_n]
        if len(v) < 10: continue
        cut = v.quantile(1 - pct) if top else v.quantile(pct); tg = set(v.index[v >= cut] if top else v.index[v <= cut])
        now = sp[sp.season == s]; tg_now = now[now[unit].isin(tg)]; tagged.append(tg_now); rest.append(now[~now[unit].isin(tg) & now[unit].isin(v.index)])
        for u, d in tg_now.groupby(unit): per.append((u, s, d[scorecol].mean(), len(d)))
    A, B = pd.concat(tagged), pd.concat(rest)
    t, p = stats.ttest_ind(A[scorecol].dropna(), B[scorecol].dropna(), equal_var=False)
    sign = 1 if top else -1; edge = sign * (A[scorecol].mean() - B[scorecol].mean())
    line = f'{lab} ({"top" if top else "bottom"} {int(pct * 100)}%): tagged {A[scorecol].mean():+.2f} vs others {B[scorecol].mean():+.2f} → edge {edge:+.2f} a game (p {p:.2g}, {len(A)} games)'
    if rate:
        r = A[rate].mean(); r = r if top else 1 - r; k = len(A[rate].dropna()); line += f' · as a bet: {r:.1%} of {k} (52.4% breaks even)'
    pe = pd.DataFrame(per, columns=['u', 's', 'v', 'n']); pe = pe[pe.n >= 4]
    good = int(((pe.v > 0) if top else (pe.v < 0)).sum())
    line += f' · tagged {unit}-seasons that did it: {good} of {len(pe)}'
    OUT.append(line); print(line, flush=True)

for pct in (.10, .15):
    tagtest('N1 team against the spread', 'team', 'cover', 'cover', 'covered', pct=pct)
    tagtest('N1 team against the spread', 'team', 'cover', 'cover', 'covered', pct=pct, top=False)
    tagtest('N2 team home edge against the line (scored on home games)', 'team', 'cover', 'cover', 'covered', scorepool=T[T.home == 1], pct=pct, homeedge=True)
    tagtest('N2 team home edge against the line (scored on home games)', 'team', 'cover', 'cover', 'covered', scorepool=T[T.home == 1], pct=pct, homeedge=True, top=False)
    tagtest('N3 head coach against the spread', 'coach', 'cover', 'cover', 'covered', pct=pct)
    tagtest('N3 head coach against the spread', 'coach', 'cover', 'cover', 'covered', pct=pct, top=False)
    tagtest('N4 team totals (games going over)', 'team', 'over', 'over', 'overed', pct=pct)
    tagtest('N4 team totals (games going over)', 'team', 'over', 'over', 'overed', pct=pct, top=False)
    tagtest('N5 closers: 4th-quarter net beyond the line, games within 8 entering the 4th', 'team', 'q4x', 'q4x', tagpool=T[T.close4], scorepool=T[T.close4], pct=pct, min_n=8)
    tagtest('N5 closers (bottom = fades late)', 'team', 'q4x', 'q4x', tagpool=T[T.close4], scorepool=T[T.close4], pct=pct, min_n=8, top=False)
    tagtest('N6 fast starters: 1st-quarter net beyond a quarter of the line', 'team', 'q1x', 'q1x', pct=pct)
    tagtest('N6 slow starters', 'team', 'q1x', 'q1x', pct=pct, top=False)
