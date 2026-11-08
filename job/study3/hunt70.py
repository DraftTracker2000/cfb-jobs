# Hunt 70 (Nov 8, 2026 — the owner 12:51 pm "go for it": idea 2, an NFL What to expect like the college one, hunt 66). Prediction first (rule 12).
# Each stat next game = his recent games weighted more (half-life 5, last season at 0.7) × what this defense allowed in that stat a game (every
# player on the other side; this season's earlier games blended with last season n/(n+3), against the league average)^a × his team's implied
# points from the closing line against its usual (this season blended with last)^b. Powers tuned on 2015–2021, scored 2022–2026 against his
# plain season average (3+ games); 2026 alone.
import sys, glob, numpy as np, pandas as pd
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(sys.argv[1] + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
G = pd.read_csv(sys.argv[2]); G = G[G.game_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
for c in ('home_team', 'away_team'): G[c] = G[c].replace(fix)
ST = {'QB': [('passing_yards', 'pass yds'), ('completions', 'completions'), ('passing_tds', 'pass TD'), ('passing_interceptions', 'INT'), ('rushing_yards', 'rush yds')],
      'RB': [('rushing_yards', 'rush yds'), ('carries', 'carries'), ('rushing_tds', 'rush TD'), ('receptions', 'catches'), ('receiving_yards', 'rec yds')],
      'WR': [('targets', 'targets'), ('receptions', 'catches'), ('receiving_yards', 'rec yds'), ('receiving_tds', 'rec TD')],
      'TE': [('targets', 'targets'), ('receptions', 'catches'), ('receiving_yards', 'rec yds'), ('receiving_tds', 'rec TD')]}
ALL = sorted({s for L in ST.values() for s, _ in L})
for c in ALL: W[c] = W[c].fillna(0)
CUR = int(W.season.max())
# lines → implied team points; team usual points
h = G.assign(team=G.home_team, pts=G.home_score, imp=G.total_line / 2 + G.spread_line / 2); a = G.assign(team=G.away_team, pts=G.away_score, imp=G.total_line / 2 - G.spread_line / 2)
TP = pd.concat([h, a])[['season', 'week', 'team', 'pts', 'imp']].sort_values('week'); gt = TP.groupby(['season', 'team'])
TP['n0'] = gt.cumcount(); TP['c0'] = (gt.pts.cumsum() - TP.pts) / TP.n0.replace(0, np.nan)
lastp = TP.groupby(['season', 'team']).pts.mean(); TP['p0'] = [lastp.get((s - 1, t), np.nan) for s, t in zip(TP.season, TP.team)]
w_ = TP.n0 / (TP.n0 + 3); TP['up'] = np.where(TP.c0.notna() & TP.p0.notna(), w_ * TP.c0 + (1 - w_) * TP.p0, TP.c0.fillna(TP.p0)); TP['lmul'] = (TP.imp / TP.up).where(TP.up > 5)
W = W.merge(TP[['season', 'week', 'team', 'lmul']], on=['season', 'week', 'team'], how='left')
# defense allowed (all players), per game
TA = W.groupby(['season', 'week', 'opponent_team'])[ALL].sum().reset_index().sort_values('week'); ga = TA.groupby(['season', 'opponent_team']); TA['n0'] = ga.cumcount()
lastA = TA.groupby(['season', 'opponent_team'])[ALL].mean(); lg = TA.groupby('season')[ALL].mean()
for s in ALL:
    cur = (ga[s].cumsum() - TA[s]) / TA.n0.replace(0, np.nan); prv = pd.Series([lastA[s].get((y - 1, t), np.nan) for y, t in zip(TA.season, TA.opponent_team)], index=TA.index)
    ww = TA.n0 / (TA.n0 + 3); TA['d_' + s] = np.where(cur.notna() & prv.notna(), ww * cur + (1 - ww) * prv, cur.fillna(prv)) / TA.season.map(lg[s]).values
W = W.merge(TA[['season', 'week', 'opponent_team'] + ['d_' + s for s in ALL]], on=['season', 'week', 'opponent_team'], how='left')
out = []
for pos, SL in ST.items():
    P = W[W.position == pos].copy()
    if pos == 'QB': P = P[P.attempts >= 10]
    elif pos == 'RB': P = P[P.carries + P.receptions >= 5]
    P = P.sort_values(['player_id', 'season', 'week']).reset_index(drop=True); gp = P.groupby(['player_id', 'season']); P['k'] = gp.cumcount()
    for s, lab in SL:
        P['avg'] = (gp[s].cumsum() - P[s]) / P.k.replace(0, np.nan)
        ew = np.full(len(P), np.nan)
        for pid, idx in P.groupby('player_id').indices.items():
            v = P[s].values[idx]; yy = P.season.values[idx]
            for i in range(1, len(idx)):
                j = np.arange(i - 1, -1, -1); j = j[yy[j] >= yy[i] - 1]
                if len(j): wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
        P['ew'] = ew; X = P[P.k >= 3].dropna(subset=['avg', 'ew']).copy(); X['dm'] = X['d_' + s].fillna(1).clip(.3, 3); X['lm'] = X.lmul.fillna(1).clip(.4, 2.5)
        tr, te = X[X.season <= 2021], X[X.season >= 2022]; mae = lambda d, p: float(np.abs(d[s] - p).mean())
        grid = [0, .25, .5, .75, 1, 1.25]
        b = min(((x, y) for x in grid for y in grid), key=lambda ab: mae(tr, tr.ew * tr.dm ** ab[0] * tr.lm ** ab[1]))
        f = lambda d: d.ew * d.dm ** b[0] * d.lm ** b[1]; e = []
        for nm, d in (('2022–26', te), (str(CUR), te[te.season == CUR])):
            e0 = mae(d, d.avg)
            if not e0: continue
            lean = np.abs(np.log((f(d) + 1) / (d.avg + 1))) >= np.log(1.05); right = ((f(d) > d.avg) == (d[s] > d.avg))[lean].mean()
            e.append(f'{nm} (n {len(d)}): average off by {e0:.2f} · recent-weighted {100 * (e0 - mae(d, d.ew)) / e0:+.1f}% · + defense {100 * (e0 - mae(d, d.ew * d.dm ** b[0])) / e0:+.1f}% · + line {100 * (e0 - mae(d, f(d))) / e0:+.1f}% · leans right {100 * right:.1f}% of {int(lean.sum())}')
        out.append(f'{pos} {lab} [defense^{b[0]} line^{b[1]}] ' + ' | '.join(e))
print('\n'.join(out))
