# Pattern hunt 17: weather, turf, stadium and injuries (Nov 7, 2026 — the owner, 12:18 am: "location, elevation, weather, background, turf style
# with weather mix, as a league, by team, by stadium, is there just a horrible place to play in bad weather? do more players get hurt in any
# stadium? is there a safest place to play?").
# STUDY ONLY; nothing goes on the site. Source: nflverse play-by-play 2006–2025 (regular season + playoffs), read locally. No Open-Meteo:
# the weather is the game's own (temp, wind, roof, surface, the weather text) as nflverse carries it.
# Injuries: plays whose description says "<player> was injured during the play" (players attended to on the field). One count per
# player per game. Exposure: scrimmage plays (run, pass, punt, field goal, kickoff, extra point).
# Run: python3 hunt17env.py <dir with p2006.csv.gz …>
import sys, re, glob, numpy as np, pandas as pd
from scipy import stats

def bh(p):
    p = np.asarray(p, float); n = len(p); o = np.argsort(p); q = np.empty(n); m = 1.0
    for i in range(n - 1, -1, -1): m = min(m, p[o[i]] * n / (i + 1)); q[o[i]] = m
    return q

D = sys.argv[1]
COLS = ['game_id', 'season', 'season_type', 'week', 'home_team', 'away_team', 'posteam', 'play_type', 'desc', 'epa', 'qb_dropback', 'complete_pass',
        'pass_attempt', 'interception', 'sack', 'fumble_lost', 'passer_player_id', 'passer_player_name', 'field_goal_result', 'kick_distance',
        'roof', 'surface', 'temp', 'wind', 'weather', 'stadium_id', 'game_stadium', 'result', 'total', 'spread_line', 'total_line', 'home_score', 'away_score']
fr = []
for f in sorted(glob.glob(D + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2006: continue
    hd = pd.read_csv(f, nrows=0).columns
    x = pd.read_csv(f, usecols=[c for c in COLS if c in hd], low_memory=False); fr.append(x)
P = pd.concat(fr, ignore_index=True)
P = P[P.play_type.isin(['run', 'pass', 'punt', 'field_goal', 'kickoff', 'extra_point'])].copy()
INJ = re.compile(r"([A-Z][A-Za-z'.-]*\.\s?[A-Z][A-Za-z'-]+(?: [A-Z][a-z]+)?) was injured during the play", re.I)
P['inj'] = P.desc.astype(str).str.findall(INJ)
# one per player per game
seen = set(); cnt = []
for gid, L in zip(P.game_id, P.inj):
    n = 0
    for nm in L:
        k = (gid, nm.strip())
        if k not in seen: seen.add(k); n += 1
    cnt.append(n)
P['ninj'] = cnt

g = P.groupby('game_id').agg(season=('season', 'first'), stype=('season_type', 'first'), home=('home_team', 'first'), away=('away_team', 'first'),
                             roof=('roof', 'first'), surface=('surface', 'first'), temp=('temp', 'first'), wind=('wind', 'first'), weather=('weather', 'first'),
                             stadium=('game_stadium', 'first'), sid=('stadium_id', 'first'), result=('result', 'first'), total=('total', 'first'),
                             spread=('spread_line', 'first'), tline=('total_line', 'first'), plays=('play_type', 'size'), inj=('ninj', 'sum')).reset_index()
g['surface'] = g.surface.astype(str).str.strip().str.lower().replace({'grass ': 'grass', 'nan': ''})
g['turf'] = g.surface.isin(['fieldturf', 'sportturf', 'a_turf', 'matrixturf', 'astroturf', 'astroplay', 'fieldturf ']).astype(int)
g.loc[g.surface.isin(['', 'nan']), 'turf'] = np.nan
g['indoor'] = g.roof.isin(['dome', 'closed']).astype(int)
wt = g.weather.astype(str).str.lower()
g['precip'] = (wt.str.contains(r'\brain|showers|drizzle|snow|sleet|flurr') & ~wt.str.contains(r'no rain|0% chance|chance of rain 0')).astype(int)
g['snow'] = wt.str.contains(r'snow|flurr|sleet').astype(int)
g.loc[g.indoor == 1, ['precip', 'snow']] = 0
g['cold'] = ((g.temp <= 32) & (g.indoor == 0)).astype(int)
g['windy'] = ((g.wind >= 15) & (g.indoor == 0)).astype(int)
g['bad'] = ((g.cold + g.windy + g.precip) > 0).astype(int)
g['cover'] = g.result - g.spread          # home margin beyond the line (nflverse spread_line: home favored by)
g['ovr'] = g.total - g.tline
print(f'hunt17: {len(g)} games, {int(g.inj.sum())} injuries on {int(g.plays.sum())} plays ({1000 * g.inj.sum() / g.plays.sum():.2f} per 1,000 plays), seasons {g.season.min()}-{g.season.max()}')
print(f'  surface known {g.turf.notna().mean():.2f}; turf share {g.turf.mean():.2f}; indoor {g.indoor.mean():.2f}; precip {g.precip.mean():.3f}; snow {g.snow.mean():.3f}; cold {g.cold.mean():.3f}; windy {g.windy.mean():.3f}')

def rate(d): return 1000 * d.inj.sum() / d.plays.sum()
def prr(a, b):
    """injury rate ratio a vs b, Poisson with a game-level bootstrap CI (2,000) and a two-sample test on per-game rates"""
    ra, rb = rate(a), rate(b); rng = np.random.default_rng(7); bs = []
    A = a[['inj', 'plays']].values; B = b[['inj', 'plays']].values
    for _ in range(2000):
        x = A[rng.integers(0, len(A), len(A))]; y = B[rng.integers(0, len(B), len(B))]
        bs.append((x[:, 0].sum() / x[:, 1].sum()) / (y[:, 0].sum() / y[:, 1].sum()))
    lo, hi = np.percentile(bs, [2.5, 97.5]); p = 2 * min((np.array(bs) <= 1).mean(), (np.array(bs) >= 1).mean())
    return ra, rb, ra / rb, lo, hi, max(p, 1 / 2000), len(a), len(b)

R = []
def T(key, lab, a, b, note=''):
    ra, rb, rr, lo, hi, p, na, nb = prr(a, b); R.append((key, lab, rr, lo, hi, p, na, nb, ra, rb, note)); print(f'[{key}] {lab}: {ra:.2f} vs {rb:.2f} per 1,000 plays, ratio {rr:.3f} ({lo:.3f}-{hi:.3f}), p {p:.3g}, games {na}/{nb} {note}')

S = g[g.turf.notna()]
T('E01', 'Turf vs grass, all games', S[S.turf == 1], S[S.turf == 0])
T('E01b', 'Turf vs grass, outdoor games only', S[(S.turf == 1) & (S.indoor == 0)], S[(S.turf == 0) & (S.indoor == 0)])
T('E01c', 'Turf vs grass, since 2015', S[(S.turf == 1) & (S.season >= 2015)], S[(S.turf == 0) & (S.season >= 2015)])
O = g[g.indoor == 0]
T('E02', 'Cold (32°F or below) vs warmer, outdoors', O[O.cold == 1], O[O.cold == 0])
T('E03', 'Rain or snow vs dry, outdoors', O[O.precip == 1], O[O.precip == 0])
T('E04', 'Wind 15+ mph vs calmer, outdoors', O[O.windy == 1], O[O.windy == 0])
T('E05', 'Indoors vs outdoors', g[g.indoor == 1], g[g.indoor == 0])
SO = S[S.indoor == 0]
T('E06', 'Turf in the cold vs grass in the cold (turf × weather)', SO[(SO.turf == 1) & (SO.cold == 1)], SO[(SO.turf == 0) & (SO.cold == 1)])
T('E06b', 'Turf in rain or snow vs grass in rain or snow', SO[(SO.turf == 1) & (SO.precip == 1)], SO[(SO.turf == 0) & (SO.precip == 1)])
T('E07', 'Playoffs vs regular season', g[g.stype == 'POST'], g[g.stype == 'REG'])

# stadiums: rate vs league, a stadium with 40+ games; does a stadium's rate repeat (even seasons vs odd)?
st = g.groupby('stadium').agg(n=('game_id', 'size'), inj=('inj', 'sum'), plays=('plays', 'sum'), turf=('turf', 'mean'), indoor=('indoor', 'mean')).reset_index()
lg = g.inj.sum() / g.plays.sum(); st = st[st.n >= 40].copy(); st['exp'] = st.plays * lg; st['rr'] = st.inj / st.exp
st['p'] = [2 * min(stats.poisson.cdf(o, e), stats.poisson.sf(o - 1, e)) for o, e in zip(st.inj, st.exp)]
# overdispersion: per-game counts vary more than Poisson; scale the p by the dispersion
disp = ((g.inj - g.plays * lg) ** 2 / (g.plays * lg)).mean(); print(f'  dispersion {disp:.2f}')
st['z'] = (st.inj - st.exp) / np.sqrt(st.exp * max(1, disp)); st['p2'] = 2 * stats.norm.sf(abs(st.z))
st['q'] = bh(st.p2.values)
st = st.sort_values('rr')
print('  stadiums (40+ games), safest first:'); print(st[['stadium', 'n', 'inj', 'rr', 'p2', 'q', 'turf', 'indoor']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
ev = g[g.season % 2 == 0].groupby('stadium').apply(rate); od = g[g.season % 2 == 1].groupby('stadium').apply(rate); j = pd.concat([ev, od], axis=1, keys=['e', 'o']).dropna()
j = j[j.index.isin(st.stadium)]; rr_, pp_ = stats.pearsonr(j.e, j.o); print(f'[E08] stadium injury rate, even seasons vs odd seasons: r {rr_:.3f} (p {pp_:.3g}, {len(j)} stadiums)')
# within the turf/grass split (is it the surface or the place?)
for tv in (0, 1):
    jj = j[j.index.isin(st[(st.turf.round() == tv)].stadium)]
    if len(jj) > 5: r2, p2 = stats.pearsonr(jj.e, jj.o); print(f'   {"turf" if tv else "grass"} stadiums only: r {r2:.3f} (p {p2:.3g}, {len(jj)})')

# weather and the game itself (outdoor games with a line)
L = O[O.spread.notna() & O.tline.notna()]
def mdiff(key, lab, a, b, col):
    t = stats.ttest_ind(a[col].dropna(), b[col].dropna(), equal_var=False); d = a[col].mean() - b[col].mean()
    R.append((key, lab, d, np.nan, np.nan, t.pvalue, len(a), len(b), a[col].mean(), b[col].mean(), col)); print(f'[{key}] {lab}: {a[col].mean():+.2f} vs {b[col].mean():+.2f} ({col}), diff {d:+.2f}, p {t.pvalue:.3g}, games {len(a)}/{len(b)}')
mdiff('W01', 'Total points vs the posted total: wind 15+ mph vs calmer', L[L.windy == 1], L[L.windy == 0], 'ovr')
mdiff('W02', 'Total points vs the posted total: rain or snow vs dry', L[L.precip == 1], L[L.precip == 0], 'ovr')
mdiff('W03', 'Total points vs the posted total: cold vs warmer', L[L.cold == 1], L[L.cold == 0], 'ovr')
mdiff('W04', 'Home margin vs the line: bad weather vs good, outdoors', L[L.bad == 1], L[L.bad == 0], 'cover')
# dome teams outdoors in the cold, against the line (away dome team)
DOME = set(g[g.indoor == 1].groupby('home').size().loc[lambda s: s >= 30].index)
c = L[(L.cold == 1)]; a = c[c.away.isin(DOME) & ~c.home.isin(DOME)]; b = c[~c.away.isin(DOME) & ~c.home.isin(DOME)]
mdiff('W05', 'Home margin vs the line in the cold: visiting dome team vs visiting outdoor team', a, b, 'cover')
# the worst place to play in bad weather: home cover in bad weather minus good, by stadium (20+ bad-weather games)
bw = L.groupby(['stadium', 'bad']).cover.agg(['mean', 'size']).unstack()
bw = bw[(bw[('size', 1)] >= 20)].copy(); bw['d'] = bw[('mean', 1)] - bw[('mean', 0)]
out = []
for s_ in bw.index:
    x = L[(L.stadium == s_) & (L.bad == 1)].cover; y = L[(L.stadium == s_) & (L.bad == 0)].cover; t = stats.ttest_ind(x, y, equal_var=False)
    out.append((s_, len(x), x.mean(), y.mean(), x.mean() - y.mean(), t.pvalue))
bwd = pd.DataFrame(out, columns=['stadium', 'bad_n', 'cover_bad', 'cover_good', 'd', 'p']); bwd['q'] = bh(bwd.p.values)
print('[W06] home margin vs the line in bad weather minus good, by stadium (20+ bad-weather games):'); print(bwd.sort_values('d').to_string(index=False, float_format=lambda v: f'{v:.3f}'))
# passing in wind and cold: EPA per dropback, outdoors
dbk = P[(P.qb_dropback == 1)].merge(g[['game_id', 'windy', 'cold', 'precip', 'indoor', 'wind', 'temp']], on='game_id')
dbo = dbk[dbk.indoor == 0]
for key, lab, m in (('W07', 'EPA per dropback: wind 15+ vs calmer', dbo.windy == 1), ('W08', 'EPA per dropback: cold vs warmer', dbo.cold == 1), ('W09', 'EPA per dropback: rain or snow vs dry', dbo.precip == 1)):
    a = dbo[m].groupby('game_id').epa.mean(); b = dbo[~m].groupby('game_id').epa.mean(); t = stats.ttest_ind(a.dropna(), b.dropna(), equal_var=False)
    R.append((key, lab, a.mean() - b.mean(), np.nan, np.nan, t.pvalue, len(a), len(b), a.mean(), b.mean(), 'epa')); print(f'[{key}] {lab}: {a.mean():+.3f} vs {b.mean():+.3f}, p {t.pvalue:.3g}')
# QBs in the cold: is a QB's cold-weather EPA (beyond his own warm EPA) a trait? split by even/odd seasons, QBs with 150+ cold dropbacks
q = dbo.groupby(['passer_player_id', 'passer_player_name', dbo.season % 2, 'cold']).epa.agg(['mean', 'size']).reset_index()
pv = q.pivot_table(index=['passer_player_id', 'passer_player_name', 'season'], columns='cold', values=['mean', 'size']).dropna()
pv = pv[(pv[('size', 1)] >= 75) & (pv[('size', 0)] >= 300)]; pv['d'] = pv[('mean', 1)] - pv[('mean', 0)]
w = pv.d.unstack('season').dropna()
if len(w) >= 10: r3, p3 = stats.pearsonr(w[0], w[1]); R.append(('W10', 'QB cold-weather EPA beyond his own, even vs odd seasons', r3, np.nan, np.nan, p3, len(w), len(w), np.nan, np.nan, 'r')); print(f'[W10] QB cold edge repeats? r {r3:.3f} (p {p3:.3g}, {len(w)} QBs)'); print('   best/worst in the cold:', w.mean(axis=1).sort_values().round(3).to_dict())
# kicking: FG make rate by wind and cold (outdoors), 40+ yards
fg = P[(P.play_type == 'field_goal')].merge(g[['game_id', 'windy', 'cold', 'indoor', 'precip']], on='game_id'); fg = fg[fg.kick_distance >= 40]; fg['made'] = (fg.field_goal_result == 'made').astype(int)
for key, lab, m in (('W11', 'FG 40+ yd made: wind 15+ vs calmer (outdoors)', (fg.indoor == 0) & (fg.windy == 1)), ('W12', 'FG 40+ yd made: cold vs warmer (outdoors)', (fg.indoor == 0) & (fg.cold == 1)), ('W13', 'FG 40+ yd made: indoors vs outdoors', fg.indoor == 1)):
    a = fg[m].made; b = fg[~m & ((fg.indoor == 0) if key != 'W13' else True)].made; t = stats.chi2_contingency([[a.sum(), len(a) - a.sum()], [b.sum(), len(b) - b.sum()]])
    R.append((key, lab, a.mean() - b.mean(), np.nan, np.nan, t[1], len(a), len(b), a.mean(), b.mean(), 'rate')); print(f'[{key}] {lab}: {a.mean():.3f} vs {b.mean():.3f} (n {len(a)}/{len(b)}), p {t[1]:.3g}')

Rd = pd.DataFrame(R, columns=['key', 'label', 'est', 'lo', 'hi', 'p', 'na', 'nb', 'a', 'b', 'note']); Rd['q'] = bh(Rd.p.values)
print('\nSUMMARY (BH q over this round):'); print(Rd[['key', 'label', 'est', 'lo', 'hi', 'p', 'q', 'na', 'nb', 'a', 'b']].to_string(index=False, float_format=lambda v: f'{v:.4g}'))
# holdout: the injury and weather headline tests again on 2019 on only
print('\nHOLDOUT 2019–2025:')
H = g[g.season >= 2019]; HS = H[H.turf.notna()]; HO = H[H.indoor == 0]
for key, lab, a, b in (('E01', 'turf vs grass', HS[HS.turf == 1], HS[HS.turf == 0]), ('E02', 'cold vs warmer', HO[HO.cold == 1], HO[HO.cold == 0]), ('E03', 'rain/snow vs dry', HO[HO.precip == 1], HO[HO.precip == 0]), ('E05', 'indoors vs outdoors', H[H.indoor == 1], H[H.indoor == 0])):
    ra, rb, rr, lo, hi, p, na, nb = prr(a, b); print(f'  [{key}] {lab}: ratio {rr:.3f} ({lo:.3f}-{hi:.3f}) p {p:.3g}')

# --- stadiums, fair version: by stadium id (renamed stadiums merged), each game's expected injuries from its own season's league rate,
# and the home team in the label (the home stats crew writes the play descriptions, so a stadium's number can be its scorers' habits)
sr = g.groupby('season').apply(lambda d: d.inj.sum() / d.plays.sum()); g['exp'] = g.plays * g.season.map(sr)
nm_ = g.groupby('sid').stadium.agg(lambda s: s.value_counts().index[0]); hm = g.groupby('sid').home.agg(lambda s: '/'.join(s.value_counts().index[:2]))
s2 = g.groupby('sid').agg(n=('game_id', 'size'), inj=('inj', 'sum'), exp=('exp', 'sum'), turf=('turf', 'mean'), indoor=('indoor', 'mean'), y0=('season', 'min'), y1=('season', 'max')).reset_index()
s2 = s2[s2.n >= 40].copy(); s2['rr'] = s2.inj / s2.exp; s2['z'] = (s2.inj - s2.exp) / np.sqrt(s2.exp * max(1, disp)); s2['p'] = 2 * stats.norm.sf(abs(s2.z)); s2['q'] = bh(s2.p.values)
s2['name'] = s2.sid.map(nm_); s2['home'] = s2.sid.map(hm)
print('\n[E09] stadiums by id, season-adjusted (40+ games), safest first:'); print(s2.sort_values('rr')[['name', 'home', 'y0', 'y1', 'n', 'inj', 'rr', 'q', 'turf', 'indoor']].to_string(index=False, float_format=lambda v: f'{v:.3f}'))
g['res'] = g.inj - g.exp
ev = g[g.season % 2 == 0].groupby('sid').apply(lambda d: d.inj.sum() / d.exp.sum()); od = g[g.season % 2 == 1].groupby('sid').apply(lambda d: d.inj.sum() / d.exp.sum())
j2 = pd.concat([ev, od], axis=1, keys=['e', 'o']).dropna(); j2 = j2[j2.index.isin(s2.sid)]; r4, p4 = stats.pearsonr(j2.e, j2.o)
print(f'[E09b] season-adjusted stadium rate, even vs odd seasons: r {r4:.3f} (p {p4:.3g}, {len(j2)} stadiums)')
# same team, new stadium: does the rate follow the team (its crew) or stay with the building? teams that moved or opened a new stadium
for team in ['LV', 'OAK', 'LA', 'STL', 'LAC', 'SD', 'MIN', 'ATL', 'IND', 'DAL', 'NYG', 'NYJ', 'SF', 'ARI']:
    d = g[g.home == team]
    if d.sid.nunique() > 1:
        print(f'  {team}: ' + '; '.join(f"{nm_.get(s, s)} {d[d.sid == s].season.min()}-{d[d.sid == s].season.max()} rate {d[d.sid == s].inj.sum() / d[d.sid == s].exp.sum():.2f} ({len(d[d.sid == s])} games)" for s in d.sid.value_counts().index if len(d[d.sid == s]) >= 15))
