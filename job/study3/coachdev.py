# Pattern hunt 3 follow-up — basketball coach player development (B01) in detail, for named coaches (Sam, Nov 1 12:20 pm: "in what way did
# izzo's vary just so i can see"). STUDY ONLY; runs on the runner from the study archive (Study job, focus:coachdev), prints to the log only.
# Same measure as B01 / the findings pack: a returning player's change in box production per 40 (points + rebounds + assists + steals +
# blocks - turnovers), minus what class year, his own level and the team's SRS change predict (one regression over every D-I pair).
import os, numpy as np, pandas as pd
from load import frame, pick, num
import cbb as cb_

WHO = ['Tom Izzo', 'Dan Hurley']

def run(reg, log, D):
    s = frame('bb_stats'); m = num(pick(s, 'minutes'))
    S = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str), 'team': pick(s, 'team'),
                      'min': m, 'name': pick(s, 'name'),
                      'bx40': (num(pick(s, 'points')) + num(pick(s, 'rebounds.total')) + num(pick(s, 'assists')) + num(pick(s, 'steals')) + num(pick(s, 'blocks')) - num(pick(s, 'turnovers'))) / m * 40})
    S = S[S['min'] >= 200].drop_duplicates(['pid', 'season'])
    # year in school fixed Nov 1 (bbyears.py): roster startSeason restarts at a transfer and is cut off where CBBD's rosters begin
    import bbyears; _a = num(pick(s, 'minutes')) > 0
    S['yr'] = S.season - S.pid.map(bbyears.first_season(pick(s, 'athleteId').astype(str)[_a], num(pick(s, 'season', '_year'))[_a])) + 1
    sr0 = frame('bb_srs'); sr = pd.DataFrame({'t': pick(sr0, 'teamId').astype(str), 's': num(pick(sr0, 'season', '_year')), 'r': num(pick(sr0, 'rating'))}).dropna().drop_duplicates(['t', 's']).set_index(['t', 's']).r
    CO = cb_.coaches(D)
    a = S[['pid', 'season', 'tid', 'team', 'yr', 'bx40', 'name']]; b = a[['pid', 'season', 'tid', 'bx40']].copy(); b['season'] -= 1
    j = a.merge(b, on=['pid', 'season'], suffixes=('', '_n')).dropna(subset=['bx40', 'bx40_n'])
    st = j[j.tid == j.tid_n].dropna(subset=['yr']).copy(); st = st[st.yr.between(1, 4)]; st['chg'] = st.bx40_n - st.bx40
    st['dsrs'] = [sr.get((t, s_ + 1), np.nan) - sr.get((t, s_), np.nan) for t, s_ in zip(st.tid, st.season)]; st = st.dropna(subset=['dsrs'])
    X = np.column_stack([np.ones(len(st)), st.bx40, st.dsrs] + [(st.yr == k).astype(float) for k in (1, 2, 3)]); bb = np.linalg.lstsq(X, st.chg, rcond=None)[0]
    st['pred'] = X @ bb; st['res'] = st.chg - st.pred
    st['coach'] = [CO.get((t, int(s_) + 1)) for t, s_ in zip(st.tid, st.season)]
    log(f'coachdev: {len(st)} returning-player pairs league-wide; league residual SD {st.res.std():.2f} bx40; raw change SD {st.chg.std():.2f}')
    for c in WHO:
        d = st[st.coach == c].sort_values(['season', 'res'])
        if not len(d): log(f'{c}: no rows'); continue
        log(f'== {c}: {len(d)} returning players, seasons {int(d.season.min()) + 1}-{int(d.season.max()) + 1}; mean {d.res.mean():+.2f}, SD {d.res.std():.2f}, '
            f'improved beyond expectation {(d.res > 0).mean():.2f}; raw change mean {d.chg.mean():+.2f}; median {d.res.median():+.2f}; '
            f'mean without his top 3 {d.sort_values("res").iloc[:-3].res.mean():+.2f}, without his bottom 3 {d.sort_values("res").iloc[3:].res.mean():+.2f}')
        t = d.groupby('season').res.agg(['size', 'mean', 'std', lambda x: (x > 0).mean()]); t.index = [f'{int(i)}-{str(int(i) + 1)[2:]}' for i in t.index]
        t.columns = ['players', 'mean', 'sd', 'improved']; log(f'{c} by season pair:\n' + t.round(2).to_string())
        sm = d.groupby('season').res.mean(); log(f'{c}: season means SD {sm.std():.2f}; seasons above zero {(sm > 0).sum()} of {len(sm)}')
        for lab, x in [('5 biggest', d.nlargest(5, 'res')), ('5 smallest', d.nsmallest(5, 'res'))]:
            log(f'{c} {lab}:\n' + pd.DataFrame({'player': x.name, 'team': x.team, 'pair': [f'{int(s_)}-{str(int(s_) + 1)[2:]}' for s_ in x.season], 'class': x.yr.astype(int),
                                                 'bx40 before': x.bx40.round(1), 'after': x.bx40_n.round(1), 'raw change': x.chg.round(1), 'beyond expected': x.res.round(1)}).to_string(index=False))
