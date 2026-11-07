# Pattern hunt 18: matchups, QB-killer style (Nov 7, 2026 — Sam, 12:10 am: "model hunts around how we found things like the qb killers …
# like have we found Wemby's toughest matchup yet? … teams or players or rotations taking away 3's more often … how their defenses or pace
# does against others, their worst and best matchups, players teams coaches, all that"; 12:18 am: "don't limit youself … to solely my ideas").
# STUDY ONLY. Source: sportsdataverse player box scores (ESPN's, republished; flagged in HOW-THIS-SITE-WORKS), NBA 2015–2026 and men's
# college 2015–2026, read locally. Regular season.
#  M1 a player's scoring vs one opponent team, beyond his own average and that team's defense: does it repeat next season? ("toughest matchup")
#  M2 taking away threes: a defense's opponent three-point attempt rate, and opponent 3P%, as team traits (year to year)
#  M3 pace: who controls the tempo — the game's pace against both teams' season pace (and the faster/slower team)
#  M4 style clash: a three-heavy offense against a defense that takes threes away — beyond the two teams' ratings
#  M5 stoppers: does an opposing player's presence (24+ minutes) lower opponents at his position, and does it repeat?
# The bar: BH q < .10 over this round, and the 2022-on seasons agree.
import sys, numpy as np, pandas as pd
from scipy import stats

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

D = sys.argv[1]; R = []
def rec(key, lab, est, p, n, extra=''):
    R.append((key, lab, est, p, n, extra)); print(f'[{key}] {lab}: {est:+.3f} (p {p:.3g}, n {n}) {extra}', flush=True)
def yoy(df, key, val, lab, k, minn=None):
    """year-to-year r of a value keyed by `key` (season, key) → value"""
    a = df.set_index(['key', 'season'])[val]; b = a.copy(); b.index = pd.MultiIndex.from_arrays([b.index.get_level_values(0), b.index.get_level_values(1) - 1])
    j = pd.concat([a, b], axis=1, keys=['now', 'next']).dropna()
    if len(j) < 20: print(f'[{k}] too few pairs ({len(j)})'); return None
    r, p = stats.pearsonr(j.now, j.next); h = j[j.index.get_level_values(1) >= 2021]
    rh, ph = stats.pearsonr(h.now, h.next) if len(h) > 20 else (np.nan, np.nan)
    rec(k, lab, r, p, len(j), f'holdout (2022 on) r {rh:.3f} p {ph:.3g}'); return j

for lg in ('nba', 'mbb'):
    fr = []
    for y in range(2015, 2027):
        try: x = pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False)
        except FileNotFoundError: continue
        fr.append(x)
    B = pd.concat(fr, ignore_index=True)
    B = B[(B.season_type == 2) & (B.did_not_play != True)].copy()
    for c in ['minutes', 'points', 'field_goals_attempted', 'field_goals_made', 'three_point_field_goals_attempted', 'three_point_field_goals_made', 'free_throws_attempted', 'offensive_rebounds', 'turnovers', 'team_score', 'opponent_team_score']:
        B[c] = pd.to_numeric(B[c], errors='coerce')
    B = B[B.minutes > 0]
    L = lg.upper(); print(f'\n===== {L}: {B.game_id.nunique()} games, {len(B)} player-games, seasons {B.season.min()}-{B.season.max()}', flush=True)
    # team-game totals
    T = B.groupby(['game_id', 'season', 'team_id', 'opponent_team_id']).agg(fga=('field_goals_attempted', 'sum'), fgm=('field_goals_made', 'sum'), tpa=('three_point_field_goals_attempted', 'sum'),
        tpm=('three_point_field_goals_made', 'sum'), fta=('free_throws_attempted', 'sum'), orb=('offensive_rebounds', 'sum'), tov=('turnovers', 'sum'), pts=('team_score', 'first'), opp=('opponent_team_score', 'first'), ha=('home_away', 'first')).reset_index()
    T['poss'] = T.fga + 0.44 * T.fta - T.orb + T.tov
    O = T[['game_id', 'team_id', 'poss', 'tpa', 'fga', 'tpm']].rename(columns={'team_id': 'opponent_team_id', 'poss': 'oposs', 'tpa': 'otpa', 'fga': 'ofga', 'tpm': 'otpm'})
    T = T.merge(O, on=['game_id', 'opponent_team_id']); T['gposs'] = (T.poss + T.oposs) / 2
    T = T[T.fga > 30]
    S = T.groupby(['team_id', 'season']).agg(n=('game_id', 'size'), pace=('gposs', 'mean'), tpr=('tpa', 'sum'), fga=('fga', 'sum'), otpa=('otpa', 'sum'), ofga=('ofga', 'sum'), otpm=('otpm', 'sum'),
        pts=('pts', 'sum'), opp=('opp', 'sum'), poss=('gposs', 'sum')).reset_index()
    S = S[S.n >= (40 if lg == 'nba' else 15)].copy(); S['tpr'] = S.tpr / S.fga; S['otpr'] = S.otpa / S.ofga; S['o3p'] = S.otpm / S.otpa; S['net'] = 100 * (S.pts - S.opp) / S.poss
    S['key'] = S.team_id
    # M2 taking away threes
    yoy(S, 'key', 'otpr', f'{L} M2a opponent 3-point attempt rate (a defense taking threes away) year to year', f'{L}-M2a')
    yoy(S, 'key', 'o3p', f'{L} M2b opponent 3-point % allowed year to year', f'{L}-M2b')
    yoy(S, 'key', 'tpr', f'{L} M2c own 3-point attempt rate year to year', f'{L}-M2c')
    yoy(S, 'key', 'pace', f'{L} M3a team pace year to year', f'{L}-M3a')
    # M3 pace control: game pace ~ team pace + opponent pace (both season, leave-one-out not needed at this size); compare home/away and fast/slow weights
    G = T[T.ha == 'home'].merge(S[['team_id', 'season', 'pace']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'pace']].rename(columns={'team_id': 'opponent_team_id', 'pace': 'opace'}), on=['opponent_team_id', 'season'])
    lgp = G.groupby('season').gposs.transform('mean'); y_ = G.gposs - lgp; fast = np.maximum(G.pace, G.opace) - lgp; slow = np.minimum(G.pace, G.opace) - lgp
    X = np.column_stack([np.ones(len(G)), fast, slow]); b, *_ = np.linalg.lstsq(X, y_, rcond=None); res = y_ - X @ b; s2 = res.var() * np.linalg.inv(X.T @ X)
    z = (b[2] - b[1]) / np.sqrt(s2[1, 1] + s2[2, 2] - 2 * s2[1, 2]); rec(f'{L}-M3b', f'{L} M3b who sets the pace: slower team weight {b[2]:.2f} vs faster {b[1]:.2f} (difference)', b[2] - b[1], 2 * stats.norm.sf(abs(z)), len(G))
    # M4 style clash: margin beyond ratings ~ (own 3PA rate − avg) × (opp defense 3PA-allowed rate − avg)
    H = T.merge(S[['team_id', 'season', 'tpr', 'net']], on=['team_id', 'season']).merge(S[['team_id', 'season', 'otpr', 'net']].rename(columns={'team_id': 'opponent_team_id', 'net': 'onet'}), on=['opponent_team_id', 'season'])
    H['m100'] = 100 * (H.pts - H.opp) / H.gposs; H['home'] = (H.ha == 'home').astype(float)
    a1 = H.tpr - H.groupby('season').tpr.transform('mean'); a2 = H.otpr - H.groupby('season').otpr.transform('mean')
    X = np.column_stack([np.ones(len(H)), H.net, H.onet, H.home, a1, a2, a1 * a2]); b, *_ = np.linalg.lstsq(X, H.m100, rcond=None); res = H.m100 - X @ b
    cov = res.var() * np.linalg.inv(X.T @ X); z = b[6] / np.sqrt(cov[6, 6]); se = np.sqrt(cov[6, 6])
    sd1, sd2 = a1.std(), a2.std(); rec(f'{L}-M4', f'{L} M4 three-heavy offense vs a defense that takes threes away (interaction, points per 100 for a 1-SD clash)', b[6] * sd1 * sd2, 2 * stats.norm.sf(abs(z)), len(H), '(games counted from both sides)')
    # M1 player vs opponent team
    B['p36'] = 36 * B.points / B.minutes if lg == 'nba' else 40 * B.points / B.minutes
    B = B[B.minutes >= (20 if lg == 'nba' else 20)].copy()
    ps = B.groupby(['athlete_id', 'season']).agg(ps=('p36', 'mean'), pn=('p36', 'size')).reset_index(); B = B.merge(ps, on=['athlete_id', 'season']); B = B[B.pn >= 20 if lg == 'nba' else B.pn >= 10]
    B['r'] = B.p36 - B.ps
    od = B.groupby(['opponent_team_id', 'season']).r.mean().rename('od').reset_index(); B = B.merge(od, on=['opponent_team_id', 'season']); B['r2'] = B.r - B.od
    pr = B.groupby(['athlete_id', 'athlete_display_name', 'opponent_team_id', 'season']).agg(v=('r2', 'mean'), n=('r2', 'size')).reset_index(); pr = pr[pr.n >= 2]
    pr['key'] = pr.athlete_id.astype(str) + '|' + pr.opponent_team_id.astype(str)
    j = yoy(pr, 'key', 'v', f'{L} M1 a player\'s scoring vs one team beyond his average and that defense, next season (2+ games each)', f'{L}-M1')
    if lg == 'nba':
        W = B[B.athlete_display_name.str.contains('Wembanyama', na=False)]
        if len(W):
            wt = W.groupby(['opponent_team_abbreviation']).agg(g=('r2', 'size'), beyond=('r2', 'mean'), p36=('p36', 'mean')).sort_values('beyond')
            print('  Wembanyama, points per 36 vs each team beyond his average and that defense (all seasons):'); print(wt.round(1).to_string())
    # M5 stoppers: opposing player at the same position with 24+ minutes; effect on opponents' p36 residual at that position, split even/odd seasons
    pos = B.athlete_position_abbreviation.fillna('').str[0]
    B['pg'] = pos.map({'C': 'C', 'F': 'F', 'G': 'G'}).fillna('X')
    big = B[(B.minutes >= 24)][['game_id', 'team_id', 'athlete_id', 'athlete_display_name', 'pg', 'season']].rename(columns={'team_id': 'opponent_team_id', 'athlete_id': 'stopper', 'athlete_display_name': 'snm'})
    M = B[['game_id', 'opponent_team_id', 'pg', 'r2', 'season']].merge(big, on=['game_id', 'opponent_team_id', 'pg', 'season'])
    st = M.groupby(['stopper', 'snm', 'pg', M.season % 2]).r2.agg(['mean', 'size']).reset_index(); st = st[st['size'] >= (60 if lg == 'nba' else 30)]
    w = st.pivot_table(index=['stopper', 'snm', 'pg'], columns='season', values='mean').dropna()
    if len(w) > 20:
        r5, p5 = stats.pearsonr(w[0], w[1]); rec(f'{L}-M5', f'{L} M5 stoppers: opponents at his position score below their norm with him on the floor — even vs odd seasons', r5, p5, len(w))
        tot = M.groupby(['snm', 'pg']).r2.agg(['mean', 'size']); tot = tot[tot['size'] >= (150 if lg == 'nba' else 60)].sort_values('mean')
        print('  best stoppers (opponents at his position, points per 36 below their norm):'); print(tot.head(12).round(2).to_string()); print('  worst:'); print(tot.tail(6).round(2).to_string())
    if lg == 'nba':
        th = S.sort_values('otpr'); last = S.season.max() - 1; tt = S[S.season == last].sort_values('otpr')
        ab = B.drop_duplicates('team_id').set_index('team_id').team_abbreviation
        print(f'  {last} defenses that took threes away most (opponent 3PA share):', [(ab.get(t, t), round(v, 3)) for t, v in zip(tt.team_id.head(5), tt.otpr.head(5))], ' least:', [(ab.get(t, t), round(v, 3)) for t, v in zip(tt.team_id.tail(5), tt.otpr.tail(5))])

Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'p', 'n', 'extra']); Rd['q'] = bh(Rd.p.values)
print('\nSUMMARY (BH q over this round):'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))
