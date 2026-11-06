# Pattern hunt 5 (Nov 6, 2026 — Sam, 8:38 am on the "Next ideas" doc: "try all pattern hunts"). STUDY ONLY; nothing goes on the site.
# The 16 questions in that doc's pattern-hunt list. This round runs the ones the study archive can answer (college games, closing
# lines and totals, college play-by-play 2014 on; college basketball games and lines). The rest are listed as not run, with why.
# Same bar as hunts 3 and 4: Benjamini-Hochberg q < .10 over this round's tests, and the holdout seasons (HOLD on, lib3) the same way.
#  H5-01 red-zone touchdown rate (TDs per trip inside the 20) — repeats or regresses year to year
#  H5-02 explosive dependence: share of offensive yards on 20+ yard plays -> next season's change in points per game
#  H5-03 third-down luck: conversions beyond the distance-based rate, season so far -> next game against the line
#  H5-04 fumble luck: share of all fumbles in a team's games that it recovered, season so far -> next game against the line
#  H5-05 icing: field-goal make rate when the kick follows a timeout (late in a half), distance held fixed
#  H5-06 kicking: a team's make rate beyond distance repeats year to year (team-level; the play files carry no kicker id)
#  H5-12 first season in a new conference, against the line
#  H5-13 tempo: fast offense meets slow offense — the game total against the closing total
#  H5-14 college basketball close-game luck: record in games decided by 3 or less repeats year to year
#  H5-15 college basketball fatigue: second game within 48 hours, against the line
import numpy as np, pandas as pd
import cfb_base, cfb_plays
from lib3 import Reg, bh, mech, yoy, reg_yoy, HOLD
from load import frame, pick, num

TESTS = []


def note(log, hyp, label, r):
    TESTS.append((hyp, label, r)); log(f'[{hyp}] {label}: {r.get("d", r)}')


def _yoy(reg, log, hyp, label, S, key='key', val='v'):
    o = yoy(S, key, val); d = reg_yoy(reg, hyp, label, o)
    TESTS.append((hyp, label + ' — repeats year to year (r)', dict(b=o['r'], se=np.nan, p=o['p'], n=o['k'], b_hold=o['r_hold'], p_hold=o['p_hold'], d=d)))
    log(f'[{hyp}] {label}: {d}')


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.both_fbs & (T.stype.astype(str) == 'regular')].copy(); T['season'] = T.season.astype(int); T['g'] = T.gid.astype(str)
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce'); T = T.sort_values(['team', 'season', 'dt'])
    TL = T[T.exp.notna()].copy()
    log(f'hunt5: {len(T)} FBS team-games, {len(TL)} with a closing line, {T.season.min()}–{T.season.max()}')

    # ---------- play-by-play (2014 on) ----------
    try:
        P = cfb_plays.plays()
    except Exception as e:
        P = None; log(f'hunt5: no play-by-play in this run ({e!r})')
    if P is not None and len(P):
        P = P[~P.post].copy(); P['g'] = P.gameId.astype(str)
        pt = P.pt.str.lower()
        log(f'hunt5: {len(P)} plays, {P.gameId.nunique()} games, {int(P.season.min())}–{int(P.season.max())}')

        # H5-01 red zone: a drive "reaches the red zone" if any of its plays starts at yardsToGoal <= 20; TD = a touchdown play on it
        rz = P[P.yardsToGoal <= 20]
        dr = rz.groupby(['season', 'offense', 'driveId']).size().reset_index()[['season', 'offense', 'driveId']]
        td = P[pt.str.contains('touchdown') & ~pt.str.contains('fumble return|interception return|punt return|kickoff return|blocked')]
        tdd = set(zip(td.driveId, td.offense))
        dr['td'] = [(d, o) in tdd for d, o in zip(dr.driveId, dr.offense)]
        S = dr.groupby(['season', 'offense']).td.agg(['mean', 'size']).reset_index().rename(columns={'offense': 'key', 'mean': 'v', 'size': 'n'})
        S = S[S.n >= 25]
        log(f'H5-01: {len(S)} team-seasons with 25+ red-zone trips; FBS touchdown rate {dr.td.mean():.3f}')
        _yoy(reg, log, 'H5-01', 'Red-zone touchdown rate (TDs per trip inside the 20)', S)
        # does it regress? next season's rate on this season's, slope in the yoy line above ("carryover slope")

        # H5-02 explosive share -> next season's change in points per game (beyond this season's level)
        sc = P[pt.str.contains('rush|pass') & ~pt.str.contains('sack|interception|incompletion')]
        E = sc.groupby(['season', 'offense']).apply(lambda d: pd.Series({'ex': d.yardsGained.clip(lower=0).where(d.yardsGained >= 20, 0).sum() / max(d.yardsGained.clip(lower=0).sum(), 1)})).reset_index()
        ppg = TS.reset_index() if 'team' not in TS.columns else TS.copy()
        pts = T.groupby(['team', 'season']).pf.mean().rename('ppg').reset_index()
        E = E.rename(columns={'offense': 'team'}).merge(pts, on=['team', 'season'])
        nx = pts.assign(season=pts.season - 1).rename(columns={'ppg': 'ppg_n'})
        E = E.merge(nx, on=['team', 'season']).dropna()
        if len(E) > 50:
            X = np.column_stack([np.ones(len(E)), E.ppg]); res = E.ppg_n - X @ np.linalg.lstsq(X, E.ppg_n, rcond=None)[0]
            r = mech(reg, 'H5-02', 'Share of yards on 20+ yard plays -> next season points per game (beyond this season\'s)', res.values, E.ex.values, E.team.values, E.season.values + 1, unit='pts per share')
            note(log, 'H5-02', 'explosive dependence', r)

        # H5-03 third-down luck, season so far -> next game cover
        t3 = P[(P.down == 3) & pt.str.contains('rush|pass|sack|interception|incompletion')].copy()
        t3['conv'] = (t3.yardsGained >= t3.distance).astype(float)
        t3['db'] = pd.cut(t3.distance, [0, 1, 2, 3, 5, 7, 10, 15, 99], labels=False)
        t3['exp'] = t3.groupby(['season', 'db']).conv.transform('mean')
        g3 = t3.groupby(['g', 'offense']).agg(oe=('conv', 'sum'), ex=('exp', 'sum'), n=('conv', 'size')).reset_index().rename(columns={'offense': 'team'})
        g3['d'] = g3.oe - g3.ex
        X3 = TL.merge(g3[['g', 'team', 'd', 'n']], on=['g', 'team'], how='left').sort_values(['team', 'season', 'dt'])
        X3['cd'] = X3.groupby(['team', 'season']).d.transform(lambda s: s.shift(1).fillna(0).cumsum())
        X3['cn'] = X3.groupby(['team', 'season']).n.transform(lambda s: s.shift(1).fillna(0).cumsum())
        X3 = X3[X3.cn >= 30]; X3['x'] = X3.cd / X3.cn
        if len(X3) > 200:
            r = mech(reg, 'H5-03', 'Third-down conversions beyond the distance rate, season so far -> next game vs the line', X3.cover.values, X3.x.values, X3.g.values, X3.season.values, unit='pts per conversion share')
            note(log, 'H5-03', 'third-down luck', r)

        # H5-04 fumble luck: recoveries of all fumbles in the team's games, season so far
        fo = P[pt.str.contains('fumble recovery')].copy()
        fo['own'] = fo.pt.str.contains('own', case=False)
        rows = pd.concat([fo.assign(team=fo.offense, rec=fo.own.astype(float)), fo.assign(team=fo.defense, rec=(~fo.own).astype(float))])
        gf = rows.groupby(['g', 'team']).rec.agg(['sum', 'size']).reset_index().rename(columns={'sum': 'r', 'size': 'n'})
        X4 = TL.merge(gf, on=['g', 'team'], how='left').fillna({'r': 0, 'n': 0}).sort_values(['team', 'season', 'dt'])
        X4['cr'] = X4.groupby(['team', 'season']).r.transform(lambda s: s.shift(1).fillna(0).cumsum())
        X4['cn'] = X4.groupby(['team', 'season']).n.transform(lambda s: s.shift(1).fillna(0).cumsum())
        X4 = X4[X4.cn >= 6]; X4['x'] = X4.cr / X4.cn - .5
        if len(X4) > 200:
            r = mech(reg, 'H5-04', 'Share of fumbles recovered, season so far -> next game vs the line', X4.cover.values, X4.x.values, X4.g.values, X4.season.values, unit='pts per share')
            note(log, 'H5-04', 'fumble luck', r)

        # H5-05 icing: a field goal right after a timeout, last 2:00 of either half, distance held fixed
        P2 = P.sort_values(['gameId', 'period', 'clockSec'], ascending=[True, True, False]).reset_index(drop=True)
        prevto = P2.pt.str.contains('timeout', case=False).shift(1).fillna(False) & (P2.gameId == P2.gameId.shift(1))
        fg = P2[P2.pt.str.contains('field goal', case=False) & ~P2.pt.str.contains('blocked', case=False)].copy()
        fg['made'] = fg.pt.str.contains('good', case=False).astype(float)
        fg['iced'] = prevto.reindex(fg.index).astype(float)
        fg['dist'] = fg.yardsToGoal + 17; fg['db'] = (fg.dist // 5).clip(3, 11)
        late = fg[(fg.clockSec <= 120) & fg.period.isin([2, 4]) & fg.dist.between(20, 60)]
        log(f'H5-05: {len(late)} late-half field goals, {int(late.iced.sum())} right after a timeout')
        if late.iced.sum() > 50:
            r = mech(reg, 'H5-05', 'Field goal right after a timeout (late in a half) — make rate, distance held fixed', late.made.values, late.iced.values, late.g.values, late.season.values, fe=late.db.values, unit='make rate')
            note(log, 'H5-05', 'icing the kicker', r)

        # H5-06 team kicking beyond distance repeats
        fg['exp'] = fg.groupby('db').made.transform('mean'); fg['oe'] = fg.made - fg.exp
        K = fg.groupby(['season', 'offense']).oe.agg(['mean', 'size']).reset_index().rename(columns={'offense': 'key', 'mean': 'v', 'size': 'n'})
        _yoy(reg, log, 'H5-06', 'Team field-goal make rate beyond distance (10+ tries)', K[K.n >= 10])

        # H5-13 tempo clash vs the closing total (plays per game, season so far)
        pg = P.groupby(['g', 'offense']).size().rename('pl').reset_index().rename(columns={'offense': 'team'})
        TT = T.merge(pg, on=['g', 'team'], how='left').sort_values(['team', 'season', 'dt'])
        TT['tp'] = TT.groupby(['team', 'season']).pl.transform(lambda s: s.shift(1).expanding().mean())
    else:
        TT = None

    # closing totals (for H5-13)
    l = frame('cf_lines', flat=False); ou = {}
    if len(l):
        for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
            if not isinstance(L, list) or not L: continue
            v = [x.get('overUnder') for x in L if x.get('provider') in ('consensus', 'Consensus') and x.get('overUnder') is not None] or [x.get('overUnder') for x in L if x.get('overUnder') is not None]
            v = [float(a) for a in v if a not in (None, '')]
            if v: ou[str(gid)] = float(np.mean(v))
    if TT is not None and ou:
        H = TT[TT.ishome == 1][['g', 'season', 'team', 'opp', 'pf', 'pa', 'tp']].merge(TT[['g', 'team', 'tp']].rename(columns={'team': 'opp', 'tp': 'otp'}), on=['g', 'opp'])
        H['ou'] = H.g.map(ou); H = H.dropna(subset=['ou', 'tp', 'otp'])
        H['err'] = H.pf + H.pa - H.ou; H['clash'] = (H.tp - H.otp).abs(); H['both'] = (H.tp + H.otp) - (H.tp + H.otp).groupby(H.season).transform('mean')
        log(f'H5-13: {len(H)} games with a closing total and both teams\' tempo so far')
        if len(H) > 300:
            r = mech(reg, 'H5-13', 'Tempo gap between the two offenses (plays per game) -> game total vs the closing total', H.err.values, H.clash.values, H.g.values, H.season.values, unit='pts per play of gap')
            note(log, 'H5-13', 'tempo clash', r)
            r = mech(reg, 'H5-13', 'Both offenses fast (combined plays per game) -> game total vs the closing total', H.err.values, H.both.values, H.g.values, H.season.values, unit='pts per play')
            note(log, 'H5-13', 'tempo sum', r)

    # H5-12 first season in a new conference (FBS conferences; independents count as a conference)
    cf = T.groupby(['team', 'season']).conf.agg(lambda s: s.mode().iat[0] if len(s.mode()) else None).rename('c').reset_index()
    cf['cprev'] = cf.groupby('team').c.shift(1); cf['sprev'] = cf.groupby('team').season.shift(1)
    cf['new'] = ((cf.c != cf.cprev) & cf.cprev.notna() & (cf.sprev == cf.season - 1)).astype(float)
    X12 = TL.merge(cf[['team', 'season', 'new']], on=['team', 'season'])
    log(f'H5-12: {int(cf.new.sum())} team-seasons in a new conference')
    if X12.new.sum() > 100:
        r = mech(reg, 'H5-12', 'First season in a new conference -> games vs the line', X12.cover.values, X12.new.values, X12.g.values, X12.season.values, unit='pts')
        note(log, 'H5-12', 'new conference', r)
        cg = X12[X12.conf_game.astype(bool)]
        if cg.new.sum() > 60:
            r = mech(reg, 'H5-12', 'First season in a new conference -> conference games vs the line', cg.cover.values, cg.new.values, cg.g.values, cg.season.values, unit='pts')
            note(log, 'H5-12', 'new conference, conference games', r)

    # ---------- college basketball ----------
    g = frame('bb_games')
    if len(g):
        B = pd.DataFrame({'gid': pick(g, 'id').astype(str), 'season': num(pick(g, 'season', '_year')), 'h': pick(g, 'homeTeamId').astype(str), 'a': pick(g, 'awayTeamId').astype(str),
                          'hp': num(pick(g, 'homePoints')), 'ap': num(pick(g, 'awayPoints')), 'neutral': pick(g, 'neutralSite').fillna(False).astype(bool),
                          'date': pd.to_datetime(pick(g, 'startDate'), errors='coerce', utc=True), 'st': pick(g, 'seasonType').astype(str)}).dropna(subset=['hp', 'ap', 'date']).drop_duplicates('gid')
        B['m'] = B.hp - B.ap
        rows = pd.concat([B.assign(team=B.h, opp=B.a, margin=B.m, home=1), B.assign(team=B.a, opp=B.h, margin=-B.m, home=0)])
        rows = rows.sort_values(['team', 'date'])
        # H5-14 close-game record (decided by 3 or less) repeats
        cl = rows[rows.margin.abs() <= 3]
        S = cl.groupby(['season', 'team']).margin.agg(lambda s: (s > 0).mean()).rename('v').reset_index()
        S['n'] = cl.groupby(['season', 'team']).size().values
        S = S[S.n >= 4].rename(columns={'team': 'key'})
        log(f'H5-14: {len(S)} team-seasons with 4+ games decided by 3 or less')
        _yoy(reg, log, 'H5-14', 'College basketball record in games decided by 3 or less', S)
        # H5-15 fatigue: the previous game ended within 48 hours (the date gap is start to start)
        rows['gap'] = rows.groupby(['team', 'season']).date.diff().dt.total_seconds() / 3600
        l2 = frame('bb_lines', flat=False); L = {}
        if len(l2):
            for gid, LL in zip(pick(l2, 'gameId'), pick(l2, 'lines')):
                if isinstance(LL, list) and LL:
                    v = [x.get('spread') for x in LL if 'consensus' in str(x.get('provider', '')).lower() and x.get('spread') is not None] or [x.get('spread') for x in LL if x.get('spread') is not None]
                    if v: L[str(gid)] = float(np.mean([float(a) for a in v]))
        B['spread'] = B.gid.map(L); ok = B.spread.notna()
        if ok.sum() > 500:
            cr = np.corrcoef(B[ok].spread, B[ok].m)[0, 1]; B['exp'] = -B.spread if cr < 0 else B.spread
            ex = dict(zip(B.gid, B.exp))
            rows['exp'] = [ex.get(gid) if h == 1 else (-ex[gid] if ex.get(gid) is not None else None) for gid, h in zip(rows.gid, rows.home)]
            R = rows.dropna(subset=['exp', 'gap']).copy(); R = R[R.st.str.contains('reg', case=False)]
            R['cover'] = R.margin - R.exp.astype(float); R['tired'] = (R.gap <= 48).astype(float)
            # the opponent's rest matters too: compare a tired team against a rested one only
            og = R[['gid', 'team', 'tired']].rename(columns={'team': 'opp', 'tired': 'otired'})
            R = R.merge(og, on=['gid', 'opp'], how='left'); R = R[R.otired.fillna(0) == 0]
            log(f'H5-15: {len(R)} team-games with a line; {int(R.tired.sum())} on 48 hours or less against a rested opponent')
            if R.tired.sum() > 200:
                r = mech(reg, 'H5-15', 'College basketball: second game within 48 hours vs a rested opponent -> vs the line', R.cover.values, R.tired.values, R.gid.values, R.season.values, unit='pts')
                note(log, 'H5-15', 'basketball fatigue', r)

    # ---------- this round's BH pass and what goes out ----------
    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('H5-')].copy()
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    lines = [f'hunt5 · {len(R)} tests · BH q < .10 and the holdout ({HOLD} on) the same way']
    for _, x in R.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:420]}")
    lines.append('not run this round: H5-07/08 blowout padding and big-game production (the play files carry no player ids), H5-09/10 new and backup '
                 'QBs (needs the passer per game), H5-11 coordinators (CFBD has head coaches only), H5-16 interim coaches (needs coach tenures)')
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=hunt5 {i + 1:02d}/{len(pack):02d}::{x}')
