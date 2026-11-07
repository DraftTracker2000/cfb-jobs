# Pattern hunt 17, part 2: injuries by stadium, surface and weather from the weekly injury reports (Nov 7, 2026). Part 1 (hunt17env.py)
# counted "was injured during the play" in the play descriptions, but those are written by each home stats crew: stadium rates ran from
# 0.02 (Texas Stadium) to 2.26 (RCA Dome) of the league's and repeated r .84 — a scorekeeping habit, not a place. This part uses an
# independent source: nflverse's weekly injury reports (the teams' own reports, 2009–2025). A new injury = a player on his team's next
# report (within 2 weeks) who was on neither of the two reports before the game, with an injury named (not rest / not injury related).
# It's charged to that game. STUDY ONLY.
import sys, glob, re, numpy as np, pandas as pd
from scipy import stats

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

PBP, INJ = sys.argv[1], sys.argv[2]
gc = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'roof', 'surface', 'temp', 'wind', 'weather', 'stadium_id', 'game_stadium']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2009: continue
    x = pd.read_csv(f, usecols=gc, low_memory=False).drop_duplicates('game_id'); fr.append(x)
g = pd.concat(fr, ignore_index=True); g = g[g.season_type == 'REG'].copy()
g['surface'] = g.surface.astype(str).str.strip().str.lower()
g['turf'] = np.where(g.surface.isin(['', 'nan']), np.nan, (~g.surface.isin(['grass', 'dessograss'])).astype(float))
g['indoor'] = g.roof.isin(['dome', 'closed']).astype(int)
wt = g.weather.astype(str).str.lower()
g['precip'] = (wt.str.contains(r'\brain|showers|drizzle|snow|sleet|flurr') & ~wt.str.contains(r'no rain|0% chance')).astype(int); g.loc[g.indoor == 1, 'precip'] = 0
g['cold'] = ((g.temp <= 32) & (g.indoor == 0)).astype(int); g['windy'] = ((g.wind >= 15) & (g.indoor == 0)).astype(int)
fix = {'LA': 'LA', 'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
TG = pd.concat([g.assign(team=g.home_team, opp=g.away_team, home=1), g.assign(team=g.away_team, opp=g.home_team, home=0)], ignore_index=True)
TG['tk'] = TG.team.replace(fix)

I = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(INJ + '/injuries_*.csv'))], ignore_index=True)
I = I[I.game_type == 'REG'].copy(); I['tk'] = I.team.replace(fix)
inj = I.report_primary_injury.fillna(I.practice_primary_injury).fillna('').astype(str)
I['hurt'] = ~inj.str.lower().str.contains(r'not injury|rest|^$|personal|illness|resting|non-football|nir', regex=True)
rep = I.groupby(['season', 'tk', 'week']).gsis_id.apply(set).to_dict(); hurt = I[I.hurt].groupby(['season', 'tk', 'week']).gsis_id.apply(set).to_dict()
weeks = I.groupby(['season', 'tk']).week.apply(lambda s: sorted(set(s))).to_dict()
new = []
for r in TG.itertuples():
    W = weeks.get((r.season, r.tk))
    if not W: new.append(np.nan); continue
    nx = [w for w in W if r.week < w <= r.week + 2]
    if not nx: new.append(np.nan); continue
    after = hurt.get((r.season, r.tk, nx[0]), set()); before = rep.get((r.season, r.tk, r.week), set()) | rep.get((r.season, r.tk, r.week - 1), set())
    new.append(len(after - before))
TG['new'] = new; TG = TG[TG.new.notna()].copy()
print(f'hunt17inj: {len(TG)} team-games with a report after, {int(TG.new.sum())} new injuries ({TG.new.mean():.2f} a team-game), seasons {TG.season.min()}-{TG.season.max()}')
print('  by season:', TG.groupby('season').new.mean().round(2).to_dict())
sr = TG.groupby('season').new.mean(); TG['exp'] = TG.season.map(sr)
R = []
def comp(key, lab, a, b):
    ra, rb = a.new.sum() / a.exp.sum(), b.new.sum() / b.exp.sum(); rng = np.random.default_rng(3)
    A = a[['new', 'exp']].values; Bv = b[['new', 'exp']].values; bs = []
    for _ in range(2000):
        x = A[rng.integers(0, len(A), len(A))]; y = Bv[rng.integers(0, len(Bv), len(Bv))]; bs.append((x[:, 0].sum() / x[:, 1].sum()) / (y[:, 0].sum() / y[:, 1].sum()))
    bs = np.array(bs); lo, hi = np.percentile(bs, [2.5, 97.5]); p = max(2 * min((bs <= 1).mean(), (bs >= 1).mean()), 1 / 2000)
    hA = a[a.season >= 2019]; hB = b[b.season >= 2019]; hr = (hA.new.sum() / hA.exp.sum()) / (hB.new.sum() / hB.exp.sum()) if len(hA) and len(hB) else np.nan
    R.append((key, lab, ra / rb, lo, hi, p, len(a), len(b), hr)); print(f'[{key}] {lab}: ratio {ra / rb:.3f} ({lo:.3f}-{hi:.3f}) p {p:.3g}, team-games {len(a)}/{len(b)}; 2019 on {hr:.3f}', flush=True)
S = TG[TG.turf.notna()]
comp('J01', 'New injuries after a game on turf vs grass', S[S.turf == 1], S[S.turf == 0])
comp('J01b', 'Turf vs grass, outdoor games', S[(S.turf == 1) & (S.indoor == 0)], S[(S.turf == 0) & (S.indoor == 0)])
O = TG[TG.indoor == 0]
comp('J02', 'Cold (32°F or below) vs warmer, outdoors', O[O.cold == 1], O[O.cold == 0])
comp('J03', 'Rain or snow vs dry, outdoors', O[O.precip == 1], O[O.precip == 0])
comp('J04', 'Wind 15+ vs calmer, outdoors', O[O.windy == 1], O[O.windy == 0])
comp('J05', 'Indoors vs outdoors', TG[TG.indoor == 1], TG[TG.indoor == 0])
comp('J06', 'Road team vs home team', TG[TG.home == 0], TG[TG.home == 1])
SO = S[S.indoor == 0]
comp('J07', 'Turf in the cold vs grass in the cold', SO[(SO.turf == 1) & (SO.cold == 1)], SO[(SO.turf == 0) & (SO.cold == 1)])
# stadiums: season-adjusted rate, both teams' injuries charged to the stadium; even vs odd seasons repeat
nm_ = TG.groupby('stadium_id').game_stadium.agg(lambda s: s.value_counts().index[0]); hm = TG[TG.home == 1].groupby('stadium_id').team.agg(lambda s: '/'.join(s.value_counts().index[:2]))
st = TG.groupby('stadium_id').agg(n=('game_id', 'nunique'), new=('new', 'sum'), exp=('exp', 'sum'), turf=('turf', 'mean'), indoor=('indoor', 'mean')).reset_index(); st = st[st.n >= 40].copy()
disp = ((TG.new - TG.exp) ** 2 / TG.exp).mean(); st['rr'] = st.new / st.exp; st['p'] = 2 * stats.norm.sf(abs((st.new - st.exp) / np.sqrt(st.exp * disp))); st['q'] = bh(st.p.values)
st['name'] = st.stadium_id.map(nm_); st['home'] = st.stadium_id.map(hm)
print(f'  dispersion {disp:.2f}\n[J08] stadiums (40+ games), fewest new injuries first:'); print(st.sort_values('rr')[['name', 'home', 'n', 'new', 'rr', 'p', 'q', 'turf', 'indoor']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
ev = TG[TG.season % 2 == 0].groupby('stadium_id').apply(lambda d: d.new.sum() / d.exp.sum()); od = TG[TG.season % 2 == 1].groupby('stadium_id').apply(lambda d: d.new.sum() / d.exp.sum())
j = pd.concat([ev, od], axis=1, keys=['e', 'o']).dropna(); j = j[j.index.isin(st.stadium_id)]; r, p = stats.pearsonr(j.e, j.o)
R.append(('J09', 'Stadium new-injury rate, even vs odd seasons (r)', r, np.nan, np.nan, p, len(j), len(j), np.nan)); print(f'[J09] stadium rate repeats? even vs odd seasons r {r:.3f} (p {p:.3g}, {len(j)} stadiums)')
# the visiting team only (its own medical staff and reporting; the stadium is the only thing shared across visitors)
V = TG[TG.home == 0]; ev = V[V.season % 2 == 0].groupby('stadium_id').apply(lambda d: d.new.sum() / d.exp.sum()); od = V[V.season % 2 == 1].groupby('stadium_id').apply(lambda d: d.new.sum() / d.exp.sum())
j = pd.concat([ev, od], axis=1, keys=['e', 'o']).dropna(); j = j[j.index.isin(st.stadium_id)]; r, p = stats.pearsonr(j.e, j.o)
R.append(('J10', 'Visiting teams only: stadium rate, even vs odd seasons (r)', r, np.nan, np.nan, p, len(j), len(j), np.nan)); print(f'[J10] visitors only, even vs odd r {r:.3f} (p {p:.3g})')
vs = V.groupby('stadium_id').agg(n=('game_id', 'size'), new=('new', 'sum'), exp=('exp', 'sum')).reset_index(); vs = vs[vs.n >= 40]; vs['rr'] = vs.new / vs.exp
vs['p'] = 2 * stats.norm.sf(abs((vs.new - vs.exp) / np.sqrt(vs.exp * disp))); vs['q'] = bh(vs.p.values); vs['name'] = vs.stadium_id.map(nm_); vs['home'] = vs.stadium_id.map(hm)
print('  visitors only, by stadium:'); print(vs.sort_values('rr')[['name', 'home', 'n', 'new', 'rr', 'q']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'lo', 'hi', 'p', 'na', 'nb', 'hold']); Rd['q'] = bh(Rd.p.values)
print('\nSUMMARY:'); print(Rd.to_string(index=False, float_format=lambda v: f'{v:.4g}'))
