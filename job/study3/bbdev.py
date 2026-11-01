# Basketball development follow-up, step 0 (Nov 1 12:54 pm) — checks how year in school comes out of the archive before the tests.
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

# ======================= the tests (focus:bbdev) =======================
# Nov 1 12:54 pm: "what about when taking out 5 stars and seeing what coaches do with less compared to the blue chip teams that are year
# after year leading recruiting classes ... izzo always seems to be developing players that were lesser recruits but they stick with him and
# make gains at most positions year after year. like Carr strating to shoot 3s last year vs the other seasons"
#  BD01 B01 player development by coach, players who weren't 5-stars    BD02 the same, 3-stars and below plus unranked
#  BD03 blue-chip programs (top-10 class in 10+ of the 20 classes 2007-26) vs other programs, for their non-elite players
#  BD04 new skills: 3PA rate, 3P%, FT%, assists, rebounds, blocks, steals per 40 — which are coach-repeatable (split-half) and a coach
#       skill index (named, split-half, year to year)    BD05 retention: share of a coach's starting players who stay 3+ seasons (named, split-half)
#  BD06 stayers improve more (league)    BD07 coaches' retention and development go together (r across coaches, out of sample)
from lib3 import named, coef, yoy, reg_yoy, rtest, bh, Reg, HOLD
import cbb as cb_, bbyears

CTX = ['Tom Izzo', 'Dan Hurley', 'Kyle Smith', 'Jamie Dixon']
POWER = ('ACC', 'Big Ten', 'Big 12', 'SEC', 'Pac-12', 'Big East')

def _bh_names(T):
    if not len(T): return T
    T = T.copy(); T['q'] = bh(T.p.values); T['shows'] = (T.q < .10) & T.oos & T.loo; return T

def _fit(st, y, cols):
    X = np.column_stack([np.ones(len(st))] + [np.asarray(c, float) for c in cols]); b = np.linalg.lstsq(X, st[y].values, rcond=None)[0]; return st[y].values - X @ b

def _ctx(T, label):
    if not len(T): return f'{label}: no coaches'
    T = T.set_index('agent'); out = []
    for c in CTX:
        if c in T.index: x = T.loc[c]; out.append(f'{c} {x.est:+.2f} (p {x.p:.3f}, {int(x.ns)} seasons, {int(x.n)} rows, late {x.late:+.2f}, loo {"y" if x.loo else "n"})')
        else: out.append(f'{c} too few rows')
    return f'{label}: ' + '; '.join(out)

def _top(T, k=6):
    if not len(T): return '(none)'
    return T.sort_values('p').head(k)[['name', 'ns', 'n', 'est', 'p', 'late', 'oos', 'loo']].round(3).to_string(index=False)

def run(reg, log, D):
    s = frame('bb_stats'); m = num(pick(s, 'minutes'))
    A = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str), 'team': pick(s, 'team'),
                      'conf': pick(s, 'conference'), 'pos': pick(s, 'position').astype(str).str[:1].str.upper(), 'min': m, 'name': pick(s, 'name'),
                      'fga': num(pick(s, 'fieldGoals.attempted')), 'tpa': num(pick(s, 'threePointFieldGoals.attempted')), 'tpm': num(pick(s, 'threePointFieldGoals.made')),
                      'fta': num(pick(s, 'freeThrows.attempted')), 'ftm': num(pick(s, 'freeThrows.made')), 'ast': num(pick(s, 'assists')), 'trb': num(pick(s, 'rebounds.total')),
                      'blk': num(pick(s, 'blocks')), 'stl': num(pick(s, 'steals')),
                      'bx40': (num(pick(s, 'points')) + num(pick(s, 'rebounds.total')) + num(pick(s, 'assists')) + num(pick(s, 'steals')) + num(pick(s, 'blocks')) - num(pick(s, 'turnovers'))) / m * 40})
    A = A[A['min'] > 0].sort_values('min', ascending=False).drop_duplicates(['pid', 'season'])
    RO = bbyears.roster_rows(); R = bbyears.recruits(); F = bbyears.first_season(A.pid, A.season, RO, R)
    # old year (startSeason, last seen) kept only to show what the fix changed
    old = RO.dropna(subset=['start']).groupby('pid').start.last()
    A['yr'] = A.season - A.pid.map(F) + 1; A['yr_old'] = A.season - A.pid.map(old) + 1
    log(f'bbdev: {len(A)} player-seasons; year known for {A.yr.notna().mean():.3f}; differs from the old startSeason year in {(A.yr != A.yr_old)[A.yr.notna() & A.yr_old.notna()].mean():.3f}')
    log('old minus new year (200+ min): ' + str((A.yr_old - A.yr)[A['min'] >= 200].value_counts(normalize=True).sort_index().round(3).head(9).to_dict()))
    for n_ in ['Denzel Valentine', 'Matt Costello', 'Joey Hauser', 'Tristen Newton']:
        x = A[A.name == n_].sort_values('season'); log(f'{n_}: ' + ', '.join(f'{int(a)} yr {b} (old {c})' for a, b, c in zip(x.season, x.yr, x.yr_old)))
    # recruits CBBD didn't link to a player id: matched by name + school + first season, so a 5-star isn't counted as unranked (bbyears.link)
    R, rc = bbyears.link(A, F, R, log)
    stars = R.sort_values('stars', ascending=False).drop_duplicates('pid').set_index('pid').stars
    A['stars'] = A.pid.map(stars)
    sr0 = frame('bb_srs'); sr = pd.DataFrame({'t': pick(sr0, 'teamId').astype(str), 's': num(pick(sr0, 'season', '_year')), 'r': num(pick(sr0, 'rating'))}).dropna().drop_duplicates(['t', 's']).set_index(['t', 's']).r
    CO = cb_.coaches(D)
    # ---------- returning-player pairs (same team, 200+ minutes both seasons) ----------
    S = A[A['min'] >= 200].copy()
    S['tpar'] = (S.tpa / S.fga).where(S.fga >= 40); S['tpp'] = (S.tpm / S.tpa).where(S.tpa >= 30); S['ftp'] = (S.ftm / S.fta).where(S.fta >= 25)
    for k in ['ast', 'trb', 'blk', 'stl', 'tpa']: S[k + '40'] = S[k] / S['min'] * 40
    SK = {'tpar': '3PA rate (share of shots)', 'tpp': '3P%', 'ftp': 'FT%', 'ast40': 'assists per 40', 'trb40': 'rebounds per 40', 'blk40': 'blocks per 40', 'stl40': 'steals per 40'}
    keep = ['pid', 'season', 'tid', 'team', 'name', 'pos', 'conf', 'yr', 'yr_old', 'stars', 'bx40'] + list(SK)
    a = S[keep]; b = S[['pid', 'season', 'tid', 'bx40'] + list(SK)].copy(); b['season'] -= 1
    j = a.merge(b, on=['pid', 'season'], suffixes=('', '_n')); j = j[j.tid == j.tid_n].copy()
    j['dsrs'] = [sr.get((t, s_ + 1), np.nan) - sr.get((t, s_), np.nan) for t, s_ in zip(j.tid, j.season)]
    j['coach'] = [CO.get((t, int(s_) + 1)) for t, s_ in zip(j.tid, j.season)]; j['after'] = j.season + 1
    j['chg'] = j.bx40_n - j.bx40

    def b01(d, ycol):
        d = d.dropna(subset=['bx40', 'bx40_n', 'dsrs', ycol]).copy(); d = d[d[ycol].between(1, 4)]
        d['res'] = _fit(d, 'chg', [d.bx40, d.dsrs] + [(d[ycol] == k) for k in (1, 2, 3)]); return d
    # ---------- the class-year fix: B01 before and after ----------
    outB = {}
    for lab, yc in [('old year', 'yr_old'), ('fixed year', 'yr')]:
        d = b01(j, yc); T, fam = named(Reg(None), 'x', 'B01', d.dropna(subset=['coach']).assign(season=lambda z: z.after), 'coach', 'res', min_seasons=6, min_rows=40, g='pid')
        T = _bh_names(T); famok = bool(fam[0] > 0 and fam[1] < .05); outB[lab] = (d, T)
        log(f'B01 {lab}: {len(d)} pairs; split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches); coaches that show (q<.10, later half, leave-one-out, family passes): '
            f'{list(T[T.shows].name) if famok and len(T) else []}')
        log(_ctx(T, f'B01 {lab}'))
    dev, TB = outB['fixed year']
    # ---------- BD01 / BD02 lesser recruits ----------
    Tg = {}
    for hyp, lab, mask, mr in [('BD01', 'not 5-stars', dev.stars.fillna(0) < 5, 40), ('BD02', '3-stars and below plus unranked', dev.stars.fillna(0) <= 3, 30)]:
        d = dev[mask].copy(); d['res'] = _fit(d, 'chg', [d.bx40, d.dsrs] + [(d.yr == k) for k in (1, 2, 3)])
        d = d.dropna(subset=['coach']).assign(season=lambda z: z.after)
        T, fam = named(reg, hyp, f'Basketball player development by coach, {lab} (bx40 beyond class, level, team SRS change)', d, 'coach', 'res', min_seasons=6, min_rows=mr, g='pid', unit='bx40')
        Tg[hyp] = (d, T); log(f'{hyp} {lab}: {len(d)} pairs; split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches)\n' + _top(T)); log(_ctx(T, hyp))
    for c in CTX:
        x = dev[dev.coach == c]; lo = Tg['BD02'][0]; lo = lo[lo.coach == c]
        log(f'{c} (fixed year): {len(x)} pairs, mean {x.res.mean():+.2f}, SD {x.res.std():.2f}, improved {(x.res > 0).mean():.2f}, without top 3 {x.res.sort_values().iloc[:-3].mean():+.2f}; '
            f'by position ' + ', '.join(f'{p_} {g.res.mean():+.2f} ({len(g)})' for p_, g in x.groupby('pos')) + f'; by stars ' +
            ', '.join(f'{int(k_)}* {g.res.mean():+.2f} ({len(g)})' for k_, g in x.assign(sg=x.stars.fillna(0)).groupby('sg')) + f'; 3-star-and-below pairs {len(lo)}, mean {lo.res.mean():+.2f}')
    # ---------- BD03 blue-chip programs ----------
    # class scores from every listed recruit, linked to a player or not
    Rk = pd.DataFrame({'year': num(pick(rc, 'year', '_year')), 'rating': num(pick(rc, 'rating')), 'tid': pick(rc, 'committedTo.id').astype(str).str.replace(r'\.0$', '', regex=True),
                       'id': pick(rc, 'id')}).dropna(subset=['rating', 'year']).drop_duplicates(['id', 'year']); Rk = Rk[~Rk.tid.isin(['nan', 'None', ''])]
    Rk['i'] = Rk.groupby(['tid', 'year']).rating.rank(ascending=False, method='first') - 1
    # a class score: each recruit's rating above the 3-star floor (.80), best recruit fully, the 5th about half. (Run 2 summed raw ratings, which
    # put big low-major classes of 2-stars in the top 10 — Stephen F. Austin and UNC Greensboro in 2010 — so it was replaced.)
    log('rating by stars: ' + str(R.groupby('stars').rating.describe()[['min', '50%', 'max']].round(3).to_dict('index')))
    Rk['pts'] = (Rk.rating - .80).clip(lower=0) * 100 * np.exp(-(Rk.i / 5) ** 2)
    C = Rk.groupby(['year', 'tid']).pts.sum().reset_index(); C['rk'] = C.groupby('year').pts.rank(ascending=False, method='min')
    top = C[C.rk <= 10].groupby('tid').year.nunique(); ny = C.year.nunique()
    blue = set(top[top >= ny / 2].index); tnm = dict(zip(A.tid, A.team))
    log(f'BD03 blue-chip programs (top-10 class in {int(np.ceil(ny / 2))}+ of {ny} classes): ' + ', '.join(f'{tnm.get(t, t)} {top[t]}' for t in sorted(blue, key=lambda t: -top[t])))
    log('next tier (6-9 top-10 classes): ' + ', '.join(f'{tnm.get(t, t)} {top[t]}' for t in top[(top >= 6) & (top < ny / 2)].sort_values(ascending=False).index))
    for y_ in (2010, 2015, 2020, 2024):
        x = C[C.year == y_].sort_values('rk').head(10); log(f'class top 10 {y_}: ' + ', '.join(tnm.get(t, t) for t in x.tid))
    t15 = C[C.rk <= 15].groupby('tid').year.nunique(); blue15 = set(t15[t15 >= ny / 2].index)
    log(f'check, top-15 class in {int(np.ceil(ny / 2))}+ classes: ' + ', '.join(f'{tnm.get(t, t)} {t15[t]}' for t in sorted(blue15, key=lambda t: -t15[t])))
    for lab, mask in [('3-stars and below plus unranked', dev.stars.fillna(0) <= 3), ('not 5-stars', dev.stars.fillna(0) < 5)]:
        d = dev[mask].copy(); d['res'] = _fit(d, 'chg', [d.bx40, d.dsrs] + [(d.yr == k) for k in (1, 2, 3)]); h = d[d.conf.isin(POWER)]; b15 = h.tid.isin(blue15)
        o, _ = __import__('lib3').ols_cl(h.res, [b15.astype(float)], h.pid, ['b']); log(f'check {lab}, top-15 set vs other power: {h[b15].res.mean():+.2f} ({int(b15.sum())} pairs) vs {h[~b15].res.mean():+.2f}; diff {o.loc["b", "b"]:+.2f} (se {o.loc["b", "se"]:.2f}, p {o.loc["b", "p"]:.3f})')
    for lab, mask in [('3-stars and below plus unranked', dev.stars.fillna(0) <= 3), ('not 5-stars', dev.stars.fillna(0) < 5)]:
        d = dev[mask].copy(); d['blue'] = d.tid.isin(blue).astype(float); d['hm'] = d.conf.isin(POWER).astype(float)
        d['res'] = _fit(d, 'chg', [d.bx40, d.dsrs] + [(d.yr == k) for k in (1, 2, 3)])
        log(f'BD03 {lab}: mean beyond expected — blue-chip {d[d.blue == 1].res.mean():+.2f} ({int(d.blue.sum())} pairs), other power-conference {d[(d.blue == 0) & (d.hm == 1)].res.mean():+.2f} '
            f'({int(((d.blue == 0) & (d.hm == 1)).sum())}), everyone else {d[(d.blue == 0) & (d.hm == 0)].res.mean():+.2f}')
        h = d[d.hm == 1]
        r_ = coef(reg, 'BD03', f'Blue-chip programs vs other power-conference programs: development of their {lab} (bx40)', h.res, [h.blue], ['blue'], h.pid, h.after, 'blue', unit='bx40')
        log(f'BD03 {lab} blue vs other power: {r_["d"]}')
    # ---------- BD04 new skills ----------
    Z = []
    for k, lab in SK.items():
        d = j.dropna(subset=[k, k + '_n', 'yr']).copy(); d = d[d.yr.between(1, 4)]
        d['c'] = d[k + '_n'] - d[k]; d['r'] = _fit(d, 'c', [d[k]] + [(d.yr == q) for q in (1, 2, 3)] + [(d.pos == p) for p in ('G', 'F')])
        d['z'] = d.r / d.r.std(); Z.append(d[['pid', 'season', 'z']].rename(columns={'z': k}))
        x = d.dropna(subset=['coach']).assign(season=lambda z: z.after)
        T, fam = named(Reg(None), 'x', lab, x, 'coach', 'z', min_seasons=6, min_rows=40, g='pid')
        reg.add('BD04', f'Coach players add a skill: {lab} — repeats (split-half r across coaches)', 'family', fam[0], np.nan, fam[1], fam[2], oos_pass=bool(np.isfinite(fam[0]) and fam[0] > 0),
                detail=f'{len(x)} pairs; change beyond class, level and position, in SDs', unit='r')
        T = _bh_names(T); log(f'BD04 {lab}: {len(d)} pairs; split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches); best: ' +
                               (', '.join(f'{x_.name} {x_.est:+.2f} (q {x_.q:.2f})' for x_ in T.sort_values('p').head(3).itertuples()) if len(T) else '-') + ' | ' +
                               '; '.join(f'{c} {T.set_index("agent").est.get(c, np.nan):+.2f}' for c in CTX))
    Zi = Z[0]
    for z in Z[1:]: Zi = Zi.merge(z, on=['pid', 'season'], how='outer')
    Zi['idx'] = Zi[list(SK)].mean(axis=1).where(Zi[list(SK)].notna().sum(axis=1) >= 4)
    jj = j.merge(Zi[['pid', 'season', 'idx']], on=['pid', 'season']).dropna(subset=['idx', 'coach'])
    jj = jj[jj.yr.between(1, 4)].assign(season=lambda z: z.after)
    T, fam = named(reg, 'BD04', 'Coach whose players add skills (mean of 7 skill changes, SDs)', jj, 'coach', 'idx', min_seasons=6, min_rows=40, g='pid', unit='SD')
    log(f'BD04 skill index: {len(jj)} pairs; split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches)\n' + _top(T)); log(_ctx(T, 'BD04 skill index')); TS = T
    Sx = jj.groupby(['season', 'tid', 'coach']).idx.agg(['mean', 'count']).reset_index().rename(columns={'mean': 'v'}); Sx = Sx[Sx['count'] >= 3]; Sx['key'] = Sx.tid + '|' + Sx.coach
    log('BD04 ' + reg_yoy(reg, 'BD04', 'Team-season skill adds repeat (same team and coach)', yoy(Sx, 'key', 'v')))
    log('BD04 skill index vs bx40 development (player pairs) r = %.2f' % jj.merge(dev[['pid', 'after', 'res']].rename(columns={'after': 'season'}), on=['pid', 'season'])[['idx', 'res']].corr().iloc[0, 1])
    # ---------- Carr ----------
    for pid_ in A[A.name.astype(str).str.contains('Carr', na=False) & A.team.astype(str).str.contains('Michigan St', na=False) & (A['min'] >= 100)].pid.unique()[:3]:
        x = A[A.pid == pid_].sort_values('season'); n_ = x.name.iloc[0]
        log(f'{n_} [{pid_}], ' + '/'.join(x.team.astype(str).unique()) + ':\n' + pd.DataFrame({'season': [f'{int(v) - 1}-{str(int(v))[2:]}' for v in x.season], 'yr': x.yr, 'min': x['min'].astype(int), 'FGA': x.fga, '3PA': x.tpa,
                                                      '3PA rate': (x.tpa / x.fga).round(3), '3PA/40': (x.tpa / x['min'] * 40).round(2), '3P%': (x.tpm / x.tpa).round(3), 'FT%': (x.ftm / x.fta).round(3),
                                                      'bx40': x.bx40.round(1)}).to_string(index=False))
    # ---------- BD05 retention ----------
    ap = pd.concat([A[['pid', 'season', 'tid']], RO[['pid', 'season', 'tid']]]).drop_duplicates()
    A['f'] = A.pid.map(F); st0 = A[A.season == A.f].sort_values('min', ascending=False).drop_duplicates('pid')[['pid', 'f', 'tid', 'min']]
    early = A[A.season <= A.f + 1].groupby('pid')['min'].max(); st0['listed'] = st0.pid.isin(set(R.pid)); st0 = st0[st0.listed | (st0.pid.map(early) >= 100)]
    st0 = st0[st0.f <= 2024].copy()
    seen = ap.merge(st0[['pid', 'tid', 'f']], on=['pid', 'tid']); seen = seen[seen.season.between(seen.f, seen.f + 4)].groupby('pid').season.nunique()
    st0['stay3'] = (st0.pid.map(seen).fillna(1) >= 3).astype(float)
    oth = ap.merge(st0[['pid', 'tid', 'f']], on='pid', suffixes=('', '_0')); oth = oth[(oth.tid != oth.tid_0) & oth.season.between(oth.f + 1, oth.f + 3)]
    st0['xfer'] = st0.pid.isin(set(oth.pid)).astype(float)
    st0['coach'] = [CO.get((t, int(f_))) for t, f_ in zip(st0.tid, st0.f)]; st0['season'] = st0.f.astype(int)
    st0['y'] = st0.stay3 - st0.groupby('season').stay3.transform('mean'); st0['bl'] = st0.tid.isin(blue)
    log(f'BD05: {len(st0)} players starting 2008-2024 (listed recruits or 100+ minutes in two seasons; coach known from 2014, the coaches pack\'s first season); stayed 3+ seasons {st0.stay3.mean():.2f}, transferred within 3 {st0.xfer.mean():.2f}; '
        f'by season {st0.groupby("season").stay3.mean().round(2).to_dict()}; blue-chip {st0[st0.bl].stay3.mean():.2f} vs others {st0[~st0.bl].stay3.mean():.2f}')
    T, fam = named(reg, 'BD05', 'Coach whose starting players stay 3+ seasons (share, beyond the season)', st0.dropna(subset=['coach']), 'coach', 'y', min_seasons=6, min_rows=20, g='pid', unit='share')
    log(f'BD05 retention: split-half r {fam[0]:.2f} (p {fam[1]:.3g}, {fam[2]} coaches)\n' + _top(T)); log(_ctx(T, 'BD05 retention')); TR = T
    xc = st0.dropna(subset=['coach']); log('BD05 transferred out within 3 seasons: ' + '; '.join(f'{c} {xc[xc.coach == c].xfer.mean():.2f} of {int((xc.coach == c).sum())}' for c in CTX) + f'; league {st0.xfer.mean():.2f}')
    # ---------- BD06 the ones who stay improve ----------
    d = dev[dev.yr == 1].copy(); nxt = set(zip(ap.pid, ap.season, ap.tid)); d['stays'] = [(p, int(s_) + 2, t) in nxt for p, s_, t in zip(d.pid, d.season, d.tid)]
    d['stays'] = d.stays.astype(float); r_ = coef(reg, 'BD06', 'Freshman-to-sophomore jump of players who then stay a 3rd season vs who leave (bx40)', d.res, [d.stays], ['stays'], d.pid, d.after, 'stays', unit='bx40')
    log(f'BD06: {r_["d"]}; stay {d.stays.mean():.2f}')
    # ---------- BD07 retention and development go together across coaches ----------
    def est(df, col, lo, hi, minr):
        x = df[(df.season >= lo) & (df.season <= hi)]; g = x.groupby('coach')[col]; e = g.mean(); return e[g.size() >= minr]
    dv = dev.dropna(subset=['coach']).assign(season=lambda z: z.after)
    # the coaches pack starts in 2014, so a split by years leaves almost no coach (first run: 7). Split by PLAYER instead: retention from
    # players whose first season is odd, development from pairs of players whose first season is even — no player is in both.
    dv['f'] = dv.pid.map(F); r0 = st0.dropna(subset=['coach'])
    e1 = est(r0, 'y', 2008, 2026, 15); e2 = est(dv, 'res', 2008, 2026, 25); k = e1.index.intersection(e2.index); r, p, n = rtest(e1[k], e2[k])
    log(f'BD07 same players and years: r {r:.2f} (p {p:.3g}, {n} coaches)')
    e1 = est(r0[r0.f % 2 == 1], 'y', 2008, 2026, 10); e2 = est(dv[dv.f % 2 == 0], 'res', 2008, 2026, 20); k = e1.index.intersection(e2.index); r, p, n = rtest(e1[k], e2[k])
    h1 = est(r0[(r0.f % 2 == 1)], 'y', 2008, 2026, 10); h2 = est(dv[(dv.f % 2 == 0) & (dv.season >= HOLD)], 'res', HOLD, 2026, 8); kh = h1.index.intersection(h2.index); rh, ph, nh = rtest(h1[kh], h2[kh])
    reg.add('BD07', 'Coaches whose players stay are coaches whose players improve (r across coaches; retention and development from different players)', 'family', r, np.nan, p, n,
            oos_pass=bool(np.isfinite(rh) and rh > 0 and ph < .10), detail=f'{n} coaches; retention from players starting in odd seasons, development from players starting in even seasons; '
            f'holdout (development {HOLD}-26) r {rh:.2f} (p {ph:.3g}, {nh})', unit='r')
    log(f'BD07 different players: r {r:.2f} (p {p:.3g}, {n} coaches); holdout r {rh:.2f} (p {ph:.3g}, {nh}); ' + '; '.join(f'{c} retention {e1.get(c, np.nan):+.2f} dev {e2.get(c, np.nan):+.2f}' for c in CTX))
    # ---------- the four coaches, all measures ----------
    rows = []
    for c in CTX:
        g = lambda T: (lambda t: f'{t.est:+.2f} p{t.p:.3f}' if t is not None else '-')(T.set_index('agent').loc[c] if len(T) and c in set(T.agent) else None)
        rows.append([c, g(TB), g(Tg['BD01'][1]), g(Tg['BD02'][1]), g(TS), g(TR)])
    log('context (est and p):\n' + pd.DataFrame(rows, columns=['coach', 'B01 fixed', 'not 5-star', '3-star and below', 'skill index SD', 'stay 3+ share']).to_string(index=False))
