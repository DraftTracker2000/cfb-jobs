# Thursday #5 and #6 (Nov 5, 2026). STUDY ONLY: reads the study archive's CFBD games, prints aggregate tables as notices.
# Nov 5, 10:32 am: "#5 go with your suggestion for testing the two settings against past seasons" (the ±21 margin cap and the pull
# toward average, games + 2, in the season-so-far rating behind Our Top 25 and the playoff field) and "#6 ... figure out the #6 one as
# well and see what is best and then we will just implement that" (what the season simulator / CFP game predictions should run on:
# CFBD's Elo, which carries last season, this season's rating only, or a blend).
#
# The rating is the site's own (public/index.html resumeRank): margin capped at ±cap, less 2.5 home field, plus the opponent's rating,
# averaged over games + shrink, every FCS opponent pooled as one team, centred on the FBS mean.
# Every test is out of sample: a game is predicted only from games played in earlier weeks. Win chance from a logistic fit whose
# weights are fitted with the season being scored left out (leave-one-season-out).
import numpy as np, pandas as pd
import load

HFA = 2.5

def games():
    g = load.frame('cf_games')
    p = lambda *n: load.pick(g, *n)
    G = pd.DataFrame({'season': load.num(p('season')).fillna(g['_year']), 'week': load.num(p('week')), 'st': p('seasonType', 'season_type').astype(str),
                      'neutral': p('neutralSite', 'neutral_site').fillna(False).astype(bool), 'done': p('completed').fillna(True).astype(bool),
                      'h': p('homeTeam', 'home_team').astype(str), 'a': p('awayTeam', 'away_team').astype(str),
                      'hc': p('homeClassification', 'home_division').astype(str).str.lower(), 'ac': p('awayClassification', 'away_division').astype(str).str.lower(),
                      'hp': load.num(p('homePoints', 'home_points')), 'ap': load.num(p('awayPoints', 'away_points')),
                      'helo': load.num(p('homePregameElo', 'home_pregame_elo')), 'aelo': load.num(p('awayPregameElo', 'away_pregame_elo')),
                      'conf': p('conferenceGame', 'conference_game').fillna(False).astype(bool)})
    G = G[G.done & G.hp.notna() & G.ap.notna() & G.st.isin(['regular', 'postseason'])].copy()
    G['season'] = G.season.astype(int); G['loc'] = np.where(G.neutral, 0, 1); G['mg'] = G.hp - G.ap
    return G.drop_duplicates()

def solve(S, cap, shrink):
    """S: one season's games to rate from. Returns {team: rating}; FCS teams pooled as '(FCS)'."""
    fbs = set(S.h[S.hc == 'fbs']) | set(S.a[S.ac == 'fbs'])
    h = np.where(S.h.isin(fbs), S.h, '(FCS)'); a = np.where(S.a.isin(fbs), S.a, '(FCS)'); ok = h != a
    h, a, mg, loc = h[ok], a[ok], S.mg.values[ok], S['loc'].values[ok]
    T = sorted(set(h) | set(a)); ix = {t: i for i, t in enumerate(T)}; hi = np.array([ix[t] for t in h]); ai = np.array([ix[t] for t in a])
    c = np.clip(mg - HFA * loc, -cap, cap) if cap else (mg - HFA * loc).astype(float)
    n = np.bincount(hi, minlength=len(T)) + np.bincount(ai, minlength=len(T)); f = np.array([t != '(FCS)' for t in T])
    base = np.bincount(hi, c, len(T)) - np.bincount(ai, c, len(T)); r = np.zeros(len(T))
    for _ in range(500):
        v = (base + np.bincount(hi, r[ai], len(T)) + np.bincount(ai, r[hi], len(T))) / (n + shrink)
        v -= v[f].mean(); d = np.abs(v - r).sum(); r = v
        if d < 1e-6: break
    return dict(zip(T, r)), fbs

def fit(X, y):
    """logistic regression, no intercept (home field is a feature), Newton steps"""
    w = np.zeros(X.shape[1])
    for _ in range(50):
        p = 1 / (1 + np.exp(-X @ w)); W = p * (1 - p) + 1e-9
        H = X.T @ (X * W[:, None]) + 1e-6 * np.eye(X.shape[1]); w -= np.linalg.solve(H, X.T @ (p - y))
    return w

def score(df, cols):
    """leave-one-season-out: Brier, log loss, winner % over every row of df (y = home won)"""
    P = np.zeros(len(df)); y = df.y.values
    for s in df.season.unique():
        tr = (df.season != s).values; w = fit(df.loc[tr, cols].values, y[tr]); P[~tr] = 1 / (1 + np.exp(-df.loc[~tr, cols].values @ w))
    P = np.clip(P, 1e-6, 1 - 1e-6)
    return {'n': len(df), 'brier': round(float(((P - y) ** 2).mean()), 4), 'logloss': round(float(-(y * np.log(P) + (1 - y) * np.log(1 - P)).mean()), 4),
            'right': round(float(((P > .5) == (y == 1)).mean()) * 100, 1)}

def rows(G, cap, shrink, first_week=4):
    """every FBS-vs-FBS game from first_week on (regular season) and every bowl/playoff game, each with the two teams' ratings from
    the games before it (bowls: the whole regular season, which is what the committee and the simulator see)"""
    out = []
    for s, S in G.groupby('season'):
        R = S[S.st == 'regular']; P = S[S.st == 'postseason']
        for wk in sorted(R.week.dropna().unique()):
            if wk < first_week: continue
            r, fbs = solve(R[R.week < wk], cap, shrink); X = R[(R.week == wk) & (R.hc == 'fbs') & (R.ac == 'fbs')]
            for g in X.itertuples(): out.append((s, 'reg', wk, g.conf, r.get(g.h, 0.0), r.get(g.a, 0.0), g.loc, g.helo, g.aelo, g.mg))
        if len(P):
            r, fbs = solve(R, cap, shrink)
            for g in P[(P.hc == 'fbs') & (P.ac == 'fbs')].itertuples(): out.append((s, 'post', 99, g.conf, r.get(g.h, 0.0), r.get(g.a, 0.0), g.loc, g.helo, g.aelo, g.mg))
    D = pd.DataFrame(out, columns=['season', 'part', 'week', 'conf', 'rh', 'ra', 'loc', 'helo', 'aelo', 'mg'])
    D = D[D.mg != 0].copy(); D['y'] = (D.mg > 0).astype(float); D['rd'] = (D.rh - D.ra) / 10; D['ed'] = (D.helo - D.aelo) / 100
    return D

def run(reg, log, D0):
    G = games(); G = G[G.season >= 2014]
    log(f'cfprate: {len(G)} games, seasons {G.season.min()}–{G.season.max()}')
    notes = []
    # #5 — the cap and the pull toward average: how well the season-so-far rating predicts games it hasn't seen
    t5 = []
    for cap in (14, 21, 28, 35, 0):
        for shrink in (0, 1, 2, 4):
            D = rows(G, cap, shrink); a = score(D, ['rd', 'loc'])
            nc = D[(D.part == 'reg') & ~D.conf]; b = score(nc, ['rd', 'loc']) if len(nc) > 200 else {}
            bw = D[D.part == 'post']; c = score(bw, ['rd', 'loc'])
            t5.append(f"cap {cap or 'none'} pull +{shrink}: all {a['n']} games Brier {a['brier']} LL {a['logloss']} right {a['right']}% · non-conf wk4+ {b.get('n')} Brier {b.get('brier')} right {b.get('right')}% · bowls {c['n']} Brier {c['brier']} right {c['right']}%")
            log('#5', t5[-1])
    # #6 — Elo (CFBD pregame, carries last season) vs this season's rating vs both, on weeks 9 on and the bowls (what the simulator predicts)
    D = rows(G, 21, 2); D = D[D.helo.notna() & D.aelo.notna()]
    t6 = []
    for name, part in (('weeks 9+', (D.part == 'reg') & (D.week >= 9)), ('weeks 4–8', (D.part == 'reg') & (D.week < 9)), ('bowls + playoff', D.part == 'post')):
        X = D[part]
        for lab, cols in (('Elo only', ['ed', 'loc']), ('this season only', ['rd', 'loc']), ('blend (fitted)', ['ed', 'rd', 'loc'])):
            s = score(X, cols); t6.append(f"{name} · {lab}: {s['n']} games Brier {s['brier']} LL {s['logloss']} right {s['right']}%"); log('#6', t6[-1])
        w = fit(X[['ed', 'rd', 'loc']].values, X.y.values); t6.append(f"{name} · blend weights (all seasons): Elo/100 {w[0]:.3f}, rating/10 {w[1]:.3f}, home {w[2]:.3f}"); log('#6', t6[-1])
    # 2026 to date, weeks 9+, by itself (this season's games have Elo carried from 2025)
    X = D[(D.season == D.season.max()) & (D.part == 'reg') & (D.week >= 9)]
    if len(X) > 30:
        for lab, cols in (('Elo only', ['ed', 'loc']), ('this season only', ['rd', 'loc']), ('blend', ['ed', 'rd', 'loc'])):
            Dtr = D[(D.season < D.season.max()) & (D.part == 'reg') & (D.week >= 9)]; w = fit(Dtr[cols].values, Dtr.y.values)
            P = np.clip(1 / (1 + np.exp(-X[cols].values @ w)), 1e-6, 1 - 1e-6); y = X.y.values
            t6.append(f"2026 weeks 9+ · {lab} (fitted on 2014–25): {len(X)} games Brier {((P - y) ** 2).mean():.4f} right {((P > .5) == (y == 1)).mean() * 100:.1f}%"); log('#6', t6[-1])
    # GitHub keeps 10 notices a step, 4,096 characters each: pack the lines
    out, cur = [], ''
    for line in t5 + t6:
        if len(cur) + len(line) + 3 > 3800: out.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + line
    if cur: out.append(cur)
    for i, x in enumerate(out[:10]): print(f'::notice title=cfprate {i + 1:02d}/{len(out):02d}::{x}')
