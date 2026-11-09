# "Football weather" (Nov 8, 2026 — the owner, 10:30 pm: "im opposite for football weather im thinking about that like perfect 50 degreeish
# autumn day … research into it then comeback with the idea"). STUDY ONLY. NFL outdoor regular-season games 2016–2025: temperature and
# wind from nflverse schedules, rain or snow from the play-by-play's weather text. Each kind of day against the posted total and the line,
# and passing value per dropback. Usage: python3 fbweather.py GAMES_CSV PBP_DIR
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats
GC, PB = sys.argv[1:3]
G = pd.read_csv(GC); G = G[(G.game_type == 'REG') & (G.season.between(2016, 2025)) & G.roof.isin(['outdoors', 'open'])].dropna(subset=['result', 'total_line', 'spread_line', 'temp'])
wx, epa = {}, []
for f in sorted(glob.glob(PB + '/pbp_20*.csv.gz')):
    p = pd.read_csv(f, usecols=['game_id', 'weather', 'pass', 'qb_dropback', 'epa', 'season_type'], low_memory=False)
    p = p[p.season_type == 'REG']
    for gid, w in p.groupby('game_id').weather.first().items(): wx[gid] = str(w or '')
    epa.append(p[p.qb_dropback == 1].groupby('game_id').epa.mean())
EP = pd.concat(epa)
G['wtxt'] = G.game_id.map(wx).fillna(''); G['wet'] = G.wtxt.str.contains(r'rain|snow|shower|sleet|drizzle|flurr', case=False) & ~G.wtxt.str.contains(r'no rain|0% chance', case=False)
G['wind'] = G.wind.fillna(0); G['mon'] = pd.to_datetime(G.gameday).dt.month
G['tot'] = G.home_score + G.away_score; G['over'] = G.tot - G.total_line; G['cover'] = G.result - G.spread_line; G['epa'] = G.game_id.map(EP)
K = {
 'crisp fall day (45–62°F, wind under 10, dry)': (G.temp.between(45, 62)) & (G.wind < 10) & ~G.wet,
 'warm (75°F+)': (G.temp >= 75),
 'mild otherwise (63–74°F)': G.temp.between(63, 74) & (G.wind < 15) & ~G.wet,
 'cold and dry (32°F or under, wind under 15)': (G.temp <= 32) & (G.wind < 15) & ~G.wet,
 'windy (15+ mph)': G.wind >= 15,
 'rain or snow': G.wet,
}
def s(x): return f'{x.mean():+.2f}' if len(x) else '—'
print(f'{len(G)} outdoor games 2016–2025 · total vs posted total all games {s(G.over)} · EPA per dropback all {G.epa.mean():.3f}')
for k, m in K.items():
    d = G[m]; o = d.over
    t = stats.ttest_ind(o, G[~m].over, equal_var=False).pvalue if len(d) > 5 else np.nan
    print(f'{k}: {len(d)} games · points {d.tot.mean():.1f} · vs the posted total {s(o)} (under {100 * (o < 0).mean():.0f}%, p {t:.2f} vs the rest) · EPA per dropback {d.epa.mean():+.3f} · home vs the line {s(d.cover)}')
for k, m in K.items():
    a, b = G[m & (G.season <= 2020)], G[m & (G.season >= 2021)]
    print(f'HALVES {k}: 2016–20 {s(a.over)} ({100 * (a.over > 0).mean():.0f}% over, {len(a)}) · 2021–25 {s(b.over)} ({100 * (b.over > 0).mean():.0f}% over, {len(b)})')
