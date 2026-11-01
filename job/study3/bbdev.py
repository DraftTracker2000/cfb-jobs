# Basketball development follow-up, step 0 (Sam, Nov 1 12:54 pm) — checks how year in school comes out of the archive before the tests.
# STUDY ONLY; prints to the run log only.
import numpy as np, pandas as pd
from load import frame, pick, num

NAMES = ['Denzel Valentine', 'Matt Costello', 'Alvin Ellis', 'Lourawls Nairn', 'Kenny Goins', 'Joey Hauser', 'Carr', 'Jalen Brunson', 'Tristen Newton']

def diag(reg, log, D):
    s = frame('bb_stats'); log('stats columns: ' + ', '.join(sorted(c for c in s.columns if not c.startswith('_')))[:1800])
    log(f'stats: season field vs path year: ' + str((num(pick(s, 'season')) - s._year).value_counts().head(3).to_dict()))
    ro = frame('bb_roster', flat=False); rows = []
    log('roster team columns: ' + ', '.join(ro.columns)[:400])
    for _, t in ro.iterrows():
        for p in t.players if isinstance(t.players, list) else []:
            rows.append(dict(pid=str(p.get('id')), name=p.get('name'), rs=t._year, team=t.get('team'), start=p.get('startSeason'), end=p.get('endSeason')))
    P = pd.DataFrame(rows); log('roster player keys: ' + ', '.join(sorted(set().union(*[set(p) for L in ro.players.head(3) for p in (L or [])])))[:500])
    P['start'] = num(P.start); P['end'] = num(P.end)
    log(f'roster rows {len(P)}, seasons {int(P.rs.min())}-{int(P.rs.max())}; start missing {P.start.isna().mean():.3f}')
    log('min startSeason by roster season: ' + str(P.groupby('rs').start.min().astype('Int64').to_dict()))
    log('roster season minus startSeason (share): ' + str((P.rs - P.start).value_counts(normalize=True).sort_index().round(3).head(10).to_dict()))
    v = P.groupby('pid').start.nunique(); log(f'players whose startSeason differs across rosters: {(v > 1).mean():.3f} of {len(v)}')
    S = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'team': pick(s, 'team'), 'name': pick(s, 'name'),
                      'min': num(pick(s, 'minutes'))})
    fs = S.groupby('pid').season.min(); st = P.groupby('pid').start.last()
    j = pd.DataFrame({'first_stats': fs, 'start': st}).dropna(); log('first stats season minus startSeason: ' + str((j.first_stats - j.start).value_counts(normalize=True).sort_index().round(3).head(8).to_dict()))
    fr = P.groupby('pid').rs.min(); j2 = pd.DataFrame({'first_roster': fr, 'start': st}).dropna(); log('first roster season minus startSeason: ' + str((j2.first_roster - j2.start).value_counts(normalize=True).sort_index().round(3).head(8).to_dict()))
    rc = frame('bb_recruits'); log('recruit columns: ' + ', '.join(sorted(c for c in rc.columns if not c.startswith('_')))[:900])
    R = pd.DataFrame({'pid': pick(rc, 'athleteId').astype(str).str.replace(r'\.0$', '', regex=True), 'year': num(pick(rc, 'year', '_year')), 'stars': num(pick(rc, 'stars')), 'rating': num(pick(rc, 'rating')),
                      'rank': num(pick(rc, 'ranking')), 'tid': pick(rc, 'committedTo.id'), 'name': pick(rc, 'name')})
    log(f'recruits {len(R)}, years {int(R.year.min())}-{int(R.year.max())}; athleteId present {(~R.pid.isin(["nan", "None"])).mean():.2f}; linked to stats {R.pid.isin(set(S.pid)).mean():.2f}')
    log('stars by year: ' + R.groupby('year').stars.apply(lambda x: x.value_counts().sort_index().to_dict()).unstack().fillna(0).astype(int).to_string()[:1500])
    k = R.drop_duplicates('pid').set_index('pid')
    j3 = pd.DataFrame({'ry': k.year, 'start': st, 'fs': fs}).dropna(subset=['ry'])
    log('startSeason minus recruit year: ' + str((j3.start - j3.ry).value_counts(normalize=True).sort_index().round(3).head(8).to_dict()))
    log('first stats season minus recruit year: ' + str((j3.fs - j3.ry).value_counts(normalize=True).sort_index().round(3).head(8).to_dict()))
    for n in NAMES:
        ids = set(S[S.name.astype(str).str.contains(n, na=False)].pid) | set(P[P.name.astype(str).str.contains(n, na=False)].pid)
        if n == 'Carr': ids = set(S[S.name.astype(str).str.contains('Carr', na=False) & S.team.astype(str).str.contains('Michigan St', na=False)].pid)
        for i in list(ids)[:3]:
            a = S[S.pid == i].sort_values('season'); b = P[P.pid == i].sort_values('rs'); r_ = R[R.pid == i]
            log(f'{n} [{i}]: stats ' + '; '.join(f'{int(x.season)} {x.team} {x["min"]:.0f}m' for _, x in a.iterrows()) + ' | rosters ' +
                '; '.join(f'{int(x.rs)} start {x.start} end {x.end}' for _, x in b.iterrows()) + ' | recruit ' + '; '.join(f'{int(x.year)} {x.stars}*' for _, x in r_.iterrows()))
