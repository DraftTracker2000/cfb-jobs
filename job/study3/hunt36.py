# Pattern hunt 36 (Nov 7, 2026): retest series, part 8 — college football player splits, prediction first (rule 12). STUDY ONLY.
# Hunt 11 threw these out as "not a trait" (split-half / next-season r). Same per-play player file (cf_playstats, FBS 2020-2025).
# Each split = his rate in a spot minus his own rate elsewhere. Tagged top/bottom 15% from his EARLIER seasons only, scored on the next.
import numpy as np, pandas as pd
from scipy import stats
from load import frame, pick, num
from hunt5b import playstats
from hunt11 import _ranked

def run(reg, log, D):
    P = playstats()
    if P is None: print('::notice title=hunt11::no per-play player file in this run'); return
    log(f'hunt11: {len(P)} player-play rows; columns: {[c for c in P.columns][:40]}')
    for c in ('down', 'distance', 'yardsToGoal', 'period'):
        P[c] = pd.to_numeric(P[c], errors='coerce') if c in P.columns else np.nan
    if 'playId' not in P.columns: P['playId'] = np.arange(len(P))
    P['pid'] = P.athleteId.astype(str); P['diff'] = P.teamScore - P.opponentScore
    P['rz'] = P.yardsToGoal <= 20; P['d3'] = P.down == 3; P['sy'] = P.down.isin([3, 4]) & (P.distance <= 2)
    P['cl'] = (P.period >= 4) & (P['diff'].abs() <= 8); P['h2'] = P.period >= 3
    RK = _ranked(); P['vr'] = [(int(s), int(w), o) in RK or (int(s), int(w) - 1, o) in RK for s, w, o in zip(P.season, P.week.fillna(0), P.opponent)]
    G = frame('cf_games'); home = {}
    if len(G): home = dict(zip(num(pick(G, 'id')).astype('Int64').astype(str), pick(G, 'homeTeam').astype(str)))
    P['hm'] = [home.get(g) == t if g in home else np.nan for g, t in zip(P.g, P.team)]
    log(f'hunt11: red zone {P.rz.mean():.3f}, third down {P.d3.mean():.3f}, close-late {P.cl.mean():.3f}, vs ranked {P.vr.mean():.3f}, home known {P.hm.notna().mean():.3f}')
    TGT = P[P.st.isin(['Reception', 'Target'])].copy(); TGT['yds'] = np.where(TGT.st == 'Reception', TGT.stat, 0.0)
    RUSH = P[P.st == 'Rush'].copy(); RUSH['yds'] = RUSH.stat
    PASS = P[P.st.isin(['Completion', 'Incompletion', 'Interception Thrown', 'Sack Taken'])].copy()
    PASS['att'] = PASS.st != 'Sack Taken'; PASS['cmp'] = (PASS.st == 'Completion').astype(float); PASS['ypa'] = np.where(PASS.st == 'Completion', PASS.stat, 0.0); PASS['sk'] = (PASS.st == 'Sack Taken').astype(float)
    PA = PASS[PASS.att]
    OUT = []
    def split_test(rows, flag, val, lab, min_in):
        r = rows[rows[flag].notna()].copy(); r['f'] = r[flag].astype(bool)
        g = r.groupby(['pid', 'season', 'f'])[val].agg(['sum', 'size']).unstack('f', fill_value=0)
        g.columns = [f'{a}_{int(b)}' for a, b in g.columns]; g = g.reset_index()
        for top in (True, False):
            tg_v, rs_v, kept, ntg = [], [], 0, 0
            for s in sorted(g.season.unique())[1:]:
                pr = g[g.season < s].groupby('pid')[['sum_1', 'size_1', 'sum_0', 'size_0']].sum(); pr = pr[(pr.size_1 >= min_in) & (pr.size_0 >= 3 * min_in)]
                if len(pr) < 20: continue
                d = pr.sum_1 / pr.size_1 - pr.sum_0 / pr.size_0; cut = d.quantile(.85 if top else .15); tg = set(d.index[d >= cut] if top else d.index[d <= cut])
                now = g[(g.season == s) & g.pid.isin(d.index) & (g.size_1 >= max(3, min_in // 3)) & (g.size_0 >= min_in)].copy(); now['v'] = now.sum_1 / now.size_1 - now.sum_0 / now.size_0
                a = now[now.pid.isin(tg)]; tg_v.append(a.v); rs_v.append(now[~now.pid.isin(tg)].v); kept += int(((a.v > 0) if top else (a.v < 0)).sum()); ntg += len(a)
            if not tg_v: OUT.append(f'{lab}: too few'); continue
            A, B = pd.concat(tg_v), pd.concat(rs_v); t, p = stats.ttest_ind(A, B, equal_var=False)
            OUT.append(f'{lab} ({"top" if top else "bottom"} 15%): next season {A.mean():+.3f} vs {B.mean():+.3f} others → {A.mean() - B.mean():+.3f} (p {p:.2g}, {len(A)} players) · same side again {kept} of {ntg}')
    split_test(TGT, 'vr', 'yds', 'P1 receiver yards per target vs ranked minus vs others', 12)
    split_test(RUSH, 'vr', 'yds', 'P2 runner yards per carry vs ranked minus vs others', 20)
    split_test(PA, 'vr', 'ypa', 'P3 passer yards per attempt vs ranked minus vs others', 40)
    split_test(PA, 'cl', 'ypa', 'P4 passer yards per attempt close-and-late', 25)
    split_test(RUSH, 'cl', 'yds', 'P5 runner yards per carry close-and-late', 15)
    split_test(TGT, 'hm', 'yds', 'P6 receiver yards per target at home minus road', 20)
    split_test(RUSH, 'h2', 'yds', 'P7 runner yards per carry 2nd half minus 1st', 40)
    split_test(PA, 'd3', 'cmp', 'P8 passer completion rate on third down', 40)
    split_test(PA, 'rz', 'cmp', 'P9 passer red-zone completion rate', 25)
    split_test(PASS, 'd3', 'sk', 'P10 passer sack rate on third down', 40)
    for o in OUT: log(o)
    s_ = ' ‖ '.join(OUT); [print(f'::notice title=hunt36 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
