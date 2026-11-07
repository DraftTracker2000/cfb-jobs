# Pattern hunt 9 (college; Nov 6, 2026 — the owner, 5:04 pm: "we need to exhaust these before releasing. all angles … finish the hunts";
# 8:29 pm: "keep going"). STUDY ONLY; nothing goes on the site.
# The second pass on the three archive batches only one hunt had read: cf_records, cf_tstats and bb_portal.
#  H9-0x  team traits in the season stats (cf_tstats): does each one repeat year to year? (coach and scheme traits vs noise)
#  H9-20  third downs beyond the team's overall efficiency: third-down rate minus what its success rate predicts -> next season's
#         change in third-down rate and in win share (is third-down "clutch" real or does it fall back?)
#  H9-21  fourth-down rate beyond expectation (same idea, conversions)
#  H9-22  red flags for next season: sack rate allowed, interceptions thrown per attempt -> next season change in offensive PPA
#  H9-30  home vs away: is a team's home edge (home win share minus road win share) a trait that repeats? (cf_records)
#  H9-31  one-score luck proxy: conference win share minus non-conference -> repeats?
#  H9-40  basketball portal at the team level: points a game brought in through the portal (last season's, at the old school) and
#         points a game lost to it -> next season's change in SRS rating, this season's rating held fixed
# Same bar as hunts 3-8: Benjamini-Hochberg q < .10 over this round's tests, and the holdout seasons (HOLD on, lib3) the same way.
import re
import numpy as np, pandas as pd
from lib3 import bh, mech, yoy, reg_yoy, HOLD
from load import frame, pick, num


def _season(df):
    return num(pick(df, 'season', 'year')).fillna(df['_year']).astype(int)


def _resid(y, x):
    ok = np.isfinite(y) & np.isfinite(x)
    out = np.full(len(y), np.nan)
    if ok.sum() > 20: out[ok] = y[ok] - np.polyval(np.polyfit(x[ok], y[ok], 1), x[ok])
    return out


def run(reg, log, D):
    TESTS = []

    def yy(hyp, label, S, w=None, min_w=0):
        S = S[np.isfinite(S.v)]
        if len(S) < 200: log(f'[{hyp}] {label}: too few ({len(S)})'); return
        o = yoy(S, 'key', 'v', w=w, min_w=min_w); d = reg_yoy(reg, hyp, label, o); TESTS.append(hyp); log(f'[{hyp}] {label}: {d}')

    # ---------- team season stats ----------
    T = frame('cf_tstats')
    log(f'hunt9c: cf_tstats {len(T)} rows')
    P = None
    if len(T):
        T['season'] = _season(T); T['key'] = pick(T, 'team').astype(str); T['stat'] = pick(T, 'statName').astype(str); T['val'] = num(pick(T, 'statValue'))
        P = T.pivot_table(index=['key', 'season'], columns='stat', values='val', aggfunc='first').reset_index()
        g = P['games'].replace(0, np.nan)
        dv = lambda a, b: P[a] / P[b].replace(0, np.nan) if a in P and b in P else pd.Series(np.nan, index=P.index)
        P['plays'] = P.get('rushingAttempts', np.nan) + P.get('passAttempts', np.nan)
        P['plays_o'] = P.get('rushingAttemptsOpponent', np.nan) + P.get('passAttemptsOpponent', np.nan)
        F = {
            'H9-01': ('Fourth-down tries a game (aggressiveness)', P.get('fourthDowns', np.nan) / g, None),
            'H9-02': ('Fourth-down conversion rate', dv('fourthDownConversions', 'fourthDowns'), 'fourthDowns'),
            'H9-03': ('Third-down conversion rate (offense)', dv('thirdDownConversions', 'thirdDowns'), None),
            'H9-04': ('Third-down conversion rate allowed (defense)', dv('thirdDownConversionsOpponent', 'thirdDownsOpponent'), None),
            'H9-05': ('Time of possession share', P.get('possessionTime', np.nan) / (P.get('possessionTime', np.nan) + P.get('possessionTimeOpponent', np.nan)), None),
            'H9-06': ('Run share of plays', dv('rushingAttempts', 'plays'), None),
            'H9-07': ('Plays a game (tempo)', P['plays'] / g, None),
            'H9-08': ('Sacks a game by the defense', P.get('sacks', np.nan) / g, None),
            'H9-09': ('Tackles for loss a game', P.get('tacklesForLoss', np.nan) / g, None),
            'H9-10': ('Interceptions thrown per pass attempt', dv('interceptions', 'passAttempts'), None),
            'H9-11': ('Interceptions made per opponent pass attempt', dv('passesIntercepted', 'passAttemptsOpponent'), None),
            'H9-12': ('Fumbles lost a game', P.get('fumblesLost', np.nan) / g, None),
            'H9-13': ('Kick return yards per return', dv('kickReturnYards', 'kickReturns'), 'kickReturns'),
            'H9-14': ('Punt return yards per return', dv('puntReturnYards', 'puntReturns'), 'puntReturns'),
            'H9-15': ("Opponents' penalty yards a game (does a team draw flags?)", P.get('penaltyYardsOpponent', np.nan) / g, None),
            'H9-16': ('Completion rate', dv('passCompletions', 'passAttempts'), None),
            'H9-17': ('Completion rate allowed', dv('passCompletionsOpponent', 'passAttemptsOpponent'), None),
        }
        for hyp, (lab, v, wcol) in F.items():
            S = P[['key', 'season']].copy(); S['v'] = pd.to_numeric(v, errors='coerce').values
            if wcol: S['w'] = P[wcol].values; yy(hyp, lab, S, w='w', min_w=8)
            else: yy(hyp, lab, S)
        P['td3'] = dv('thirdDownConversions', 'thirdDowns'); P['td4'] = dv('fourthDownConversions', 'fourthDowns')

    # ---------- records and advanced stats ----------
    R = frame('cf_records'); A = frame('cf_adv')
    log(f'hunt9c: cf_records {len(R)} rows; columns: {[c for c in R.columns if not c.startswith("_")][:40]}')
    WS = None
    if len(R):
        R['season'] = _season(R); R['key'] = pick(R, 'team').astype(str)
        def ws(pre):
            w = num(pick(R, pre + '.wins')); l = num(pick(R, pre + '.losses')); t = num(pick(R, pre + '.ties')).fillna(0); gg = (w + l + t).replace(0, np.nan)
            return (w + t / 2) / gg, gg
        R['ws'], R['gp'] = ws('total')
        WS = R[['key', 'season', 'ws']].dropna()
        if 'homeGames.wins' in R.columns and 'awayGames.wins' in R.columns:
            h, hg = ws('homeGames'); a, ag = ws('awayGames')
            S = R[['key', 'season']].copy(); S['v'] = (h - a).values; S = S[(hg >= 4).values & (ag >= 3).values]
            yy('H9-30', 'Home edge (home win share minus road win share)', S)
        if 'conferenceGames.wins' in R.columns:
            c, cg = ws('conferenceGames'); tw = num(pick(R, 'total.wins')); tl = num(pick(R, 'total.losses')); cw = num(pick(R, 'conferenceGames.wins')); cl = num(pick(R, 'conferenceGames.losses'))
            nc = (tw - cw) / (tw + tl - cw - cl).replace(0, np.nan)
            S = R[['key', 'season']].copy(); S['v'] = (c - nc).values; S = S[(cg >= 5).values & ((tw + tl - cw - cl) >= 3).values]
            yy('H9-31', 'Conference win share minus non-conference', S)

    if P is not None and len(A):
        A['season'] = _season(A); A['key'] = pick(A, 'team').astype(str)
        X = A[['key', 'season']].copy()
        for c, n in (('offense.successRate', 'sr'), ('offense.ppa', 'ppa'), ('offense.passingDowns.successRate', 'pdsr'), ('offense.powerSuccess', 'pw')):
            X[n] = num(A[c]) if c in A else np.nan
        J = P.merge(X, on=['key', 'season'])
        if WS is not None: J = J.merge(WS, on=['key', 'season'], how='left')
        # H9-20: third downs beyond what overall success rate predicts
        J['td3x'] = _resid(J.td3.values, J.sr.values)
        J['td4x'] = _resid(J.td4.values, J.pw.values)
        nx = J[['key', 'season', 'td3', 'td4', 'ppa', 'ws']].copy(); nx['season'] -= 1
        K = J.merge(nx, on=['key', 'season'], suffixes=('', '_n'))
        K = K[K.season < K.season.max()]
        for hyp, x, y, lab, unit in (
            ('H9-20a', 'td3x', 'td3', 'Third-down rate beyond success rate -> next season third-down rate (this season held fixed)', 'rate per unit'),
            ('H9-20b', 'td3x', 'ws', 'Third-down rate beyond success rate -> next season change in win share (this season held fixed)', 'win share per unit'),
            ('H9-20c', 'td3x', 'ppa', 'Third-down rate beyond success rate -> next season change in offensive PPA (this season held fixed)', 'PPA per unit'),
            ('H9-21', 'td4x', 'td4', 'Fourth-down rate beyond short-yardage success -> next season fourth-down rate (this season held fixed)', 'rate per unit'),
        ):
            k = K.dropna(subset=[x, y, y + '_n']).copy()
            if len(k) < 200: log(f'[{hyp}] too few ({len(k)})'); continue
            dy = (k[y + '_n'] - k[y]).values; dy = dy - np.polyval(np.polyfit(k[y].values, dy, 1), k[y].values)
            r = mech(reg, hyp, lab, dy, k[x].values, k.key.values, k.season.values, unit=unit); TESTS.append(hyp); log(f'[{hyp}] {r["d"]}')
        # H9-22: sack rate allowed and interceptions thrown, beyond PPA -> next season PPA
        J['sk'] = J.get('sacksOpponent', np.nan) / (J.get('passAttempts', np.nan) + J.get('sacksOpponent', np.nan)).replace(0, np.nan)
        J['it'] = J.get('interceptions', np.nan) / J.get('passAttempts', np.nan).replace(0, np.nan)
        nx = J[['key', 'season', 'ppa']].copy(); nx['season'] -= 1
        K = J.merge(nx, on=['key', 'season'], suffixes=('', '_n')).dropna(subset=['ppa', 'ppa_n'])
        for hyp, x, lab in (('H9-22a', 'sk', 'Sack rate allowed -> next season change in offensive PPA (this season held fixed)'),
                            ('H9-22b', 'it', 'Interceptions thrown per attempt -> next season change in offensive PPA (this season held fixed)')):
            k = K.dropna(subset=[x]).copy()
            if len(k) < 200: continue
            k[x] = _resid(k[x].values, k.ppa.values)
            dy = (k.ppa_n - k.ppa).values; dy = dy - np.polyval(np.polyfit(k.ppa.values, dy, 1), k.ppa.values)
            r = mech(reg, hyp, lab, dy, k[x].values, k.key.values, k.season.values, unit='PPA per unit'); TESTS.append(hyp); log(f'[{hyp}] {r["d"]}')

    # ---------- basketball portal at the team level ----------
    nz = lambda s: re.sub(r'[^a-z]', '', re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', str(s).lower()))
    BP = frame('bb_portal'); st = frame('bb_stats'); sr = frame('bb_srs')
    log(f'hunt9c: bb_portal {len(BP)}, bb_stats {len(st)}, bb_srs {len(sr)}')
    if len(BP) and len(st) and len(sr):
        S = pd.DataFrame({'nm': pick(st, 'name').map(nz), 'tid': num(pick(st, 'teamId')), 'season': num(pick(st, 'season', '_year')),
                          'g': num(pick(st, 'games')), 'pts': num(pick(st, 'points', 'points.total'))}).dropna(subset=['nm', 'tid', 'season'])
        B = pd.DataFrame({'nm': (pick(BP, 'firstName').astype(str) + ' ' + pick(BP, 'lastName').astype(str)).map(nz), 'year': num(pick(BP, 'year', '_year')),
                          'o': num(pick(BP, 'origin.id')), 'd': num(pick(BP, 'destination.id'))}).dropna(subset=['nm', 'year', 'o'])
        best = None
        for off in (0, 1, -1):
            m = B.assign(season=B.year + off).merge(S, left_on=['nm', 'o', 'season'], right_on=['nm', 'tid', 'season'])
            if best is None or len(m) > best[1]: best = (off, len(m))
        off = best[0]; log(f'hunt9c: portal year offset {off} ({best[1]} matched at the old school)')
        pre = B.assign(season=B.year + off).merge(S, left_on=['nm', 'o', 'season'], right_on=['nm', 'tid', 'season'])
        pre = pre[pre.g >= 5].copy(); pre['ppg'] = pre.pts / pre.g
        inn = pre.dropna(subset=['d']).groupby(['d', 'season']).ppg.sum().rename('inp').reset_index().rename(columns={'d': 'team'})
        out = pre.groupby(['o', 'season']).ppg.sum().rename('outp').reset_index().rename(columns={'o': 'team'})
        RT = pd.DataFrame({'team': num(pick(sr, 'teamId')), 'season': num(pick(sr, 'season', '_year')), 'srs': num(pick(sr, 'rating'))}).dropna()
        nx = RT.copy(); nx['season'] -= 1
        K = RT.merge(nx, on=['team', 'season'], suffixes=('', '_n')).merge(inn, on=['team', 'season'], how='left').merge(out, on=['team', 'season'], how='left')
        yrs = set(pre.season.unique()); K = K[K.season.isin(yrs)].fillna({'inp': 0, 'outp': 0})
        if len(K) < 200: log(f'hunt9c: basketball portal: too few team-seasons ({len(K)})'); K = K.iloc[0:0]
        else: K['d'] = K.srs_n - K.srs; K['d'] = K.d - np.polyval(np.polyfit(K.srs, K.d, 1), K.srs)
        if len(K): log(f'hunt9c: {len(K)} team-seasons in portal years {sorted(int(y) for y in yrs)}; points a game in {K.inp.mean():.1f}, out {K.outp.mean():.1f}')
        for hyp, x, lab in (('H9-40a', 'inp', 'Points a game brought in through the portal -> next season change in SRS (this season held fixed)'),
                            ('H9-40b', 'outp', 'Points a game lost to the portal -> next season change in SRS (this season held fixed)')):
            if len(K) < 200: break
            r = mech(reg, hyp, lab, K.d.values, K[x].values, K.team.values, K.season.values + 1, unit='SRS per point a game'); TESTS.append(hyp); log(f'[{hyp}] {r["d"]}')
        if len(K) >= 200:
            K['net'] = K.inp - K.outp
            r = mech(reg, 'H9-40c', 'Net portal points a game (in minus out) -> next season change in SRS (this season held fixed)', K.d.values, K.net.values, K.team.values, K.season.values + 1, unit='SRS per point a game'); TESTS.append('H9-40c'); log(f'[H9-40c] {r["d"]}')

    # ---------- this round's BH pass ----------
    G = reg.df(); G = G[G.hyp.astype(str).str.startswith('H9-')].copy()
    if not len(G): print('::notice title=hunt9c::no tests ran'); return
    G['q'] = bh(pd.to_numeric(G.p, errors='coerce').fillna(1).values); G['survives'] = (G.q < .10) & (G.oos_pass == True)
    lines = [f'hunt9c · {len(G)} tests · BH q < .10 and the holdout ({HOLD} on) the same way']
    for _, x in G.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:260]}")
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=hunt9c {i + 1:02d}/{len(pack):02d}::{x}')
