# Pattern hunt 34 (Nov 7, 2026): retest series, part 6, prediction first (rule 12). STUDY ONLY. Local files.
# Usage: python3 hunt34.py SCRATCH  (SCRATCH holds nflw/, box/, nflinj/, coaches.psv, stadjob/games.csv)
#  L1 QB "makers" (hunt 1: production makers "mostly don't repeat"): a QB tagged from earlier seasons by how much more his receivers
#     produced with him than without him → that season, receivers NEW to him: their PPR points a game beyond their own earlier average
#  V1 NBA revenge games (hunt 12: "barely a thing … doesn't repeat"): players tagged by how they scored against former teams before →
#     their next games against a former team, points per 36 beyond their norm
#  K1 college basketball tournament coaches (hunt 19: "history, not a forecast"): a coach's NCAA-tournament margin beyond his team's
#     ratings in earlier years → his next tournament games
#  S1 stadiums and injuries (hunts 17, 20, 21: "doesn't repeat"): a stadium's new-injury rate in earlier seasons → that season
import sys, os, glob, re, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

S = sys.argv[1]; OUT = []
def say(s): OUT.append(s); print(s, flush=True)

# ---------- L1 QB makers ----------
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True)
W = W[W.season_type == 'REG']
qb = W[W.position == 'QB'].sort_values('attempts').drop_duplicates(['game_id', 'team'], keep='last')[['game_id', 'team', 'player_id']].rename(columns={'player_id': 'qb'})
R = W[W.position.isin(['WR', 'TE', 'RB']) & (W.targets.fillna(0) >= 1)].copy()
R['ppr'] = R.receptions.fillna(0) + R.receiving_yards.fillna(0) / 10 + 6 * R.receiving_tds.fillna(0)
R = R.merge(qb, on=['game_id', 'team'], how='inner')
qn = W[W.position == 'QB'].groupby('player_id').player_display_name.first()
tag_rows, rest_rows, per = [], [], []
for s in range(2017, int(R.season.max()) + 1):
    pr = R[R.season < s]
    base = pr.groupby('player_id').ppr.mean()
    wq = pr.groupby(['qb', 'player_id']).ppr.agg(['mean', 'size']).reset_index(); wq = wq[wq['size'] >= 4]
    wq['lift'] = wq['mean'] - wq.player_id.map(base)
    lift = wq.groupby('qb').apply(lambda d: pd.Series({'lift': np.average(d.lift, weights=d['size']), 'n': len(d)})); lift = lift[lift.n >= 4]
    if len(lift) < 15: continue
    tg = set(lift.index[lift.lift >= lift.lift.quantile(.85)])
    now = R[R.season == s]; seen = set(zip(pr.qb, pr.player_id))
    new = now[np.array([(q, p) not in seen for q, p in zip(now.qb, now.player_id)]) & now.player_id.isin(base.index).values & now.qb.isin(lift.index).values].copy()
    new['x'] = new.ppr - new.player_id.map(base)
    a = new[new.qb.isin(tg)]; tag_rows.append(a); rest_rows.append(new[~new.qb.isin(tg)])
    for q, d in a.groupby('qb'): per.append((q, d.x.mean(), len(d)))
A, B = pd.concat(tag_rows), pd.concat(rest_rows); t, p = stats.ttest_ind(A.x, B.x, equal_var=False); pe = pd.DataFrame(per, columns=['q', 'x', 'n']); pe = pe[pe.n >= 6]
say(f'L1 QB makers (top 15% by earlier receivers\' lift) → receivers new to him that season: {A.x.mean():+.2f} PPR points a game beyond their own earlier average vs {B.x.mean():+.2f} with other QBs '
    f'→ {A.x.mean() - B.x.mean():+.2f} (p {p:.2g}, {len(A)} receiver-games) · tagged QB-seasons that lifted new receivers more than the others: {int((pe.x > B.x.mean()).sum())} of {len(pe)} · '
    f'e.g. ' + ', '.join(sorted({qn.get(q, q) for q in pe.q})[:14]))

# ---------- V1 NBA revenge ----------
B = pd.concat([pd.read_csv(f'{S}/box/nba{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{S}/box/nba{y}.csv')], ignore_index=True)
B = B[B.season_type == 2].copy()
for c in ['minutes', 'points']: B[c] = pd.to_numeric(B[c], errors='coerce')
P = B[B.minutes >= 10].copy(); P['p36'] = 36 * P.points / P.minutes; P['own'] = P.groupby(['season', 'athlete_id']).p36.transform('mean'); P['x'] = P.p36 - P.own
teams = P.groupby(['athlete_id', 'season']).team_id.agg(lambda s: set(s)).to_dict()
P['revenge'] = [any(o in teams.get((a, y), set()) for y in range(s - 3, s)) and o not in teams.get((a, s), set()) for a, s, o in zip(P.athlete_id, P.season, P.opponent_team_id)]
Rv = P[P.revenge]; tg_rows, rs_rows, kept, ntg = [], [], 0, 0
for s in range(2018, int(P.season.max()) + 1):
    pr = Rv[Rv.season < s].groupby('athlete_id').x.agg(['mean', 'size']); pr = pr[pr['size'] >= 3]
    if len(pr) < 15: continue
    tg = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]); now = Rv[(Rv.season == s) & Rv.athlete_id.isin(pr.index)]
    a = now[now.athlete_id.isin(tg)]; tg_rows.append(a); rs_rows.append(now[~now.athlete_id.isin(tg)]); m = a.groupby('athlete_id').x.mean(); kept += int((m > 0).sum()); ntg += len(m)
A, Bb = pd.concat(tg_rows), pd.concat(rs_rows); t, p = stats.ttest_ind(A.x, Bb.x, equal_var=False)
say(f'V1 NBA revenge: players who scored best against former teams before → their next revenge games {A.x.mean():+.2f} points per 36 beyond norm vs {Bb.x.mean():+.2f} others '
    f'→ {A.x.mean() - Bb.x.mean():+.2f} (p {p:.2g}, {len(A)} games) · tagged players above zero again: {kept} of {ntg}')

# ---------- K1 tournament coaches ----------
M = pd.concat([pd.read_csv(f'{S}/box/mbb{y}.csv', low_memory=False, usecols=['game_id', 'season', 'season_type', 'team_id', 'opponent_team_id', 'home_away', 'team_score', 'opponent_team_score'])
               for y in range(2015, 2027) if os.path.exists(f'{S}/box/mbb{y}.csv')], ignore_index=True).drop_duplicates(['game_id', 'team_id']).dropna()
M['margin'] = M.team_score - M.opponent_team_score; M['home'] = np.where(M.home_away == 'home', 1.0, 0.0)
rt = {}
for s, g in M[M.season_type == 2].groupby('season'):
    t = sorted(set(g.team_id) | set(g.opponent_team_id)); ix = {x: i for i, x in enumerate(t)}; n = len(g)
    Am = coo_matrix((np.r_[np.ones(n), -np.ones(n), g.home.values], (np.r_[np.arange(n), np.arange(n), np.arange(n)], np.r_[[ix[x] for x in g.team_id], [ix[x] for x in g.opponent_team_id], np.full(n, len(t))])), shape=(n, len(t) + 1)).tocsr()
    x = lsqr(Am, g.margin.values)[0]; rt.update({(s, k): x[i] for k, i in ix.items()})
Tn = M[M.season_type == 3].copy(); Tn['x'] = Tn.margin - [rt.get((s, a), np.nan) - rt.get((s, b), np.nan) for s, a, b in zip(Tn.season, Tn.team_id, Tn.opponent_team_id)]
C = pd.read_csv(S + '/coaches.psv', sep='|'); co = C.assign(g=C.w + C.l).sort_values('g').drop_duplicates(['sid', 'season'], keep='last').set_index(['sid', 'season']).nm.to_dict()
Tn['coach'] = [co.get((t, s)) for t, s in zip(Tn.team_id, Tn.season)]; Tn = Tn.dropna(subset=['x', 'coach'])
tg_rows, rs_rows, kept, ntg = [], [], 0, 0
for s in sorted(Tn.season.unique()):
    pr = Tn[Tn.season < s].groupby('coach').x.agg(['mean', 'size']); pr = pr[pr['size'] >= 4]
    if len(pr) < 10: continue
    tg = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]); now = Tn[(Tn.season == s) & Tn.coach.isin(pr.index)]
    a = now[now.coach.isin(tg)]; tg_rows.append(a); rs_rows.append(now[~now.coach.isin(tg)]); m = a.groupby('coach').x.mean(); kept += int((m > 0).sum()); ntg += len(m)
if tg_rows:
    A, Bb = pd.concat(tg_rows), pd.concat(rs_rows); t, p = stats.ttest_ind(A.x, Bb.x, equal_var=False)
    say(f'K1 college tournament coaches (top 15% beyond ratings in earlier tournaments, 4+ games) → next tournament: {A.x.mean():+.2f} points beyond ratings vs {Bb.x.mean():+.2f} others '
        f'→ {A.x.mean() - Bb.x.mean():+.2f} (p {p:.2g}, {len(A)} games) · tagged coaches above zero again: {kept} of {ntg} · {", ".join(sorted(set(A.coach))[:12])}')
else: say(f'K1: too few tournament games ({len(Tn)} with a coach)')

# ---------- S1 stadiums ----------
G = pd.read_csv(S + '/stadjob/games.csv', low_memory=False); G = G[(G.game_type == 'REG') & G.home_score.notna() & (G.season >= 2009)]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}; tk = lambda t: fix.get(t, t)
I = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflinj/injuries_20*.csv'))], ignore_index=True); I = I[I.game_type == 'REG'].copy(); I['tm'] = I.team.map(tk)
I['inj'] = I.report_primary_injury.fillna(I.practice_primary_injury).fillna('').astype(str).str.lower()
I['hurt'] = ~I.inj.str.contains(r'not injury|rest|^$|personal|illness|resting|non-football|nir', regex=True)
I['soft'] = I.inj.str.contains(r'hamstring|groin|calf|quad|thigh|hip flexor|pectoral|pec\b|abdom|oblique|adductor', regex=True)
rep = I.groupby(['season', 'tm', 'week']).gsis_id.apply(set).to_dict(); weeks = I.groupby(['season', 'tm']).week.apply(lambda s: sorted(set(s))).to_dict()
hurt = {k: dict(zip(d.gsis_id, d.soft)) for k, d in I[I.hurt].groupby(['season', 'tm', 'week'])}
rows = []
for r in G.itertuples():
    for team in (tk(r.home_team), tk(r.away_team)):
        nx = [w for w in weeks.get((r.season, team), []) if r.week < w <= r.week + 2]
        if not nx: continue
        after = hurt.get((r.season, team, nx[0]), {}); before = rep.get((r.season, team, r.week), set()) | rep.get((r.season, team, r.week - 1), set())
        new = [s for p, s in after.items() if p not in before]; rows.append((r.season, r.stadium_id, len(new), sum(new)))
X = pd.DataFrame(rows, columns=['season', 'sid', 'all', 'soft'])
for col in ('all', 'soft'):
    X['e'] = X.groupby('season')[col].transform('mean'); X['x'] = X[col] - X.e
    tg_rows, rs_rows, kept, ntg = [], [], 0, 0
    for s in range(2013, int(X.season.max()) + 1):
        pr = X[X.season < s].groupby('sid').x.agg(['mean', 'size']); pr = pr[pr['size'] >= 60]
        tg = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]); now = X[(X.season == s) & X.sid.isin(pr.index)]
        a = now[now.sid.isin(tg)]; tg_rows.append(a); rs_rows.append(now[~now.sid.isin(tg)]); m = a.groupby('sid').x.mean(); kept += int((m > 0).sum()); ntg += len(m)
    A, Bb = pd.concat(tg_rows), pd.concat(rs_rows); t, p = stats.ttest_ind(A.x, Bb.x, equal_var=False)
    say(f'S1 stadiums, {"all new injuries" if col == "all" else "soft tissue"}: highest-rate 15% from earlier seasons → that season {A.x.mean():+.3f} a team-game vs {Bb.x.mean():+.3f} others '
        f'→ {(A.x.mean() - Bb.x.mean()) / A.e.mean() * 100:+.0f}% (p {p:.2g}, {len(A)} team-games) · tagged stadium-seasons above average again: {kept} of {ntg}')
