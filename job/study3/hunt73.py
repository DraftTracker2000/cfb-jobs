# Hunt 73 (Nov 8, 2026 — the owner, 7:19 pm: "obviously just do all the 16 pattern hunts"; the "Next ideas — Nov 8" list). Basketball.
# STUDY ONLY. sportsdataverse box scores and schedules (ESPN's, republished; flagged), NBA and men's college 2015–2026, read locally. No betting
# lines in these files, so the baseline is a schedule-adjusted rating (points margin, home court) fitted on each team's EARLIER games that
# season, refit every 7 days; the outcome is the margin beyond it. Prediction first (rule 12): every tag is known before tip-off.
#   8   three-point luck within a season: a team whose opponents have shot well under (or over) the league from three so far
#   9   NBA road trips: game 4+ of a trip, and the first game home after a 4+ game trip
#   14  NBA: the game a star (top-2 by minutes, 25+ a game) returns after missing 2+ games
#   15  NCAA tournament experience: share of this team's minutes from players who played in LAST year's NCAA tournament
# Usage: python3 hunt73.py BOX_DIR MBB_SCHEDULE_DIR
import sys, glob, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr
BOX, SCH = sys.argv[1:3]
COLS = ['game_id', 'season', 'season_type', 'game_date', 'athlete_id', 'team_id', 'minutes', 'did_not_play', 'three_point_field_goals_made',
        'three_point_field_goals_attempted', 'home_away', 'team_score', 'opponent_team_id', 'opponent_team_score']
def fit(d):
    t = sorted(set(d.team) | set(d.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(d)
    r = np.r_[np.arange(n), np.arange(n), np.arange(n)]; c = np.r_[[ix[x] for x in d.team], [ix[x] for x in d.opp], np.full(n, len(t))]
    v = np.r_[np.ones(n), -np.ones(n), d.hv.values]
    A = coo_matrix((v, (r, c)), shape=(n, len(t) + 1)).tocsr(); sol = lsqr(A, d.margin.values, damp=.05)[0]
    return {x: sol[i] for x, i in ix.items()}, sol[-1]
def load(lg):
    out = []
    for f in sorted(glob.glob(f'{BOX}/{lg}20*.csv')):
        b = pd.read_csv(f, usecols=COLS, low_memory=False); out.append(b)
    return pd.concat(out)
def games(b):
    tg = b.groupby(['game_id', 'team_id']).agg(season=('season', 'first'), st=('season_type', 'first'), date=('game_date', 'first'), ha=('home_away', 'first'),
                                               pf=('team_score', 'first'), pa=('opponent_team_score', 'first'), opp=('opponent_team_id', 'first'),
                                               m3=('three_point_field_goals_made', 'sum'), a3=('three_point_field_goals_attempted', 'sum')).reset_index()
    o = tg[['game_id', 'team_id', 'm3', 'a3']].rename(columns={'team_id': 'opp', 'm3': 'om3', 'a3': 'oa3'})
    tg = tg.merge(o, on=['game_id', 'opp']); tg = tg.rename(columns={'team_id': 'team'})
    tg['date'] = pd.to_datetime(tg.date); tg['margin'] = tg.pf - tg.pa; tg['hv'] = np.where(tg.ha == 'home', 1.0, -1.0)
    return tg.sort_values('date')
def expect(tg, min_games):
    """expected margin from ratings fitted on games before each 7-day block of the season"""
    tg = tg.copy(); tg['exp'] = np.nan
    for s, d in tg.groupby('season'):
        d0 = d.date.min()
        for k in range(int((d.date.max() - d0).days // 7) + 1):
            lo, hi = d0 + pd.Timedelta(days=7 * k), d0 + pd.Timedelta(days=7 * (k + 1))
            before = d[d.date < lo]; now = d[(d.date >= lo) & (d.date < hi)]
            if len(before) < 50 or not len(now): continue
            one = before.drop_duplicates('game_id'); R, hc = fit(one)
            cnt = pd.concat([before.team, before.opp]).value_counts()
            ok = now.team.map(cnt).fillna(0) >= min_games
            ok &= now.opp.map(cnt).fillna(0) >= min_games
            e = now.team.map(R) - now.opp.map(R) + now.hv * hc
            tg.loc[now.index[ok], 'exp'] = e[ok]
    tg['res'] = tg.margin - tg.exp
    return tg
def summ(d):
    d = d.dropna(subset=['res'])
    if len(d) < 3: return f'n {len(d)}'
    t = stats.ttest_1samp(d.res, 0); return f'{d.res.mean():+.2f} pts beyond ratings, beats them {100 * (d.res > 0).mean():.1f}% of {len(d)} (p {t.pvalue:.2f})'
def halves(d): return f'all: {summ(d)} · 2015–20: {summ(d[d.season <= 2020])} · 2021–26: {summ(d[d.season >= 2021])}'
class _O(list):
    def append(self, x): super().append(x); print(x, '\n', flush=True)
out = _O()
for lg, mg in (('nba', 10), ('mbb', 6)):
    b = load(lg); b = b[b.season_type == 2] if lg == 'nba' else b
    tg = expect(games(b[b.season_type == 2]), mg)
    # 8 three-point luck so far: opponents' 3P% in this team's earlier games minus the league's, 150+ opponent attempts
    tg = tg.sort_values('date'); g = tg.groupby(['team', 'season'])
    tg['om3c'] = g.om3.cumsum() - tg.om3; tg['oa3c'] = g.oa3.cumsum() - tg.oa3
    lgp = tg.groupby('season').apply(lambda d: d.om3.sum() / d.oa3.sum()); tg['luck'] = tg.om3c / tg.oa3c.where(tg.oa3c >= 150) - tg.season.map(lgp)
    q = tg.luck.quantile([.15, .85]).values
    lucky, unlucky = tg[tg.luck <= q[0]], tg[tg.luck >= q[1]]
    out.append(f'8 {lg.upper()} 3-POINT LUCK SO FAR: opponents shooting {-100 * q[0]:.1f}+ points under the league from three in earlier games (best 15%): {halves(lucky)} ‖ {100 * q[1]:.1f}+ over (worst 15%): {halves(unlucky)} ‖ ratings already include those games')
    if lg == 'nba':
        # 9 road trips
        tg = tg.sort_values(['team', 'date']); trip = np.zeros(len(tg)); after = np.zeros(len(tg)); last_t = None; run = 0
        for i, (t, ha) in enumerate(zip(tg.team, tg.ha)):
            if t != last_t: run = 0; last_t = t
            if ha == 'away': run += 1; trip[i] = run
            else: after[i] = run; run = 0
        tg['trip'] = trip; tg['after'] = after
        out.append(f'9 NBA ROAD TRIPS game 4+ of a trip: {halves(tg[tg.trip >= 4])} ‖ games 1–3: {summ(tg[(tg.trip >= 1) & (tg.trip <= 3)])} ‖ first home game after a 4+ game trip: {halves(tg[tg.after >= 4])} ‖ other home games: {summ(tg[(tg.ha == "home") & (tg.after < 4)])}')
        # 14 star returns
        pl = b[b.season_type == 2][['game_id', 'team_id', 'athlete_id', 'minutes', 'did_not_play', 'game_date', 'season']].copy()
        pl['date'] = pd.to_datetime(pl.game_date); pl['played'] = (pl.minutes.fillna(0) > 0) & (pl.did_not_play != True)
        rows = []
        for (t, s), d in pl.groupby(['team_id', 'season']):
            gl = d.drop_duplicates('game_id').sort_values('date')[['game_id', 'date']].values.tolist()
            pg = d.pivot_table(index='game_id', columns='athlete_id', values='minutes', aggfunc='first').reindex([x[0] for x in gl]).fillna(0)
            for i in range(10, len(gl)):
                prev = pg.iloc[:i]; avg = prev.sum() / (prev > 0).sum().replace(0, np.nan); gpn = (prev > 0).sum()
                stars = avg[(avg >= 25) & (gpn >= 5)].sort_values(ascending=False).index[:2]
                for a in stars:
                    if pg.iloc[i][a] > 0 and pg.iloc[i - 1][a] == 0 and pg.iloc[i - 2][a] == 0: rows.append((gl[i][0], t)); break
        R = tg.merge(pd.DataFrame(rows, columns=['game_id', 'team']).drop_duplicates(), on=['game_id', 'team'])
        out.append(f'14 NBA STAR BACK (top-2 minutes, 25+ a game, out 2+ games, back tonight): {halves(R)}')
    else:
        # 15 NCAA tournament experience
        S = pd.concat([pd.read_csv(f, usecols=['id', 'notes_headline'], low_memory=False) for f in sorted(glob.glob(f'{SCH}/s20*.csv'))])
        ncaa = set(S[S.notes_headline.astype(str).str.contains("Men's Basketball Championship", na=False)].id)
        p = b[['game_id', 'season', 'team_id', 'athlete_id', 'minutes']].copy(); p['minutes'] = p.minutes.fillna(0)
        tour = p[p.game_id.isin(ncaa) & (p.minutes > 0)]; played = set(zip(tour.season, tour.athlete_id))
        reg = p[~p.game_id.isin(ncaa)]
        reg = reg.assign(xm=[m if ((s - 1), a) in played else 0.0 for s, a, m in zip(reg.season, reg.athlete_id, reg.minutes)])
        sh = reg.groupby(['season', 'team_id']).agg(xm=('xm', 'sum'), m=('minutes', 'sum')).reset_index(); sh['exp_share'] = sh.xm / sh.m.clip(lower=1); sh = sh[['season', 'team_id', 'exp_share']]
        allg = expect(games(b), mg)
        T = allg[allg.game_id.isin(ncaa)].merge(sh.rename(columns={'team_id': 'team'}), on=['season', 'team'], how='left')
        T = T.merge(sh.rename(columns={'team_id': 'opp', 'exp_share': 'oexp'}), on=['season', 'opp'], how='left'); T['gap'] = T.exp_share - T.oexp
        hi = T[T.gap >= .25]
        out.append(f'15 NCAA TOURNAMENT EXPERIENCE ({T.game_id.nunique()} tournament games 2016–26): the side with 25+ points more of its minutes from last year\'s tournament players: {halves(hi)} ‖ every tournament game, per 10 points of experience gap: {np.polyfit(T.gap.dropna(), T.res[T.gap.notna()], 1)[0] / 10:+.2f} pts (r {stats.pearsonr(T.dropna(subset=["gap", "res"]).gap, T.dropna(subset=["gap", "res"]).res)[0]:.2f}) ‖ teams with none: {summ(T[T.exp_share == 0])}')
