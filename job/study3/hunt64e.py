# Hunt 64 part E2 (Nov 8, 2026 — the owner 12:32 pm: "there are probably some elite guys that carry even the WR1 matchups … the explosions that carry
# the weight on some or the JSNs, Pukas, and ARSBs that get fed no matter what. but the lowly wr1s i bet are effected … tee higgins are WR2s but
# other wr2s are also real bad … could be the same for the rb position. like i bet bijan does a lot lot more"). Prediction first (rule 12).
# Within each rank (WR1, WR2, RB1, RB2, TE1), players split by kind, all from before the game:
#   talent — his usual PPR (this season so far blended with last season, n/(n+3)): top quarter of his rank that week = elite, bottom quarter = low
#   fed — his share of the team's targets (carries for backs) so far: top quarter
#   explosive — his 20+ yard plays per catch (per carry for backs) so far: top quarter
# For each: the matchup reads (from earlier weeks, 4+ games) — points allowed to his rank, and yards a target / a carry allowed — lean hit and
# the toughest-vs-easiest gap in PPR vs his usual.
import sys, glob, numpy as np, pandas as pd
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(sys.argv[1] + '/w20*.csv'))]); W = W[W.season_type == 'REG'].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}
for c in ('team', 'opponent_team'): W[c] = W[c].replace(fix)
W['ppr'] = W.fantasy_points_ppr.fillna(0); CUR = int(W.season.max())
for c in ('targets', 'receptions', 'receiving_yards', 'carries', 'rushing_yards', 'receiving_20', 'rushing_20'): W[c] = W[c].fillna(0)
W = W[W.position.isin(['RB', 'WR', 'TE'])].sort_values(['season', 'week']).copy()
W['vol'] = np.where(W.position == 'RB', W.carries, W.targets); W['big'] = np.where(W.position == 'RB', W.rushing_20, W.receiving_20)
W['den'] = np.where(W.position == 'RB', W.carries, W.receptions)
W['cum'] = W.groupby(['player_id', 'season', 'team']).vol.cumsum() - W.vol
W['rank'] = W.groupby(['season', 'week', 'team', 'position']).cum.rank(ascending=False, method='first')
g = W.groupby(['player_id', 'season']); W['k'] = g.cumcount()
W['cur'] = (g.ppr.cumsum() - W.ppr) / W.k.replace(0, np.nan); W['diff'] = W.ppr - W.cur
last = W.groupby(['player_id', 'season']).ppr.mean(); W['prev'] = [last.get((p, s - 1), np.nan) for p, s in zip(W.player_id, W.season)]
w_ = W.k / (W.k + 3); W['tal'] = np.where(W.prev.notna(), w_ * W.cur + (1 - w_) * W.prev, W.cur)
tv = W.groupby(['season', 'week', 'team', 'position']).vol.transform('sum')  # team volume that week at the position (rough share base)
W['tvol'] = W.groupby(['season', 'team']).vol.transform(lambda s: s)  # placeholder
team_vol = W.groupby(['season', 'week', 'team']).agg(tt=('targets', 'sum'), tc=('carries', 'sum')).reset_index().sort_values('week')
gt = team_vol.groupby(['season', 'team']); team_vol['tt0'] = gt.tt.cumsum() - team_vol.tt; team_vol['tc0'] = gt.tc.cumsum() - team_vol.tc
W = W.merge(team_vol[['season', 'week', 'team', 'tt0', 'tc0']], on=['season', 'week', 'team'])
W['share'] = W.cum / np.where(W.position == 'RB', W.tc0, W.tt0).clip(min=1)
W['bigr'] = (g.big.cumsum().reindex(W.index) if False else 0)
W = W.sort_values(['player_id', 'season', 'week']); g2 = W.groupby(['player_id', 'season'])
W['bigr'] = (g2.big.cumsum() - W.big) / (g2.den.cumsum() - W.den).replace(0, np.nan)
def prior(df, key, cols):
    df = df.sort_values('week'); gg = df.groupby(['season', key]); out = df[['season', 'week', key]].copy(); out['n'] = gg.cumcount()
    for c in cols: out[c] = (gg[c].cumsum() - df[c]) / out.n.replace(0, np.nan)
    return out
res = []
for pos, ranks in (('WR', [1, 2]), ('RB', [1, 2]), ('TE', [1])):
    P = W[W.position == pos]
    allp = P.groupby(['season', 'week', 'opponent_team']).agg(tg=('targets', 'sum'), ry=('receiving_yards', 'sum'), car=('carries', 'sum'), rush=('rushing_yards', 'sum')).reset_index()
    A = prior(allp, 'opponent_team', ['tg', 'ry', 'car', 'rush']); A['eff'] = (A.rush / A.car) if pos == 'RB' else (A.ry / A.tg)
    for r in ranks:
        Rr = P[P['rank'] == r]
        rk = Rr.groupby(['season', 'week', 'opponent_team']).agg(rk_ppr=('ppr', 'sum')).reset_index(); Rk = prior(rk, 'opponent_team', ['rk_ppr'])
        X = Rr[(Rr.k >= 3) & (Rr.cur >= 4)].merge(A[['season', 'week', 'opponent_team', 'n', 'eff']], on=['season', 'week', 'opponent_team']).merge(Rk.drop(columns='n'), on=['season', 'week', 'opponent_team'])
        X = X[X.n >= 4].copy()
        for c in ('tal', 'share', 'bigr'): X['q_' + c] = X.groupby(['season', 'week'])[c].rank(pct=True)
        for read, lab in (('rk_ppr', f'points allowed to {pos}{r}s'), ('eff', 'yards a carry allowed' if pos == 'RB' else 'yards a target allowed')):
            X['qr'] = X.groupby(['season', 'week'])[read].rank(pct=True)
            def score(Y):
                lo, hi = Y[Y.qr <= .2], Y[Y.qr >= .8]
                if len(lo) + len(hi) < 30: return '—'
                h = np.r_[(lo['diff'] < 0).values, (hi['diff'] > 0).values].mean()
                return f'{100 * h:.1f}% of {len(lo) + len(hi)} (gap {hi["diff"].mean() - lo["diff"].mean():+.1f})'
            line = [f'{pos}{r} · {lab}: all {score(X)}']
            for c, nm in (('tal', 'talent'), ('share', 'fed'), ('bigr', 'explosive')):
                line.append(f'{nm}: top quarter {score(X[X["q_" + c] >= .75])} | middle {score(X[(X["q_" + c] > .25) & (X["q_" + c] < .75)])} | bottom quarter {score(X[X["q_" + c] <= .25])}')
            line.append(f'{CUR}: top-talent {score(X[(X.q_tal >= .75) & (X.season == CUR)])} · bottom {score(X[(X.q_tal <= .25) & (X.season == CUR)])}')
            res.append('\n   '.join(line))
print('\n'.join(res))

# ---- each player's own matchup swing: does it carry into the next season? (rule 12 — tag from one season, score the next) ----
print('\nPlayer by player: his swing = PPR vs his usual against the easiest 40% of defenses minus against the toughest 40% (points allowed to his position)')
out = []
for pos in ('WR', 'RB', 'TE'):
    P = W[W.position == pos]
    allp = P.groupby(['season', 'week', 'opponent_team']).ppr.sum().rename('al').reset_index(); A = prior(allp, 'opponent_team', ['al'])
    X = P[(P.k >= 3) & (P.cur >= 6)].merge(A, on=['season', 'week', 'opponent_team']); X = X[X.n >= 4].copy()
    X['qr'] = X.groupby(['season', 'week']).al.rank(pct=True)
    sw = X.assign(e=X.qr >= .6, t=X.qr <= .4).groupby(['player_id', 'season']).apply(lambda d: pd.Series({'sw': d[d.e]['diff'].mean() - d[d.t]['diff'].mean(), 'n_e': d.e.sum(), 'n_t': d.t.sum(), 'name': d.player_display_name.iat[0]}))
    sw = sw[(sw.n_e >= 3) & (sw.n_t >= 3)].reset_index(); nx = sw.copy(); nx['season'] -= 1
    M = sw.merge(nx, on=['player_id', 'season'], suffixes=('', '_n'))
    r = np.corrcoef(M.sw, M.sw_n)[0, 1]
    top = M[M.sw >= M.sw.quantile(.8)]; bot = M[M.sw <= M.sw.quantile(.2)]
    out.append(f'{pos}: {len(M)} player pairs · r {r:.3f} · the biggest swings (top 20%: {top.sw.mean():+.1f}) next season {top.sw_n.mean():+.1f} · the matchup-proof (bottom 20%: {bot.sw.mean():+.1f}) next season {bot.sw_n.mean():+.1f} · everyone {M.sw_n.mean():+.1f}')
    cur = sw[sw.season == CUR].sort_values('sw', ascending=False)
    out.append(f'   {CUR} so far, biggest swings: ' + ', '.join(f'{n} {v:+.1f}' for n, v in zip(cur.name.head(6), cur.sw.head(6))) + ' · least: ' + ', '.join(f'{n} {v:+.1f}' for n, v in zip(cur.name.tail(4), cur.sw.tail(4))))
print('\n'.join(out))
