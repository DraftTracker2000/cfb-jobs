# Basketball follow-up, Nov 1 3:17 pm: "yes but kentucky has/had plenty of 5 -stars and severely under achieved comparatively no? isnt
# that the thing? getting the most out of your players?" STUDY ONLY, from the archive, year in school from bbyears (fixed Nov 1).
# Roster talent of a team-season = minutes-weighted mean of its players' recruiting points (rating above the 3-star floor .80, x100;
# unranked 0; a transfer keeps his high-school rating), seasons 2011-26 (recruit lists start with the 2007 class, so by 2011 every
# class on a roster is covered).
#  BD12 the football C01 test: game margin beyond both rosters' talent and home court; by coach (named, split-half), same team and coach
#       year to year, and whether it follows a coach to his next school    BD13 team-season SRS beyond talent, by coach
#  BD14 NCAA tournament wins beyond talent (if the archive's games carry the tournament)   BD15 5-stars reaching the 5-star median, by coach
import numpy as np, pandas as pd
from load import frame, pick, num
from lib3 import named, yoy, reg_yoy, rtest, coef, ols_cl, HOLD
import cbb as cb_, bbyears
from bb5star import shrink

import os
ELITE = float(os.environ.get('BD_ELITE', 10))   # talent cut for 'elite rosters' (an env var only so the fake-data test can reach it)
CTX = ['Tom Izzo', 'John Calipari', 'Bill Self', 'Jon Scheyer', 'Mike Krzyzewski', 'Mark Few', 'Dan Hurley']

OUT = {}   # (Nov 5) the elite-roster table for the findings pack (findings.py)

def run(reg, log, D):
    s = frame('bb_stats'); m = num(pick(s, 'minutes'))
    A = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str), 'team': pick(s, 'team'),
                      'name': pick(s, 'name'), 'min': m,
                      'bx40': (num(pick(s, 'points')) + num(pick(s, 'rebounds.total')) + num(pick(s, 'assists')) + num(pick(s, 'steals')) + num(pick(s, 'blocks')) - num(pick(s, 'turnovers'))) / m * 40})
    A = A[A['min'] > 0].copy()
    RO = bbyears.roster_rows(); R = bbyears.recruits(); F = bbyears.first_season(A.pid, A.season, RO, R)
    R, rc = bbyears.link(A, F, R, log)
    R = R.sort_values(['stars', 'rating'], ascending=False).drop_duplicates('pid').set_index('pid')
    A['rating'] = A.pid.map(R.rating); A['stars'] = A.pid.map(R.stars); A['pts'] = ((A.rating - .80).clip(lower=0) * 100).fillna(0)
    T = A.assign(w=A['min'] * A.pts).groupby(['tid', 'season']).agg(w=('w', 'sum'), mins=('min', 'sum'), five=('stars', lambda x: int((x == 5).sum())),
                                                                    team=('team', 'first')).reset_index()
    T['tal'] = T.w / T.mins; T = T[T.season >= 2011]
    CO = cb_.coaches(D); T['coach'] = [CO.get((t, int(y))) for t, y in zip(T.tid, T.season)]
    tal = T.set_index(['tid', 'season']).tal
    log(f'talent: {len(T)} team-seasons 2011-26; mean {T.tal.mean():.2f}, SD {T.tal.std():.2f}; top: ' +
        ', '.join(f'{a} {int(b)} {c:.1f}' for a, b, c in T.sort_values('tal', ascending=False).head(6)[['team', 'season', 'tal']].values))
    # ---------- games ----------
    g = frame('bb_games')
    log('games columns with tournament/type: ' + ', '.join(c for c in g.columns if any(k in c.lower() for k in ['tourn', 'type', 'neutral', 'notes', 'conferencegame'])))
    G = pd.DataFrame({'gid': pick(g, 'id'), 'season': num(pick(g, 'season', '_year')), 'h': pick(g, 'homeTeamId').astype(str), 'a': pick(g, 'awayTeamId').astype(str),
                      'hp': num(pick(g, 'homePoints')), 'ap': num(pick(g, 'awayPoints')), 'neutral': pick(g, 'neutralSite').fillna(False).astype(bool),
                      'st': pick(g, 'seasonType').astype(str), 'tourn': pick(g, 'tournament').astype(str)}).dropna(subset=['hp', 'ap']).drop_duplicates('gid')
    log('seasonType: ' + str(G.st.value_counts().head(5).to_dict()) + '; tournament: ' + str(G.tourn.value_counts().head(8).to_dict()))
    G['th'] = [tal.get((t, y)) for t, y in zip(G.h, G.season)]; G['ta'] = [tal.get((t, y)) for t, y in zip(G.a, G.season)]
    G = G.dropna(subset=['th', 'ta']).copy(); G['m'] = G.hp - G.ap; G['home'] = (~G.neutral).astype(float); G['gap'] = G.th - G.ta
    Tb, n_ = ols_cl(G.m, [G.gap, G.home], G.gid, ['gap', 'home']); b = Tb.b
    log(f'BD12: {n_} D-I games 2011-26 with both rosters; margin = {b["gap"]:.3f} x talent gap + {b["home"]:.2f} home + {b["const"]:.2f}; '
        f'talent SD {T.tal.std():.2f} = {b["gap"] * T.tal.std():.1f} points')
    G['over'] = G.m - (b['const'] + b['gap'] * G.gap + b['home'] * G.home)
    TG = pd.concat([G.assign(tid=G.h, o=G.over), G.assign(tid=G.a, o=-G.over)])[['gid', 'season', 'tid', 'o', 'st']]
    TG['coach'] = [CO.get((t, int(y))) for t, y in zip(TG.tid, TG.season)]; tnm = dict(zip(T.tid, T.team)); TG['team'] = TG.tid.map(tnm)
    Tn, fam = named(reg, 'BD12', 'Basketball head coach outplays his roster\'s recruiting (game margin beyond both rosters\' talent and home court)',
                    TG.dropna(subset=['coach']).rename(columns={'gid': 'game_id'}), 'coach', 'o', min_seasons=5, unit='points/game')
    Tn = shrink(Tn)
    log(f'BD12 by coach: split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches); best:\n' + Tn.sort_values('p').head(10)[['name', 'ns', 'n', 'est', 'shrunk', 'p', 'late', 'loo']].round(3).to_string(index=False)
        + '\nlowest:\n' + Tn.sort_values('est').head(6)[['name', 'ns', 'n', 'est', 'shrunk', 'p', 'late', 'loo']].round(3).to_string(index=False))
    t = Tn.set_index('agent'); log('BD12 context: ' + '; '.join(f'{c} {t.est[c]:+.2f} pts/game (shrunk {t.shrunk[c]:+.2f}, p {t.p[c]:.3f}, {int(t.ns[c])} seasons {int(t["first"][c])}-{int(t["last"][c])}, rank {int((Tn.est > t.est[c]).sum()) + 1}/{len(Tn)})'
                                   if c in t.index else f'{c} -' for c in CTX))
    S = TG.dropna(subset=['coach']).groupby(['season', 'tid', 'coach']).o.mean().rename('v').reset_index(); S['key'] = S.tid + '|' + S.coach
    log('BD12 ' + reg_yoy(reg, 'BD12', 'Team outplays its roster\'s recruiting (same team and coach)', yoy(S, 'key', 'v')))
    # follows the coach: coaches with 2+ seasons at each of two schools, first school vs the next
    mv = []
    for c, d in S.groupby('coach'):
        st = d.sort_values('season'); order = list(dict.fromkeys(st.tid))
        if len(order) < 2: continue
        a_, b_ = st[st.tid == order[0]], st[st.tid == order[1]]
        if len(a_) >= 2 and len(b_) >= 2: mv.append((c, a_.v.mean(), b_.v.mean(), tnm.get(order[0]), tnm.get(order[1]), len(a_), len(b_)))
    MV = pd.DataFrame(mv, columns=['coach', 'old', 'new', 'from', 'to', 'n_old', 'n_new']); r, p, k = rtest(MV.old, MV.new)
    reg.add('BD12', 'Outplaying recruiting follows the coach to his next school (r across movers, first school vs next)', 'family', r, np.nan, p, k, oos_pass=bool(np.isfinite(r) and r > 0 and p < .10),
            detail=f'{k} coaches with 2+ seasons at each school', unit='r')
    log(f'BD12 movers: r {r:.2f} (p {p:.3g}, {k} coaches); ' + '; '.join(f'{x.coach} {x._4}->{x.to} {x.old:+.1f}->{x.new:+.1f}' for x in MV[MV.coach.isin(CTX)].itertuples()))
    # Kentucky and the context teams, by season
    for team in ['Kentucky', 'Arkansas', 'Michigan State', 'Kansas', 'Duke', 'Gonzaga', 'UConn']:
        tid = [k_ for k_, v in tnm.items() if v == team]
        if not tid: continue
        x = TG[TG.tid == tid[0]].groupby('season').o.agg(['mean', 'size']); y = T[T.tid == tid[0]].set_index('season')
        log(f'{team} by season (talent, 5-stars playing, coach, points/game beyond talent): ' + '; '.join(
            f'{int(s_)} {y.tal.get(s_, np.nan):.1f} {int(y.five.get(s_, 0))}x5* {str(y.coach.get(s_))[:12]} {x["mean"][s_]:+.1f}' for s_ in x.index))
    # ---------- BD13 SRS beyond talent ----------
    sr0 = frame('bb_srs'); sr = pd.DataFrame({'tid': pick(sr0, 'teamId').astype(str), 'season': num(pick(sr0, 'season', '_year')), 'srs': num(pick(sr0, 'rating'))}).dropna().drop_duplicates(['tid', 'season'])
    X = T.merge(sr, on=['tid', 'season']); X['srs'] = X.srs - X.groupby('season').srs.transform('mean')
    bb = np.polyfit(X.tal, X.srs, 2); X['o'] = X.srs - np.polyval(bb, X.tal); X['tsid'] = X.tid + X.season.astype(int).astype(str)
    Tn2, fam2 = named(reg, 'BD13', 'Basketball head coach: team SRS beyond roster talent', X.dropna(subset=['coach']), 'coach', 'o', min_seasons=6, g='tsid', unit='SRS')
    t2 = Tn2.set_index('agent'); log(f'BD13 SRS beyond talent: {len(X)} team-seasons; talent explains R2 {1 - X.o.var() / X.srs.var():.2f}; split-half r {fam2[0]:.2f} (p {fam2[1]:.3g}); context: ' +
                                     '; '.join(f'{c} {t2.est[c]:+.1f} (p {t2.p[c]:.3f})' if c in t2.index else f'{c} -' for c in CTX))
    # ---------- BD14 NCAA tournament wins beyond talent ----------
    nc = G[G.tourn.str.contains('NCAA', case=False, na=False) & ~G.tourn.str.contains('NIT|CBI|CIT', case=False, na=False)]
    if len(nc) > 200:
        w = pd.concat([nc.assign(tid=nc.h, win=(nc.hp > nc.ap)), nc.assign(tid=nc.a, win=(nc.ap > nc.hp))]).groupby(['tid', 'season']).win.agg(['sum', 'size']).reset_index()
        W = w.merge(T, on=['tid', 'season']).merge(sr, on=['tid', 'season'], how='left'); W['wins'] = W['sum']
        W['exp_t'] = np.polyval(np.polyfit(W.tal, W.wins, 1), W.tal); W['o'] = W.wins - W.exp_t
        W['exp_s'] = np.polyval(np.polyfit(W.srs.fillna(W.srs.mean()), W.wins, 1), W.srs.fillna(W.srs.mean())); W['os'] = W.wins - W.exp_s; W['tsid'] = W.tid + W.season.astype(int).astype(str)
        Tn3, fam3 = named(reg, 'BD14', 'Basketball head coach: NCAA tournament wins beyond roster talent (tournament teams)', W.dropna(subset=['coach']), 'coach', 'o', min_seasons=5, g='tsid', unit='wins')
        t3 = Tn3.set_index('agent') if len(Tn3) else pd.DataFrame()
        log(f'BD14 NCAA: {len(nc)} games, {len(W)} team-tournaments 2011-26 (games per season {nc.groupby("season").size().to_dict()}); split-half r {fam3[0]:.2f} (p {fam3[1]:.3g}, {fam3[2]})')
        for c in CTX:
            y = W[W.coach == c]
            if len(y): log(f'BD14 {c}: {len(y)} tournaments, {int(y.wins.sum())} wins, expected from talent {y.exp_t.sum():.1f}, from SRS {y.exp_s.sum():.1f}' + (f'; named p {t3.p[c]:.3f}' if c in t3.index else ''))
        k = W[W.team == 'Kentucky']; log('Kentucky NCAA: ' + '; '.join(f'{int(a)} {int(b_)}W (talent exp {c_:.1f}, SRS exp {d_:.1f})' for a, b_, c_, d_ in k[['season', 'wins', 'exp_t', 'exp_s']].values))
    else: log(f'BD14: no NCAA tournament field in the archive ({len(nc)} games matched) — skipped')
    # ---------- BD16 elite rosters against elite rosters ----------
    # The talent scale only separates rosters near the top (most mid-major rosters score 0: CBBD's recruit lists barely cover them), and
    # one straight line from 0 to 19 decides what a Kentucky 'should' do. So: only team-seasons with talent 10+, each fitted on its own.
    for cut in (12, 10):
        log(f'team-seasons with talent {cut}+: {int((T.tal >= cut).sum())} ({(T.tal >= cut).mean():.3f}); programs: ' + ', '.join(f'{a} {b}' for a, b in T[T.tal >= cut].team.value_counts().head(14).items()))
    E = TG.merge(T[['tid', 'season', 'tal']], on=['tid', 'season']); E = E[E.tal >= ELITE].copy()
    E = E.merge(G[['gid', 'h', 'gap', 'home', 'm']], on='gid'); hs = E.tid == E.h
    E['mm'] = np.where(hs, E.m, -E.m); E['gg'] = np.where(hs, E.gap, -E.gap); E['hh'] = np.where(hs, E.home, -E.home)
    Te, ne = ols_cl(E.mm, [E.gg, E.hh], E.gid, ['gap', 'home']); be = Te.b; E['oe'] = E.mm - (be['const'] + be['gap'] * E.gg + be['home'] * E.hh)
    log(f'BD16: {ne} games by talent-10+ rosters; margin = {be["gap"]:.3f} x talent gap + {be["home"]:.2f} home + {be["const"]:.2f} (all games: {b["gap"]:.3f}, {b["home"]:.2f}, {b["const"]:.2f})')
    Tn5, fam5 = named(reg, 'BD16', 'Elite rosters (talent 10+): head coach outplays his roster\'s recruiting against expectations fitted on elite rosters only',
                      E.dropna(subset=['coach']).rename(columns={'gid': 'game_id'}), 'coach', 'oe', min_seasons=4, unit='points/game')
    Tn5 = shrink(Tn5); t5 = Tn5.set_index('agent') if len(Tn5) else pd.DataFrame(); OUT['beyond'] = (Tn5, fam5)
    log(f'BD16 by coach: split-half r {fam5[0]:.2f} (p {fam5[1]:.3g}, {fam5[2]} coaches)\n' + (Tn5.sort_values('est', ascending=False)[['name', 'ns', 'n', 'est', 'shrunk', 'p', 'late', 'loo']].round(2).to_string(index=False) if len(Tn5) else ''))
    Se = E.dropna(subset=['coach']).groupby(['season', 'tid', 'coach']).oe.mean().rename('v').reset_index(); Se['key'] = Se.tid + '|' + Se.coach
    log('BD16 ' + reg_yoy(reg, 'BD16', 'Elite roster outplays its recruiting (same team and coach)', yoy(Se, 'key', 'v')))
    XE = X[X.tal >= ELITE].copy(); be2 = np.polyfit(XE.tal, XE.srs, 1); XE['oe'] = XE.srs - np.polyval(be2, XE.tal)
    log(f'BD16 SRS among talent-10+ team-seasons ({len(XE)}): SRS = {be2[0]:.2f} x talent + {be2[1]:.1f}; by coach (4+ seasons): ' +
        '; '.join(f'{c} {g.oe.mean():+.1f} ({len(g)})' for c, g in sorted(XE.dropna(subset=['coach']).groupby('coach'), key=lambda z: -z[1].oe.mean()) if len(g) >= 4))
    if len(nc) > 200:
        WE = W[W.tal >= ELITE].copy(); WE['oe'] = WE.wins - np.polyval(np.polyfit(WE.tal, WE.wins, 1), WE.tal)
        log(f'BD16 NCAA wins among talent-10+ tournament teams ({len(WE)}): by coach (4+): ' + '; '.join(f'{c} {g.wins.sum():.0f} W vs {g.wins.sum() - g.oe.sum():.1f} expected ({len(g)})'
            for c, g in sorted(WE.dropna(subset=['coach']).groupby('coach'), key=lambda z: -z[1].oe.sum()) if len(g) >= 4))
    k = E[E.team == 'Kentucky'].groupby('season').oe.mean(); log('Kentucky vs elite expectation, points/game by season: ' + '; '.join(f'{int(a)} {v:+.1f}' for a, v in k.items()))
    ck = E[(E.team == 'Kentucky') & (E.coach == 'John Calipari')]; ok = E[(E.team == 'Kentucky') & (E.coach != 'John Calipari')]
    log(f'Kentucky under Calipari (2014-24 in the pack): {ck.oe.mean():+.2f} points/game over {ck.season.nunique()} seasons, {len(ck)} games; '
        f'other elite rosters {E[E.team != "Kentucky"].oe.mean():+.2f}; Kentucky 2011-13 (coach not in the pack) {E[(E.team == "Kentucky") & (E.season <= 2013)].oe.mean():+.2f}')
    # ---------- BD15 5-stars reaching the 5-star median ----------
    P = A[A['min'] >= 200].copy(); P['f'] = P.pid.map(F); P['yr'] = P.season - P.f + 1; P = P[P.yr.between(1, 5)]; P['y4'] = P.yr.clip(upper=4)
    bars = P[P.stars == 5].groupby('y4').bx40.median(); P['bar'] = P.y4.map(bars)
    A['f'] = A.pid.map(F); st0 = A[A.season == A.f].sort_values('min', ascending=False).drop_duplicates('pid')
    st0 = st0[(st0.stars == 5) & st0.f.between(2014, 2025)].copy(); st0['coach'] = [CO.get((t, int(f_))) for t, f_ in zip(st0.tid, st0.f)]
    Q = P.merge(st0[['pid', 'tid']], on=['pid', 'tid']); hit = Q[Q.bx40 >= Q.bar]
    st0['hit'] = st0.pid.isin(set(hit.pid)).astype(float); st0['hit1'] = st0.pid.isin(set(hit[hit.yr == 1].pid)).astype(float)
    st0['best'] = st0.pid.map(Q.groupby('pid').bx40.max()); st0['yrs'] = st0.pid.map(Q.groupby('pid').season.nunique()).fillna(0)
    st0['rq'] = pd.qcut(st0.rating.rank(method='first'), 3, labels=False); st0['y'] = st0.hit - st0.groupby(['rq']).hit.transform('mean'); st0['season'] = st0.f.astype(int)
    Tn4, fam4 = named(reg, 'BD15', '5-stars who reach the 5-star median for their year (share, beyond rating third)', st0.dropna(subset=['coach']), 'coach', 'y', min_seasons=3, min_rows=6, g='pid', unit='share')
    log(f'BD15 5-stars 2014-25 starters: {len(st0)}; reach the median at their school {st0.hit.mean():.2f} (in year 1 {st0.hit1.mean():.2f}); split-half r {fam4[0]:.2f} (p {fam4[1]:.3g}, {fam4[2]})')
    tb = st0.dropna(subset=['coach']).groupby('coach').agg(n=('hit', 'size'), hit=('hit', 'mean'), hit1=('hit1', 'mean'), best=('best', 'median'), seasons=('yrs', 'mean')).sort_values('n', ascending=False)
    log('5-stars by coach (6+):\n' + tb[tb.n >= 6].round(2).to_string())
    st0['cal'] = (st0.coach == 'John Calipari').astype(float)
    r_ = coef(reg, 'BD15', "Calipari's 5-stars vs other coaches' 5-stars: reach the 5-star median (share)", st0.hit, [st0.cal, st0.rating], ['cal', 'rating'], st0.pid, st0.season, 'cal', unit='share')
    log('BD15 Calipari vs others: ' + r_['d'])
    x = st0[st0.coach == 'John Calipari'].sort_values('f')
    log('Calipari 5-stars: ' + '; '.join(f'{n_} {int(f_) - 1}-{str(int(f_))[2:]} best {b_:.1f}{" hit" if h_ else ""}' for n_, f_, b_, h_ in zip(x.name, x.f, x.best.fillna(0), x.hit)))
    # ---------- Calipari split (the owner via coordinator, Nov 1): did the 2022-26 reversal come from the move to Arkansas? ----------
    # By team and first season (the coaches pack has no coach for Kentucky 2010-13 or 2024, so the split goes by team and years).
    s1 = A[A.season == A.f].sort_values('min', ascending=False).drop_duplicates('pid'); s1 = s1[(s1.stars == 5) & s1.f.between(2010, 2026)].copy()
    Q1 = P.merge(s1[['pid', 'tid']], on=['pid', 'tid']); s1['hit'] = s1.pid.isin(set(Q1[Q1.bx40 >= Q1.bar].pid)).astype(float)
    kid = [k_ for k_, v in tnm.items() if v == 'Kentucky']; aid = [k_ for k_, v in tnm.items() if v == 'Arkansas']
    groups = [('Kentucky 2010-21', kid, 2010, 2021), ('Kentucky 2022-24', kid, 2022, 2024), ('Arkansas 2025-26', aid, 2025, 2026)]
    mine = pd.Series(False, index=s1.index); rows = []
    for lab, ids, lo, hi in groups + [('career 2010-26', None, 2010, 2026)]:
        if ids is None: g_ = mine
        else: g_ = s1.tid.isin(ids) & s1.f.between(lo, hi); mine = mine | g_
        lg = s1[s1.f.between(lo, hi) & ~(s1.tid.isin(kid) & s1.f.between(2010, 2024)) & ~(s1.tid.isin(aid) & s1.f.between(2025, 2026))]
        e_ = E[(E.tid.isin(ids) if ids is not None else ((E.tid.isin(kid) & E.season.between(2011, 2024)) | (E.tid.isin(aid) & E.season.between(2025, 2026)))) & E.season.between(lo, hi)]
        rows.append([lab, int(g_.sum()), s1[g_].hit.mean(), len(lg), lg.hit.mean(), e_.season.nunique(), len(e_), e_.oe.mean()])
    log('Calipari split (5-stars by first season at the school; points/game vs the elite-roster fit, talent from 2011):\n' + pd.DataFrame(rows, columns=['group', '5-stars', 'hit', 'league 5-stars', 'league hit',
        'elite seasons', 'games', 'pts/game beyond']).round(3).to_string(index=False))
