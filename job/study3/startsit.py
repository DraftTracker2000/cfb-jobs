# Start/sit and waiver accuracy (Nov 8, 2026 — the owner, 9:51 pm: "this and #4 are things we should have been testing every week since we
# started this, this wouldve been really good for accuracy testing"). STUDY ONLY. nflverse weekly stats 2015–2026, schedules + lines,
# snap counts 2013–2025.
#  START/SIT  every week, at each position, every pair of fantasy regulars (QB 12+, RB/WR 8+, TE 6+ PPR a game so far, 3+ games): we'd
#             start the one our number puts higher. Right = he outscored the other. Our number: his recent games weighted more × what this
#             defense has allowed to the position in PPR (this season blended with last) ^a × his team's implied points vs its usual ^b,
#             powers fit on 2015–2021. Baseline: his plain season average. Scored 2022–2026, and 2026 alone.
#  WAIVER     a player under 10 PPR a game whose offensive snap share over his last 2 games is 15+ points above his 3 before: his next 3
#             games against players with the same points a game so far whose snaps didn't jump.
import sys, glob, numpy as np, pandas as pd
WD, GC, NV = sys.argv[1:4]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
W = pd.concat([pd.read_csv(f, low_memory=False, usecols=['player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'team', 'opponent_team', 'fantasy_points_ppr']) for f in sorted(glob.glob(WD + '/w20*.csv'))])
W = W[(W.season_type == 'REG') & W.position.isin(['QB', 'RB', 'WR', 'TE'])].copy()
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
G = pd.read_csv(GC); G = G[G.game_type == 'REG']
for c in ('home_team', 'away_team'): G[c] = G[c].replace(fix)
h = G.assign(team=G.home_team, pts=G.home_score, imp=G.total_line / 2 + G.spread_line / 2); a = G.assign(team=G.away_team, pts=G.away_score, imp=G.total_line / 2 - G.spread_line / 2)
TP = pd.concat([h, a])[['season', 'week', 'team', 'pts', 'imp']].sort_values('week'); gt = TP.groupby(['season', 'team'])
TP['n0'] = gt.cumcount(); TP['c0'] = (gt.pts.cumsum() - TP.pts) / TP.n0.replace(0, np.nan); lp = TP.groupby(['season', 'team']).pts.mean()
TP['p0'] = [lp.get((s - 1, t), np.nan) for s, t in zip(TP.season, TP.team)]; w_ = TP.n0 / (TP.n0 + 3)
TP['up'] = np.where(TP.c0.notna() & TP.p0.notna(), w_ * TP.c0 + (1 - w_) * TP.p0, TP.c0.fillna(TP.p0)); TP['lm'] = (TP.imp / TP.up).where(TP.up > 5).clip(.4, 2.5)
W = W.merge(TP[['season', 'week', 'team', 'lm']], on=['season', 'week', 'team'], how='left')
# defense PPR allowed to the position, earlier games (this season blended with last), vs the league
DA = W.groupby(['season', 'week', 'opponent_team', 'position']).fantasy_points_ppr.sum().reset_index().sort_values('week')
g2 = DA.groupby(['season', 'opponent_team', 'position']); DA['n0'] = g2.cumcount(); DA['cur'] = (g2.fantasy_points_ppr.cumsum() - DA.fantasy_points_ppr) / DA.n0.replace(0, np.nan)
la = DA.groupby(['season', 'opponent_team', 'position']).fantasy_points_ppr.mean(); DA['prv'] = [la.get((s - 1, t, p), np.nan) for s, t, p in zip(DA.season, DA.opponent_team, DA.position)]
lg = DA.groupby(['season', 'position']).fantasy_points_ppr.mean(); ww = DA.n0 / (DA.n0 + 3)
DA['dm'] = (np.where(DA.cur.notna() & DA.prv.notna(), ww * DA.cur + (1 - ww) * DA.prv, DA.cur.fillna(DA.prv)) / [lg.get((s, p)) for s, p in zip(DA.season, DA.position)]).clip(.3, 3)
W = W.merge(DA[['season', 'week', 'opponent_team', 'position', 'dm']], on=['season', 'week', 'opponent_team', 'position'], how='left')
W = W.sort_values(['player_id', 'season', 'week']).reset_index(drop=True); gp = W.groupby(['player_id', 'season'])
W['k'] = gp.cumcount(); W['avg'] = (gp.fantasy_points_ppr.cumsum() - W.fantasy_points_ppr) / W.k.replace(0, np.nan)
ew = np.full(len(W), np.nan)
for pid, idx in W.groupby('player_id').indices.items():
    v = W.fantasy_points_ppr.values[idx]; yy = W.season.values[idx]
    for i in range(1, len(idx)):
        j = np.arange(i - 1, -1, -1); j = j[yy[j] >= yy[i] - 1]
        if len(j): wt = .5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
W['ew'] = ew; MIN = {'QB': 12, 'RB': 8, 'WR': 8, 'TE': 6}
X = W[(W.k >= 3) & (W.avg >= W.position.map(MIN))].dropna(subset=['avg', 'ew']).copy(); X['dm'] = X.dm.fillna(1); X['lm'] = X.lm.fillna(1)
def pairs(d, col):
    right = tot = 0
    for _, g in d.groupby(['season', 'week', 'position']):
        p = g[col].values; f = g.fantasy_points_ppr.values; n = len(p)
        if n < 2: continue
        i, j = np.triu_indices(n, 1); keep = (p[i] != p[j]) & (f[i] != f[j])
        right += ((p[i] > p[j]) == (f[i] > f[j]))[keep].sum(); tot += keep.sum()
    return right / max(tot, 1), tot
out = []
for pos in ['QB', 'RB', 'WR', 'TE']:
    P = X[X.position == pos]; tr, te = P[P.season <= 2021], P[P.season >= 2022]
    best = max(((a, b) for a in [0, .25, .5, .75, 1] for b in [0, .25, .5, .75, 1]), key=lambda ab: pairs(tr.assign(q=tr.ew * tr.dm ** ab[0] * tr.lm ** ab[1]), 'q')[0])
    line = [f'{pos} [defense^{best[0]} line^{best[1]}]']
    for nm, d in (('2022–26', te), ('2026', te[te.season == te.season.max()])):
        d = d.assign(q=d.ew * d.dm ** best[0] * d.lm ** best[1]); b0, n = pairs(d, 'avg'); b1, _ = pairs(d, 'ew'); b2, _ = pairs(d, 'q')
        line.append(f'{nm}: season average {100 * b0:.1f}% · recent-weighted {100 * b1:.1f}% · ours {100 * b2:.1f}% of {n:,} start/sit calls')
    out.append(' · '.join(line))
# WAIVER: snap share jumps
sn = []
for y in range(2015, 2026):
    s = pd.read_csv(f'{NV}/snap_{y}.csv.gz'); s = s[(s.game_type == 'REG') & s.position.isin(['RB', 'WR', 'TE'])][['season', 'week', 'player', 'team', 'offense_pct']]; sn.append(s)
SN = pd.concat(sn); SN['team'] = SN.team.replace(fix); SN['nm'] = SN.player.str.lower().str.replace(r'[^a-z]', '', regex=True)
W['nm'] = W.player_display_name.str.lower().str.replace(r'[^a-z]', '', regex=True)
V = W[W.position.isin(['RB', 'WR', 'TE'])].merge(SN[['season', 'week', 'nm', 'team', 'offense_pct']], on=['season', 'week', 'nm', 'team'], how='inner').sort_values(['player_id', 'season', 'week']).reset_index(drop=True)
rows = []
for (pid, s), d in V.groupby(['player_id', 'season']):
    sp, f, wk = d.offense_pct.values, d.fantasy_points_ppr.values, d.week.values
    for i in range(5, len(d) - 1):
        last2, prev3 = sp[i - 1:i + 1].mean(), sp[i - 4:i - 1].mean(); ppg = f[:i + 1].mean()
        nxt = f[i + 1:i + 4]
        if len(nxt) < 2 or ppg >= 10: continue
        rows.append((s, d.position.iat[0], ppg, last2 - prev3, nxt.mean()))
R = pd.DataFrame(rows, columns=['season', 'pos', 'ppg', 'jump', 'next'])
R['b'] = pd.cut(R.ppg, [0, 3, 5, 7, 10]); R['riser'] = R.jump >= .15
base = R[~R.riser].groupby(['pos', 'b'], observed=True).next.mean(); R['exp'] = [base.get((p, b), np.nan) for p, b in zip(R.pos, R.b)]
for pos in ['RB', 'WR', 'TE']:
    r = R[(R.pos == pos) & R.riser]
    out.append(f'WAIVER {pos}: snap share up 15+ points (n {len(r)}): next 3 games {r.next.mean():.1f} PPR a game vs {r.exp.mean():.1f} for players with the same points so far whose snaps didn\'t jump ({r.next.mean() - r.exp.mean():+.1f}); became 10+ a game {100 * (r.next >= 10).mean():.0f}% vs {100 * (R[(R.pos == pos) & ~R.riser].next >= 10).mean():.0f}% · 2022–25: {r[r.season >= 2022].next.mean() - r[r.season >= 2022].exp.mean():+.1f}')
for o in out: print(o)
