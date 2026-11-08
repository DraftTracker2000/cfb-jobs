# Pattern hunt 41 (Nov 7, 2026 — 3:37 pm: "backtest and make sure you've tested everything under the new guise"). STUDY ONLY.
# NFL backtest of the new formula terms (docs/research/NEW-FORMULAS.md) against the closing line. Every tag from earlier seasons only.
# Terms per team-game (home minus away = the adjustment to the home side's expected margin beyond the line):
#   ats   team in the top 15% against the spread over its two earlier seasons          (draft +1.1)
#   cats  head coach in the top 15% against the spread, two earlier seasons            (draft +1.1, the larger of team/coach)
#   to    team in the top 10% in turnover margin, two earlier seasons                  (draft +1.0)
#   hpoor home team in the bottom 15% of home edge vs the line, two earlier seasons    (draft +1.2 at home)
#   newqb the team's starter is in his first 3 starts for that team                    (draft −1.35)
# Checks: (1) draft weights as written; (2) weights fitted on 2008–2017, scored 2018–2025; (3) each term alone; (4) betting record by size.
import sys, glob, numpy as np, pandas as pd
from scipy import stats
PBP = sys.argv[1]
cols = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'result', 'spread_line', 'home_coach', 'away_coach', 'posteam', 'interception', 'fumble_lost',
        'passer_player_id', 'qb_dropback']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team', 'posteam'): P[c] = P[c].replace(fix)
g = P.groupby('game_id').agg(season=('season', 'first'), week=('week', 'first'), home=('home_team', 'first'), away=('away_team', 'first'), result=('result', 'first'),
                             spread=('spread_line', 'first'), hc=('home_coach', 'first'), ac=('away_coach', 'first')).dropna(subset=['result', 'spread']).reset_index()
P['to'] = P.interception.fillna(0) + P.fumble_lost.fillna(0); tog = P.groupby(['game_id', 'posteam']).to.sum()
st = P[P.qb_dropback == 1].groupby(['game_id', 'posteam', 'passer_player_id']).size().reset_index(name='n').sort_values('n').drop_duplicates(['game_id', 'posteam'], keep='last')
T = pd.concat([pd.DataFrame({'gid': g.game_id, 'season': g.season, 'week': g.week, 'team': g.home, 'opp': g.away, 'coach': g.hc, 'home': 1, 'cover': g.result - g.spread}),
               pd.DataFrame({'gid': g.game_id, 'season': g.season, 'week': g.week, 'team': g.away, 'opp': g.home, 'coach': g.ac, 'home': 0, 'cover': -(g.result - g.spread)})], ignore_index=True)
T['tom'] = [tog.get((a, o), 0) - tog.get((a, t), 0) for a, t, o in zip(T.gid, T.team, T.opp)]
T = T.merge(st.rename(columns={'game_id': 'gid', 'posteam': 'team', 'passer_player_id': 'qb'})[['gid', 'team', 'qb']], on=['gid', 'team'], how='left').sort_values(['season', 'week'])
T['qbn'] = T.groupby(['team', 'qb']).cumcount(); T['newqb'] = (T.qbn < 3) & T.qb.notna() & (T.season > T.season.min())
def top(unit, col, s, pct, hi=True, data=None, min_n=12):
    d = (T if data is None else data); pr = d[(d.season >= s - 2) & (d.season < s)].groupby(unit)[col].agg(['mean', 'size']); v = pr['mean'][pr['size'] >= min_n]
    if len(v) < 10: return set()
    return set(v.index[v >= v.quantile(1 - pct)] if hi else v.index[v <= v.quantile(pct)])
rows = []
for s in range(2008, int(T.season.max()) + 1):
    A = top('team', 'cover', s, .15); C = top('coach', 'cover', s, .15); TO = top('team', 'tom', s, .10)
    pr = T[(T.season >= s - 2) & (T.season < s)].groupby(['team', 'home']).cover.mean().unstack(); he = (pr[1] - pr[0]).dropna(); HP = set(he.index[he <= he.quantile(.15)])
    now = T[T.season == s].copy(); now['ats'] = now.team.isin(A); now['cats'] = now.coach.isin(C); now['to'] = now.team.isin(TO); now['hpoor'] = now.team.isin(HP) & (now.home == 1)
    rows.append(now)
X = pd.concat(rows)
for c in ('ats', 'cats', 'to', 'hpoor', 'newqb'): X[c] = X[c].astype(float)
X['atsc'] = np.maximum(X.ats, X.cats)
W = {'atsc': 1.1, 'to': 1.0, 'hpoor': 1.2, 'newqb': -1.35}
X['draft'] = sum(X[k] * w for k, w in W.items())
# one row per game, home side minus away side
H = X[X.home == 1].set_index('gid'); Aw = X[X.home == 0].set_index('gid'); G2 = H[['season', 'cover']].copy()
for c in list(W) + ['draft', 'ats', 'cats']: G2[c] = H[c] - Aw[c].reindex(H.index)
G2 = G2.dropna(); OUT = []
def report(lab, adj, d):
    r, p = stats.pearsonr(adj, d.cover); line = f'{lab}: r with the home cover {r:+.3f} (p {p:.2g}, {len(d)} games)'
    for th in (0.5, 1.0, 2.0):
        m = adj.abs() >= th
        if m.sum() >= 30:
            right = (np.sign(adj[m]) == np.sign(d.cover[m])) & (d.cover[m] != 0); push = (d.cover[m] == 0)
            line += f' · edge {th}+: {right.sum() / (~push).sum():.1%} of {(~push).sum()}'
    OUT.append(line); print(line, flush=True)
report('Draft formula, all seasons', G2.draft, G2); report('Draft formula, 2018–2025 (holdout)', G2.draft[G2.season >= 2018], G2[G2.season >= 2018])
for c in W: report(f'  {c} alone, 2018–2025', G2[c][G2.season >= 2018] * W[c], G2[G2.season >= 2018])
tr = G2[G2.season < 2018]; te = G2[G2.season >= 2018]; Xtr = np.column_stack([tr[c] for c in W]); b, *_ = np.linalg.lstsq(Xtr, tr.cover, rcond=None)
fit = dict(zip(W, b)); OUT.append('Weights fitted on 2008–2017: ' + ', '.join(f'{k} {v:+.2f}' for k, v in fit.items())); print(OUT[-1])
report('Fitted formula, 2018–2025', sum(te[c] * fit[c] for c in W), te)
both = G2[(G2.ats != 0) & (G2.cats != 0)]; OUT.append(f'team and coach tags both on the same side: {int(((G2.ats * G2.cats) > 0).sum())} games of {int(((G2.ats != 0) | (G2.cats != 0)).sum())} with either')
print(OUT[-1])

# ---- close finishes (3:37–3:38 pm: "could end with the ball … would be interesting if nothing else") ----
# For each game and side: did that side have the ball in the last 2:00 of the 4th quarter (or overtime) needing 8 or fewer points to
# cover the spread? A losing pick with that is "lost, but had the ball with a chance at the end".
cl = ['game_id', 'qtr', 'game_seconds_remaining', 'posteam', 'home_team', 'away_team', 'total_home_score', 'total_away_score', 'spread_line', 'season_type']
fr = [pd.read_csv(f, usecols=cl, low_memory=False) for f in sorted(glob.glob(PBP + '/p20*.csv.gz'))]
Q = pd.concat(fr, ignore_index=True); Q = Q[(Q.season_type == 'REG') & (((Q.qtr == 4) & (Q.game_seconds_remaining <= 120)) | (Q.qtr >= 5)) & Q.posteam.notna()]
for c in ('posteam', 'home_team', 'away_team'): Q[c] = Q[c].replace(fix)
Q['home_ball'] = Q.posteam == Q.home_team
Q['need_home'] = -(Q.total_home_score - Q.total_away_score - Q.spread_line)      # points the home side still needs to cover
close_home = Q[Q.home_ball & (Q.need_home > 0) & (Q.need_home <= 8)].game_id.unique(); close_away = Q[~Q.home_ball & (-Q.need_home >= 0) & (-Q.need_home <= 8)].game_id.unique()
G2['ch'] = G2.index.isin(close_home); G2['ca'] = G2.index.isin(close_away)
for lab, d in (('all seasons', G2), ('2018–2025', G2[G2.season >= 2018])):
    m = d.draft.abs() >= 1.0; pick_home = d.draft > 0; lost = m & (np.sign(d.draft) != np.sign(d.cover)) & (d.cover != 0); won = m & (np.sign(d.draft) == np.sign(d.cover))
    near = (pick_home & d.ch) | (~pick_home & d.ca)
    line = (f'Close finishes, NFL draft picks with a 1+ point edge, {lab}: {int(won.sum())} won, {int(lost.sum())} lost — {int((lost & near).sum())} of the losses '
            f'({(lost & near).sum() / max(lost.sum(), 1):.0%}) had our side with the ball in the last 2:00 needing one score or less to cover · counting those as "right there": '
            f'{(won.sum() + (lost & near).sum()) / (won.sum() + lost.sum()):.1%}')
    OUT.append(line); print(line, flush=True)
# the same share for every side of every game (no formula), to see what's normal
lostH = (G2.cover < 0); lostA = (G2.cover > 0)
base = ((lostH & G2.ch).sum() + (lostA & G2.ca).sum()) / (lostH.sum() + lostA.sum())
OUT.append(f'Normal rate: of every spread loss for either side, {base:.0%} had that side with the ball in the last 2:00 needing one score or less'); print(OUT[-1], flush=True)
