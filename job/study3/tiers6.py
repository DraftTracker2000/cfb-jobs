# Tier follow-up (Nov 23, 9:23–9:27 pm — the owner: "isn't the same as does more with less or the makes players better year after year like we
# confirmed worked for izzo and others?" · "yes. i would like to figure this out to be still the most accurate. also coaches that keep
# starters and players the longest in the new go pro and transfer world"). STUDY ONLY; prints to the run log.
# Built on hunt51.py (same data, same development measure): its run() is executed with this block added at the end, so every frame it
# builds (dv = returning players' development beyond class, level and team change; Tg = the lesser-recruit cuts; st0 = first-season players
# and whether they stayed 3+ seasons; A = player seasons with minutes; RO = rosters) is reused as is.
#   1 DEVELOPMENT AGAINST THE SAME LEVEL: each player's development minus the mean of his level that season (high-major / the rest), so a
#     high-major coach is measured against other high-major coaches. Coach by coach (15+ players), plus the prediction test (rule 12).
#   2 the same for lesser recruits (3-stars and below plus unranked; everyone but 5-stars).
#   3 KEEPING PLAYERS IN THE PORTAL ERA: the share of last season's minutes that come back the next season under the same coach, and
#     whether his first-year players stay 3+ seasons — 2014–20 vs 2021 on (the one-time transfer rule), by level and coach, prediction first.
import os

BLOCK = r'''
    # ======================= tiers6 =======================
    _HMf = lambda c, y: c in ('ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East') or (c == 'Pac-12' and y <= 2024)
    _TC = dict(zip(zip(A.tid, A.season.astype(int)), A.conf))
    NAMED = ['Tom Izzo', 'Dan Hurley', 'Jamie Dixon', 'Mark Pope', 'Kyle Smith', 'Bill Self', 'Mark Few', 'Kelvin Sampson', 'John Calipari', 'Jon Scheyer',
             'Todd Golden', 'Shaka Smart', 'Tad Boyle', 'Matt Painter', 'Tony Bennett', 'Rick Barnes', 'Scott Drew', 'Greg Gard', 'Nate Oats', 'Bruce Pearl',
             'Kevin Willard', 'Chris Beard', 'Hubert Davis', 'Rick Pitino', 'T.J. Otzelberger', 'Dusty May', 'Mick Cronin', 'Tommy Lloyd', 'Jay Wright', 'Mike Krzyzewski']
    def _rel(d, col):
        d = d.copy(); d['s0'] = (d.season - 1).astype(int); d['hm'] = [_HMf(c, s) for c, s in zip(d.conf, d.s0)]
        d['rel'] = d[col] - d.groupby(['season', 'hm'])[col].transform('mean'); return d
    def _table(d, col, lab, mn=15):
        for hm in (True, False):
            x = d[d.hm == hm]; g = x.groupby('coach').agg(n=('rel', 'size'), rel=('rel', 'mean'), raw=(col, 'mean'), ss=('season', 'nunique'),
                                                         early=('rel', lambda s: s[x.loc[s.index, 'season'] <= 2021].mean()), late=('rel', lambda s: s[x.loc[s.index, 'season'] >= 2022].mean()))
            per = x.groupby(['coach', 'season']).rel.mean().reset_index(); up = per.assign(u=per.rel > 0).groupby('coach').u.agg(['sum', 'size'])
            g = g.join(up); g = g[g.n >= mn].sort_values('rel', ascending=False)
            log(f'{lab} · {"HIGH-MAJOR" if hm else "REST"}: {len(x)} players, level mean {x[col].mean():+.2f}; {len(g)} coaches with {mn}+ — top: ' +
                ' | '.join(f'{c} {r.rel:+.2f} vs level ({int(r.n)} pl, {int(r["sum"])}/{int(r["size"])} seasons above; ≤2021 {r.early:+.2f}, 2022+ {r.late:+.2f})' for c, r in g.head(15).iterrows()))
            if hm:
                log(f'{lab} · HIGH-MAJOR named: ' + ' | '.join(f'{c} {g.loc[c].rel:+.2f} vs other high-majors, {g.loc[c].raw:+.2f} vs expected ({int(g.loc[c].n)} pl, {int(g.loc[c]["sum"])}/{int(g.loc[c]["size"])} seasons above; ≤2021 {g.loc[c].early:+.2f}, 2022+ {g.loc[c].late:+.2f})' if c in g.index else f'{c} –' for c in NAMED))
                log(f'{lab} · HIGH-MAJOR bottom: ' + ' | '.join(f'{c} {r.rel:+.2f} ({int(r.n)})' for c, r in g.tail(8).iterrows()))
    R1 = _rel(dv, 'res'); _table(R1, 'res', 'T6-1 DEVELOPMENT vs the same level')
    pred(R1[R1.hm], 'rel', 'T6-1p HIGH-MAJOR coaches tagged on development vs other high-majors (top 15%, last 4 seasons)', 'bx40')
    pred(R1[~R1.hm], 'rel', 'T6-1p REST coaches tagged on development vs their level (top 15%, last 4 seasons)', 'bx40')
    for k_, lab in (('BD02', '3-stars and below plus unranked'), ('BD01', 'everyone but 5-stars')):
        R2 = _rel(Tg[k_][0], 'res'); _table(R2, 'res', f'T6-2 LESSER RECRUITS ({lab}) vs the same level', mn=10)
        pred(R2[R2.hm], 'rel', f'T6-2p HIGH-MAJOR, {lab}', 'bx40', mr=8)
    # ---- 3 keeping players ----
    ap = pd.concat([A[['pid', 'season', 'tid']], RO[['pid', 'season', 'tid']]]).drop_duplicates(); have = set(zip(ap.pid, ap.season.astype(int), ap.tid))
    B = A[A['min'] >= 100].copy(); B['season'] = B.season.astype(int); B['back'] = [(p, s + 1, t) in have for p, s, t in zip(B.pid, B.season, B.tid)]
    last = int(ap.season.max()); B = B[B.season < last]
    K = B.groupby(['tid', 'season']).apply(lambda d: pd.Series({'ret': (d['min'] * d.back).sum() / d['min'].sum(), 'n': len(d),
                                                                'st': d.nlargest(5, 'min').back.mean()})).reset_index()
    K['c0'] = [CO.get((t, s)) for t, s in zip(K.tid, K.season)]; K['c1'] = [CO.get((t, s + 1)) for t, s in zip(K.tid, K.season)]
    K = K[K.c0.notna() & (K.c0 == K.c1)].rename(columns={'c1': 'coach'})   # same coach both seasons: what he kept
    K['hm'] = [_HMf(_TC.get((t, s), ''), s) for t, s in zip(K.tid, K.season)]; K['era'] = np.where(K.season + 1 >= 2022, 'portal 2022+', 'before 2014-21')
    for era in ('before 2014-21', 'portal 2022+'):
        for hm in (True, False):
            x = K[(K.era == era) & (K.hm == hm)]
            log(f'T6-3 MINUTES BACK · {era} · {"HIGH-MAJOR" if hm else "REST"}: {100 * x.ret.mean():.1f}% of last season\'s minutes back, top-5 players back {100 * x.st.mean():.1f}% ({len(x)} team-seasons)')
    K['rel'] = K.ret - K.groupby(['season', 'hm']).ret.transform('mean'); K['srel'] = K.st - K.groupby(['season', 'hm']).st.transform('mean')
    P_ = K[K.era == 'portal 2022+']
    for hm in (True, False):
        x = P_[P_.hm == hm]; g = x.groupby('coach').agg(n=('rel', 'size'), rel=('rel', 'mean'), srel=('srel', 'mean'), ret=('ret', 'mean'), st=('st', 'mean')); g = g[g.n >= 3].sort_values('rel', ascending=False)
        log(f'T6-3 PORTAL ERA KEEPERS · {"HIGH-MAJOR" if hm else "REST"} ({len(g)} coaches, 3+ seasons): top: ' + ' | '.join(f'{c} {100 * r.ret:.0f}% of minutes back ({100 * r.rel:+.0f} vs level), top-5 back {100 * r.st:.0f}% ({int(r.n)} seasons)' for c, r in g.head(15).iterrows()))
        log(f'T6-3 PORTAL ERA KEEPERS · {"HIGH-MAJOR" if hm else "REST"} bottom: ' + ' | '.join(f'{c} {100 * r.ret:.0f}% ({100 * r.rel:+.0f})' for c, r in g.tail(8).iterrows()))
        import json as _js; _k = max(1, round(len(g) * .15)); log('T6-KEEP ' + _js.dumps({'hm': bool(hm), 'n': len(g), 'list': [[c, round(float(r.rel), 3), round(float(r.ret), 3), round(float(r.st), 3), int(r.n)] for c, r in g.head(_k).iterrows()]}))
        if hm: log('T6-3 PORTAL ERA KEEPERS · HIGH-MAJOR named: ' + ' | '.join(f'{c} {100 * g.loc[c].ret:.0f}% ({100 * g.loc[c].rel:+.0f} vs level, top-5 {100 * g.loc[c].st:.0f}%, {int(g.loc[c].n)})' if c in g.index else f'{c} –' for c in NAMED))
    # prediction first: a coach's minutes-back beyond his level in earlier seasons (2+ seasons, portal era) → the next season
    from scipy import stats as _st
    for hm in (True, False):
        a_, b_, kept, ntg = [], [], 0, 0
        x = K[K.hm == hm]
        for s_ in range(2023, last):
            pr = x[(x.season < s_) & (x.season >= max(2021, s_ - 4))].groupby('coach').rel.agg(['mean', 'count']); pr = pr[pr['count'] >= 2]['mean']
            if len(pr) < 10: continue
            tg = set(pr.index[pr >= pr.quantile(.85)]); now = x[(x.season == s_) & x.coach.isin(pr.index)]
            a = now[now.coach.isin(tg)]; a_.append(a.rel); b_.append(now[~now.coach.isin(tg)].rel); kept += int((a.rel > 0).sum()); ntg += len(a)
        if a_:
            A_, B_ = pd.concat(a_), pd.concat(b_); log(f'T6-3p {"HIGH-MAJOR" if hm else "REST"} portal-era keepers (top 15%, earlier portal seasons) → next season: {100 * A_.mean():+.1f} vs {100 * B_.mean():+.1f} points of minutes back beyond the level (p {_st.ttest_ind(A_, B_, equal_var=False).pvalue:.2g}); {kept} of {ntg} above again')
        y = x.copy(); nx = y[['coach', 'tid', 'season', 'rel']].copy(); nx['season'] -= 1; j = y.merge(nx, on=['coach', 'tid', 'season'], suffixes=('', '_n'))
        for era in ('before 2014-21', 'portal 2022+'):
            jj = j[j.era == era]
            if len(jj) > 10: log(f'T6-3y {"HIGH-MAJOR" if hm else "REST"} {era}: same coach year to year r {jj.rel.corr(jj.rel_n):.2f} ({len(jj)} pairs)')
    # stay 3+ seasons, classes 2021 on vs before
    S3 = st0.dropna(subset=['coach']).copy(); S3['hm'] = [_HMf(_TC.get((t, int(f_)), ''), int(f_)) for t, f_ in zip(S3.tid, S3.f)]
    for hm in (True, False):
        for lab, m in (('classes 2014-20', S3.f <= 2020), ('classes 2021-24', S3.f >= 2021)):
            x = S3[(S3.hm == hm) & m]; log(f'T6-3s {"HIGH-MAJOR" if hm else "REST"} {lab}: {100 * x.stay3.mean():.0f}% of first-season players stayed 3+ seasons, {100 * x.xfer.mean():.0f}% transferred within 3 ({len(x)} players)')
        x = S3[(S3.hm == hm) & (S3.f >= 2021)]; x = x.assign(rel=x.stay3 - x.groupby('season').stay3.transform('mean'))
        g = x.groupby('coach').agg(n=('rel', 'size'), stay=('stay3', 'mean'), rel=('rel', 'mean')); g = g[g.n >= 6].sort_values('rel', ascending=False)
        log(f'T6-3s {"HIGH-MAJOR" if hm else "REST"} classes 2021-24, coaches with 6+ first-year players: top: ' + ' | '.join(f'{c} {100 * r.stay:.0f}% stayed 3+ ({int(r.n)})' for c, r in g.head(12).iterrows()) + ' ‖ bottom: ' + ' | '.join(f'{c} {100 * r.stay:.0f}% ({int(r.n)})' for c, r in g.tail(6).iterrows()))
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'hunt51.py')).read()
    tail = "    for c in CTX:\n        x = dv[dv.coach == c]; log(f'{c}: {len(x)} players, development"
    assert src.count(tail) == 1, 'hunt51 tail not found'
    src = src.replace(tail, BLOCK + tail)
    g = {'__name__': 'hunt51_tiers6', '__file__': os.path.join(here, 'hunt51.py')}
    exec(compile(src, 'hunt51_tiers6', 'exec'), g)
    g['run'](reg, log, D)
