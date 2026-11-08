# Pattern hunt 40 (Nov 7, 2026): "when he's out" as a game-projection input, prediction first (rule 12). STUDY ONLY.
# For each player and each top-3-minutes teammate: in games that teammate missed, the player's stat per 36 beyond his season average.
# Projection for a game the teammate misses: baseline (season average) + w x (his average bump in EARLIER games without that teammate),
# w = n / (n + K). Also a pooled version (everyone's usual bump when a top-3 teammate is out). K picked on 2015-2020; error on 2021-2026.
# Points also as a game total (per-36 x his minutes that game), since minutes go up too.
import sys, os, numpy as np, pandas as pd
D = sys.argv[1]
for lg in ('nba', 'mbb'):
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2].copy()
    for c in ['minutes', 'points', 'field_goals_attempted', 'rebounds', 'assists']: B[c] = pd.to_numeric(B[c], errors='coerce')
    B['minutes'] = B.minutes.fillna(0)
    reg = B[B.minutes > 0].groupby(['season', 'team_id', 'athlete_id']).agg(mpg=('minutes', 'mean'), gp=('minutes', 'size')).reset_index(); reg = reg[(reg.mpg >= 20) & (reg.gp >= 20)]
    top3 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(3)
    played = set(zip(B[B.minutes > 0].game_id, B[B.minutes > 0].athlete_id))
    P = B[B.minutes >= 15].copy(); k = 36 / P.minutes
    for c, src in (('pts', 'points'), ('fga', 'field_goals_attempted'), ('reb', 'rebounds'), ('ast', 'assists')): P[c] = P[src] * k
    P = P[P.groupby(['season', 'athlete_id']).minutes.transform('size') >= 20].sort_values('game_date')
    for c in ('pts', 'fga', 'reb', 'ast', 'minutes', 'points'): P['x_' + c] = P[c] - P.groupby(['season', 'athlete_id'])[c].transform('mean')
    rows = []
    T3 = top3.groupby(['season', 'team_id']).athlete_id.apply(list).to_dict()
    for r in P[['game_id', 'season', 'team_id', 'athlete_id']].itertuples(index=False):
        for tm in T3.get((r.season, r.team_id), []):
            if tm != r.athlete_id and (r.game_id, tm) not in played: rows.append((r.Index if hasattr(r, 'Index') else None, r.game_id, r.athlete_id, tm))
    O = pd.DataFrame(rows, columns=['_', 'game_id', 'athlete_id', 'mate']).drop(columns='_').merge(P, on=['game_id', 'athlete_id']).sort_values('game_date')
    print(f'== {lg.upper()}: {len(O)} player-games with a top-3 teammate out', flush=True)
    for c in ('pts', 'fga', 'reb', 'ast', 'minutes', 'points'):
        x = 'x_' + c; key = [O.athlete_id, O.mate]; v0 = O[x].fillna(0); n0 = O[x].notna().astype(int)
        cs = v0.groupby(key).cumsum() - v0; cn = n0.groupby(key).cumsum() - n0
        pool = O.groupby('season')[x].transform('mean')    # everyone's average bump that season (same-season, small leak, both arms)
        d = pd.DataFrame({'x': O[x], 'pm': np.where(cn > 0, cs / cn.replace(0, 1), 0.0), 'n': cn, 'pool': pool, 'season': O.season}).dropna()
        tr, te = d[d.season <= 2020], d[d.season >= 2021]
        def err(df, K, usepool): base = df.pool if usepool else 0; w = df.n / (df.n + K); return np.sqrt(((df.x - base - w * (df.pm - base)) ** 2).mean())
        K = min([1, 2, 4, 8, 16, 32, 64], key=lambda K: err(tr, K, True))
        b0 = np.sqrt((te.x ** 2).mean()); bp = np.sqrt(((te.x - te.pool) ** 2).mean()); e = err(te, K, True)
        lab = {'pts': 'points per 36', 'fga': 'shots per 36', 'reb': 'rebounds per 36', 'ast': 'assists per 36', 'minutes': 'minutes', 'points': 'points (game total)'}[c]
        print(f'{lab}: error {b0:.3f} with no "he\'s out" adjustment → {bp:.3f} with everyone\'s usual bump ({100 * (b0 - bp) / b0:+.1f}%) → {e:.3f} adding his own history without that teammate, K {K} ({100 * (b0 - e) / b0:+.1f}% in all) · his average bump {te.x.mean():+.2f}', flush=True)
