# Pattern hunt 26 (Nov 7, 2026 — rule 12, 1:35 pm: "our first test should be “does this work in predictions?” if it does work you then compare
# it to other coaches of the same ilk"): the coach tags, prediction first. STUDY ONLY. FBS vs FBS regular season with a closing line, 2008 on.
# Each season, a coach is tagged from his EARLIER seasons only (as the site would have shown it going in); then that season's games score it.
#  U  Upset Artist: top X% of coaches (15+ earlier underdog games) in underdog wins beyond what the line expected. Then: his games as an
#     underdog that season — points beyond the line, cover rate (52.4% breaks even at -110), wins beyond the line. Thresholds 10/15/25%.
#  U-ilk: every tagged coach on his own: how many of them beat the line as a dog in the seasons after being tagged
#  B  Big-Game Hunter: top X% (10+ earlier games vs Elo top-25 opponents) in points beyond the line in those games. Then: that season's
#     games vs top-25 opponents. Same ilk check.
#  Sitake, Whittingham, Scalley: their tagged seasons and what followed.
import numpy as np, pandas as pd
from scipy import stats
import cfb_base

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna() & T.coach.notna() & (T.season >= 2004)].copy()
    sd = (T.margin - T.exp).std(); T['wbeyond'] = T.win - stats.norm.cdf(T.exp / sd)
    T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    T['dog'] = T.exp < -0.5; T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False); T['big'] = T.orank <= 25
    OUT, INFO = [], []
    def score(lab, tagged, rest):
        a, b = tagged, rest
        if len(a) < 20: OUT.append(f'{lab}: too few ({len(a)})'); return
        t, p = stats.ttest_ind(a.cover.dropna(), b.cover.dropna(), equal_var=False); cr = a.covered.mean(); k = int(a.covered.sum()); n = int(a.covered.notna().sum())
        pb = stats.binomtest(k, n, .5).pvalue if n else np.nan
        OUT.append(f'{lab}: tagged {a.cover.mean():+.2f} beyond the line vs {b.cover.mean():+.2f} others (p {p:.2g}) · covered {k}/{n} = {cr:.1%} (vs 50% p {pb:.2g}; 52.4% breaks even) · wins beyond the line {a.wbeyond.mean():+.3f} vs {b.wbeyond.mean():+.3f} · {a.coach.nunique()} coaches, {len(a)} games')
    def tags(pool, key, min_n, pct):
        tg = {}
        for s in sorted(T.season.unique()):
            if s < 2008: continue
            pr = pool[pool.season < s].groupby('coach').agg(n=(key, 'size'), v=(key, 'mean')); pr = pr[pr.n >= min_n]
            if len(pr) >= 20: cut = pr.v.quantile(1 - pct); tg.update({(c, s): 1 for c in pr.index[pr.v >= cut]})
        return tg
    def ilk(lab, games):
        g = games.groupby('coach').agg(n=('cover', 'size'), cv=('cover', 'mean'), cr=('covered', 'mean')).sort_values('n', ascending=False)
        g = g[g.n >= 5]
        if not len(g): return
        OUT.append(f'{lab} same ilk: {int((g.cv > 0).sum())} of {len(g)} tagged coaches (5+ games after being tagged) beat the line; median {g.cv.median():+.2f} a game; '
                   f'covered 52.4%+: {int((g.cr >= .524).sum())} of {len(g)}')
        INFO.append(f'{lab} coaches: ' + ' · '.join(f'{c} {int(r.n)}g {r.cv:+.1f} ({r.cr:.0%})' for c, r in g.head(25).iterrows()))
    dg = T[T.dog]; S = T[T.season >= 2008]
    for pct in (.10, .15, .25):
        tg = tags(dg, 'wbeyond', 15, pct); S = S.assign(up=[tg.get((c, s), 0) for c, s in zip(S.coach, S.season)])
        score(f'U top {int(pct * 100)}% Upset Artist, as an underdog that season', S[S.dog & (S.up == 1)], S[S.dog & (S.up == 0)])
        if pct == .15: ilk('U 15%', S[S.dog & (S.up == 1)]); U15 = S.copy()
    bg = T[T.big]
    for pct in (.10, .15, .25):
        tg = tags(bg, 'cover', 10, pct); S = S.assign(bgh=[tg.get((c, s), 0) for c, s in zip(S.coach, S.season)])
        score(f'B top {int(pct * 100)}% Big-Game Hunter, vs top-25 opponents that season', S[S.big & (S.bgh == 1)], S[S.big & (S.bgh == 0)])
        if pct == .15: ilk('B 15%', S[S.big & (S.bgh == 1)])
    for nm in ['Kalani Sitake', 'Kyle Whittingham', 'Morgan Scalley']:
        d = U15[U15.coach == nm]
        if not len(d): continue
        by = d[d.dog].groupby('season').agg(tag=('up', 'max'), n=('cover', 'size'), cv=('cover', 'mean'), w=('win', 'sum'))
        INFO.append(f'{nm} as an underdog by season (tag = Upset Artist going in): ' + ' · '.join(f'{int(s)}{"*" if r.tag else ""} {int(r.n)}g {r.cv:+.1f} ({int(r.w)} wins)' for s, r in by.iterrows())
                    + f' · tagged seasons {d[d.dog & (d.up == 1)].cover.mean():+.2f} a game, untagged {d[d.dog & (d.up == 0)].cover.mean():+.2f}')
    for o in OUT + INFO: log(o)
    s = ' ‖ '.join(OUT + INFO); [print(f'::notice title=hunt26 {i + 1}::{s[i * 3900:(i + 1) * 3900]}') for i in range((len(s) + 3899) // 3900)]
