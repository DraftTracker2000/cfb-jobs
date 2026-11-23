# Study book 3.6 re-check (Nov 22, ~9:30 am): windy (15+ mph, outdoors) vs other games at the same stadium (stadium_id; games with no wind reading count as not windy, as in the first run), points vs the posted total, regular season 2006–25, stadiums with 10+ windy games. Usage: python3 outliers_wind_stadiums.py <pbp dir>
import sys, glob, re, pandas as pd
fr = []
for f in sorted(glob.glob(sys.argv[1] + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2006: continue
    fr.append(pd.read_csv(f, usecols=['game_id', 'season', 'season_type', 'roof', 'wind', 'stadium_id', 'game_stadium', 'total', 'total_line', 'home_team'], low_memory=False))
P = pd.concat(fr, ignore_index=True)
g = P.groupby('game_id').agg(season=('season', 'first'), stype=('season_type', 'first'), roof=('roof', 'first'), wind=('wind', 'first'), sid=('stadium_id', 'first'), st=('game_stadium', 'first'), home=('home_team', 'first'), total=('total', 'first'), tl=('total_line', 'first')).reset_index()
g = g[g.stype.eq('REG')]
g = g[~g.roof.isin(['dome', 'closed']) & g.tl.notna()].copy(); g['ovr'] = g.total - g.tl; g['windy'] = g.wind >= 15
out = []
for sid, d in g.groupby('sid'):
    w, c = d[d.windy], d[~d.windy]
    if len(w) >= 10 and len(c): out.append((sid, d.home.mode().iat[0], d.st.mode().iat[0], len(w), round(w.ovr.mean() - c.ovr.mean(), 1), len(c)))
for r in sorted(out, key=lambda r: r[4]): print(r)
