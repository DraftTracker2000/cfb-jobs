# Pattern hunt 20 (Nov 7, 2026, ~2 am): the next five from "Next ideas — Nov 7" (hunts 2, 3, 5, 6, 8). STUDY ONLY.
#  R1 receiver killers: NFL defenses that hold the other team's WR1 under his norm (share of his team's receiving yards) — does it repeat?
#  R2 run-heavy offense vs a defense that stops the run: margin vs the closing line, the interaction (the line already holds both ratings)
#  R3 NRG Stadium by surface year: Houston's new-injury rate on grass years vs turf years (weekly injury reports)
#  R4 altitude: NBA road team on the second night of a back-to-back in Denver or Utah vs elsewhere (schedule-adjusted ratings)
#  R5 hunt 18's college style clash, re-run on schedule-adjusted ratings
# Data: nflverse weekly stats + pbp + injury reports; sportsdataverse box scores (flagged). Read locally.
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q
W, PBP, INJ, BOX = sys.argv[1:5]; R = []
def rec(key, lab, est, p, n, extra=''):
    R.append((key, lab, est, p, n, extra)); print(f'[{key}] {lab}: {est:+.4f} (p {p:.3g}, n {n}) {extra}', flush=True)
def yoy(s, lab, key):
    a = s.copy(); b = s.copy(); b.index = pd.MultiIndex.from_arrays([b.index.get_level_values(0), b.index.get_level_values(1) - 1])
    j = pd.concat([a, b], axis=1, keys=['now', 'next']).dropna(); r, p = stats.pearsonr(j.now, j.next)
    h = j[j.index.get_level_values(1) >= 2021]; rh, ph = stats.pearsonr(h.now, h.next) if len(h) > 20 else (np.nan, np.nan)
    rec(key, lab, r, p, len(j), f'holdout (2022 on) r {rh:.3f} p {ph:.3g}'); return j

# ---- R1 receiver killers
wk = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(W + '/w20*.csv'))], ignore_index=True)
wk = wk[(wk.season_type == 'REG') & (wk.position == 'WR')]
tm = wk.groupby(['season', 'week', 'team']).receiving_yards.sum().rename('tyd'); wk = wk.join(tm, on=['season', 'week', 'team'])
wk['share'] = wk.receiving_yards / wk.tyd.replace(0, np.nan)
top = wk.groupby(['season', 'team', 'player_id']).targets.sum().reset_index().sort_values('targets').drop_duplicates(['season', 'team'], keep='last')
w1 = wk.merge(top[['season', 'team', 'player_id']], on=['season', 'team', 'player_id'])
g_ = w1.groupby(['season', 'player_id']); w1['n'] = g_.share.transform('count'); w1['sum'] = g_.share.transform('sum')
w1['norm'] = (w1['sum'] - w1.share) / (w1.n - 1); w1 = w1[w1.n >= 8]; w1['res'] = w1.share - w1.norm
d1 = w1.groupby(['opponent_team', 'season']).res.mean()
yoy(d1, 'R1 receiver killers: a defense holding WR1s under their share of team receiving yards, year to year', 'R1')
last = d1.xs(2025, level=1, drop_level=True).sort_values() if 2025 in d1.index.get_level_values(1) else None
if last is not None: print('  2025 WR1 killers (share beyond norm):', last.head(5).round(3).to_dict(), ' friendliest:', last.tail(5).round(3).to_dict())
# yards version controlling the defense's total pass yards: WR1 share already does that

# ---- R2 run clash
cols = ['game_id', 'season', 'season_type', 'posteam', 'defteam', 'home_team', 'away_team', 'play_type', 'epa', 'result', 'spread_line', 'pass', 'rush']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2010: continue
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[(P.season_type == 'REG') & P.play_type.isin(['run', 'pass'])]
off = P.groupby(['posteam', 'season']).agg(rr=('rush', 'mean')); dfn = P[P.rush == 1].groupby(['defteam', 'season']).epa.mean().rename('drep')
gm = P.drop_duplicates('game_id')[['game_id', 'season', 'home_team', 'away_team', 'result', 'spread_line']].dropna()
gm = gm.join(off.rename(columns={'rr': 'hrr'}), on=['home_team', 'season']).join(off.rename(columns={'rr': 'arr'}), on=['away_team', 'season'])
gm = gm.join(dfn.rename('hdrep'), on=['home_team', 'season']).join(dfn.rename('adrep'), on=['away_team', 'season']).dropna()
gm['cov'] = gm.result - gm.spread_line
z = lambda s: (s - s.mean()) / s.std()
x = z(gm.hrr) * (-z(gm.adrep)) - z(gm.arr) * (-z(gm.hdrep))   # home run-heavy into a good away run D, minus the reverse
r, p = stats.pearsonr(x, gm['cov']); b = np.polyfit(x, gm['cov'], 1)[0]
rec('R2', 'R2 run-heavy offense into a run-stopping defense: home margin vs the line per unit of clash (pts)', b, p, len(gm), f'r {r:.3f}')

# ---- R3 NRG by surface year (weekly reports, the same new-injury rule as hunt 17 part 2)
gc = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'surface', 'game_stadium']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2009: continue
    fr.append(pd.read_csv(f, usecols=gc, low_memory=False).drop_duplicates('game_id'))
g = pd.concat(fr, ignore_index=True); g = g[g.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
TG = pd.concat([g.assign(team=g.home_team, home=1), g.assign(team=g.away_team, home=0)], ignore_index=True); TG['tk'] = TG.team.replace(fix)
I = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(INJ + '/injuries_*.csv'))], ignore_index=True); I = I[I.game_type == 'REG']; I['tk'] = I.team.replace(fix)
inj = I.report_primary_injury.fillna(I.practice_primary_injury).fillna('').astype(str)
I['hurt'] = ~inj.str.lower().str.contains(r'not injury|rest|^$|personal|illness|resting|non-football|nir', regex=True)
rep = I.groupby(['season', 'tk', 'week']).gsis_id.apply(set).to_dict(); hurt = I[I.hurt].groupby(['season', 'tk', 'week']).gsis_id.apply(set).to_dict(); weeks = I.groupby(['season', 'tk']).week.apply(lambda s: sorted(set(s))).to_dict()
nw = []
for r_ in TG.itertuples():
    Wk = weeks.get((r_.season, r_.tk)); nx = [w for w in (Wk or []) if r_.week < w <= r_.week + 2]
    if not nx: nw.append(np.nan); continue
    nw.append(len(hurt.get((r_.season, r_.tk, nx[0]), set()) - (rep.get((r_.season, r_.tk, r_.week), set()) | rep.get((r_.season, r_.tk, r_.week - 1), set()))))
TG['new'] = nw; TG = TG[TG.new.notna()]; TG['exp'] = TG.season.map(TG.groupby('season').new.mean())
h = TG[TG.game_stadium.astype(str).str.contains('NRG|Reliant', na=False)].copy(); h['surface'] = h.surface.astype(str).str.strip().str.lower()
print('  NRG games by season and surface:'); print(h.drop_duplicates('game_id').groupby(['season', 'surface']).size().unstack(fill_value=0).to_string())
by = h.groupby('surface').agg(n=('game_id', 'nunique'), new=('new', 'sum'), exp=('exp', 'sum')); by['rr'] = by.new / by.exp; print(by.round(3).to_string())
vis = h[h.home == 0].groupby('surface').agg(n=('game_id', 'nunique'), new=('new', 'sum'), exp=('exp', 'sum')); vis['rr'] = vis.new / vis.exp; print('  visitors only:'); print(vis.round(3).to_string())
hh = TG[(TG.tk == 'HOU') & (TG.home == 0)]; print(f'  Houston on the road: rate {hh.new.sum() / hh.exp.sum():.3f} ({len(hh)} games) — the Texans\' own reporting level')

# ---- basketball: schedule-adjusted ratings (SRS per season)
def teams_from_box(lg):
    B = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(f'{BOX}/{lg}20*.csv'))], ignore_index=True)
    B = B[(B.season_type == 2) & (B.did_not_play != True)]
    for c in ['field_goals_attempted', 'three_point_field_goals_attempted', 'free_throws_attempted', 'offensive_rebounds', 'turnovers', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
    T = B.groupby(['game_id', 'season', 'game_date', 'team_id', 'team_abbreviation', 'opponent_team_id']).agg(fga=('field_goals_attempted', 'sum'), tpa=('three_point_field_goals_attempted', 'sum'), fta=('free_throws_attempted', 'sum'),
        orb=('offensive_rebounds', 'sum'), tov=('turnovers', 'sum'), pts=('team_score', 'first'), opp=('opponent_team_score', 'first'), ha=('home_away', 'first')).reset_index()
    T['poss'] = T.fga + 0.44 * T.fta - T.orb + T.tov
    O = T[['game_id', 'team_id', 'poss', 'tpa', 'fga']].rename(columns={'team_id': 'opponent_team_id', 'poss': 'oposs', 'tpa': 'otpa', 'fga': 'ofga'})
    T = T.merge(O, on=['game_id', 'opponent_team_id']); T = T[(T.fga > 30) & (T.ofga > 30)].copy(); T['gp'] = (T.poss + T.oposs) / 2
    T['m100'] = 100 * (T.pts - T.opp) / T.gp; T['home'] = np.where(T.ha == 'home', 1.0, -1.0); return T
def srs(T):
    out = []
    for y, d in T.groupby('season'):
        ids = pd.Index(sorted(set(d.team_id) | set(d.opponent_team_id))); i = np.arange(len(d))
        M = coo_matrix((np.r_[np.ones(len(d)), -np.ones(len(d)), d.home.values], (np.r_[i, i, i], np.r_[ids.get_indexer(d.team_id), ids.get_indexer(d.opponent_team_id), np.full(len(d), len(ids))])), shape=(len(d), len(ids) + 1)).tocsr()
        sol = lsqr(M, d.m100.values, damp=0.05)[0]; out.append(pd.DataFrame({'team_id': ids, 'season': y, 'srs': sol[:-1]}))
    return pd.concat(out)
# R4 altitude back-to-back (NBA)
T = teams_from_box('nba'); S = srs(T); T = T.merge(S, on=['team_id', 'season']).merge(S.rename(columns={'team_id': 'opponent_team_id', 'srs': 'osrs'}), on=['opponent_team_id', 'season'])
T['dt'] = pd.to_datetime(T.game_date); T = T.sort_values(['team_id', 'dt']); T['b2b'] = (T.groupby('team_id').dt.diff().dt.days == 1)
X = np.column_stack([np.ones(len(T)), T.srs - T.osrs, T.home]); b, *_ = np.linalg.lstsq(X, T.m100, rcond=None); T['res'] = T.m100 - X @ b
ab = T[['opponent_team_id']].merge(T[['team_id', 'team_abbreviation']].drop_duplicates('team_id').rename(columns={'team_id': 'opponent_team_id', 'team_abbreviation': 'oab'}), on='opponent_team_id').oab.values
T['oab'] = ab; road_b2b = T[(T.ha == 'away') & T.b2b]
alt = road_b2b[road_b2b.oab.isin(['DEN', 'UTAH', 'UTA'])].res; oth = road_b2b[~road_b2b.oab.isin(['DEN', 'UTAH', 'UTA'])].res
t = stats.ttest_ind(alt, oth, equal_var=False); rec('R4', 'R4 road team on a back-to-back at Denver/Utah minus at other arenas (points per 100 beyond SRS)', alt.mean() - oth.mean(), t.pvalue, len(alt), f'alt {alt.mean():+.2f} vs {oth.mean():+.2f}; all road b2b {road_b2b.res.mean():+.2f}')
rested = T[(T.ha == 'away') & ~T.b2b]; ra = rested[rested.oab.isin(['DEN', 'UTAH', 'UTA'])].res; ro = rested[~rested.oab.isin(['DEN', 'UTAH', 'UTA'])].res
t = stats.ttest_ind(ra, ro, equal_var=False); rec('R4b', 'R4b rested road team at Denver/Utah minus elsewhere (the plain altitude edge, beyond SRS)', ra.mean() - ro.mean(), t.pvalue, len(ra))
# R5 college style clash on SRS
C = teams_from_box('mbb'); S = srs(C)
st = C.groupby(['team_id', 'season']).agg(n=('game_id', 'size'), tpa=('tpa', 'sum'), fga=('fga', 'sum'), otpa=('otpa', 'sum'), ofga=('ofga', 'sum')).reset_index(); st = st[st.n >= 15]
st['tpr'] = st.tpa / st.fga; st['otpr'] = st.otpa / st.ofga; st = st.merge(S, on=['team_id', 'season'])
H = C.merge(st[['team_id', 'season', 'tpr', 'srs']], on=['team_id', 'season']).merge(st[['team_id', 'season', 'otpr', 'srs']].rename(columns={'team_id': 'opponent_team_id', 'srs': 'osrs'}), on=['opponent_team_id', 'season'])
a1 = H.tpr - H.groupby('season').tpr.transform('mean'); a2 = H.otpr - H.groupby('season').otpr.transform('mean')
X = np.column_stack([np.ones(len(H)), H.srs - H.osrs, H.home, a1, a2, a1 * a2]); b, *_ = np.linalg.lstsq(X, H.m100, rcond=None); res = H.m100 - X @ b; cov = res.var() * np.linalg.inv(X.T @ X)
rec('R5', 'R5 college three-heavy offense vs a defense that takes threes away, on schedule-adjusted ratings (per 100, 1-SD clash)', b[5] * a1.std() * a2.std(), 2 * stats.norm.sf(abs(b[5] / np.sqrt(cov[5, 5]))), len(H))
Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'p', 'n', 'extra']); Rd['q'] = bh(Rd.p.values); print('\nSUMMARY:'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))
