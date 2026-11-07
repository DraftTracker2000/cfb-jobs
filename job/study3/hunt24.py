# Pattern hunt 24 (Nov 7, 2026 — the owner, 1:16 pm): does head-coaching experience give a college football team any lift, and is "Upset Artist"
# a real trait? ("when looking at the byu vs utah matchup. our pull was toward utah. but then … sitake the byu coach is an upset specialist …
# coupled with the coaches inexperience as a full head coach like our data notes with the asterisk next to his coach score"). STUDY ONLY.
# Games: FBS vs FBS, regular season, with a closing line (CFBD /lines), 2008 on (coaches are known from 2000, so experience has 8+ years to build).
# Experience = the coach's earlier seasons as an FBS head coach (any school) since 2000; FCS/assistant years aren't in the data.
#  X1 cover (margin minus the line) by the coach's experience: first season, second, third, 4-5, 6+
#  X2 experience gap between the two coaches (team minus opponent, capped at 10) → cover, per 5 years
#  X3 first-season coach as a favorite vs as an underdog
#  X4 "Upset Artist" (the site's tag: underdog wins above what the spread expected) — does a coach's edge as an underdog repeat?
#      even vs odd seasons, coaches with 8+ underdog games in each; and prior seasons → this season
#  X5 the owner's case: an underdog coach tagged by his PRIOR seasons as a top-15% upset coach against a favorite coach in his first two seasons
#  X6 "Big-Game Hunter": record vs Elo top-25 opponents beyond the line — repeat? (even vs odd)
import numpy as np, pandas as pd
from scipy import stats
import cfb_base

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    # experience: earlier FBS head-coach seasons (since 2000), any school
    co = CO[CO.cg > 0][['coach', 'season']].drop_duplicates().sort_values('season')
    yrs = co.groupby('coach').season.apply(lambda s: sorted(set(int(x) for x in s))).to_dict()
    exp = lambda c, s: sum(1 for y in yrs.get(c, []) if y < s) if c else np.nan
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna() & (T.season >= 2008)].copy()
    T['xp'] = [exp(c, int(s)) for c, s in zip(T.coach, T.season)]; T['oxp'] = [exp(c, int(s)) for c, s in zip(T.ocoach, T.season)]
    T = T.dropna(subset=['xp', 'oxp'])
    sd = (T.margin - T.exp).std(); T['pwin'] = stats.norm.cdf(T.exp / sd); T['wbeyond'] = T.win - T.pwin
    T['dog'] = T.exp < -0.5; T['fav'] = T.exp > 0.5
    log(f'hunt24: {T.gid.nunique()} games, {len(T)} team-games 2008 on; margin-vs-line spread sd {sd:.1f}')
    R = []
    def rec(key, lab, est, p, n, extra=''):
        if not np.isfinite(p): log(f'[{key}] {lab}: not enough data (n {n})'); return
        R.append((key, lab, est, p, n, extra)); log(f'[{key}] {lab}: {est:+.3f} (p {p:.3g}, n {n}) {extra}')
    def mean_test(key, lab, a, b, col='cover'):
        a, b = a[col].dropna(), b[col].dropna(); t, p = stats.ttest_ind(a, b, equal_var=False)
        h = lambda d: d[d.index.isin(T.index[T.season >= 2019])]
        rec(key, lab, a.mean() - b.mean(), p, len(a), f'vs {len(b)} · {a.mean():+.2f} vs {b.mean():+.2f}')
    # X1
    T['xb'] = pd.cut(T.xp, [-1, 0, 1, 2, 5, 99], labels=['1st season', '2nd', '3rd', '4th-6th', '7th+'])
    tab = T.groupby('xb', observed=True).agg(n=('cover', 'size'), cover=('cover', 'mean'), wbeyond=('wbeyond', 'mean'), win=('win', 'mean'))
    INFO = []
    log('X1 by experience (cover = points beyond the line; wbeyond = wins beyond the line\'s expectation):\n' + tab.round(3).to_string()); INFO.append('X1 table: ' + ' · '.join(f'{i} n {int(r.n)} cover {r.cover:+.2f} wins beyond {r.wbeyond:+.3f}' for i, r in tab.iterrows()))
    mean_test('X1', 'X1 first-season head coach vs everyone else, points beyond the line', T[T.xp == 0], T[T.xp > 0])
    mean_test('X1b', 'X1b first two seasons vs 6+ seasons, points beyond the line', T[T.xp <= 1], T[T.xp >= 6])
    mean_test('X1c', 'X1c first-season head coach, wins beyond the line\'s expectation', T[T.xp == 0], T[T.xp > 0], 'wbeyond')
    h = T[T.season >= 2019]; mean_test('X1h', 'X1h (2019 on) first-season vs everyone else', h[h.xp == 0], h[h.xp > 0])
    # X2
    gap = (T.xp.clip(upper=10) - T.oxp.clip(upper=10)); X = np.column_stack([np.ones(len(T)), gap]); b, *_ = np.linalg.lstsq(X, T.cover, rcond=None)
    res = T.cover - X @ b; se = np.sqrt(res.var() * np.linalg.pinv(X.T @ X)[1, 1]) * np.sqrt(2)   # x2: each game appears twice
    rec('X2', 'X2 experience gap (team minus opponent, capped at 10 seasons) → points beyond the line, per 5 seasons', 5 * b[1], 2 * stats.norm.sf(abs(b[1] / se)), len(T) // 2)
    # X3
    f = T[T.xp == 0]; mean_test('X3', 'X3 first-season coach as favorite minus as underdog (points beyond the line)', f[f.fav], f[f.dog])
    # X4 upset artist: underdog wins beyond expectation, by coach-season
    dg = T[T.dog]; cs = dg.groupby(['coach', 'season']).agg(n=('wbeyond', 'size'), wb=('wbeyond', 'sum'), cv=('cover', 'mean')).reset_index()
    ev = dg[dg.season % 2 == 0].groupby('coach').agg(n=('wbeyond', 'size'), wb=('wbeyond', 'mean'), cv=('cover', 'mean'))
    od = dg[dg.season % 2 == 1].groupby('coach').agg(n=('wbeyond', 'size'), wb=('wbeyond', 'mean'), cv=('cover', 'mean'))
    j = ev.join(od, lsuffix='_e', rsuffix='_o').dropna(); j = j[(j.n_e >= 8) & (j.n_o >= 8)]
    if len(j) < 5: log('X4: too few coaches'); j = None
    if j is not None: r, p = stats.pearsonr(j.wb_e, j.wb_o); rec('X4', 'X4 Upset Artist: underdog wins beyond expectation, even vs odd seasons (coaches with 8+ dog games each)', r, p, len(j))
    if j is not None: r, p = stats.pearsonr(j.cv_e, j.cv_o); rec('X4b', 'X4b underdog points beyond the line, even vs odd seasons', r, p, len(j))
    # prior seasons -> this season: the tag as the site would have shown it before the season
    rows = []
    for c, d in dg.groupby('coach'):
        for s in sorted(d.season.unique()):
            pr = d[d.season < s]; nw = d[d.season == s]
            if len(pr) >= 10 and len(nw) >= 3: rows.append((c, s, pr.wbeyond.mean(), nw.wbeyond.mean(), len(nw), pr.cover.mean(), nw.cover.mean()))
    P = pd.DataFrame(rows, columns=['coach', 'season', 'prior', 'now', 'n', 'pcv', 'ncv'])
    if len(P) >= 5: r, p = stats.pearsonr(P.prior, P.now); rec('X4c', 'X4c prior seasons\' underdog wins beyond expectation → this season\'s (10+ prior dog games)', r, p, len(P))
    # X5 the owner's case
    tag = {}
    for s in sorted(T.season.unique()):
        pr = dg[dg.season < s].groupby('coach').agg(n=('wbeyond', 'size'), wb=('wbeyond', 'mean')); pr = pr[pr.n >= 15]
        if len(pr) >= 20: cut = pr.wb.quantile(.85); tag.update({(c, s): 1 for c in pr.index[pr.wb >= cut]})
    T['up'] = [tag.get((c, s), 0) for c, s in zip(T.coach, T.season)]
    x5 = T[T.dog & (T.up == 1) & (T.oxp <= 1)]; x5o = T[T.dog & (T.up == 1) & (T.oxp >= 2)]
    mean_test('X5', 'X5 an Upset Artist (by prior seasons) as an underdog vs a coach in his first two seasons, minus vs more experienced coaches (points beyond the line)', x5, x5o)
    mean_test('X5b', 'X5b same, wins beyond the line\'s expectation', x5, x5o, 'wbeyond')
    mean_test('X5c', 'X5c any Upset Artist as an underdog vs all other underdogs (points beyond the line)', T[T.dog & (T.up == 1)], T[T.dog & (T.up == 0)])
    # X6 big-game hunter: vs Elo top-25 opponents that week
    T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False)
    bg = T[T.orank <= 25]
    ev = bg[bg.season % 2 == 0].groupby('coach').agg(n=('cover', 'size'), cv=('cover', 'mean')); od = bg[bg.season % 2 == 1].groupby('coach').agg(n=('cover', 'size'), cv=('cover', 'mean'))
    j = ev.join(od, lsuffix='_e', rsuffix='_o').dropna(); j = j[(j.n_e >= 6) & (j.n_o >= 6)]
    if len(j) >= 5: r, p = stats.pearsonr(j.cv_e, j.cv_o); rec('X6', 'X6 Big-Game Hunter: points beyond the line vs top-25 (Elo) opponents, even vs odd seasons (6+ each)', r, p, len(j))
    # the two coaches the owner asked about, as data (not a test)
    for nm in ['Kalani Sitake', 'Morgan Scalley', 'Kyle Whittingham']:
        d = T[T.coach == nm]
        if len(d): INFO.append(f'{nm}: {len(d)} games 2008 on · as underdog {int(d.dog.sum())}: wins beyond expectation {d[d.dog].wbeyond.sum():+.1f} total, points beyond the line {d[d.dog].cover.mean():+.2f} a game · overall vs the line {d.cover.mean():+.2f} · tagged Upset Artist in {int(d.drop_duplicates("season").up.sum())} seasons'); log(f'  {nm}: {len(d)} games 2008 on · as underdog {int(d.dog.sum())}: wins beyond expectation {d[d.dog].wbeyond.sum():+.1f} total, points beyond the line {d[d.dog].cover.mean():+.2f} a game · overall vs the line {d.cover.mean():+.2f}')
    q = bh([x[3] for x in R])
    out = [f'{k} {lab}: {est:+.3f} (p {p:.2g}, q {qq:.2g}, n {n}) {ex}' for (k, lab, est, p, n, ex), qq in zip(R, q)]
    for o in out: log(o)
    s = ' ‖ '.join(out + INFO); [print(f'::notice title=hunt24 {i + 1}::{s[i * 3900:(i + 1) * 3900]}') for i in range((len(s) + 3899) // 3900)]
