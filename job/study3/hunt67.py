# Hunt 67 (Nov 8, 2026 — the owner 10:19 am: "you're comparing when defenses have all their top players active right and then how it changes when they
# have back up corners and things as well … this si the same way we did the tests on the basketball side" — hunt 32: matchups counted only with
# the teams as they really were). NFL, 2015–2026, prediction first (rule 12).
# Who played: a defender with a row in the weekly stats that week (any defensive stat). His defense's top players going into the week (earlier
# weeks only): CB1, CB2 and S1 by tackles + passes defended a game played; the pass rusher by sacks + QB hits; the run front (DL/LB) by tackles.
# Full strength (pass) = CB1, CB2 and S1 all played. Known before the game: the team's injury report that week (Out / Doubtful).
# Tests: (1) the toughest/easiest matchup read built only from the defense's full-strength games vs all games (the basketball test);
# (2) this week's top corner Out/Doubtful on the report: WR1/WR2/TE PPR vs his usual, beyond the defense read; (3) both together.
import sys, glob, numpy as np, pandas as pd
D, I = sys.argv[1], sys.argv[2]
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(D + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
CUR = int(W.season.max()); W['ppr'] = W.fantasy_points_ppr.fillna(0)
dc = ['def_tackles_solo', 'def_tackle_assists', 'def_pass_defended', 'def_interceptions', 'def_sacks', 'def_qb_hits', 'def_tackles_for_loss']
for c in dc + ['targets', 'carries']: W[c] = W[c].fillna(0)
grp = {'CB': 'CB', 'DB': 'CB', 'SAF': 'S', 'S': 'S', 'FS': 'S', 'SS': 'S', 'LB': 'LB', 'OLB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'DE': 'DL', 'DT': 'DL', 'NT': 'DL', 'DL': 'DL'}
Dd = W[W.position.isin(grp)].copy(); Dd['g'] = Dd.position.map(grp); Dd = Dd[Dd[dc].sum(1) > 0]
Dd['cov'] = Dd.def_tackles_solo + Dd.def_tackle_assists + 2 * Dd.def_pass_defended + 2 * Dd.def_interceptions
Dd['rush'] = Dd.def_sacks + Dd.def_qb_hits
played = set(zip(Dd.season, Dd.week, Dd.player_id))
# team schedule: weeks each defense played
sched = W.groupby(['season', 'team']).week.apply(lambda s: sorted(set(s))).to_dict()
inj = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(I + '/injuries_20*.csv'))])
inj = inj[inj.report_status.astype(str).isin(['Out', 'Doubtful'])]; inj['team'] = inj.team.replace(fix)
outrep = set(zip(inj.season, inj.week, inj.gsis_id))
# top players going into each week (earlier weeks only, 3+ games)
rows = []
for (s, t), d in Dd.groupby(['season', 'team']):
    for w in sched.get((s, t), []):
        e = d[d.week < w]
        if e.week.nunique() < 3: continue
        a = e.groupby(['player_id', 'g']).agg(n=('week', 'nunique'), cov=('cov', 'sum'), rush=('rush', 'sum'), tk=('def_tackles_solo', 'sum')).reset_index()
        a = a[a.n >= 2]; a['covg'] = a['cov'] / a.n; a['rushg'] = a.rush / a.n; a['tkg'] = a.tk / a.n
        cb = a[a.g == 'CB'].sort_values('covg', ascending=False).player_id.tolist()[:2]; sf = a[a.g == 'S'].sort_values('covg', ascending=False).player_id.tolist()[:1]
        pr = a[a.g.isin(['DL', 'LB'])].sort_values('rushg', ascending=False).player_id.tolist()[:1]; fr = a[a.g.isin(['DL', 'LB'])].sort_values('tkg', ascending=False).player_id.tolist()[:2]
        pl = lambda L: all((s, w, p) in played for p in L) if L else np.nan
        rows.append(dict(season=s, week=w, opponent_team=t, full_pass=pl(cb + sf), full_run=pl(fr), cb1_out_rep=(s, w, cb[0]) in outrep if cb else False,
                         cb_any_out_rep=any((s, w, p) in outrep for p in cb), pr_out_rep=(s, w, pr[0]) in outrep if pr else False,
                         cb1_played=((s, w, cb[0]) in played) if cb else np.nan))
F = pd.DataFrame(rows)
print('defense-weeks', len(F), '| full strength (pass)', round(F.full_pass.mean(), 3), '| CB1 out on the report', round(F.cb1_out_rep.mean(), 3), '| CB1 played', round(F.cb1_played.mean(), 3))
# offense players
O = W[W.position.isin(['WR', 'TE', 'RB'])].sort_values(['season', 'week']).copy()
O['vol'] = np.where(O.position == 'RB', O.carries, O.targets); O['cum'] = O.groupby(['player_id', 'season', 'team']).vol.cumsum() - O.vol
O['rank'] = O.groupby(['season', 'week', 'team', 'position']).cum.rank(ascending=False, method='first')
g = O.groupby(['player_id', 'season']); O['k'] = g.cumcount(); O['usual'] = (g.ppr.cumsum() - O.ppr) / O.k.replace(0, np.nan); O['diff'] = O.ppr - O.usual
O = O.merge(F, on=['season', 'week', 'opponent_team'], how='left')
res = []
for pos, r in (('WR', 1), ('WR', 2), ('TE', 1), ('RB', 1)):
    P = O[O.position == pos]; X = P[(P['rank'] == r) & (P.k >= 3) & (P.usual >= 4)].copy()
    # defense read from earlier games: all games vs full-strength games only (PPR allowed to the position)
    tot = P.groupby(['season', 'week', 'opponent_team']).ppr.sum().rename('al').reset_index().merge(F[['season', 'week', 'opponent_team', 'full_pass', 'full_run']], how='left')
    fs = 'full_run' if pos == 'RB' else 'full_pass'
    out = []
    for (s, t), d in tot.groupby(['season', 'opponent_team']):
        d = d.sort_values('week')
        for w in d.week:
            e = d[d.week < w]; ef = e[e[fs] == True]
            out.append((s, w, t, e.al.mean() if len(e) >= 4 else np.nan, ef.al.mean() if len(ef) >= 3 else np.nan, len(ef)))
    T = pd.DataFrame(out, columns=['season', 'week', 'opponent_team', 'r_all', 'r_full', 'n_full'])
    X = X.merge(T, on=['season', 'week', 'opponent_team']).dropna(subset=['r_all', 'r_full'])
    def hit(col, Y):
        q = Y.groupby(['season', 'week'])[col].rank(pct=True); lo, hi = Y[q <= .15], Y[q >= .85]
        return np.r_[(lo['diff'] < 0).values, (hi['diff'] > 0).values].mean(), len(lo) + len(hi), lo['diff'].mean(), hi['diff'].mean()
    for col, lab in (('r_all', 'all games (now)'), ('r_full', 'full-strength games only')):
        h, n, a, b = hit(col, X); hc = hit(col, X[X.season == CUR]) if (X.season == CUR).any() else (np.nan, 0, 0, 0)
        res.append(f'{pos}{r} read from {lab}: lean hit {100 * h:.1f}% of {n} (toughest {a:+.2f}, easiest {b:+.2f}) · {CUR} {100 * hc[0]:.1f}% of {hc[1]}')
    # this week: on full strength or not
    full_now = X[fs] == True
    res.append(f'{pos}{r} vs his usual when the defense is full strength {X[full_now]["diff"].mean():+.2f} ({full_now.sum()}) vs short-handed {X[~full_now]["diff"].mean():+.2f} ({(~full_now).sum()})')
    if pos != 'RB':
        o = X.cb1_out_rep == True; o2 = X.cb_any_out_rep == True
        # beyond the defense read: residual after regressing diff on the read
        b = np.polyfit(X.r_all, X['diff'], 1); X['res'] = X['diff'] - np.polyval(b, X.r_all)
        res.append(f'{pos}{r} defense\'s CB1 Out/Doubtful on the report: {X[o]["diff"].mean():+.2f} vs his usual ({o.sum()}), beyond the defense read {X[o]["res"].mean():+.2f}; '
                   f'either top-2 CB out {X[o2]["res"].mean():+.2f} ({o2.sum()}); both playing {X[~o2]["res"].mean():+.2f} · over his usual {100 * (X[o2]["diff"] > 0).mean():.1f}% vs {100 * (X[~o2]["diff"] > 0).mean():.1f}%'
                   + (f' · {CUR}: {X[o2 & (X.season == CUR)]["res"].mean():+.2f} ({int((o2 & (X.season == CUR)).sum())})'))
        e_, l_ = X.season <= 2020, X.season >= 2021
        res.append(f'{pos}{r} split: either top-2 CB out, 2015–20 {X[o2 & e_]["res"].mean():+.2f} ({int((o2 & e_).sum())}) · 2021–{CUR} {X[o2 & l_]["res"].mean():+.2f} ({int((o2 & l_).sum())}); se ≈ {X["res"].std() / np.sqrt(max(1, o2.sum())):.2f}')
    else:
        o = X.pr_out_rep == True; b = np.polyfit(X.r_all, X['diff'], 1); X['res'] = X['diff'] - np.polyval(b, X.r_all)
        res.append(f'RB1 defense\'s top pass rusher out on the report: beyond the read {X[o]["res"].mean():+.2f} ({o.sum()}) vs {X[~o]["res"].mean():+.2f}')
# RB1: the run defense's yards a carry allowed to backs, all games vs full-strength (front) games only
P = O[O.position == 'RB']; X = P[(P['rank'] == 1) & (P.k >= 3) & (P.usual >= 4)].copy()
tc = P.groupby(['season', 'week', 'opponent_team']).agg(c=('carries', 'sum'), y=('rushing_yards', 'sum')).reset_index().merge(F[['season', 'week', 'opponent_team', 'full_run']], how='left')
out = []
for (s_, t), d in tc.groupby(['season', 'opponent_team']):
    d = d.sort_values('week')
    for w in d.week:
        e = d[d.week < w]; ef = e[e.full_run == True]
        out.append((s_, w, t, e.y.sum() / e.c.sum() if len(e) >= 4 and e.c.sum() else np.nan, ef.y.sum() / ef.c.sum() if len(ef) >= 3 and ef.c.sum() else np.nan))
T = pd.DataFrame(out, columns=['season', 'week', 'opponent_team', 'ypc_all', 'ypc_full'])
X = X.merge(T, on=['season', 'week', 'opponent_team']).dropna(subset=['ypc_all', 'ypc_full'])
for col in ('ypc_all', 'ypc_full'):
    q = X.groupby(['season', 'week'])[col].rank(pct=True); lo, hi = X[q <= .15], X[q >= .85]
    h = np.r_[(lo['diff'] < 0).values, (hi['diff'] > 0).values].mean(); res.append(f'RB1 yards a carry allowed, {col}: lean hit {100 * h:.1f}% of {len(lo) + len(hi)}')
print('\n'.join(res))
