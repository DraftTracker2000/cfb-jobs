# Pattern hunt 3 — college football programs and head coaches (team level). STUDY ONLY.
#  C01 coaches whose teams outplay their recruiting (game margin beyond the two rosters' recruiting points and home field)
#  C02 ... follows the coach to a new school
#  C03 home-field edge by program repeats (home margin minus road margin); C04 home edge vs the line repeats; named programs
#  C05 programs/coaches that rise late in the season (late-season cover minus early-season cover) repeat; named coaches
#  C06 team vs the spread repeats; C07 head coach vs the spread (named, split-half)
#  C08 bowl games: head coaches vs the line (named, split-half)
#  C09 coaches whose teams win close games beyond the line (luck test: one-score games, win rate minus line-implied)
import numpy as np, pandas as pd
from scipy import stats
from lib3 import *

def run(reg, log, G, T, CO, TS):
    R = T[T.both_fbs].rename(columns={'gid': 'game_id'}).copy()
    R['reg'] = R.stype.astype(str).str.startswith('reg')
    rp = TS.set_index(['team', 'season']).rec4
    R['rec'] = [rp.get(k) for k in zip(R.team, R.season)]; R['orec'] = [rp.get(k) for k in zip(R.opp, R.season)]
    d = R.dropna(subset=['rec', 'orec', 'margin']).copy()
    d['dr'] = d.rec - d.orec; d['hh'] = d.ishome * 2 - 1
    b = np.linalg.lstsq(np.column_stack([np.ones(len(d)), d.dr, d.hh]), d.margin, rcond=None)[0]
    d['over'] = d.margin - (b[0] + b[1] * d.dr + b[2] * d.hh)
    log(f'C01: {len(d)} team-games with both recruiting averages; margin = {b[1]:.3f} x recruiting-point gap + {b[2]:.2f} home')
    S = d[d.reg].groupby(['season', 'team', 'coach']).over.mean().rename('v').reset_index(); S['key'] = S.team + '|' + S.coach
    o = yoy(S, 'key', 'v'); log('C01 ' + reg_yoy(reg, 'C01', 'Team outplays its recruiting (game margin beyond both rosters\' recruiting, same team and coach)', o))
    Tn, fam = named(reg, 'C01', 'Head coach outplays his recruiting', d.dropna(subset=['coach']), 'coach', 'over', min_seasons=5, unit='points/game')
    if len(Tn): log(Tn.sort_values('p').head(10)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'late', 'oos', 'loo']].round(3).to_string())
    # C02 follows the coach
    fs = S.sort_values('season'); pairs = []
    for c, x in fs.groupby('coach'):
        tms = list(dict.fromkeys(x.team))
        if len(tms) >= 2 and (x.team == tms[0]).sum() >= 2 and (x.team == tms[1]).sum() >= 2: pairs.append((x[x.team == tms[0]].v.mean(), x[x.team == tms[1]].v.mean()))
    if len(pairs) >= 6:
        r, p, k = rtest(*zip(*pairs))
        reg.add('C02', 'Outplaying recruiting follows the head coach to his next school (r)', 'family', r, np.nan, p, k, oos_pass=bool(r > 0),
                detail=f'{k} coaches with 2+ seasons at two FBS schools', unit='r'); log(f'C02 follows coach r = {r:.3f} (p {p:.3g}, {k})')
    # C03/C04 home field
    H = R[R.reg & ~R.neutral]
    hs = H.groupby(['season', 'team', 'ishome'])[['margin', 'cover']].mean().unstack()
    S = pd.DataFrame({'hfa': hs[('margin', 1.0)] - hs[('margin', 0.0)], 'hfac': hs[('cover', 1.0)] - hs[('cover', 0.0)]}).reset_index()
    for hyp, c, lab in [('C03', 'hfa', 'Program home edge (home margin minus road margin)'), ('C04', 'hfac', 'Program home edge vs the line (home cover minus road cover)')]:
        o = yoy(S, 'team', c); log(f'{hyp} SD {S[c].std():.2f}; ' + reg_yoy(reg, hyp, lab, o))
    Hn = H.dropna(subset=['cover']).copy(); Hn['sc'] = np.where(Hn.ishome == 1, Hn.cover, -Hn.cover)
    Tn, fam = named(reg, 'C04', 'Program home edge vs the line (half of home-minus-road cover)', Hn, 'team', 'sc', min_seasons=10, unit='points')
    if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'late', 'oos', 'loo']].round(3).to_string())
    # C05 late-season risers
    L = R[R.reg].dropna(subset=['cover']).copy(); L['late'] = np.where(L.week >= 9, 1, np.where(L.week <= 5, -1, 0)); L = L[L.late != 0]
    ls = L.groupby(['season', 'team', 'coach', 'late']).cover.mean().unstack()
    S = (ls[1] - ls[-1]).rename('v').reset_index(); S['key'] = S.team + '|' + S.coach
    o = yoy(S, 'key', 'v'); log('C05 ' + reg_yoy(reg, 'C05', 'Late-season riser (weeks 9+ cover minus weeks 1-5 cover, same team and coach)', o))
    L['y'] = L.cover * L.late
    Tn, fam = named(reg, 'C05', 'Head coach whose teams rise late (half of late-minus-early cover)', L.dropna(subset=['coach']), 'coach', 'y', min_seasons=6, unit='points')
    if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'late', 'oos', 'loo']].round(3).to_string())
    # C06/C07 ATS
    A = R[R.reg].dropna(subset=['cover'])
    S = A.groupby(['season', 'team']).cover.mean().rename('v').reset_index()
    o = yoy(S, 'team', 'v'); log('C06 ' + reg_yoy(reg, 'C06', 'Program vs the spread (mean cover)', o))
    Tn, fam = named(reg, 'C07', 'Head coach vs the spread', A.dropna(subset=['coach']), 'coach', 'cover', min_seasons=6, min_rows=60, unit='points')
    log(f'C07 split-half r {fam[0]:.2f} ({fam[2]})')
    if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'late', 'oos', 'loo']].round(3).to_string())
    # C08 bowls
    B = R[~R.reg].dropna(subset=['cover', 'coach'])
    Tn, fam = named(reg, 'C08', 'Head coach in bowl games, vs the line', B, 'coach', 'cover', min_seasons=6, unit='points')
    log(f'C08 bowls: {len(B)} bowl team-games; split-half r {fam[0]:.2f} ({fam[2]})')
    if len(Tn): log(Tn.sort_values('p').head(6)[['name', 'ns', 'n', 'est', 'p', 'oos', 'loo']].round(3).to_string())
    # C09 close games beyond the line
    C = R[R.reg & R.margin.abs().le(8)].dropna(subset=['exp']).copy()
    C['ew'] = stats.norm.cdf(C.exp / 15.0); C['y'] = C.win - C.ew
    S = C.groupby(['season', 'team', 'coach']).y.agg(['mean', 'count']).reset_index().rename(columns={'mean': 'v'}); S = S[S['count'] >= 3]
    S['key'] = S.team + '|' + S.coach
    o = yoy(S, 'key', 'v'); log('C09 ' + reg_yoy(reg, 'C09', 'Wins one-score games beyond the line (same team and coach)', o))
