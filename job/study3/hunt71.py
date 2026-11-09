# Hunt 71 (Nov 8, 2026 — the owner, 7:19 pm: "obviously just do all the 16 pattern hunts"; the "Next ideas — Nov 8" list). College football.
# STUDY ONLY. Prediction first (rule 12): every tag is known before kickoff (the schedule, the poll, the line, earlier games), then scored on
# the games after it. The outcome is the cover (margin minus the closing line's expected margin); break-even for picking a side is 52.4%.
# Each test is shown on all seasons with a line (2013–2026) and on two halves (2013–2019, 2020–2026) to see whether it holds.
#   1 look-ahead   favorites whose NEXT game is against a ranked team or a rival
#   2 letdown      teams the week after a big upset win (won as a 7+ underdog) or a rivalry win
#   3 rivalry      favorites in rivalry games (pairs that met in 15+ seasons, mostly non-conference or in the last regular-season week)
#   4 body clock   West teams kicking off at 10 am or earlier on their own clock; East teams at 10 pm or later on theirs (visitor's cover)
#   5 TV stage     favorites on ABC/CBS/NBC/FOX; teams' big-stage split from earlier seasons → the next season; QBs' split likewise
#   6 crowd        home teams by how full their stadium has been (earlier home games) — cover at home
#   13 poll vs Elo  preseason AP rank far above (or below) the preseason Elo rank → September covers
#   16 motivation  entering the last regular-season game at 5 wins (needs one for a bowl), or with 3 or fewer
#   main-site 2    "against good defenses": does a player's split against stingy defenses in earlier games predict the next one?
# (7, coaching trees: CFBD has head coaches only — no assistant history — so no tree can be built from what we hold; not run.)
import numpy as np, pandas as pd
from scipy import stats
from load import frame, answers, year_of, pick, num
import cfb_base, cfb_players

BE = 52.4
def summ(d, col='cover'):
    d = d.dropna(subset=[col]); d = d[d[col] != 0] if col == 'cover' else d
    if not len(d): return 'n 0'
    c = d[col]; rate = 100 * (c > 0).mean(); t = stats.ttest_1samp(c, 0) if len(c) > 2 else None
    return f'{c.mean():+.2f} pts vs the line, covers {rate:.1f}% of {len(c)} (p {t.pvalue:.2f})' if t is not None else f'n {len(c)}'
def halves(d, col='cover'):
    a, b = d[d.season <= 2019], d[d.season >= 2020]
    return f'all: {summ(d, col)} · 2013–19: {summ(a, col)} · 2020–26: {summ(b, col)}'

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    g0 = frame('cf_games')
    extra = pd.DataFrame({'gid': pick(g0, 'id'), 'att': num(pick(g0, 'attendance')), 'venue': pick(g0, 'venueId', 'venue_id'),
                          'tbd': pick(g0, 'startTimeTBD', 'start_time_tbd').fillna(False)}).drop_duplicates('gid')
    T = T.merge(extra, on='gid', how='left')
    T = T[T.both_fbs & T.exp.notna() & T.stype.astype(str).str.startswith('reg')].copy()
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce'); T = T.sort_values(['team', 'season', 'dt'])
    gp = T.groupby(['team', 'season'])
    T['next_opp'] = gp.opp.shift(-1); T['prev_cover'] = gp.cover.shift(1); T['prev_exp'] = gp.exp.shift(1); T['prev_margin'] = gp.margin.shift(1)
    T['prev_opp'] = gp.opp.shift(1); T['gno'] = gp.cumcount(); T['ng'] = gp.gid.transform('size')
    T['w_before'] = gp.win.cumsum() - T.win
    log(f'hunt71: {len(T)} team-games with a line ({T.season.min()}–{T.season.max()}); FBS v FBS regular season')
    # AP poll: rank entering each week (the latest poll at or before the game's week)
    P = {}
    r = frame('cf_rankings', flat=False)
    for _, w in r.iterrows():
        for p in w.get('polls') or []:
            if 'AP' in str(p.get('poll', '')): P[(int(w['season']), int(w['week']))] = {x['school']: x['rank'] for x in p.get('ranks') or []}
    def rank(t, s, wk):
        for k in range(int(wk), 0, -1):
            if (s, k) in P: return P[(s, k)].get(t)
        return None
    T['opp_rank'] = [rank(o, s, w) for o, s, w in zip(T.opp, T.season, T.week)]
    T['next_rank'] = [rank(o, s, w) if isinstance(o, str) else None for o, s, w in zip(T.next_opp, T.season, T.week)]
    # rivalries from the schedule alone: pairs that met in 15+ seasons, mostly non-conference or in a team's last regular-season game
    # from the full schedule (2004 on), not only the games with a line (2013 on)
    A0 = G[G.both_fbs & G.stype.astype(str).str.startswith('reg')].copy(); A0['dt'] = pd.to_datetime(A0.date, utc=True, errors='coerce')
    TT = pd.concat([A0.assign(team=A0.home, opp=A0.away), A0.assign(team=A0.away, opp=A0.home)]).sort_values(['team', 'season', 'dt'])
    TT['gno'] = TT.groupby(['team', 'season']).cumcount(); TT['ng'] = TT.groupby(['team', 'season']).gid.transform('size')
    pr = TT[TT.team < TT.opp].assign(pair=lambda d: d.team + '|' + d.opp, fin=lambda d: d.gno == d.ng - 1)
    pa = pr.groupby('pair').agg(seasons=('season', 'nunique'), nonconf=('conf_game', lambda s: (~s.astype(bool)).mean()), fin=('fin', 'mean'))
    RIV = set(pa[(pa.seasons >= 15) & ((pa.nonconf >= .5) | (pa.fin >= .6))].index)
    key = lambda a, b: a + '|' + b if a < b else b + '|' + a
    T['rival'] = [key(a, b) in RIV for a, b in zip(T.team, T.opp)]
    T['next_rival'] = [isinstance(b, str) and key(a, b) in RIV for a, b in zip(T.team, T.next_opp)]
    T['prev_rival'] = [isinstance(b, str) and key(a, b) in RIV for a, b in zip(T.team, T.prev_opp)]
    log(f'rivalries: {len(RIV)} pairs, e.g. {sorted(RIV)[:12]}')
    fav = T[T.exp > 0]; out = []
    # 1 look-ahead
    la = fav.next_rank.notna() | fav.next_rival
    out.append(f'1 LOOK-AHEAD favorites before a ranked or rival opponent: {halves(fav[la])} ‖ other favorites: {summ(fav[~la])}')
    out.append(f'1b … favored by 14+: {halves(fav[la & (fav.exp >= 14)])} ‖ other 14+ favorites: {summ(fav[~la & (fav.exp >= 14)])}')
    out.append(f'1c … this week unranked opponent, next week ranked: {halves(fav[fav.next_rank.notna() & fav.opp_rank.isna()])}')
    # 2 letdown
    ups = (T.prev_exp <= -7) & (T.prev_margin > 0); rw = T.prev_rival & (T.prev_margin > 0)
    out.append(f'2 LETDOWN after an upset win as a 7+ underdog: {halves(T[ups])} ‖ after a rivalry win: {halves(T[rw])} ‖ everyone else: {summ(T[~ups & ~rw & T.prev_exp.notna()])}')
    # 3 rivalry
    out.append(f'3 RIVALRY favorites: {halves(fav[fav.rival])} ‖ non-rivalry favorites: {summ(fav[~fav.rival])} ‖ rivalry favorites by 10+: {summ(fav[fav.rival & (fav.exp >= 10)])}')
    # 4 body clock: venues' time zones; a team's home zone = the zone of most of its home games
    v = frame('cf_venues')
    VZ = dict(zip(pick(v, 'id').astype(str), pick(v, 'timezone'))); VC = dict(zip(pick(v, 'id').astype(str), num(pick(v, 'capacity'))))
    T['vz'] = T.venue.astype(str).str.replace(r'\.0$', '', regex=True).map(VZ)
    hz = T[(T.ishome == 1) & T.vz.notna()].groupby('team').vz.agg(lambda s: s.mode().iat[0])
    T['home_tz'] = T.team.map(hz)
    WEST = {'America/Los_Angeles', 'America/Phoenix', 'America/Denver', 'America/Boise', 'Pacific/Honolulu', 'America/Anchorage'}
    def body(dt, tz):
        try: return dt.tz_convert(tz).hour + dt.tz_convert(tz).minute / 60
        except Exception: return np.nan
    vis = T[(T.ishome == 0) & T.home_tz.notna() & T.dt.notna() & ~T.tbd.astype(bool)].copy()
    vis['bh'] = [body(d, z) for d, z in zip(vis.dt, vis.home_tz)]
    west_early = vis.home_tz.isin(WEST) & (vis.bh <= 10); east_late = vis.home_tz.isin({'America/New_York', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Kentucky/Louisville'}) & (vis.bh >= 22)
    log(f'body clock: {vis.bh.notna().sum()} visitor games with a kickoff time; zones known for {T.home_tz.notna().mean():.2f} of team-games')
    out.append(f'4 BODY CLOCK West visitors kicking off at 10 am or earlier on their clock: {halves(vis[west_early])} ‖ East visitors at 10 pm or later: {halves(vis[east_late])} ‖ all other visitors: {summ(vis[~west_early & ~east_late])}')
    # 6 crowd: fill = attendance / capacity; tag from the team's earlier home games (this season, else last season)
    hm = T[(T.ishome == 1)].copy(); hm['cap'] = hm.venue.astype(str).str.replace(r'\.0$', '', regex=True).map(VC); hm['fill'] = (hm.att / hm.cap).where((hm.cap > 5000) & (hm.att > 0)).clip(upper=1.3)
    hm = hm.sort_values(['team', 'dt']); g2 = hm.groupby(['team', 'season'])
    hm['f_cur'] = (g2.fill.cumsum() - hm.fill.fillna(0)) / (g2.fill.cumcount()).replace(0, np.nan)
    lastf = hm.groupby(['team', 'season']).fill.mean(); hm['f_prev'] = [lastf.get((t, s - 1), np.nan) for t, s in zip(hm.team, hm.season)]
    hm['f_pre'] = hm.f_cur.fillna(hm.f_prev)
    q = hm.f_pre.quantile([.2, .8]).values if hm.f_pre.notna().any() else [np.nan, np.nan]
    out.append(f'6 CROWD home teams whose stadium has been fullest (top 20%, {q[1]:.2f}+ of capacity): {halves(hm[hm.f_pre >= q[1]])} ‖ emptiest (bottom 20%, under {q[0]:.2f}): {halves(hm[hm.f_pre <= q[0]])} ‖ middle: {summ(hm[(hm.f_pre > q[0]) & (hm.f_pre < q[1])])} · fill known for {hm.fill.notna().mean():.2f} of home games')
    # 13 preseason poll vs preseason Elo
    first = T.sort_values('dt').drop_duplicates(['team', 'season'])[['team', 'season', 'elo']].dropna()
    first['elo_rank'] = first.groupby('season').elo.rank(ascending=False)
    pre = {s: P[(s, min(k for (ss, k) in P if ss == s))] for s in {ss for ss, _ in P}}
    first['ap'] = [pre.get(s, {}).get(t) for t, s in zip(first.team, first.season)]
    first['over'] = first.ap.notna() & (first.elo_rank - first.ap >= 10); first['under'] = first.ap.isna() & (first.elo_rank <= 20)
    sep = T[T.week <= 5].merge(first[['team', 'season', 'over', 'under', 'ap', 'elo_rank']], on=['team', 'season'], how='left')
    out.append(f'13 POLL VS ELO in September: ranked 10+ spots higher in the preseason AP poll than by preseason Elo: {halves(sep[sep.over == True])} ‖ Elo top 20 but unranked: {halves(sep[sep.under == True])} ‖ every other ranked team: {summ(sep[(sep.ap.notna()) & (sep.over != True)])}')
    # 16 motivation: the last regular-season game
    lastg = T[T.gno == T.ng - 1]
    need = lastg.w_before == 5; low = lastg.w_before <= 3
    out.append(f'16 MOTIVATION last regular-season game at 5 wins (needs one for a bowl): {halves(lastg[need])} ‖ at 3 or fewer: {halves(lastg[low])} ‖ the rest: {summ(lastg[~need & ~low])}')
    # 5 TV stage
    try:
        md = frame('cf_media')
        md = pd.DataFrame({'gid': pick(md, 'id'), 'type': pick(md, 'mediaType', 'media_type').astype(str).str.lower(), 'outlet': pick(md, 'outlet').astype(str)})
        NAT = {'ABC', 'CBS', 'NBC', 'FOX'}
        natg = set(md[(md.type == 'tv') & md.outlet.isin(NAT)].gid)
        T['nat'] = T.gid.isin(natg); fav = T[T.exp > 0]
        log(f'TV: {len(natg)} games on ABC/CBS/NBC/FOX; media known for {T.gid.isin(set(md.gid)).mean():.2f} of team-games')
        out.append(f'5 TV STAGE favorites on ABC/CBS/NBC/FOX: {halves(fav[fav.nat])} ‖ favorites elsewhere: {summ(fav[~fav.nat])}')
        # team trait: earlier seasons' cover on national TV minus elsewhere (4+ national games), top/bottom 20% → next season's national games
        rows = []
        for s in range(2009, int(T.season.max()) + 1):
            e = T[(T.season < s) & (T.season >= s - 4)]; a = e[e.nat].groupby('team').cover.agg(['mean', 'size']); b = e[~e.nat].groupby('team').cover.mean()
            a = a[a['size'] >= 4]; sp_ = (a['mean'] - b.reindex(a.index)).dropna()
            if len(sp_) < 10: continue
            hi, lo = sp_.quantile(.8), sp_.quantile(.2); nx = T[(T.season == s) & T.nat]
            for t, c, se in zip(nx.team, nx.cover, nx.season): rows.append((se, c, 'hi' if sp_.get(t, np.nan) >= hi else 'lo' if sp_.get(t, np.nan) <= lo else 'mid'))
        R = pd.DataFrame(rows, columns=['season', 'cover', 'tag'])
        out.append(f'5b BIG-STAGE TEAMS (last 4 seasons, best 20% on national TV vs elsewhere) on national TV next season: {halves(R[R.tag == "hi"])} ‖ worst 20%: {halves(R[R.tag == "lo"])}')
    except Exception as e: out.append(f'5 TV STAGE: media not loaded ({e!r})'); T['nat'] = False
    # box: QBs on national TV (split from earlier seasons → next season) and main-site 2 (against good defenses)
    gi = G.set_index('gid'); rows = []
    for path, L in answers('cf_box'):
        y = year_of(path)
        if 'postseason' in path: continue
        for rr in L or []:
            gid, team, conf, ha, pts, aid, name, s = rr
            if str(aid).startswith('-') or not isinstance(s, dict): continue
            f = lambda k: pd.to_numeric(s.get(k), errors='coerce')
            rows.append((gid, y, team, str(aid), f('passing.YDS'), f('rushing.YDS'), f('rushing.CAR'), f('receiving.YDS'), f('receiving.REC')))
    B = pd.DataFrame(rows, columns=['gid', 'y', 'team', 'pid', 'pyds', 'ryds', 'car', 'recyds', 'rec'])
    B = B[B.gid.isin(gi.index)].copy(); B['dt'] = B.gid.map(gi.date).astype(str)
    PS = cfb_players.player_seasons(); role = PS.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None).to_dict(); B['grp'] = B.pid.map(role)
    o = B.drop_duplicates(['gid', 'team'])[['gid', 'team']]; o2 = o.merge(o, on='gid', suffixes=('', '_o')); o2 = o2[o2.team != o2.team_o]; B = B.merge(o2, on=['gid', 'team'])
    for c in ['pyds', 'ryds', 'car', 'recyds', 'rec']: B[c] = B[c].fillna(0)
    natg = set(T[T.nat].gid) if 'nat' in T else set()
    Q = B[(B.grp == 'QB') & (B.pyds > 0)].copy(); Q['nat'] = Q.gid.isin(natg)
    if Q.nat.any():
        sa = Q.groupby(['pid', 'y']).pyds.transform('mean'); Q['rel'] = Q.pyds / sa.clip(lower=1)
        S = Q.groupby(['pid', 'y']).apply(lambda d: pd.Series({'n': d.nat.sum(), 'sp': d[d.nat].rel.mean() - d[~d.nat].rel.mean() if d.nat.sum() and (~d.nat).sum() else np.nan})).reset_index()
        S = S[S.n >= 2].dropna(); S2 = S.merge(S.assign(y=S.y - 1), on=['pid', 'y'], suffixes=('', '_next'))
        rr_ = stats.pearsonr(S2.sp, S2.sp_next) if len(S2) > 10 else (np.nan, np.nan)
        out.append(f'5c QBs on national TV: his passing yards there vs his season average, one season to the next: r {rr_[0]:.2f} (p {rr_[1]:.2f}, {len(S2)} QB pairs; 2+ national games each season) · league: {100 * (Q[Q.nat].rel.mean() - 1):+.1f}% on national TV')
    # main-site 2: against good defenses. Defense allowed in that stat per game from its earlier games (this season), against the league average
    for pos, s in (('QB', 'pyds'), ('WR', 'recyds'), ('TE', 'recyds'), ('RB', 'ryds')):
        X = B[B.grp == pos].copy()
        X = X[X.pyds > 0] if pos == 'QB' else X[X.car >= 5] if pos == 'RB' else X[X.rec + X.recyds > 0]
        TA = B.groupby(['team_o', 'y', 'gid', 'dt'])[s].sum().reset_index().sort_values('dt'); ga = TA.groupby(['team_o', 'y'])
        TA['k'] = ga.cumcount(); TA['da'] = (ga[s].cumsum() - TA[s]) / TA.k.replace(0, np.nan); TA['da'] = TA.da / TA.groupby('y')[s].transform('mean')
        X = X.merge(TA[['gid', 'team_o', 'da', 'k']].rename(columns={'k': 'dk'}), on=['gid', 'team_o'], how='left').sort_values(['pid', 'dt']).reset_index(drop=True)
        X['good'] = (X.da <= .85) & (X.dk >= 3)
        # his earlier games (this season and last): average, and his ratio against good defenses vs his own average
        avg = np.full(len(X), np.nan); rg = np.full(len(X), np.nan); ng = np.zeros(len(X))
        for pid, idx in X.groupby('pid').indices.items():
            vv, yy, gg = X[s].values[idx], X.y.values[idx], X.good.values[idx]
            for i in range(1, len(idx)):
                j = np.arange(i); j = j[yy[j] >= yy[i] - 1]
                if len(j) < 4: continue
                a = vv[j].mean(); avg[idx[i]] = a
                gj = j[gg[j]]; oj = j[~gg[j]]
                if len(gj) >= 2 and len(oj) >= 2 and a > 0: rg[idx[i]] = vv[gj].mean() / max(vv[oj].mean(), 1); ng[idx[i]] = len(gj)
        X['avg'] = avg; X['rg'] = rg; X['ng'] = ng
        Y = X[X.good & X.avg.notna()].copy()
        tr, te = Y[Y.y <= 2021], Y[Y.y >= 2022]
        lg = (tr[s] / tr.avg.clip(lower=1)).median()   # the league's ratio vs good defenses, from the training years
        def mae(d, p): return float(np.abs(d[s] - p).mean())
        best = None
        for k in (0, 1, 2, 4, 8, 1e9):
            p = lambda d: d.avg * np.where(d.rg.notna(), (d.ng * d.rg.fillna(lg) + k * lg) / (d.ng + k), lg)
            e = mae(tr, p(tr))
            if best is None or e < best[1]: best = (k, e, p)
        k, _, p = best; e0 = mae(te, te.avg * lg); e1 = mae(te, p(te)); ee = mae(te, te.avg)
        has = te.rg.notna()
        out.append(f'M2 AGAINST GOOD DEFENSES {pos} {s}: next game vs a stingy defense (allowing 15%+ under average, 3+ games in), 2022–26: his average {ee:.1f} off · his average × the league\'s good-defense ratio ({lg:.2f}) {e0:.1f} · × his own split (shrink {"none — league only" if k > 1e8 else k}) {e1:.1f} ({100 * (e0 - e1) / e0:+.1f}%) · players with a split: {has.sum()} of {len(te)}')
    for o_ in out: log(o_)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt71 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
