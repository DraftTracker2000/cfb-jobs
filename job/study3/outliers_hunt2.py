# Study book outliers (Nov 22, 2026) for hunt 2's survivors, both ends, 2025 regular season (and repeat 2024 → 2025):
# pressure-proof QBs (EPA a dropback when hit or sacked minus clean), sack magnets (sacks per pressured dropback), short-throw defenses
# (opposing QBs' air yards vs their own level), run-stuffers (opposing backs' YPC vs their own level). "Pressure" = a QB hit or a sack,
# the nflverse play-by-play fields (no charting data). Usage: python3 outliers_hunt2.py PBP_DIR OUT.json
import sys, glob, re, json, numpy as np, pandas as pd
PBP, OUT = sys.argv[1], sys.argv[2]; R = {}
cols = ['season', 'season_type', 'posteam', 'defteam', 'qb_dropback', 'qb_hit', 'sack', 'epa', 'passer_player_id', 'passer_player_name', 'air_yards', 'pass_attempt',
        'rush_attempt', 'rusher_player_id', 'rusher_player_name', 'yards_gained', 'play_type']
fr = [pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(PBP + '/p202[45].csv.gz'))]
P = pd.concat(fr); P = P[P.season_type == 'REG']
D = P[(P.qb_dropback == 1) & P.passer_player_id.notna() & P.epa.notna()].copy(); D['pr'] = (D.qb_hit.fillna(0) + D.sack.fillna(0)) > 0
def qb(season):
    d = D[D.season == season]; g = d.groupby(['passer_player_id', 'pr']).agg(epa=('epa', 'mean'), n=('epa', 'size'), sk=('sack', 'sum')).unstack('pr')
    g.columns = [f'{a}_{"p" if b else "c"}' for a, b in g.columns]; g = g[(g.n_p >= 60) & (g.n_c >= 200)].copy(); nm = d.groupby('passer_player_id').passer_player_name.agg(lambda s: s.value_counts().index[0])
    g['split'] = g.epa_p - g.epa_c; g['sackrate'] = g.sk_p / g.n_p; g['name'] = nm; g['team'] = d.groupby('passer_player_id').posteam.agg(lambda s: s.value_counts().index[0]); return g
q5, q4 = qb(2025), qb(2024)
R['pressure'] = {'best': [[r['name'], r.team, round(float(r.split), 2), int(r.n_p)] for _, r in q5.sort_values('split', ascending=False).head(5).iterrows()],
                 'worst': [[r['name'], r.team, round(float(r.split), 2), int(r.n_p)] for _, r in q5.sort_values('split').head(5).iterrows()],
                 'repeat': round(float(q5.split.corr(q4.split.reindex(q5.index))), 3)}
R['sacks'] = {'most': [[r['name'], r.team, round(100 * float(r.sackrate), 1), int(r.n_p)] for _, r in q5.sort_values('sackrate', ascending=False).head(5).iterrows()],
              'fewest': [[r['name'], r.team, round(100 * float(r.sackrate), 1), int(r.n_p)] for _, r in q5.sort_values('sackrate').head(5).iterrows()],
              'repeat': round(float(q5.sackrate.corr(q4.sackrate.reindex(q5.index))), 3)}
# defenses: air yards vs the QB's own level; backs' YPC vs their own level
A = P[(P.pass_attempt == 1) & P.air_yards.notna() & P.passer_player_id.notna()].copy(); A['own'] = A.groupby(['season', 'passer_player_id']).air_yards.transform('mean'); A['x'] = A.air_yards - A.own
U = P[(P.rush_attempt == 1) & P.rusher_player_id.notna() & (P.play_type == 'run')].copy(); U['own'] = U.groupby(['season', 'rusher_player_id']).yards_gained.transform('mean'); U['x'] = U.yards_gained - U.own
def defs(df, s):
    g = df[df.season == s].groupby('defteam').x.mean().sort_values(); return g
a5, a4, u5, u4 = defs(A, 2025), defs(A, 2024), defs(U, 2025), defs(U, 2024)
R['short'] = {'shortest': [[t, round(float(v), 2), round(float(a4.get(t, np.nan)), 2)] for t, v in a5.head(5).items()], 'deepest': [[t, round(float(v), 2), round(float(a4.get(t, np.nan)), 2)] for t, v in a5.iloc[::-1].head(5).items()],
              'repeat': round(float(a5.corr(a4.reindex(a5.index))), 3)}
R['run'] = {'stingiest': [[t, round(float(v), 2), round(float(u4.get(t, np.nan)), 2)] for t, v in u5.head(5).items()], 'softest': [[t, round(float(v), 2), round(float(u4.get(t, np.nan)), 2)] for t, v in u5.iloc[::-1].head(5).items()],
            'repeat': round(float(u5.corr(u4.reindex(u5.index))), 3)}
print(json.dumps(R, ensure_ascii=False)); json.dump(R, open(OUT, 'w'), indent=1, ensure_ascii=False)
