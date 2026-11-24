# Tier lines for Data Busters, part 5 (Nov 23 — rule 15): the college coaching-tree tests by tier. STUDY ONLY; prints aggregates.
#   mentor vs protégé games (hunts 74/77 rule: a mentor = a head coach the man was a coordinator under before his first head job) — straight
#   up (cfbtree 1, 2008–25, every FBS-vs-FBS game) and against the line (afterline 6), by which side is a power program;
#   the mentor's cover before this season → the protégé's covers (coaches 8, hunt 74 T1), by the protégé's tier;
#   the mentor's lift before this season → the protégé's lift (coaches 7, hunt 75), by the protégé's tier.
import os, gzip, json, numpy as np, pandas as pd
from scipy import stats
import cfb_base
from load import frame, norm_name
from tiers2 import power, note


def summ(c):
    c = pd.Series(c).dropna(); c = c[c != 0]
    if len(c) < 3: return f'n {len(c)}'
    return f'{c.mean():+.2f} vs the line, covers {100 * (c > 0).mean():.1f}% of {len(c)}'


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    f = [x for x in os.listdir(D) if x.startswith('site_p') and x.endswith('_coord.json.gz')]
    if not f: print('::notice title=tiers5::no coordinator pack'); return
    C = json.load(gzip.open(os.path.join(D, f[0]))); C = C.get('col') or C.get('coord', {}).get('col') or {}
    rows = []
    for k, v in C.items():
        y, t = k.split('|', 1)
        for nm in v or []:
            for n in str(nm or '').split(' / '):
                if n.strip(): rows.append((norm_name(n), t, int(y)))
    K = pd.DataFrame(rows, columns=['key', 'team', 'season'])
    hc = CO.dropna(subset=['coach']).copy(); hc['key'] = hc.coach.map(norm_name); hcs = hc.set_index(['team', 'season']).coach
    K['mkey'] = [norm_name(hcs.get((t, s))) if hcs.get((t, s)) else None for t, s in zip(K.team, K.season)]; first = hc.groupby('key').season.min()
    K = K[K.mkey.notna() & (K.key != K.mkey) & K.key.isin(first.index)]; K = K[K.season < K.key.map(first)]
    M = K.groupby('key').mkey.agg(set).to_dict()
    lines = [f'{len(M)} head coaches with a mentor']
    A = T[T.both_fbs].copy()
    A['pw'] = [power(c, t, int(s)) for c, t, s in zip(A.conf, A.team, A.season)]; A['opw'] = [power(c, t, int(s)) for c, t, s in zip(A.oconf, A.opp, A.season)]
    A['ck'] = A.coach.map(lambda c: norm_name(c) if isinstance(c, str) else None); A['ok'] = A.ocoach.map(lambda c: norm_name(c) if isinstance(c, str) else None)
    A['mentor'] = [bool(o and c and c in M.get(o, set())) for c, o in zip(A.ck, A.ok)]   # this team's coach is the opponent coach's mentor
    m = A[A.mentor & (A.season <= 2025)]
    for nm, x in (('all', m), ('mentor P vs protégé P', m[m.pw & m.opw]), ('mentor P vs protégé G', m[m.pw & ~m.opw]), ('mentor G vs protégé P', m[~m.pw & m.opw]), ('mentor G vs protégé G', m[~m.pw & ~m.opw])):
        w = int((x.margin > 0).sum()); l = int((x.margin < 0).sum()); xl = x[x.exp.notna() & x.stype.astype(str).str.startswith('reg')]
        lines.append(f'mentor vs protégé {nm}: {w}-{l} straight up · vs the line {summ(xl.cover)} · mentor favored in {(xl.exp > 0).sum()} of {len(xl)}')
    # coaches 8 — the mentor's cover before this season → the protégé's covers
    TT = A[A.exp.notna() & A.stype.astype(str).str.startswith('reg') & A.coach.notna()].copy(); TT['key'] = TT.ck
    cov = TT.groupby(['key', 'season']).cover.agg(lambda s: ((s > 0).sum(), (s != 0).sum()))
    cs = pd.DataFrame(cov.tolist(), index=cov.index, columns=['w', 'n'])
    def before(keys, s):
        d = cs[cs.index.get_level_values(0).isin(keys) & (cs.index.get_level_values(1) < s)]
        return d.w.sum() / d.n.sum() if len(d) and d.n.sum() >= 12 else np.nan
    R = []
    for (k, s), g in TT.groupby(['key', 'season']):
        ms = M.get(k)
        if not ms: continue
        R.append((k, s, g.cover.tolist(), before(ms, s), bool(g.pw.iloc[0])))
    R = pd.DataFrame(R, columns=['key', 'season', 'covers', 'mv', 'pw']).dropna(subset=['mv'])
    if len(R) < 10: R = None; lines.append('tree vs the line: too few')
    hi, lo = (R.mv.quantile(.8), R.mv.quantile(.2)) if R is not None else (0, 0)
    flat = lambda x: [c for L in x.covers for c in L]
    for nm, x in ((('all', R), ('power', R[R.pw]), ('G5', R[~R.pw])) if R is not None else ()):
        lines.append(f'tree vs the line {nm}: best-covering mentors → {summ(flat(x[x.mv >= hi]))} ‖ worst → {summ(flat(x[x.mv <= lo]))} ({len(x)} coach-seasons)')
    # coaches 7 — the mentor's lift before this season → the protégé's lift (hunt 75's definitions)
    c = frame('cf_info', flat=False); hr = []
    for _, x in c.iterrows():
        nm = f"{x.get('firstName', '')} {x.get('lastName', '')}".strip()
        for s in x['seasons'] if isinstance(x.get('seasons'), list) else []:
            g = s.get('games') or 0
            if g: hr.append((norm_name(nm), s.get('school'), int(s.get('year')), s.get('wins') or 0, s.get('losses') or 0, s.get('ties') or 0))
    H = pd.DataFrame(hr, columns=['key', 'team', 'season', 'w', 'l', 't']).drop_duplicates(['team', 'season', 'key'])
    H['pct'] = (H.w + .5 * H.t) / (H.w + H.l + H.t).replace(0, np.nan)
    ts = H.groupby(['team', 'season']).apply(lambda d: (d.w.sum() + .5 * d.t.sum()) / max((d.w + d.l + d.t).sum(), 1)).to_dict()
    start = H.groupby(['key', 'team']).season.min().to_dict()
    H['base'] = [np.nanmean([ts.get((t, start[(k, t)] - i), np.nan) for i in (1, 2, 3)]) for k, t in zip(H.key, H.team)]
    H['lift'] = H.pct - H.base
    cf = {}
    for t, s, cc in zip(A.team, A.season, A.conf): cf.setdefault((t, int(s)), cc)
    H['pw'] = [power(cf.get((t, int(s)), ''), t, int(s)) for t, s in zip(H.team, H.season)]
    P = H[H.key.isin(M.keys()) & H.lift.notna()].copy()
    P['m'] = [np.nanmean(H[H.key.isin(M[k]) & (H.season < s)].lift) if (H.key.isin(M[k]) & (H.season < s) & H.lift.notna()).sum() >= 3 else np.nan for k, s in zip(P.key, P.season)]
    P = P.dropna(subset=['m'])
    if len(P) < 10: lines.append('mentor lift: too few'); P = None
    hi, lo = (P.m.quantile(.8), P.m.quantile(.2)) if P is not None else (0, 0)
    fmt = lambda x: f'{100 * x.lift.mean():+.1f} lift, {100 * x.pct.mean():.1f}% wins ({len(x)} seasons, {x.key.nunique()} coaches)'
    for nm, x in ((('all', P), ('power', P[P.pw]), ('G5', P[~P.pw])) if P is not None else ()):
        lines.append(f'mentor lift {nm}: best 20% mentors → {fmt(x[x.m >= hi])} ‖ worst 20% → {fmt(x[x.m <= lo])} ‖ everyone here {fmt(x)}')
    for l in lines: log(l)
    note('tiers5 trees', lines)
