# Hunt 78 (Nov 9, 2026 overnight — the owner, 10:46 pm: "build that and same with the what to expect"; 10:30 pm on football weather).
# STUDY ONLY.
#  W  COLLEGE WEATHER and the total: rain or snow, 15+ mph wind, and the crisp fall day (45–62°F, dry, wind under 10) — the NFL tests
#     (docs/research/football-weather.md) on college games, FBS vs FBS, outdoors, against the closing total, 2013–2026 and two halves.
#  B  COLLEGE WHAT TO EXPECT BAND: the page's number rebuilt from the box scores (recent games weighted, half-life 5, last season at 0.7; the
#     defense's allowed this season blended with last; the line's implied points vs the team's usual — WTE powers), then the middle half
#     (25th–75th percentile) of what players finished with, by the size of the number; fit 2015–2022, checked on 2023–2026. Printed as the
#     table the page would carry: [number, low, high] by stat.
import json, numpy as np, pandas as pd
from scipy import stats
from load import answers, frame, pick, num, year_of
import cfb_base


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    out = []
    # ---------- W weather ----------
    try:
        l = frame('cf_lines', flat=False); ou = {}
        for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
            if not isinstance(L, list) or not L: continue
            v = [float(x['overUnder']) for x in L if x.get('overUnder') not in (None, '')]
            if v: ou[gid] = float(np.mean(v))
        w = frame('cf_weather')
        W = pd.DataFrame({'gid': pick(w, 'id'), 'indoor': pick(w, 'gameIndoors').fillna(False).astype(bool), 't': num(pick(w, 'temperature')), 'pr': num(pick(w, 'precipitation')).fillna(0),
                          'sn': num(pick(w, 'snowfall')).fillna(0), 'wind': num(pick(w, 'windSpeed')).fillna(0), 'cond': pick(w, 'weatherCondition').astype(str)})
        X = G[G.both_fbs].merge(W, on='gid'); X['ou'] = X.gid.map(ou); X = X[~X.indoor & X.ou.notna() & (X.season >= 2013)]
        X['tot'] = X.hpts + X.apts - X.ou
        wet = (X.pr > 0) | (X.sn > 0) | X.cond.str.contains('rain|snow|shower|sleet|drizzle|storm', case=False)
        crisp = X.t.between(45, 62) & ~wet & (X.wind < 10); windy = (X.wind >= 15) & ~wet
        def s(d):
            c = d.tot[d.tot != 0]
            if len(c) < 15: return f'n {len(c)}'
            return f'{c.mean():+.2f} vs the total, overs {100 * (c > 0).mean():.1f}% of {len(c)} (p {stats.ttest_1samp(c, 0).pvalue:.2f}) [2013–19 {100 * (d[d.season <= 2019].tot > 0).mean():.0f}% over · 2020–26 {100 * (d[d.season >= 2020].tot > 0).mean():.0f}%]'
        out.append(f'W weather known for {len(X)} outdoor FBS games with a total · RAIN OR SNOW: {s(X[wet])} ‖ WIND 15+: {s(X[windy])} ‖ CRISP DAY: {s(X[crisp])} ‖ everything else: {s(X[~wet & ~windy & ~crisp])}')
        hot = X.t >= 88; cold = X.t <= 32
        out.append(f'W2 HEAT 88+: {s(X[hot & ~wet])} ‖ FREEZING 32 or under: {s(X[cold])}')
    except Exception as e: out.append(f'W failed: {e!r}')
    # ---------- B band ----------
    try:
        rows = []
        for path, L in answers('cf_box'):
            y = year_of(path)
            if 'postseason' in path: continue
            for r in L or []:
                gid, team, conf, ha, pts, aid, name, st = r
                if str(aid).startswith('-') or not isinstance(st, dict): continue
                ca = str(st.get('passing.C/ATT') or ''); c_, a_ = (ca.split('/') + ['', ''])[:2]
                g = lambda k: pd.to_numeric(st.get(k), errors='coerce')
                rows.append((gid, y, team, str(aid), pd.to_numeric(c_, errors='coerce'), pd.to_numeric(a_, errors='coerce'), g('passing.YDS'), g('passing.TD'), g('passing.INT'),
                             g('rushing.CAR'), g('rushing.YDS'), g('rushing.TD'), g('receiving.REC'), g('receiving.YDS'), g('receiving.TD')))
        B = pd.DataFrame(rows, columns=['gid', 'season', 'team', 'pid', 'cmp', 'att', 'pyds', 'ptd', 'int', 'car', 'ryds', 'rtd', 'rec', 'recyds', 'rectd'])
        K = ['cmp', 'att', 'pyds', 'ptd', 'int', 'car', 'ryds', 'rtd', 'rec', 'recyds', 'rectd']
        B[K] = B[K].fillna(0)
        gi = G.set_index('gid'); B = B[B.gid.isin(gi.index)]
        B['dt'] = pd.to_datetime(B.gid.map(gi.date), utc=True, errors='coerce'); B['home'] = B.gid.map(gi.home); B['away'] = B.gid.map(gi.away)
        B['opp'] = np.where(B.team == B.home, B.away, B.home); B = B.dropna(subset=['dt']).sort_values('dt')
        log(f'hunt78 B: {len(B)} player-games, {B.season.min()}–{B.season.max()}')
        # the defense's allowed per game (all opposing players), this season so far blended with last season, vs the league
        A = B.groupby(['gid', 'opp', 'season', 'dt'])[K].sum().reset_index().sort_values('dt'); ga = A.groupby(['season', 'opp']); A['n0'] = ga.cumcount()
        la = A.groupby(['season', 'opp'])[K].mean(); lg = A.groupby('season')[K].mean()
        for k in K:
            cur = (ga[k].cumsum() - A[k]) / A.n0.replace(0, np.nan); prv = pd.Series([la[k].get((s - 1, t), np.nan) for s, t in zip(A.season, A.opp)], index=A.index)
            ww = A.n0 / (A.n0 + 3); A['d_' + k] = np.where(cur.notna() & prv.notna(), ww * cur + (1 - ww) * prv, cur.fillna(prv)) / A.season.map(lg[k]).values
        B = B.merge(A[['gid', 'opp'] + ['d_' + k for k in K]], on=['gid', 'opp'], how='left')
        # the line's implied points vs the team's usual
        TT = T.assign(dt=pd.to_datetime(T.date, utc=True, errors='coerce')).dropna(subset=['dt']).sort_values('dt')
        TT['ou'] = TT.gid.map(ou) if 'ou' in dir() else np.nan; g2 = TT.groupby(['team', 'season']); TT['n0'] = g2.cumcount(); TT['c0'] = (g2.pf.cumsum() - TT.pf) / TT.n0.replace(0, np.nan)
        lp = TT.groupby(['team', 'season']).pf.mean(); TT['p0'] = [lp.get((t, s - 1), np.nan) for t, s in zip(TT.team, TT.season)]
        ww = TT.n0 / (TT.n0 + 3); TT['up'] = np.where(TT.c0.notna() & TT.p0.notna(), ww * TT.c0 + (1 - ww) * TT.p0, TT.c0.fillna(TT.p0))
        TT['imp'] = TT.ou / 2 + TT.exp / 2; TT['lm'] = (TT.imp / TT.up).where(TT.up > 5).clip(.4, 2.5)
        B = B.merge(TT[['gid', 'team', 'lm']], on=['gid', 'team'], how='left'); B['lm'] = B.lm.fillna(1.0)
        B = B.sort_values(['pid', 'dt']).reset_index(drop=True); B['k'] = B.groupby(['pid', 'season']).cumcount()
        # role per row, as the page would show him: QB 10+ attempts, back 5+ carries (not a QB), receiver 1+ catch
        SPEC = {'QB': (B.att >= 10, [('pyds', .25, .25), ('cmp', .25, 0), ('ptd', .25, .75), ('int', .25, 0), ('ryds', .25, .5)]),
                'RB': ((B.car >= 5) & (B.att < 5), [('ryds', .25, .5), ('car', .25, .25), ('rtd', .5, 1), ('rec', .25, 0), ('recyds', .25, .5)]),
                'WR': ((B.rec >= 1) & (B.car < 5) & (B.att < 5), [('rec', .25, 0), ('recyds', .25, .25), ('rectd', .5, 1)])}
        BAND = {}; rep = []
        for pos, (mask, SL) in SPEC.items():
            P = B[mask].sort_values(['pid', 'dt']).reset_index(drop=True); P['kk'] = P.groupby(['pid', 'season']).cumcount()
            for k, ea, eb in SL:
                ew = np.full(len(P), np.nan)
                for pid, idx in P.groupby('pid').indices.items():
                    v = P[k].values[idx]; yy = P.season.values[idx]
                    for i in range(1, len(idx)):
                        j = np.arange(i - 1, -1, -1); j = j[yy[j] >= yy[i] - 1]
                        if not len(j): continue
                        wt = .5 ** (np.arange(len(j)) / 5) * np.where(yy[j] == yy[i], 1, .7); ew[idx[i]] = (wt * v[j]).sum() / wt.sum()
                pr = ew * P['d_' + k].fillna(1).clip(.3, 3).values ** ea * P.lm.values ** eb
                m = (P.kk >= 3).values & ~np.isnan(pr)
                d = pd.DataFrame({'season': P.season.values[m], 'pr': pr[m], 'y': P[k].values[m]})
                tr, te = d[(d.season >= 2015) & (d.season <= 2022)], d[d.season >= 2023]
                if len(tr) < 500 or len(te) < 100: continue
                edges = np.unique(np.quantile(tr.pr, np.linspace(0, 1, 9))); tb = []
                for a0, b0 in zip(edges[:-1], edges[1:]):
                    b_ = tr[(tr.pr >= a0) & (tr.pr <= b0)]
                    if len(b_) >= 60: tb.append([round(float(b_.pr.median()), 2), round(float(b_.y.quantile(.25)), 1), round(float(b_.y.quantile(.75)), 1)])
                BAND.setdefault(pos, {})[k] = tb
                P_ = np.array([t[0] for t in tb]); lo = np.interp(te.pr, P_, [t[1] for t in tb]); hi = np.interp(te.pr, P_, [t[2] for t in tb])
                disc = k in ('ptd', 'int', 'rtd', 'rectd')
                if disc: lo, hi = np.floor(lo + 1e-9), np.ceil(hi - 1e-9)
                else:
                    f = np.where(te.pr > P_[-1], te.pr / P_[-1], np.where(te.pr < P_[0], te.pr / P_[0], 1)); lo, hi = np.round(lo * f), np.round(hi * f)
                rep.append(f'{pos} {k}: inside {100 * ((te.y >= lo) & (te.y <= hi)).mean():.1f}% of {len(te)} (below {100 * (te.y < lo).mean():.0f}%, above {100 * (te.y > hi).mean():.0f}%), fit on {len(tr)}')
        out.append('B BAND CHECK (2023–26): ' + ' · '.join(rep))
        out.append('B TABLE ' + json.dumps(BAND, separators=(',', ':')))
    except Exception as e:
        import traceback; out.append(f'B failed: {e!r} {traceback.format_exc()[-600:]}')
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt78 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
