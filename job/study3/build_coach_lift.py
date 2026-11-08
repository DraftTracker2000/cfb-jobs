# Coaches who lift new receivers (Nov 8 — the owner, 8:21 am: "add then"; hunt 37 K2: receivers new to a top-15% coach scored +0.69 PPR a game
# beyond their own average, more than with other coaches, p .012, 8 of 14 coach-seasons). Tags from every season before this one, the way
# hunt 37 tested them. Writes public/data/nfl-coach-lift.json: {season, bump, coaches: {name: [lift, receivers]}}. Usage: build_coach_lift.py SCRATCH OUT
import sys, glob, json, numpy as np, pandas as pd
S, OUTF = sys.argv[1], sys.argv[2]
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True); W = W[W.season_type == 'REG']
cols = ['game_id', 'home_team', 'away_team', 'home_coach', 'away_coach', 'season', 'season_type']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False).drop_duplicates('game_id') for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True); P = P[P.season_type == 'REG']
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
co = pd.concat([P[['game_id', 'home_team', 'home_coach']].rename(columns={'home_team': 'team', 'home_coach': 'coach'}), P[['game_id', 'away_team', 'away_coach']].rename(columns={'away_team': 'team', 'away_coach': 'coach'})])
co['team'] = co.team.replace(fix); W['team'] = W.team.replace(fix)
R = W[W.position.isin(['WR', 'TE', 'RB']) & (W.targets.fillna(0) >= 1)].copy(); R['ppr'] = R.receptions.fillna(0) + R.receiving_yards.fillna(0) / 10 + 6 * R.receiving_tds.fillna(0)
R = R.merge(co, on=['game_id', 'team'], how='inner')
cur = int(R.season.max()) + 1; pr = R   # tags for the season after the last one on file, from every season on file
base = pr.groupby('player_id').ppr.mean()
wc = pr.groupby(['coach', 'player_id']).ppr.agg(['mean', 'size']).reset_index(); wc = wc[wc['size'] >= 6]; wc['lift'] = wc['mean'] - wc.player_id.map(base)
lift = wc.groupby('coach').lift.agg(['mean', 'size']); lift = lift[lift['size'] >= 5]
tg = lift[lift['mean'] >= lift['mean'].quantile(.85)].sort_values('mean', ascending=False)
out = {'season': cur, 'bump': 0.69, 'coaches': {c: [round(float(r['mean']), 2), int(r['size'])] for c, r in tg.iterrows()}}
json.dump(out, open(OUTF, 'w'), separators=(',', ':'))
print(cur, len(lift), 'coaches rated,', len(tg), 'tagged'); print(tg.head(12))
