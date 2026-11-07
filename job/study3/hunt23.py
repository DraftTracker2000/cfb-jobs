# Pattern hunt 23 (Nov 7, 2026 — Sam, 1:42 am: "do all the hunts you listed"): does a college football coach's style follow him to a new
# school? (hunt 19 found a basketball coach's pace does, weight .51). Season stats (cf_tstats) + coach by team-season (cf_info via cfb_base).
# For coaches who changed schools between consecutive seasons: the new school's first-year number regressed on the coach's old school's
# number the year before and on the new school's own number the year before (both as distance from that season's average). STUDY ONLY.
import numpy as np, pandas as pd
import cfb_base
from load import frame, pick, num

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    t = frame('cf_tstats'); t['season'] = num(pick(t, 'season', 'year', '_year')); t['key'] = pick(t, 'team').astype(str); t['stat'] = pick(t, 'statName').astype(str); t['val'] = num(pick(t, 'statValue'))
    P = t.pivot_table(index=['key', 'season'], columns='stat', values='val', aggfunc='first').reset_index(); g = P['games'].replace(0, np.nan)
    P['plays'] = P.get('rushingAttempts', np.nan) + P.get('passAttempts', np.nan)
    V = {'pace': P['plays'] / g, 'runshare': P.get('rushingAttempts', np.nan) / P['plays'], 'fourth': P.get('fourthDowns', np.nan) / g,
         'sacks': P.get('sacks', np.nan) / g, 'tfl': P.get('tacklesForLoss', np.nan) / g, 'pens': P.get('penaltyYards', np.nan) / g}
    for k, v in V.items(): P[k] = pd.to_numeric(v, errors='coerce')
    co = CO.set_index(['team', 'season']).coach; P['coach'] = [co.get((a, int(b)) if b == b else None) for a, b in zip(P.key, P.season)]
    P = P.dropna(subset=['coach']); log(f'hunt23: {len(P)} team-seasons with a coach')
    Pi = P.set_index(['key', 'season']); mv = []
    for c, d in P.sort_values('season').groupby('coach'):
        d = d.sort_values('season').reset_index(drop=True)
        for i in range(1, len(d)):
            if d.season[i] == d.season[i - 1] + 1 and d.key[i] != d.key[i - 1]: mv.append((c, d.key[i - 1], d.key[i], int(d.season[i])))
    log(f'hunt23: {len(mv)} coach moves'); out = []
    for k, lab in (('pace', 'plays a game (tempo)'), ('runshare', 'run share of plays'), ('fourth', 'fourth-down tries a game'), ('sacks', 'sacks a game (defense)'), ('tfl', 'tackles for loss a game'), ('pens', 'penalty yards a game')):
        lg = P.groupby('season')[k].mean(); rows = []
        for c, old, new, s in mv:
            try: a = Pi.loc[(old, s - 1), k]; b = Pi.loc[(new, s - 1), k]; y = Pi.loc[(new, s), k]
            except KeyError: continue
            if np.isscalar(a) and np.isscalar(b) and np.isscalar(y) and np.isfinite([a, b, y]).all(): rows.append((a - lg[s - 1], b - lg[s - 1], y - lg[s]))
        if len(rows) < 30: continue
        A = np.array(rows); X = np.column_stack([np.ones(len(A)), A[:, 0], A[:, 1]]); bb, *_ = np.linalg.lstsq(X, A[:, 2], rcond=None); res = A[:, 2] - X @ bb
        cov = res.var() * np.linalg.inv(X.T @ X); z = bb[1] / np.sqrt(cov[1, 1]); from scipy import stats; p = 2 * stats.norm.sf(abs(z))
        out.append(f'{lab}: coach weight {bb[1]:.2f} (p {p:.2g}), program weight {bb[2]:.2f}, n {len(A)}')
        log(f'[H23] {lab}: coach {bb[1]:.3f} (p {p:.3g}) program {bb[2]:.3f} n {len(A)}')
    print(f'::notice title=hunt23::' + ' ‖ '.join(out))
