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
            j['dws'] = j.ws_n - j.ws; j['dws'] = j.dws - np.polyval(np.polyfit(j.ws, j.dws, 1), j.ws)   # round 2: this season's win share held fixed
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
                j['dws'] = j.ws_n - j.ws; j['dws'] = j.dws - np.polyval(np.polyfit(j.ws, j.dws, 1), j.ws)   # round 2: win share held fixed
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
        j['d'] = j.ppa_n - j.ppa; j['d'] = j.d - np.polyval(np.polyfit(j.ppa, j.d, 1), j.ppa)   # round 2: this season's PPA held fixed
        log(f'H7-23: {len(j)} team-seasons; median vacated usage {j.vac.median():.2f}')
        if len(j) > 200:
            r = mech(reg, 'H7-23', 'Share of offensive usage that left -> next season change in offensive PPA', j.d.values, j.vac.values, j.team.values, j.season.values, unit='PPA per play, all usage gone')
            TESTS.append('H7-23'); log(f'[H7-23] vacated usage: {r["d"]}')

    # ---------- basketball transfers: look at the fields first (round 2) ----------
    BP = frame('bb_portal')
    log(f'hunt7: bb_portal {len(BP)} rows, columns: {list(BP.columns)[:30]}')
    if len(BP): log('hunt7: bb_portal sample: ' + BP.head(3).to_json(orient='records')[:1500])

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


# ---------- round 3 (focus hunt7b): basketball transfers joined to season stats ----------
POWER = {'ACC', 'Big 12', 'Big East', 'Big Ten', 'SEC', 'Pac-12'}


def run_b(reg, log, D):
    import re
    nz = lambda s: re.sub(r'[^a-z]', '', re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', str(s).lower()))
    BP = frame('bb_portal'); st = frame('bb_stats')
    log(f'hunt7b: portal {len(BP)}, stats {len(st)}; stats columns: {sorted(c for c in st.columns if not c.startswith("_"))[:60]}')
    if not len(BP) or not len(st): print('::notice title=hunt7b::no data'); return
    S = pd.DataFrame({'nm': pick(st, 'name').map(nz), 'tid': num(pick(st, 'teamId')), 'season': num(pick(st, 'season', '_year')), 'min': num(pick(st, 'minutes')),
                      'g': num(pick(st, 'games')), 'pts': num(pick(st, 'points', 'points.total')), 'conf': pick(st, 'conference').astype(str)}).dropna(subset=['nm', 'tid', 'season'])
    B = pd.DataFrame({'nm': (pick(BP, 'firstName').astype(str) + ' ' + pick(BP, 'lastName').astype(str)).map(nz), 'year': num(pick(BP, 'year', '_year')),
                      'o': num(pick(BP, 'origin.id')), 'd': num(pick(BP, 'destination.id')), 'oc': pick(BP, 'origin.conference').astype(str), 'dc': pick(BP, 'destination.conference').astype(str),
                      'stars': num(pick(BP, 'stars')), 'rating': num(pick(BP, 'rating'))}).dropna(subset=['nm', 'year', 'o', 'd'])
    # the portal year vs the stats' season label: take the offset that matches the most movers at their old school
    best = None
    for off in (0, 1, -1):
        m = B.assign(season=B.year + off).merge(S, left_on=['nm', 'o', 'season'], right_on=['nm', 'tid', 'season'])
        log(f'hunt7b: offset {off}: {len(m)} movers matched at the old school')
        if best is None or len(m) > best[1]: best = (off, len(m))
    off = best[0]
    pre = B.assign(season=B.year + off).merge(S, left_on=['nm', 'o', 'season'], right_on=['nm', 'tid', 'season'])
    post = B.assign(season=B.year + off + 1).merge(S, left_on=['nm', 'd', 'season'], right_on=['nm', 'tid', 'season'])
    j = pre.merge(post, on=['nm', 'year', 'o', 'd'], suffixes=('', '_n'))
    j = j[(j.g >= 10) & (j.g_n >= 10)].copy()
    j['mpg'] = j['min'] / j.g; j['mpg_n'] = j.min_n / j.g_n; j['p40'] = 40 * j.pts / j['min'].replace(0, np.nan); j['p40_n'] = 40 * j.pts_n / j.min_n.replace(0, np.nan)
    j['up'] = ((~j.oc.isin(POWER)) & j.dc.isin(POWER)).astype(float); j['down'] = (j.oc.isin(POWER) & ~j.dc.isin(POWER)).astype(float)
    log(f'hunt7b: {len(j)} movers with 10+ games before and after; up {int(j.up.sum())}, down {int(j.down.sum())}; median minutes {j.mpg.median():.1f} -> {j.mpg_n.median():.1f}')
    j['grp'] = np.where(j.up == 1, 'up', np.where(j.down == 1, 'down', np.where(j.oc.isin(POWER), 'power-power', 'mid-mid')))
    for gname, gg in j.groupby('grp'):
        log(f'hunt7b group {gname}: {len(gg)} movers · minutes {gg.mpg.mean():.1f} -> {gg.mpg_n.mean():.1f} · points per 40 {gg.p40.mean():.1f} -> {gg.p40_n.mean():.1f} · rating {gg.rating.mean():.3f}')
    for c in ('o', 'd'): pass
    for col, lab, unit in (('mpg', 'minutes a game', 'min'), ('p40', 'points per 40 minutes', 'pts/40')):
        k = j.dropna(subset=[col, col + '_n']); y = (k[col + '_n'] - k[col]).values
        for x, nm_ in (('up', 'moving up to a power conference'), ('down', 'moving down from a power conference')):
            r = mech(reg, f'H7-4{["mpg","p40"].index(col)}{"ud".index(x[0])}', f'Basketball transfer {nm_} -> change in {lab}', y, k[x].values, k.nm.values, k.year.values, unit=unit)
            log(f'[{nm_} / {lab}] {r["d"]}')
        if k.rating.notna().sum() > 300:
            kk = k.dropna(subset=['rating']); r = mech(reg, f'H7-4{["mpg","p40"].index(col)}r', f'Portal rating -> change in {lab}', (kk[col + '_n'] - kk[col]).values, kk.rating.values, kk.nm.values, kk.year.values, unit=unit + ' per rating point')
            log(f'[rating / {lab}] {r["d"]}')
    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('H7-4')].copy()
    if not len(R): print('::notice title=hunt7b::no tests ran'); return
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    print('::notice title=hunt7b groups::' + ' ‖ '.join(f"{g}: {len(x)} · min {x.mpg.mean():.1f}->{x.mpg_n.mean():.1f} · p40 {x.p40.mean():.1f}->{x.p40_n.mean():.1f}" for g, x in j.groupby('grp')))
    out = ' ‖ '.join(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:240]}" for _, x in R.iterrows())
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt7b {i // 3800 + 1}::{out[i:i + 3800]}')


# ---------- round 4 (focus hunt7c): vacated usage split by why the players left ----------
def run_c(reg, log, D):
    import os
    from load import norm_name, school
    A = frame('cf_adv'); U = frame('cf_usage'); po = frame('cf_portal')
    dr = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nfl_draft.csv'), comment='#')
    U['season'] = _season(U); U['team'] = pick(U, 'team').astype(str); U['pid'] = pick(U, 'id', 'playerId').astype(str); U['u'] = num(pick(U, 'usage.overall')); U['nm'] = pick(U, 'name').map(norm_name)
    U = U[np.isfinite(U.u)]
    nxt = set(zip(U.team, U.season - 1, U.pid))
    U['left'] = [(t, s, p) not in nxt for t, s, p in zip(U.team, U.season, U.pid)]
    T = set(zip((pick(po, 'firstName').astype(str) + pick(po, 'lastName').astype(str)).map(norm_name), pick(po, 'origin').astype(str), num(pick(po, 'season', '_year'))))
    DR = set(zip(dr.name.map(norm_name), dr.college.map(school), dr.draft_year))
    U['why'] = np.where(~U.left, 'stay', np.where([(n, t, s + 1) in T for n, t, s in zip(U.nm, U.team, U.season)], 'transfer',
                np.where([(n, t, s + 1) in DR for n, t, s in zip(U.nm, U.team, U.season)], 'draft', 'other')))
    log('hunt7c: usage that left, by why: ' + str(U[U.left].groupby('why').u.sum().round(1).to_dict()) + f' · seasons {int(U.season.min())}-{int(U.season.max())}')
    tot = U.groupby(['team', 'season']).u.sum().rename('tot')
    V = U[U.left].pivot_table(index=['team', 'season'], columns='why', values='u', aggfunc='sum').reindex(columns=['transfer', 'draft', 'other']).fillna(0).join(tot, how='right').fillna(0).reset_index()
    for c in ('transfer', 'draft', 'other'): V[c] = V[c] / V.tot.replace(0, np.nan)
    A['season'] = _season(A); O = pd.DataFrame({'team': pick(A, 'team').astype(str), 'season': A.season, 'ppa': num(A['offense.ppa'])})
    on = O.copy(); on['season'] -= 1
    j = V.merge(O, on=['team', 'season']).merge(on, on=['team', 'season'], suffixes=('', '_n')).dropna(subset=['ppa', 'ppa_n'])
    j = j[(j.season < j.season.max()) & (j.season >= 2020)].copy(); j['d'] = j.ppa_n - j.ppa; j['d'] = j.d - np.polyval(np.polyfit(j.ppa, j.d, 1), j.ppa)   # the portal file starts in 2021: earlier transfers would count as 'other'
    log(f'hunt7c: {len(j)} team-seasons; mean shares gone — transfer {j.transfer.mean():.3f}, draft {j.draft.mean():.3f}, other {j.other.mean():.3f}')
    for c, lab in (('transfer', 'transferred out'), ('draft', 'drafted'), ('other', 'left otherwise (graduated, quit, injured)')):
        r = mech(reg, f'H7-5{"tdo".index(c[0])}', f'Share of offensive usage {lab} -> next season change in offensive PPA (this season held fixed)', j.d.values, j[c].values, j.team.values, j.season.values, unit='PPA per play, all usage')
        log(f'[{c}] {r["d"]}')
    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('H7-5')].copy()
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    print('::notice title=hunt7c::' + ' ‖ '.join(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}) · {str(x.detail)[:220]}" for _, x in R.iterrows())[:3900])


# ---------- round 5 (focus hunt7d): football transfers — production before and after a move up or down a level ----------
# (6:51 pm: "is there a way for the scout portal to also use this for college top priority targets … green and red")
FB_POWER = {'SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12'}


def run_d(reg, log, D):
    s = frame('cf_pstats')
    s = pd.DataFrame({'pid': pick(s, 'playerId', 'player_id').astype(str), 'pos': pick(s, 'position').astype(str), 'team': pick(s, 'team').astype(str), 'conf': pick(s, 'conference').astype(str),
                      'season': num(pick(s, 'season', '_year')), 'k': pick(s, 'category').astype(str) + '.' + pick(s, 'statType', 'stat_type').astype(str), 'v': num(pick(s, 'stat'))}).dropna(subset=['v', 'season'])
    K = {'passing.YDS': 'pass yds', 'rushing.YDS': 'rush yds', 'receiving.YDS': 'rec yds', 'defensive.TOT': 'tackles', 'defensive.SACKS': 'sacks', 'interceptions.INT': 'ints'}
    s = s[s.k.isin(K)]
    P = s.pivot_table(index=['pid', 'season', 'team', 'conf', 'pos'], columns='k', values='v', aggfunc='first').reset_index()
    P = P.sort_values(['pid', 'season']); nx = P.groupby('pid').shift(-1)
    j = P.assign(**{c + '_n': nx[c] for c in K if c in P.columns}, team_n=nx.team, conf_n=nx.conf, season_n=nx.season)
    j = j[(j.season_n == j.season + 1) & (j.team_n.notna()) & (j.team_n != j.team)].copy()
    j['move'] = np.where(~j.conf.isin(FB_POWER) & j.conf_n.isin(FB_POWER), 'up', np.where(j.conf.isin(FB_POWER) & ~j.conf_n.isin(FB_POWER), 'down', np.where(j.conf.isin(FB_POWER), 'power-power', 'other-other')))
    st = P.assign(**{c + '_n': nx[c] for c in K if c in P.columns}, team_n=nx.team, season_n=nx.season)
    st = st[(st.season_n == st.season + 1) & (st.team_n == st.team)]   # stayers, for the baseline
    MIN = {'passing.YDS': 1000, 'rushing.YDS': 400, 'receiving.YDS': 300, 'defensive.TOT': 40, 'defensive.SACKS': 4, 'interceptions.INT': 2}
    lines = []
    for c, lab in K.items():
        if c not in j.columns: continue
        for g in ('up', 'down', 'power-power', 'other-other', 'stayed'):
            x = (st if g == 'stayed' else j[j.move == g]); x = x[x[c] >= MIN[c]]
            if len(x) < 15: continue
            r = (x[c + '_n'].fillna(0) / x[c]); lines.append(f'{lab} · {g}: {len(x)} players with {MIN[c]}+ · next season median {r.median():.2f}× (mean {r.clip(upper=3).mean():.2f}×) · kept a 50%+ share {(r >= .5).mean():.2f}')
    log('hunt7d:\n' + '\n'.join(lines))
    out = ' ‖ '.join(lines)
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt7d {i // 3800 + 1}::{out[i:i + 3800]}')


# ---------- round 6 (focus hunt7e): every level to every level (7:02 pm: "group of 5 schools or lower would use this more … cross fit it") ----------
G5C = {'American Athletic', 'Mountain West', 'Sun Belt', 'Mid-American', 'Conference USA', 'FBS Independents', 'Western Athletic', 'Big West', 'Pac-12'}


def run_e(reg, log, D):
    s = frame('cf_pstats')
    s = pd.DataFrame({'pid': pick(s, 'playerId', 'player_id').astype(str), 'team': pick(s, 'team').astype(str), 'conf': pick(s, 'conference').astype(str),
                      'season': num(pick(s, 'season', '_year')), 'k': pick(s, 'category').astype(str) + '.' + pick(s, 'statType', 'stat_type').astype(str), 'v': num(pick(s, 'stat'))}).dropna(subset=['v', 'season'])
    log('hunt7e: conferences seen: ' + ', '.join(sorted(s.conf.unique()))[:2500])
    K = {'passing.YDS': 'pass', 'rushing.YDS': 'rush', 'receiving.YDS': 'rec', 'defensive.TOT': 'tackles', 'defensive.SACKS': 'sacks'}
    MIN = {'passing.YDS': 1000, 'rushing.YDS': 400, 'receiving.YDS': 300, 'defensive.TOT': 40, 'defensive.SACKS': 4}
    s = s[s.k.isin(K)]
    lvl = lambda c, y: 'P4' if (c in FB_POWER and not (c == 'Pac-12' and y >= 2024)) else 'G5' if c in G5C else 'FCS'
    P = s.pivot_table(index=['pid', 'season', 'team', 'conf'], columns='k', values='v', aggfunc='first').reset_index().sort_values(['pid', 'season'])
    P['lvl'] = [lvl(c, y) for c, y in zip(P.conf, P.season)]
    nx = P.groupby('pid').shift(-1)
    j = P.assign(**{c + '_n': nx[c] for c in K if c in P.columns}, team_n=nx.team, lvl_n=nx.lvl, season_n=nx.season)
    j = j[j.season_n == j.season + 1]; j['moved'] = j.team_n != j.team
    log(f'hunt7e: level counts {P.lvl.value_counts().to_dict()}')
    lines = []; T = {}
    for c, lab in K.items():
        if c not in j.columns: continue
        for a in ('FCS', 'G5', 'P4'):
            for b in ('FCS', 'G5', 'P4'):
                x = j[j.moved & (j.lvl == a) & (j.lvl_n == b) & (j[c] >= MIN[c])]
                if len(x) < 12: continue
                r = (x[c + '_n'].fillna(0) / x[c]).median(); T[f'{a}>{b}>{lab}'] = round(float(r), 2); lines.append(f'{lab} {a}→{b}: {len(x)} · {r:.2f}')
            x = j[~j.moved & (j.lvl == a) & (j[c] >= MIN[c])]
            if len(x) >= 12: r = (x[c + '_n'].fillna(0) / x[c]).median(); T[f'{a}=stay>{lab}'] = round(float(r), 2); lines.append(f'{lab} {a} stayed: {len(x)} · {r:.2f}')
    log('hunt7e:\n' + '\n'.join(lines))
    import json as _j
    out = _j.dumps(T) + ' ‖ ' + ' ‖ '.join(lines)
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt7e {i // 3800 + 1}::{out[i:i + 3800]}')
