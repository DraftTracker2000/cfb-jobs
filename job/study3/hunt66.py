# Hunt 66 (Nov 8, 2026 — the owner 8:21 am on a college football "What to expect": "yes would be good to explore. and really work here"). STUDY ONLY,
# prediction first (rule 12). Like the college basketball one: a number for each of his stats next game, from what's known before it, scored
# against his plain average. CFBD box scores (cf_box), FBS regular seasons 2014 on; tuned on 2014–2021, scored 2022 on (2026 shown alone).
#   QB passing yards, completions, passing TDs, interceptions, rushing yards · RB rushing yards, carries, rushing TDs, catches, receiving yards ·
#   WR / TE catches, receiving yards, receiving TDs.
# Builds, each on top of the last: (a) his average this season (3+ games) — the baseline; (b) recent games weighted more (half-life 5, last
# season at 0.7); (c) × the defense: what it allowed in that stat to his position a game (this season so far blended with last, n/(n+3)) vs the
# FBS average, to a power fit on 2014–2021; (d) × the line: his team's implied points (total and spread) vs its usual, to a fitted power;
# (e) × home/away; (f) pulled toward his own games vs this opponent. Error = mean absolute error; also "leans right" for (d) vs his average.
import numpy as np, pandas as pd
from load import answers, year_of, frame, pick
import cfb_base, cfb_players

KEYS = {'passing.C/ATT': 'ca', 'passing.YDS': 'pyds', 'passing.TD': 'ptd', 'passing.INT': 'int', 'rushing.CAR': 'car', 'rushing.YDS': 'ryds',
        'rushing.TD': 'rtd', 'receiving.REC': 'rec', 'receiving.YDS': 'recyds', 'receiving.TD': 'rectd'}
STATS = {'QB': [('pyds', 'passing yards'), ('cmp', 'completions'), ('ptd', 'passing TDs'), ('int', 'interceptions'), ('ryds', 'rushing yards')],
         'RB': [('ryds', 'rushing yards'), ('car', 'carries'), ('rtd', 'rushing TDs'), ('rec', 'catches'), ('recyds', 'receiving yards')],
         'WR': [('rec', 'catches'), ('recyds', 'receiving yards'), ('rectd', 'receiving TDs')],
         'TE': [('rec', 'catches'), ('recyds', 'receiving yards'), ('rectd', 'receiving TDs')]}
QUAL = {'QB': lambda d: d.att >= 10, 'RB': lambda d: d.car >= 5, 'WR': lambda d: d.rec + d.recyds > 0, 'TE': lambda d: d.rec + d.recyds > 0}

def box():
    rows = []
    for path, L in answers('cf_box'):
        y = year_of(path)
        if 'postseason' in path: continue
        for r in L or []:
            gid, team, conf, ha, pts, aid, name, s = r
            if str(aid).startswith('-') or not isinstance(s, dict): continue
            rows.append([gid, y, team, conf, ha, str(aid)] + [s.get(k) for k in KEYS])
    B = pd.DataFrame(rows, columns=['gid', 'y', 'team', 'conf', 'ha', 'pid'] + list(KEYS.values()))
    B['cmp'] = pd.to_numeric(B.ca.astype(str).str.split('/').str[0], errors='coerce'); B['att'] = pd.to_numeric(B.ca.astype(str).str.split('/').str[-1], errors='coerce')
    for c in ['pyds', 'ptd', 'int', 'car', 'ryds', 'rtd', 'rec', 'recyds', 'rectd', 'cmp', 'att']: B[c] = pd.to_numeric(B[c], errors='coerce').fillna(0)
    o = B.drop_duplicates(['gid', 'team'])[['gid', 'team']]; o2 = o.merge(o, on='gid', suffixes=('', '_o')); o2 = o2[o2.team != o2.team_o]
    return B.drop(columns='ca').merge(o2, on=['gid', 'team'])

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build(); gi = G.set_index('gid')
    PS = cfb_players.player_seasons(); role = PS.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).to_dict()
    B = box(); B = B[B.gid.isin(gi.index) & B.conf.notna()].copy()
    B['dt'] = B.gid.map(gi.date).astype(str); B['pos'] = B.pid.map(role); B['home'] = np.where(B.gid.map(gi.neutral), 0, np.where(B.ha.astype(str) == 'home', 1, -1))
    B = B[B.pos.isin(['QB', 'RB', 'WR', 'TE'])].sort_values('dt')
    # lines → implied team points, and the team's usual points going in (this season blended with last, n/(n+3))
    LN = {}; l = frame('cf_lines', flat=False)
    for gid, ht, L in zip(pick(l, 'id'), pick(l, 'homeTeam'), pick(l, 'lines')) if len(l) else []:
        if not isinstance(L, list) or not L: continue
        c = [x for x in L if str(x.get('provider', '')).lower() == 'consensus'] or L
        sp = [float(x['spread']) for x in c if x.get('spread') not in (None, '')]; ou = [float(x['overUnder']) for x in c if x.get('overUnder') not in (None, '')]
        if sp and ou: LN[gid] = (np.mean(sp), np.mean(ou), ht)
    TT = T.sort_values('date')[['gid', 'team', 'season', 'pf', 'date']].copy(); g = TT.groupby(['team', 'season'])
    TT['n0'] = g.cumcount(); TT['c0'] = (g.pf.cumsum() - TT.pf) / TT.n0.replace(0, np.nan)
    last = TT.groupby(['team', 'season']).pf.mean(); TT['p0'] = [last.get((t, s - 1), np.nan) for t, s in zip(TT.team, TT.season)]
    w = TT.n0 / (TT.n0 + 3); TT['usualpts'] = np.where(TT.c0.notna() & TT.p0.notna(), w * TT.c0 + (1 - w) * TT.p0, TT.c0.fillna(TT.p0))
    up = TT.set_index(['gid', 'team']).usualpts
    def imp(gid, team):
        x = LN.get(gid)
        if not x: return np.nan
        s, ou, ht = x; return ou / 2 + ((-s) if ht == team else s) / 2
    B['itt'] = [imp(a, b) for a, b in zip(B.gid, B.team)]; B['upts'] = [up.get((a, b), np.nan) for a, b in zip(B.gid, B.team)]
    B['lmul'] = (B.itt / B.upts).where(B.upts > 5)
    out = [f'rows {len(B)} · seasons {B.y.min()}–{B.y.max()} · with a line {B.lmul.notna().mean():.0%}']
    # the same from team totals (every player on the other side), which the page can read from CFBD's season team stats (Nov 8: the page's version)
    ALLS = ['pyds', 'cmp', 'ptd', 'int', 'ryds', 'car', 'rtd', 'rec', 'recyds', 'rectd']
    TA = B.groupby(['team_o', 'y', 'gid', 'dt'])[ALLS].sum().reset_index().sort_values('dt'); gt = TA.groupby(['team_o', 'y']); TA['n0'] = gt.cumcount()
    lastT = TA.groupby(['team_o', 'y'])[ALLS].mean(); lgT = TA.groupby('y')[ALLS].mean()
    for s0 in ALLS:
        cur = (gt[s0].cumsum() - TA[s0]) / TA.n0.replace(0, np.nan); prv = pd.Series([lastT[s0].get((t, y - 1), np.nan) for t, y in zip(TA.team_o, TA.y)], index=TA.index)
        ww = TA.n0 / (TA.n0 + 3); TA['t_' + s0] = np.where(cur.notna() & prv.notna(), ww * cur + (1 - ww) * prv, cur.fillna(prv)) / TA.y.map(lgT[s0]).values
    for pos, SL in STATS.items():
        P = B[(B.pos == pos) & QUAL[pos](B)].copy().merge(TA[['gid', 'team_o'] + ['t_' + x for x in ALLS]], on=['gid', 'team_o'], how='left')
        # what each defense allowed to this position, per stat, per game (sum over his position's players)
        A = P.groupby(['team_o', 'y', 'gid', 'dt'])[[s for s, _ in SL]].sum().reset_index().sort_values('dt')
        ga = A.groupby(['team_o', 'y']); A['n0'] = ga.cumcount()
        lastA = A.groupby(['team_o', 'y'])[[s for s, _ in SL]].mean()
        lg = A.groupby('y')[[s for s, _ in SL]].mean()
        for s, _ in SL:
            cur = (ga[s].cumsum() - A[s]) / A.n0.replace(0, np.nan); prv = pd.Series([lastA[s].get((t, y - 1), np.nan) for t, y in zip(A.team_o, A.y)], index=A.index)
            ww = A.n0 / (A.n0 + 3); v = np.where(cur.notna() & prv.notna(), ww * cur + (1 - ww) * prv, cur.fillna(prv))
            A['d_' + s] = v / A.y.map(lg[s]).values
        P = P.merge(A[['gid', 'team_o'] + ['d_' + s for s, _ in SL]], on=['gid', 'team_o'], how='left')
        P = P.sort_values(['pid', 'dt']).reset_index(drop=True)
        gp = P.groupby(['pid', 'y']); P['k'] = gp.cumcount()
        for s, lab in SL:
            P['avg_' + s] = (gp[s].cumsum() - P[s]) / P.k.replace(0, np.nan)
            # half-life 5 over his earlier games (this season and the last; last season at 0.7)
            ew = np.full(len(P), np.nan); vs = np.full(len(P), np.nan); nv = np.zeros(len(P))
            for pid, idx in P.groupby('pid').indices.items():
                v = P[s].values[idx]; yy = P.y.values[idx]; op = P.team_o.values[idx]
                for i in range(1, len(idx)):
                    j = np.arange(i - 1, -1, -1); keep = yy[j] >= yy[i] - 1
                    if not keep.any(): continue
                    j = j[keep]; wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
                    m = op[j] == op[i]
                    if m.any(): vs[idx[i]] = v[j][m].mean(); nv[idx[i]] = m.sum()
            P['ew_' + s] = ew; P['vs_' + s] = vs; P['nv_' + s] = nv
        P = P[P.k >= 3]
        for s, lab in SL:
            X = P.dropna(subset=['avg_' + s, 'ew_' + s]).copy(); X['dm'] = X['d_' + s].fillna(1).clip(.3, 3); X['lm'] = X.lmul.fillna(1).clip(.4, 2.5)
            tr, te = X[X.y <= 2021], X[X.y >= 2022]
            if len(tr) < 500 or len(te) < 100: continue
            mae = lambda d, p: float(np.abs(d[s] - p).mean())
            # fit the powers on 2014–2021 (grid), then home and the head-to-head pull
            grid = [0, .25, .5, .75, 1, 1.25]
            best = min(((a, b) for a in grid for b in grid), key=lambda ab: mae(tr, tr['ew_' + s] * tr.dm ** ab[0] * tr.lm ** ab[1]))
            f = lambda d, h=0, K=None: (d['ew_' + s] * d.dm ** best[0] * d.lm ** best[1] * (1 + h * d.home)) if K is None else \
                (lambda b0: b0 + (d['vs_' + s].fillna(b0) - b0) * d['nv_' + s] / (d['nv_' + s] + K))(d['ew_' + s] * d.dm ** best[0] * d.lm ** best[1] * (1 + h * d.home))
            hb = min([-.06, -.04, -.02, 0, .02, .04, .06], key=lambda h: mae(tr, f(tr, h)))
            kb = min([2, 4, 8, 16, 1e9], key=lambda K: mae(tr, f(tr, hb, K)))
            e = {}
            for nm, d in (('22+', te), ('2026', te[te.y == te.y.max()])):
                if not len(d): continue
                e0 = mae(d, d['avg_' + s])
                if not e0: continue
                e0 = e0; e1 = mae(d, d['ew_' + s]); e2 = mae(d, d['ew_' + s] * d.dm ** best[0]); e3 = mae(d, f(d)); e4 = mae(d, f(d, hb)); e5 = mae(d, f(d, hb, kb))
                lean = (np.abs(np.log((f(d, hb, kb) + 1) / (d['avg_' + s] + 1))) >= np.log(1.05)) & (d[s] != d['avg_' + s])
                right = ((f(d, hb, kb) > d['avg_' + s]) == (d[s] > d['avg_' + s]))[lean].mean() if lean.any() else np.nan
                pc = lambda x: f'{100 * (e0 - x) / e0:+.1f}%'
                e[nm] = f'{nm} (n {len(d)}): average {e0:.2f} · recent-weighted {pc(e1)} · + defense {pc(e2)} · + line {pc(e3)} · + home {pc(e4)} · + vs them {pc(e5)} · leans right {100 * right:.1f}% of {int(lean.sum())}'
            X['dm2'] = X['t_' + s].fillna(1).clip(.3, 3); tr2, te2 = X[X.y <= 2021], X[X.y >= 2022]
            b2 = min(((a, c) for a in grid for c in grid), key=lambda ab: mae(tr2, tr2['ew_' + s] * tr2.dm2 ** ab[0] * tr2.lm ** ab[1]))
            g2 = lambda d: d['ew_' + s] * d.dm2 ** b2[0] * d.lm ** b2[1]
            for nm, d in (('22+', te2), ('2026', te2[te2.y == te2.y.max()])):
                e0 = mae(d, d['avg_' + s])
                if e0: e[nm] += f' · TEAM-TOTALS version [defense^{b2[0]} line^{b2[1]}] {100 * (e0 - mae(d, g2(d))) / e0:+.1f}%'
            out.append(f'{pos} {lab} [defense^{best[0]} line^{best[1]} home {hb:+.2f} vs-them K {kb if kb < 1e8 else "none"}] ' + ' | '.join(e.values()))
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt66 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
