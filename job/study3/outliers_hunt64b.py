# Outliers for the study book from hunt 64 part B (backs behind different lines) and its tight-end note, Nov 22, 2026 — outliers on both
# sides. STUDY ONLY. nflverse weekly stats 2015–2025, regular season. A back with 100+ carries who changed teams: his yards a carry the year
# before, the new team's backs' yards a carry the year before (without him), and his yards a carry and PPR a game at the new team.
# Prediction framing: which number called his new yards a carry better, his own or the new line's. Tight ends with 40+ targets who moved:
# target share before and after. Usage: python3 outliers_hunt64b.py <weekly dir> <out.json>
import sys, glob, json, numpy as np, pandas as pd
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(sys.argv[1] + '/w20*.csv'))]); W = W[(W.season_type == 'REG') & (W.season <= 2025)].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}; W['team'] = W.team.replace(fix)
for c in ('carries', 'rushing_yards', 'targets', 'fantasy_points_ppr'): W[c] = W[c].fillna(0)
P = W.groupby(['player_id', 'player_display_name', 'position', 'season', 'team']).agg(car=('carries', 'sum'), ry=('rushing_yards', 'sum'), tg=('targets', 'sum'), ppr=('fantasy_points_ppr', 'sum'), g=('week', 'nunique')).reset_index()
P = P.assign(use=P.car + P.tg).sort_values('use').groupby(['player_id', 'season']).tail(1)   # main team that season (carries + targets)
TB = W[W.position == 'RB'].groupby(['season', 'team']).agg(car=('carries', 'sum'), ry=('rushing_yards', 'sum'))
TT = W.groupby(['season', 'team']).targets.sum()
RES = {}
R = P[(P.position == 'RB') & (P.car >= 100)].copy(); nx = R.set_index(['player_id', 'season'])
rows = []
for r in R.itertuples():
    k = (r.player_id, r.season + 1)
    if k not in nx.index: continue
    n = nx.loc[k]
    if n.car < 100: continue
    moved = n.team != r.team
    if moved and (r.season, n.team) in TB.index:
        t = TB.loc[(r.season, n.team)]; line = t.ry / t.car
    else: line = np.nan
    rows.append([r.player_display_name, r.team, n.team, int(r.season), moved, r.ry / r.car, line, n.ry / n.car, r.ppr / r.g, n.ppr / n.g])
D = pd.DataFrame(rows, columns=['name', 'old', 'new', 'season', 'moved', 'ypc', 'line', 'ypc_next', 'ppg', 'ppg_next'])
M = D[D.moved & D.line.notna()].copy(); S_ = D[~D.moved]
X = np.column_stack([np.ones(len(M)), M.line, M.ypc]); b, *_ = np.linalg.lstsq(X, M.ypc_next, rcond=None)
M['err_own'] = (M.ypc_next - M.ypc).abs(); M['err_line'] = (M.ypc_next - M.line).abs()
RES['backs'] = {'movers': int(len(M)), 'stayers': int(len(S_)), 'w_line': round(float(b[1]), 2), 'w_own': round(float(b[2]), 2),
    'closer_line': int((M.err_line < M.err_own).sum()), 'r_line': round(float(np.corrcoef(M.line, M.ypc_next)[0, 1]), 2), 'r_own': round(float(np.corrcoef(M.ypc, M.ypc_next)[0, 1]), 2),
    'r_ppg_movers': round(float(np.corrcoef(M.ppg, M.ppg_next)[0, 1]), 2), 'ppg_kept': int((abs(M.ppg_next - M.ppg) < 3).sum())}
f = lambda r: [r['name'], r['old'], r['new'], int(r['season']) + 1, round(float(r['ypc']), 1), round(float(r['line']), 1), round(float(r['ypc_next']), 1), round(float(r['ppg']), 1), round(float(r['ppg_next']), 1)]
M['gain'] = M.ypc_next - M.ypc
RES['backs']['up'] = [f(r) for _, r in M.sort_values('gain', ascending=False).head(5).iterrows()]; RES['backs']['down'] = [f(r) for _, r in M.sort_values('gain').head(5).iterrows()]
# tight ends
T = P[(P.position == 'TE')].copy(); T['share'] = [r.tg / TT.loc[(r.season, r.team)] if (r.season, r.team) in TT.index else np.nan for r in T.itertuples()]
T40 = T[T.tg >= 40]; nt = T.set_index(['player_id', 'season']); rows = []
for r in T40.itertuples():
    k = (r.player_id, r.season + 1)
    if k in nt.index: n = nt.loc[k]; rows.append([r.player_display_name, r.team, n.team, int(r.season), n.team != r.team, r.share, n.share])
E = pd.DataFrame(rows, columns=['name', 'old', 'new', 'season', 'moved', 's0', 's1']).dropna(); Em = E[E.moved]; Es = E[~E.moved]
g = lambda r: [r['name'], r['old'], r['new'], int(r['season']) + 1, round(100 * float(r['s0']), 1), round(100 * float(r['s1']), 1)]
Em = Em.assign(ch=Em.s1 - Em.s0)
RES['te'] = {'movers': int(len(Em)), 'stayers': int(len(Es)), 'r_movers': round(float(np.corrcoef(Em.s0, Em.s1)[0, 1]), 2), 'r_stayers': round(float(np.corrcoef(Es.s0, Es.s1)[0, 1]), 2),
             'kept_share_movers': round(float((Em.s1 / Em.s0).median()), 2), 'kept_share_stayers': round(float((Es.s1 / Es.s0).median()), 2),
             'up': [g(r) for _, r in Em.sort_values('ch', ascending=False).head(4).iterrows()], 'down': [g(r) for _, r in Em.sort_values('ch').head(4).iterrows()]}
print(json.dumps(RES, indent=1)); json.dump(RES, open(sys.argv[2], 'w'), indent=1)
