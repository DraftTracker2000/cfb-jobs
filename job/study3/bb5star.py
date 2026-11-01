# Basketball follow-up, Nov 1 1:19 pm: "but how often do his 4 stars end up producing like 5 stars". STUDY ONLY, from the archive.
# "Producing like a 5-star": a season (200+ minutes) whose box production per 40 (bx40: points + rebounds + assists + steals + blocks
# - turnovers, per 40 minutes) reaches what 5-star recruits put up in that same year in school, across D-I, 2008-26: two bars, the
# 5-stars' median and their 25th percentile (years 1-4; 5th-years use the 4th-year bar). Year in school from bbyears (fixed Nov 1).
# A coach's recruits = players who began their college career at his school in his season (first season 2014-24: the coaches pack starts
# in 2014, and 2024 starters have had 3 seasons). Only seasons AT THAT SCHOOL count, so a player who blooms after transferring isn't his.
#  BD08 4-stars reach the 5-star median   BD09 4-stars reach the 5-star 25th percentile   BD10/BD11 the same for 3-stars and below
#  (listed 2- and 3-stars). Each: beyond the league rate for recruits of his rating band and start year; named (player-clustered and
#  season-level p, later half, leave one out) + split-half family; ranks shrunk toward the league (partial pooling).
import numpy as np, pandas as pd
from load import frame, pick, num
from lib3 import named, rtest, bh
import cbb as cb_, bbyears

CTX = ['Tom Izzo', 'Dan Hurley', 'Bill Self', 'John Calipari', 'Jon Scheyer', 'Mike Krzyzewski', 'Mark Few']

def shrink(T):
    """partial pooling: est * between / (between + se^2), between-coach variance by method of moments"""
    if not len(T): return T
    v = max(T.est.var() - (T.se ** 2).mean(), 1e-9); T = T.copy(); T['shrunk'] = T.est * v / (v + T.se ** 2); T['between_sd'] = np.sqrt(v); return T

def run(reg, log, D):
    s = frame('bb_stats'); m = num(pick(s, 'minutes'))
    A = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str), 'team': pick(s, 'team'),
                      'name': pick(s, 'name'), 'min': m,
                      'bx40': (num(pick(s, 'points')) + num(pick(s, 'rebounds.total')) + num(pick(s, 'assists')) + num(pick(s, 'steals')) + num(pick(s, 'blocks')) - num(pick(s, 'turnovers'))) / m * 40})
    A = A[A['min'] > 0].sort_values('min', ascending=False).drop_duplicates(['pid', 'season'])
    RO = bbyears.roster_rows(); R = bbyears.recruits(); F = bbyears.first_season(A.pid, A.season, RO, R)
    R, rc = bbyears.link(A, F, R, log)
    R = R.sort_values(['stars', 'rating'], ascending=False).drop_duplicates('pid').set_index('pid')
    A['f'] = A.pid.map(F); A['yr'] = A.season - A.f + 1; A['stars'] = A.pid.map(R.stars); A['rating'] = A.pid.map(R.rating); A['ryear'] = A.pid.map(R.year)
    P = A[(A['min'] >= 200) & A.yr.between(1, 5)].copy(); P['y4'] = P.yr.clip(upper=4)
    five = P[P.stars == 5]
    bars = five.groupby('y4').bx40.agg(n='size', med='median', p25=lambda x: x.quantile(.25))
    log('5-star bars by year in school (bx40, 200+ min seasons, 2008-26):\n' + bars.round(2).to_string())
    log('5-star bars by era (median): ' + str(five.assign(era=np.where(five.season < 2017, '2008-16', '2017-26')).groupby(['era', 'y4']).bx40.median().round(1).to_dict()))
    P['med'] = P.y4.map(bars.med); P['p25'] = P.y4.map(bars.p25)
    # cohorts: began at the school in season f, 2014-24, listed recruits (first season within 2 years of the recruit year)
    st0 = A[A.season == A.f].sort_values('min', ascending=False).drop_duplicates('pid')[['pid', 'f', 'tid', 'team', 'name', 'stars', 'rating', 'ryear']]
    st0 = st0[st0.f.between(2014, 2024) & st0.stars.notna() & (st0.f - st0.ryear).between(1, 2)].copy()
    CO = cb_.coaches(D); st0['coach'] = [CO.get((t, int(f_))) for t, f_ in zip(st0.tid, st0.f)]
    Q = P.merge(st0[['pid', 'tid']], on=['pid', 'tid'])          # seasons at the starting school only
    for b in ['med', 'p25']:
        hit = Q[Q.bx40 >= Q[b]]; first = hit.groupby('pid').yr.min(); st0[f'hit_{b}'] = st0.pid.isin(first.index).astype(float); st0[f'yr_{b}'] = st0.pid.map(first)
        for k in (1, 2, 3, 4): st0[f'{b}_y{k}'] = st0.pid.isin(set(hit[hit.y4 == k].pid)).astype(float)
    st0['best'] = st0.pid.map(Q.groupby('pid').bx40.max())
    st0['band'] = np.where(st0.stars == 4, '4', np.where(st0.stars <= 3, '3-', '5'))
    st0['rb'] = st0.groupby('band').rating.transform(lambda x: pd.qcut(x.rank(method='first'), 4, labels=False) if len(x) >= 8 else 0)
    log(f'cohorts 2014-24: {len(st0)} listed recruits starting at a D-I school; coach known {st0.coach.notna().mean():.2f}; by stars {st0.stars.value_counts().sort_index().to_dict()}')
    for band in ['5', '4', '3-']:
        x = st0[st0.band == band]
        log(f'league, {band}-stars ({len(x)}): reach the 5-star median {x.hit_med.mean():.3f}, 25th pct {x.hit_p25.mean():.3f}; by year in school, median ' +
            ', '.join(f'yr{k} {x[f"med_y{k}"].mean():.3f}' for k in (1, 2, 3, 4)) + '; 25th ' + ', '.join(f'yr{k} {x[f"p25_y{k}"].mean():.3f}' for k in (1, 2, 3, 4)))
    log('league 4-stars reaching the median, by start year: ' + str(st0[st0.band == '4'].groupby('f').hit_med.mean().round(2).to_dict()))
    out = {}
    for hyp, band, b, lab in [('BD08', '4', 'med', "4-stars who reach the 5-star median"), ('BD09', '4', 'p25', "4-stars who reach the 5-star 25th percentile"),
                              ('BD10', '3-', 'med', "3-stars and below who reach the 5-star median"), ('BD11', '3-', 'p25', "3-stars and below who reach the 5-star 25th percentile")]:
        x = st0[st0.band == band].copy(); x['y'] = x[f'hit_{b}'] - x.groupby(['rb', 'f'])[f'hit_{b}'].transform('mean'); x['season'] = x.f.astype(int)
        T, fam = named(reg, hyp, f'Coach whose {lab} (share, beyond rating band and start year)', x.dropna(subset=['coach']), 'coach', 'y', min_seasons=4, min_rows=10, g='pid', unit='share')
        T = shrink(T)
        if len(T):
            raw = x.dropna(subset=['coach']).groupby('coach')[f'hit_{b}'].agg(['mean', 'size']); T['rate'] = T.agent.map(raw['mean']); T['league'] = x[f'hit_{b}'].mean()
        out[hyp] = (x, T)
        log(f'{hyp} {lab}: {len(x)} recruits, league rate {x[f"hit_{b}"].mean():.3f}; {len(T)} coaches with 10+; split-half r {fam[0]:.2f} (p {fam[1]:.3g}); between-coach SD '
            f'{T.between_sd.iloc[0] if len(T) else np.nan:.3f}\n' + (T.sort_values('shrunk', ascending=False).head(8)[['name', 'n', 'rate', 'est', 'shrunk', 'p', 'late', 'loo']].round(3).to_string(index=False) if len(T) else '')
            + '\n' + (T.sort_values('shrunk').head(3)[['name', 'n', 'rate', 'est', 'shrunk', 'p']].round(3).to_string(index=False) if len(T) else ''))
        if len(T):
            t = T.set_index('agent'); log(f'{hyp} context: ' + '; '.join(f'{c} {t.rate[c]:.2f} of {int(t.n[c])} (beyond {t.est[c]:+.2f}, shrunk {t.shrunk[c]:+.2f}, p {t.p[c]:.3f}, rank {int((T.shrunk > t.shrunk[c]).sum()) + 1}/{len(T)})'
                                          if c in t.index else f'{c} under 10 or not found ({int((x.coach == c).sum())})' for c in CTX))
    # by year in school, the context coaches, 4-stars
    x = st0[st0.band == '4']
    for c in CTX:
        y = x[x.coach == c]
        if len(y): log(f'{c} 4-stars by year (share of all his 4-stars reaching the median that year): ' + ', '.join(f'yr{k} {y[f"med_y{k}"].mean():.2f}' for k in (1, 2, 3, 4)) +
                       f'; 25th: ' + ', '.join(f'yr{k} {y[f"p25_y{k}"].mean():.2f}' for k in (1, 2, 3, 4)) + f'; n {len(y)}')
    # Izzo by name
    for c in ['Tom Izzo']:
        y = st0[(st0.coach == c) & (st0.band != '5')].sort_values(['f', 'name'])
        log(f'{c}: his recruits 2014-24 (4-stars and 3-stars and below), first season reaching the bars:\n' + pd.DataFrame({
            'player': y.name, 'stars': y.stars.astype(int), 'rating': y.rating.round(3), 'first season': [f'{int(v) - 1}-{str(int(v))[2:]}' for v in y.f],
            'best bx40': y.best.round(1), 'hit median (yr)': y.yr_med.map(lambda v: '' if pd.isna(v) else f'yr{int(v)}'), 'hit 25th (yr)': y.yr_p25.map(lambda v: '' if pd.isna(v) else f'yr{int(v)}')}).to_string(index=False))
        z = Q.merge(y[['pid']], on='pid'); z = z[z.bx40 >= z.p25].sort_values('season')
        log(f'{c} seasons at/above the 25th bar: ' + '; '.join(f'{n_} {int(s_) - 1}-{str(int(s_))[2:]} yr{int(yr_)} {b_:.1f} (bar {p_:.1f}/{m_:.1f})' for n_, s_, yr_, b_, p_, m_ in zip(z.name, z.season, z.yr, z.bx40, z.p25, z.med)))
    log('coach names in the pack like the context list: ' + str(sorted({v for v in CO.values() if any(w.split()[-1] in str(v) for w in CTX)})[:30]))
