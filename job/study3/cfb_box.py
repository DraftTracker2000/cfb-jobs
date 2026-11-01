# Pattern hunt 3 — college "QB killers" and position-killer defenses, from CFBD box scores (/games/players, every FBS week). STUDY ONLY.
# Same measure as the NFL rounds: each game, the opposing player's number minus HIS OWN average in his other games that season (4+
# games), summed over the opponent's players at that position; the defense-season number is the average over its games.
#  K01 QB killers (opposing QBs' yards per attempt vs their own) repeat; same coach vs new head coach; named head coaches
#  K02 WR killers (receiving yards)   K03 TE killers   K04 RB-receiving killers   K05 run defense (rushing yards beyond carries x own YPC)
#  K06 sack defenses (sacks per game beyond the opponent's own sacks allowed)   K07 interception defenses (picks beyond the QB's own rate)
import numpy as np, pandas as pd
from lib3 import *
from load import answers, year_of

def box():
    rows = []
    for path, L in answers('cf_box'):
        y = year_of(path); post = 'postseason' in path
        for r in L or []:
            gid, team, conf, ha, pts, aid, name, s = r
            if str(aid).startswith('-'): continue
            rows.append((gid, y, post, team, conf, ha, str(aid), name, s))
    B = pd.DataFrame(rows, columns=['game_id', 'season', 'post', 'team', 'conf', 'ha', 'pid', 'name', 's'])
    f = lambda k: pd.to_numeric(B.s.map(lambda d: (d or {}).get(k)), errors='coerce')
    ca = B.s.map(lambda d: (d or {}).get('passing.C/ATT'))
    B['att'] = pd.to_numeric(ca.map(lambda v: str(v).split('/')[-1] if v else None), errors='coerce')
    for k, c in [('passing.YDS', 'pyds'), ('passing.INT', 'int'), ('rushing.CAR', 'car'), ('rushing.YDS', 'ryds'), ('receiving.YDS', 'recyds'),
                 ('receiving.REC', 'rec'), ('defensive.SACKS', 'sacks')]: B[c] = f(k)
    B = B.drop(columns='s')
    opp = B.drop_duplicates(['game_id', 'team'])[['game_id', 'team', 'conf']]
    o2 = opp.merge(opp, on='game_id', suffixes=('', '_o')); o2 = o2[o2.team != o2.team_o]
    B = B.merge(o2[['game_id', 'team', 'team_o', 'conf_o']], on=['game_id', 'team'], how='left')
    return B

def run(reg, log, G, T, CO, TS, P):
    B = box(); log(f'box: {len(B)} player-games, {B.game_id.nunique()} games, seasons {B.season.min()}-{B.season.max()}')
    pos = P.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None)
    B['grp'] = B.pid.map(pos)
    B = B[~B.post & B.conf.notna() & B.conf_o.notna()]
    co = CO.set_index(['team', 'season']).coach
    def own(d, num, den=None, min_g=4):
        k = ['pid', 'season', 'team']; sn = d.groupby(k)[num].transform('sum'); n = d.groupby(k)[num].transform('count')
        if den is None: return ((d[num] - (sn - d[num]) / (n - 1))).where(n >= min_g)
        sd = d.groupby(k)[den].transform('sum'); return (d[num] - d[den] * (sn - d[num]) / (sd - d[den])).where((n >= min_g) & (sd - d[den] > 0))
    def killer(hyp, label, rows, val, w=None, named_coach=True, unit=''):
        rows = rows.dropna(subset=[val])
        if w is None: g = rows.groupby(['game_id', 'season', 'team_o'])[val].sum().rename('v').reset_index()
        else:
            g = rows.groupby(['game_id', 'season', 'team_o'])[[val, w]].sum().reset_index(); g['v'] = g[val] / g[w].replace(0, np.nan); g = g.dropna(subset=['v'])
        g = g.rename(columns={'team_o': 'defteam'})
        S = g.groupby(['season', 'defteam']).v.mean().reset_index(); S['coach'] = [co.get((t, s)) for t, s in zip(S.defteam, S.season)]
        o = yoy(S, 'defteam', 'v'); d = reg_yoy(reg, hyp, label, o)
        nx = S.copy(); nx['season'] -= 1; j = S.merge(nx, on=['defteam', 'season'], suffixes=('', '_n')).dropna(subset=['v', 'v_n'])
        same = rtest(j[j.coach == j.coach_n].v, j[j.coach == j.coach_n].v_n); new = rtest(j[j.coach != j.coach_n].v, j[j.coach != j.coach_n].v_n)
        reg.add(hyp, label + ' — repeats under a NEW head coach (r)', 'family', new[0], np.nan, new[1], new[2], oos_pass=bool(np.isfinite(new[0]) and new[0] > 0),
                detail=f'same coach r = {same[0]:.3f} ({same[2]}); new coach r = {new[0]:.3f} ({new[2]})', unit='r')
        log(f'{hyp} {label}: SD {S.v.std():.3f}; {d}; same coach {same[0]:.3f}, new coach {new[0]:.3f} ({new[2]})')
        if named_coach:
            g['coach'] = [co.get((t, s)) for t, s in zip(g.defteam, g.season)]
            Tn, fam = named(reg, hyp, label + ' (head coach)', g.dropna(subset=['coach']), 'coach', 'v', min_seasons=6, unit=unit)
            if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'late', 'oos', 'loo']].round(3).to_string())
        return S
    q = B[(B.att >= 10)].copy(); q['over'] = own(q, 'pyds', 'att')
    killer('K01', 'College QB killer (opposing QBs\' yards per attempt vs their own)', q, 'over', w='att', unit='yards/att')
    q['iover'] = own(q, 'int', 'att')
    killer('K07', 'Interception defense (picks beyond the QB\'s own rate, per game)', q, 'iover', named_coach=False, unit='INT/game')
    for hyp, gg, lab in [('K02', 'WR', 'WR killer (opposing WRs\' receiving yards vs their own)'), ('K03', 'TE', 'TE killer (opposing TEs\' receiving yards vs their own)'),
                         ('K04', 'RB', 'RB-receiving killer (opposing RBs\' receiving yards vs their own)')]:
        x = B[B.grp == gg].copy(); x['over'] = own(x, 'recyds')
        killer(hyp, lab, x, 'over', named_coach=hyp != 'K03', unit='yards/game')
    x = B[(B.grp == 'RB') & (B.car >= 3)].copy(); x['over'] = own(x, 'ryds', 'car')
    killer('K05', 'Run defense (opposing RBs\' rushing yards beyond carries x own YPC, per carry)', x, 'over', w='car', unit='yards/carry')
    # K06 sacks: team sacks in a game beyond the opponent's own sacks allowed in its other games
    sk = B.groupby(['game_id', 'season', 'team', 'team_o']).sacks.sum().reset_index()
    al = sk.groupby(['season', 'team_o']).sacks.agg(['sum', 'count']).rename(columns={'sum': 'as', 'count': 'ag'})
    sk = sk.join(al, on=['season', 'team_o']); sk['v'] = sk.sacks - (sk['as'] - sk.sacks) / (sk.ag - 1)
    S = sk[sk.ag >= 6].groupby(['season', 'team']).v.mean().rename('v').reset_index()
    o = yoy(S, 'team', 'v'); log('K06 ' + reg_yoy(reg, 'K06', 'Sack defense (sacks per game beyond the opponent\'s own sacks allowed)', o))
    return B
