# Outliers for the study book from pattern hunts 38 and 40 (Nov 22, 2026 — outliers on both sides of every test). STUDY ONLY. NBA box
# scores (sportsdataverse, flagged), regular season 2015–2026. Same definitions as hunt38.py / hunt40.py.
#  38  the toughest teams by stat, full strength only: shots taken (made to shoot more) and assists. Pairs tagged from earlier seasons
#      (up to 3 back, 2+ games), scored on the next season (2+ games). Named pairs that kept the bad side and ones that flipped.
#  40  "when he's out": each player and each top-3-minutes teammate, games that teammate missed (10+): his minutes and points beyond his
#      season average, first half of those games vs the second half (chronological). Top 15% bumps in the first half → second half.
# Usage: python3 outliers_hunt38_40.py BOX_DIR OUT.json
import sys, os, json, numpy as np, pandas as pd
D, OUTF = sys.argv[1], sys.argv[2]; RES = {}
B = pd.concat([pd.read_csv(f'{D}/nba{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{D}/nba{y}.csv')], ignore_index=True)
B = B[B.season_type == 2].copy()
for c in ['minutes', 'points', 'field_goals_attempted', 'assists']: B[c] = pd.to_numeric(B[c], errors='coerce')
B['minutes'] = B.minutes.fillna(0)
NMp = B.groupby('athlete_id').athlete_display_name.last(); NMt = B.groupby('team_id').team_short_display_name.last()
reg = B[B.minutes > 0].groupby(['season', 'team_id', 'athlete_id']).agg(mpg=('minutes', 'mean'), gp=('minutes', 'size')).reset_index(); reg = reg[(reg.mpg >= 20) & (reg.gp >= 20)]
top5 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(5).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
on = B[B.minutes >= 20].groupby(['game_id', 'team_id']).athlete_id.apply(set)
P = B[B.minutes >= 15].copy(); k = 36 / P.minutes; P['fga'] = P.field_goals_attempted * k; P['ast'] = P.assists * k
P = P[P.groupby(['season', 'athlete_id']).minutes.transform('size') >= 20]
P['full'] = [top5.get((s, o), set()) <= on.get((g, o), set()) for g, s, o in zip(P.game_id, P.season, P.opponent_team_id)]
for c in ('fga', 'ast'):
    own = P.groupby(['season', 'athlete_id'])[c].transform('mean'); dav = P.groupby(['season', 'opponent_team_id'])[c].transform('mean') - P.groupby('season')[c].transform('mean')
    P['x_' + c] = P[c] - own - dav
F = P[P.full]
for c, good in (('fga', -1), ('ast', +1)):
    pair = F.groupby(['athlete_id', 'opponent_team_id', 'season'])['x_' + c].agg(['sum', 'size']).reset_index(); rows = []
    for s in sorted(pair.season.unique())[2:]:
        w = pair[(pair.season < s) & (pair.season >= s - 3)].groupby(['athlete_id', 'opponent_team_id'])[['sum', 'size']].sum(); w = w[w['size'] >= 2]
        m = w['sum'] / w['size']; tg = m.index[m <= m.quantile(.15)] if good > 0 else m.index[m >= m.quantile(.85)]
        now = pair[pair.season == s].set_index(['athlete_id', 'opponent_team_id']); now = now[now['size'] >= 2]
        for ix in tg:
            if ix in now.index: rows.append([NMp.get(ix[0], str(ix[0])), NMt.get(ix[1], str(ix[1])), int(s), round(float(m[ix]), 1), int(w.loc[ix, 'size']), round(float(now.loc[ix, 'sum'] / now.loc[ix, 'size']), 1), int(now.loc[ix, 'size'])])
    d = pd.DataFrame(rows, columns=['player', 'team', 'season', 'before', 'g_before', 'next', 'g_next'])
    bad = (d.next > 0) if good < 0 else (d.next < 0)
    kept = d.assign(k=good * np.maximum(good * d.before, good * d.next)).sort_values('k', ascending=(good > 0))
    RES['tough_' + c] = {'pairs': int(len(d)), 'mean_next': round(float(d.next.mean()), 2), 'stayed_bad': int(bad.sum()),
        'kept': kept.head(6).drop(columns='k').values.tolist(), 'flipped': d.sort_values('next', ascending=(good < 0)).head(4).values.tolist()}
    print(c, RES['tough_' + c]['pairs'], RES['tough_' + c]['mean_next'], RES['tough_' + c]['stayed_bad'], flush=True)
# 40 when he's out
top3 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(3)
played = set(zip(B[B.minutes > 0].game_id, B[B.minutes > 0].athlete_id))
Q = B[B.minutes >= 1].copy(); Q = Q[Q.groupby(['season', 'athlete_id']).minutes.transform('size') >= 20]
for c in ('minutes', 'points'): Q['x_' + c] = Q[c] - Q.groupby(['season', 'athlete_id'])[c].transform('mean')
T3 = top3.groupby(['season', 'team_id']).athlete_id.apply(list).to_dict(); rows = []
for r in Q[['game_id', 'season', 'team_id', 'athlete_id', 'game_date', 'x_minutes', 'x_points']].itertuples(index=False):
    for tm in T3.get((r.season, r.team_id), []):
        if tm != r.athlete_id and (r.game_id, tm) not in played: rows.append((r.athlete_id, tm, r.game_date, r.season, r.x_minutes, r.x_points))
O = pd.DataFrame(rows, columns=['pid', 'mate', 'date', 'season', 'xm', 'xp']).sort_values('date')
O['i'] = O.groupby(['pid', 'mate']).cumcount(); O['n'] = O.groupby(['pid', 'mate']).pid.transform('size'); O = O[O.n >= 10]
O['half'] = np.where(O.i < O.n / 2, 'a', 'b')
H = O.groupby(['pid', 'mate', 'half'])[['xm', 'xp']].mean().unstack('half'); H['n'] = O.groupby(['pid', 'mate']).n.first()
RES['out_all'] = {'player_games': int(len(O)), 'pairs': int(len(H)), 'avg_minutes': round(float(O.xm.mean()), 2), 'avg_points': round(float(O.xp.mean()), 2)}
for c, lab in (('xm', 'minutes'), ('xp', 'points')):
    a, b = H[(c, 'a')], H[(c, 'b')]; qt, qb = a.quantile(.85), a.quantile(.15); mb = b.median()
    nm = lambda ix: [NMp.get(ix[0], str(ix[0])), NMp.get(ix[1], str(ix[1])), round(float(a[ix]), 1), round(float(b[ix]), 1), int(H.loc[ix, 'n'].iloc[0] if hasattr(H.loc[ix, 'n'], 'iloc') else H.loc[ix, 'n'])]
    both = pd.concat([a, b], axis=1, keys=['a', 'b'])
    RES['out_' + lab] = {'top': {'n': int((a >= qt).sum()), 'first': round(float(a[a >= qt].mean()), 2), 'second': round(float(b[a >= qt].mean()), 2), 'again': int((b[a >= qt] > mb).sum())},
        'bottom': {'n': int((a <= qb).sum()), 'first': round(float(a[a <= qb].mean()), 2), 'second': round(float(b[a <= qb].mean()), 2), 'again': int((b[a <= qb] < mb).sum())},
        'all_second': round(float(b.mean()), 2), 'up_both': [nm(ix) for ix in both.min(axis=1).sort_values(ascending=False).index[:6]], 'down_both': [nm(ix) for ix in both.max(axis=1).sort_values().index[:5]]}
    print(lab, json.dumps({k: v for k, v in RES['out_' + lab].items() if k in ('top', 'bottom', 'all_second')}), flush=True)
json.dump(RES, open(OUTF, 'w'), indent=1); print('saved')
