# Tier lines for Data Busters (Nov 23 — rule 15: every college test four ways). STUDY ONLY; prints aggregates as notices.
# Part 1: the play-by-play momentum tests from hunt 8 (cfbmomentum 3–5), power programs vs Group of 5, by matchup, prediction first
# (top and bottom 15% of team-seasons, scored on the next season), then the year-to-year link.
import numpy as np, pandas as pd
import cfb_base, cfb_plays
from lib3 import yoy

P5 = {'SEC', 'Big Ten', 'ACC', 'Big 12'}
def power(conf, team, season):
    if conf in P5: return True
    if conf in ('Pac-12', 'Pac-10'): return season <= 2023
    if conf == 'Big East': return season <= 2012
    return team == 'Notre Dame'

def note(title, lines):
    s = ' | '.join(lines)
    for i in range(0, min(len(s), 3800 * 3), 3800): print(f'::notice title={title} {i // 3800 + 1}::{s[i:i + 3800]}')

def split(S, label):
    """S: key, season, v, pw (the team's tier that season). Top/bottom 15% each season → next season, by tier; and the r."""
    out = []
    nx = S[['key', 'season', 'v']].copy(); nx['season'] -= 1
    J = S.merge(nx, on=['key', 'season'], suffixes=('', '_n'))
    for nm, f in (('all', lambda d: d), ('power', lambda d: d[d.pw]), ('G5', lambda d: d[~d.pw])):
        d = f(J); s0 = f(S)
        if len(d) < 20: out.append(f'{label} {nm}: too few ({len(d)})'); continue
        q85 = d.groupby('season').v.transform(lambda x: x.quantile(.85)); q15 = d.groupby('season').v.transform(lambda x: x.quantile(.15))
        top, bot = d[d.v >= q85], d[d.v <= q15]
        o = yoy(s0[['key', 'season', 'v']], 'key', 'v')
        out.append(f'{label} {nm}: {len(s0)} team-seasons, mean {s0.v.mean():+.3f} · top 15% {top.v.mean():+.3f} → {top.v_n.mean():+.3f} next ({len(top)}), '
                   f'{(top.v_n > 0).sum()} of {len(top)} above 0 · bottom 15% {bot.v.mean():+.3f} → {bot.v_n.mean():+.3f} ({len(bot)}) · '
                   f'r {o["r"]:.3f} ({o["k"]} pairs), holdout r {o["r_hold"]:.2f}')
    return out

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    tier = {(t, int(s)): power(c, t, int(s)) for (t, s), c in TS.reset_index().set_index(['team', 'season']).conf.items()} if 'conf' in TS.columns else {}
    if not tier:
        TT = T.groupby(['team', 'season']).conf.first()
        tier = {(t, int(s)): power(c, t, int(s)) for (t, s), c in TT.items()}
    P = cfb_plays.plays(); P = P[~P.post & P.offenseConference.notna() & P.defenseConference.notna()].copy(); P['g'] = P.gameId.astype(str)
    P = P.sort_values(['g', 'period', 'clockSec'], ascending=[True, True, False])
    log(f'tiers2: {len(P)} plays, {P.g.nunique()} games, {int(P.season.min())}-{int(P.season.max())}')
    P['opw'] = [power(c, t, int(s)) for c, t, s in zip(P.offenseConference, P.offense, P.season)]
    P['dpw'] = [power(c, t, int(s)) for c, t, s in zip(P.defenseConference, P.defense, P.season)]
    tw = lambda k, s: tier.get((k, int(s)), False)
    lines = []

    # H8-03 the opening script: first-drive EPA a play minus the rest of the game
    scr = P.pt.str.contains('Rush|Pass|Sack|Interception', case=False)
    Q = P[scr & P.ppa.notna()]
    fd = Q.groupby(['g', 'offense']).driveId.transform('min'); Q = Q.assign(fdrive=(Q.driveId == fd))
    for nm, m in (('PvP', Q.opw & Q.dpw), ('GvG', ~Q.opw & ~Q.dpw), ('P off vs G', Q.opw & ~Q.dpw), ('G off vs P', ~Q.opw & Q.dpw)):
        x = Q[m]; lines.append(f'opening script {nm}: first drive {x[x.fdrive].ppa.mean():.3f} vs rest {x[~x.fdrive].ppa.mean():.3f} ({x[x.fdrive].g.nunique()} games)')
    a = Q[Q.fdrive].groupby(['offense', 'season']).ppa.agg(['mean', 'size']).rename(columns={'mean': 'f', 'size': 'nf'})
    b = Q[~Q.fdrive].groupby(['offense', 'season']).ppa.mean().rename('r')
    O = a.join(b).reset_index(); O = O[O.nf >= 30]; O['v'] = O.f - O.r; O = O.rename(columns={'offense': 'key'})
    O['pw'] = [tw(k, s) for k, s in zip(O.key, O.season)]
    lines += split(O, 'opening script (EPA/play, first drive minus rest)')

    # drives
    d1 = P.groupby(['g', 'driveId']).agg(off=('offense', 'first'), q=('period', 'first'), season=('season', 'first'), opw=('opw', 'first'), dpw=('dpw', 'first'),
                                       s0=('offenseScore', 'first'), s1=('offenseScore', 'max'), ytg=('yardsToGoal', 'first'), ptl=('pt', 'last')).reset_index()
    d1['pts'] = (d1.s1 - d1.s0).clip(lower=0, upper=8)
    d1 = d1.sort_values(['g', 'driveId']); d1['scored'] = (d1.pts > 0).astype(float)
    d1['prev_off'] = d1.groupby('g').off.shift(); d1['prev_scored'] = d1.groupby('g').scored.shift()
    d1['yb'] = (d1.ytg // 10).clip(0, 9); d1['exp'] = d1.groupby(['season', 'yb']).scored.transform('mean')
    ans = d1[(d1.prev_off.notna()) & (d1.prev_off != d1.off)]
    for nm, m in (('PvP', d1.opw & d1.dpw), ('GvG', ~d1.opw & ~d1.dpw), ('P off vs G', d1.opw & ~d1.dpw), ('G off vs P', ~d1.opw & d1.dpw)):
        a1 = ans[m.loc[ans.index] & (ans.prev_scored == 1)]
        lines.append(f'answer {nm}: {a1.scored.mean():.3f} of {len(a1)} answer drives score vs {d1[m].scored.mean():.3f} of all drives; beyond start spot {(a1.scored - a1.exp).mean():+.3f}')
    A1 = ans[ans.prev_scored == 1].assign(x=lambda z: z.scored - z.exp).groupby(['off', 'season']).x.agg(['mean', 'size']).reset_index()
    A1 = A1[A1['size'] >= 15].rename(columns={'off': 'key', 'mean': 'v'})
    base = d1.assign(x=d1.scored - d1.exp).groupby(['off', 'season']).x.mean().rename('b').reset_index().rename(columns={'off': 'key'})
    A1 = A1.merge(base, on=['key', 'season']); A1['v'] = A1.v - A1.b; A1['pw'] = [tw(k, s) for k, s in zip(A1.key, A1.season)]
    lines += split(A1, 'answering a score (scoring rate beyond start spot and own normal)')

    # H8-06 after a takeaway
    to = d1.ptl.str.contains('Interception|Fumble', case=False, na=False)
    d1['prev_to'] = to.groupby(d1.g).shift().fillna(False).astype(bool)
    tk = d1[d1.prev_to & (d1.prev_off != d1.off)]
    for nm, m in (('PvP', tk.opw & tk.dpw), ('GvG', ~tk.opw & ~tk.dpw), ('P off vs G', tk.opw & ~tk.dpw), ('G off vs P', ~tk.opw & tk.dpw)):
        x = tk[m]; lines.append(f'takeaway {nm}: {len(x)} drives score {x.scored.mean():.3f}, beyond start spot {(x.scored - x.exp).mean():+.3f}')
    T6 = tk.assign(x=lambda z: z.scored - z.exp).groupby(['off', 'season']).x.agg(['mean', 'size']).reset_index()
    T6 = T6[T6['size'] >= 8].rename(columns={'off': 'key', 'mean': 'v'}); T6['pw'] = [tw(k, s) for k, s in zip(T6.key, T6.season)]
    lines += split(T6, 'after a takeaway (scoring rate beyond start spot)')
    for l in lines: log(l)
    note('tiers2 momentum', lines)
