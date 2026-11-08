# Hunt 68 (Nov 8, 2026 — the owner 10:19 am: "you're comparing when defenses have all their top players active right and then how it changes when they
# have back up corners … the same way we did the tests on the basketball side"). College football, STUDY ONLY, prediction first (rule 12).
# College has no injury reports, so only the box scores say who played. Who played = a defender with a defensive line in that game's box score.
# A defense's top players going into each game (its earlier games this season, 2+ played): DB1, DB2 by tackles + 2×passes defended + 2×picks a
# game; the front (DL/LB) top two by tackles. Full strength = all of them played.
# Tests, on What to expect's yards numbers (hunt 66: his recent-weighted usual × the defense's allowed^a): the defense from all its earlier games
# vs from its full-strength games only (3+ of them, else all); and how players do when the defense is short-handed in this game (known only
# after — context, not a read). Tuned on 2014–2021, scored 2022 on, 2026 alone.
import numpy as np, pandas as pd
from load import answers, year_of
import cfb_base, cfb_players

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build(); gi = G.set_index('gid')
    PS = cfb_players.player_seasons(); role = PS.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).to_dict()
    rows = []
    for path, L in answers('cf_box'):
        y = year_of(path)
        if 'postseason' in path: continue
        for r in L or []:
            gid, team, conf, ha, pts, aid, name, s = r
            if str(aid).startswith('-') or not isinstance(s, dict): continue
            f = lambda k: pd.to_numeric(s.get(k), errors='coerce')
            rows.append((gid, y, team, conf, str(aid), f('passing.YDS'), f('rushing.YDS'), f('rushing.CAR'), f('receiving.YDS'), f('receiving.REC'),
                         f('defensive.TOT'), f('defensive.PD'), f('interceptions.INT'), any(k.startswith('defensive.') for k in s)))
    B = pd.DataFrame(rows, columns=['gid', 'y', 'team', 'conf', 'pid', 'pyds', 'ryds', 'car', 'recyds', 'rec', 'tot', 'pd', 'int', 'isdef'])
    B = B[B.gid.isin(gi.index) & B.conf.notna()].copy(); B['dt'] = B.gid.map(gi.date).astype(str); B['grp'] = B.pid.map(role)
    o = B.drop_duplicates(['gid', 'team'])[['gid', 'team']]; o2 = o.merge(o, on='gid', suffixes=('', '_o')); o2 = o2[o2.team != o2.team_o]; B = B.merge(o2, on=['gid', 'team'])
    for c in ['pyds', 'ryds', 'car', 'recyds', 'rec', 'tot', 'pd', 'int']: B[c] = B[c].fillna(0)
    Dd = B[B.isdef & B.grp.isin(['DB', 'LB', 'DL'])].copy(); Dd['cov'] = Dd.tot + 2 * Dd.pd + 2 * Dd.int
    played = set(zip(Dd.gid, Dd.pid))
    # full strength per defense-game, from its earlier games this season
    F = {}
    for (t, y), d in Dd.groupby(['team', 'y']):
        gs = d[['gid', 'dt']].drop_duplicates().sort_values('dt')
        for gid, dt in zip(gs.gid, gs.dt):
            e = d[d.dt < dt]
            if e.gid.nunique() < 3: continue
            a = e.groupby(['pid', 'grp']).agg(n=('gid', 'nunique'), cov=('cov', 'sum'), tot=('tot', 'sum')).reset_index(); a = a[a.n >= 2]
            db = a[a.grp == 'DB'].assign(v=lambda x: x['cov'] / x.n).sort_values('v', ascending=False).pid.tolist()[:2]
            fr = a[a.grp.isin(['DL', 'LB'])].assign(v=lambda x: x.tot / x.n).sort_values('v', ascending=False).pid.tolist()[:2]
            F[(gid, t)] = (all((gid, p) in played for p in db) if db else np.nan, all((gid, p) in played for p in fr) if fr else np.nan)
    log(f'hunt68: {len(B)} box rows, {len(F)} defense-games with top players known; pass defense full strength {np.nanmean([v[0] for v in F.values()]):.2f}, front {np.nanmean([v[1] for v in F.values()]):.2f}')
    out = []
    for pos, s, fs in (('QB', 'pyds', 0), ('WR', 'recyds', 0), ('TE', 'recyds', 0), ('RB', 'ryds', 1)):
        P = B[B.pid.map(role) == pos].copy()
        if pos == 'QB': P = P[P.pyds > 0]
        elif pos == 'RB': P = P[P.car >= 5]
        else: P = P[P.rec + P.recyds > 0]
        TA = B.groupby(['team_o', 'y', 'gid', 'dt'])[s].sum().reset_index().sort_values('dt')
        TA['full'] = [F.get((g, t), (np.nan, np.nan))[fs] for g, t in zip(TA.gid, TA.team_o)]
        lg = TA.groupby('y')[s].mean(); res = []
        for (t, y), d in TA.groupby(['team_o', 'y']):
            v, fl, dts = d[s].values, d.full.values, d.dt.values
            for i in range(len(d)):
                e = v[:i]; ef = v[:i][fl[:i] == True]
                res.append((d.gid.values[i], t, e.mean() / lg[y] if i >= 1 else np.nan, (ef.mean() / lg[y]) if len(ef) >= 3 else (e.mean() / lg[y] if i >= 1 else np.nan), fl[i]))
        R = pd.DataFrame(res, columns=['gid', 'team_o', 'd_all', 'd_full', 'full_now'])
        P = P.merge(R, on=['gid', 'team_o'], how='left').sort_values(['pid', 'dt']).reset_index(drop=True)
        gp = P.groupby(['pid', 'y']); P['k'] = gp.cumcount(); P['avg'] = (gp[s].cumsum() - P[s]) / P.k.replace(0, np.nan)
        ew = np.full(len(P), np.nan)
        for pid, idx in P.groupby('pid').indices.items():
            vv = P[s].values[idx]; yy = P.y.values[idx]
            for i in range(1, len(idx)):
                j = np.arange(i - 1, -1, -1); j = j[yy[j] >= yy[i] - 1]
                if len(j): wt = 0.5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * vv[j]).sum() / wt.sum()
        P['ew'] = ew; X = P[(P.k >= 3)].dropna(subset=['avg', 'ew', 'd_all', 'd_full']).copy()
        for c in ('d_all', 'd_full'): X[c] = X[c].clip(.3, 3)
        tr, te = X[X.y <= 2021], X[X.y >= 2022]; mae = lambda d, p: float(np.abs(d[s] - p).mean())
        line = [f'{pos} {s}:']
        for c, lab in (('d_all', 'defense from all games (now)'), ('d_full', 'defense from full-strength games only')):
            a = min([0, .25, .5, .75, 1], key=lambda a: mae(tr, tr.ew * tr[c] ** a))
            for nm, d in (('22+', te), ('2026', te[te.y == te.y.max()])):
                e0 = mae(d, d.avg); e1 = mae(d, d.ew * d[c] ** a)
                p = d.ew * d[c] ** a; lean = np.abs(np.log((p + 1) / (d.avg + 1))) >= np.log(1.05); right = ((p > d.avg) == (d[s] > d.avg))[lean].mean()
                line.append(f'{lab} ^{a} {nm}: {100 * (e0 - e1) / e0:+.1f}% vs his average, leans right {100 * right:.1f}% of {int(lean.sum())}')
        fn = X.full_now == True; sh = X.full_now == False
        line.append(f'vs his usual when the defense is full strength {100 * (X[fn][s] / X[fn].ew.clip(lower=1) - 1).median():+.1f}% (median, {fn.sum()}) vs short-handed {100 * (X[sh][s] / X[sh].ew.clip(lower=1) - 1).median():+.1f}% ({sh.sum()})')
        out.append(' · '.join(line))
    for o_ in out: log(o_)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt68 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
