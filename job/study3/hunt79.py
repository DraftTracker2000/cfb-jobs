# Hunt 79 (Nov 19, 2026 — the owner, 1:24 pm: "i don't know why you can't access the lines"; 10:12 am: "finding stuff when a good stat aligns
# with a bad stat and then testing that"; 10:17 am: "we should be finding the best ones for the week not the avg ones").
# STUDY ONLY. The NFL angle tests (docs/research … betting-ideas report, Nov 19) on college football (CFBD games, closing lines, box scores) and
# men's college basketball (CBBD games, closing lines, team box scores). Each team is judged on its previous 10 games only (crossing seasons in
# football, this season only in basketball, 5+ needed). Strong vs weak = top 30% of the week's teams in a stat against an opponent in the
# bottom 30% at stopping it; "biggest" = the single biggest gap of the week (football) or the day (basketball) in that stat.
# Graded on the closing line: the team covers, its implied team total goes over, the game total goes over. Halves: 2014–19 / 2020–26 (football),
# 2015–20 / 2021–26 (basketball). Break-even 52.4%. Prints aggregate tables only.
import re, numpy as np, pandas as pd
from load import answers, frame, pick, num, year_of
import cfb_base

def pc(d, col, by):  # percentile within the group
    return d.groupby(by)[col].rank(pct=True)

def zs(d, col, by):
    g = d.groupby(by)[col]; return (d[col] - g.transform('mean')) / g.transform('std')

def grade(x, cols=('cov', 'tto', 'gov'), split=2020):
    o = []
    for c in cols:
        v = x[c].dropna(); a = x[x.season < split][c].dropna(); b = x[x.season >= split][c].dropna()
        o.append(f'{100 * v.mean():.1f}% ({100 * a.mean():.0f}/{100 * b.mean():.0f})' if len(v) else '—')
    return ' · '.join(o)

def rolling(T, M, n=10, minn=5, by_season=False):
    """each team's average of M (offense) and of what it allowed (d_), over its previous n games, earlier games only"""
    T = T.sort_values('dt').copy()
    keys = ['team', 'season'] if by_season else ['team']
    for m in M:
        for pre in ('', 'd_'):
            T['r_' + pre + m] = T.groupby(keys)[pre + m].transform(lambda s: s.shift(1).rolling(n, min_periods=minn).mean())
    T['r_n'] = T.groupby(keys).cumcount()
    return T

def test_block(lab, X, M, wk, out, split):
    """X: one row per team-game with r_<m> (mine), opp_rd_<m> (what the opponent allows), outcomes cov/tto/gov"""
    for m, sg in M.items():
        for side in ('o', 'd'):
            if side == 'o': a, b = sg * X['r_' + m], sg * X['opp_rd_' + m]                 # my offense strong, their defense bad at stopping it
            else: a, b = -sg * X['r_d_' + m], -sg * X['opp_r_' + m]                          # my defense stingy, their offense weak
            X2 = X.assign(_a=a, _b=b).dropna(subset=['_a', '_b'])
            if len(X2) < 200: continue
            p1, p2 = pc(X2, '_a', wk), pc(X2, '_b', wk)
            s30 = X2[(p1 >= .7) & (p2 >= .7)]
            X2 = X2.assign(_z=zs(X2, '_a', wk) + zs(X2, '_b', wk))
            top = X2.sort_values('_z', ascending=False).groupby(wk).head(1)
            nm = f'{lab} {m} {"my O vs their D" if side == "o" else "my D vs their O"}'
            out.append(f'{nm} 30/30 n{len(s30)}: {grade(s30, split=split)} ‖ biggest n{len(top)}: {grade(top, split=split)}')

def cfb(log, out):
    G, T, CO, TS = cfb_base.build()
    # totals
    l = frame('cf_lines', flat=False); ou = {}
    for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
        if not isinstance(L, list) or not L: continue
        v = [float(x['overUnder']) for x in L if x.get('overUnder') not in (None, '')]
        if v: ou[gid] = float(np.mean(v))
    # team-game box totals from the player box scores
    rows = []
    for path, L in answers('cf_box'):
        for r in L or []:
            gid, team, conf, ha, pts, aid, name, st = r
            if not isinstance(st, dict): continue
            g = lambda k: pd.to_numeric(st.get(k), errors='coerce')
            ca = str(st.get('passing.C/ATT') or ''); c_, a_ = (ca.split('/') + ['', ''])[:2]
            rows.append((gid, team, pd.to_numeric(a_, errors='coerce'), g('passing.YDS'), g('passing.INT'), g('rushing.CAR'), g('rushing.YDS'), g('fumbles.LOST')))
    B = pd.DataFrame(rows, columns=['gid', 'team', 'att', 'pyds', 'int', 'car', 'ryds', 'fl']).fillna(0).groupby(['gid', 'team']).sum().reset_index()
    T = T[T.both_fbs & T.exp.notna() & (T.stype == 'regular')].merge(B, on=['gid', 'team'], how='left')
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce'); T = T.dropna(subset=['dt'])
    T['ypc'] = T.ryds / T.car.where(T.car > 0); T['ypa'] = T.pyds / T.att.where(T.att > 0); T['give'] = T.int + T.fl
    M = {'pf': 1, 'ypc': 1, 'ypa': 1, 'give': -1}
    O = T.set_index(['gid', 'team'])
    for m in M: T['d_' + m] = [O[m].get((g, o), np.nan) for g, o in zip(T.gid, T.opp)]
    T = rolling(T, M, n=10, minn=5)
    O = T.set_index(['gid', 'team'])
    for m in M:
        T['opp_r_' + m] = [O['r_' + m].get((g, o), np.nan) for g, o in zip(T.gid, T.opp)]
        T['opp_rd_' + m] = [O['r_d_' + m].get((g, o), np.nan) for g, o in zip(T.gid, T.opp)]
    T['ou'] = T.gid.map(ou); T['imp'] = (T.ou + T.exp) / 2
    T['cov'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    T['tto'] = np.where(T.pf > T.imp, 1.0, np.where(T.pf < T.imp, 0.0, np.nan))
    T['gov'] = np.where(T.pf + T.pa > T.ou, 1.0, np.where(T.pf + T.pa < T.ou, 0.0, np.nan))
    X = T[(T.season >= 2014)].copy()
    log(f'hunt79 CFB: {len(X)} FBS-vs-FBS team-games with a line 2014+, totals for {X.ou.notna().mean():.2f}, box for {X.car.gt(0).mean():.2f}')
    out.append(f'CFB base: all team-games cover {grade(X)} (cover / team total over / game over; 2014–19/2020–26)')
    test_block('CFB', X, M, ['season', 'week'], out, 2020)
    # stacked: most big offensive mismatches (z 1.5+) in one game, top 1 a week
    zc = []
    for m, sg in M.items():
        X['_z_' + m] = zs(X.assign(_v=sg * X['r_' + m]), '_v', ['season', 'week']) + zs(X.assign(_v=sg * X['opp_rd_' + m]), '_v', ['season', 'week']); zc.append('_z_' + m)
    X['stack'] = (X[zc] >= 1.5).sum(axis=1); X['zsum'] = X[zc].sum(axis=1)
    st = X.sort_values(['stack', 'zsum'], ascending=False).groupby(['season', 'week']).head(1)
    out.append(f'CFB stacked (top 1 a week) n{len(st)}: {grade(st)}')
    # schedule: after losing as a 7+ favorite; teaser legs (6 points) on dogs of 1.5–2.5 and favorites of 7.5–8.5
    X = X.sort_values('dt'); X['p_exp'] = X.groupby('team').exp.shift(1); X['p_m'] = X.groupby('team').margin.shift(1); X['p_s'] = X.groupby('team').season.shift(1)
    al = X[(X.p_exp >= 7) & (X.p_m < 0) & (X.p_s == X.season)]; out.append(f'CFB after losing as a 7+ favorite n{len(al)}: cover {grade(al, ("cov",))}')
    al = X[(X.p_exp >= 14) & (X.p_m < 0) & (X.p_s == X.season)]; out.append(f'CFB after losing as a 14+ favorite n{len(al)}: cover {grade(al, ("cov",))}')
    for nm, msk in (('dog 1.5–2.5 teased to 7.5–8.5', X.exp.between(-2.5, -1.5)), ('favorite 7.5–8.5 teased to 1.5–2.5', X.exp.between(7.5, 8.5))):
        d = X[msk]; c = d.cover + 6; w = c[c != 0] > 0
        out.append(f'CFB teaser leg, {nm}: n{len(w)} {100 * w.mean():.1f}% ({100 * w[d.season < 2020].mean():.0f}/{100 * w[d.season >= 2020].mean():.0f}) — break-even 72.4%')

def cbb(log, out):
    rows, keys_seen = [], set()
    for path, L in answers('bb_tgames'):
        for r in L or []:
            if not isinstance(r, dict): continue
            f = pd.json_normalize(r).iloc[0].to_dict()
            if len(keys_seen) < 400: keys_seen.update(k for k in f if k.startswith('teamStats.'))
            def first(*pats):
                for p in pats:
                    for k, v in f.items():
                        if re.fullmatch(p, k): return v
                return np.nan
            rows.append((f.get('gameId'), f.get('season'), f.get('team'), f.get('opponent'), f.get('isHome'), f.get('startDate'),
                         first(r'teamStats\.points(\.total)?'), first(r'opponentStats\.points(\.total)?'),
                         first(r'teamStats\.(threePointFieldGoals|threePointers)\.made'), first(r'teamStats\.(threePointFieldGoals|threePointers)\.attempted'),
                         first(r'teamStats\.rebounds\.total', r'teamStats\.rebounds'), first(r'teamStats\.turnovers\.total', r'teamStats\.turnovers'),
                         first(r'teamStats\.possessions', r'teamStats\.pace'), first(r'teamStats\.(freeThrows)\.attempted'), first(r'teamStats\.fieldGoals\.attempted')))
    T = pd.DataFrame(rows, columns=['gid', 'season', 'team', 'opp', 'home', 'date', 'pf', 'pa', 'm3', 'a3', 'reb', 'tov', 'poss', 'fta', 'fga'])
    for c in ['pf', 'pa', 'm3', 'a3', 'reb', 'tov', 'poss', 'fta', 'fga']: T[c] = num(T[c])
    log(f'hunt79 CBB: {len(T)} team-games; teamStats keys seen: {sorted(keys_seen)[:80]}')
    l = frame('bb_lines', flat=False); sp, ou = {}, {}
    for gid, Ls in zip(pick(l, 'gameId', 'id'), pick(l, 'lines')):
        if not isinstance(Ls, list) or not Ls: continue
        v = [float(x['spread']) for x in Ls if x.get('spread') not in (None, '')]; w = [float(x['overUnder']) for x in Ls if x.get('overUnder') not in (None, '')]
        if v: sp[gid] = float(np.mean(v))
        if w: ou[gid] = float(np.mean(w))
    g = frame('bb_games', flat=False); hm = dict(zip(pick(g, 'id'), pick(g, 'homeTeam'))); dt = dict(zip(pick(g, 'id'), pick(g, 'startDate')))
    T['date'] = T.date.fillna(T.gid.map(dt)); T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce')
    T['is_home'] = [h == t if isinstance(h, str) else bool(x) for h, t, x in zip(T.gid.map(hm), T.team, T.home)]
    T['line'] = np.where(T.is_home, T.gid.map(sp), -T.gid.map(sp))      # this team's spread (negative = favoured)
    T['exp'] = -T.line; T['ou'] = T.gid.map(ou); T['margin'] = T.pf - T.pa; T['cover'] = T.margin + T.line
    T['p3'] = T.m3 / T.a3.where(T.a3 > 0); T['r3'] = T.a3 / T.fga.where(T.fga > 0)
    M = {'pf': 1, 'm3': 1, 'p3': 1, 'reb': 1, 'tov': -1, 'fta': 1}
    if T.poss.notna().mean() > .5: M['poss'] = 1
    O = T.set_index(['gid', 'team'])
    for m in M: T['d_' + m] = [O[m].get((a, o), np.nan) for a, o in zip(T.gid, T.opp)]
    T = T.dropna(subset=['dt']); T = rolling(T, M, n=10, minn=5, by_season=True)
    O = T.set_index(['gid', 'team'])
    for m in M:
        T['opp_r_' + m] = [O['r_' + m].get((a, o), np.nan) for a, o in zip(T.gid, T.opp)]
        T['opp_rd_' + m] = [O['r_d_' + m].get((a, o), np.nan) for a, o in zip(T.gid, T.opp)]
    T['imp'] = (T.ou + T.exp) / 2
    T['cov'] = np.where(T.cover > 0, 1.0, np.where(T.cover < 0, 0.0, np.nan))
    T['tto'] = np.where(T.pf > T.imp, 1.0, np.where(T.pf < T.imp, 0.0, np.nan))
    T['gov'] = np.where(T.pf + T.pa > T.ou, 1.0, np.where(T.pf + T.pa < T.ou, 0.0, np.nan))
    T['day'] = T.dt.dt.tz_convert('America/New_York').dt.date.astype(str)
    X = T[T.line.notna() & (T.season >= 2015)].copy()
    log(f'hunt79 CBB: {len(X)} team-games with a line 2015+, totals for {X.ou.notna().mean():.2f}')
    out.append(f'CBB base: all team-games {grade(X, split=2021)}')
    test_block('CBB', X, M, ['day'], out, 2021)
    X = X.sort_values('dt'); X['p_exp'] = X.groupby(['team', 'season']).exp.shift(1); X['p_m'] = X.groupby(['team', 'season']).margin.shift(1)
    al = X[(X.p_exp >= 10) & (X.p_m < 0)]; out.append(f'CBB after losing as a 10+ favorite n{len(al)}: cover {grade(al, ("cov",), 2021)}')

def run(reg, log, D):
    out = []
    try: cfb(log, out)
    except Exception as e:
        import traceback; out.append('CFB failed: ' + ' / '.join(l.strip() for l in traceback.format_exc().splitlines() if 'hunt79' in l or 'Error' in l)[-1500:])
    try: cbb(log, out)
    except Exception as e:
        import traceback; out.append('CBB failed: ' + ' / '.join(l.strip() for l in traceback.format_exc().splitlines() if 'hunt79' in l or 'Error' in l)[-1500:])
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt79 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
