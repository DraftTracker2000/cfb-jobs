# Pattern hunt 11 (Nov 6, 2026 — Sam, 8:59 pm: "feel like we need to do DEEP hunts. look at the player studies and build hunts like
# them. all that"; 8:41 pm: "all player splits. team splits. anything and everything"). STUDY ONLY; nothing goes on the site.
# College football players, from the per-play player file (cf_playstats: CFBD /plays/stats, FBS 2020-2025), built the way the NFL player
# studies were (qb-receiver-study*.md): is a split a real trait of the player, or noise?
#  Part A  player splits — each one is his share or rate in a spot MINUS his own overall, so it measures the split itself, not how good he
#          is. Tested two ways: within a season (odd games vs even games) and season to season (same player, next season).
#          Receivers: red-zone target share, third-down target share, close-and-late target share (4th quarter, within 8), yards per
#          target vs ranked opponents, at home vs on the road.
#          Runners: red-zone carry share, short-yardage carry share (3rd/4th and 2 or less), yards per carry in the second half,
#          close-and-late, vs ranked, home vs road.
#          Passers: completion rate and yards per attempt on third down, in the red zone, close-and-late, vs ranked, home vs road;
#          sack rate on third down.
#          Defenders: share of the team's sacks that come on third down.
#          Game to game: how up-and-down a skill player's yards are (coefficient of variation) — a boom-or-bust trait?
#  Part B  the "tells" (as in qb-receiver-study.md): per player with one team, pooled over his seasons, does he get more of the team's
#          targets / carries in a spot than his overall share predicts? Binomial z, Benjamini-Hochberg over every player x spot. Then the
#          repeat check: a one-season tell (p < .10) against next season's share in that spot, vs players without one.
#  Part C  same receiver, different passers: receivers on the same team in back-to-back seasons — does his target share and his yards
#          per target carry over less when the team's main passer changed?
# Same bar as hunts 3-10: q < .10 over this round's tests, and the holdout (2022 on) the same way.
import numpy as np, pandas as pd
from lib3 import bh, yoy, reg_yoy, rtest, HOLD
from load import frame, pick, num
from hunt5b import playstats


def _ranked():
    rk = frame('cf_rankings', flat=False); out = set()
    if not len(rk): return out
    for _, r in rk.iterrows():
        for poll in (r.get('polls') or []):
            if 'AP' in str(poll.get('poll', '')):
                for x in poll.get('ranks') or []: out.add((int(r.get('season', r.get('_year'))), int(r.get('week', 0)), x.get('school')))
    return out


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
    # odd / even games within a season for the split-half check
    gi = P[['season', 'team', 'g', 'week']].drop_duplicates().sort_values(['season', 'team', 'week'])
    gi['half'] = gi.groupby(['season', 'team']).cumcount() % 2
    P = P.merge(gi[['season', 'team', 'g', 'half']], on=['season', 'team', 'g'], how='left')
    TESTS = []

    def both(hyp, label, M, min_w):
        """M: rows (pid, season, half, v, w) for each half and 'all' (half = -1). Split-half r (odd vs even games) and year to year."""
        A = M[M.half == -1]; A = A[A.w >= min_w].rename(columns={'pid': 'key'})
        if len(A) < 150: log(f'[{hyp}] {label}: too few ({len(A)})'); return
        o = yoy(A[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, hyp + 'y', label + ' (season to season)', o); TESTS.append(hyp + 'y'); log(f'[{hyp}y] {label}: {d}')
        h0 = M[(M.half == 0) & (M.w >= min_w / 2)]; h1 = M[(M.half == 1) & (M.w >= min_w / 2)]
        j = h0.merge(h1, on=['pid', 'season'], suffixes=('', '_1')).dropna(subset=['v', 'v_1'])
        if len(j) < 150: return
        r, p, k = rtest(j.v, j.v_1); hh = j[j.season >= HOLD]; rh, ph, kh = rtest(hh.v, hh.v_1)
        reg.add(hyp + 's', label + ' (odd vs even games, same season) — split-half r', 'family', r, np.nan, p, k, oos_pass=bool(np.isfinite(rh) and rh > 0 and ph < .10),
                detail=f'{k} player-seasons; r = {r:.3f}; holdout {HOLD}+ r = {rh:.2f} (p = {ph:.3g}, {kh})', unit='r')
        TESTS.append(hyp + 's'); log(f'[{hyp}s] {label}: split-half r {r:.3f} (n {k}); holdout {rh:.2f}')

    def share_split(rows, flag, hyp, label, min_w):
        """his share of the team's plays of this kind in the spot, minus his overall share; w = the team's plays in the spot"""
        out = []
        for half in (-1, 0, 1):
            R = rows if half == -1 else rows[rows.half == half]
            tm = R.groupby(['team', 'season']).agg(n=('playId', 'size'), ns=(flag, 'sum'))
            pl = R.groupby(['pid', 'team', 'season']).agg(n=('playId', 'size'), ns=(flag, 'sum')).reset_index().join(tm, on=['team', 'season'], rsuffix='_t')
            pl = pl[pl.n >= 10]
            pl['v'] = pl.ns / pl.ns_t.replace(0, np.nan) - pl.n / pl.n_t.replace(0, np.nan); pl['w'] = pl.ns_t; pl['half'] = half
            out.append(pl[['pid', 'season', 'half', 'v', 'w']])
        both(hyp, label, pd.concat(out), min_w)

    def rate_split(rows, flag, valcol, hyp, label, min_w, other=None):
        """his rate (mean of valcol) in the spot minus his rate elsewhere (or in `other` rows); w = his plays in the spot"""
        out = []
        for half in (-1, 0, 1):
            R = rows if half == -1 else rows[rows.half == half]
            R = R[R[flag].notna()]
            a = R[R[flag].astype(bool)].groupby(['pid', 'season'])[valcol].agg(['mean', 'size'])
            b = R[~R[flag].astype(bool)].groupby(['pid', 'season'])[valcol].agg(['mean', 'size'])
            j = a.join(b, lsuffix='_a', rsuffix='_b', how='inner').reset_index(); j = j[j.size_b >= 10]
            j['v'] = j.mean_a - j.mean_b; j['w'] = j.size_a; j['half'] = half
            out.append(j[['pid', 'season', 'half', 'v', 'w']])
        both(hyp, label, pd.concat(out), min_w)

    # ---------- Part A ----------
    REC = P[P.st == 'Reception'].copy(); TGT = P[P.st.isin(['Reception', 'Target'])].copy()
    TGT['yds'] = np.where(TGT.st == 'Reception', TGT.stat, 0.0)
    RUSH = P[P.st == 'Rush'].copy(); RUSH['yds'] = RUSH.stat
    PASS = P[P.st.isin(['Completion', 'Incompletion', 'Interception Thrown', 'Sack Taken'])].copy()
    PASS['att'] = PASS.st != 'Sack Taken'; PASS['cmp'] = (PASS.st == 'Completion').astype(float); PASS['ypa'] = np.where(PASS.st == 'Completion', PASS.stat, 0.0); PASS['sk'] = (PASS.st == 'Sack Taken').astype(float)
    PA = PASS[PASS.att]
    log(f'hunt11: targets {len(TGT)}, carries {len(RUSH)}, dropbacks {len(PASS)}')
    share_split(TGT, 'rz', 'H11-01', 'Receiver: red-zone target share minus overall target share', 30)
    share_split(TGT, 'd3', 'H11-02', 'Receiver: third-down target share minus overall', 40)
    share_split(TGT, 'cl', 'H11-03', 'Receiver: close-and-late target share minus overall', 20)
    rate_split(TGT, 'vr', 'yds', 'H11-04', 'Receiver: yards per target vs ranked minus vs others', 12)
    rate_split(TGT, 'hm', 'yds', 'H11-05', 'Receiver: yards per target at home minus on the road', 20)
    share_split(RUSH, 'rz', 'H11-10', 'Runner: red-zone carry share minus overall carry share', 30)
    share_split(RUSH, 'sy', 'H11-11', 'Runner: short-yardage carry share minus overall', 15)
    rate_split(RUSH, 'h2', 'yds', 'H11-12', 'Runner: yards per carry in the second half minus the first', 40)
    rate_split(RUSH, 'cl', 'yds', 'H11-13', 'Runner: yards per carry close-and-late minus otherwise', 15)
    rate_split(RUSH, 'vr', 'yds', 'H11-14', 'Runner: yards per carry vs ranked minus vs others', 20)
    rate_split(RUSH, 'hm', 'yds', 'H11-15', 'Runner: yards per carry at home minus on the road', 40)
    rate_split(PA, 'd3', 'cmp', 'H11-20', 'Passer: completion rate on third down minus other downs', 40)
    rate_split(PA, 'd3', 'ypa', 'H11-21', 'Passer: yards per attempt on third down minus other downs', 40)
    rate_split(PA, 'rz', 'cmp', 'H11-22', 'Passer: red-zone completion rate minus elsewhere', 25)
    rate_split(PA, 'cl', 'ypa', 'H11-23', 'Passer: yards per attempt close-and-late minus otherwise', 25)
    rate_split(PA, 'vr', 'ypa', 'H11-24', 'Passer: yards per attempt vs ranked minus vs others', 40)
    rate_split(PA, 'hm', 'ypa', 'H11-25', 'Passer: yards per attempt at home minus on the road', 60)
    rate_split(PASS, 'd3', 'sk', 'H11-26', 'Passer: sack rate on third down minus other downs', 40)
    SK = P[P.st == 'Sack'].copy()
    if len(SK):
        S = SK.groupby(['pid', 'season']).agg(n=('playId', 'size'), d3=('d3', 'sum')).reset_index(); S = S[S.n >= 4]
        S['v'] = S.d3 / S.n - SK.d3.mean(); S['w'] = S.n; S['half'] = -1
        both('H11-30', "Defender: share of his sacks on third down (pass-rush specialist)", S[['pid', 'season', 'half', 'v', 'w']], 4)
    # game to game: coefficient of variation of scrimmage yards a game
    Y = pd.concat([RUSH[['pid', 'season', 'g', 'yds']], REC.assign(yds=REC.stat)[['pid', 'season', 'g', 'yds']]]).groupby(['pid', 'season', 'g']).yds.sum().reset_index()
    C = Y.groupby(['pid', 'season']).yds.agg(['mean', 'std', 'size']).reset_index(); C = C[(C['size'] >= 8) & (C['mean'] >= 40)]
    C['v'] = C['std'] / C['mean']; C['w'] = C['size']; C['half'] = -1
    o = yoy(C.rename(columns={'pid': 'key'})[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, 'H11-40y', 'Skill player: game-to-game swing in yards (boom or bust), season to season', o); TESTS.append('H11-40y'); log(f'[H11-40y] {d}')

    # ---------- Part B: tells ----------
    from scipy import stats
    tells = []
    for kind, rows, spots in (('target', TGT, ('rz', 'd3', 'cl')), ('carry', RUSH, ('rz', 'sy', 'cl'))):
        for sp in spots:
            pl = rows.groupby(['pid', 'athleteName', 'team']).agg(n=('playId', 'size'), ns=(sp, 'sum')).reset_index()
            tm = rows.groupby('team').agg(N=('playId', 'size'), NS=(sp, 'sum'))
            # team totals over the same seasons as the player: approximate with his seasons only
            ps = rows.groupby(['pid', 'team']).season.agg(lambda s: set(s)).rename('ss')
            tms = rows.groupby(['team', 'season']).agg(N=('playId', 'size'), NS=(sp, 'sum'))
            pl = pl.join(ps, on=['pid', 'team'])
            pl['N'] = [sum(tms.N.get((t, s), 0) for s in ss) for t, ss in zip(pl.team, pl.ss)]; pl['NS'] = [sum(tms.NS.get((t, s), 0) for s in ss) for t, ss in zip(pl.team, pl.ss)]
            pl = pl[(pl.n >= 40) & (pl.NS >= 30)]
            sh = pl.n / pl.N; ex = sh * pl.NS; sd = np.sqrt(pl.NS * sh * (1 - sh)).replace(0, np.nan)
            pl['z'] = (pl.ns - ex) / sd; pl['p'] = 2 * stats.norm.sf(pl.z.abs()); pl['kind'] = kind; pl['spot'] = sp; pl['ratio'] = pl.ns / ex.replace(0, np.nan)
            tells.append(pl)
    TL = pd.concat(tells).dropna(subset=['p']); TL['q'] = bh(TL.p.values)
    sv = TL[TL.q < .10]
    log(f'hunt11 tells: {len(TL)} player x spot tests; {len(sv)} survive q < .10 ({(sv.z > 0).sum()} more than his share, {(sv.z < 0).sum()} less)')
    top = sv.sort_values('z', ascending=False).head(12)
    log('hunt11 top tells: ' + ' | '.join(f'{r.athleteName} ({r.team}) {r.kind} {r.spot} x{r.ratio:.2f} z {r.z:.1f}' for r in top.itertuples()))
    # repeat check: one-season tells (p < .10, more than his share) -> next season's ratio in that spot
    rep = []
    for kind, rows, spots in (('target', TGT, ('rz', 'd3', 'cl')), ('carry', RUSH, ('rz', 'sy', 'cl'))):
        for sp in spots:
            pl = rows.groupby(['pid', 'team', 'season']).agg(n=('playId', 'size'), ns=(sp, 'sum')).reset_index()
            tm = rows.groupby(['team', 'season']).agg(N=('playId', 'size'), NS=(sp, 'sum')); pl = pl.join(tm, on=['team', 'season']); pl = pl[(pl.n >= 25) & (pl.NS >= 15)]
            sh = pl.n / pl.N; ex = sh * pl.NS; pl['z'] = (pl.ns - ex) / np.sqrt(pl.NS * sh * (1 - sh)).replace(0, np.nan); pl['ratio'] = pl.ns / ex.replace(0, np.nan)
            nx = pl[['pid', 'team', 'season', 'ratio']].copy(); nx['season'] -= 1
            j = pl.merge(nx, on=['pid', 'team', 'season'], suffixes=('', '_n')).dropna(subset=['z', 'ratio_n'])
            j['tell'] = j.z > 1.645; j['kind'] = kind; j['spot'] = sp; rep.append(j)
    RP = pd.concat(rep)
    if len(RP):
        a = RP[RP.tell].ratio_n; b = RP[~RP.tell].ratio_n; t, p = stats.ttest_ind(a, b, equal_var=False)
        reg.add('H11-50', 'One-season tell (more of the team\'s targets/carries in a spot than his share) -> next season ratio in that spot', 'mechanism',
                a.mean() - b.mean(), np.nan, p, len(RP), oos_pass=bool(len(RP[(RP.season >= HOLD - 1) & RP.tell]) > 30 and RP[(RP.season >= HOLD - 1) & RP.tell].ratio_n.mean() > RP[(RP.season >= HOLD - 1) & ~RP.tell].ratio_n.mean()),
                detail=f'tells {len(a)}: next season {a.mean():.3f} of expected; non-tells {len(b)}: {b.mean():.3f}', unit='ratio')
        TESTS.append('H11-50'); log(f'[H11-50] tells next season {a.mean():.3f} x expected ({len(a)}), non-tells {b.mean():.3f} ({len(b)}), p {p:.3g}')
        for (k, s), x in RP.groupby(['kind', 'spot']): log(f'  {k} {s}: tells {x[x.tell].ratio_n.mean():.3f} ({x.tell.sum()}), others {x[~x.tell].ratio_n.mean():.3f}')

    # ---------- Part C: same receiver, different passers ----------
    pa = PASS.groupby(['season', 'team', 'pid']).size().rename('n').reset_index()
    main = pa.sort_values('n').groupby(['season', 'team']).tail(1).set_index(['season', 'team']).pid
    R = TGT.groupby(['pid', 'team', 'season']).agg(n=('playId', 'size'), yds=('yds', 'sum')).reset_index()
    tt = TGT.groupby(['team', 'season']).size().rename('N'); R = R.join(tt, on=['team', 'season']); R = R[R.n >= 30]
    R['sh'] = R.n / R.N; R['ypt'] = R.yds / R.n; R['qb'] = [main.get((s, t)) for s, t in zip(R.season, R.team)]
    nx = R[['pid', 'team', 'season', 'sh', 'ypt', 'qb']].copy(); nx['season'] -= 1
    j = R.merge(nx, on=['pid', 'team', 'season'], suffixes=('', '_n')); j['chg'] = j.qb != j.qb_n
    for col, lab in (('sh', 'target share'), ('ypt', 'yards per target')):
        s_ = j[~j.chg]; c_ = j[j.chg]; r1, p1_, k1 = rtest(s_[col], s_[col + '_n']); r2, p2_, k2 = rtest(c_[col], c_[col + '_n'])
        z = (np.arctanh(r1) - np.arctanh(r2)) / np.sqrt(1 / max(k1 - 3, 1) + 1 / max(k2 - 3, 1)); p = 2 * stats.norm.sf(abs(z))
        hj = j[j.season >= HOLD - 1]; hs, hc = hj[~hj.chg], hj[hj.chg]; rh1 = rtest(hs[col], hs[col + '_n'])[0]; rh2 = rtest(hc[col], hc[col + '_n'])[0]
        reg.add(f'H11-6{["sh", "ypt"].index(col)}', f'Receiver {lab} carries over less when the main passer changed (r same QB minus r new QB)', 'mechanism', r1 - r2, np.nan, p, k1 + k2,
                oos_pass=bool(np.isfinite(rh1) and np.isfinite(rh2) and rh1 > rh2), detail=f'same passer r {r1:.3f} ({k1}); new passer r {r2:.3f} ({k2}); holdout {rh1:.2f} vs {rh2:.2f}', unit='r')
        TESTS.append(f'H11-6{["sh", "ypt"].index(col)}'); log(f'[H11-6x] {lab}: same passer r {r1:.3f} ({k1}), new passer r {r2:.3f} ({k2}), p {p:.3g}')

    # ---------- this round's BH pass ----------
    Gd = reg.df(); Gd = Gd[Gd.hyp.astype(str).str.startswith('H11-')].copy()
    if not len(Gd): print('::notice title=hunt11::no tests ran'); return
    Gd['q'] = bh(pd.to_numeric(Gd.p, errors='coerce').fillna(1).values); Gd['survives'] = (Gd.q < .10) & (Gd.oos_pass == True)
    lines = [f'hunt11 · {len(Gd)} tests · BH q < .10 and the holdout ({HOLD} on) the same way']
    for _, x in Gd.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:200]}")
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:12]): print(f'::notice title=hunt11 {i + 1:02d}/{len(pack):02d}::{x}')
