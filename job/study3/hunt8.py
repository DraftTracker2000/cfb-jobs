# Pattern hunt 8 (Nov 6, 2026 — Sam, 5:04 pm: "exhaust these before releasing. all angles"; 3:43 pm: "more hidden data hunts" for the
# broadcast side). STUDY ONLY; nothing goes on the site. College play-by-play (2014 on, FBS vs FBS, regular season) — the angles no hunt has
# run, chosen for what a broadcaster can say in the booth:
#  H8-01  the comeback table: how often a team trailing by N at the start of a quarter wins (and how the closing line changes it)
#  H8-02  are comebacks a team trait? share of a team's wins that came from behind in the 4th quarter, year to year
#  H8-03  the opening script: a team's first-drive points per play minus its season's rate — repeats year to year (scripting is a skill?)
#  H8-04  the end of the first half: points per drive on drives starting in the final 2:00 of the half — repeats year to year
#  H8-05  answering a score: after the opponent scores, the share of next drives that score, minus the team's normal rate — repeats?
# Same bar as before: BH q < .10 over this round's tests, and the holdout seasons (HOLD on) the same way.
import numpy as np, pandas as pd
import cfb_base, cfb_plays
from lib3 import Reg, bh, yoy, reg_yoy, HOLD


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg')].copy(); T['g'] = T.gid.astype(str)
    P = cfb_plays.plays(); P = P[~P.post & P.offenseConference.notna() & P.defenseConference.notna()].copy(); P['g'] = P.gameId.astype(str)
    P = P.sort_values(['g', 'period', 'clockSec'], ascending=[True, True, False])
    log(f'hunt8: {len(P)} plays, {P.g.nunique()} games, {int(P.season.min())}-{int(P.season.max())}')
    res = T.set_index(['g', 'team'])
    def yy(hyp, label, S):
        o = yoy(S, 'key', 'v'); d = reg_yoy(reg, hyp, label, o); log(f'[{hyp}] {label}: {d}')

    # ---------- H8-01 the comeback table (descriptive) ----------
    first = P.groupby(['g', 'period']).head(1)   # the first play of each quarter: the score as it starts
    st = pd.DataFrame({'g': first.g, 'q': first.period, 'team': first.offense, 'lead': first.offenseScore - first.defenseScore, 'season': first.season})
    st2 = st.assign(team=first.defense.values, lead=-st.lead.values)
    S = pd.concat([st, st2]); S = S[S.q.isin([2, 3, 4])]
    S = S.join(res[['win', 'exp']], on=['g', 'team']).dropna(subset=['win'])
    rows = []
    for q in (2, 3, 4):
        for lo, hi, lab in ((-3, -1, '1-3'), (-7, -4, '4-7'), (-10, -8, '8-10'), (-14, -11, '11-14'), (-17, -15, '15-17'), (-21, -18, '18-21'), (-28, -22, '22-28'), (-99, -29, '29+')):
            x = S[(S.q == q) & (S.lead >= lo) & (S.lead <= hi)]
            if len(x) < 30: continue
            dog = x[x.exp < -7]; fav = x[x.exp > 7]
            rows.append(f'Q{q} down {lab}: {x.win.mean():.3f} of {len(x)}' + (f' · as a 7+ favorite {fav.win.mean():.3f} ({len(fav)})' if len(fav) >= 20 else '') + (f' · as a 7+ underdog {dog.win.mean():.3f} ({len(dog)})' if len(dog) >= 20 else ''))
    log('H8-01 comeback table: ' + ' | '.join(rows))
    print('::notice title=hunt8 comebacks::' + ' | '.join(rows)[:3900])

    # ---------- H8-02 fourth-quarter comebacks as a team trait ----------
    q4 = S[S.q == 4].copy(); q4['behind'] = (q4.lead < 0).astype(float)
    W = q4[q4.win == 1].groupby(['team', 'season']).agg(v=('behind', 'mean'), n=('behind', 'size')).reset_index()
    W = W[W.n >= 5].rename(columns={'team': 'key'})
    yy('H8-02', 'Share of a team\'s wins that came from behind entering the 4th quarter', W[['key', 'season', 'v']])
    # and the plain rate: when behind entering the 4th, how often it wins
    B = q4[q4.lead < 0].groupby(['team', 'season']).agg(v=('win', 'mean'), n=('win', 'size')).reset_index(); B = B[B.n >= 3].rename(columns={'team': 'key'})
    yy('H8-02b', 'Win rate when trailing entering the 4th quarter (3+ such games)', B[['key', 'season', 'v']])

    # ---------- H8-03 the opening script ----------
    scr = P.pt.str.contains('Rush|Pass|Sack|Interception', case=False)
    Q = P[scr & P.ppa.notna()]
    fd = Q.groupby(['g', 'offense']).driveId.transform('min')
    Q = Q.assign(fdrive=(Q.driveId == fd))
    a = Q[Q.fdrive].groupby(['offense', 'season']).ppa.agg(['mean', 'size']).rename(columns={'mean': 'f', 'size': 'nf'})
    b = Q[~Q.fdrive].groupby(['offense', 'season']).ppa.mean().rename('r')
    O = a.join(b).reset_index(); O = O[O.nf >= 30]; O['v'] = O.f - O.r; O = O.rename(columns={'offense': 'key'})
    log(f'H8-03: {len(O)} team-seasons; first-drive PPA {O.f.mean():.3f} vs rest {O.r.mean():.3f}')
    yy('H8-03', 'First drive points per play minus the rest of the game (the opening script)', O[['key', 'season', 'v']])

    # ---------- H8-04 the end of the half ----------
    d1 = P.groupby(['g', 'driveId']).agg(off=('offense', 'first'), q=('period', 'first'), c=('clockSec', 'first'), season=('season', 'first'),
                                       s0=('offenseScore', 'first'), s1=('offenseScore', 'max'), ytg=('yardsToGoal', 'first'), pts0=('pt', 'first'), ptl=('pt', 'last')).reset_index()
    d1['pts'] = (d1.s1 - d1.s0).clip(lower=0, upper=8)
    e = d1[(d1.q == 2) & (d1.c <= 120)]
    E = e.groupby(['off', 'season']).pts.agg(['mean', 'size']).reset_index().rename(columns={'off': 'key', 'mean': 'v', 'size': 'n'})
    E = E[E.n >= 5]; log(f'H8-04: {len(E)} team-seasons with 5+ end-of-half drives; mean {E.v.mean():.2f} points a drive')
    yy('H8-04', 'Points per drive starting in the last 2:00 of the first half', E[['key', 'season', 'v']])

    # ---------- H8-05 answering a score ----------
    d1 = d1.sort_values(['g', 'driveId']); d1['scored'] = (d1.pts > 0).astype(float)
    d1['prev_off'] = d1.groupby('g').off.shift(); d1['prev_scored'] = d1.groupby('g').scored.shift()
    ans = d1[(d1.prev_off.notna()) & (d1.prev_off != d1.off)]
    A1 = ans[ans.prev_scored == 1].groupby(['off', 'season']).scored.agg(['mean', 'size']).rename(columns={'mean': 'a', 'size': 'na'})
    A0 = d1.groupby(['off', 'season']).scored.mean().rename('base')
    A = A1.join(A0).reset_index(); A = A[A.na >= 15]; A['v'] = A.a - A.base; A = A.rename(columns={'off': 'key'})
    log(f'H8-05: {len(A)} team-seasons; answer rate {A.a.mean():.3f} vs base {A.base.mean():.3f}')
    yy('H8-05', 'Scoring right after the opponent scores, minus the team\'s normal drive scoring rate', A[['key', 'season', 'v']])

    # H8-05b the same with the starting yard line held fixed (round 2): each drive's expected scoring rate from where it started (FBS, that season)
    d1['yb'] = (d1.ytg // 10).clip(0, 9)
    d1['exp'] = d1.groupby(['season', 'yb']).scored.transform('mean')
    ans = d1[(d1.prev_off.notna()) & (d1.prev_off != d1.off)]
    A1 = ans[ans.prev_scored == 1].assign(x=lambda z: z.scored - z.exp).groupby(['off', 'season']).x.agg(['mean', 'size']).reset_index()
    A1 = A1[A1['size'] >= 15].rename(columns={'off': 'key', 'mean': 'v'})
    log(f'H8-05b: {len(A1)} team-seasons; answer drives score {A1.v.mean():+.3f} over their starting spot')
    yy('H8-05b', 'Scoring right after the opponent scores, beyond what the starting yard line gives', A1[['key', 'season', 'v']])
    # H8-06 after a takeaway: the drive right after the defense forces a turnover, beyond its starting spot
    to = d1.ptl.str.contains('Interception|Fumble', case=False, na=False)
    d1['prev_to'] = to.groupby(d1.g).shift().fillna(False).astype(bool)
    T6 = d1[d1.prev_to & (d1.prev_off != d1.off)].assign(x=lambda z: z.scored - z.exp).groupby(['off', 'season']).x.agg(['mean', 'size']).reset_index()
    T6 = T6[T6['size'] >= 8].rename(columns={'off': 'key', 'mean': 'v'})
    log(f'H8-06: {len(T6)} team-seasons; drives after a takeaway score {T6.v.mean():+.3f} over their starting spot')
    yy('H8-06', 'Scoring on the drive after a takeaway, beyond what the starting yard line gives', T6[['key', 'season', 'v']])

    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('H8-')].copy()
    if not len(R): print('::notice title=hunt8::no tests ran'); return
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    out = ' ‖ '.join(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:260]}" for _, x in R.iterrows())
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt8 {i // 3800 + 1}::{out[i:i + 3800]}')
