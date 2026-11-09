# Survivor retest (Nov 8, 2026 — the owner, 9:51 pm: "a mix of our survivor picks for the week. it was either our top 3 or top 5"). STUDY ONLY.
# NFL regular seasons 2010–2026 (nflverse schedules: scores, moneylines). Three ways to rate each game before kickoff:
#   Vegas  the moneylines' implied win chance (vig removed)
#   ours   a points-margin rating fitted on earlier games only (this season so far, last season's ratings at 0.6 carried in, home field)
#   mix    the average of the two
# Survivor: each week take the most likely winner not used yet that season; the run ends at the first loss (a tie ends it). Also each week's
# top 3 and top 5: how often all of them won, and how many of them won.
import sys, numpy as np, pandas as pd
from scipy.stats import norm
G = pd.read_csv(sys.argv[1]); G = G[(G.game_type == 'REG') & (G.season >= 2009)].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team'): G[c] = G[c].replace(fix)
def ml(x): return np.where(x < 0, -x / (-x + 100), 100 / (x + 100))
ph, pa = ml(G.home_moneyline.astype(float)), ml(G.away_moneyline.astype(float)); G['v_home'] = ph / (ph + pa)
def fit(d, prior, hfa=1.8):
    T = sorted(set(d.home_team) | set(d.away_team) | set(prior)); ix = {t: i for i, t in enumerate(T)}
    A = np.zeros((len(d) + len(T), len(T))); y = np.zeros(len(d) + len(T))
    for k, (h, a, m) in enumerate(zip(d.home_team, d.away_team, d.result)): A[k, ix[h]] = 1; A[k, ix[a]] = -1; y[k] = m - hfa
    for t in T: k = len(d) + ix[t]; A[k, ix[t]] = 1.5; y[k] = 1.5 * prior.get(t, 0) * .6   # last season's rating, shrunk, as 1.5 games' weight
    return dict(zip(T, np.linalg.lstsq(A, y, rcond=None)[0]))
rows = []; prior = {}
for s in range(2009, int(G.season.max()) + 1):
    S = G[G.season == s].sort_values('week')
    for w in sorted(S.week.unique()):
        R = fit(S[(S.week < w) & S.result.notna()], prior) if s > 2009 or w > 1 else {}
        for g in S[S.week == w].itertuples():
            e = R.get(g.home_team, 0) - R.get(g.away_team, 0) + 1.8
            rows.append((s, w, g.home_team, g.away_team, g.result, g.v_home, norm.cdf(e / 13.5)))
    prior = fit(S[S.result.notna()], prior)
X = pd.DataFrame(rows, columns=['season', 'week', 'home', 'away', 'result', 'v', 'o']); X = X[X.season >= 2010]
X['m'] = (X.v + X.o) / 2
T = pd.concat([X.assign(team=X.home, won=np.sign(X.result), **{k: X[k] for k in ('v', 'o', 'm')}),
               X.assign(team=X.away, won=-np.sign(X.result), v=1 - X.v, o=1 - X.o, m=1 - X.m)])
T = T[T.result.notna()]
out = []
for k, lab in (('v', 'Vegas'), ('o', 'ours'), ('m', 'mix (ours + Vegas)')):
    lasted = []; t3 = []; t5 = []; n3 = []; n5 = []
    for s, d in T.groupby('season'):
        used = set(); run = None
        for w in sorted(d.week.unique()):
            c = d[(d.week == w)].dropna(subset=[k]).sort_values(k, ascending=False)
            top = c.head(5); t3.append((top.head(3).won > 0).all()); t5.append((top.won > 0).all()); n3.append((top.head(3).won > 0).sum()); n5.append((top.won > 0).sum())
            if run is None:
                p = c[~c.team.isin(used)].head(1)
                if not len(p): continue
                used.add(p.team.iat[0])
                if p.won.iat[0] <= 0: run = w - 1
        lasted.append(run if run is not None else int(d.week.max()))
    L = pd.Series(lasted)
    out.append(f'{lab}: survivor lasted {L.mean():.1f} weeks on average (median {L.median():.0f}; 5+ weeks in {(L >= 5).mean():.0%} of {len(L)} seasons) · top 3 all won {np.mean(t3):.0%} of weeks ({np.mean(n3):.2f} of 3) · top 5 all won {np.mean(t5):.0%} ({np.mean(n5):.2f} of 5)')
cur = T[T.season == T.season.max()]
for o in out: print(o)
print(f'season {int(T.season.max())} so far: ' + ' · '.join(f'{lab} top 5 won {(cur.sort_values(k, ascending=False).groupby("week").head(5).won > 0).mean():.0%}' for k, lab in (('v', 'Vegas'), ('o', 'ours'), ('m', 'mix'))))
