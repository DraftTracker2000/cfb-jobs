# Outliers for the study book from hunt 77's NFL part (Nov 22, 2026 — outliers on both sides). STUDY ONLY. nflverse games 2010–2025 with a
# closing line. Next game after winning as a 7+ underdog, and after missing the line by 20+: the biggest covers and misses that next game.
# Usage: python3 outliers_hunt77_nfl.py <games.csv> <out.json>
import sys, json, pandas as pd, numpy as np
g = pd.read_csv(sys.argv[1]); g = g[(g.game_type == 'REG') & g.home_score.notna() & g.spread_line.notna() & (g.season >= 2010)].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('home_team', 'away_team'): g[c] = g[c].replace(fix)
h = g.assign(team=g.home_team, opp=g.away_team, exp=g.spread_line, margin=g.home_score - g.away_score); a = g.assign(team=g.away_team, opp=g.home_team, exp=-g.spread_line, margin=g.away_score - g.home_score)
T = pd.concat([h, a])[['season', 'week', 'team', 'opp', 'exp', 'margin']].sort_values(['team', 'season', 'week']); T['cover'] = T.margin - T.exp
gg = T.groupby(['team', 'season'])
for c in ('exp', 'margin', 'cover', 'opp', 'week'): T['p_' + c] = gg[c].shift(1)
N = T.dropna(subset=['p_exp']); RES = {}
def rows(d, asc): return [[r.team, int(r.season), int(r.p_week), r.p_opp, round(float(-r.p_exp), 1), int(r.p_margin), int(r.week), r.opp, round(float(r.cover), 1)] for _, r in d.sort_values('cover', ascending=asc).head(5).iterrows()]
for k, d in (('after_upset_win', N[(N.p_exp <= -7) & (N.p_margin > 0)]), ('after_miss20', N[N.p_cover <= -20])):
    c = d[d.cover != 0]
    RES[k] = {'games': int(len(c)), 'mean': round(float(c.cover.mean()), 2), 'covers': int((c.cover > 0).sum()), 'early_cov': round(float((c[c.season <= 2017].cover > 0).mean()), 3), 'late_cov': round(float((c[c.season >= 2018].cover > 0).mean()), 3),
              'flops': rows(d, True), 'covered_big': rows(d, False)}
    print(k, {kk: v for kk, v in RES[k].items() if kk not in ('flops', 'covered_big')})
json.dump(RES, open(sys.argv[2], 'w'), indent=1); print(json.dumps(RES)[:3000])
