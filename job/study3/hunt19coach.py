# Pattern hunt 19: college basketball coaches — style, matchups, the tournament (Nov 7, 2026 — Sam, 12:10 am: "coaching data for the
# basketball side. and how their defenses or pase does against others, their worst and best matchups, players teams coaches").
# STUDY ONLY. Sources: men's college box scores 2015–2026 (sportsdataverse, ESPN's; flagged) and our coaches pack (p2026_cbb-coaches,
# CBBD; coach by team-season, exported to coaches.psv with ESPN team ids). Clutch coaches are left alone (Sam's rule).
#  C1 does a coach's style follow him to a new school? pace, threes taken away, own three-point share, offensive rebounding, turnovers forced
#  C2 coach vs coach: a head-to-head edge beyond the two teams' ratings — does it repeat?
#  C3 a coach's teams against fast vs slow opponents: is "can't handle tempo" a trait?
#  C4 the NCAA tournament: a coach's margin beyond ratings in tournament games — does it repeat? ("tournament coach")
#  C5 a coach's teams getting better over the season (Jan–Mar minus Nov–Dec, beyond ratings) — repeat?
import sys, numpy as np, pandas as pd
from scipy import stats

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

D, CP = sys.argv[1], sys.argv[2]; R = []
def rec(key, lab, est, p, n, extra=''):
    R.append((key, lab, est, p, n, extra)); print(f'[{key}] {lab}: {est:+.3f} (p {p:.3g}, n {n}) {extra}', flush=True)

fr = [pd.read_csv(f'{D}/mbb{y}.csv', low_memory=False) for y in range(2015, 2027)]
B = pd.concat(fr, ignore_index=True); B = B[B.did_not_play != True]
for c in ['field_goals_attempted', 'three_point_field_goals_attempted', 'free_throws_attempted', 'offensive_rebounds', 'defensive_rebounds', 'turnovers', 'team_score', 'opponent_team_score']:
    B[c] = pd.to_numeric(B[c], errors='coerce')
T = B.groupby(['game_id', 'season', 'season_type', 'game_date', 'team_id', 'opponent_team_id']).agg(fga=('field_goals_attempted', 'sum'), tpa=('three_point_field_goals_attempted', 'sum'), fta=('free_throws_attempted', 'sum'),
    orb=('offensive_rebounds', 'sum'), drb=('defensive_rebounds', 'sum'), tov=('turnovers', 'sum'), pts=('team_score', 'first'), opp=('opponent_team_score', 'first'), ha=('home_away', 'first')).reset_index()
T['poss'] = T.fga + 0.44 * T.fta - T.orb + T.tov
O = T[['game_id', 'team_id', 'poss', 'tpa', 'fga', 'drb', 'tov']].rename(columns={'team_id': 'opponent_team_id', 'poss': 'oposs', 'tpa': 'otpa', 'fga': 'ofga', 'drb': 'odrb', 'tov': 'otov'})
T = T.merge(O, on=['game_id', 'opponent_team_id']); T = T[(T.fga > 30) & (T.ofga > 30)].copy(); T['gposs'] = (T.poss + T.oposs) / 2
T['m100'] = 100 * (T.pts - T.opp) / T.gposs; T['home'] = np.where(T.ha == 'home', 1.0, -1.0)
REG = T[T.season_type == 2]
S = REG.groupby(['team_id', 'season']).agg(n=('game_id', 'size'), pace=('gposs', 'mean'), tpa=('tpa', 'sum'), fga=('fga', 'sum'), otpa=('otpa', 'sum'), ofga=('ofga', 'sum'),
    orb=('orb', 'sum'), odrb=('odrb', 'sum'), otov=('otov', 'sum'), oposs=('oposs', 'sum'), pts=('pts', 'sum'), opp=('opp', 'sum'), poss=('gposs', 'sum')).reset_index()
S = S[S.n >= 15].copy(); S['tpr'] = S.tpa / S.fga; S['otpr'] = S.otpa / S.ofga; S['orbp'] = S.orb / (S.orb + S.odrb); S['tovf'] = S.otov / S.oposs; S['net'] = 100 * (S.pts - S.opp) / S.poss
# opponent-adjusted rating (SRS) per season: margin per 100 = r_team − r_opp + home, least squares over every regular-season game
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
srs = []
for y, d in REG.groupby('season'):
    ids = pd.Index(sorted(set(d.team_id) | set(d.opponent_team_id))); i = np.arange(len(d)); a = ids.get_indexer(d.team_id); o_ = ids.get_indexer(d.opponent_team_id)
    M = coo_matrix((np.r_[np.ones(len(d)), -np.ones(len(d)), d.home.values], (np.r_[i, i, i], np.r_[a, o_, np.full(len(d), len(ids))])), shape=(len(d), len(ids) + 1)).tocsr()
    sol = lsqr(M, d.m100.values, damp=0.05)[0]; srs.append(pd.DataFrame({'team_id': ids, 'season': y, 'srs': sol[:-1]}))
S = S.merge(pd.concat(srs), on=['team_id', 'season'], how='left'); S['net_raw'] = S.net; S['net'] = S.srs   # every rating below is the schedule-adjusted one
C = pd.read_csv(CP, sep='|'); C['team_id'] = C.sid.astype(int)
C = C.assign(g=C.w + C.l).sort_values('g', ascending=False).drop_duplicates(['team_id', 'season'])   # a mid-season change: the coach with more games
S = S.merge(C[['team_id', 'season', 'cid', 'nm']], on=['team_id', 'season'], how='left')
print(f'hunt19: {len(S)} team-seasons, {S.cid.notna().mean():.2f} with a coach; {T.game_id.nunique()} games', flush=True)

# C1 style follows the coach to a new school
S = S.sort_values(['cid', 'season'])
mv = []
for cid, d in S[S.cid.notna()].groupby('cid'):
    d = d.sort_values('season').reset_index(drop=True)
    for i in range(1, len(d)):
        a, b = d.iloc[i - 1], d.iloc[i]
        if b.season == a.season + 1 and b.team_id != a.team_id: mv.append((cid, b.nm, a.team_id, b.team_id, b.season))
mv = pd.DataFrame(mv, columns=['cid', 'nm', 'old', 'new', 'season']); print(f'  coach moves with both seasons in the data: {len(mv)}')
Si = S.set_index(['team_id', 'season'])
for key, col, lab in (('C1a', 'pace', 'pace'), ('C1b', 'otpr', "opponents' 3-point attempt share (taking threes away)"), ('C1c', 'tpr', 'own 3-point attempt share'), ('C1d', 'orbp', 'offensive rebound %'), ('C1e', 'tovf', 'turnovers forced a possession')):
    rows = []
    for r in mv.itertuples():
        try: coach_old = Si.loc[(r.old, r.season - 1), col]; prog_prev = Si.loc[(r.new, r.season - 1), col]; now = Si.loc[(r.new, r.season), col]
        except KeyError: continue
        rows.append((coach_old, prog_prev, now, r.season))
    if len(rows) < 30: print(f'[{key}] too few ({len(rows)})'); continue
    a = np.array(rows, float); lgm = pd.Series(a[:, 3]).map(S.groupby('season')[col].mean()).values
    X = np.column_stack([np.ones(len(a)), a[:, 0] - lgm, a[:, 1] - lgm]); y = a[:, 2] - lgm; b, *_ = np.linalg.lstsq(X, y, rcond=None); res = y - X @ b; cov = res.var() * np.linalg.inv(X.T @ X)
    z = b[1] / np.sqrt(cov[1, 1]); rec(key, f'C1 {lab}: the coach\'s old-school number carries to the new school (weight), program\'s own last year weight {b[2]:.2f}', b[1], 2 * stats.norm.sf(abs(z)), len(a))

# ratings model for game residuals: margin per 100 ~ net − opp net + home
G = REG.merge(S[['team_id', 'season', 'net', 'pace', 'cid', 'nm']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'net', 'pace', 'cid', 'nm']].rename(columns={'team_id': 'opponent_team_id', 'net': 'onet', 'pace': 'opace', 'cid': 'ocid', 'nm': 'onm'}), on=['opponent_team_id', 'season'])
X = np.column_stack([np.ones(len(G)), G.net - G.onet, G.home]); b, *_ = np.linalg.lstsq(X, G.m100, rcond=None); G['res'] = G.m100 - X @ b
print(f'  ratings model: {b.round(3)}; residual sd {G.res.std():.1f} per 100')
# C2 coach vs coach
H = G[G.cid.notna() & G.ocid.notna()].copy(); H['pair'] = H.cid.astype(int).astype(str) + '|' + H.ocid.astype(int).astype(str)
pr = H.groupby(['pair', H.season % 2]).res.agg(['mean', 'size']).reset_index(); pr = pr[pr['size'] >= 2]; w = pr.pivot(index='pair', columns='season', values='mean').dropna()
r, p = stats.pearsonr(w[0], w[1]); rec('C2', 'C2 coach vs coach edge beyond ratings, even vs odd seasons (2+ meetings each)', r, p, len(w))
# C3 vs fast / slow opponents
G['fast'] = G.opace > G.groupby('season').opace.transform('median')
c3 = G[G.cid.notna()].groupby(['cid', 'nm', 'season', 'fast']).res.mean().unstack('fast').dropna(); c3['d'] = c3[True] - c3[False]
c3 = c3.reset_index(); c3['key'] = c3.cid; a_ = c3.set_index(['key', 'season']).d; b_ = a_.copy(); b_.index = pd.MultiIndex.from_arrays([b_.index.get_level_values(0), b_.index.get_level_values(1) - 1])
j = pd.concat([a_, b_], axis=1, keys=['now', 'next']).dropna(); r, p = stats.pearsonr(j.now, j.next); rec('C3', 'C3 a coach\'s edge vs fast minus slow opponents, year to year', r, p, len(j))
# C3b vs three-heavy opponents / vs defenses that take threes away
G = G.merge(S[['team_id', 'season', 'tpr']].rename(columns={'team_id': 'opponent_team_id', 'tpr': 'otpr_off'}), on=['opponent_team_id', 'season'])
G['o3'] = G.otpr_off > G.groupby('season').otpr_off.transform('median')
c3b = G[G.cid.notna()].groupby(['cid', 'season', 'o3']).res.mean().unstack('o3').dropna(); c3b['d'] = c3b[True] - c3b[False]
a_ = c3b.d; b_ = a_.copy(); b_.index = pd.MultiIndex.from_arrays([b_.index.get_level_values(0), b_.index.get_level_values(1) - 1])
j = pd.concat([a_, b_], axis=1, keys=['now', 'next']).dropna(); r, p = stats.pearsonr(j.now, j.next); rec('C3b', 'C3b a coach\'s edge vs three-heavy minus three-light offenses, year to year', r, p, len(j))
# C4 tournament: NCAA tournament games (season_type 3, March–April), residual using regular-season ratings
P_ = T[T.season_type == 3].merge(S[['team_id', 'season', 'net', 'cid', 'nm']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'net']].rename(columns={'team_id': 'opponent_team_id', 'net': 'onet'}), on=['opponent_team_id', 'season'])
P_['res'] = P_.m100 - (b[0] + b[1] * (P_.net - P_.onet))     # neutral courts: no home term
tc = P_[P_.cid.notna()].groupby(['cid', 'nm', P_.season % 2]).res.agg(['mean', 'size']).reset_index(); tc = tc[tc['size'] >= 3]; w = tc.pivot_table(index=['cid', 'nm'], columns='season', values='mean').dropna()
if len(w) > 15: r, p = stats.pearsonr(w[0], w[1]); rec('C4', 'C4 tournament coach: postseason margin beyond ratings, even vs odd seasons (3+ games each)', r, p, len(w))
tt = P_[P_.cid.notna()].groupby('nm').res.agg(['mean', 'size']); tt = tt[tt['size'] >= 12].sort_values('mean')
print('  postseason margin per 100 beyond ratings, 12+ games:'); print(pd.concat([tt.head(6), tt.tail(8)]).round(1).to_string())
# C5 improving over the season
G['dt'] = pd.to_datetime(G.game_date); G['late'] = G.dt.dt.month.isin([1, 2, 3])
c5 = G[G.cid.notna()].groupby(['cid', 'season', 'late']).res.mean().unstack('late').dropna(); c5['d'] = c5[True] - c5[False]
a_ = c5.d; b_ = a_.copy(); b_.index = pd.MultiIndex.from_arrays([b_.index.get_level_values(0), b_.index.get_level_values(1) - 1])
j = pd.concat([a_, b_], axis=1, keys=['now', 'next']).dropna(); r, p = stats.pearsonr(j.now, j.next); rec('C5', 'C5 a coach\'s teams improve Jan–Mar vs Nov–Dec beyond ratings, year to year', r, p, len(j))
imp = c5.reset_index().merge(C[['cid', 'nm']].drop_duplicates('cid'), on='cid').groupby('nm').d.agg(['mean', 'size']); imp = imp[imp['size'] >= 6].sort_values('mean')
print('  late-season improvement (per 100), 6+ seasons:'); print(pd.concat([imp.head(5), imp.tail(8)]).round(1).to_string())
Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'p', 'n', 'extra']); Rd['q'] = bh(Rd.p.values)
print('\nSUMMARY:'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))
