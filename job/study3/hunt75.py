# Hunt 75 (Nov 8, 2026 — the owner, 8:51 pm, on the coaching trees: "what about just measuring by success and not the line or anything").
# STUDY ONLY. Same trees as hunt 74 (mentors = head coaches a man was a coordinator under before his first head job; the site's coordinator
# pack, 2008–2026). Success = CFBD's head-coach seasons (/coaches): win %, 9+ win seasons, a final AP ranking (postseasonRank), and LIFT:
# his win % at a school against that school's win % in the 3 seasons before he arrived (programs differ, so raw win % alone flatters the
# men who took good jobs). Prediction first (rule 12): does a mentor's success BEFORE a season (or his tree-mates') say anything about the
# protégé's lift that season? Then the trees described.
import os, gzip, json, numpy as np, pandas as pd
from scipy import stats
from load import frame, norm_name

def run(reg, log, D):
    c = frame('cf_info', flat=False); rows = []
    for _, x in c.iterrows():
        nm = f"{x.get('firstName', '')} {x.get('lastName', '')}".strip()
        for s in x['seasons'] if isinstance(x.get('seasons'), list) else []:
            g = s.get('games') or 0
            if not g: continue
            rows.append((nm, norm_name(nm), s.get('school'), int(s.get('year')), g, s.get('wins') or 0, s.get('losses') or 0, s.get('ties') or 0, s.get('postseasonRank')))
    H = pd.DataFrame(rows, columns=['coach', 'key', 'team', 'season', 'g', 'w', 'l', 't', 'fin']).sort_values('g', ascending=False).drop_duplicates(['team', 'season', 'key'])
    H['pct'] = (H.w + .5 * H.t) / (H.w + H.l + H.t).replace(0, np.nan)
    # the school's win % in the 3 seasons before this coach's first season there (any coach)
    ts = H.groupby(['team', 'season']).apply(lambda d: (d.w.sum() + .5 * d.t.sum()) / max((d.w + d.l + d.t).sum(), 1)).to_dict()
    start = H.groupby(['key', 'team']).season.min().to_dict()
    H['base'] = [np.nanmean([ts.get((t, start[(k, t)] - i), np.nan) for i in (1, 2, 3)]) for k, t in zip(H.key, H.team)]
    H['lift'] = H.pct - H.base
    log(f'hunt75: {len(H)} head-coach seasons, {H.season.min()}–{H.season.max()}; final AP rank filled for {H.fin.notna().mean():.2f}')
    f = [x for x in os.listdir(D) if x.startswith('site_p') and x.endswith('_coord.json.gz')]
    C = json.load(gzip.open(os.path.join(D, f[0]))); C = C.get('col') or C.get('coord', {}).get('col') or {}
    K = []
    for k, v in C.items():
        y, t = k.split('|', 1)
        for nm in v or []:
            for n in str(nm or '').split(' / '):
                if n.strip(): K.append((norm_name(n), t, int(y)))
    K = pd.DataFrame(K, columns=['key', 'team', 'season'])
    hc = H.sort_values('g', ascending=False).drop_duplicates(['team', 'season']).set_index(['team', 'season']).key
    K['mkey'] = [hc.get((t, s)) for t, s in zip(K.team, K.season)]; K = K[K.mkey.notna() & (K.key != K.mkey)]
    first = H.groupby('key').season.min(); K = K[K.key.isin(first.index)]; K = K[K.season < K.key.map(first)]
    M = K.groupby('key').mkey.agg(lambda s: sorted(set(s))).to_dict(); tree = {}
    for c_, ms in M.items():
        for m in ms: tree.setdefault(m, set()).add(c_)
    nmOf = H.drop_duplicates('key').set_index('key').coach.to_dict()
    log(f'hunt75: {len(M)} head coaches with mentors')
    # prediction: mentor's (or tree-mates') average lift before season s → protégé's lift in season s
    def before(keys, s):
        d = H[H.key.isin(keys) & (H.season < s)]; return d.lift.mean() if d.lift.notna().sum() >= 3 else np.nan
    P = H[H.key.isin(M.keys()) & H.lift.notna()].copy()
    P['m'] = [before(M[k], s) for k, s in zip(P.key, P.season)]
    P['tm'] = [before(set().union(*[tree[m] for m in M[k]]) - {k}, s) for k, s in zip(P.key, P.season)]
    out = []
    for col, lab in (('m', 'MENTOR\'S lift before this season'), ('tm', 'TREE-MATES\' lift before this season')):
        d = P[P[col].notna()]
        if len(d) < 20: out.append(f'{lab}: too few ({len(d)})'); continue
        r = stats.pearsonr(d[col], d.lift); hi, lo = d[col].quantile(.8), d[col].quantile(.2)
        fmt = lambda x: f'{100 * x.lift.mean():+.1f} win-% points vs the program before him, {100 * x.pct.mean():.1f}% wins ({len(x)} seasons)'
        out.append(f'PREDICT · {lab}: best 20% → {fmt(d[d[col] >= hi])} ‖ worst 20% → {fmt(d[d[col] <= lo])} ‖ r {r[0]:.2f} (p {r[1]:.2f}, {len(d)} coach-seasons; 2013–19 r {stats.pearsonr(d[d.season <= 2019][col], d[d.season <= 2019].lift)[0]:.2f}, 2020–26 r {stats.pearsonr(d[d.season >= 2020][col], d[d.season >= 2020].lift)[0]:.2f})')
    all_ = H[H.lift.notna() & H.key.isin(first.index)]
    tr = []
    for m, cs in sorted(tree.items(), key=lambda x: -len(x[1])):
        if len(cs) < 3: continue
        d = H[H.key.isin(cs)]; me = H[H.key == m]
        tr.append(f"{nmOf.get(m, m)} ({len(cs)}: {', '.join(sorted(nmOf.get(x, x) for x in cs))}): protégés {100 * d.pct.mean():.0f}% wins, lift {100 * d.lift.mean():+.1f}, 9+ win seasons {(d.w >= 9).sum()} of {len(d)}, ranked finishes {d.fin.notna().sum()} · mentor {100 * me.pct.mean():.0f}%")
    out.append(f'EVERY HEAD COACH (baseline): {100 * all_.pct.mean():.0f}% wins, lift {100 * all_.lift.mean():+.1f}, 9+ win seasons {100 * (all_.w >= 9).mean():.0f}%, ranked finishes {100 * all_.fin.notna().mean():.0f}% · coaches with a mentor: {100 * P.pct.mean():.0f}% wins, lift {100 * P.lift.mean():+.1f} · without: {100 * all_[~all_.key.isin(M.keys())].pct.mean():.0f}%, lift {100 * all_[~all_.key.isin(M.keys())].lift.mean():+.1f}')
    out.append('TREES (3+ protégés, all their head-coach seasons): ' + ' ‖ '.join(tr[:16]))
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt75 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
