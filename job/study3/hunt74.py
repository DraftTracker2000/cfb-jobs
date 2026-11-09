# Hunt 74 (Nov 8, 2026 — the owner, 8:38 pm: "don't we have where head coaches were assistants tho?"). College football coaching trees.
# STUDY ONLY. The site's coordinator pack (p<season>_coord: each team's OC and DC by season, from Wikipedia's season pages) + CFBD's head
# coaches by team and season: a head coach's MENTORS are the head coaches he worked under as a coordinator before his first head job.
# Prediction first (rule 12), against the closing line (2013 on; break-even 52.4%). For each head-coach season, tags from EARLIER seasons only:
#   T1 his mentor's own cover as a head coach before this season (best / worst 20%)
#   T2 his tree-mates' cover (the mentor's other former coordinators, as head coaches, before this season) (best / worst 20%)
#   T3 first-year head coaches who were coordinators vs first-year head coaches who weren't
#   T4 the biggest trees (mentors with 3+ coordinators who became head coaches): their protégés' cover, each tree as a whole
import os, gzip, json, re, numpy as np, pandas as pd
from scipy import stats
from load import norm_name
import cfb_base

def summ(c):
    c = pd.Series(c).dropna(); c = c[c != 0]
    if len(c) < 3: return f'n {len(c)}'
    return f'{c.mean():+.2f} pts vs the line, covers {100 * (c > 0).mean():.1f}% of {len(c)} (p {stats.ttest_1samp(c, 0).pvalue:.2f})'

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    f = [x for x in os.listdir(D) if x.startswith('site_p') and x.endswith('_coord.json.gz')]
    if not f: log('hunt74: no coordinator pack in the study data'); return
    C = json.load(gzip.open(os.path.join(D, f[0]))); C = C.get('col') or C.get('coord', {}).get('col') or {}
    rows = []
    for k, v in C.items():
        y, t = k.split('|', 1)
        for i, nm in enumerate(v or []):
            for n in str(nm or '').split(' / '):
                if n.strip(): rows.append((norm_name(n), n.strip(), t, int(y), 'OC' if i == 0 else 'DC'))
    K = pd.DataFrame(rows, columns=['key', 'name', 'team', 'season', 'side'])
    log(f'hunt74: {len(K)} coordinator seasons, {K.season.min()}–{K.season.max()}, {K.key.nunique()} coordinators, {K.team.nunique()} teams')
    hc = CO.dropna(subset=['coach']).copy(); hc['key'] = hc.coach.map(norm_name)
    hcs = hc.set_index(['team', 'season']).coach
    K['mentor'] = [hcs.get((t, s)) for t, s in zip(K.team, K.season)]
    first = hc.groupby('key').season.min()
    K = K[K.mentor.notna()]; K['mkey'] = K.mentor.map(norm_name)
    K = K[K.key != K.mkey]
    became = K[K.key.isin(first.index)]; became = became[became.season < became.key.map(first)]
    M = became.groupby('key').mkey.agg(lambda s: sorted(set(s))).to_dict()   # coach -> his mentors (coordinator years before his first head job)
    log(f'hunt74: {len(M)} head coaches with coordinator years before their first head job; trees: {pd.Series([m for L in M.values() for m in L]).value_counts().head(12).to_dict()}')
    TT = T[T.both_fbs & T.exp.notna() & T.stype.astype(str).str.startswith('reg') & T.coach.notna()].copy(); TT['key'] = TT.coach.map(norm_name)
    cov = TT.groupby(['key', 'season']).cover.agg(['sum', 'count'])
    def before(keys, s):
        d = cov[cov.index.get_level_values(0).isin(keys) & (cov.index.get_level_values(1) < s)]
        return (d['sum'].sum() / d['count'].sum(), int(d['count'].sum())) if len(d) and d['count'].sum() >= 12 else (np.nan, 0)
    tree = {}
    for c, ms in M.items():
        for m in ms: tree.setdefault(m, set()).add(c)
    R = []
    for (k, s), g in TT.groupby(['key', 'season']):
        ms = M.get(k, [])
        mv = before(ms, s)[0] if ms else np.nan
        mates = set().union(*[tree.get(m, set()) for m in ms]) - {k} if ms else set()
        tv = before(mates, s)[0] if mates else np.nan
        R.append((k, s, g.cover.tolist(), mv, tv, first.get(k) == s, bool(ms)))
    R = pd.DataFrame(R, columns=['key', 'season', 'covers', 'mentor', 'mates', 'first', 'coord'])
    out = []
    for col, lab in (('mentor', 'T1 HIS MENTOR\'S cover as a head coach before this season'), ('mates', 'T2 HIS TREE-MATES\' cover before this season')):
        d = R[R[col].notna()]
        if len(d) < 20: out.append(f'{lab}: too few ({len(d)} coach-seasons)'); continue
        hi, lo = d[col].quantile(.8), d[col].quantile(.2)
        flat = lambda x: [c for L in x.covers for c in L]
        a, b = d[d[col] >= hi], d[d[col] <= lo]
        out.append(f'{lab}: best 20% → {summ(flat(a))} · 2013–19 {summ(flat(a[a.season <= 2019]))} · 2020–26 {summ(flat(a[a.season >= 2020]))} ‖ worst 20% → {summ(flat(b))} · 2013–19 {summ(flat(b[b.season <= 2019]))} · 2020–26 {summ(flat(b[b.season >= 2020]))} ‖ middle {summ(flat(d[(d[col] > lo) & (d[col] < hi)]))} ({len(d)} coach-seasons)')
    fy = R[R['first']]
    out.append(f'T3 FIRST-YEAR head coaches who were coordinators: {summ([c for L in fy[fy.coord].covers for c in L])} ‖ who weren\'t (or not in the pack): {summ([c for L in fy[~fy.coord].covers for c in L])}')
    big = {m: c for m, c in tree.items() if len(c) >= 3}
    tr = []
    for m, cs in sorted(big.items(), key=lambda x: -len(x[1])):
        cc = [c for L in R[R.key.isin(cs)].covers for c in L]; mine = [c for L in R[R.key == m].covers for c in L]
        tr.append(f'{m}: {len(cs)} protégés, {summ(cc)} (mentor himself {summ(mine)})')
    out.append('T4 BIGGEST TREES (protégés as head coaches, 2013 on — description, not a prediction): ' + ' · '.join(tr[:14]))
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt74 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
