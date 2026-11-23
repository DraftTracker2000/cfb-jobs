# Weather and fourth-down calls (Nov 22, 2026 — the owner, 12:33 am: "does wind cause teams to go for it more on fourth down or at what wind
# speed it starts to alter that. same thing with rain and other weather"). STUDY ONLY. NFL play-by-play 2006–2025, regular season.
# Every 4th down that was a real choice (a run, pass, punt or field-goal try; no kneels or spikes; not in the last 2 minutes of a half; score
# within 16). Each one gets an expected go / punt / kick rate from the same spot in indoor and calm games: distance to go, field position,
# score, quarter and era. Then: what teams actually did, by wind band, rain or snow, snow, cold, heat. Both halves of the 20 seasons, and
# coaches (head coach of the team) at both ends in windy games.
# Usage: python3 weather_4th.py <pbp dir> <out.json>
import sys, glob, re, json, numpy as np, pandas as pd
from scipy import stats
PBP, OUT = sys.argv[1], sys.argv[2]; RES = {}
cols = ['game_id', 'season', 'season_type', 'posteam', 'home_team', 'away_team', 'down', 'ydstogo', 'yardline_100', 'play_type', 'qtr', 'score_differential',
        'half_seconds_remaining', 'wind', 'temp', 'roof', 'weather', 'game_stadium', 'stadium_id', 'home_coach', 'away_coach', 'fourth_down_converted', 'fourth_down_failed']
fr = []
for f in sorted(glob.glob(PBP + '/p20*.csv.gz')):
    if int(re.search(r'p(\d{4})', f).group(1)) < 2006: continue
    h = pd.read_csv(f, nrows=0).columns; fr.append(pd.read_csv(f, usecols=[c for c in cols if c in h], low_memory=False))
P = pd.concat(fr, ignore_index=True); P = P[(P.season_type == 'REG') & (P.down == 4) & P.play_type.isin(['run', 'pass', 'punt', 'field_goal'])].copy()
P = P[(P.half_seconds_remaining > 120) & (P.score_differential.abs() <= 16)].copy()
P['call'] = np.where(P.play_type.isin(['run', 'pass']), 'go', np.where(P.play_type == 'punt', 'punt', 'kick'))
P['indoor'] = P.roof.isin(['dome', 'closed'])
wt = P.weather.astype(str).str.lower()
P['wet'] = (wt.str.contains(r'\brain|showers|drizzle|snow|sleet|flurr') & ~wt.str.contains(r'no rain|0% chance|chance of rain 0')) & ~P.indoor
P['snow'] = wt.str.contains(r'snow|flurr|sleet') & ~P.indoor
P['wind_b'] = np.where(P.indoor, 'indoor', pd.cut(P.wind.fillna(-1), [-2, -0.5, 4.5, 9.5, 14.5, 19.5, 100], labels=['unknown', '0–4', '5–9', '10–14', '15–19', '20+']).astype(str))
P['cold'] = (P.temp <= 32) & ~P.indoor; P['hot'] = (P.temp >= 85) & ~P.indoor
P['era'] = np.where(P.season <= 2015, 'early', 'late')
P['dist'] = pd.cut(P.ydstogo, [0, 1, 2, 3, 5, 8, 100], labels=False); P['fld'] = pd.cut(P.yardline_100, [0, 10, 20, 30, 35, 40, 45, 50, 60, 70, 80, 100], labels=False)
P['sc'] = pd.cut(P.score_differential, [-17, -9, -4, -1, 0, 3, 8, 17], labels=False); P['q'] = P.qtr.clip(upper=4)
key = ['dist', 'fld', 'sc', 'q', 'era']
# baseline: indoor games plus outdoor games with wind 0-9 and no rain or snow
base = P[P.indoor | (P.wind_b.isin(['0–4', '5–9']) & ~P.wet)]
for c in ['go', 'punt', 'kick']: P['is_' + c] = (P.call == c).astype(float)
B = base.assign(**{'is_' + c: (base.call == c).astype(float) for c in ['go', 'punt', 'kick']}).groupby(key)[['is_go', 'is_punt', 'is_kick']].mean()
P = P.join(B.rename(columns=lambda x: 'e' + x), on=key); P = P[P.eis_go.notna()].copy()
def summ(d):
    n = len(d); r = {'n': int(n)}
    for c in ['go', 'punt', 'kick']:
        o, e = d['is_' + c].mean(), d['eis_' + c].mean(); se = np.sqrt((d['eis_' + c] * (1 - d['eis_' + c])).sum()) / n
        r[c] = [round(100 * o, 1), round(100 * e, 1), round(100 * (o - e), 1), round(float(2 * stats.norm.sf(abs((o - e) / se))), 4) if se > 0 else None]
    return r
O = P[~P.indoor]
RES['wind'] = {b: summ(O[(O.wind_b == b) & ~O.wet]) for b in ['0–4', '5–9', '10–14', '15–19', '20+']}
RES['wind_by_era'] = {e: {b: summ(O[(O.wind_b == b) & ~O.wet & (O.era == e)]) for b in ['10–14', '15–19', '20+']} for e in ['early', 'late']}
RES['wet'] = summ(O[O.wet & ~O.snow]); RES['snow'] = summ(O[O.snow]); RES['cold'] = summ(O[O.cold & ~O.wet]); RES['hot'] = summ(O[O.hot & ~O.wet])
RES['indoor'] = summ(P[P.indoor])
RES['by_era'] = {e: {'wet': summ(O[O.wet & ~O.snow & (O.era == e)]), 'snow': summ(O[O.snow & (O.era == e)]), 'cold': summ(O[O.cold & ~O.wet & (O.era == e)])} for e in ['early', 'late']}
# where on the field: 15+ mph, by field zone (kick range vs midfield)
W = O[O.wind_b.isin(['15–19', '20+']) & ~O.wet]
RES['wind15_zone'] = {z: summ(W[(W.yardline_100 > a) & (W.yardline_100 <= b)]) for z, (a, b) in {'opp 1–30': (0, 30), 'opp 31–45': (30, 45), 'midfield to own 40': (45, 60), 'own side 40+ back': (60, 100)}.items()}
# kicking in the wind: FG tries made, by band (all distances), context
# coaches in windy games (15+): go rate minus expected, at both ends (20+ windy 4th downs)
O = O.copy(); O['coach'] = np.where(O.posteam == O.home_team, O.home_coach, O.away_coach)
cw = W.assign(coach=np.where(W.posteam == W.home_team, W.home_coach, W.away_coach)).groupby('coach').agg(n=('is_go', 'size'), go=('is_go', 'mean'), e=('eis_go', 'mean'))
cw = cw[cw.n >= 20].copy(); cw['d'] = 100 * (cw.go - cw.e); cw = cw.sort_values('d')
calm = O[O.wind_b.isin(['0–4', '5–9']) & ~O.wet].groupby('coach').agg(cn=('is_go', 'size'), cgo=('is_go', 'mean'), ce=('eis_go', 'mean')); cw = cw.join(calm); cw['calm_d'] = 100 * (cw.cgo - cw.ce)
def crow(i, r): return {'coach': i, 'n': int(r.n), 'go': round(100 * r.go, 1), 'exp': round(100 * r.e, 1), 'd': round(float(r.d), 1), 'calm_d': None if pd.isna(r.calm_d) else round(float(r.calm_d), 1)}
RES['coaches15'] = {'units': int(len(cw)), 'top': [crow(i, r) for i, r in cw.iloc[::-1][:5].iterrows()], 'bottom': [crow(i, r) for i, r in cw.iloc[:5].iterrows()]}
# stadiums 15+
sw = W.groupby('stadium_id').agg(name=('game_stadium', 'last'), n=('is_go', 'size'), go=('is_go', 'mean'), e=('eis_go', 'mean'), pu=('is_punt', 'mean'), ep=('eis_punt', 'mean'), ki=('is_kick', 'mean'), ek=('eis_kick', 'mean'))
sw = sw[sw.n >= 30].copy(); sw['d'] = 100 * (sw.go - sw.e); sw['dk'] = 100 * (sw.ki - sw.ek); sw = sw.sort_values('d')
RES['stadiums15'] = [{'stadium': r['name'], 'n': int(r.n), 'go_d': round(float(r.d), 1), 'kick_d': round(float(r.dk), 1)} for _, r in sw.iterrows()]
print(json.dumps(RES, indent=1, ensure_ascii=False)); json.dump(RES, open(OUT, 'w'), indent=1, ensure_ascii=False)
