# Pattern hunt 15 (Nov 6, 2026 — Sam, 9:54 pm: "ok back to hunts it is"; 8:59 pm: "DEEP hunts … like the player studies"). STUDY ONLY.
# College football defenders, from the per-play player file (cf_playstats, FBS 2020-2025). CFBD's file has no tackles (checked: the
# tackler hunt used ESPN game pages, branch wip/cfb-tacklers), so this reads the plays it does name: sacks, pass breakups,
# interceptions, forced fumbles.
#  D01-D04 each a game, does it repeat for the same player next season? (sacks, breakups, interceptions, forced fumbles)
#  D05 "ball skills": interceptions as a share of his passes defensed (INT / (INT + PBU)) — repeats?
#  D06 the classic: next season's interceptions — do this season's breakups predict them better than this season's interceptions?
#      (per player, both in the model; and the same at the team level, D07)
#  D08 sacks in close-and-late spots as a share of his sacks — repeats? (a closer)
#  D09 sacks vs ranked opponents a game minus vs others — repeats?
# Same bar: BH q < .10 over this round's tests; holdout (HOLD on) the same way.
import numpy as np, pandas as pd
from lib3 import bh, yoy, reg_yoy, ols_cl, HOLD
from load import frame
from hunt5b import playstats
from hunt11 import _ranked


def run(reg, log, D):
    P = playstats()
    if P is None: print('::notice title=hunt15::no per-play player file'); return
    log('hunt15 stat types: ' + ', '.join(f'{k} {v}' for k, v in P.st.value_counts().items()))
    P['pid'] = P.athleteId.astype(str)
    for c in ('period',): P[c] = pd.to_numeric(P[c], errors='coerce')
    P['cl'] = (P.period >= 4) & ((P.teamScore - P.opponentScore).abs() <= 8)
    RK = _ranked(); P['vr'] = [(int(s), int(w), o) in RK or (int(s), int(w) - 1, o) in RK for s, w, o in zip(P.season, P.week.fillna(0), P.opponent)]
    KIND = {'sk': 'Sack', 'pbu': 'Pass Breakup', 'int': 'Interception', 'ff': 'Fumble Forced'}
    have = {k: v for k, v in KIND.items() if (P.st == v).any()}
    log(f'hunt15: defensive types found: {have}')
    TESTS = []
    # games a defender appears in (any row), per season — the denominator for "a game"
    G = P.groupby(['pid', 'season']).g.nunique().rename('gp')
    S = pd.concat([P[P.st == v].groupby(['pid', 'season']).size().rename(k) for k, v in have.items()], axis=1).fillna(0)
    S = S.join(G, how='left').reset_index(); S = S[S.gp >= 6]
    nm = P.drop_duplicates('pid').set_index('pid').athleteName
    for i, (k, lab) in enumerate((('sk', 'Sacks a game'), ('pbu', 'Pass breakups a game'), ('int', 'Interceptions a game'), ('ff', 'Forced fumbles a game'))):
        if k not in S: continue
        X = S[S[k] + S.get('sk', 0) + S.get('pbu', 0) + S.get('int', 0) > 0][['pid', 'season']].copy(); X['v'] = (S[k] / S.gp)[X.index]
        o = yoy(X.rename(columns={'pid': 'key'}), 'key', 'v'); d = reg_yoy(reg, f'D0{i + 1}', lab + ' (defenders with any sack, breakup or interception)', o); TESTS.append(f'D0{i + 1}'); log(f'[D0{i + 1}] {d}')
    if {'int', 'pbu'} <= set(S.columns):
        X = S[(S['int'] + S.pbu) >= 4][['pid', 'season']].copy(); X['v'] = (S['int'] / (S['int'] + S.pbu))[X.index]
        o = yoy(X.rename(columns={'pid': 'key'}), 'key', 'v'); d = reg_yoy(reg, 'D05', 'Ball skills: interceptions as a share of passes defensed (4+ defensed)', o); TESTS.append('D05'); log(f'[D05] {d}')
        # D06: next season interceptions a game on this season's interceptions and breakups a game
        A = S.copy(); A['ipg'] = A['int'] / A.gp; A['bpg'] = A.pbu / A.gp; nx = A[['pid', 'season', 'ipg']].copy(); nx['season'] -= 1
        J = A.merge(nx, on=['pid', 'season'], suffixes=('', '_n')); J = J[(J['int'] + J.pbu) >= 2]
        if len(J) > 300:
            df, n = ols_cl(J.ipg_n.values, [J.ipg.values, J.bpg.values], J.pid.values, names=['int', 'pbu'])
            h = J[J.season + 1 >= HOLD]; dh, _ = ols_cl(h.ipg_n.values, [h.ipg.values, h.bpg.values], h.pid.values, names=['int', 'pbu'])
            bi, bp = df.loc['int'], df.loc['pbu']; hi, hp = dh.loc['int'], dh.loc['pbu']
            from scipy import stats
            r_i = stats.pearsonr(J.ipg, J.ipg_n)[0]; r_b = stats.pearsonr(J.bpg, J.ipg_n)[0]
            reg.add('D06', "Next season's interceptions: this season's breakups vs this season's interceptions (player)", 'mechanism', float(bp.b - bi.b), np.nan,
                    float(min(bp.p, 1)), len(J), oos_pass=bool(hp.b > 0 and hp.p < .10),
                    detail=f'{len(J)} player pairs; per breakup a game {bp.b:+.3f} (p {bp.p:.3g}) vs per interception a game {bi.b:+.3f} (p {bi.p:.3g}); r with next season INT: breakups {r_b:.3f}, interceptions {r_i:.3f}; holdout breakups {hp.b:+.3f} (p {hp.p:.3g}), interceptions {hi.b:+.3f}', unit='next-season INT a game')
            TESTS.append('D06'); log(f'[D06] breakups {bp.b:+.3f} (p {bp.p:.3g}) vs interceptions {bi.b:+.3f} (p {bi.p:.3g}); r breakups {r_b:.3f} vs interceptions {r_i:.3f}; holdout {hp.b:+.3f} / {hi.b:+.3f}')
        # D07: the same at the team level
        T = pd.concat([P[P.st == v].groupby(['team', 'season']).size().rename(k) for k, v in (('int', 'Interception'), ('pbu', 'Pass Breakup'))], axis=1).fillna(0)
        T = T.join(P.groupby(['team', 'season']).g.nunique().rename('gp')).reset_index(); T = T[T.gp >= 8]
        T['ipg'] = T['int'] / T.gp; T['bpg'] = T.pbu / T.gp; nx = T[['team', 'season', 'ipg']].copy(); nx['season'] -= 1; J = T.merge(nx, on=['team', 'season'], suffixes=('', '_n'))
        if len(J) > 200:
            df, n = ols_cl(J.ipg_n.values, [J.ipg.values, J.bpg.values], J.team.values, names=['int', 'pbu'])
            h = J[J.season + 1 >= HOLD]; dh, _ = ols_cl(h.ipg_n.values, [h.ipg.values, h.bpg.values], h.team.values, names=['int', 'pbu'])
            bi, bp, hp = df.loc['int'], df.loc['pbu'], dh.loc['pbu']
            reg.add('D07', "Team: next season's interceptions — this season's breakups vs interceptions", 'mechanism', float(bp.b - bi.b), np.nan, float(bp.p), len(J), oos_pass=bool(hp.b > 0 and hp.p < .10),
                    detail=f'{len(J)} team pairs; per breakup a game {bp.b:+.3f} (p {bp.p:.3g}) vs per interception a game {bi.b:+.3f} (p {bi.p:.3g}); holdout breakups {hp.b:+.3f} (p {hp.p:.3g})', unit='next-season INT a game')
            TESTS.append('D07'); log(f'[D07] team: breakups {bp.b:+.3f} (p {bp.p:.3g}) vs interceptions {bi.b:+.3f} (p {bi.p:.3g}); holdout breakups {hp.b:+.3f}')
    if 'sk' in have:
        K = P[P.st == 'Sack']; A = K.groupby(['pid', 'season']).agg(n=('g', 'size'), cl=('cl', 'sum')).reset_index(); A = A[A.n >= 4]; A['v'] = A.cl / A.n - K.cl.mean()
        o = yoy(A.rename(columns={'pid': 'key'})[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, 'D08', 'Share of his sacks in close-and-late spots (a closer)', o); TESTS.append('D08'); log(f'[D08] {d}')
        GV = P.groupby(['pid', 'season', 'vr']).g.nunique().unstack('vr'); SV = K.groupby(['pid', 'season', 'vr']).size().unstack('vr').reindex(GV.index).fillna(0)
        B = pd.DataFrame({'a': SV.get(True, 0) / GV.get(True), 'b': SV.get(False, 0) / GV.get(False), 'ga': GV.get(True), 'tot': SV.sum(axis=1)}).reset_index()
        B = B[(B.ga >= 2) & (B.tot >= 3)]; B['v'] = B.a - B.b
        o = yoy(B.rename(columns={'pid': 'key'})[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, 'D09', 'Sacks a game vs ranked opponents minus vs others', o); TESTS.append('D09'); log(f'[D09] {d}')
    top = S[S.season == S.season.max()].copy()
    if 'pbu' in top: log('hunt15 most breakups, latest season: ' + ', '.join(f'{nm.get(p)} {int(b)}' for p, b in zip(top.sort_values('pbu').pid.tail(8)[::-1], top.sort_values('pbu').pbu.tail(8)[::-1])))
    Gd = reg.df(); Gd = Gd[Gd.hyp.astype(str).str.match(r'D0\d')].copy()
    if not len(Gd): print('::notice title=hunt15::no tests ran'); return
    Gd['q'] = bh(pd.to_numeric(Gd.p, errors='coerce').fillna(1).values); Gd['survives'] = (Gd.q < .10) & (Gd.oos_pass == True)
    out = ' ‖ '.join(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:260]}" for _, x in Gd.iterrows())
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt15 {i // 3800 + 1}::{out[i:i + 3800]}')
