# Pattern hunt 22 (Nov 7, 2026, ~2:45 am — Sam, 1:42 am: "do all the hunts you listed"): the local ones from "Next ideas — Nov 7" and the
# Nov 6 list. STUDY ONLY. nflverse play-by-play 2006–2025 + college basketball box scores (sportsdataverse, flagged), read locally.
#  I1 icing the kicker (NFL): field goals right after the defense's timeout vs the same distance otherwise
#  I2 red-zone luck (NFL teams): red-zone TD rate year to year; is a high rate beyond the offense's efficiency a regression flag?
#  I3 explosive dependence (NFL): share of yards on 20+ yard plays — does a high share predict a drop next season, beyond regression?
#  I4 tempo clash and totals (NFL): two fast offenses / fast vs slow — the game total vs the posted total
#  I5 new QBs (NFL): a QB's first 3 starts for a team vs his later starts that season, against the line
#  I6 close-game luck (college basketball): record in games decided by 3 or less, year to year; does it predict next season?
#  I7 short rest (college basketball): second game within 48 hours / third in five days, beyond schedule-adjusted ratings
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q
PBP, BOX = sys.argv[1], sys.argv[2]; R = []
def rec(key, lab, est, p, n, extra=''):
    R.append((key, lab, est, p, n, extra)); print(f'[{key}] {lab}: {est:+.4f} (p {p:.3g}, n {n}) {extra}', flush=True)
def yoy(s, key, lab):
    a = s.copy(); b = s.copy(); b.index = pd.MultiIndex.from_arrays([b.index.get_level_values(0), b.index.get_level_values(1) - 1])
    j = pd.concat([a, b], axis=1, keys=['now', 'next']).dropna(); r, p = stats.pearsonr(j.now, j.next)
    h = j[j.index.get_level_values(1) >= 2019]; rh = stats.pearsonr(h.now, h.next)[0] if len(h) > 20 else np.nan
    rec(key, lab, r, p, len(j), f'holdout (2020 on) r {rh:.3f}'); return j

cols = ['game_id', 'season', 'season_type', 'week', 'posteam', 'defteam', 'home_team', 'away_team', 'play_type', 'epa', 'yards_gained', 'yardline_100', 'drive', 'fixed_drive_result',
        'field_goal_attempt', 'field_goal_result', 'kick_distance', 'timeout', 'timeout_team', 'game_seconds_remaining', 'half_seconds_remaining', 'score_differential',
        'passer_player_id', 'passer_player_name', 'qb_dropback', 'result', 'spread_line', 'total', 'total_line', 'play_id']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2006: continue
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG'].sort_values(['game_id', 'play_id']).reset_index(drop=True)
print(f'hunt22: {P.game_id.nunique()} NFL games', flush=True)
# I1 icing: FG whose previous row in the game is a defensive timeout
prev_to = (P.timeout.shift(1) == 1) & (P.timeout_team.shift(1) == P.defteam) & (P.game_id.shift(1) == P.game_id)
FG = P[(P.field_goal_attempt == 1) & P.kick_distance.notna()].copy(); FG['iced'] = prev_to.loc[FG.index].values; FG['made'] = (FG.field_goal_result == 'made').astype(int)
FG['db'] = (FG.kick_distance // 5) * 5; FG['late'] = (FG.half_seconds_remaining <= 120)
base = FG[~FG.iced].groupby(['db', 'late']).made.mean(); FG['exp'] = [base.get((d, l), np.nan) for d, l in zip(FG.db, FG.late)]
ic = FG[FG.iced & FG.exp.notna()]; z = (ic.made.sum() - ic.exp.sum()) / np.sqrt((ic.exp * (1 - ic.exp)).sum())
rec('I1', 'I1 icing: make rate after a defensive timeout minus expected (same distance, same late-half state)', ic.made.mean() - ic.exp.mean(), 2 * stats.norm.sf(abs(z)), len(ic), f'made {ic.made.mean():.3f} vs exp {ic.exp.mean():.3f}')
# team-season offense
off = P[P.play_type.isin(['run', 'pass'])].groupby(['posteam', 'season']).agg(epa=('epa', 'mean'), yds=('yards_gained', 'sum'), ex=('yards_gained', lambda s: s[s >= 20].sum()))
off['exs'] = off.ex / off.yds
dr = P[P.drive.notna()].groupby(['game_id', 'posteam', 'drive', 'season']).agg(rz=('yardline_100', lambda s: (s <= 20).any()), res=('fixed_drive_result', 'first')).reset_index()
rz = dr[dr.rz].groupby(['posteam', 'season']).agg(n=('res', 'size'), td=('res', lambda s: (s == 'Touchdown').mean())); off = off.join(rz)
yoy(off.td.dropna(), 'I2', 'I2 red-zone TD rate (offense), year to year')
d = off.reset_index(); d['nextepa'] = d.set_index(['posteam', 'season']).epa.reindex(list(zip(d.posteam, d.season + 1))).values; d = d.dropna(subset=['nextepa', 'td'])
X = np.column_stack([np.ones(len(d)), d.epa, d.td]); b, *_ = np.linalg.lstsq(X, d.nextepa, rcond=None); res = d.nextepa - X @ b; cov = res.var() * np.linalg.inv(X.T @ X)
rec('I2b', 'I2b red-zone TD rate beyond this season\'s EPA → next season\'s EPA a play (per 10 points of TD rate)', b[2] * 0.10, 2 * stats.norm.sf(abs(b[2] / np.sqrt(cov[2, 2]))), len(d))
X = np.column_stack([np.ones(len(d)), d.epa, d.exs]); b, *_ = np.linalg.lstsq(X, d.nextepa, rcond=None); res = d.nextepa - X @ b; cov = res.var() * np.linalg.inv(X.T @ X)
rec('I3', 'I3 explosive dependence: share of yards on 20+ plays → next season\'s EPA a play beyond this season\'s (per 10 points of share)', b[2] * 0.10, 2 * stats.norm.sf(abs(b[2] / np.sqrt(cov[2, 2]))), len(d))
# I4 tempo: offensive plays a game (season) for each side; total vs posted total
pg = P[P.play_type.isin(['run', 'pass'])].groupby(['posteam', 'season', 'game_id']).size().groupby(['posteam', 'season']).mean().rename('ppg')
gm = P.drop_duplicates('game_id')[['game_id', 'season', 'home_team', 'away_team', 'total', 'total_line']].dropna()
gm = gm.join(pg.rename('hp'), on=['home_team', 'season']).join(pg.rename('ap'), on=['away_team', 'season']).dropna(); gm['ovr'] = gm.total - gm.total_line
lg = gm.groupby('season').hp.transform('mean'); gm['sum'] = (gm.hp - lg) + (gm.ap - lg); gm['gap'] = (gm.hp - gm.ap).abs()
r, p = stats.pearsonr(gm['sum'], gm.ovr); rec('I4', 'I4 combined tempo (plays a game above average, both teams) vs total minus posted total (r)', r, p, len(gm), f'slope {np.polyfit(gm["sum"], gm.ovr, 1)[0]:+.3f} pts per play')
r, p = stats.pearsonr(gm.gap, gm.ovr); rec('I4b', 'I4b tempo gap (fast vs slow) vs total minus posted total (r)', r, p, len(gm))
# I5 new QBs: starter = most dropbacks; new = first season with that team
db = P[P.qb_dropback == 1].groupby(['game_id', 'season', 'week', 'posteam', 'passer_player_id']).size().rename('n').reset_index().sort_values('n').drop_duplicates(['game_id', 'posteam'], keep='last')
db = db.sort_values(['season', 'week']); first = db.groupby(['passer_player_id', 'posteam']).season.transform('min'); db['newteam'] = db.season == first
db['k'] = db.groupby(['passer_player_id', 'posteam', 'season']).cumcount() + 1
gl = P.drop_duplicates('game_id').set_index('game_id')[['home_team', 'result', 'spread_line']]
db = db.join(gl, on='game_id').dropna(subset=['spread_line']); db['cover'] = np.where(db.posteam == db.home_team, db.result - db.spread_line, -(db.result - db.spread_line))
nq = db[db.newteam & (db.season > 2006)]; a = nq[nq.k <= 3].cover; b2 = nq[nq.k > 3].cover; t = stats.ttest_ind(a, b2, equal_var=False)
rec('I5', 'I5 a QB new to his team: first 3 starts minus later starts that season, against the line (pts)', a.mean() - b2.mean(), t.pvalue, len(a), f'{a.mean():+.2f} vs {b2.mean():+.2f}')
# college basketball
B = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(f'{BOX}/mbb20*.csv'))], ignore_index=True); B = B[(B.season_type == 2) & (B.did_not_play != True)]
for c in ['field_goals_attempted', 'free_throws_attempted', 'offensive_rebounds', 'turnovers', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
T = B.groupby(['game_id', 'season', 'game_date', 'team_id', 'opponent_team_id']).agg(fga=('field_goals_attempted', 'sum'), fta=('free_throws_attempted', 'sum'), orb=('offensive_rebounds', 'sum'), tov=('turnovers', 'sum'),
    pts=('team_score', 'first'), opp=('opponent_team_score', 'first'), ha=('home_away', 'first')).reset_index(); T = T[T.fga > 30]
T['poss'] = T.fga + 0.44 * T.fta - T.orb + T.tov; T['m'] = T.pts - T.opp; T['home'] = np.where(T.ha == 'home', 1.0, -1.0)
srs = []
for y, d_ in T.groupby('season'):
    ids = pd.Index(sorted(set(d_.team_id) | set(d_.opponent_team_id))); i = np.arange(len(d_))
    M = coo_matrix((np.r_[np.ones(len(d_)), -np.ones(len(d_)), d_.home.values], (np.r_[i, i, i], np.r_[ids.get_indexer(d_.team_id), ids.get_indexer(d_.opponent_team_id), np.full(len(d_), len(ids))])), shape=(len(d_), len(ids) + 1)).tocsr()
    sol = lsqr(M, d_.m.values, damp=0.05)[0]; srs.append(pd.DataFrame({'team_id': ids, 'season': y, 'srs': sol[:-1]}))
S = pd.concat(srs); T = T.merge(S, on=['team_id', 'season']).merge(S.rename(columns={'team_id': 'opponent_team_id', 'srs': 'osrs'}), on=['opponent_team_id', 'season'])
X = np.column_stack([np.ones(len(T)), T.srs - T.osrs, T.home]); b, *_ = np.linalg.lstsq(X, T.m, rcond=None); T['res'] = T.m - X @ b
cl = T[T.m.abs() <= 3].groupby(['team_id', 'season']).agg(n=('m', 'size'), w=('m', lambda s: (s > 0).mean())); cl = cl[cl.n >= 4]
yoy(cl.w, 'I6', 'I6 college basketball: win share in games decided by 3 or less, year to year')
d = cl.reset_index().merge(S, on=['team_id', 'season']); d['next'] = d.set_index(['team_id', 'season']).srs.reindex(list(zip(d.team_id, d.season + 1))).values; d = d.dropna()
X = np.column_stack([np.ones(len(d)), d.srs, d.w]); b, *_ = np.linalg.lstsq(X, d['next'], rcond=None); res = d['next'] - X @ b; cov = res.var() * np.linalg.inv(X.T @ X)
rec('I6b', 'I6b close-game win share → next season\'s SRS beyond this season\'s (points, 0→100%)', b[2], 2 * stats.norm.sf(abs(b[2] / np.sqrt(cov[2, 2]))), len(d))
T['dt'] = pd.to_datetime(T.game_date).dt.normalize(); T = T.sort_values(['team_id', 'dt']); gap = T.groupby('team_id').dt.diff().dt.days; T['g48'] = gap <= 2
T['g3in5'] = (T.dt - T.groupby('team_id').dt.shift(2)).dt.days <= 4
og = T[['game_id', 'team_id', 'g48', 'g3in5']].rename(columns={'team_id': 'opponent_team_id', 'g48': 'og48', 'g3in5': 'og3'}); T = T.merge(og, on=['game_id', 'opponent_team_id'])
a = T[T.g48 & ~T.og48].res; b2 = T[~T.g48 & ~T.og48].res; t = stats.ttest_ind(a, b2, equal_var=False)
rec('I7', 'I7 college basketball: second game within 48 hours (opponent rested) minus normal rest, margin beyond SRS', a.mean() - b2.mean(), t.pvalue, len(a))
a = T[T.g3in5 & ~T.og3].res; t = stats.ttest_ind(a, b2, equal_var=False)
rec('I7b', 'I7b college basketball: third game in five days (opponent not) minus normal, beyond SRS', a.mean() - b2.mean(), t.pvalue, len(a))
Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'p', 'n', 'extra']); Rd['q'] = bh(Rd.p.values); print('\nSUMMARY:'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))
