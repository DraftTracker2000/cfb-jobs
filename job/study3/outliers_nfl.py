# Outliers for the study book (Nov 21–22, 2026 — the owner, 11:47–11:48 pm: "what if no, icing the kicker doesnt work, but then you look at
# the data and theres a guy thats just nails no matter what lifting the whole group or there is one guy dragging them further down" ·
# "i would want to know any outliers on both sides of any of these tests and they should be provided in the presentation").
# STUDY ONLY. For every NFL play-by-play test in the book (hunts 17 and 22): the top and bottom units (kicker, team, QB, stadium), their
# sample, the league result with them taken out, whether the extremes are bigger than luck alone gives among that many units (simulated),
# and whether the unit's edge repeats (first half of his sample vs second half, the prediction test).
# Usage: python3 outliers_nfl.py <pbp dir> <out.json>
import sys, glob, re, json, numpy as np, pandas as pd
from scipy import stats
PBP, OUT = sys.argv[1], sys.argv[2]; rng = np.random.default_rng(7); RES = {}
cols = ['game_id', 'season', 'season_type', 'week', 'posteam', 'defteam', 'home_team', 'away_team', 'play_type', 'epa', 'yards_gained', 'yardline_100', 'drive',
        'fixed_drive_result', 'field_goal_attempt', 'field_goal_result', 'kick_distance', 'timeout', 'timeout_team', 'half_seconds_remaining', 'passer_player_id',
        'passer_player_name', 'qb_dropback', 'result', 'spread_line', 'total', 'total_line', 'play_id', 'kicker_player_name', 'kicker_player_id', 'roof', 'wind',
        'temp', 'weather', 'game_stadium']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    y = int(re.search(r'p(\d{4})', f).group(1))
    if y < 2006: continue
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[P.season_type == 'REG'].sort_values(['game_id', 'play_id']).reset_index(drop=True)
print(f'{P.game_id.nunique()} games', flush=True)

def binom_luck(groups, k=3):
    """groups: list of arrays of expected make probabilities, one per unit. Returns the simulated distribution of the k-th best and
    k-th worst unit total (made minus expected) when every kick is pure luck at its expected rate."""
    tops, bots = [], []
    for _ in range(2000):
        r = np.array([(rng.random(len(p)) < p).sum() - p.sum() for p in groups]); r.sort(); tops.append(r[-1]); bots.append(r[0])
    return np.array(tops), np.array(bots)
def norm_luck(ns, sd, k=1):
    tops, bots = [], []
    ns = np.asarray(ns, float)
    for _ in range(4000):
        m = rng.normal(0, sd / np.sqrt(ns)); tops.append(m.max()); bots.append(m.min())
    return np.array(tops), np.array(bots)
def pct(dist, v): return float((dist >= v).mean()) if v >= 0 else float((dist <= v).mean())
def r2(a, b):
    if len(a) < 8: return None
    r, p = stats.pearsonr(a, b); return {'r': round(float(r), 3), 'p': round(float(p), 4), 'n': int(len(a))}

# ---------- I1 icing, by kicker ----------
prev_to = (P.timeout.shift(1) == 1) & (P.timeout_team.shift(1) == P.defteam) & (P.game_id.shift(1) == P.game_id)
FG = P[(P.field_goal_attempt == 1) & P.kick_distance.notna()].copy(); FG['iced'] = prev_to.loc[FG.index].values; FG['made'] = (FG.field_goal_result == 'made').astype(int)
FG['db'] = (FG.kick_distance // 5) * 5; FG['late'] = (FG.half_seconds_remaining <= 120)
base = FG[~FG.iced].groupby(['db', 'late']).made.mean(); FG['exp'] = [base.get((d, l), np.nan) for d, l in zip(FG.db, FG.late)]
FG = FG[FG.exp.notna()]; FG['res'] = FG.made - FG.exp
ic = FG[FG.iced]; lg = ic.res.mean()
k = ic.groupby(['kicker_player_id']).agg(name=('kicker_player_name', 'last'), n=('made', 'size'), made=('made', 'sum'), exp=('exp', 'sum'), res=('res', 'sum'),
                                          first=('season', 'min'), last=('season', 'max'))
norm = FG[~FG.iced].groupby('kicker_player_id').res.mean().rename('usual')   # his edge per kick on every other kick
k = k.join(norm); k['vs_usual'] = k.res - k.usual * k.n; K = k[k.n >= 8].sort_values('vs_usual')
groups = [ic[ic.kicker_player_id == i].exp.values for i in K.index]; T, B = binom_luck(groups)
# repeat: his iced kicks in order, first half vs second half (vs his usual)
ic = ic.sort_values(['game_id', 'play_id']); ic['h'] = ic.groupby('kicker_player_id').cumcount() / ic.groupby('kicker_player_id').made.transform('size') < .5
hh = ic.join(norm, on='kicker_player_id').assign(v=lambda d: d.res - d.usual).groupby(['kicker_player_id', 'h']).v.agg(['mean', 'size']).unstack()
hh = hh[(hh[('size', True)] >= 4) & (hh[('size', False)] >= 4)]
def krow(i, r): return {'name': r['name'], 'n': int(r.n), 'made': int(r.made), 'exp': round(float(r.exp), 1), 'vs_usual': round(float(r.vs_usual), 1),
                        'usual_per10': round(float(r.usual * 10), 2), 'years': f"{int(r['first'])}–{int(r['last'])}"}
ex_top = ic[~ic.kicker_player_id.isin(K.index[-3:])].res.mean(); ex_bot = ic[~ic.kicker_player_id.isin(K.index[:3])].res.mean()
RES['icing'] = {'unit': 'kicker', 'min_n': 8, 'units': int(len(K)), 'all': round(100 * lg, 2), 'without_top3': round(100 * ex_top, 2), 'without_bottom3': round(100 * ex_bot, 2),
    'top': [krow(i, r) for i, r in K.iloc[::-1][:4].iterrows()], 'bottom': [krow(i, r) for i, r in K.iloc[:4].iterrows()],
    'luck_top': pct(T, K.res.max()), 'luck_bottom': pct(B, K.res.min()), 'luck_top_typical': round(float(np.median(T)), 1), 'luck_bottom_typical': round(float(np.median(B)), 1),
    'repeat': r2(hh[('mean', True)], hh[('mean', False)])}
print('icing', json.dumps(RES['icing'])[:900], flush=True)

# ---------- long kicks indoors, by kicker ----------
F4 = FG[(FG.kick_distance >= 40)].copy(); F4['indoor'] = F4.roof.isin(['dome', 'closed'])
b4 = F4.groupby('db').made.mean(); F4['e4'] = F4.db.map(b4); F4['r4'] = F4.made - F4.e4
lg_in = F4[F4.indoor].made.mean(); lg_out = F4[~F4.indoor].made.mean()
g = F4.groupby(['kicker_player_id', 'indoor']).agg(n=('made', 'size'), m=('made', 'mean'), r=('r4', 'mean')).unstack()
g = g[(g[('n', True)] >= 12) & (g[('n', False)] >= 12)].copy(); g.columns = [f'{a}{"I" if b else "O"}' for a, b in g.columns]; g['edge'] = (g.rI - g.rO) * 100
nm = F4.groupby('kicker_player_id').kicker_player_name.last(); g = g.sort_values('edge')
def frow(i, r): return {'name': nm[i], 'in_n': int(r.nI), 'in': round(100 * float(r.mI), 1), 'out_n': int(r.nO), 'out': round(100 * float(r.mO), 1),
                        'edge': round(float(r['edge']), 1)}
ev = F4[F4.season % 2 == 0].groupby(['kicker_player_id', 'indoor']).r4.agg(['mean', 'size']).unstack(); od = F4[F4.season % 2 == 1].groupby(['kicker_player_id', 'indoor']).r4.agg(['mean', 'size']).unstack()
def ed(d): d = d[(d[('size', True)] >= 6) & (d[('size', False)] >= 6)]; return d[('mean', True)] - d[('mean', False)]
j = pd.concat([ed(ev), ed(od)], axis=1, keys=['e', 'o']).dropna()
sd = np.sqrt(.21); ns = 1 / (1 / g.nI + 1 / g.nO); T, B = norm_luck(ns, sd)
keep_top = F4[~F4.kicker_player_id.isin(g.index[-3:])]; keep_bot = F4[~F4.kicker_player_id.isin(g.index[:3])]
RES['fg40'] = {'unit': 'kicker', 'min_n': '12 indoors and 12 outdoors from 40+', 'units': int(len(g)), 'all_in': round(100 * lg_in, 1), 'all_out': round(100 * lg_out, 1),
    'without_top3': [round(100 * keep_top[keep_top.indoor].made.mean(), 1), round(100 * keep_top[~keep_top.indoor].made.mean(), 1)],
    'without_bottom3': [round(100 * keep_bot[keep_bot.indoor].made.mean(), 1), round(100 * keep_bot[~keep_bot.indoor].made.mean(), 1)],
    'top': [frow(i, r) for i, r in g.iloc[::-1][:4].iterrows()], 'bottom': [frow(i, r) for i, r in g.iloc[:4].iterrows()],
    'luck_top': pct(T, g.edge.max() / 100), 'luck_bottom': pct(B, g.edge.min() / 100), 'repeat': r2(j.e, j.o)}
print('fg40', json.dumps(RES['fg40'])[:900], flush=True)

# ---------- team seasons: red zone, big plays ----------
off = P[P.play_type.isin(['run', 'pass'])].groupby(['posteam', 'season']).agg(epa=('epa', 'mean'), yds=('yards_gained', 'sum'), ex=('yards_gained', lambda s: s[s >= 20].sum()))
off['exs'] = off.ex / off.yds
dr = P[P.drive.notna()].groupby(['game_id', 'posteam', 'drive', 'season']).agg(rz=('yardline_100', lambda s: (s <= 20).any()), res=('fixed_drive_result', 'first')).reset_index()
rz = dr[dr.rz].groupby(['posteam', 'season']).agg(n=('res', 'size'), td=('res', lambda s: (s == 'Touchdown').mean())); off = off.join(rz)
o = off.reset_index(); nx = o.set_index(['posteam', 'season'])
o['td_next'] = nx.td.reindex(list(zip(o.posteam, o.season + 1))).values; o['epa_next'] = nx.epa.reindex(list(zip(o.posteam, o.season + 1))).values
o['exs_next'] = nx.exs.reindex(list(zip(o.posteam, o.season + 1))).values
lgtd = o.groupby('season').td.transform('mean'); o['td_rel'] = o.td - lgtd
q = o.dropna(subset=['td_next']).sort_values('td_rel')
def trow(r): return {'team': r.posteam, 'season': int(r.season), 'td': round(100 * r.td, 1), 'next': round(100 * r.td_next, 1), 'trips': int(r.n)}
hot = q.iloc[-20:]; cold = q.iloc[:20]; lm = o.td.mean()
RES['redzone'] = {'unit': 'team season', 'units': int(len(q)), 'league_td': round(100 * lm, 1), 'top': [trow(r) for _, r in q.iloc[::-1][:4].iterrows()], 'bottom': [trow(r) for _, r in q.iloc[:4].iterrows()],
    'hot20': [round(100 * hot.td.mean(), 1), round(100 * hot.td_next.mean(), 1)], 'cold20': [round(100 * cold.td.mean(), 1), round(100 * cold.td_next.mean(), 1)],
    'repeat': r2(q.td, q.td_next)}
q = o.dropna(subset=['epa_next']).sort_values('exs')
def xrow(r): return {'team': r.posteam, 'season': int(r.season), 'share': round(100 * r.exs, 1), 'epa': round(float(r.epa), 3), 'epa_next': round(float(r.epa_next), 3), 'share_next': None if pd.isna(r.exs_next) else round(100 * r.exs_next, 1)}
RES['bigplays'] = {'unit': 'team season', 'units': int(len(q)), 'top': [xrow(r) for _, r in q.iloc[::-1][:4].iterrows()], 'bottom': [xrow(r) for _, r in q.iloc[:4].iterrows()],
    'top20': [round(float(q.iloc[-20:].epa.mean()), 3), round(float(q.iloc[-20:].epa_next.mean()), 3)], 'bottom20': [round(float(q.iloc[:20].epa.mean()), 3), round(float(q.iloc[:20].epa_next.mean()), 3)],
    'league_epa': round(float(o.epa.mean()), 3)}
print('redzone', json.dumps(RES['redzone'])[:600], '\nbigplays', json.dumps(RES['bigplays'])[:600], flush=True)

# ---------- tempo ----------
pg = P[P.play_type.isin(['run', 'pass'])].groupby(['posteam', 'season', 'game_id']).size().groupby(['posteam', 'season']).mean().rename('ppg')
gm = P.drop_duplicates('game_id')[['game_id', 'season', 'home_team', 'away_team', 'total', 'total_line']].dropna()
gm = gm.join(pg.rename('hp'), on=['home_team', 'season']).join(pg.rename('ap'), on=['away_team', 'season']).dropna(); gm['ovr'] = gm.total - gm.total_line
lgp = gm.groupby('season').hp.transform('mean'); gm['sum'] = (gm.hp - lgp) + (gm.ap - lgp)
slope = np.polyfit(gm['sum'], gm.ovr, 1)[0]
tg = pd.concat([gm[['home_team', 'season', 'ovr', 'sum']].rename(columns={'home_team': 'team'}), gm[['away_team', 'season', 'ovr', 'sum']].rename(columns={'away_team': 'team'})])
ts = tg.groupby(['team', 'season']).agg(n=('ovr', 'size'), ovr=('ovr', 'mean')).join(pg.rename_axis(['team', 'season'])).reset_index()
ts['rel'] = ts.ppg - ts.groupby('season').ppg.transform('mean'); ts = ts.sort_values('rel')
def prow(r): return {'team': r.team, 'season': int(r.season), 'plays_vs_avg': round(float(r.rel), 1), 'games': int(r.n), 'ovr': round(float(r.ovr), 1)}
both = gm.sort_values('sum')
RES['tempo'] = {'unit': 'team season', 'slope': round(float(slope), 3), 'fast': [prow(r) for _, r in ts.iloc[::-1][:4].iterrows()], 'slow': [prow(r) for _, r in ts.iloc[:4].iterrows()],
    'fastest_games': {'n': 50, 'sum': round(float(both.iloc[-50:]['sum'].mean()), 1), 'ovr': round(float(both.iloc[-50:].ovr.mean()), 1), 'over_rate': round(float((both.iloc[-50:].ovr > 0).mean()), 3)},
    'slowest_games': {'n': 50, 'sum': round(float(both.iloc[:50]['sum'].mean()), 1), 'ovr': round(float(both.iloc[:50].ovr.mean()), 1), 'over_rate': round(float((both.iloc[:50].ovr > 0).mean()), 3)}}
print('tempo', json.dumps(RES['tempo'])[:700], flush=True)

# ---------- new QBs ----------
db = P[P.qb_dropback == 1].groupby(['game_id', 'season', 'week', 'posteam', 'passer_player_id', 'passer_player_name']).size().rename('n').reset_index().sort_values('n').drop_duplicates(['game_id', 'posteam'], keep='last')
db = db.sort_values(['season', 'week']); first = db.groupby(['passer_player_id', 'posteam']).season.transform('min'); db['newteam'] = db.season == first
db['k'] = db.groupby(['passer_player_id', 'posteam', 'season']).cumcount() + 1
gl = P.drop_duplicates('game_id').set_index('game_id')[['home_team', 'result', 'spread_line']]
db = db.join(gl, on='game_id').dropna(subset=['spread_line']); db['cover'] = np.where(db.posteam == db.home_team, db.result - db.spread_line, -(db.result - db.spread_line))
nq = db[db.newteam & (db.season > 2006)].copy(); nq['early'] = nq.k <= 3
u = nq.groupby(['passer_player_id', 'posteam', 'season']).apply(lambda d: pd.Series({'name': d.passer_player_name.iloc[-1], 'e_n': int(d.early.sum()), 'e': d[d.early].cover.mean(),
    'l_n': int((~d.early).sum()), 'l': d[~d.early].cover.mean()})).reset_index()
u = u[(u.e_n >= 3) & (u.l_n >= 3)].copy(); u['gap'] = u.e - u.l; u = u.sort_values('gap')
def qrow(r): return {'name': r['name'], 'team': r.posteam, 'season': int(r.season), 'first3': round(float(r.e), 1), 'later': round(float(r.l), 1), 'later_n': int(r.l_n)}
a = nq[nq.early].cover; b = nq[~nq.early].cover
def gapx(ex):
    m = ~nq.set_index(['passer_player_id', 'posteam', 'season']).index.isin(ex); d = nq[m]; return round(float(d[d.early].cover.mean() - d[~d.early].cover.mean()), 2)
ix = list(zip(u.passer_player_id, u.posteam, u.season))
T, B = norm_luck(np.full(len(u), 3.0), float(db.cover.std()))
RES['newqb'] = {'unit': 'QB new to a team', 'units': int(len(u)), 'all': [round(float(a.mean()), 2), round(float(b.mean()), 2)], 'gap': round(float(a.mean() - b.mean()), 2),
    'without_top3': gapx(ix[-3:]), 'without_bottom3': gapx(ix[:3]), 'top': [qrow(r) for _, r in u.iloc[::-1][:4].iterrows()], 'bottom': [qrow(r) for _, r in u.iloc[:4].iterrows()],
    'share_worse': round(float((u.gap < 0).mean()), 3)}
print('newqb', json.dumps(RES['newqb'])[:900], flush=True)

# ---------- wind and dome teams, by stadium / team ----------
g = P.groupby('game_id').agg(season=('season', 'first'), home=('home_team', 'first'), away=('away_team', 'first'), roof=('roof', 'first'), temp=('temp', 'first'),
                             wind=('wind', 'first'), stadium=('game_stadium', 'first'), result=('result', 'first'), total=('total', 'first'), spread=('spread_line', 'first'),
                             tline=('total_line', 'first')).reset_index()
g['indoor'] = g.roof.isin(['dome', 'closed']); g['windy'] = (g.wind >= 15) & ~g.indoor; g['cold'] = (g.temp <= 32) & ~g.indoor; g['ovr'] = g.total - g.tline; g['cover'] = g.result - g.spread
L = g[~g.indoor & g.spread.notna() & g.tline.notna()]; W = L[L.windy]
ws = W.groupby('stadium').agg(n=('ovr', 'size'), ovr=('ovr', 'mean')); calm = L[~L.windy].groupby('stadium').ovr.mean().rename('calm'); ws = ws.join(calm); ws = ws[ws.n >= 8].sort_values('ovr')
def wrow(i, r): return {'stadium': i, 'n': int(r.n), 'ovr': round(float(r.ovr), 1), 'calm': round(float(r.calm), 1)}
T, B = norm_luck(ws.n.values, float(L.ovr.std()))
ev = W[W.season % 2 == 0].groupby('stadium').ovr.agg(['mean', 'size']); od = W[W.season % 2 == 1].groupby('stadium').ovr.agg(['mean', 'size']); jj = ev.join(od, lsuffix='e', rsuffix='o')
jj = jj[(jj.sizee >= 4) & (jj.sizeo >= 4)]
RES['wind'] = {'unit': 'stadium', 'min_n': 8, 'units': int(len(ws)), 'all': round(float(W.ovr.mean()), 2), 'calm': round(float(L[~L.windy].ovr.mean()), 2),
    'without_top3': round(float(W[~W.stadium.isin(ws.index[-3:])].ovr.mean()), 2), 'without_bottom3': round(float(W[~W.stadium.isin(ws.index[:3])].ovr.mean()), 2),
    'top': [wrow(i, r) for i, r in ws.iloc[::-1][:4].iterrows()], 'bottom': [wrow(i, r) for i, r in ws.iloc[:4].iterrows()],
    'luck_top': pct(T, ws.ovr.max() - W.ovr.mean()), 'luck_bottom': pct(B, ws.ovr.min() - W.ovr.mean()), 'repeat': r2(jj.meane, jj.meano)}
print('wind', json.dumps(RES['wind'])[:900], flush=True)
DOME = set(g[g.indoor].groupby('home').size().loc[lambda s: s >= 30].index)
c = L[L.cold]; a = c[c.away.isin(DOME) & ~c.home.isin(DOME)].copy(); a['vcover'] = -a.cover
dt = a.groupby('away').agg(n=('vcover', 'size'), cov=('vcover', 'mean'), w=('vcover', lambda s: int((s > 0).sum()))).sort_values('cov')
bvis = c[~c.away.isin(DOME) & ~c.home.isin(DOME)]
RES['dome'] = {'unit': 'dome team', 'units': int(len(dt)), 'all': round(float(a.vcover.mean()), 2), 'others': round(float(-bvis.cover.mean()), 2),
    'teams': [{'team': i, 'n': int(r.n), 'cover': round(float(r['cov']), 1), 'covered': int(r.w)} for i, r in dt.iloc[::-1].iterrows()]}
print('dome', json.dumps(RES['dome'])[:900], flush=True)
json.dump(RES, open(OUT, 'w'), indent=1); print('saved', OUT)
