# Outliers for the study book, injuries (Nov 22, 2026 — the owner, 11:48 pm: outliers on both sides of every test). STUDY ONLY.
# Same new-injury rule as hunts 17/21 (teams' weekly reports, 2009–2025). For each injury experiment: the teams or stadiums at both ends,
# the prediction test (rate in 2009–2017 vs 2018–2025), and for MetLife the Jets, the Giants and visitors apart.
# Usage: python3 outliers_inj.py <pbp dir> <injury dir> <out.json>
import sys, glob, re, json, numpy as np, pandas as pd
from scipy import stats
PBP, INJ = sys.argv[1], sys.argv[2]
gc = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'roof', 'surface', 'temp', 'wind', 'stadium_id', 'game_stadium']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2009: continue
    fr.append(pd.read_csv(f, usecols=gc, low_memory=False).drop_duplicates('game_id'))
g = pd.concat(fr, ignore_index=True); g = g[g.season_type == 'REG'].copy()
g['surface'] = g.surface.astype(str).str.strip().str.lower(); g['turf'] = np.where(g.surface.isin(['', 'nan']), np.nan, (~g.surface.isin(['grass', 'dessograss'])).astype(float))
g['indoor'] = g.roof.isin(['dome', 'closed']).astype(int); g['cold'] = ((g.temp <= 40) & (g.indoor == 0)).astype(int)
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
TG = pd.concat([g.assign(team=g.home_team, home=1), g.assign(team=g.away_team, home=0)], ignore_index=True); TG['tk'] = TG.team.replace(fix)
I = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(INJ + '/injuries_*.csv'))], ignore_index=True); I = I[I.game_type == 'REG'].copy(); I['tk'] = I.team.replace(fix)
I['inj'] = I.report_primary_injury.fillna(I.practice_primary_injury).fillna('').astype(str).str.lower()
I['hurt'] = ~I.inj.str.contains(r'not injury|rest|^$|personal|illness|resting|non-football|nir', regex=True)
def typ(s):
    if re.search(r'hamstring|groin|calf|quad|thigh|hip flexor|pectoral|pec\b|abdom|oblique|adductor', s): return 'soft'
    if re.search(r'knee|acl|mcl|meniscus|patella', s): return 'knee'
    if re.search(r'ankle', s): return 'ankle'
    if re.search(r'foot|toe|achilles|heel|plantar', s): return 'foot'
    if re.search(r'concuss|head', s): return 'conc'
    return 'other'
I['ty'] = I.inj.map(typ)
rep = I.groupby(['season', 'tk', 'week']).gsis_id.apply(set).to_dict()
hurt = {k: dict(zip(d.gsis_id, d.ty)) for k, d in I[I.hurt].groupby(['season', 'tk', 'week'])}
weeks = I.groupby(['season', 'tk']).week.apply(lambda s: sorted(set(s))).to_dict()
TYPES = ['soft', 'knee', 'ankle', 'foot', 'conc', 'other']; rows = []
for r in TG.itertuples():
    W = weeks.get((r.season, r.tk)); nx = [w for w in (W or []) if r.week < w <= r.week + 2]
    if not nx: rows.append([np.nan] * len(TYPES)); continue
    after = hurt.get((r.season, r.tk, nx[0]), {}); before = rep.get((r.season, r.tk, r.week), set()) | rep.get((r.season, r.tk, r.week - 1), set())
    c = {t: 0 for t in TYPES}
    for pid, t in after.items():
        if pid not in before: c[t] += 1
    rows.append([c[t] for t in TYPES])
TG[TYPES] = np.array(rows, float); TG = TG[TG.soft.notna()].copy()
for t in TYPES: TG['e_' + t] = TG.season.map(TG.groupby('season')[t].mean())
print(f'hunt21: {len(TG)} team-games; new injuries by type a team-game: ' + ', '.join(f'{t} {TG[t].mean():.2f}' for t in TYPES), flush=True)
R = []
def comp(key, lab, a, b, t):
    ra, rb = a[t].sum() / a['e_' + t].sum(), b[t].sum() / b['e_' + t].sum(); rng = np.random.default_rng(5)
    A = a[[t, 'e_' + t]].values; B = b[[t, 'e_' + t]].values; bs = []
OUT = sys.argv[3]; RES = {}
TG['all'] = TG[TYPES].sum(1); TG['e_all'] = TG[['e_' + t for t in TYPES]].sum(1); TG['late'] = TG.season >= 2018
nm_ = TG.groupby('stadium_id').game_stadium.agg(lambda s: s.value_counts().index[0])
def rate(d, t='all'): return d[t].sum() / d['e_' + t].sum()
def pr(e, l):
    j = pd.concat([e, l], axis=1, keys=['e', 'l']).dropna()
    if len(j) < 8: return None
    r, p = stats.pearsonr(j.e, j.l); j = j.sort_values('e'); k = max(3, len(j) // 5)
    return {'units': int(len(j)), 'r': round(float(r), 3), 'p': round(float(p), 4), 'top': [round(float(j.iloc[-k:].e.mean()), 3), round(float(j.iloc[-k:].l.mean()), 3), k],
            'bottom': [round(float(j.iloc[:k].e.mean()), 3), round(float(j.iloc[:k].l.mean()), 3), k]}
SO = TG[TG.turf.notna() & (TG.indoor == 0)]
# turf vs grass, by team (its own players, outdoor games): ratio of its rate on turf to its rate on grass
def tt(d, t='all', mn=30):
    a = d[d.turf == 1].groupby('tk').apply(lambda x: pd.Series({'n': len(x), 'r': rate(x, t)})); b = d[d.turf == 0].groupby('tk').apply(lambda x: pd.Series({'n': len(x), 'r': rate(x, t)}))
    j = a.join(b, lsuffix='_t', rsuffix='_g'); j = j[(j.n_t >= mn) & (j.n_g >= mn)].copy(); j['v'] = j.r_t / j.r_g; return j.sort_values('v')
j = tt(SO); pe = tt(SO[~SO.late], mn=15).v; pl = tt(SO[SO.late], mn=15).v
RES['turf'] = {'unit': 'team (its own players, outdoor games)', 'min_n': '30 turf and 30 grass games', 'units': int(len(j)), 'share_worse_on_turf': round(float((j.v > 1).mean()), 3),
    'top': [{'team': i, 'turf_games': int(r.n_t), 'grass_games': int(r.n_g), 'v': round(float(r.v), 2)} for i, r in j.iloc[::-1][:4].iterrows()],
    'bottom': [{'team': i, 'turf_games': int(r.n_t), 'grass_games': int(r.n_g), 'v': round(float(r.v), 2)} for i, r in j.iloc[:4].iterrows()], 'predict': pr(pe, pl)}
print('turf', json.dumps(RES['turf']), flush=True)
# by type: turf vs grass outdoors, by stadium of the turf games? -> by team per type (foot+ankle together vs knee)
for t, key in (('knee', 'knee'), ('ankle', 'ankle')):
    j = tt(SO, t, 30)
    RES['type_' + key] = {'units': int(len(j)), 'share_above_1': round(float((j.v > 1).mean()), 3), 'top': [{'team': i, 'v': round(float(r.v), 2)} for i, r in j.iloc[::-1][:3].iterrows()],
        'bottom': [{'team': i, 'v': round(float(r.v), 2)} for i, r in j.iloc[:3].iterrows()], 'predict': pr(tt(SO[~SO.late], t, 15).v, tt(SO[SO.late], t, 15).v)}
    print(key, json.dumps(RES['type_' + key]), flush=True)
# stadiums, all new injuries, both teams and visitors only
def st(d, mn=40):
    s = d.groupby('stadium_id').agg(n=('game_id', 'nunique'), o=('all', 'sum'), e=('e_all', 'sum')); s = s[s.n >= mn].copy(); s['v'] = s.o / s.e; s['name'] = s.index.map(nm_); return s.sort_values('v')
s = st(TG); sv = st(TG[TG.home == 0])
RES['stadium'] = {'unit': 'stadium', 'min_n': 40, 'units': int(len(s)), 'top': [{'stadium': r['name'], 'games': int(r.n), 'v': round(float(r.v), 2), 'visitors': None if i not in sv.index else round(float(sv.loc[i, 'v']), 2)} for i, r in s.iloc[::-1][:4].iterrows()],
    'bottom': [{'stadium': r['name'], 'games': int(r.n), 'v': round(float(r.v), 2), 'visitors': None if i not in sv.index else round(float(sv.loc[i, 'v']), 2)} for i, r in s.iloc[:4].iterrows()],
    'predict': pr(st(TG[~TG.late], 20).v, st(TG[TG.late], 20).v), 'predict_visitors': pr(st(TG[~TG.late & (TG.home == 0)], 20).v, st(TG[TG.late & (TG.home == 0)], 20).v)}
print('stadium', json.dumps(RES['stadium']), flush=True)
# MetLife soft tissue since 2019: Jets, Giants, visitors
M = TG[(TG.game_stadium.astype(str).str.contains('MetLife')) & (TG.season >= 2019)]
RES['metlife'] = {'jets': round(float(rate(M[(M.home == 1) & (M.tk == 'NYJ')], 'soft')), 2), 'giants': round(float(rate(M[(M.home == 1) & (M.tk == 'NYG')], 'soft')), 2),
    'visitors': round(float(rate(M[M.home == 0], 'soft')), 2), 'jets_n': int(M[(M.home == 1) & (M.tk == 'NYJ')].game_id.nunique()), 'giants_n': int(M[(M.home == 1) & (M.tk == 'NYG')].game_id.nunique()),
    'jets_away': round(float(rate(TG[(TG.tk == 'NYJ') & (TG.home == 0) & (TG.season >= 2019)], 'soft')), 2), 'giants_away': round(float(rate(TG[(TG.tk == 'NYG') & (TG.home == 0) & (TG.season >= 2019)], 'soft')), 2)}
print('metlife', json.dumps(RES['metlife']), flush=True)
# rain or snow: by team, own players, outdoor games
gw = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    if int(re.search(r'p(\d{4})', f).group(1)) < 2009: continue
    gw.append(pd.read_csv(f, usecols=['game_id', 'weather'], low_memory=False).drop_duplicates('game_id'))
wt = pd.concat(gw).set_index('game_id').weather.astype(str).str.lower()
wet = (wt.str.contains(r'\brain|showers|drizzle|snow|sleet|flurr') & ~wt.str.contains(r'no rain|0% chance|chance of rain 0'))
O = TG[TG.indoor == 0].copy(); O['wet'] = O.game_id.map(wet).fillna(False).astype(bool)
a = O[O.wet].groupby('tk').apply(lambda x: pd.Series({'n': len(x), 'r': rate(x)})); b = O[~O.wet].groupby('tk').apply(lambda x: pd.Series({'r': rate(x)}))
j = a.join(b, lsuffix='_w', rsuffix='_d'); j = j[j.n >= 8].copy(); j['v'] = j.r_w / j.r_d; j = j.sort_values('v')
RES['rain'] = {'unit': 'team', 'min_n': 8, 'units': int(len(j)), 'share_below_1': round(float((j.v < 1).mean()), 3),
    'top': [{'team': i, 'wet_games': int(r.n), 'v': round(float(r.v), 2)} for i, r in j.iloc[::-1][:4].iterrows()], 'bottom': [{'team': i, 'wet_games': int(r.n), 'v': round(float(r.v), 2)} for i, r in j.iloc[:4].iterrows()]}
print('rain', json.dumps(RES['rain']), flush=True)
json.dump(RES, open(OUT, 'w'), indent=1); print('saved', OUT)
