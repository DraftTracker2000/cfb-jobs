# Hunt 76 (Nov 8, 2026 — the owner, 10:19 pm: "then the three point luck ok. and test it at the levels that compare and as a whole").
# STUDY ONLY. Men's college basketball, CBBD team box scores (bb_tgames), schedules (bb_games) and closing lines (bb_lines), 2015–2026.
# Hunt 73 found it against a rating built from earlier games (−1.6 pts for the luckiest 15%). Here against the closing line.
# Tag (known before tip-off): his opponents' three-point % in the team's earlier games this season (150+ attempts) minus the league's.
# Lucky = opponents shooting far under the league (best 15%); unlucky = far over (worst 15%). Outcome: the cover (margin + the team's line).
# Shown as a whole, by level (both teams power conference / both mid-major / both low-major / mixed), and by halves (2015–20, 2021–26).
import numpy as np, pandas as pd
from scipy import stats
from load import answers, frame, pick, num

POWER = {'ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East', 'Pac-12'}
MID = {'American Athletic', 'Mountain West', 'Atlantic 10', 'West Coast', 'Missouri Valley', 'Conference USA', 'Mid-American', 'Sun Belt', 'Colonial Athletic', 'WAC'}
def lev(c):
    c = str(c or '')
    return 'power' if c in POWER else 'mid' if c in MID or c.startswith('American') or c.startswith('Colonial') else 'low'

def three(d, side):
    for k in (f'{side}.threePointFieldGoals.made', f'{side}.threePointers.made'):
        if k in d: return d[k], d[k.replace('.made', '.attempted')]
    return np.nan, np.nan

def run(reg, log, D):
    rows = []
    for path, L in answers('bb_tgames'):
        for r in L or []:
            f = pd.json_normalize(r).iloc[0].to_dict() if isinstance(r, dict) else {}
            m, a = three(f, 'teamStats'); om, oa = three(f, 'opponentStats')
            rows.append((f.get('gameId'), f.get('season'), f.get('team'), f.get('conference'), f.get('opponent'), f.get('opponentConference'), f.get('isHome'), f.get('startDate'),
                         num(pd.Series([m])).iat[0], num(pd.Series([a])).iat[0], num(pd.Series([om])).iat[0], num(pd.Series([oa])).iat[0],
                         f.get('teamStats.points.total', f.get('teamStats.points')), f.get('opponentStats.points.total', f.get('opponentStats.points'))))
    T = pd.DataFrame(rows, columns=['gid', 'season', 'team', 'conf', 'opp', 'oconf', 'home', 'date', 'm3', 'a3', 'om3', 'oa3', 'pf', 'pa'])
    log(f'hunt76: {len(T)} team-games from the box scores, {T.season.min()}–{T.season.max()}; three-point tries found for {T.oa3.notna().mean():.2f}')
    T['pf'] = num(T.pf); T['pa'] = num(T.pa)
    # lines: the home team's spread (consensus, else the average of the books)
    l = frame('bb_lines', flat=False); sp = {}
    for gid, Ls in zip(pick(l, 'gameId', 'id'), pick(l, 'lines')):
        if not isinstance(Ls, list) or not Ls: continue
        v = [x.get('spread') for x in Ls if x.get('spread') is not None]
        if v: sp[gid] = float(np.mean([float(z) for z in v]))
    g = frame('bb_games', flat=False); hm = dict(zip(pick(g, 'id'), pick(g, 'homeTeam'))); dt = dict(zip(pick(g, 'id'), pick(g, 'startDate')))
    T['date'] = T.date.fillna(T.gid.map(dt)); T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce')
    T['hspread'] = T.gid.map(sp); T['is_home'] = [h == t if isinstance(h, str) else bool(x) for h, t, x in zip(T.gid.map(hm), T.team, T.home)]
    T['line'] = np.where(T.is_home, T.hspread, -T.hspread)            # this team's spread (negative = favoured)
    T['margin'] = T.pf - T.pa; T['cover'] = T.margin + T.line
    log(f'hunt76: lines for {T.line.notna().mean():.2f} of team-games')
    T = T.dropna(subset=['dt']).sort_values('dt'); g2 = T.groupby(['team', 'season'])
    T['om3c'] = g2.om3.cumsum() - T.om3.fillna(0); T['oa3c'] = g2.oa3.cumsum() - T.oa3.fillna(0)
    lg = T.groupby('season').apply(lambda d: d.om3.sum() / d.oa3.sum())
    T['luck'] = T.om3c / T.oa3c.where(T.oa3c >= 150) - T.season.map(lg)
    T['lev'] = [('power' if lev(a) == lev(b) == 'power' else 'mid' if lev(a) == lev(b) == 'mid' else 'low' if lev(a) == lev(b) == 'low' else 'mixed') for a, b in zip(T.conf, T.oconf)]
    X = T.dropna(subset=['luck', 'cover']); X = X[X.cover != 0]
    q = X.luck.quantile([.15, .85]).values
    def summ(d):
        if len(d) < 10: return f'n {len(d)}'
        return f'{d.cover.mean():+.2f} pts vs the line, covers {100 * (d.cover > 0).mean():.1f}% of {len(d)} (p {stats.ttest_1samp(d.cover, 0).pvalue:.2f})'
    out = [f'THRESHOLDS: lucky = opponents {-100 * q[0]:.1f}+ points under the league from three so far; unlucky = {100 * q[1]:.1f}+ over']
    for nm, d in [('ALL', X), ('both power', X[X.lev == 'power']), ('both mid-major', X[X.lev == 'mid']), ('both low-major', X[X.lev == 'low']), ('mixed levels', X[X.lev == 'mixed'])]:
        lk, ul = d[d.luck <= q[0]], d[d.luck >= q[1]]
        out.append(f'{nm}: LUCKY {summ(lk)} [2015–20 {summ(lk[lk.season <= 2020])} · 2021–26 {summ(lk[lk.season >= 2021])}] ‖ UNLUCKY {summ(ul)} [2015–20 {summ(ul[ul.season <= 2020])} · 2021–26 {summ(ul[ul.season >= 2021])}]')
    # the bet as it would be made: one side per game — against the lucky team when only one side is lucky
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt76 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
