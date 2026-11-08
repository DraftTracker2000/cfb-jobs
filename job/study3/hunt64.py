# Pattern hunt 64 (Nov 8, 2026 — 8:21 am: "we need to do a toughest matchups-weakest matchups … did we look at RBs in all of this to see what was
# rb talent vs bad oline and you would have to look at them behind different lines … include TE's as well").
# Part A (rule 12, prediction first): a defense's fantasy points allowed to a position, from the weeks before only — raw (what the site's DvP uses
#   now) and adjusted for whom it faced (each player's points vs his own usual) — does it call next week? Players facing the toughest / weakest
#   15% vs their own usual.
# Part B: backs behind different lines — RBs who changed teams: does his yards a carry follow him or the new line?  TEs: target share, same test.
# Usage: python3 hunt64.py NFLW_DIR
import sys, glob, numpy as np, pandas as pd
D = sys.argv[1]
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(D + '/w20*.csv'))])
W = W[W.season_type == 'REG'].copy()
W['ppr'] = W.fantasy_points_ppr.fillna(0)
W = W[W.position.isin(['QB', 'RB', 'WR', 'TE'])]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
W = W.sort_values(['season', 'week'])
print('rows', len(W), W.season.min(), W.season.max())

# ---------- Part A ----------
# his usual: mean PPR in his earlier games this season (3+), only players who matter (usual >= 5 for RB/WR/TE, 10 for QB)
W['n_prev'] = W.groupby(['player_id', 'season']).cumcount()
W['usual'] = W.groupby(['player_id', 'season']).ppr.transform(lambda s: s.shift().expanding().mean())
W['diff'] = W.ppr - W.usual
out = []
for pos in ['QB', 'RB', 'WR', 'TE']:
    P = W[W.position == pos]
    # defense per game: raw = points all players at the position scored; adj = sum of (ppr - usual) over players with a usual
    g = P.groupby(['season', 'week', 'opponent_team']).agg(raw=('ppr', 'sum')).reset_index()
    ga = P[P.n_prev >= 3].groupby(['season', 'week', 'opponent_team'])['diff'].sum().rename('adj').reset_index()
    g = g.merge(ga, how='left').fillna({'adj': 0})
    rows = []
    for (s, d), G in g.groupby(['season', 'opponent_team']):
        G = G.sort_values('week')
        rm = G.raw.shift().expanding().mean(); am = G.adj.shift().expanding().mean(); n = G.raw.shift().expanding().count()
        for w, r, a, k in zip(G.week, rm, am, n): rows.append((s, w, d, r, a, k))
    T = pd.DataFrame(rows, columns=['season', 'week', 'opponent_team', 'raw_m', 'adj_m', 'ng'])
    lg = P.groupby(['season', 'week', 'game_id']).size()  # unused
    X = P[(P.n_prev >= 3) & (P.usual >= (10 if pos == 'QB' else 5))].merge(T, on=['season', 'week', 'opponent_team'])
    X = X[X.ng >= 4]
    for m in ('raw_m', 'adj_m'):
        X[m + 'z'] = X.groupby(['season', 'week'])[m].rank(pct=True)
    for m, lab in (('raw_m', 'raw (now)'), ('adj_m', 'vs whom they faced')):
        q = X[m + 'z']; tough = X[q <= .15]; weak = X[q >= .85]; mid = X[(q > .15) & (q < .85)]
        r = np.corrcoef(X[m], X['diff'])[0, 1]
        # lean hit: toughest -> under his usual, weakest -> over
        hit = (np.r_[(tough['diff'] < 0).values, (weak['diff'] > 0).values]).mean()
        # out of sample: train seasons <= 2021 -> same rule is fixed (percentiles), so just split the scoring
        late = X[X.season >= 2022]; ql = late[m + 'z']
        hit_l = (np.r_[(late[ql <= .15]['diff'] < 0).values, (late[ql >= .85]['diff'] > 0).values]).mean()
        cur = X[X.season == X.season.max()]; qc = cur[m + 'z']; nc = int((qc <= .15).sum() + (qc >= .85).sum())
        hit_c = (np.r_[(cur[qc <= .15]['diff'] < 0).values, (cur[qc >= .85]['diff'] > 0).values]).mean() if nc else np.nan
        out.append((pos, lab, len(X), round(tough['diff'].mean(), 2), round(mid['diff'].mean(), 2), round(weak['diff'].mean(), 2), round(r, 3), round(100 * hit, 1), round(100 * hit_l, 1), f'{100 * hit_c:.1f} ({nc})'))
print('\nPart A — PPR vs his own usual, by the defense (from earlier weeks only), 2015–2025, weeks with 4+ games of history')
print(pd.DataFrame(out, columns=['pos', 'defense read', 'player-games', 'toughest 15%', 'middle', 'weakest 15%', 'r', 'lean hit %', 'lean hit % 2022+', 'this season (n)']).to_string(index=False))

# ---------- Part B: behind different lines ----------
S = W.groupby(['season', 'player_id', 'player_display_name', 'position', 'team']).agg(car=('carries', 'sum'), ry=('rushing_yards', 'sum'), tg=('targets', 'sum'), gp=('week', 'nunique'), ppr=('ppr', 'sum')).reset_index()
tm = W.groupby(['season', 'team']).agg(T_car=('carries', 'sum'), T_ry=('rushing_yards', 'sum'), T_tg=('targets', 'sum')).reset_index()
rbT = W[W.position == 'RB'].groupby(['season', 'team']).agg(R_car=('carries', 'sum'), R_ry=('rushing_yards', 'sum')).reset_index()
teT = W[W.position == 'TE'].groupby(['season', 'team']).agg(E_tg=('targets', 'sum')).reset_index()
S = S.merge(tm).merge(rbT, how='left').merge(teT, how='left')
# main team per player-season (most carries / targets)
S = S.sort_values('car', ascending=False)
def nxt(pos, vol, minv):
    A = S[(S.position == pos) & (S[vol] >= minv)].drop_duplicates(['season', 'player_id'])
    B = A.copy(); B['season'] -= 1
    M = A.merge(B, on=['season', 'player_id'], suffixes=('', '_n'))
    return M
def ols(y, Xs, names):
    X = np.column_stack([np.ones(len(y))] + Xs); b, *_ = np.linalg.lstsq(X, y, rcond=None); res = y - X @ b
    se = np.sqrt(np.diag(np.linalg.inv(X.T @ X)) * (res @ res) / (len(y) - X.shape[1]))
    r2 = 1 - (res @ res) / ((y - y.mean()) @ (y - y.mean()))
    return ', '.join(f'{n} {bb:+.2f} (se {s:.2f})' for n, bb, s in zip(['const'] + names, b, se)) + f' · R² {r2:.3f}'
M = nxt('RB', 'car', 100)
M['ypc'] = M.ry / M.car; M['ypc_n'] = M.ry_n / M.car_n
# the line he's behind: the team's other backs' yards a carry that season (him taken out)
M['oth'] = (M.R_ry - M.ry) / (M.R_car - M.car).replace(0, np.nan)          # his old team's other backs, same season
nl = S[S.position == 'RB'].groupby(['season', 'team']).apply(lambda g: pd.Series({'tcar': g.car.sum(), 'try': g.ry.sum()})).reset_index()
M = M.merge(nl.rename(columns={'team': 'team_n', 'tcar': 'nl_car', 'try': 'nl_ry'}), on=['season', 'team_n'], how='left')
M['newline'] = M.nl_ry / M.nl_car          # the new team's backs the season BEFORE he got there (he wasn't there)
mv = M[(M.team != M.team_n)].dropna(subset=['ypc', 'ypc_n', 'newline', 'oth'])
st = M[(M.team == M.team_n)].dropna(subset=['ypc', 'ypc_n', 'oth'])
print(f'\nPart B — running backs, 100+ carries both seasons, 2015–2025: {len(mv)} changed teams, {len(st)} stayed')
print(' movers, next-season yards a carry =', ols(mv.ypc_n.values, [mv.ypc.values, mv.newline.values, mv.oth.values], ['his own ypc', "new team's backs ypc (year before)", "old team's other backs"]))
print(' stayers, next-season yards a carry =', ols(st.ypc_n.values, [st.ypc.values, st.oth.values], ['his own ypc', "teammates' ypc (same line)"]))
# his edge over his own line (his ypc minus the other backs') — does it carry when he moves?
mv['edge'] = mv.ypc - mv.oth; mv['edge_n'] = mv.ypc_n - mv.newline
print(' movers: his edge over his old line\'s other backs → next season vs the new team\'s backs (year before): r =', round(np.corrcoef(mv.edge, mv.edge_n)[0, 1], 3))
print(' movers: raw ypc → raw ypc r =', round(np.corrcoef(mv.ypc, mv.ypc_n)[0, 1], 3), '| new line ypc → his ypc r =', round(np.corrcoef(mv.newline, mv.ypc_n)[0, 1], 3))
st['edge'] = st.ypc - st.oth
print(' stayers: raw ypc → raw ypc r =', round(np.corrcoef(st.ypc, st.ypc_n)[0, 1], 3))
# fantasy points a game for movers
mv['ppg'] = mv.ppr / mv.gp; mv['ppg_n'] = mv.ppr_n / mv.gp_n
print(' movers PPR a game: r =', round(np.corrcoef(mv.ppg, mv.ppg_n)[0, 1], 3))
# TEs: target share
E = nxt('TE', 'tg', 40)
E['sh'] = E.tg / E.T_tg; E['sh_n'] = E.tg_n / E.T_tg_n
te_prev = S[S.position == 'TE'].groupby(['season', 'team']).tg.sum().rename('te_tg').reset_index().merge(tm[['season', 'team', 'T_tg']])
te_prev['te_sh'] = te_prev.te_tg / te_prev.T_tg
E = E.merge(te_prev[['season', 'team', 'te_sh']].rename(columns={'team': 'team_n', 'te_sh': 'newte'}), on=['season', 'team_n'], how='left')
emv = E[E.team != E.team_n].dropna(subset=['sh', 'sh_n', 'newte']); est = E[E.team == E.team_n]
print(f'\nTEs, 40+ targets both seasons: {len(emv)} changed teams, {len(est)} stayed')
print(' movers, next-season target share =', ols(emv.sh_n.values, [emv.sh.values, emv.newte.values], ['his own share', "new team's TEs' share (year before)"]))
print(' stayers r =', round(np.corrcoef(est.sh, est.sh_n)[0, 1], 3), '| movers r =', round(np.corrcoef(emv.sh, emv.sh_n)[0, 1], 3))
E['ppg'] = E.ppr / E.gp; E['ppg_n'] = E.ppr_n / E.gp_n; emv = E[E.team != E.team_n].dropna(subset=['ppg', 'ppg_n', 'newte'])
print(' movers PPR a game r =', round(np.corrcoef(emv.ppg, emv.ppg_n)[0, 1], 3))

# ---------- Part C: the back's line vs the defense's run defense, week to week (earlier weeks only) ----------
R = W[W.position == 'RB'].copy()
o = R.groupby(['season', 'week', 'team']).agg(c=('carries', 'sum'), y=('rushing_yards', 'sum')).reset_index()
d = R.groupby(['season', 'week', 'opponent_team']).agg(c=('carries', 'sum'), y=('rushing_yards', 'sum')).reset_index()
def prior(g, key):
    out = []
    for (s, t), G in g.groupby(['season', key]):
        G = G.sort_values('week'); cc = G.c.shift().cumsum(); yy = G.y.shift().cumsum(); n = G.c.shift().expanding().count()
        out += [(s, w, t, y_ / c_ if c_ else np.nan, k) for w, c_, y_, k in zip(G.week, cc, yy, n)]
    return pd.DataFrame(out, columns=['season', 'week', key, 'ypc_' + key, 'n_' + key])
X = R[(R.n_prev >= 3) & (R.usual >= 5)].merge(prior(o, 'team'), on=['season', 'week', 'team']).merge(prior(d, 'opponent_team'), on=['season', 'week', 'opponent_team'])
X = X[(X.n_team >= 4) & (X.n_opponent_team >= 4)].dropna(subset=['ypc_team', 'ypc_opponent_team'])
rawA = W[W.position == 'RB'].groupby(['season', 'week', 'opponent_team']).ppr.sum().reset_index()
rr = []
for (s, t), G in rawA.groupby(['season', 'opponent_team']):
    G = G.sort_values('week'); rr += list(zip([s] * len(G), G.week, [t] * len(G), G.ppr.shift().expanding().mean()))
X = X.merge(pd.DataFrame(rr, columns=['season', 'week', 'opponent_team', 'dvp']), on=['season', 'week', 'opponent_team'])
X['runmu'] = X.ypc_team + X.ypc_opponent_team
print(f'\nPart C — RBs, {len(X)} player-games: PPR vs his usual')
for m, lab in (('dvp', 'points allowed to backs (now)'), ('ypc_opponent_team', "defense's yards a carry allowed to backs"), ('ypc_team', "his line: his team's backs' yards a carry"), ('runmu', 'line + run defense')):
    q = X.groupby(['season', 'week'])[m].rank(pct=True); hi = X[q >= .85]; lo = X[q <= .15]; mid = X[(q > .15) & (q < .85)]
    hit = np.r_[(lo['diff'] < 0).values, (hi['diff'] > 0).values].mean()
    late = X.season >= 2022; ql = q[late]; L = X[late]
    hl = np.r_[(L[ql <= .15]['diff'] < 0).values, (L[ql >= .85]['diff'] > 0).values].mean()
    print(f'  {lab:45s} worst 15% {lo["diff"].mean():+.2f} · middle {mid["diff"].mean():+.2f} · best 15% {hi["diff"].mean():+.2f} · r {np.corrcoef(X[m], X["diff"])[0,1]:.3f} · lean hit {100*hit:.1f}% (2022–25 {100*hl:.1f}%)')
Z = X.dropna(subset=['dvp']); zs = lambda v: (v - v.mean()) / v.std()
print('  both together (z-scored):', ols(Z['diff'].values, [zs(Z.dvp).values, zs(Z.ypc_team).values, zs(Z.ypc_opponent_team).values], ['points allowed', 'his line', 'run defense']))
