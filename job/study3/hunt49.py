# Pattern hunt 49 (Nov 7, 2026): football player projections, prediction first (rule 12). STUDY ONLY. nflverse weekly stats + play-by-play.
# Usage: python3 hunt49.py SCRATCH
#  F1 the WR1 is out: other receivers' targets that game. Baseline = his average targets in the season's earlier games. + everyone's usual
#     bump when the WR1 sits; + his own earlier bump without that WR1 (weighted n/(n+K)). K on 2015–2020, error on 2021–2025.
#  F2 a backup QB starts: receivers' PPR points. Baseline = his earlier average this season; + the usual change; + his own history.
#  F3 touchdowns from roles: a player's TDs a game next season from (a) his TDs a game this season, (b) his share of the team's red-zone
#     touches (inside the 20) this season × the team's red-zone touches, (c) both. Error next season.
import sys, glob, numpy as np, pandas as pd
S = sys.argv[1]
W = pd.concat([pd.read_csv(f, low_memory=False) for f in sorted(glob.glob(S + '/nflw/w20*.csv'))], ignore_index=True); W = W[W.season_type == 'REG'].copy()
fix = {'STL': 'LA', 'SD': 'LAC', 'OAK': 'LV'}; W['team'] = W.team.replace(fix)
W['ppr'] = W.receptions.fillna(0) + W.receiving_yards.fillna(0) / 10 + 6 * W.receiving_tds.fillna(0)
W = W.sort_values(['season', 'week'])
def tune_report(lab, d, base, pool, own, n):
    tr, te = d[d.season <= 2020], d[d.season >= 2021]
    def err(x, K, usepool=True):
        p = x[base] + (x[pool] if usepool else 0) + x[n] / (x[n] + K) * (x[own] - (x[pool] if usepool else 0)); return np.sqrt(((x.y - p) ** 2).mean())
    K = min([1, 2, 4, 8, 16, 32, 64], key=lambda K: err(tr, K))
    e0 = np.sqrt(((te.y - te[base]) ** 2).mean()); e1 = np.sqrt(((te.y - te[base] - te[pool]) ** 2).mean()); e2 = err(te, K)
    print(f'{lab}: error {e0:.3f} baseline → {e1:.3f} with the usual change ({100 * (e0 - e1) / e0:+.1f}%) → {e2:.3f} adding his own history, K {K} ({100 * (e0 - e2) / e0:+.1f}% in all) · '
          f'{len(te)} player-games (2021–2025) · average change {(te.y - te[base]).mean():+.2f}', flush=True)
# F1
R = W[W.position.isin(['WR', 'TE', 'RB'])].copy(); R['targets'] = R.targets.fillna(0)
tot = R.groupby(['season', 'team', 'player_id']).targets.sum().reset_index()
wr1 = tot[R.groupby(['season', 'team', 'player_id']).position.first().reindex(list(zip(tot.season, tot.team, tot.player_id))).values == 'WR'].sort_values('targets').drop_duplicates(['season', 'team'], keep='last')
wr1 = wr1.set_index(['season', 'team']).player_id.to_dict()
played = set(zip(W.season, W.week, W.player_id)); weeks = W.groupby(['season', 'team']).week.apply(set).to_dict()
R['wr1'] = [wr1.get((s, t)) for s, t in zip(R.season, R.team)]
R['wr1_out'] = [w is not None and (s, wk, w) not in played and p != w for s, wk, w, p in zip(R.season, R.week, R.wr1, R.player_id)]
key = [R.season, R.player_id]; R['base'] = (R.targets.groupby(key).cumsum() - R.targets) / R.groupby(key).cumcount().replace(0, np.nan)
R = R[R.base.notna() & (R.groupby(key).cumcount() >= 3)]
O = R[R.wr1_out].copy(); O['y'] = O.targets; O['x'] = O.y - O.base
O['pool'] = O.groupby('season').x.transform('mean')
k2 = [O.player_id, O.wr1]; cs = O.x.groupby(k2).cumsum() - O.x; cn = O.x.groupby(k2).cumcount(); O['own'] = np.where(cn > 0, cs / cn.replace(0, 1), O.pool); O['n'] = cn
tune_report('F1 targets when the WR1 sits', O, 'base', 'pool', 'own', 'n')
# F2 backup QB
Q = W[W.position == 'QB'].sort_values('attempts').drop_duplicates(['season', 'week', 'team'], keep='last')[['season', 'week', 'team', 'player_id']].rename(columns={'player_id': 'qb'})
main = Q.groupby(['season', 'team']).qb.agg(lambda s: s.value_counts().index[0]).to_dict()
R2 = W[W.position.isin(['WR', 'TE', 'RB'])].merge(Q, on=['season', 'week', 'team'], how='inner')
R2['backup'] = [q != main.get((s, t)) for q, s, t in zip(R2.qb, R2.season, R2.team)]
key = [R2.season, R2.player_id]; R2['base'] = (R2.ppr.groupby(key).cumsum() - R2.ppr) / R2.groupby(key).cumcount().replace(0, np.nan)
R2 = R2[R2.base.notna() & (R2.groupby(key).cumcount() >= 3)]
B2 = R2[R2.backup].copy(); B2['y'] = B2.ppr; B2['x'] = B2.y - B2.base; B2['pool'] = B2.groupby('season').x.transform('mean')
k2 = [B2.player_id]; cs = B2.x.groupby(k2).cumsum() - B2.x; cn = B2.x.groupby(k2).cumcount(); B2['own'] = np.where(cn > 0, cs / cn.replace(0, 1), B2.pool); B2['n'] = cn
tune_report('F2 receivers\' PPR with a backup QB starting', B2, 'base', 'pool', 'own', 'n')
# F3 touchdowns from red-zone roles
cols = ['season', 'season_type', 'posteam', 'yardline_100', 'play_type', 'rusher_player_id', 'receiver_player_id', 'rush_touchdown', 'pass_touchdown', 'touchdown']
P = pd.concat([pd.read_csv(f, usecols=cols, low_memory=False) for f in sorted(glob.glob(S + '/pbp/p20*.csv.gz'))], ignore_index=True)
P = P[(P.season_type == 'REG') & P.play_type.isin(['run', 'pass'])].copy(); P['posteam'] = P.posteam.replace(fix)
P['pid'] = P.rusher_player_id.fillna(P.receiver_player_id); P = P[P.pid.notna()]
P['td'] = np.where(P.play_type == 'run', P.rush_touchdown, P.pass_touchdown).astype(float)
pl = P.groupby(['season', 'posteam', 'pid']).agg(td=('td', 'sum'), rz=('yardline_100', lambda s: (s <= 20).sum())).reset_index()
gp = W.groupby(['season', 'player_id']).week.nunique(); pl['gp'] = [gp.get((s, p), np.nan) for s, p in zip(pl.season, pl.pid)]; pl = pl[pl.gp >= 6]
team_rz = P[P.yardline_100 <= 20].groupby(['season', 'posteam']).size(); pl['share'] = pl.rz / [team_rz.get((s, t), np.nan) for s, t in zip(pl.season, pl.posteam)]
pl['tdg'] = pl.td / pl.gp; nxt = pl.groupby(['pid', 'season']).td.sum() / pl.groupby(['pid', 'season']).gp.max(); pl['y'] = [nxt.get((p, s + 1), np.nan) for p, s in zip(pl.pid, pl.season)]
lg_conv = (P[P.yardline_100 <= 20].td.sum() / (P.yardline_100 <= 20).sum()); team_rzg = (team_rz / P.groupby(['season', 'posteam']).size() * 0 + team_rz) / 17
pl['role'] = pl.share * [team_rz.get((s, t), np.nan) / 17 for s, t in zip(pl.season, pl.posteam)] * lg_conv * 1.0
d = pl.dropna(subset=['y', 'role', 'tdg']).astype({'y': float, 'role': float, 'tdg': float}); tr, te = d[d.season <= 2019], d[d.season >= 2020]
for lab, Xc in (('his TDs a game', ['tdg']), ('his red-zone role', ['role']), ('both', ['tdg', 'role'])):
    X = np.column_stack([np.ones(len(tr))] + [tr[c] for c in Xc]); b, *_ = np.linalg.lstsq(X, tr.y, rcond=None)
    Xt = np.column_stack([np.ones(len(te))] + [te[c] for c in Xc]); e = np.sqrt(((te.y - Xt @ b) ** 2).mean())
    print(f'F3 next season\'s TDs a game from {lab}: error {e:.4f} ({len(te)} players, 2021–2025 seasons predicted)', flush=True)
