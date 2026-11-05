# Pattern hunt 4 (Thursday #41, Nov 5, 2026) — the game-level topics that the saved college data can answer. STUDY ONLY.
# Every test is against the closing line: y = cover (the team's margin minus the line's expected margin), so "does the market already know"
# is built in. Same bar as hunt 3: BH q < .10 across this round's tests, and the holdout seasons (2022 on) must point the same way
# (one-sided p < .10). Game-clustered standard errors (lib3.mech).
#  1. Letdown: the game after an upset win (won as an underdog of 3+), and the game before a big one (next opponent much stronger).
#  2. Altitude: visiting teams at the high stadiums (about 4,500 ft and up), visitors from low altitude only.
#  6. Weeknight games: Tuesday–Friday against Saturday, for the home team, the favorite and the underdog.
#  7. Home underdogs who are good: home underdogs from Elo's top 25 that week, against other home underdogs ("ranked" from the polls isn't
#     in the saved data; Elo top 25 stands in, and is labelled that way).
# Not run this round (said so in the output): 3 college kingmakers, 4 why transfers drop off, 8 basketball late risers (player-level, their
# own data); 5 interim coach bounce (the saved coach data is per season, not per game, so the interim's games can't be told apart).
import numpy as np, pandas as pd
import cfb_base
from lib3 import Reg, bh, mech

ALT = {"Air Force": 7258, "Wyoming": 7220, "Colorado": 5345, "Colorado State": 5000, "New Mexico": 5100, "Utah": 4657, "Utah State": 4700,
       "BYU": 4550, "Nevada": 4505, "Boise State": 2700}
HIGH = {t for t, ft in ALT.items() if ft >= 4500}


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.both_fbs & T.exp.notna() & (T.stype.astype(str) == "regular")].copy()
    T['season'] = T.season.astype(int); T['g'] = T.gid.astype(str)
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce').dt.tz_convert('America/New_York')
    T = T.sort_values(['team', 'season', 'dt'])
    log(f'hunt4: {len(T)} team-games with a line, seasons {T.season.min()}–{T.season.max()}')
    out = []

    def test(hyp, label, sub, x):
        r = mech(reg, hyp, label, sub.cover.values, np.asarray(x, float), sub.g.values, sub.season.values, unit='points vs the line')
        out.append((hyp, label, r)); log(f'[{hyp}] {label}: {r["d"]}')

    # 1. letdown / lookahead
    grp = T.groupby(['team', 'season'])
    T['up'] = ((T.exp < -3) & (T.margin > 0)).astype(float); T['prev_upset'] = T.groupby(['team', 'season']).up.shift(1).fillna(0.0)
    T['next_oelo'] = T.groupby(['team', 'season']).oelo.shift(-1); T['gap_next'] = T.next_oelo - T.oelo
    test('letdown', 'the game after an upset win (won as a 3+ underdog)', T, T.prev_upset)
    big = (T.gap_next >= 150) & (T.next_oelo >= T.groupby('season').oelo.transform(lambda s: s.quantile(.9)))
    test('letdown', 'the game before a big one (next opponent top-10% Elo, 150+ stronger than this one)', T[T.next_oelo.notna()], big[T.next_oelo.notna()])

    # 2. altitude: away rows, real home games only, visitors not from a high-altitude school
    A = T[(T.ishome == 0) & ~T.team.isin(HIGH)].copy()
    test('altitude', 'visitors at a high stadium (4,500 ft+)', A, A.opp.isin(HIGH))
    A2 = A[A.opp.isin(HIGH)]
    if len(A2) > 50:
        late = A2.dt.dt.month >= 11
        test('altitude', 'visitors at altitude: November on vs earlier (cold and thin air)', A2, late)

    # 6. weeknights (home rows): Tue–Fri vs Saturday
    H = T[T.ishome == 1].copy(); dow = H.dt.dt.dayofweek   # Mon 0 … Sat 5
    H = H[dow.isin([1, 2, 3, 4, 5])]; wk = (H.dt.dt.dayofweek <= 4).astype(float)
    test('weeknight', 'home team on a weeknight (Tue–Fri) vs Saturday', H, wk)
    fav = H.exp > 0
    test('weeknight', 'home favorite on a weeknight vs Saturday', H[fav], wk[fav])
    test('weeknight', 'home underdog on a weeknight vs Saturday', H[~fav], wk[~fav])

    # 7. good home underdogs (Elo top 25 that week)
    H2 = T[(T.ishome == 1) & (T.exp < 0)].copy()
    rk = T.groupby(['season', 'week']).elo.rank(ascending=False)
    H2['top25'] = (rk.reindex(H2.index) <= 25).astype(float)
    test('homedog', 'home underdog from Elo\'s top 25 vs other home underdogs', H2, H2.top25)

    # the round's own BH pass and what goes out
    R = reg.df(); R = R[R.hyp.isin(['letdown', 'altitude', 'weeknight', 'homedog'])].copy()
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    lines = [f"hunt4 · {len(T)} team-games 2004–2026 vs the closing line · BH q < .10 and the 2022–26 holdout the same way"]
    for (_, x), (hyp, label, r) in zip(R.iterrows(), out):
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {label}: {r['b']:+.2f} pts (se {r['se']:.2f}, p {r['p']:.3g}, q {x.q:.3g}), n {r['n']}; "
                     f"holdout {r['b_hold']:+.2f} (one-sided p {r['p_hold']:.3g})")
    lines.append("not run: 3 college kingmakers, 4 transfers, 8 basketball late risers (player-level; next round); 5 interim coaches (coach by season only)")
    pack, cur = [], ''
    for l in lines:
        if len(cur) + len(l) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=hunt4 {i + 1:02d}/{len(pack):02d}::{x}')
