# Post ideas, how often they'd be real (Nov 8, 2026 — the owner, 10:52 pm: "flesh these out, see if they would really work as posts … based on
# the data we have and then how often they would be a real thing … i don't think any of these deserve their own tab more than like a coaching
# matchups when they are vs one another or both came from big trees or the same tree"). STUDY ONLY: counts, not a prediction test.
#   A coaching matchups (FBS regular season): mentor vs protégé (one was the other's coordinator before his first head job), same tree (they share
#     a mentor), both from big trees (each has a mentor with 3+ coordinators who became head coaches), two tree heads (both have 3+ such protégés)
#   B the weekend's biggest upset by the line (the points the winner was getting)
#   C lift: a coach's win % at a school minus the school's win % over the 3 seasons before he arrived (3+ seasons in)
#   D mentor scorecard: trees with 3+ protégés who are head coaches now
import os, gzip, json, numpy as np, pandas as pd
from load import norm_name
import cfb_base


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    f = [x for x in os.listdir(D) if x.startswith('site_p') and x.endswith('_coord.json.gz')]
    if not f: log('postfreq: no coordinator pack in the study data'); return
    C = json.load(gzip.open(os.path.join(D, f[0]))); C = C.get('col') or C.get('coord', {}).get('col') or {}
    rows = []
    for k, v in C.items():
        y, t = k.split('|', 1)
        for nm in v or []:
            for n in str(nm or '').split(' / '):
                if n.strip(): rows.append((norm_name(n), n.strip(), t, int(y)))
    K = pd.DataFrame(rows, columns=['key', 'name', 'team', 'season'])
    hc = CO.dropna(subset=['coach']).copy(); hc['key'] = hc.coach.map(norm_name)
    NM = dict(zip(hc.key, hc.coach))
    hcs = hc.set_index(['team', 'season']).coach
    K['mentor'] = [hcs.get((t, s)) for t, s in zip(K.team, K.season)]
    first = hc.groupby('key').season.min()
    K = K[K.mentor.notna()]; K['mkey'] = K.mentor.map(norm_name); K = K[K.key != K.mkey]
    became = K[K.key.isin(first.index)]; became = became[became.season < became.key.map(first)]
    M = became.groupby('key').mkey.agg(lambda s: sorted(set(s))).to_dict()
    tree = {}
    for c, ms in M.items():
        for m in ms: tree.setdefault(m, set()).add(c)
    big = {m for m, c in tree.items() if len(c) >= 3}
    log(f'postfreq: coordinator pack {K.season.min()}–{K.season.max()}, {len(M)} head coaches with a known mentor, {len(big)} mentors with 3+ protégés')

    co = CO.set_index(['team', 'season']).coach
    R = G[G.both_fbs & G.stype.astype(str).str.startswith('reg') & (G.season >= 2014)].copy()
    R['hk'] = [norm_name(co.get((t, s))) if co.get((t, s)) else None for t, s in zip(R.home, R.season)]
    R['ak'] = [norm_name(co.get((t, s))) if co.get((t, s)) else None for t, s in zip(R.away, R.season)]
    mp, st, bt, th, ex = [], [], [], [], []
    for h, a in zip(R.hk, R.ak):
        Mh, Ma = set(M.get(h, [])), set(M.get(a, []))
        x1 = bool(h and a and (h in Ma or a in Mh)); x2 = bool(Mh & Ma); x3 = bool(Mh & big) and bool(Ma & big); x4 = h in big and a in big
        mp.append(x1); st.append(x2); bt.append(x3); th.append(x4)
        ex.append(f"{NM.get(h, h)} vs {NM.get(a, a)}" + (" (mentor vs protégé)" if x1 else f" (both under {', '.join(NM.get(m, m) for m in sorted(Mh & Ma))})" if x2 else " (two tree heads)" if x4 else " (both from big trees)" if x3 else ""))
    R['mp'], R['st'], R['bt'], R['th'], R['ex'] = mp, st, bt, th, ex
    R['any'] = R.mp | R.st | R.bt | R.th
    wk = R.groupby(['season', 'week'])[['mp', 'st', 'bt', 'th', 'any']].sum()
    out = []
    for lab, c in (('mentor vs protégé', 'mp'), ('same tree', 'st'), ('both from big trees', 'bt'), ('two tree heads', 'th'), ('any of these', 'any')):
        r = wk[wk.index.get_level_values(0) >= 2018][c]
        out.append(f"A {lab}: {r.mean():.1f} a week, {100 * (r > 0).mean():.0f}% of weeks have one (2018–26, {len(r)} weeks); per season {R[R.season >= 2018].groupby('season')[c].sum().to_dict()}")
    m = R[R.mp]; mw = 0; mg = 0
    for _, g in m.iterrows():
        hm = g.hk in M.get(g.ak, [])   # home coach is the mentor
        win = (g.hpts > g.apts) if hm else (g.apts > g.hpts); mw += int(win); mg += 1
    out.append(f"A mentor vs protégé, all games 2014–26: the mentor won {mw} of {mg}")
    cur = int(R.season.max()); c26 = R[(R.season == cur) & R['any']].sort_values('week')
    out.append(f"A {cur} so far: " + ' · '.join(f"wk {int(w)}: " + '; '.join(c26[c26.week == w].ex.head(4)) for w in sorted(c26.week.unique())))
    # B upsets by the line
    B = R.dropna(subset=['exp_home']).copy(); B['dog'] = np.where(B.margin > 0, np.where(B.exp_home < 0, -B.exp_home, 0), np.where(B.margin < 0, np.where(B.exp_home > 0, B.exp_home, 0), 0))
    bw = B.groupby(['season', 'week']).dog.max(); bw = bw[bw.index.get_level_values(0) >= 2014]
    out.append(f"B biggest upset each week (points the winner was getting), 2014–26: median {bw.median():.1f}; weeks with a 14+ dog winning {100 * (bw >= 14).mean():.0f}%, 17+ {100 * (bw >= 17).mean():.0f}%, 21+ {100 * (bw >= 21).mean():.0f}%; {cur}: {bw.loc[cur].round(1).to_dict() if cur in bw.index.get_level_values(0) else '—'}")
    # C lift
    ts = TS.dropna(subset=['coach']).copy(); ts['wp'] = ts.wins / ts.games; ts['key'] = ts.coach.map(norm_name)
    tw = ts.set_index(['team', 'season'])
    L = []
    for (k, t), g in ts.groupby(['key', 'team']):
        s0 = g.season.min()
        pre = [tw.loc[(t, s0 - i)] for i in (1, 2, 3) if (t, s0 - i) in tw.index]
        if len(pre) < 2 or len(g) < 3: continue
        pw = sum(p.wins for p in pre) / sum(p.games for p in pre)
        L.append((NM.get(k, k), t, s0, int(g.season.max()), len(g), 100 * (g.wins.sum() / g.games.sum() - pw)))
    L = pd.DataFrame(L, columns=['coach', 'team', 'from', 'to', 'n', 'lift'])
    now = L[L.to == cur].sort_values('lift', ascending=False)
    out.append(f"C lift, coaches at a school {cur} with 3+ seasons there: {len(now)}; +15 or more: {(now.lift >= 15).sum()}, +25 or more: {(now.lift >= 25).sum()}; top: " + ' · '.join(f"{r.coach} ({r.team}) {r.lift:+.0f}" for r in now.head(8).itertuples()))
    # D trees now
    active = set(norm_name(c) for c in CO[CO.season == cur].coach.dropna())
    D_ = sorted(((NM.get(mn, mn), len(cs & active), len(cs)) for mn, cs in tree.items()), key=lambda x: -x[1])
    out.append(f"D trees with 3+ protégés head coaching in {cur}: {sum(1 for x in D_ if x[1] >= 3)}; " + ' · '.join(f"{a} {b} now ({c} all-time)" for a, b, c in D_[:10]))
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=postfreq {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
