# Pattern hunt 3 — shared helpers, self-contained (this folder is published to the public jobs repo as job/study3/ and run on the
# GitHub runner by the data job's study mode; it must not import anything outside itself). STUDY ONLY.
# Copied unchanged from round 1 (docs/research/patternhunt/lib.py: bh, tp, Reg) and round 2 (docs/research/patternhunt2/lib2.py: cmean,
# cratio, cdiff, rtest, yoy, reg_yoy, mech, named, ols_cl, coef — game-clustered SEs; for named agents the larger of the game-clustered
# and the season-level p; holdout = seasons 2022+; leave-one-out = drop the most helpful season).
import numpy as np, pandas as pd
from scipy import stats

HOLD = 2022

def bh(p):
    p = np.asarray(p, float); n = len(p)
    if n == 0: return p
    o = np.argsort(p); r = np.empty(n); r[o] = np.arange(1, n + 1)
    q = p * n / r
    qs = np.minimum.accumulate(q[o][::-1])[::-1]
    out = np.empty(n); out[o] = np.minimum(qs, 1); return out


def tp(t, df): return 2 * stats.t.sf(abs(t), max(df, 1))


class Reg:
    """registry of every test run, pooled for one Benjamini-Hochberg pass at the end."""
    def __init__(self, path): self.path = path; self.rows = []
    def add(self, hyp, label, kind, est, se, p, n, oos_pass=None, loo_pass=None, detail='', headline='', unit=''):
        self.rows.append(dict(hyp=hyp, label=label, kind=kind, est=est, se=se, p=p, n=n, oos_pass=oos_pass, loo_pass=loo_pass,
                              detail=detail, headline=headline, unit=unit))
    def save(self):
        pd.DataFrame(self.rows).to_pickle(self.path)
    def df(self):
        return pd.DataFrame(self.rows)


def cmean(y, g):
    """mean of y and its game-clustered standard error (qbstudy4/common.py)."""
    y = np.asarray(y, float); g = np.asarray(g)
    m = np.isfinite(y); y = y[m]; g = g[m]; n = len(y)
    if n < 2: return np.nan, np.nan, n
    mu = y.mean()
    s = pd.Series(y - mu).groupby(g).sum().values
    G = len(s)
    se = np.sqrt((s ** 2).sum() * G / max(G - 1, 1)) / n if G > 1 else np.nan
    return mu, se, n


def cratio(num, den, g):
    """ratio sum(num)/sum(den) with game-clustered SE (delta method) (qbstudy4/common.py)."""
    num = np.asarray(num, float); den = np.asarray(den, float)
    R = num.sum() / den.sum()
    s = pd.DataFrame({'u': num - R * den, 'g': g}).groupby('g').u.sum().values
    G = len(s)
    se = np.sqrt((s ** 2).sum() * G / max(G - 1, 1)) / den.sum() if G > 1 else np.nan
    return R, se


def p2(z): return 2 * stats.norm.sf(np.abs(z))


def p1(z): return stats.norm.sf(z)


def cdiff(y, x, g, fe=None):
    """slope of y on a 0/1 (or continuous) x with optional fixed effects (demeaned within fe), game-clustered SE."""
    d = pd.DataFrame({'y': np.asarray(y, float), 'x': np.asarray(x, float), 'g': np.asarray(g)})
    if fe is not None: d['fe'] = np.asarray(fe)
    d = d[np.isfinite(d.y) & np.isfinite(d.x)]
    if fe is not None:
        d['x'] = d.x - d.groupby('fe').x.transform('mean'); d['y'] = d.y - d.groupby('fe').y.transform('mean')
    else:
        d['x'] = d.x - d.x.mean(); d['y'] = d.y - d.y.mean()
    sxx = (d.x ** 2).sum()
    if sxx <= 0 or len(d) < 10: return np.nan, np.nan, len(d)
    b = (d.x * d.y).sum() / sxx; u = d.y - b * d.x
    s = (d.x * u).groupby(d.g).sum(); G = len(s)
    se = np.sqrt((s ** 2).sum() * G / max(G - 1, 1)) / sxx
    return b, se, len(d)


def rtest(a, b):
    """Pearson r and one-sided p (r > 0)."""
    a = np.asarray(a, float); b = np.asarray(b, float); m = np.isfinite(a) & np.isfinite(b); a = a[m]; b = b[m]; k = len(a)
    if k < 6: return np.nan, 1.0, k
    r = np.corrcoef(a, b)[0, 1]
    t = r * np.sqrt((k - 2) / max(1 - r * r, 1e-12))
    return r, stats.t.sf(t, k - 2), k


def yoy(S, key, val, season='season', w=None, min_w=0, extra=None):
    """year-to-year repeat of a season-level value: pairs (key, t) -> (key, t+1). Returns dict with r, p, k and the holdout
    (later season >= HOLD) r, p, k, plus the slope (carryover) of next on this. `extra` = optional column to partial out
    (both seasons) — returns the partial r in r_ctl."""
    d = S.copy()
    if w is not None: d = d[d[w] >= min_w]
    nx = d[[key, season, val] + ([extra] if extra else [])].copy(); nx[season] = nx[season] - 1
    j = d[[key, season, val] + ([extra] if extra else [])].merge(nx, on=[key, season], suffixes=('', '_n'))
    j = j[np.isfinite(j[val]) & np.isfinite(j[val + '_n'])]
    if extra: j = j[np.isfinite(j[extra]) & np.isfinite(j[extra + '_n'])]
    r, p, k = rtest(j[val], j[val + '_n'])
    h = j[j[season] + 1 >= HOLD]; rh, ph, kh = rtest(h[val], h[val + '_n'])
    e1 = j[j[season] + 1 <= 2011]; e2 = j[(j[season] + 1 > 2011) & (j[season] + 1 < HOLD)]
    r1, _, k1 = rtest(e1[val], e1[val + '_n']); r2, _, k2 = rtest(e2[val], e2[val + '_n'])
    sl = np.polyfit(j[val], j[val + '_n'], 1)[0] if k > 5 and j[val].std() > 0 else np.nan
    out = dict(r=r, p=p, k=k, r_hold=rh, p_hold=ph, k_hold=kh, r_e1=r1, r_e2=r2, slope=sl,
               oos=bool(np.isfinite(rh) and rh > 0 and ph < .10), sd=d[val].std())
    if extra:
        X = np.column_stack([np.ones(len(j)), j[extra], j[extra + '_n']])
        ra = j[val] - X @ np.linalg.lstsq(X, j[val], rcond=None)[0]; rb = j[val + '_n'] - X @ np.linalg.lstsq(X, j[val + '_n'], rcond=None)[0]
        out['r_ctl'], out['p_ctl'], _ = rtest(ra, rb)
    return out


def reg_yoy(reg, hyp, label, o, unit='r', detail=''):
    d = (f"{o['k']} pairs; r = {o['r']:.3f}; eras {o['r_e1']:.2f} / {o['r_e2']:.2f}; holdout (next season {HOLD}+) r = {o['r_hold']:.2f} "
         f"(p = {o['p_hold']:.3g}, {o['k_hold']} pairs); carryover slope {o['slope']:.2f}")
    if 'r_ctl' in o: d += f"; with control r = {o['r_ctl']:.3f} (p = {o['p_ctl']:.3g})"
    reg.add(hyp, label + ' — repeats year to year (r)', 'family', o['r'], np.nan, o['p'], o['k'], oos_pass=o['oos'],
            detail=d + ('; ' + detail if detail else ''), unit=unit)
    return d


def mech(reg, hyp, label, y, x, g, season, fe=None, unit='', detail=''):
    """mechanism test: slope of y on x (game-clustered), with the holdout (season >= HOLD) re-estimated on its own."""
    season = np.asarray(season)
    b, se, n = cdiff(y, x, g, fe)
    hm = season >= HOLD
    sub = lambda a: None if a is None else np.asarray(a)[hm]
    bh_, seh, nh = cdiff(np.asarray(y)[hm], np.asarray(x)[hm], np.asarray(g)[hm], sub(fe))
    e1 = season <= 2011; sub1 = lambda a: None if a is None else np.asarray(a)[e1]
    b1, se1, _ = cdiff(np.asarray(y)[e1], np.asarray(x)[e1], np.asarray(g)[e1], sub1(fe))
    e2 = (season > 2011) & (season < HOLD); sub2 = lambda a: None if a is None else np.asarray(a)[e2]
    b2, se2, _ = cdiff(np.asarray(y)[e2], np.asarray(x)[e2], np.asarray(g)[e2], sub2(fe))
    p = p2(b / se) if se and np.isfinite(se) and se > 0 else 1.0
    ph = p1(bh_ / seh * np.sign(b)) if seh and np.isfinite(seh) and seh > 0 else np.nan
    oos = bool(np.isfinite(ph) and ph < .10)
    d = (f"{n} rows; est {b:+.4f} (se {se:.4f}); 1999-2011 {b1:+.4f}, 2012-21 {b2:+.4f}; holdout {HOLD}-26 {bh_:+.4f} (se {seh:.4f}, "
         f"one-sided p = {ph:.3g}, {nh} rows)")
    reg.add(hyp, label, 'mechanism', b, se, p, n, oos_pass=oos, detail=d + ('; ' + detail if detail else ''), unit=unit)
    return dict(b=b, se=se, p=p, n=n, b_hold=bh_, se_hold=seh, p_hold=ph, b1=b1, b2=b2, oos=oos, d=d)


def named(reg, hyp, label, R, agent, y, min_seasons=5, min_rows=0, names=None, unit='', season='season', g='game_id', w=None):
    """named tests from game-level rows R (one row per agent-game, y already centred on the league/expectation).
    est = mean y (weighted by w if given) ; p = max(game-clustered p, season-level t p).
    OOS = later half of the agent's seasons keeps the sign at one-sided p < .10 (game-clustered).
    LOO = drop the most helpful season: sign kept and game-clustered p < .05. Also returns a split-half family test."""
    rows = []
    for a, d in R.groupby(agent, observed=True):
        d = d[np.isfinite(d[y])]
        ss = sorted(d[season].unique())
        if len(ss) < min_seasons or len(d) < min_rows: continue
        if w is None:
            est, se, n = cmean(d[y], d[g])
        else:
            est, se = cratio(d[y] * d[w], d[w], d[g]); n = len(d)
        if not (se and np.isfinite(se) and se > 0): continue
        pg_ = p2(est / se)
        sm = d.groupby(season)[y].mean() if w is None else (d[y] * d[w]).groupby(d[season]).sum() / d[w].groupby(d[season]).sum()
        st = sm.mean() / (sm.std(ddof=1) / np.sqrt(len(sm))) if sm.std(ddof=1) > 0 else np.inf
        ps_ = tp(st, len(sm) - 1)
        p = max(pg_, ps_)
        h = len(ss) // 2; late = d[d[season].isin(ss[h:])]; early = d[d[season].isin(ss[:h])]
        if w is None:
            le, lse, _ = cmean(late[y], late[g]); ee, _, _ = cmean(early[y], early[g])
        else:
            le, lse = cratio(late[y] * late[w], late[w], late[g]); ee, _ = cratio(early[y] * early[w], early[w], early[g])
        pl_ = p1(le / lse * np.sign(est)) if lse and np.isfinite(lse) and lse > 0 else np.nan
        best = (sm * np.sign(est)).idxmax(); r_ = d[d[season] != best]
        if w is None: le2, lse2, _ = cmean(r_[y], r_[g])
        else: le2, lse2 = cratio(r_[y] * r_[w], r_[w], r_[g])
        loo = bool(np.sign(le2) == np.sign(est) and lse2 > 0 and p2(le2 / lse2) < .05)
        nm = names.get(a, a) if names is not None else a
        below = int((np.sign(sm) == np.sign(est)).sum())
        rows.append(dict(agent=a, name=nm, n=n, ns=len(ss), est=est, se=se, p_gc=pg_, p_season=ps_, p=p, early=ee, late=le, p_late=pl_,
                         oos=bool(np.isfinite(pl_) and pl_ < .10), loo=loo, same_sign=below, first=ss[0], last=ss[-1]))
    T = pd.DataFrame(rows)
    if len(T) == 0: return T, (np.nan, 1.0, 0)
    for _, x in T.iterrows():
        reg.add(hyp, f'{label}: {x["name"]}', 'named', x.est, x.se, x.p, x.n, x.oos, x.loo,
                detail=(f"{x.ns} seasons {x['first']}-{x['last']}, {x.n} games; {x.same_sign}/{x.ns} seasons same sign; early {x.early:+.3f} late "
                        f"{x.late:+.3f}; p game-clustered {x.p_gc:.2g}, season-level {x.p_season:.2g}"), unit=unit)
    r, pr, k = rtest(T.early, T.late)
    reg.add(hyp, f'{label} — repeats (split-half r across agents)', 'family', r, np.nan, pr, k, oos_pass=bool(np.isfinite(r) and r > 0),
            detail=f'{k} agents with {min_seasons}+ seasons; early half vs late half r = {r:.2f}', unit='r')
    return T, (r, pr, k)


def ols_cl(y, X, g, names=None):
    """OLS of y on X (constant added) with game-clustered (CR1) standard errors. Returns DataFrame b, se, p."""
    X = np.column_stack([np.ones(len(y))] + [np.asarray(c, float) for c in X]); y = np.asarray(y, float); g = np.asarray(g)
    m = np.isfinite(y) & np.isfinite(X).all(1); X = X[m]; y = y[m]; g = g[m]
    XtX = np.linalg.pinv(X.T @ X); b = XtX @ X.T @ y; u = y - X @ b
    S = pd.DataFrame(X * u[:, None]).groupby(g).sum().values; G = len(S); n, k = X.shape
    V = XtX @ (S.T @ S) @ XtX * (G / (G - 1)) * ((n - 1) / (n - k))
    se = np.sqrt(np.diag(V)); idx = ['const'] + (names or [f'x{i}' for i in range(1, k)])
    return pd.DataFrame({'b': b, 'se': se, 'p': p2(b / se)}, index=idx), n


def coef(reg, hyp, label, y, X, names, g, season, term, unit='', detail=''):
    """register one coefficient (term) of a clustered OLS; holdout = same model on seasons >= HOLD."""
    season = np.asarray(season)
    T, n = ols_cl(y, X, g, names); hm = season >= HOLD
    Th, nh = ols_cl(np.asarray(y)[hm], [np.asarray(c)[hm] for c in X], np.asarray(g)[hm], names)
    e1 = season <= 2011
    T1, _ = ols_cl(np.asarray(y)[e1], [np.asarray(c)[e1] for c in X], np.asarray(g)[e1], names)
    e2 = (season > 2011) & ~hm
    T2, _ = ols_cl(np.asarray(y)[e2], [np.asarray(c)[e2] for c in X], np.asarray(g)[e2], names)
    b, se, p = T.loc[term]; bh_, seh = Th.loc[term, 'b'], Th.loc[term, 'se']
    ph = p1(bh_ / seh * np.sign(b)) if seh > 0 and np.isfinite(seh) else np.nan
    oos = bool(np.isfinite(ph) and ph < .10)
    d = (f"{n} rows; {term} {b:+.4f} (se {se:.4f}); 1999-2011 {T1.loc[term, 'b']:+.4f}, 2012-21 {T2.loc[term, 'b']:+.4f}; "
         f"holdout {HOLD}-26 {bh_:+.4f} (se {seh:.4f}, one-sided p = {ph:.3g}, {nh} rows)")
    reg.add(hyp, label, 'mechanism', b, se, p, n, oos_pass=oos, detail=d + ('; ' + detail if detail else ''), unit=unit)
    return dict(b=b, se=se, p=p, oos=oos, d=d, T=T)

