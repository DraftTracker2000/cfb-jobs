# Basketball year in school, fixed Nov 1 (Sam, 12:54 pm follow-up). STUDY ONLY.
# CBBD's roster startSeason is NOT a player's first college season: it is the start of his stint at that team (a transfer starts over:
# Hauser 2018 at Marquette, 2020 at Michigan State) and it is cut off where CBBD's roster coverage of the player begins (Valentine and
# Costello show 2014, but both have Michigan State stats from 2013). Checked on the archive (run 41334026430): 13.5% of players carry two
# or more startSeasons; 92% of linked recruits first play in recruit year + 1.
# First college season = the earliest of: recruit year + 1 (listed recruits), his first season with stats (any team, any minutes), his first
# roster season (any team), and the smallest startSeason on any roster. Unknown (NaN) when the earliest is the archive's first season
# (2008) and nothing earlier backs it, since he may have played before the data starts.
import numpy as np, pandas as pd
from load import frame, pick, num

def roster_rows():
    ro = frame('bb_roster', flat=False); rows = []
    if len(ro) and 'players' in ro:
        for tid, se, L in zip(pick(ro, 'teamId').astype(str), num(pick(ro, 'season', '_year')), ro.players):
            for p in L if isinstance(L, list) else []:
                rows.append((str(p.get('id')), int(se), tid, num(pd.Series([p.get('startSeason')])).iloc[0]))
    return pd.DataFrame(rows, columns=['pid', 'season', 'tid', 'start'])

def recruits():
    rc = frame('bb_recruits')
    if not len(rc): return pd.DataFrame(columns=['pid', 'year', 'stars', 'rating', 'tid'])
    R = pd.DataFrame({'pid': pick(rc, 'athleteId').astype(str).str.replace(r'\.0$', '', regex=True), 'year': num(pick(rc, 'year', '_year')), 'stars': num(pick(rc, 'stars')),
                      'rating': num(pick(rc, 'rating')), 'tid': pick(rc, 'committedTo.id').astype(str).str.replace(r'\.0$', '', regex=True)})
    return R[~R.pid.isin(['nan', 'None', ''])].dropna(subset=['year'])

def first_season(stats_pid, stats_season, RO=None, R=None):
    """Series pid -> first college season (CBBD numbering: 2016 = 2015-16), NaN when censored."""
    RO = roster_rows() if RO is None else RO; R = recruits() if R is None else R
    a = pd.Series(np.asarray(stats_season, float), index=np.asarray(stats_pid)).groupby(level=0).min()
    b = RO.groupby('pid').season.min(); c = RO.dropna(subset=['start']).groupby('pid').start.min(); d = R.groupby('pid').year.min() + 1
    F = pd.concat([a.rename('st'), b.rename('ro'), c.rename('ss'), d.rename('rc')], axis=1)
    first = F.min(axis=1); d0 = min(a.min(), b.min() if len(b) else 9999)
    backed = (F.ss < d0) | F.rc.notna()
    return first.where((first > d0) | backed)

def link(A, F, R, log=print):
    """recruits CBBD didn't link to a player id, matched by name + school + first season (recruit year + 1), added to R.
    A: player seasons with pid, name, tid, season; F: first_season()."""
    from load import norm_name
    rc = frame('bb_recruits')
    U = pd.DataFrame({'pid': pick(rc, 'athleteId').astype(str).str.replace(r'\.0$', '', regex=True), 'nm': pick(rc, 'name').map(norm_name), 'year': num(pick(rc, 'year', '_year')),
                      'stars': num(pick(rc, 'stars')), 'rating': num(pick(rc, 'rating')), 'tid': pick(rc, 'committedTo.id').astype(str).str.replace(r'\.0$', '', regex=True)})
    U = U[U.pid.isin(['nan', 'None', ''])]
    f1 = A.assign(nm=A.name.map(norm_name), fy=A.pid.map(F))
    f1 = f1[f1.season == f1.fy][['pid', 'nm', 'tid', 'fy']].drop_duplicates(['nm', 'tid', 'fy'], keep=False)
    U = U.assign(fy=U.year + 1).merge(f1, on=['nm', 'tid', 'fy'], suffixes=('_x', ''))
    log(f'recruits: {len(R)} linked by CBBD, {len(U)} more by name + school + first season; 5-stars linked {R[R.stars == 5].pid.nunique() + (U.stars == 5).sum()} of '
        f'{int((num(pick(rc, "stars")) == 5).sum())}')
    return pd.concat([R, U[['pid', 'year', 'stars', 'rating', 'tid']]], ignore_index=True), rc
