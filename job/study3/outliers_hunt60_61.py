# Outliers for the study book from pattern hunts 60 (stars back from injury) and 61 (defenses that stop yards after the catch), Nov 22, 2026.
# STUDY ONLY. nflverse weekly stats and play-by-play, regular season 2015–2025.
#  R  first game back: a WR/RB/TE who missed his team's previous game, with 3+ games before it that season. Elite = top 24 WR/RB and top 12
#     TE by yards a game going in. His yards (receiving + rushing) vs his own average going in, that game and the next. Named at both ends.
#  Y  YAC over expected allowed a catch (yards after catch minus nflverse's expected YAC), per defense-season; top/bottom 15% → next season.
# Usage: python3 outliers_hunt60_61.py <scratch dir with nflw/ and pbp/> <out.json>
import sys, glob, json, numpy as np, pandas as pd
S, OUT = sys.argv[1], sys.argv[2]; RES = {}; fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True)
W = W[(W.season_type == 'REG') & W.position.isin(['WR', 'RB', 'TE']) & (W.season <= 2025)].copy(); W['team'] = W.team.replace(fix)
W['yds'] = W.receiving_yards.fillna(0) + W.rushing_yards.fillna(0)
TW = W.groupby(['season', 'team']).week.apply(lambda s: sorted(set(s))).to_dict()
W = W.sort_values(['player_id', 'season', 'week']); g = W.groupby(['player_id', 'season'])
W['n0'] = g.cumcount(); W['avg0'] = (g.yds.cumsum() - W.yds) / W.n0.replace(0, np.nan); W['prevwk'] = g.week.shift(); W['nextyds'] = g.yds.shift(-1)
def team_prev(r):
    wk = [w for w in TW.get((r.season, r.team), []) if w < r.week]; return wk[-1] if wk else np.nan
W['tprev'] = [team_prev(r) for r in W[['season', 'team', 'week']].itertuples(index=False)]
W['ret'] = (W.n0 >= 3) & W.prevwk.notna() & (W.tprev > W.prevwk)
rk = W[W.n0 >= 3].copy(); rk['r'] = rk.groupby(['season', 'week', 'position']).avg0.rank(ascending=False)
W['elite'] = False; W.loc[rk.index, 'elite'] = ((rk.position != 'TE') & (rk.r <= 24)) | ((rk.position == 'TE') & (rk.r <= 12))
A = W[(W.n0 >= 3) & (W.avg0 > 0)].copy(); A['rel'] = A.yds / A.avg0 - 1; A['reln'] = A.nextyds / A.avg0 - 1
for lab, m in (('elite', A.elite), ('others', ~A.elite)):
    r_, o_ = A[m & A.ret], A[m & ~A.ret]
    RES['return_' + lab] = {'returns': int(len(r_)), 'first_game': round(float(r_.rel.mean()), 3), 'other_games': round(float(o_.rel.mean()), 3), 'next_game': round(float(r_.reln.mean()), 3), 'below_usual': int((r_.rel < 0).sum())}
E = A[A.elite & A.ret].copy()
f = lambda r: [r.player_display_name, r.position, r.team, int(r.season), int(r.week), round(float(r.avg0), 1), int(r.yds), None if pd.isna(r.nextyds) else int(r.nextyds)]
RES['return_slow'] = [f(r) for _, r in E.sort_values('rel').head(6).iterrows()]; RES['return_fast'] = [f(r) for _, r in E.sort_values('rel', ascending=False).head(6).iterrows()]
print({k: v for k, v in RES.items() if k.startswith('return_e') or k.startswith('return_o')}, flush=True)
# YAC over expected allowed
cols = ['season', 'season_type', 'defteam', 'complete_pass', 'yards_after_catch', 'xyac_mean_yardage']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[(P.season_type == 'REG') & (P.complete_pass == 1) & P.yards_after_catch.notna() & P.xyac_mean_yardage.notna()].copy(); P['defteam'] = P.defteam.replace(fix)
P['yoe'] = P.yards_after_catch - P.xyac_mean_yardage
D = P.groupby(['defteam', 'season']).yoe.mean().reset_index(); D['nxt'] = D.set_index(['defteam', 'season']).yoe.reindex(list(zip(D.defteam, D.season + 1))).values; D = D.dropna()
for side, asc in (('stingy', True), ('leaky', False)):
    sel = pd.concat([d.sort_values('yoe', ascending=asc).head(int(round(len(d) * .15))) for _, d in D.groupby('season')])
    med = D.groupby('season').nxt.transform('median')
    again = int(((sel.nxt < med.loc[sel.index]) if asc else (sel.nxt > med.loc[sel.index])).sum())
    s = 1 if asc else -1
    RES['yac_' + side] = {'n': int(len(sel)), 'this': round(float(sel.yoe.mean()), 2), 'next': round(float(sel.nxt.mean()), 2), 'all_next': round(float(D.nxt.mean()), 2), 'again': again,
        'kept': sel.assign(k=-s * np.maximum(s * sel.yoe, s * sel.nxt) * -1).sort_values('k', ascending=asc).head(5)[['defteam', 'season', 'yoe', 'nxt']].round(2).values.tolist(),
        'flipped': sel.sort_values('nxt', ascending=not asc).head(3)[['defteam', 'season', 'yoe', 'nxt']].round(2).values.tolist()}
    cnt = pd.concat([d.sort_values('yoe', ascending=asc).head(int(round(len(d) * .15))) for _, d in P.groupby(['defteam', 'season']).yoe.mean().reset_index().groupby('season')]).defteam.value_counts().head(5)
    RES['yac_' + side]['most_seasons'] = [[t, int(v)] for t, v in cnt.items()]
    print(side, RES['yac_' + side], flush=True)
json.dump(RES, open(OUT, 'w'), indent=1, default=str); print('saved')
