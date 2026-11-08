# Pattern hunt 32 (Nov 7, 2026 — 2:15 pm: "for things like the wemby one you need to see the lineups and if players were missing or they had
# their full teams … if there's one player that when they are on the floor with wemby he gets worse … tested in all ways"). STUDY ONLY.
# Box scores (sportsdataverse, flagged) show who played each game, not who was on the floor together, so this is game-level: the same idea as
# the scout reports' "When he's out". Prediction first (rule 12): tags from earlier seasons only, scored on the season after.
# Usage: python3 hunt32.py BOX_DIR
#  W1 stopper pairs: scorer X vs one opposing regular D. X's points per 36 (beyond his own norm) in games D played 20+ minutes minus games
#     D missed, from earlier seasons (3+ with, 2+ without). Tagged as X's stopper (bottom 15%) → next season, X's games with D playing:
#     points per 36 beyond his norm and that team's usual defense, vs the same for untagged pairs
#  W2 toughest TEAM, full strength only: the hunt-18 matchup counted only in games where the opponent's top-5 minutes players all played
#  W3 full strength vs short-handed: a team's margin beyond its ratings when one of its top-3 minutes players misses, tagged by how much it
#     dropped in earlier seasons (teams that fall apart without a star) → that season's games without one
import sys, os, numpy as np, pandas as pd
from scipy import stats
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import lsqr

D = sys.argv[1]; OUT = []
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
    say(f'== {lg.upper()}')
    # W1 stopper pairs
    S = B[B.minutes >= 10].copy(); S['p36'] = 36 * S.points / S.minutes
    S['own'] = S.groupby(['season', 'athlete_id']).p36.transform('mean'); S = S[S.groupby(['season', 'athlete_id']).p36.transform('size') >= 20]
    S['dav'] = S.groupby(['season', 'opponent_team_id']).p36.transform('mean') - S.groupby('season').p36.transform('mean')
    S['x'] = S.p36 - S.own; S['xd'] = S.x - S.dav
    S = S[S.own >= (14 if lg == 'nba' else 12)]               # scorers
    rows = []
    R = reg.groupby(['season', 'team_id']).athlete_id.apply(list).to_dict()
    for r in S[['game_id', 'season', 'athlete_id', 'opponent_team_id', 'x', 'xd']].itertuples(index=False):
        regs = R.get((r.season, r.opponent_team_id), []); o = on.get((r.game_id, r.opponent_team_id), set())
        for d in regs: rows.append((r.athlete_id, d, r.season, d in o, r.x, r.xd))
    W = pd.DataFrame(rows, columns=['x_id', 'd_id', 'season', 'd_on', 'x', 'xd'])
    agg = W.groupby(['x_id', 'd_id', 'season', 'd_on']).x.agg(['sum', 'size']).unstack('d_on', fill_value=0)
    agg.columns = [f'{a}_{"on" if b else "off"}' for a, b in agg.columns]; agg = agg.reset_index()
    tagged, rest, kept, ntg = [], [], 0, 0
    for s in sorted(W.season.unique())[2:]:
        pr = agg[(agg.season < s) & (agg.season >= s - 3)].groupby(['x_id', 'd_id'])[['sum_on', 'size_on', 'sum_off', 'size_off']].sum()
        pr = pr[(pr.size_on >= 3) & (pr.size_off >= 2)]
        if len(pr) < 30: continue
        dif = pr.sum_on / pr.size_on - pr.sum_off / pr.size_off; cut = dif.quantile(.15); tagset = set(dif.index[dif <= cut])
        now = W[(W.season == s) & W.d_on]; key = list(zip(now.x_id, now.d_id)); m = np.array([k in tagset for k in key]); known = np.array([k in dif.index for k in key])
        a = now[m]; b = now[known & ~m]; tagged.append(a); rest.append(b)
        g = a.groupby(['x_id', 'd_id']).xd.mean(); kept += int((g < b.xd.mean()).sum()); ntg += len(g)
    A, Bb = pd.concat(tagged), pd.concat(rest); t, p = stats.ttest_ind(A.xd, Bb.xd, equal_var=False)
    say(f'W1 stopper pairs (a defender whose presence cut a scorer\'s points in earlier seasons, bottom 15%) → next season with him playing: '
        f'{A.xd.mean():+.2f} points per 36 beyond the scorer\'s norm and the team\'s usual defense vs {Bb.xd.mean():+.2f} for other pairs → {A.xd.mean() - Bb.xd.mean():+.2f} '
        f'(p {p:.2g}, {A.groupby(["x_id", "d_id"]).ngroups} pairs, {len(A)} games) · tagged pairs that stayed below: {kept} of {ntg}')
    # W2 toughest team, full strength only
    top5 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(5).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
    S['full'] = [top5.get((s, o), set()) <= on.get((g, o), set()) for g, s, o in zip(S.game_id, S.season, S.opponent_team_id)]
    F = S[S.full]; pair = F.groupby(['athlete_id', 'opponent_team_id', 'season']).xd.agg(['sum', 'size']).reset_index()
    res, k2, n2 = [], 0, 0
    for s in sorted(pair.season.unique())[2:]:
        w = pair[(pair.season < s) & (pair.season >= s - 3)].groupby(['athlete_id', 'opponent_team_id'])[['sum', 'size']].sum(); w = w[w['size'] >= 2]
        if not len(w): continue
        m = w['sum'] / w['size']; tg_ = m.index[m <= m.quantile(.15)]
        now = pair[pair.season == s].set_index(['athlete_id', 'opponent_team_id']); a = (now['sum'] / now['size']).reindex(tg_).dropna(); res.append(a)
        k2 += int((a < 0).sum()); n2 += len(a)
    a = pd.concat(res); t, p = stats.ttest_1samp(a, 0)
    say(f'W2 toughest team, counted only when that team had its top 5 → next season vs them at full strength: {a.mean():+.2f} points per 36 beyond his norm and the defense '
        f'(p {p:.2g}, {len(a)} pairs) · kept the tough side: {k2} of {n2} ({k2 / max(n2, 1):.0%}) [all games, hunt 30: toughest −0.08 NBA / −0.23 college]')
    # W3 teams that fall apart without a star
    G = tg.merge(B.drop_duplicates(['game_id', 'team_id'])[['game_id', 'team_id', 'home_away', 'team_score', 'opponent_team_score']], on=['game_id', 'team_id']).dropna()
    G = G.rename(columns={'team_id': 'team', 'opponent_team_id': 'opp'}); G['home'] = np.where(G.home_away == 'home', 1.0, 0.0); G['margin'] = G.team_score - G.opponent_team_score
    Rt = ratings(G); G['exp'] = [Rt.get((s, t), 0) - Rt.get((s, o), 0) + (Rt.get((s, '_home'), 0) if h else -Rt.get((s, '_home'), 0)) for s, t, o, h in zip(G.season, G.team, G.opp, G.home)]
    G['x'] = G.margin - G.exp
    top3 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(3).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
    G['short'] = [not (top3.get((s, t), set()) <= on.get((g, t), set())) if top3.get((s, t)) else False for g, s, t in zip(G.game_id, G.season, G.team)]
    ts = G.groupby(['team', 'season', 'short']).x.agg(['mean', 'size']).unstack('short')
    ts = ts.dropna(); ts = ts[(ts[('size', True)] >= 5) & (ts[('size', False)] >= 10)]; drop = (ts[('mean', True)] - ts[('mean', False)]).rename('drop').reset_index()
    res, k3, n3 = [], 0, 0
    for s in sorted(G.season.unique())[1:]:
        pr = drop[drop.season == s - 1].set_index('team')['drop']
        if len(pr) < 10: continue
        tg_ = pr.index[pr <= pr.quantile(.15)]; now = G[(G.season == s) & G.short & G.team.isin(tg_)]; other = G[(G.season == s) & G.short & G.team.isin(pr.index) & ~G.team.isin(tg_)]
        res.append((now.x, other.x)); m = now.groupby('team').x.mean(); k3 += int((m < other.x.mean()).sum()); n3 += len(m)
    A3 = pd.concat([r[0] for r in res]); B3 = pd.concat([r[1] for r in res]); t, p = stats.ttest_ind(A3, B3, equal_var=False)
    say(f'W3 teams that fell apart without a top-3 player last season → this season\'s short-handed games: {A3.mean():+.2f} points beyond their ratings vs {B3.mean():+.2f} '
        f'for other short-handed teams → {A3.mean() - B3.mean():+.2f} (p {p:.2g}, {len(A3)} games) · tagged teams that did it again: {k3} of {n3}')
