# Pattern hunt 43 (Nov 7, 2026 — 4:06 pm "did any of our adds help utah on the other side"; 5:45 pm "we just want the best formulas").
# STUDY ONLY. Do the college coach tags (Upset Artist, Big-Game Hunter) belong to the coach or the program? Prediction first (rule 12).
#  G1 program tags (set by team, from the team's earlier seasons whoever coached) vs coach tags: which predicts better, and together?
#  G2 after a coaching change: the program carried the OLD coach's tag → its first seasons under the new coach (dog games / top-25 games)
#  G3 same, when the new coach is a first-time FBS head coach (often promoted in-house, like Utah 2026)
# Scores: points beyond the line in those games, cover rate, and the betting record at the formula sizes (+0.8 / +1.2).
import numpy as np, pandas as pd
from scipy import stats
import cfb_base

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy()
    sd = (T.margin - T.exp).std(); T['wx'] = T.win - stats.norm.cdf(T.exp / sd); T['dog'] = T.exp < -0.5
    T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False); T['big'] = T.orank <= 25
    T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    yrs = CO[CO.cg > 0].groupby('coach').season.apply(lambda s: set(int(x) for x in s)).to_dict()
    prevc = {}
    for t, d in CO[CO.cg > 0].sort_values('season').groupby('team'):
        L = list(zip(d.season, d.coach))
        for (s0, c0), (s1, c1) in zip(L, L[1:]): prevc[(t, s1)] = c0
    OUT = []
    def tags(pool, unit, val, s, min_n):
        pr = pool[(pool.season < s) & pool[unit].notna()].groupby(unit)[val].agg(['mean', 'size']); pr = pr[pr['size'] >= min_n]
        return set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]) if len(pr) >= 20 else set()
    rows = []
    for s in range(2008, int(T.season.max()) + 1):
        uc = tags(T[T.dog], 'coach', 'wx', s, 15); ut = tags(T[T.dog], 'team', 'wx', s, 15)
        bc = tags(T[T.big], 'coach', 'cover', s, 10); bt = tags(T[T.big], 'team', 'cover', s, 10)
        now = T[T.season == s].copy()
        now['uc'] = now.coach.isin(uc); now['ut'] = now.team.isin(ut); now['bc'] = now.coach.isin(bc); now['bt'] = now.team.isin(bt)
        old = [prevc.get((t, s)) for t in now.team]; now['changed'] = [o is not None and o != c for o, c in zip(old, now.coach)]
        now['old_u'] = [o in uc for o in old]; now['old_b'] = [o in bc for o in old]
        now['first_hc'] = [c is not None and not any(y < s for y in yrs.get(c, set())) for c in now.coach]
        rows.append(now)
    X = pd.concat(rows)
    for c in ('uc', 'ut', 'bc', 'bt', 'changed', 'old_u', 'old_b', 'first_hc', 'dog', 'big'): X[c] = X[c].fillna(False).astype(bool)
    def score(lab, a, b):
        if len(a) < 20: OUT.append(f'{lab}: too few ({len(a)})'); return
        t, p = stats.ttest_ind(a.cover.dropna(), b.cover.dropna(), equal_var=False)
        OUT.append(f'{lab}: {a.cover.mean():+.2f} beyond the line vs {b.cover.mean():+.2f} others → {a.cover.mean() - b.cover.mean():+.2f} (p {p:.2g}) · covered {a.covered.mean():.1%} of {len(a)}')
    D_, B_ = X[X.dog], X[X.big]
    score('G1 Upset Artist by COACH, as a dog', D_[D_.uc], D_[~D_.uc & ~D_.ut]); score('G1 Upset Artist by PROGRAM, as a dog', D_[D_.ut], D_[~D_.uc & ~D_.ut])
    score('G1 both coach and program tagged, as a dog', D_[D_.uc & D_.ut], D_[~D_.uc & ~D_.ut]); score('G1 program tagged but not the coach, as a dog', D_[D_.ut & ~D_.uc], D_[~D_.uc & ~D_.ut])
    score('G1 Big-Game Hunter by COACH, vs top 25', B_[B_.bc], B_[~B_.bc & ~B_.bt]); score('G1 Big-Game Hunter by PROGRAM, vs top 25', B_[B_.bt], B_[~B_.bc & ~B_.bt])
    score('G1 both, vs top 25', B_[B_.bc & B_.bt], B_[~B_.bc & ~B_.bt]); score('G1 program but not the coach, vs top 25', B_[B_.bt & ~B_.bc], B_[~B_.bc & ~B_.bt])
    ch_d, ch_b = D_[D_.changed], B_[B_.changed]
    score('G2 new coach, old coach was an Upset Artist, as a dog', ch_d[ch_d.old_u], ch_d[~ch_d.old_u]); score('G2 new coach, old coach was a Big-Game Hunter, vs top 25', ch_b[ch_b.old_b], ch_b[~ch_b.old_b])
    f_d, f_b = ch_d[ch_d.first_hc], ch_b[ch_b.first_hc]
    score('G3 first-time head coach, old coach an Upset Artist, as a dog', f_d[f_d.old_u], f_d[~f_d.old_u]); score('G3 first-time head coach, old coach a Big-Game Hunter, vs top 25', f_b[f_b.old_b], f_b[~f_b.old_b])
    for nm, s in (('Utah', 2026),):
        d = X[(X.team == nm) & (X.season == s)]
        if len(d): OUT.append(f'{nm} {s}: program Upset Artist {bool(d.ut.any())}, program Big-Game Hunter {bool(d.bt.any())}, old coach tags: Upset {bool(d.old_u.any())}, Big-Game {bool(d.old_b.any())}, first-time head coach {bool(d.first_hc.any())}')
    for o in OUT: log(o)
    s_ = ' ‖ '.join(OUT); [print(f'::notice title=hunt43 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
