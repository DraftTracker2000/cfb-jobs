# Pattern hunt 31 (Nov 7, 2026): retest series, part 5 — college football teams and coaches against the line, prediction first (rule 12).
# Hunt 3 threw out a program's home edge (and its home edge vs the line) as "doesn't repeat"; hunts 2/13 the NFL versions (which part 1
# found DO predict). STUDY ONLY. FBS vs FBS regular season with a closing line, 2008 on; tagged from the two earlier seasons only.
#  C1 programs against the spread (top/bottom)   C2 head coaches against the spread (top/bottom)
#  C3 a program's home edge against the line (home cover minus road cover) → its home games
#  C4 close games (decided by 8 or less): wins beyond what the line expected (top/bottom)
#  C5 turnover-free? (not in this data) — skipped
import numpy as np, pandas as pd
from scipy import stats
import cfb_base

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy()
    sd = (T.margin - T.exp).std(); T['wx'] = T.win - stats.norm.cdf(T.exp / sd)
    T['covered'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan)); T['home1'] = T.ishome == 1; T['road'] = T.ishome == 0
    OUT = []
    def tagtest(lab, unit, tagcol, scorecol, pct=.15, top=True, min_n=12, data=None, scoredata=None, homeedge=False, rate=True):
        data = T if data is None else data; scoredata = data if scoredata is None else scoredata; tagged, rest, per = [], [], []
        for s in range(2008, int(T.season.max()) + 1):
            pr = data[(data.season >= s - 2) & (data.season < s) & data[unit].notna()]
            if homeedge:
                m = pr.groupby([unit, 'home1'])[tagcol].agg(['mean', 'size']).unstack()
                try: v = (m[('mean', True)] - m[('mean', False)])[(m[('size', True)] >= 6) & (m[('size', False)] >= 6)]
                except KeyError: continue
            else:
                m = pr.groupby(unit)[tagcol].agg(['mean', 'size']); v = m['mean'][m['size'] >= min_n]
            if len(v) < 20: continue
            cut = v.quantile(1 - pct) if top else v.quantile(pct); tg = set(v.index[v >= cut] if top else v.index[v <= cut])
            now = scoredata[(scoredata.season == s) & scoredata[unit].isin(v.index)]; a = now[now[unit].isin(tg)]; tagged.append(a); rest.append(now[~now[unit].isin(tg)])
            for u, d in a.groupby(unit): per.append((u, d[scorecol].mean(), len(d)))
        A, B = pd.concat(tagged), pd.concat(rest); t, p = stats.ttest_ind(A[scorecol].dropna(), B[scorecol].dropna(), equal_var=False)
        pe = pd.DataFrame(per, columns=['u', 'v', 'n']); pe = pe[pe.n >= 3]; edge = (A[scorecol].mean() - B[scorecol].mean()) * (1 if top else -1)
        line = (f'{lab} ({"top" if top else "bottom"} {int(pct * 100)}%): tagged {A[scorecol].mean():+.3f} vs others {B[scorecol].mean():+.3f} → edge {edge:+.3f} '
                f'(p {p:.2g}, {len(A)} games)')
        if rate: c = A.covered.mean(); line += f' · as a bet {(c if top else 1 - c):.1%}'
        line += f' · tagged ones that did it: {int(((pe.v > B[scorecol].mean()) if top else (pe.v < B[scorecol].mean())).sum())} of {len(pe)}'
        OUT.append(line); log(line)
    for pct in (.10, .15):
        for top in (True, False):
            tagtest('C1 programs against the spread', 'team', 'cover', 'cover', pct, top)
            tagtest('C2 head coaches against the spread', 'coach', 'cover', 'cover', pct, top)
            tagtest('C3 program home edge vs the line → home games', 'team', 'cover', 'cover', pct, top, homeedge=True, scoredata=T[T.home1])
            C = T[T.margin.abs() <= 8]
            tagtest('C4 close games: wins beyond the line', 'team', 'wx', 'wx', pct, top, min_n=5, data=C, rate=False)
    s = ' ‖ '.join(OUT); [print(f'::notice title=hunt31 {i + 1}::{s[i * 3900:(i + 1) * 3900]}') for i in range((len(s) + 3899) // 3900)]
