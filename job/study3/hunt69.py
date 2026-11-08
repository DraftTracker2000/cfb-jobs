# Hunt 69 (Nov 8, 2026 — the owner 12:51 pm "go for it": O-line starters out). Prediction first (rule 12). NFL 2015–2026.
# His line going into each week: the five linemen listed first-string most often on the team's depth chart in the earlier weeks of the season
# (nflverse depth charts — weekly 2015–2024, daily snapshots 2025 on, a snapshot counts for the week it was taken before). Out = Out or Doubtful
# on that week's injury report (known before kickoff). Outcomes: the RB1's and the QB's PPR vs their usual (earlier games this season), and the
# same beyond the defense read (points allowed to the position, earlier weeks). Split 2015–2020 / 2021–2026 to see it carry.
import sys, glob, numpy as np, pandas as pd
WD, ID, DD = sys.argv[1], sys.argv[2], sys.argv[3]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV', 'LAR': 'LA', 'WSH': 'WAS', 'JAC': 'JAX'}
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(WD + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
W['ppr'] = W.fantasy_points_ppr.fillna(0); W['carries'] = W.carries.fillna(0); W['attempts'] = W.attempts.fillna(0); CUR = int(W.season.max())
# first-string OL listings by team-season-week
OLP = {'LT', 'LG', 'C', 'RG', 'RT'}; rows = []
for f in sorted(glob.glob(DD + '/dc20*.csv')):
    y = int(f[-8:-4]); d = pd.read_csv(f, low_memory=False)
    if 'depth_team' in d.columns:
        d = d[(d.game_type == 'REG') & (d.depth_team.astype(str) == '1') & d.depth_position.isin(OLP)]
        rows += list(zip([y] * len(d), d.club_code.replace(fix), d.week.astype(int), d.gsis_id))
    else:
        start = {2025: '2025-09-04', 2026: '2026-09-10'}[y]; d = d[d.pos_abb.isin(OLP) & (d.pos_rank == 1)]
        days = (pd.to_datetime(d.dt).dt.tz_localize(None) - pd.Timestamp(start)).dt.days
        wk = np.floor(days / 7).astype(int) + 2   # a snapshot taken during week w's lead-up counts toward week w+1 onward (earlier weeks only below)
        d = d.assign(week=wk)[(wk >= 1) & (wk <= 19)]
        d = d.drop_duplicates(['team', 'week', 'gsis_id'])
        rows += list(zip([y] * len(d), d.team.replace(fix), d.week, d.gsis_id))
L = pd.DataFrame(rows, columns=['season', 'team', 'week', 'gsis'])
inj = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(ID + '/injuries_20*.csv'))]); inj['team'] = inj.team.replace(fix)
out_ = set(zip(inj[inj.report_status.astype(str).isin(['Out', 'Doubtful'])].season, inj[inj.report_status.astype(str).isin(['Out', 'Doubtful'])].week, inj[inj.report_status.astype(str).isin(['Out', 'Doubtful'])].gsis_id))
ol = []
for (s, t), d in L.groupby(['season', 'team']):
    for w in range(3, 19):
        e = d[d.week < w]
        if e.week.nunique() < 2: continue
        c = e.groupby('gsis').agg(n=('week', 'nunique'), last=('week', 'max')).sort_values(['n', 'last'], ascending=False).head(5)
        ol.append((s, t, w, sum((s, w, g) in out_ for g in c.index)))
O = pd.DataFrame(ol, columns=['season', 'team', 'week', 'ol_out'])
print('team-weeks', len(O), '| OL starters out:', O.ol_out.value_counts().sort_index().to_dict())
W = W.sort_values(['season', 'week']); g = W.groupby(['player_id', 'season']); W['k'] = g.cumcount(); W['usual'] = (g.ppr.cumsum() - W.ppr) / W.k.replace(0, np.nan); W['diff'] = W.ppr - W.usual
W['vol'] = np.where(W.position == 'QB', W.attempts, W.carries); W['cum'] = W.groupby(['player_id', 'season', 'team']).vol.cumsum() - W.vol
W['rank'] = W.groupby(['season', 'week', 'team', 'position']).cum.rank(ascending=False, method='first')
res = []
for pos in ('RB', 'QB'):
    P = W[W.position == pos]; X = P[(P['rank'] == 1) & (P.k >= 3) & (P.usual >= (10 if pos == 'QB' else 5))].merge(O, on=['season', 'team', 'week'])
    al = P.groupby(['season', 'week', 'opponent_team']).ppr.sum().rename('al').reset_index().sort_values('week'); ga = al.groupby(['season', 'opponent_team'])
    al['n'] = ga.cumcount(); al['rd'] = (ga.al.cumsum() - al.al) / al.n.replace(0, np.nan); X = X.merge(al[['season', 'week', 'opponent_team', 'rd', 'n']], on=['season', 'week', 'opponent_team'])
    X = X[X.n >= 2]; b = np.polyfit(X.rd, X['diff'], 1); X['res'] = X['diff'] - np.polyval(b, X.rd)
    for k, lab in ((0, 'none out'), (1, 'one out'), (2, 'two or more out')):
        Y = X[(X.ol_out == k) if k < 2 else (X.ol_out >= 2)]
        e_, l_ = Y[Y.season <= 2020], Y[Y.season >= 2021]
        res.append(f'{pos}1, {lab}: {len(Y)} games · vs his usual {Y["diff"].mean():+.2f} · beyond the defense read {Y.res.mean():+.2f} (2015–20 {e_.res.mean():+.2f}, 2021–{CUR} {l_.res.mean():+.2f}) · over his usual {100 * (Y["diff"] > 0).mean():.1f}% · se {X.res.std() / np.sqrt(max(len(Y), 1)):.2f}')
print('\n'.join(res))
