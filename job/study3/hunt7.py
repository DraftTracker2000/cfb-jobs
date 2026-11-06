# Pattern hunt 7 (Nov 6, 2026 — the owner, 5:04 pm on the data save: "we need to exhaust these before releasing. all angles … finish the hunts.
# do more then we can make the release call"). STUDY ONLY; nothing goes on the site.
# The study archive's batches no hunt has read yet: cf_adv (CFBD advanced season stats), cf_tstats (season team stats), cf_records
# (records with CFBD's expected wins) and cf_usage (player usage shares). bb_portal (basketball transfers) is left for its own round:
# I haven't looked at its fields.
#  H7-01..  which advanced stats are skill and which are noise: each one's year-to-year repeat (offense and defense)
#  H7-20    win luck: wins beyond CFBD's expected wins -> next season's change in win share (and does luck repeat?)
#  H7-21    turnover margin per game -> next season's change in win share; does it repeat?
#  H7-22    discipline: penalty yards per game repeat year to year
#  H7-23    vacated usage (the college re-measure of hunt 1's vacated targets, the owner's transfer keeps): the share of last season's
#           offensive usage that left -> the change in offensive points per play (CFBD PPA)
# Same bar as hunts 3-6: Benjamini-Hochberg q < .10 over this round's tests, and the holdout seasons (HOLD on, lib3) the same way.
import numpy as np, pandas as pd
from lib3 import Reg, bh, mech, yoy, reg_yoy, HOLD
from load import frame, pick, num

ADV = ['ppa', 'successRate', 'explosiveness', 'powerSuccess', 'stuffRate', 'lineYards', 'secondLevelYards', 'openFieldYards',
       'pointsPerOpportunity', 'havoc.total', 'havoc.frontSeven', 'havoc.db', 'standardDowns.successRate', 'passingDowns.successRate',
       'rushingPlays.ppa', 'passingPlays.ppa', 'fieldPosition.averageStart']


def _season(df):
    s = pick(df, 'season', 'year')
    return num(s).fillna(df['_year']).astype(int)


def run(reg, log, D):
    TESTS = []

    def yy(hyp, label, S):
        o = yoy(S, 'key', 'v'); d = reg_yoy(reg, hyp, label, o); TESTS.append(hyp); log(f'[{hyp}] {label}: {d}')

    # ---------- advanced season stats ----------
    A = frame('cf_adv')
    log(f'hunt7: cf_adv {len(A)} rows, columns sample: {list(A.columns)[:12]}')
    if len(A):
        A['season'] = _season(A); A['key'] = pick(A, 'team').astype(str)
        k = 1
        for side in ('offense', 'defense'):
            for m in ADV:
                c = f'{side}.{m}'
                if c not in A.columns: continue
                S = A[['key', 'season']].copy(); S['v'] = num(A[c])
                S = S[np.isfinite(S.v)]
                if len(S) < 200: continue
                yy(f'H7-{k:02d}', f'{side} {m} (CFBD advanced, season)', S); k += 1
                if k > 19: break

    # ---------- records: win luck ----------
    R = frame('cf_records')
    log(f'hunt7: cf_records {len(R)} rows, columns sample: {list(R.columns)[:14]}')
    WS = None
    if len(R):
        R['season'] = _season(R); R['key'] = pick(R, 'team').astype(str)
        w = num(pick(R, 'total.wins')); l = num(pick(R, 'total.losses')); t = num(pick(R, 'total.ties')).fillna(0); g = w + l + t
        R['ws'] = (w + t / 2) / g.replace(0, np.nan); R['luck'] = w - num(pick(R, 'expectedWins'))
        WS = R[['key', 'season', 'ws', 'luck']].dropna(subset=['ws'])
        L = WS.dropna(subset=['luck']).rename(columns={'luck': 'v'})
        if len(L) > 200:
            yy('H7-20a', 'Win luck (wins beyond CFBD expected wins) repeats', L[['key', 'season', 'v']])
            nx = WS[['key', 'season', 'ws']].copy(); nx['season'] -= 1
            j = L.merge(nx, on=['key', 'season'], suffixes=('', '_n')).dropna(subset=['ws_n'])
            j['dws'] = j.ws_n - j.ws
            r = mech(reg, 'H7-20', 'Win luck this season -> change in win share next season', j.dws.values, j.v.values, j.key.values, j.season.values, unit='win share per win of luck')
            TESTS.append('H7-20'); log(f'[H7-20] win luck -> next season: {r["d"]}')

    # ---------- team season stats: turnover margin, penalties ----------
    T = frame('cf_tstats')
    log(f'hunt7: cf_tstats {len(T)} rows, columns sample: {list(T.columns)[:10]}')
    if len(T):
        T['season'] = _season(T); T['key'] = pick(T, 'team').astype(str); T['stat'] = pick(T, 'statName').astype(str); T['val'] = num(pick(T, 'statValue'))
        P = T.pivot_table(index=['key', 'season'], columns='stat', values='val', aggfunc='first').reset_index()
        log(f'hunt7: stat names: {sorted(T.stat.unique())[:60]}')
        gm = P['games'] if 'games' in P else np.nan
        if {'turnovers', 'fumblesRecovered', 'passesIntercepted'} <= set(P.columns):
            P['tom'] = (P.fumblesRecovered + P.passesIntercepted - P.turnovers) / gm
            S = P[['key', 'season']].copy(); S['v'] = P.tom; S = S[np.isfinite(S.v)]
            yy('H7-21a', 'Turnover margin per game repeats', S)
            if WS is not None:
                nx = WS[['key', 'season', 'ws']].copy(); nx['season'] -= 1
                j = S.merge(WS[['key', 'season', 'ws']], on=['key', 'season']).merge(nx, on=['key', 'season'], suffixes=('', '_n')).dropna()
                j['dws'] = j.ws_n - j.ws
                r = mech(reg, 'H7-21', 'Turnover margin per game -> change in win share next season', j.dws.values, j.v.values, j.key.values, j.season.values, unit='win share per turnover a game')
                TESTS.append('H7-21'); log(f'[H7-21] turnover margin -> next season: {r["d"]}')
        if 'penaltyYards' in P.columns:
            S = P[['key', 'season']].copy(); S['v'] = P.penaltyYards / gm; S = S[np.isfinite(S.v)]
            yy('H7-22', 'Penalty yards per game repeat (discipline)', S)

    # ---------- usage: vacated usage -> offensive PPA change ----------
    U = frame('cf_usage')
    log(f'hunt7: cf_usage {len(U)} rows, columns sample: {list(U.columns)[:12]}')
    if len(U) and len(A) and 'offense.ppa' in A.columns:
        U['season'] = _season(U); U['team'] = pick(U, 'team').astype(str); U['pid'] = pick(U, 'id', 'playerId').astype(str); U['u'] = num(pick(U, 'usage.overall'))
        U = U[np.isfinite(U.u)]
        tot = U.groupby(['team', 'season']).u.sum().rename('tot')
        nxt = set(zip(U.team, U.season - 1, U.pid))   # (team, season, player) that played for the team the next season
        U['left'] = [(t, s, p) not in nxt for t, s, p in zip(U.team, U.season, U.pid)]
        V = U[U.left].groupby(['team', 'season']).u.sum().rename('gone').to_frame().join(tot, how='right').fillna(0).reset_index()
        V['vac'] = V.gone / V.tot.replace(0, np.nan)
        O = A[['key', 'season']].copy(); O['ppa'] = num(A['offense.ppa']); O = O.rename(columns={'key': 'team'})
        on = O.copy(); on['season'] -= 1
        j = V.merge(O, on=['team', 'season']).merge(on, on=['team', 'season'], suffixes=('', '_n')).dropna(subset=['vac', 'ppa', 'ppa_n'])
        j = j[j.season < j.season.max()]
        j['d'] = j.ppa_n - j.ppa
        log(f'H7-23: {len(j)} team-seasons; median vacated usage {j.vac.median():.2f}')
        if len(j) > 200:
            r = mech(reg, 'H7-23', 'Share of offensive usage that left -> next season change in offensive PPA', j.d.values, j.vac.values, j.team.values, j.season.values, unit='PPA per play, all usage gone')
            TESTS.append('H7-23'); log(f'[H7-23] vacated usage: {r["d"]}')

    # ---------- this round's BH pass and what goes out ----------
    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('H7-')].copy()
    if not len(R): print('::notice title=hunt7::no tests ran'); return
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    lines = [f'hunt7 · {len(R)} tests · BH q < .10 and the holdout ({HOLD} on) the same way']
    for _, x in R.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:300]}")
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=hunt7 {i + 1:02d}/{len(pack):02d}::{x}')
