# Outliers for the study book from pattern hunt 32 (Nov 22, 2026 — outliers on both sides of every test). STUDY ONLY. Same data and
# steps as hunt32.py (W2 and W3), plus the names: the pairs (scorer vs team, full strength) that kept or lost the tough side, and the teams
# that fell apart without a top-3 player again or held up. Usage: python3 outliers_hunt32.py BOX_DIR OUT.json
import sys, os, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

import json
D = sys.argv[1]; OUT = []; RES = {}
def say(s): OUT.append(s); print(s, flush=True)
def ratings(G):
    out = {}
    for s, g in G.groupby('season'):
        t = sorted(set(g.team) | set(g.opp)); ix = {x: i for i, x in enumerate(t)}; n = len(g)
        A = coo_matrix((np.r_[np.ones(n), -np.ones(n), g.home.values], (np.r_[np.arange(n), np.arange(n), np.arange(n)],
                        np.r_[[ix[x] for x in g.team], [ix[x] for x in g.opp], np.full(n, len(t))])), shape=(n, len(t) + 1)).tocsr()
        x = lsqr(A, g.margin.values)[0]; out.update({(s, k): x[i] for k, i in ix.items()}); out[(s, '_home')] = x[-1]
    return out

for lg in ('nba', 'mbb'):
    RL = RES.setdefault(lg, {})
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2].copy()
    for c in ['minutes', 'points', 'team_score', 'opponent_team_score']: B[c] = pd.to_numeric(B[c], errors='coerce')
    B['minutes'] = B.minutes.fillna(0); B['played'] = B.minutes > 0
    # who belongs to each team-season (on a box score for that team), regulars = 20+ min a game when playing, 20+ games
    reg = B[B.played].groupby(['season', 'team_id', 'athlete_id']).agg(mpg=('minutes', 'mean'), gp=('minutes', 'size')).reset_index()
    reg = reg[(reg.mpg >= 20) & (reg.gp >= 20)]
    tg = B.drop_duplicates(['game_id', 'team_id'])[['game_id', 'season', 'team_id', 'opponent_team_id']]
    # for every team-game: which regulars played 20+ minutes
    on = B[B.minutes >= 20].groupby(['game_id', 'team_id']).athlete_id.apply(set)
    say(f'== {lg.upper()}'); NMp = B.groupby('athlete_id').athlete_display_name.last(); NMt = (B.groupby('team_id').team_display_name.last() if lg == 'nba' else B.groupby('team_id').team_location.last())
    # W1 scorer setup (from hunt32.py)
    S = B[B.minutes >= 10].copy(); S['p36'] = 36 * S.points / S.minutes
    S['own'] = S.groupby(['season', 'athlete_id']).p36.transform('mean'); S = S[S.groupby(['season', 'athlete_id']).p36.transform('size') >= 20]
    S['dav'] = S.groupby(['season', 'opponent_team_id']).p36.transform('mean') - S.groupby('season').p36.transform('mean')
    S['x'] = S.p36 - S.own; S['xd'] = S.x - S.dav
    S = S[S.own >= (14 if lg == 'nba' else 12)]               # scorers
    # W2 toughest team, full strength only
    top5 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(5).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
    S['full'] = [top5.get((s, o), set()) <= on.get((g, o), set()) for g, s, o in zip(S.game_id, S.season, S.opponent_team_id)]
    F = S[S.full]; pair = F.groupby(['athlete_id', 'opponent_team_id', 'season']).xd.agg(['sum', 'size']).reset_index()
    res, k2, n2, named = [], 0, 0, []
    for s in sorted(pair.season.unique())[2:]:
        w = pair[(pair.season < s) & (pair.season >= s - 3)].groupby(['athlete_id', 'opponent_team_id'])[['sum', 'size']].sum(); w = w[w['size'] >= 2]
        if not len(w): continue
        m = w['sum'] / w['size']; tg_ = m.index[m <= m.quantile(.15)]
        now = pair[pair.season == s].set_index(['athlete_id', 'opponent_team_id']); a = (now['sum'] / now['size']).reindex(tg_).dropna(); res.append(a)
        k2 += int((a < 0).sum()); n2 += len(a)
        for (pid, oid), v in a.items(): named.append([NMp.get(pid, str(pid)), NMt.get(oid, str(oid)), int(s), round(float(m[(pid, oid)]), 1), int(w.loc[(pid, oid), 'size']), round(float(v), 1), int(now.loc[(pid, oid), 'size'])])
    a = pd.concat(res); t, p = stats.ttest_1samp(a, 0)
    say(f'W2 toughest team, counted only when that team had its top 5 → next season vs them at full strength: {a.mean():+.2f} points per 36 beyond his norm and the defense '
        f'(p {p:.2g}, {len(a)} pairs) · kept the tough side: {k2} of {n2} ({k2 / max(n2, 1):.0%}) [all games, hunt 30: toughest −0.08 NBA / −0.23 college]')
    nd = pd.DataFrame(named, columns=['player', 'team', 'season', 'before', 'g_before', 'next', 'g_next']); nd = nd[nd.g_next >= 2]
    RL['tough'] = {'pairs': int(len(a)), 'mean_next': round(float(a.mean()), 2), 'kept': k2, 'n': n2, 'kept_names': nd.assign(k=np.maximum(nd.before, nd.next)).sort_values('k').head(8).drop(columns='k').values.tolist(), 'flipped': nd.sort_values('next', ascending=False).head(5).values.tolist()}
    # W3 teams that fall apart without a star
    G = tg.merge(B.drop_duplicates(['game_id', 'team_id'])[['game_id', 'team_id', 'home_away', 'team_score', 'opponent_team_score']], on=['game_id', 'team_id']).dropna()
    G = G.rename(columns={'team_id': 'team', 'opponent_team_id': 'opp'}); G['home'] = np.where(G.home_away == 'home', 1.0, 0.0); G['margin'] = G.team_score - G.opponent_team_score
    Rt = ratings(G); G['exp'] = [Rt.get((s, t), 0) - Rt.get((s, o), 0) + (Rt.get((s, '_home'), 0) if h else -Rt.get((s, '_home'), 0)) for s, t, o, h in zip(G.season, G.team, G.opp, G.home)]
    G['x'] = G.margin - G.exp
    top3 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(3).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
    G['short'] = [not (top3.get((s, t), set()) <= on.get((g, t), set())) if top3.get((s, t)) else False for g, s, t in zip(G.game_id, G.season, G.team)]
    ts = G.groupby(['team', 'season', 'short']).x.agg(['mean', 'size']).unstack('short')
    ts = ts.dropna(); ts = ts[(ts[('size', True)] >= 5) & (ts[('size', False)] >= 10)]; drop = (ts[('mean', True)] - ts[('mean', False)]).rename('drop').reset_index()
    res, k3, n3, named3 = [], 0, 0, []
    for s in sorted(G.season.unique())[1:]:
        pr = drop[drop.season == s - 1].set_index('team')['drop']
        if len(pr) < 10: continue
        tg_ = pr.index[pr <= pr.quantile(.15)]; now = G[(G.season == s) & G.short & G.team.isin(tg_)]; other = G[(G.season == s) & G.short & G.team.isin(pr.index) & ~G.team.isin(tg_)]
        res.append((now.x, other.x)); m = now.groupby('team').x.agg(['mean', 'size']); k3 += int((m['mean'] < other.x.mean()).sum()); n3 += len(m)
        for t_, r_ in m.iterrows(): named3.append([NMt.get(t_, str(t_)), int(s), round(float(pr[t_]), 1), round(float(r_['mean'] - other.x.mean()), 1), int(r_['size'])])
    A3 = pd.concat([r[0] for r in res]); B3 = pd.concat([r[1] for r in res]); t, p = stats.ttest_ind(A3, B3, equal_var=False)
    say(f'W3 teams that fell apart without a top-3 player last season → this season\'s short-handed games: {A3.mean():+.2f} points beyond their ratings vs {B3.mean():+.2f} '
        f'for other short-handed teams → {A3.mean() - B3.mean():+.2f} (p {p:.2g}, {len(A3)} games) · tagged teams that did it again: {k3} of {n3}')
    n3d = pd.DataFrame(named3, columns=['team', 'season', 'drop_before', 'next_vs_others', 'games']); n3d = n3d[n3d.games >= 5]
    RL['short'] = {'teams': n3, 'again': k3, 'gap': round(float(A3.mean() - B3.mean()), 2), 'again_names': n3d.sort_values('next_vs_others').head(6).values.tolist(), 'held_up': n3d.sort_values('next_vs_others', ascending=False).head(5).values.tolist()}
json.dump(RES, open(sys.argv[2], 'w'), indent=1); print('saved')
