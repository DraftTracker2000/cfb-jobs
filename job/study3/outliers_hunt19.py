# Outliers for the study book from pattern hunt 19 (Nov 22, 2026: outliers on both sides of every test). Built on hunt19coach.py: college basketball coaches — style, matchups, the tournament (Nov 7, 2026 — the owner, 12:10 am: "coaching data for the
# basketball side. and how their defenses or pase does against others, their worst and best matchups, players teams coaches").
# STUDY ONLY. Sources: men's college box scores 2015–2026 (sportsdataverse, ESPN's; flagged) and our coaches pack (p2026_cbb-coaches,
# CBBD; coach by team-season, exported to coaches.psv with ESPN team ids). Clutch coaches are left alone (the owner's rule).
#  C1 does a coach's style follow him to a new school? pace, threes taken away, own three-point share, offensive rebounding, turnovers forced
#  C2 coach vs coach: a head-to-head edge beyond the two teams' ratings — does it repeat?
#  C3 a coach's teams against fast vs slow opponents: is "can't handle tempo" a trait?
#  C4 the NCAA tournament: a coach's margin beyond ratings in tournament games — does it repeat? ("tournament coach")
#  C5 a coach's teams getting better over the season (Jan–Mar minus Nov–Dec, beyond ratings) — repeat?
# Here: (1) "tournament coach" as a prediction: tag each coach on 2015–20 postseason games (4+), score 2021–26 (4+), named at both ends;
# (2) style follows the coach: every move, his old team's pace and threes-allowed share vs the new school's year before and his first year.
# Usage: python3 outliers_hunt19.py <box dir> <coaches.psv> <out.json>
import sys, json, numpy as np, pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
D, CP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]; RES = {}
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
srs = []
for y, d in REG.groupby('season'):
    ids = pd.Index(sorted(set(d.team_id) | set(d.opponent_team_id))); i = np.arange(len(d)); a = ids.get_indexer(d.team_id); o_ = ids.get_indexer(d.opponent_team_id)
    M = coo_matrix((np.r_[np.ones(len(d)), -np.ones(len(d)), d.home.values], (np.r_[i, i, i], np.r_[a, o_, np.full(len(d), len(ids))])), shape=(len(d), len(ids) + 1)).tocsr()
    sol = lsqr(M, d.m100.values, damp=0.05)[0]; srs.append(pd.DataFrame({'team_id': ids, 'season': y, 'srs': sol[:-1]}))
S = S.merge(pd.concat(srs), on=['team_id', 'season'], how='left'); S['net_raw'] = S.net; S['net'] = S.srs   # every rating below is the schedule-adjusted one
C = pd.read_csv(CP, sep='|'); C['team_id'] = C.sid.astype(int)
C = C.assign(g=C.w + C.l).sort_values('g', ascending=False).drop_duplicates(['team_id', 'season'])   # a mid-season change: the coach with more games
S = S.merge(C[['team_id', 'season', 'cid', 'nm']], on=['team_id', 'season'], how='left')
NM = B.groupby('team_id').team_location.last()
X = None
G = REG.merge(S[['team_id', 'season', 'net']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'net']].rename(columns={'team_id': 'opponent_team_id', 'net': 'onet'}), on=['opponent_team_id', 'season'])
Xm = np.column_stack([np.ones(len(G)), G.net - G.onet, G.home]); b, *_ = np.linalg.lstsq(Xm, G.m100, rcond=None)
P_ = T[T.season_type == 3].merge(S[['team_id', 'season', 'net', 'cid', 'nm']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'net']].rename(columns={'team_id': 'opponent_team_id', 'net': 'onet'}), on=['opponent_team_id', 'season'])
P_['res'] = P_.m100 - (b[0] + b[1] * (P_.net - P_.onet)); P_ = P_[P_.cid.notna()]
P_['era'] = np.where(P_.season <= 2020, 'early', 'late')
t = P_.groupby(['nm', 'era']).res.agg(['mean', 'size']).unstack('era'); t = t[(t[('size', 'early')] >= 4) & (t[('size', 'late')] >= 4)]
e, l = t[('mean', 'early')], t[('mean', 'late')]; ml = l.median(); qt, qb = e.quantile(.85), e.quantile(.15)
row = lambda n: [n, round(float(e[n]), 1), int(t.loc[n, ('size', 'early')]), round(float(l[n]), 1), int(t.loc[n, ('size', 'late')])]
RES['tourney'] = {'coaches': int(len(t)), 'all_late': round(float(l.mean()), 2),
    'top': {'n': int((e >= qt).sum()), 'early': round(float(e[e >= qt].mean()), 1), 'late': round(float(l[e >= qt].mean()), 1), 'again': int((l[e >= qt] > ml).sum()), 'names': [row(n) for n in e[e >= qt].sort_values(ascending=False).index]},
    'bottom': {'n': int((e <= qb).sum()), 'early': round(float(e[e <= qb].mean()), 1), 'late': round(float(l[e <= qb].mean()), 1), 'again': int((l[e <= qb] < ml).sum()), 'names': [row(n) for n in e[e <= qb].sort_values().index]}}
allc = P_.groupby('nm').res.agg(['mean', 'size']); allc = allc[allc['size'] >= 12].sort_values('mean')
RES['tourney']['career_top'] = [[n, round(float(r['mean']), 1), int(r['size'])] for n, r in allc.iloc[::-1][:6].iterrows()]
RES['tourney']['career_bottom'] = [[n, round(float(r['mean']), 1), int(r['size'])] for n, r in allc[:6].iterrows()]
print('tourney', json.dumps(RES['tourney']), flush=True)
# style moves
S = S.sort_values(['cid', 'season']); mv = []
for cid, d in S[S.cid.notna()].groupby('cid'):
    d = d.sort_values('season').reset_index(drop=True)
    for i in range(1, len(d)):
        a, c = d.iloc[i - 1], d.iloc[i]
        if c.season == a.season + 1 and c.team_id != a.team_id: mv.append((c.nm, a.team_id, c.team_id, int(c.season)))
Si = S.set_index(['team_id', 'season'])
for col in ['pace', 'otpr']:
    avg = S.groupby('season')[col].mean(); rows = []
    for nm_, old, new, y in mv:
        try: co, pp, now = Si.loc[(old, y - 1), col], Si.loc[(new, y - 1), col], Si.loc[(new, y), col]
        except KeyError: continue
        rows.append({'coach': nm_, 'old': NM.get(old, str(old)), 'new': NM.get(new, str(new)), 'season': y, 'coach_old': round(float(co - avg[y - 1]), 3 if col == 'otpr' else 1),
                     'school_before': round(float(pp - avg[y - 1]), 3 if col == 'otpr' else 1), 'year_one': round(float(now - avg[y]), 3 if col == 'otpr' else 1)})
    R_ = pd.DataFrame(rows); R_['gap'] = R_.coach_old - R_.school_before; big = R_[R_.gap.abs() >= (4 if col == 'pace' else .04)].copy()
    big['moved'] = (big.year_one - big.school_before) / big.gap
    RES['style_' + col] = {'moves': int(len(R_)), 'big_gap': int(len(big)), 'half_or_more': int((big.moved >= .5).sum()), 'median_moved': round(float(big.moved.median()), 2),
        'followed': big.sort_values('moved', ascending=False).head(6).drop(columns=['gap']).to_dict('records'), 'didnt': big.sort_values('moved').head(5).drop(columns=['gap']).to_dict('records')}
    print(col, json.dumps(RES['style_' + col]), flush=True)
json.dump(RES, open(OUT, 'w'), indent=1, default=float); print('saved', OUT)
