# Outliers for the study book from "Football weather" (fbweather.py), Nov 22, 2026 — outliers on both sides. STUDY ONLY. Same games and
# definitions (NFL outdoor regular season 2016–2025; rain or snow from the play-by-play weather text). Names the games at both ends of the
# crisp fall day and the rain-or-snow game against the posted total, and the stadiums with the most of each.
# Usage: python3 outliers_fbweather.py GAMES_CSV PBP_DIR OUT.json
import sys, glob, json, numpy as np, pandas as pd
GC, PB, OUT = sys.argv[1:4]
G = pd.read_csv(GC); G = G[(G.game_type == 'REG') & (G.season.between(2016, 2025)) & G.roof.isin(['outdoors', 'open'])].dropna(subset=['result', 'total_line', 'spread_line', 'temp'])
wx = {}
for f in sorted(glob.glob(PB + '/p*20*.csv.gz')):
    p = pd.read_csv(f, usecols=['game_id', 'weather', 'season_type'], low_memory=False); p = p[p.season_type == 'REG']
    for gid, w in p.groupby('game_id').weather.first().items(): wx[gid] = str(w or '')
G['wtxt'] = G.game_id.map(wx).fillna(''); G['wet'] = G.wtxt.str.contains(r'rain|snow|shower|sleet|drizzle|flurr', case=False) & ~G.wtxt.str.contains(r'no rain|0% chance', case=False)
G['wind'] = G.wind.fillna(0); G['tot'] = G.home_score + G.away_score; G['over'] = G.tot - G.total_line
K = {'crisp': G.temp.between(45, 62) & (G.wind < 10) & ~G.wet, 'wet': G.wet}
RES = {'games': int(len(G))}
f = lambda r: [f"{r.away_team} at {r.home_team}", int(r.season), int(r.week), int(r.temp), int(r.wind), f"{int(r.away_score)}–{int(r.home_score)}", float(r.total_line), round(float(r.over), 1), r.stadium]
for k, m in K.items():
    d = G[m]
    RES[k] = {'games': int(len(d)), 'over': round(float(d.over.mean()), 2), 'overs': int((d.over > 0).sum()), 'h1': [round(float(d[d.season <= 2020].over.mean()), 2), round(float((d[d.season <= 2020].over > 0).mean()), 3)],
              'h2': [round(float(d[d.season >= 2021].over.mean()), 2), round(float((d[d.season >= 2021].over > 0).mean()), 3)],
              'biggest_over': [f(r) for _, r in d.sort_values('over', ascending=False).head(4).iterrows()], 'biggest_under': [f(r) for _, r in d.sort_values('over').head(4).iterrows()],
              'stadiums': d.groupby('stadium_id').stadium.agg(['last', 'size']).sort_values('size', ascending=False).head(5).values.tolist()}
    st = d.groupby('stadium_id').agg(mean=('over', 'mean'), size=('over', 'size'), name=('stadium', 'last')); st = st[st['size'] >= 8].sort_values('mean').set_index('name')   # by stadium id: renamed stadiums stay one place
    RES[k]['stadium_low'] = [[i, round(float(r['mean']), 1), int(r['size'])] for i, r in st.head(3).iterrows()]; RES[k]['stadium_high'] = [[i, round(float(r['mean']), 1), int(r['size'])] for i, r in st.tail(3).iloc[::-1].iterrows()]
print(json.dumps(RES, indent=1)); json.dump(RES, open(OUT, 'w'), indent=1)
