# Hunt 72 (Nov 8, 2026 — the owner, 7:19 pm: "obviously just do all the 16 pattern hunts"; the "Next ideas — Nov 8" list). NFL. STUDY ONLY.
# nflverse schedules + closing lines (1999–2026), weekly player stats (2015–2026), play-by-play (2016–2025), rosters and snap counts
# (2012–2025), read locally. Prediction first (rule 12): every tag is known before kickoff, then scored on the games after it.
#   1/2  look-ahead and letdown, NFL: favorites before a division game against a winning team; teams after a 7+ point upset win
#   10   out of it: teams at a third of their games won or worse, 10+ games in — against the line, and their skill players' fantasy points
#   11   garbage time: a back's or receiver's share of PPR points with the game out of reach — does a high share fall off next season?
#   12   receivers beside receivers: does a good WR2 (known before the season) lift the WR1's yards a target?
#   14   the game a star comes back (team's top-2 fantasy player or its QB, out 2+ games): does the line overreact?
#   portal 14 (the owner's question): do Super Bowl teams run young, old or in the middle? Snap-weighted age of every team.
# Usage: python3 hunt72.py WEEKLY_DIR GAMES_CSV NFLV_DIR
import sys, glob, numpy as np, pandas as pd
from scipy import stats
WD, GC, NV = sys.argv[1:4]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
G = pd.read_csv(GC); G = G[G.game_type == 'REG'].dropna(subset=['result', 'spread_line']).copy()
for c in ('home_team', 'away_team'): G[c] = G[c].replace(fix)
h = G.assign(team=G.home_team, opp=G.away_team, margin=G.result, exp=G.spread_line, pf=G.home_score, pa=G.away_score)
a = G.assign(team=G.away_team, opp=G.home_team, margin=-G.result, exp=-G.spread_line, pf=G.away_score, pa=G.home_score)
T = pd.concat([h, a])[['game_id', 'season', 'week', 'gameday', 'team', 'opp', 'margin', 'exp', 'div_game', 'pf', 'pa']].sort_values(['team', 'season', 'week'])
T['cover'] = T.margin - T.exp; T['win'] = (T.margin > 0) + .5 * (T.margin == 0)
gp = T.groupby(['team', 'season']); T['n_before'] = gp.cumcount(); T['w_before'] = gp.win.cumsum() - T.win
T['pct'] = T.w_before / T.n_before.replace(0, np.nan)
T['next_opp'] = gp.opp.shift(-1); T['next_div'] = gp.div_game.shift(-1); T['prev_exp'] = gp.exp.shift(1); T['prev_margin'] = gp.margin.shift(1)
pct = T.set_index(['season', 'week', 'team']).pct
T['next_opp_pct'] = [pct.get((s, w, o), np.nan) if isinstance(o, str) else np.nan for s, w, o in zip(T.season, T.week, T.next_opp)]
BE = 52.4
def summ(d):
    d = d[d.cover != 0].dropna(subset=['cover'])
    if len(d) < 3: return f'n {len(d)}'
    t = stats.ttest_1samp(d.cover, 0); return f'{d.cover.mean():+.2f} pts vs the line, covers {100 * (d.cover > 0).mean():.1f}% of {len(d)} (p {t.pvalue:.2f})'
def halves(d): return f'all: {summ(d)} · 1999–2012: {summ(d[d.season <= 2012])} · 2013–26: {summ(d[d.season >= 2013])}'
out = []
fav = T[T.exp > 0]
la = (fav.next_div == 1) & (fav.next_opp_pct >= .5)
out.append(f'1 LOOK-AHEAD (NFL) favorites before a division game against a team at .500 or better: {halves(fav[la])} ‖ other favorites: {summ(fav[~la])}')
ups = (T.prev_exp <= -7) & (T.prev_margin > 0)
out.append(f'2 LETDOWN (NFL) the game after a 7+ point upset win: {halves(T[ups])} ‖ everyone else: {summ(T[~ups & T.prev_exp.notna()])}')
oo = (T.n_before >= 10) & (T.pct <= 1 / 3)
out.append(f'10 OUT OF IT (a third of games won or fewer, 10+ in): {halves(T[oo])} ‖ as favorites: {summ(T[oo & (T.exp > 0)])} ‖ as underdogs: {summ(T[oo & (T.exp < 0)])} ‖ their opponents in those games are the mirror')
# players on out-of-it teams: PPR vs his own earlier average that season
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(WD + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
W = W.sort_values(['player_id', 'season', 'week']); gw = W.groupby(['player_id', 'season'])
W['k'] = gw.cumcount(); W['avg'] = (gw.fantasy_points_ppr.cumsum() - W.fantasy_points_ppr) / W.k.replace(0, np.nan)
W = W.merge(T[['season', 'week', 'team', 'pct', 'n_before']], on=['season', 'week', 'team'], how='left')
sk = W[W.position.isin(['RB', 'WR', 'TE', 'QB']) & (W.k >= 4) & (W.avg >= 8)]
o2 = (sk.n_before >= 10) & (sk.pct <= 1 / 3); n2 = (sk.n_before >= 10) & ~o2
rel = lambda d: f'{100 * (d.fantasy_points_ppr.sum() / d.avg.sum() - 1):+.1f}% vs their usual ({len(d)} player-games)'
out.append(f'10b OUT OF IT, fantasy (8+ PPR regulars, weeks 11+): on out-of-it teams {rel(sk[o2])} ‖ everyone else those weeks {rel(sk[n2])}')
# 11 garbage time from play-by-play
pb = []
for f in sorted(glob.glob(NV + '/pbp_20*.csv.gz')):
    p = pd.read_csv(f, usecols=['season', 'season_type', 'wp', 'qtr', 'score_differential', 'rusher_player_id', 'receiver_player_id', 'rushing_yards',
                                 'receiving_yards', 'complete_pass', 'rush_touchdown', 'pass_touchdown', 'play_type'], low_memory=False)
    p = p[(p.season_type == 'REG') & p.play_type.isin(['run', 'pass'])]
    gb = (p.wp < .1) | (p.wp > .9) | ((p.qtr >= 4) & (p.score_differential.abs() >= 17))
    r = p[p.rusher_player_id.notna()].assign(pid=lambda d: d.rusher_player_id, pts=lambda d: .1 * d.rushing_yards.fillna(0) + 6 * d.rush_touchdown.fillna(0), gb=gb)
    c = p[p.receiver_player_id.notna()].assign(pid=lambda d: d.receiver_player_id, pts=lambda d: d.complete_pass.fillna(0) + .1 * d.receiving_yards.fillna(0) + 6 * d.pass_touchdown.fillna(0), gb=gb)
    pb.append(pd.concat([r, c])[['season', 'pid', 'pts', 'gb']])
PB = pd.concat(pb); S = PB.groupby(['pid', 'season']).apply(lambda d: pd.Series({'pts': d.pts.sum(), 'g': d[d.gb].pts.sum()})).reset_index()
S['share'] = S.g / S.pts.where(S.pts > 0)
gm = W.groupby(['player_id', 'season']).agg(gp=('week', 'nunique'), ppg=('fantasy_points_ppr', 'mean'), pos=('position', 'first')).reset_index().rename(columns={'player_id': 'pid'})
S = S.merge(gm, on=['pid', 'season']); S = S[S.pos.isin(['RB', 'WR', 'TE']) & (S.gp >= 8) & (S.pts >= 50)]
N = S.merge(S[['pid', 'season', 'ppg']].assign(season=lambda d: d.season - 1), on=['pid', 'season'], suffixes=('', '_next'))
N['chg'] = N.ppg_next - N.ppg
tr, te = N[N.season <= 2020], N[N.season >= 2021]
X = lambda d, g: np.column_stack([np.ones(len(d)), d.ppg] + ([d.share] if g else []))
for g in (0, 1):
    b = np.linalg.lstsq(X(tr, g), tr.ppg_next, rcond=None)[0]; e = np.abs(te.ppg_next - X(te, g) @ b).mean()
    if g == 0: e0 = e
    else: b1, e1 = b, e
hi = N.share >= N.share.quantile(.8); lo = N.share <= N.share.quantile(.2)
out.append(f'11 GARBAGE TIME (backs and receivers, 50+ PPR from scrimmage, 8+ games): top 20% garbage share ({N.share.quantile(.8):.0%}+) changed {N[hi].chg.mean():+.2f} PPG next season vs bottom 20% {N[lo].chg.mean():+.2f} (all {N.chg.mean():+.2f}; {len(N)} player-seasons) ‖ predicting next season\'s PPG on 2021–25 with his PPG alone {e0:.2f} off, + garbage share {e1:.2f} off ({100 * (e0 - e1) / e0:+.1f}%; weight {b1[2]:+.1f} PPG per 100% share)')
# 12 WR beside WR: the season's WR1 and WR2 by targets; WR2 quality = his yards a target LAST season (known before); WR1 yards a target this season vs last
Wr = W[W.position == 'WR'].groupby(['player_id', 'season', 'team']).agg(tg=('targets', 'sum'), yd=('receiving_yards', 'sum')).reset_index()
Wr['ypt'] = Wr.yd / Wr.tg.where(Wr.tg >= 30)
prev = Wr.groupby(['player_id', 'season']).apply(lambda d: d.yd.sum() / max(d.tg.sum(), 1) if d.tg.sum() >= 30 else np.nan).rename('ypt_prev').reset_index().assign(season=lambda d: d.season + 1)
Wr = Wr.merge(prev, on=['player_id', 'season'], how='left'); Wr = Wr.sort_values('tg', ascending=False)
rk = Wr.groupby(['team', 'season']).cumcount(); w1 = Wr[rk == 0].set_index(['team', 'season']); w2 = Wr[rk == 1].set_index(['team', 'season'])
J = w1[['ypt', 'ypt_prev', 'tg']].join(w2[['ypt_prev']].rename(columns={'ypt_prev': 'w2prev'}), how='inner').dropna().reset_index()
lgp = J.w2prev.median()
tr, te = J[J.season <= 2020], J[J.season >= 2021]
Xa = lambda d, g: np.column_stack([np.ones(len(d)), d.ypt_prev] + ([d.w2prev] if g else []))
for g in (0, 1):
    b = np.linalg.lstsq(Xa(tr, g), tr.ypt, rcond=None)[0]; e = np.abs(te.ypt - Xa(te, g) @ b).mean()
    if g == 0: f0 = e
    else: f1, bb = e, b
hi = J.w2prev >= J.w2prev.quantile(.75); lo = J.w2prev <= J.w2prev.quantile(.25)
out.append(f'12 WR BESIDE WR (NFL): WR1s whose WR2 was good last season (top quarter, {J.w2prev.quantile(.75):.1f}+ yards a target) went {J[hi].ypt.mean() - J[hi].ypt_prev.mean():+.2f} yards a target vs their own last season; with a weak WR2 (bottom quarter) {J[lo].ypt.mean() - J[lo].ypt_prev.mean():+.2f} ({len(J)} WR1 seasons) ‖ predicting his yards a target on 2021–25: his own last season {f0:.3f} off, + his WR2 {f1:.3f} ({100 * (f0 - f1) / f0:+.1f}%; {bb[2]:+.2f} per yard of WR2)')
# 14 star returns: team's QB (most attempts so far) or a top-2 PPR player (4+ games, season to date), missing 2+ straight team games, back this week
Wk = W[['player_id', 'season', 'week', 'team', 'position', 'fantasy_points_ppr', 'attempts']].copy()
rows = []
for (t, s), d in T.groupby(['team', 'season']):
    weeks = d.week.tolist(); P = Wk[(Wk.team == t) & (Wk.season == s)]
    seen = {}
    for i, w in enumerate(weeks):
        here = set(P[P.week == w].player_id)
        if i >= 6:
            before = P[P.week < w]; ppg = before.groupby('player_id').fantasy_points_ppr.agg(['mean', 'size']); ppg = ppg[ppg['size'] >= 4]['mean'].sort_values(ascending=False)
            qb = before[before.position == 'QB'].groupby('player_id').attempts.sum().sort_values(ascending=False)
            stars = set(ppg.index[:2]) | set(qb.index[:1])
            for pid in stars:
                if pid in here and all(pid not in set(P[P.week == weeks[i - k]].player_id) for k in (1, 2)):
                    rows.append((t, s, w))
                    break
R = T.merge(pd.DataFrame(rows, columns=['team', 'season', 'week']).drop_duplicates(), on=['team', 'season', 'week'])
out.append(f'14 STAR BACK (QB or top-2 fantasy player, out 2+ games, back this week): {halves(R)} ‖ as favorites {summ(R[R.exp > 0])} ‖ as underdogs {summ(R[R.exp < 0])}')
# portal 14: snap-weighted age of each team, Super Bowl teams vs the league
ages = []
for y in range(2013, 2026):
    f = glob.glob(f'{NV}/roster_{y}.csv*')
    if not f: continue
    ro = pd.read_csv(f[0], low_memory=False)[['pfr_id', 'birth_date']].dropna().drop_duplicates('pfr_id')
    sn = pd.read_csv(f'{NV}/snap_{y}.csv.gz'); sn = sn[sn.game_type == 'REG']
    sn['snaps'] = sn.offense_snaps.fillna(0) + sn.defense_snaps.fillna(0)
    sn = sn.merge(ro, left_on='pfr_player_id', right_on='pfr_id', how='inner'); sn['team'] = sn.team.replace(fix)
    sn['age'] = (pd.Timestamp(f'{y}-09-01') - pd.to_datetime(sn.birth_date, errors='coerce')).dt.days / 365.25
    A = sn.dropna(subset=['age']).groupby('team').apply(lambda d: np.average(d.age, weights=d.snaps.clip(lower=0) + 1e-9)).rename('age').reset_index(); A['season'] = y
    A['rank'] = A.age.rank(ascending=False); ages.append(A)
A = pd.concat(ages)
GS = pd.read_csv(GC); sb = GS[GS.game_type == 'SB'][['season', 'home_team', 'away_team', 'result']]
sbt = []
for _, x in sb.iterrows():
    win = x.home_team if x.result > 0 else x.away_team
    for t in (x.home_team, x.away_team): sbt.append((int(x.season), fix.get(t, t), t == win))
SB = pd.DataFrame(sbt, columns=['season', 'team', 'won']).merge(A, on=['season', 'team'])
po = GS[GS.game_type.isin(['WC', 'DIV', 'CON', 'SB'])]; pt = set(zip(po.season, po.home_team.replace(fix))) | set(zip(po.season, po.away_team.replace(fix)))
A['playoff'] = [(s, t) in pt for s, t in zip(A.season, A.team)]
ln = ', '.join(f"{r.season} {r.team}{' ✓' if r.won else ''} {r.age:.1f} (#{int(r['rank'])})" for _, r in SB.sort_values('season').iterrows())
out.append(f'P14 SUPER BOWL AGE (snap-weighted age on Sept 1, 2013–2025; rank 1 = oldest of 32): Super Bowl teams average rank {SB["rank"].mean():.1f} (winners {SB[SB.won]["rank"].mean():.1f}), age {SB.age.mean():.2f} vs league {A.age.mean():.2f} · playoff teams {A[A.playoff].age.mean():.2f} vs non-playoff {A[~A.playoff].age.mean():.2f} · {ln}')
for o in out: print(o, '\n')
