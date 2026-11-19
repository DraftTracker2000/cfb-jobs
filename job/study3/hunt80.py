# Hunt 80 (Nov 19, 2026 — the owner, 4:39 pm: "i want it to be the best and most accurate and not leading anyone astray").
# STUDY ONLY. The prediction test (CLAUDE.md rule 12) of hunt 79's college angles: walk forward. For each season Y, pick the rules that held
# over 52.4% in both halves of the seasons BEFORE Y only, then score them in Y. Same data, stats and "biggest of the week/day" picks as hunt 79
# (hunt79.cfb / hunt79.cbb, with its test_block swapped for one that keeps each pick). Prints aggregate tables only.
import numpy as np, pandas as pd
import hunt79

PICKS = []

def keep_block(lab, X, M, wk, out, split):
    for m, sg in M.items():
        for side in ('o', 'd'):
            if side == 'o': a, b = sg * X['r_' + m], sg * X['opp_rd_' + m]
            else: a, b = -sg * X['r_d_' + m], -sg * X['opp_r_' + m]
            X2 = X.assign(_a=a, _b=b).dropna(subset=['_a', '_b'])
            if len(X2) < 200: continue
            X2 = X2.assign(_z=hunt79.zs(X2, '_a', wk) + hunt79.zs(X2, '_b', wk))
            top = X2.sort_values('_z', ascending=False).groupby(wk).head(1)
            for bet in ('cov', 'tto', 'gov'):
                for d in (1, 0):
                    v = top[bet] if d else 1 - top[bet]
                    PICKS.append(pd.DataFrame({'lab': lab, 'rule': f'{m}|{side}|{bet}|{"for" if d else "fade"}', 'season': top.season.values, 'r': v.values}))

SHOWN = {'CFB': {'give|o|cov|for': 'ball security → covers', 'give|o|tto|for': 'ball security → team total over', 'ypc|o|gov|fade': 'yards a carry → under',
                 'pf|o|gov|fade': 'points → under', 'ypa|o|gov|fade': 'yards a pass → under', 'ypa|o|cov|fade': 'yards a pass → other side covers'},
         'CBB': {'reb|o|tto|for': 'rebounding → team total over', 'tov|d|tto|for': 'forced turnovers → team total over', 'm3|d|cov|fade': 'three-point D → other side covers'}}

def walk(lab, out):
    R = pd.concat([p for p in PICKS if p.lab.iloc[0] == lab]) if any(len(p) and p.lab.iloc[0] == lab for p in PICKS) else None
    if R is None: out.append(f'{lab}: no picks'); return
    R = R.dropna(subset=['r']); R = R[(R.r == 0) | (R.r == 1)]
    seasons = sorted(int(s) for s in R.season.unique()); F = []
    for Y in seasons:
        prior = [s for s in seasons if s < Y]
        if len(prior) < 4: continue
        h = len(prior) // 2; A, B = prior[:h], prior[h:]
        P = R[R.season.isin(prior)].groupby('rule').apply(lambda x: pd.Series({'ra': x[x.season.isin(A)].r.mean(), 'rb': x[x.season.isin(B)].r.mean()}))
        sel = set(P[(P.ra > .524) & (P.rb > .524)].index)
        f = R[(R.season == Y) & R.rule.isin(sel)]; F.append(f.assign(Y=Y))
        out.append(f'{lab} {Y}: {len(sel)} rules picked from {A[0]}–{B[-1]} · forward {int(f.r.sum())}-{int((1 - f.r).sum())} ({100 * f.r.mean():.1f}%)')
    F = pd.concat(F); out.append(f'{lab} ALL forward {int(F.r.sum())}-{int((1 - F.r).sum())} = {100 * F.r.mean():.1f}% (break-even 52.4%)')
    for k, nm in SHOWN[lab].items():
        f = F[F.rule == k]; x = R[R.rule == k]
        out.append(f'{lab} shown: {nm} · forward {int(f.r.sum())}-{int((1 - f.r).sum())} ({100 * f.r.mean() if len(f) else float("nan"):.1f}%, {f.Y.nunique()} seasons) · all seasons {100 * x.r.mean():.1f}% n{len(x)}')
    # the strongest single rule on its own: every season after the first four, its rate in the seasons before vs that season
    for k in SHOWN[lab]:
        x = R[R.rule == k]; by = x.groupby('season').r.agg(['sum', 'count'])
        out.append(f'{lab} by season {SHOWN[lab][k]}: ' + ' '.join(f'{int(s)} {int(r["sum"])}-{int(r["count"] - r["sum"])}' for s, r in by.iterrows()))

def run(reg, log, D):
    out = []
    hunt79.test_block = keep_block
    for lab, f in (('CFB', hunt79.cfb), ('CBB', hunt79.cbb)):
        try: f(log, []); walk(lab, out)
        except Exception as e:
            import traceback; out.append(f'{lab} failed: ' + ' / '.join(l.strip() for l in traceback.format_exc().splitlines() if 'hunt' in l or 'Error' in l)[-1500:])
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt80 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
