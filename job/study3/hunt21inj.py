# Pattern hunt 21: soft-tissue and knee injuries by stadium and surface (Nov 7, 2026 — Sam, 1:42 am: "look into soft tissue and knee
# injuries as well at different stadiums and on different turfs. remember that the jets and giants play at the same stadium. kinda shocked
# that one doesn't claim more victims"). STUDY ONLY.
# Same new-injury rule as hunt 17 part 2 (weekly injury reports, 2009–2025): a player on his team's next report, on neither of the two
# reports before the game. Each new injury is typed from the report's injury name:
#   soft tissue = hamstring, groin, calf, quad/quadricep, thigh, hip flexor, pectoral, abdomen/oblique (muscle strains)
#   knee (incl. ACL/MCL/meniscus), ankle (incl. high ankle), foot/toe, concussion, other
# Exposure = team-games; expected counts from each season's rate of that type. MetLife is one stadium (Jets and Giants both host there).
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q
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
    for _ in range(2000):
        x = A[rng.integers(0, len(A), len(A))]; y = B[rng.integers(0, len(B), len(B))]; bs.append((x[:, 0].sum() / x[:, 1].sum()) / (y[:, 0].sum() / y[:, 1].sum()))
    bs = np.array(bs); lo, hi = np.percentile(bs, [2.5, 97.5]); p = max(2 * min((bs <= 1).mean(), (bs >= 1).mean()), 1 / 2000)
    hA, hB = a[a.season >= 2019], b[b.season >= 2019]; hr = (hA[t].sum() / hA['e_' + t].sum()) / (hB[t].sum() / hB['e_' + t].sum())
    R.append((key, lab, t, ra / rb, lo, hi, p, len(a), len(b), hr)); print(f'[{key}] {lab} [{t}]: ratio {ra / rb:.3f} ({lo:.3f}-{hi:.3f}) p {p:.3g}; 2019 on {hr:.3f}', flush=True)
S = TG[TG.turf.notna()]; SO = S[S.indoor == 0]
for t in ['soft', 'knee', 'ankle', 'foot']:
    comp('K1', 'Turf vs grass, outdoor games', SO[SO.turf == 1], SO[SO.turf == 0], t)
    comp('K2', 'Turf vs grass, all games', S[S.turf == 1], S[S.turf == 0], t)
    comp('K3', 'Cold (40°F or below) vs warmer, outdoors', SO[SO.cold == 1], SO[SO.cold == 0], t)
    comp('K4', 'Turf in the cold vs grass in the cold', SO[(SO.turf == 1) & (SO.cold == 1)], SO[(SO.turf == 0) & (SO.cold == 1)], t)
# turf types: artificial brands outdoors vs grass
for brand in ['fieldturf', 'sportturf', 'a_turf', 'matrixturf', 'astroturf']:
    b_ = SO[SO.surface == brand]
    if len(b_) >= 150:
        for t in ['soft', 'knee']: comp('K5', f'{brand} vs grass, outdoors', b_, SO[SO.turf == 0], t)
# stadiums: soft tissue and knee by stadium id (one stadium = one row, so MetLife holds Jets and Giants home games), plus visitors only
nm_ = TG.groupby('stadium_id').game_stadium.agg(lambda s: s.value_counts().index[0]); hm = TG[TG.home == 1].groupby('stadium_id').team.agg(lambda s: '/'.join(s.value_counts().index[:2]))
for t in ['soft', 'knee']:
    disp = ((TG[t] - TG['e_' + t]) ** 2 / TG['e_' + t]).mean()
    for who, D in (('all', TG), ('visitors', TG[TG.home == 0])):
        st = D.groupby('stadium_id').agg(n=('game_id', 'nunique'), o=(t, 'sum'), e=('e_' + t, 'sum'), turf=('turf', 'mean')).reset_index(); st = st[st.n >= 40].copy()
        st['rr'] = st.o / st.e; st['p'] = 2 * stats.norm.sf(abs((st.o - st.e) / np.sqrt(st.e * disp))); st['q'] = bh(st.p.values); st['name'] = st.stadium_id.map(nm_); st['home'] = st.stadium_id.map(hm)
        print(f'\n[{t}] by stadium ({who}), 40+ games — lowest and highest:'); ss = st.sort_values('rr'); print(pd.concat([ss.head(6), ss.tail(8)])[['name', 'home', 'n', 'o', 'rr', 'q', 'turf']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
        met = st[st.name.astype(str).str.contains('MetLife', na=False)]
        if len(met): print(f'  MetLife ({who}): {met.iloc[0].n} games, {int(met.iloc[0].o)} {t} injuries, rate {met.iloc[0].rr:.3f}, q {met.iloc[0].q:.3f}')
        ev = D[D.season % 2 == 0].groupby('stadium_id').apply(lambda d: d[t].sum() / d['e_' + t].sum()); od = D[D.season % 2 == 1].groupby('stadium_id').apply(lambda d: d[t].sum() / d['e_' + t].sum())
        j = pd.concat([ev, od], axis=1, keys=['e', 'o']).dropna(); j = j[j.index.isin(st.stadium_id)]; r, p = stats.pearsonr(j.e, j.o)
        R.append(('K6', f'{t} stadium rate repeats ({who}), even vs odd seasons', t, r, np.nan, np.nan, p, len(j), len(j), np.nan)); print(f'[K6] {t} stadium rate repeats ({who}): r {r:.3f} (p {p:.3g})')
# MetLife by surface era (FieldTurf to 2015; UBU Speed Series 2016–22; Hellas Matrix 2023 on — eras from the pbp surface field)
m = TG[TG.game_stadium.astype(str).str.contains('MetLife', na=False)]
print('\nMetLife by season (surface as nflverse lists it), soft and knee vs expected, both teams:')
print(m.groupby(['season', 'surface']).agg(games=('game_id', 'nunique'), soft=('soft', 'sum'), esoft=('e_soft', 'sum'), knee=('knee', 'sum'), eknee=('e_knee', 'sum')).assign(soft_rr=lambda d: d.soft / d.esoft, knee_rr=lambda d: d.knee / d.eknee).round(2).to_string())
for team in ['NYJ', 'NYG']:
    hh = TG[(TG.tk == team)]; h1 = hh[hh.home == 1]; h0 = hh[hh.home == 0]
    print(f'  {team}: soft at home {h1.soft.sum() / h1.e_soft.sum():.2f} vs road {h0.soft.sum() / h0.e_soft.sum():.2f}; knee at home {h1.knee.sum() / h1.e_knee.sum():.2f} vs road {h0.knee.sum() / h0.e_knee.sum():.2f} ({len(h1)}/{len(h0)} games)')
Rd = pd.DataFrame(R, columns=['key', 'label', 'type', 'est', 'lo', 'hi', 'p', 'na', 'nb', 'hold']); Rd['q'] = bh(Rd.p.values)
print('\nSUMMARY:'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))

# --- follow-up: MetLife's soft-tissue rate since 2019 looked high (1.29). Picked after seeing the table, so test every stadium's 2019-on
# rate the same way (both teams and visitors only), with the multiple-comparison correction across stadiums
for who, D in (('all', TG), ('visitors', TG[TG.home == 0])):
    D = D[D.season >= 2019]; disp = ((D.soft - D.e_soft) ** 2 / D.e_soft).mean()
    st = D.groupby('stadium_id').agg(n=('game_id', 'nunique'), o=('soft', 'sum'), e=('e_soft', 'sum'), turf=('turf', 'mean')).reset_index(); st = st[st.n >= 25].copy()
    st['rr'] = st.o / st.e; st['p'] = 2 * stats.norm.sf(abs((st.o - st.e) / np.sqrt(st.e * disp))); st['q'] = bh(st.p.values); st['name'] = st.stadium_id.map(nm_); st['home'] = st.stadium_id.map(hm)
    st = st.sort_values('rr', ascending=False); st['rank'] = range(1, len(st) + 1)
    print(f'\n[K7] soft tissue 2019–2025 by stadium ({who}), highest first:'); print(st.head(8)[['rank', 'name', 'home', 'n', 'o', 'rr', 'p', 'q', 'turf']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
    met = st[st.name.astype(str).str.contains('MetLife')]; print(f'  MetLife {who}: rank {int(met["rank"].iloc[0])} of {len(st)}, rate {met.rr.iloc[0]:.3f}, p {met.p.iloc[0]:.3g}, q {met.q.iloc[0]:.3f}')
