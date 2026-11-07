# Pattern hunt 13, college football part (Nov 6, 2026 — Sam, 8:41 pm: "team splits. anything and everything"; 8:59 pm: "DEEP hunts").
# STUDY ONLY; nothing goes on the site. FBS vs FBS regular season with a closing line. The spots hunts 4 and 5 and the home-edge study
# didn't run (those covered letdowns, altitude, weeknights, home underdogs, new conferences, third-down and fumble luck, home edge):
#  F01 off a bye (13+ days since his last game) vs a normal week, against the line; F01b when only the opponent is off a bye
#  F02 off a loss vs off a win, against the line; F02b off a loss by 21+
#  F03 the second straight road game (and third), against the line
#  F04 against the line as a team trait: a team's average cover repeats year to year?
#  F05 quarter by quarter: first-quarter margin a game (beyond the full-game margin's share) repeats — "fast starters";
#      F06 fourth-quarter margin a game the same way — "closers"
#  F07 vs AP-ranked opponents, against the line, as a team trait (repeats?)
# Same bar: BH q < .10 over this round's tests; holdout (HOLD on) the same way.
import numpy as np, pandas as pd
import cfb_base
from lib3 import bh, mech, yoy, reg_yoy, HOLD
from load import frame, pick, num


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build(); A = T.copy()
    T = T[T.both_fbs & (T.stype.astype(str).str.startswith('reg'))].copy()
    T['season'] = T.season.astype(int); T['g'] = T.gid.astype(str)
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce')
    T = T.sort_values(['team', 'season', 'dt'])
    # every game a team played that season (FBS or not) for rest and the previous result
    A = A[A.stype.astype(str).str.startswith('reg')].copy(); A['dt'] = pd.to_datetime(A.date, utc=True, errors='coerce'); A = A.sort_values(['team', 'season', 'dt'])
    A['rest'] = A.groupby(['team', 'season']).dt.diff().dt.days; A['prev_m'] = A.groupby(['team', 'season']).margin.shift()
    A['road'] = A.ishome == 0; A['prev_road'] = A.groupby(['team', 'season']).road.shift(); A['prev2_road'] = A.groupby(['team', 'season']).road.shift(2)
    T = T.merge(A[['gid', 'team', 'rest', 'prev_m', 'prev_road', 'prev2_road']], on=['gid', 'team'], how='left')
    O = A[['gid', 'team', 'rest']].rename(columns={'team': 'opp', 'rest': 'orest'}); T = T.merge(O, on=['gid', 'opp'], how='left')
    L = T[T.exp.notna()].copy()
    log(f'hunt13f: {len(L)} team-games with a line, seasons {L.season.min()}-{L.season.max()}; off a bye {(L.rest >= 13).mean():.3f}')
    TESTS = []

    def m(hyp, lab, mask, base):
        X = L[mask | base].copy(); x = mask[mask | base].astype(float).values
        r = mech(reg, hyp, lab, X.cover.values, x, X.g.values, X.season.values, unit='points against the line'); TESTS.append(hyp); log(f'[{hyp}] {lab}: {r["d"]}')

    norm = L.rest.between(5, 9)
    m('F01', 'Off a bye (13+ days) vs a normal week, against the line', (L.rest >= 13) & ~(L.orest >= 13), norm & L.orest.between(5, 9))
    m('F01b', 'Opponent off a bye, team on a normal week, against the line', norm & (L.orest >= 13), norm & L.orest.between(5, 9))
    m('F02', 'Off a loss vs off a win, against the line', L.prev_m < 0, L.prev_m > 0)
    m('F02b', 'Off a loss by 21+ vs off a win, against the line', L.prev_m <= -21, L.prev_m > 0)
    rd = L.ishome == 0
    m('F03', 'Second straight road game vs a road game after a home game, against the line', rd & (L.prev_road == True), rd & (L.prev_road == False))
    m('F03b', 'Third straight road game vs a road game after a home game, against the line', rd & (L.prev_road == True) & (L.prev2_road == True), rd & (L.prev_road == False))

    # F04 against the line as a trait
    S = L.groupby(['team', 'season']).cover.agg(['mean', 'size']).reset_index(); S = S[S['size'] >= 8].rename(columns={'team': 'key', 'mean': 'v'})
    o = yoy(S[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, 'F04', 'Average cover a game (against the line) as a team trait', o); TESTS.append('F04'); log(f'[F04] {d}')

    # F05 / F06 quarters: line scores from the games file
    g = frame('cf_games')
    if 'homeLineScores' in g.columns:
        Q = []
        for gid, hl, al, ht, at, s in zip(pick(g, 'id'), g.homeLineScores, g.awayLineScores, pick(g, 'homeTeam'), pick(g, 'awayTeam'), num(pick(g, 'season', '_year'))):
            if not isinstance(hl, list) or not isinstance(al, list) or len(hl) < 4 or len(al) < 4: continue
            try: h = [float(x) for x in hl[:4]]; a = [float(x) for x in al[:4]]
            except Exception: continue
            Q.append((str(gid), ht, s, h[0] - a[0], h[3] - a[3], sum(h) - sum(a))); Q.append((str(gid), at, s, a[0] - h[0], a[3] - h[3], sum(a) - sum(h)))
        Q = pd.DataFrame(Q, columns=['g', 'team', 'season', 'q1', 'q4', 'full']); Q = Q[Q.g.isin(set(T.g))]
        log(f'hunt13f: quarter scores for {Q.g.nunique()} games')
        for hyp, c, lab in (('F05', 'q1', 'First-quarter margin a game beyond the full-game margin (fast starters)'), ('F06', 'q4', 'Fourth-quarter margin a game beyond the full-game margin (closers)')):
            S = Q.groupby(['team', 'season']).agg(v=(c, 'mean'), f=('full', 'mean'), n=('g', 'size')).reset_index(); S = S[S.n >= 8]
            S['v'] = S.v - np.polyval(np.polyfit(S.f, S.v, 1), S.f)   # what a team of that strength would do in the quarter
            o = yoy(S.rename(columns={'team': 'key'})[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, hyp, lab, o); TESTS.append(hyp); log(f'[{hyp}] {d}')
            top = S[S.season == S.season.max() - 1].sort_values('v'); log(f'  {hyp} {int(S.season.max() - 1)} top: {list(top.tail(5).team)}; bottom: {list(top.head(5).team)}')
    else: log(f'hunt13f: no line scores in the games file; columns {list(g.columns)[:30]}')

    # F07 vs ranked opponents against the line, as a trait
    rk = frame('cf_rankings', flat=False); R = set()
    for _, r in rk.iterrows():
        for poll in (r.get('polls') or []):
            if 'AP' in str(poll.get('poll', '')):
                for x in poll.get('ranks') or []: R.add((int(r.get('season', r.get('_year'))), int(r.get('week', 0)), x.get('school')))
    if R:
        L['vr'] = [(s, int(w), o) in R or (s, int(w) - 1, o) in R for s, w, o in zip(L.season, L.week.fillna(0), L.opp)]
        a = L[L.vr].groupby(['team', 'season']).cover.agg(['mean', 'size']); b = L[~L.vr].groupby(['team', 'season']).cover.mean().rename('ob')
        S = a.join(b).reset_index(); S = S[S['size'] >= 2]; S['v'] = S['mean'] - S.ob
        o = yoy(S.rename(columns={'team': 'key'})[['key', 'season', 'v']], 'key', 'v'); d = reg_yoy(reg, 'F07', 'Cover vs AP-ranked opponents minus vs others, as a team trait', o); TESTS.append('F07'); log(f'[F07] {d}')

    Gd = reg.df(); Gd = Gd[Gd.hyp.astype(str).str.startswith('F0')].copy()
    Gd['q'] = bh(pd.to_numeric(Gd.p, errors='coerce').fillna(1).values); Gd['survives'] = (Gd.q < .10) & (Gd.oos_pass == True)
    out = ' ‖ '.join(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:200]}" for _, x in Gd.iterrows())
    for i in range(0, min(len(out), 3800 * 4), 3800): print(f'::notice title=hunt13f {i // 3800 + 1}::{out[i:i + 3800]}')
