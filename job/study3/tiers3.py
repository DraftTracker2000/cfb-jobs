# Tier lines for Data Busters, part 3 (Nov 23 — rule 15): the college player-role tests (cfbroles 2, 3, 4, 6, 7; hunt 11 / 36 / 62's
# definitions) by the player's team tier that season — power programs vs Group of 5. STUDY ONLY; prints aggregates as notices.
import numpy as np, pandas as pd
from lib3 import yoy
from load import frame, pick, num
from hunt5b import playstats
from hunt11 import _ranked
from tiers2 import power, note


def run(reg, log, D):
    P = playstats()
    if P is None: print('::notice title=tiers3::no per-play player file in this run'); return
    for c in ('down', 'distance', 'yardsToGoal', 'period'): P[c] = pd.to_numeric(P[c], errors='coerce') if c in P.columns else np.nan
    if 'playId' not in P.columns: P['playId'] = np.arange(len(P))
    P['pid'] = P.athleteId.astype(str); P['diff'] = P.teamScore - P.opponentScore
    P['rz'] = P.yardsToGoal <= 20; P['d3'] = P.down == 3; P['sy'] = P.down.isin([3, 4]) & (P.distance <= 2)
    P['cl'] = (P.period >= 4) & (P['diff'].abs() <= 8)
    RK = _ranked(); P['vr'] = [(int(s), int(w), o) in RK or (int(s), int(w) - 1, o) in RK for s, w, o in zip(P.season, P.week.fillna(0), P.opponent)]
    G = frame('cf_games'); home, conf = {}, {}
    if len(G):
        gid = num(pick(G, 'id')).astype('Int64').astype(str); ht, at = pick(G, 'homeTeam').astype(str), pick(G, 'awayTeam').astype(str)
        hc, ac, ss = pick(G, 'homeConference'), pick(G, 'awayConference'), num(pick(G, 'season'))
        home = dict(zip(gid, ht))
        for t, c, s in zip(ht, hc, ss):
            if isinstance(c, str) and s == s: conf[(t, int(s))] = c
        for t, c, s in zip(at, ac, ss):
            if isinstance(c, str) and s == s: conf.setdefault((t, int(s)), c)
    P['hm'] = [home.get(g) == t if g in home else np.nan for g, t in zip(P.g, P.team)]
    tiers = {}
    def pw(t, s):
        k = (t, int(s))
        if k not in tiers: tiers[k] = power(conf.get(k, ''), t, int(s))
        return tiers[k]
    P['pw'] = [pw(t, s) for t, s in zip(P.team, P.season)]
    TGT = P[P.st.isin(['Reception', 'Target'])].copy(); TGT['yds'] = np.where(TGT.st == 'Reception', TGT.stat, 0.0)
    RUSH = P[P.st == 'Rush'].copy(); RUSH['yds'] = RUSH.stat
    PASS = P[P.st.isin(['Completion', 'Incompletion', 'Interception Thrown', 'Sack Taken'])].copy()
    PASS['cmp'] = (PASS.st == 'Completion').astype(float); PASS['ypa'] = np.where(PASS.st == 'Completion', PASS.stat, 0.0)
    PA = PASS[PASS.st != 'Sack Taken']
    log(f'tiers3: {len(P)} rows, seasons {int(P.season.min())}-{int(P.season.max())}; power share of rows {P.pw.mean():.3f}')
    lines = []

    def share(rows, flag, min_t):
        tm = rows.groupby(['team', 'season']).agg(n_t=('playId', 'size'), ns_t=(flag, 'sum'))
        pl = rows.groupby(['pid', 'team', 'season']).agg(n=('playId', 'size'), ns=(flag, 'sum'), pw=('pw', 'first')).reset_index().join(tm, on=['team', 'season'])
        pl = pl[(pl.n >= 10) & (pl.ns_t >= min_t)]; pl['v'] = pl.ns / pl.ns_t - pl.n / pl.n_t; return pl

    def rate(rows, flag, val, min_in):
        R = rows[rows[flag].notna()]; f = R[flag].astype(bool)
        a = R[f].groupby(['pid', 'team', 'season'])[val].agg(['mean', 'size']); b = R[~f].groupby(['pid', 'team', 'season'])[val].agg(['mean', 'size'])
        j = a.join(b, lsuffix='_a', rsuffix='_b', how='inner').reset_index(); j = j[(j.size_b >= 10) & (j.size_a >= min_in)]
        j['v'] = j.mean_a - j.mean_b; j['pw'] = [pw(t, s) for t, s in zip(j.team, j.season)]; return j

    def ends(pl, label, same_team=True, scale=100, unit=''):
        k = ['pid', 'team', 'season'] if same_team else ['pid', 'season']
        nx = pl[k + ['v']].copy(); nx['season'] -= 1
        J = pl.merge(nx, on=k, suffixes=('', '_n'))
        if len(J) < 30: lines.append(f'{label}: too few ({len(J)})'); return
        for nm, f in (('all', lambda d: d), ('power', lambda d: d[d.pw]), ('G5', lambda d: d[~d.pw])):
            d = f(J)
            if len(d) < 30: lines.append(f'{label} {nm}: too few ({len(d)})'); continue
            hi = d.v >= d.groupby('season').v.transform(lambda x: x.quantile(.85)); lo = d.v <= d.groupby('season').v.transform(lambda x: x.quantile(.15))
            t, b = d[hi], d[lo]; o = yoy(f(pl).rename(columns={'pid': 'key'})[['key', 'season', 'v']], 'key', 'v')
            lines.append(f'{label} {nm}: {len(d)} pairs · top 15% {scale * t.v.mean():+.1f} → {scale * t.v_n.mean():+.1f}{unit}, {(t.v_n > 0).sum()} of {len(t)} stayed above 0 · '
                         f'bottom 15% {scale * b.v.mean():+.1f} → {scale * b.v_n.mean():+.1f}, {(b.v_n < 0).sum()} of {len(b)} stayed below · r {o["r"]:.2f} ({o["k"]})')

    # cfbroles 2: a receiver's red-zone target share beyond his usual share, same team next season
    ends(share(TGT, 'rz', 30), 'receiver red-zone role (points of share)')
    # cfbroles 7: third-down completion rate minus his own elsewhere
    ends(rate(PA, 'd3', 'cmp', 40), 'passer third-down completion (points)', same_team=False)
    # cfbroles 6: receiver yards per target at home minus on the road
    ends(rate(TGT, 'hm', 'yds', 20), 'receiver home minus road (yards a target)', same_team=False, scale=1)
    # cfbroles 3: clutch and big-game splits (year-to-year link by tier)
    for lab, rows, flag, val, mn in (('receiver vs ranked ypt', TGT, 'vr', 'yds', 12), ('runner close-late ypc', RUSH, 'cl', 'yds', 15),
                                     ('passer close-late ypa', PA, 'cl', 'ypa', 25), ('passer vs ranked ypa', PA, 'vr', 'ypa', 40), ('runner vs ranked ypc', RUSH, 'vr', 'yds', 20)):
        j = rate(rows, flag, val, mn)
        for nm, f in (('all', lambda d: d), ('power', lambda d: d[d.pw]), ('G5', lambda d: d[~d.pw])):
            if len(j) < 30 or len(f(j)) < 30: lines.append(f'clutch {lab} {nm}: too few'); continue
            o = yoy(f(j).rename(columns={'pid': 'key'})[['key', 'season', 'v']], 'key', 'v'); lines.append(f'clutch {lab} {nm}: r {o["r"]:.2f} ({o["k"]} pairs)')
    # cfbroles 4: one-season leans (tells) → next season's ratio in that spot
    rep = []
    for kind, rows, spots in (('target', TGT, ('rz', 'd3', 'cl')), ('carry', RUSH, ('rz', 'sy', 'cl'))):
        for sp in spots:
            pl = rows.groupby(['pid', 'team', 'season']).agg(n=('playId', 'size'), ns=(sp, 'sum'), pw=('pw', 'first')).reset_index()
            tm = rows.groupby(['team', 'season']).agg(N=('playId', 'size'), NS=(sp, 'sum')); pl = pl.join(tm, on=['team', 'season']); pl = pl[(pl.n >= 25) & (pl.NS >= 15)]
            sh = pl.n / pl.N; ex = sh * pl.NS; pl['z'] = (pl.ns - ex) / np.sqrt(pl.NS * sh * (1 - sh)).replace(0, np.nan); pl['ratio'] = pl.ns / ex.replace(0, np.nan)
            nx = pl[['pid', 'team', 'season', 'ratio']].copy(); nx['season'] -= 1
            j = pl.merge(nx, on=['pid', 'team', 'season'], suffixes=('', '_n')).dropna(subset=['z', 'ratio_n']); j['tell'] = j.z > 1.645; j['spot'] = kind + ' ' + sp; rep.append(j)
    RP = pd.concat(rep)
    for nm, f in (('all', lambda d: d), ('power', lambda d: d[d.pw]), ('G5', lambda d: d[~d.pw])):
        d = f(RP); lines.append(f'leans {nm}: {d.tell.sum()} tells → {d[d.tell].ratio_n.mean():.2f}× next season; {(~d.tell).sum()} others → {d[~d.tell].ratio_n.mean():.2f}×')
    for l in lines: log(l)
    note('tiers3 roles', lines)
