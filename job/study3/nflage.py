# NFL ages without snap counts (Nov 8, 10:15 pm — redone: nflverse's snap-count file is Pro Football Reference's, a source we don't use).
# Weight = games in which he recorded a stat (nflverse weekly player stats, offense and defense), ages from nflverse rosters' birth dates.
#  1 the age by which each position's share of the league's games played drops to half its peak (Roster age in the GM portal)
#  2 the owner's question (portal 14): do Super Bowl teams run young or old? Games-weighted age of every team, 2015–2025.
import sys, glob, numpy as np, pandas as pd
WD, NV, GC = sys.argv[1:4]
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
G = {'QB': ['QB'], 'RB': ['RB', 'FB'], 'WR': ['WR'], 'TE': ['TE'], 'DL': ['DE', 'DT', 'NT', 'DL'], 'LB': ['LB', 'ILB', 'OLB', 'MLB'], 'DB': ['CB', 'S', 'SS', 'FS', 'DB', 'SAF']}
PG = {p: g for g, L in G.items() for p in L}
rows = []
for y in range(2015, 2026):
    w = pd.read_csv(f'{WD}/w{y}.csv', low_memory=False, usecols=['player_id', 'position', 'season_type', 'team'])
    w = w[w.season_type == 'REG']; w['team'] = w.team.replace(fix)
    f = glob.glob(f'{NV}/roster_{y}.csv*')[0]; ro = pd.read_csv(f, low_memory=False)[['gsis_id', 'birth_date']].dropna().drop_duplicates('gsis_id')
    w = w.merge(ro, left_on='player_id', right_on='gsis_id'); w['age'] = (pd.Timestamp(f'{y}-09-01') - pd.to_datetime(w.birth_date, errors='coerce')).dt.days / 365.25
    w['season'] = y; w['g'] = w.position.map(PG); rows.append(w.dropna(subset=['age']))
R = pd.concat(rows, ignore_index=True); R["a"] = R.age // 1
for g in G:
    d = R[R.g == g].groupby("a").size(); d = d / d.sum(); pk = d.idxmax(); cl = d[(d.index > pk) & (d <= d.max() / 2)]
    print(f'{g}: peak {int(pk)}, half by {int(cl.index.min())} · ' + ' '.join(f'{int(a)}:{v * 100:.1f}' for a, v in d.items() if 22 <= a <= 34))
A = R.groupby(['season', 'team']).age.mean().rename('age').reset_index(); A['rank'] = A.groupby('season').age.rank(ascending=False)
GS = pd.read_csv(GC); sb = GS[(GS.game_type == 'SB') & (GS.season >= 2015) & (GS.season <= 2025)]
S = []
for _, x in sb.iterrows():
    win = x.home_team if x.result > 0 else x.away_team
    for t in (x.home_team, x.away_team): S.append((int(x.season), fix.get(t, t), t == win))
S = pd.DataFrame(S, columns=['season', 'team', 'won']).merge(A, on=['season', 'team'])
po = GS[GS.game_type.isin(['WC', 'DIV', 'CON', 'SB'])]; pt = set(zip(po.season, po.home_team.replace(fix))) | set(zip(po.season, po.away_team.replace(fix)))
A['playoff'] = [(s, t) in pt for s, t in zip(A.season, A.team)]
print(f'SUPER BOWL (games-weighted age, 2015–2025, rank 1 = oldest of 32): teams average rank {S["rank"].mean():.1f}, winners {S[S.won]["rank"].mean():.1f}; age {S.age.mean():.2f} vs league {A.age.mean():.2f}; playoff teams {A[A.playoff].age.mean():.2f} vs the rest {A[~A.playoff].age.mean():.2f}')
print(' · '.join(f"{r.season} {r.team}{' ✓' if r.won else ''} #{int(r['rank'])}" for _, r in S.sort_values('season').iterrows()))
