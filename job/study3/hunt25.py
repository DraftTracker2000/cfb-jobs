# Pattern hunt 25 (Nov 7, 2026 — 1:28 pm: "at least for first year coaches it might be something to look into. i like testing that in all
# ways"): hunt 24 found a team with a coach in his first FBS head-coaching season runs about 0.8 points a game worse than the closing line.
# Here: every cut of it. STUDY ONLY. FBS vs FBS regular season with a closing line, 2008 on; experience as in hunt 24.
#  F1  by part of the season: weeks 1-4, 5-8, 9+ (does the market catch up?)
#  F2  favorite vs underdog; big favorite (7+) / big dog (7+)
#  F3  home vs road
#  F4  conference vs non-conference games
#  F5  Power conference vs Group of 5 school
#  F6  brand-new head coach (no FBS HC seasons) vs a veteran head coach in his first season at a new school
#  F7  both coaches in their first season (excluded from the others' "vs" side) and first-year vs first-year
#  F8  era: 2008-13, 2014-20, 2021 on (transfer portal)
#  F9  totals: game points minus the posted total when a first-year coach is on either side
#  F10 betting record: first-year side's cover rate vs 50% (and vs 52.4%, the break-even at -110)
#  F11 year two: the 2nd-season bump hunt 24 showed (+0.4) — real?
#  F12 interim/mid-season coaches excluded (a coach with < 6 games that season) — does the effect hold for full-season hires only?
import numpy as np, pandas as pd
from scipy import stats
import cfb_base
from load import frame, pick

P5 = {'SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12'}
def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    co = CO[CO.cg > 0][['coach', 'season', 'team', 'cg']]
    yrs = co.groupby('coach').season.apply(lambda s: sorted(set(int(x) for x in s))).to_dict()
    at = co.groupby(['coach', 'team']).season.apply(lambda s: sorted(set(int(x) for x in s))).to_dict()
    cg = co.set_index(['team', 'season']).cg.to_dict()
    exp = lambda c, s: sum(1 for y in yrs.get(c, []) if y < s) if c else np.nan
    here = lambda c, t, s: sum(1 for y in at.get((c, t), []) if y < s) if c else np.nan
    # totals
    l = frame('cf_lines', flat=False); ou = {}
    for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
        if not isinstance(L, list): continue
        v = [x.get('overUnder') for x in L if x.get('provider') in ('consensus', 'Consensus') and x.get('overUnder') not in (None, '')] or \
            [x.get('overUnder') for x in L if x.get('overUnder') not in (None, '')]
        try: v = [float(a) for a in v]
        except Exception: v = []
        if v: ou[gid] = float(np.mean(v))
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna() & (T.season >= 2008)].copy()
    T['xp'] = [exp(c, int(s)) for c, s in zip(T.coach, T.season)]; T['oxp'] = [exp(c, int(s)) for c, s in zip(T.ocoach, T.season)]
    T['here'] = [here(c, t, int(s)) for c, t, s in zip(T.coach, T.team, T.season)]
    T['full'] = [cg.get((t, int(s)), 0) >= 6 for t, s in zip(T.team, T.season)]
    T = T.dropna(subset=['xp', 'oxp']).copy()
    sd = (T.margin - T.exp).std(); T['wbeyond'] = T.win - stats.norm.cdf(T.exp / sd); T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    T['ou'] = T.gid.map(ou); T['tot_over'] = (T.pf + T.pa) - T.ou
    T['first'] = (T.here == 0)                 # first season at this school as head coach
    T['new'] = T.first & (T.xp == 0)           # first season as an FBS head coach at all
    T['vet_new'] = T.first & (T.xp > 0)        # a veteran head coach in his first season at a new school
    T['ofirst'] = [here(c, t, int(s)) == 0 if c else False for c, t, s in zip(T.ocoach, T.opp, T.season)]
    T['p5'] = T.conf.isin(P5); T['grp'] = np.where(T.week <= 4, 'wk 1-4', np.where(T.week <= 8, 'wk 5-8', 'wk 9+'))
    T['era'] = np.where(T.season <= 2013, '2008-13', np.where(T.season <= 2020, '2014-20', '2021 on'))
    base = T[~T.first & ~T.ofirst]             # games where neither coach is new at his school: the comparison
    log(f'hunt25: {T.gid.nunique()} games; first-season-at-school team-games {int(T.first.sum())} (brand-new head coaches {int(T.new.sum())}, veterans at a new school {int(T.vet_new.sum())}); margin-vs-line sd {sd:.1f}')
    R, INFO = [], []
    def rec(key, lab, a, b, col='cover'):
        a, b = a[col].dropna(), b[col].dropna()
        if len(a) < 30 or len(b) < 30: INFO.append(f'{key} {lab}: too few ({len(a)})'); return
        t, p = stats.ttest_ind(a, b, equal_var=False); R.append((key, lab, a.mean() - b.mean(), p, len(a), f'{a.mean():+.2f} vs {b.mean():+.2f} (n {len(b)})'))
    def cut(key, lab, mask_first, mask_base, col='cover'): rec(key, lab, T[T.first & ~T.ofirst & mask_first], base[mask_base], col)
    rec('F0', 'all first-season-at-school coaches vs games with no new coach, points beyond the line', T[T.first & ~T.ofirst], base)
    rec('F0n', 'brand-new FBS head coaches only', T[T.new & ~T.ofirst], base)
    rec('F0w', 'wins beyond the line\'s expectation (first season at school)', T[T.first & ~T.ofirst], base, 'wbeyond')
    for g in ['wk 1-4', 'wk 5-8', 'wk 9+']: cut('F1', f'part of season {g}', T.grp == g, base.grp == g)
    cut('F2f', 'as favorite', T.exp > .5, base.exp > .5); cut('F2d', 'as underdog', T.exp < -.5, base.exp < -.5)
    cut('F2F', 'as a 7+ point favorite', T.exp >= 7, base.exp >= 7); cut('F2D', 'as a 7+ point underdog', T.exp <= -7, base.exp <= -7)
    cut('F3h', 'at home', T.ishome == 1, base.ishome == 1); cut('F3r', 'on the road', T.ishome == 0, base.ishome == 0)
    cut('F4c', 'conference games', T.conf_game, base.conf_game); cut('F4n', 'non-conference games', ~T.conf_game, ~base.conf_game)
    cut('F5p', 'Power-conference school', T.p5, base.p5); cut('F5g', 'Group of 5 school', ~T.p5, ~base.p5)
    rec('F6', 'brand-new head coach minus veteran at a new school (points beyond the line)', T[T.new & ~T.ofirst], T[T.vet_new & ~T.ofirst])
    rec('F6v', 'veteran head coach in his first season at a new school vs no new coach', T[T.vet_new & ~T.ofirst], base)
    ff = T[T.first & T.ofirst]; INFO.append(f'F7 both coaches new at their schools: {ff.gid.nunique()} games (each side is the other\'s mirror, so no test; home side {ff[ff.ishome == 1].cover.mean():+.2f} beyond the line)')
    for e in ['2008-13', '2014-20', '2021 on']: cut('F8', f'era {e}', T.era == e, base.era == e)
    gm = T.drop_duplicates('gid'); gm = gm[gm.tot_over.notna()]
    rec('F9', 'game total minus the posted total, a new coach on either side vs neither', gm[gm.first | gm.ofirst], gm[~gm.first & ~gm.ofirst], 'tot_over')
    a = T[T.first & ~T.ofirst].covered.dropna(); k = int(a.sum()); n = len(a)
    if n: p = stats.binomtest(k, n, .5).pvalue; R.append(('F10', 'first-season side\'s cover rate vs 50%', k / n - .5, p, n, f'covered {k}/{n} = {k / n:.1%}; fading them wins {1 - k / n:.1%} (break-even at -110 is 52.4%)'))
    T['second'] = (T.here == 1); rec('F11', 'second season at the school vs no new coach', T[T.second & ~T.ofirst], base)
    rec('F12', 'full-season hires only (6+ games that season)', T[T.first & T.full & ~T.ofirst], base)
    q = bh([r[3] for r in R])
    out = [f'{k} {lab}: {est:+.3f} (p {p:.2g}, q {qq:.2g}, n {n}) {ex}' for (k, lab, est, p, n, ex), qq in zip(R, q)]
    for o in out + INFO: log(o)
    s = ' ‖ '.join(out + INFO); [print(f'::notice title=hunt25 {i + 1}::{s[i * 3900:(i + 1) * 3900]}') for i in range((len(s) + 3899) // 3900)]
