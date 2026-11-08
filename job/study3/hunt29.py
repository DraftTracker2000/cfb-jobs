# Pattern hunt 29 (Nov 7, 2026): retest series, part 3 — NFL team habits and referee crews, prediction first (rule 12). STUDY ONLY.
# Tagged from the two earlier seasons only, scored on the season after. nflverse play-by-play 2006–2025 + nflverse schedules (referee).
# Usage: python3 hunt29.py PBP_DIR GAMES_CSV
#  T1 turnover margin a game (top and bottom) → that season: turnover margin, and against the line
#  T2 answering a score: scoring on the drive right after the opponent scores, beyond the league's rate from the same starting spot
#  T3 the drive after a takeaway: scoring beyond the league's rate from the same spot
#  R1 referee crews: home team against the line; R2 games going over the total; R3 penalties called a game
import sys, glob, numpy as np, pandas as pd
from scipy import stats

PBP, GAMES = sys.argv[1], sys.argv[2]
cols = ['game_id', 'season', 'season_type', 'home_team', 'away_team', 'posteam', 'defteam', 'drive', 'fixed_drive_result', 'yardline_100',
        'interception', 'fumble_lost', 'result', 'spread_line', 'total', 'total_line', 'penalty', 'play_id']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team', 'posteam', 'defteam'): P[c] = P[c].replace(fix)
g = P.groupby('game_id').agg(season=('season', 'first'), home=('home_team', 'first'), away=('away_team', 'first'), result=('result', 'first'),
                             spread=('spread_line', 'first'), total=('total', 'first'), tline=('total_line', 'first'), pens=('penalty', 'sum')).dropna(subset=['result', 'spread'])
P['to'] = P.interception.fillna(0) + P.fumble_lost.fillna(0)
tog = P.groupby(['game_id', 'posteam']).to.sum()
TG = pd.concat([pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.home, 'opp': g.away, 'cover': g.result - g.spread}),
                pd.DataFrame({'gid': g.index, 'season': g.season, 'team': g.away, 'opp': g.home, 'cover': -(g.result - g.spread)})], ignore_index=True)
TG['tom'] = [tog.get((gi, o), 0) - tog.get((gi, t), 0) for gi, t, o in zip(TG.gid, TG.team, TG.opp)]
TG['covered'] = np.where(TG.cover > 0, 1.0, np.where(TG.cover < 0, 0.0, np.nan))
# drives: start spot, result, and what came just before (the other team's previous drive)
dr = P[P.drive.notna() & P.posteam.notna()].sort_values(['game_id', 'play_id']).groupby(['game_id', 'drive']).agg(
    season=('season', 'first'), team=('posteam', 'first'), start=('yardline_100', 'first'), res=('fixed_drive_result', 'first'), to=('to', 'max')).reset_index()
dr = dr.sort_values(['game_id', 'drive']); dr['prev_team'] = dr.groupby('game_id').team.shift(); dr['prev_res'] = dr.groupby('game_id').res.shift(); dr['prev_to'] = dr.groupby('game_id').to.shift()
dr['score'] = dr.res.isin(['Touchdown', 'Field goal']).astype(float); dr['sb'] = (dr.start // 10).clip(0, 9)
dr['exp'] = dr.groupby(['season', 'sb']).score.transform('mean'); dr['x'] = dr.score - dr.exp
dr['answer'] = (dr.prev_team != dr.team) & dr.prev_res.isin(['Touchdown', 'Field goal'])
dr['aftertake'] = (dr.prev_team != dr.team) & (dr.prev_to == 1)
OUT = []

def tagtest(lab, data, unit, tagcol, scorecol, pct=.15, top=True, min_n=10, rate=None):
    tagged, rest, per = [], [], []
    for s in range(2008, int(data.season.max()) + 1):
        pr = data[(data.season >= s - 2) & (data.season < s)].groupby(unit)[tagcol].agg(['mean', 'size']); v = pr['mean'][pr['size'] >= min_n]
        if len(v) < 10: continue
        cut = v.quantile(1 - pct) if top else v.quantile(pct); tg = set(v.index[v >= cut] if top else v.index[v <= cut])
        now = data[(data.season == s) & data[unit].isin(v.index)]; tagged.append(now[now[unit].isin(tg)]); rest.append(now[~now[unit].isin(tg)])
        for u, d in now[now[unit].isin(tg)].groupby(unit): per.append((u, d[scorecol].mean(), len(d)))
    A, B = pd.concat(tagged), pd.concat(rest); t, p = stats.ttest_ind(A[scorecol].dropna(), B[scorecol].dropna(), equal_var=False)
    pe = pd.DataFrame(per, columns=['u', 'v', 'n']); pe = pe[pe.n >= 4]; dif = A[scorecol].mean() - B[scorecol].mean()
    line = f'{lab} ({"top" if top else "bottom"} {int(pct * 100)}%): tagged {A[scorecol].mean():+.3f} vs others {B[scorecol].mean():+.3f} (difference {dif:+.3f}, p {p:.2g}, {len(A)} rows)'
    if rate: line += f' · {rate[1]} {A[rate[0]].mean():.1%}'
    line += f' · tagged ones above the others\' average: {int((pe.v > B[scorecol].mean()).sum())} of {len(pe)}'
    OUT.append(line); print(line, flush=True)

for pct in (.10, .15):
    tagtest('T1 turnover margin a game → that season\'s turnover margin', TG, 'team', 'tom', 'tom', pct)
    tagtest('T1 turnover margin a game → against the line', TG, 'team', 'tom', 'cover', pct, rate=('covered', 'covered'))
    tagtest('T1 turnover margin a game → against the line', TG, 'team', 'tom', 'cover', pct, top=False, rate=('covered', 'covered'))
    tagtest('T2 answering a score (scoring beyond the league rate from the same spot)', dr[dr.answer], 'team', 'x', 'x', pct)
    tagtest('T3 the drive after a takeaway', dr[dr.aftertake], 'team', 'x', 'x', pct, min_n=8)
# referees
S = pd.read_csv(GAMES, usecols=['game_id', 'referee', 'game_type']); g2 = g.join(S.set_index('game_id'), how='inner'); g2 = g2[g2.referee.notna()]
RG = pd.DataFrame({'season': g2.season, 'ref': g2.referee, 'homecover': g2.result - g2.spread, 'over': g2.total - g2.tline, 'pens': g2.pens})
RG['hc'] = np.where(RG.homecover > 0, 1.0, np.where(RG.homecover < 0, 0.0, np.nan)); RG['ov'] = np.where(RG.over > 0, 1.0, np.where(RG.over < 0, 0.0, np.nan))
for pct in (.15, .25):
    for top in (True, False):
        tagtest('R1 referee: home team against the line', RG, 'ref', 'homecover', 'homecover', pct, top, 20, ('hc', 'home covered'))
        tagtest('R2 referee: games over the total', RG, 'ref', 'over', 'over', pct, top, 20, ('ov', 'went over'))
        tagtest('R3 referee: penalties a game', RG, 'ref', 'pens', 'pens', pct, top, 20)
