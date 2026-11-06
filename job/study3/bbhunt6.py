# Pattern hunt 6 — college basketball (Nov 6, 2026 — Sam, 10:09 am: "i don't think many patterns have been explored on the basketball
# side"; 10:13 am: "if you're just running data and pattern tests you can just tell me after"). STUDY ONLY; nothing goes on the site.
# From the study archive: CBBD games 2008 on, closing lines 2014 on, SRS, AP polls, player season stats, rosters, the portal.
# Same bar as hunts 3–5: Benjamini-Hochberg q < .10 over this round's tests, and the holdout seasons (HOLD on) the same way.
#  B6-01 rest edge: days since each team's last game (team minus opponent, capped at 7) -> vs the line
#  B6-02 letdown: the game right after beating an AP-ranked opponent -> vs the line
#  B6-03 revenge: second meeting in a season, the team that lost the first -> vs the line
#  B6-04 third game in three days (conference tournaments) -> vs the line
#  B6-05 overreaction: last game's result against the line (beat it by 15+ / missed by 15+) -> next game vs the line
#  B6-06 streaks: covered (or failed) the last four -> next game vs the line
#  B6-07 returning minutes: share of last season's minutes back on the team -> November–December games vs the line
#  B6-08 transfers in: incoming transfers' minutes at their old schools (share of the team's last-season minutes) -> Nov–Dec vs the line
#  B6-09 team against the line repeats season to season (r)
#  B6-10 head coach against the line repeats season to season (r, same coach any team)
#  B6-11 road favorites in conference games -> vs the line
#  B6-12 big home underdogs (7+) in conference games -> vs the line
#  B6-13 altitude: home games at 4,000+ ft programs -> vs the line (beyond the usual home edge in the line)
#  B6-14 overtime last game -> next game vs the line
#  B6-15 totals: both teams' last two games went over their totals by 10+ on average -> this game vs its total
#  B6-16 early-season blowouts: Nov–Dec margin beyond SRS in games vs weak teams -> January–March vs the line
import numpy as np, pandas as pd
from lib3 import bh, mech, yoy, reg_yoy, HOLD
from load import frame, pick, num

ALT = {'Air Force', 'Colorado', 'Wyoming', 'Utah', 'Utah State', 'BYU', 'New Mexico', 'Colorado State', 'Northern Colorado', 'Denver', 'Montana State',
       'Utah Valley', 'Utah Tech', 'Weber State', 'Southern Utah', 'Northern Arizona', 'UNLV', 'Nevada', 'Boise State', 'Idaho State', 'UTEP', 'New Mexico State'}


def run(reg, log, D):
    T = []
    def M(hyp, label, d, x, unit='pts'):
        d = d.dropna(subset=['cover']); x = np.asarray(x, float)
        if np.nansum(x != 0) < 80: log(f'[{hyp}] {label}: too few ({int(np.nansum(x != 0))})'); return
        r = mech(reg, hyp, label, d.cover.values, x, d.gid.values, d.season.values, unit=unit); log(f'[{hyp}] {label}: {r}')
    g = frame('bb_games')
    if not len(g): log('bbhunt6: no games'); return
    B = pd.DataFrame({'gid': pick(g, 'id').astype(str), 'season': num(pick(g, 'season', '_year')), 'h': pick(g, 'homeTeamId').astype(str), 'a': pick(g, 'awayTeamId').astype(str),
                      'hn': pick(g, 'homeTeam').astype(str), 'an': pick(g, 'awayTeam').astype(str),
                      'hp': num(pick(g, 'homePoints')), 'ap': num(pick(g, 'awayPoints')), 'neutral': pick(g, 'neutralSite').fillna(False).astype(bool),
                      'conf': pick(g, 'conferenceGame').fillna(False).astype(bool),
                      'date': pd.to_datetime(pick(g, 'startDate'), errors='coerce', utc=True), 'st': pick(g, 'seasonType').astype(str)}).dropna(subset=['hp', 'ap', 'date']).drop_duplicates('gid')
    per = None
    for c in ['homePeriodPoints', 'homeLineScores']:
        if c in g.columns: per = dict(zip(pick(g, 'id').astype(str), g[c])); break
    B['ot'] = [float(isinstance(per.get(i), list) and len(per.get(i)) > 2) if per else np.nan for i in B.gid]   # college: 2 halves
    B['m'] = B.hp - B.ap
    log(f'bbhunt6: {len(B)} games {int(B.season.min())}–{int(B.season.max())}; overtime known: {per is not None}; columns {[c for c in g.columns if "eriod" in c or "ine" in c][:6]}')
    # closing lines (spread and total), from the home side
    l2 = frame('bb_lines', flat=False); SP, TO = {}, {}
    for gid, LL in zip(pick(l2, 'gameId'), pick(l2, 'lines')):
        if not isinstance(LL, list) or not LL: continue
        c = [x for x in LL if 'consensus' in str(x.get('provider', '')).lower()] or LL
        v = [x.get('spread') for x in c if x.get('spread') is not None]; t = [x.get('overUnder') for x in c if x.get('overUnder') is not None]
        if v: SP[str(gid)] = float(np.mean([float(a) for a in v]))
        if t: TO[str(gid)] = float(np.mean([float(a) for a in t]))
    B['sp'] = B.gid.map(SP); B['tot'] = B.gid.map(TO)
    ok = B.sp.notna(); cr = np.corrcoef(B[ok].sp, B[ok].m)[0, 1]; B['exp'] = -B.sp if cr < 0 else B.sp
    log(f'lines: {int(ok.sum())} games with a spread (sign check r {cr:.2f}), {int(B.tot.notna().sum())} with a total')
    rows = pd.concat([B.assign(team=B.h, tn=B.hn, opp=B.a, on=B.an, margin=B.m, home=np.where(B.neutral, .5, 1.0), exp_t=B.exp),
                      B.assign(team=B.a, tn=B.an, opp=B.h, on=B.hn, margin=-B.m, home=np.where(B.neutral, .5, 0.0), exp_t=-B.exp)])
    rows['cover'] = rows.margin - rows.exp_t
    rows = rows.sort_values(['team', 'season', 'date']).reset_index(drop=True)
    G = rows.groupby(['team', 'season'])
    rows['gap'] = G.date.diff().dt.total_seconds() / 86400
    rows['prev_cover'] = G.cover.shift(1); rows['prev_ot'] = G.ot.shift(1); rows['prev_m'] = G.margin.shift(1); rows['prev_opp'] = G.opp.shift(1)
    rows['gap2'] = G.date.diff(2).dt.total_seconds() / 86400
    reg_ = rows[rows.st.str.contains('reg', case=False) | rows.st.str.contains('post', case=False)].copy()
    L = reg_[reg_.cover.notna()].copy()
    og = L[['gid', 'team', 'gap']].rename(columns={'team': 'opp', 'gap': 'ogap'}); L = L.merge(og, on=['gid', 'opp'], how='left')
    # B6-01 rest edge
    R1 = L.dropna(subset=['gap', 'ogap']); x = np.clip(R1.gap, 0, 7) - np.clip(R1.ogap, 0, 7)
    M('B6-01', 'Rest edge (days since last game, team minus opponent, capped at 7) -> vs the line', R1, x, 'pts per day')
    # B6-02 letdown after beating a ranked team
    rk = frame('bb_rankings', flat=False); ranked = set()
    if len(rk):
        P = pd.DataFrame({'d': pd.to_datetime(pick(rk, 'pollDate'), errors='coerce', utc=True), 't': pick(rk, 'teamId').astype(str), 'r': num(pick(rk, 'ranking')), 'pt': pick(rk, 'pollType').astype(str)})
        P = P[P.pt.str.contains('AP', case=False) & (P.r <= 25)].dropna(subset=['d'])
        P['wk'] = P.d.dt.strftime('%G-%V'); ranked = set(zip(P.wk, P.t))
    rows['wk'] = rows.date.dt.strftime('%G-%V'); rows['opp_rk'] = [(w, o) in ranked for w, o in zip(rows.wk, rows.opp)]
    rows['beat_rk'] = ((rows.margin > 0) & rows.opp_rk).astype(float); rows['prev_beat_rk'] = rows.groupby(['team', 'season']).beat_rk.shift(1)
    L = L.merge(rows[['gid', 'team', 'opp_rk', 'prev_beat_rk']], on=['gid', 'team'], how='left')
    R2 = L[L.prev_beat_rk.notna() & ~L.opp_rk.fillna(False).astype(bool)]
    log(f'B6-02: AP-ranked team-weeks {len(ranked)}; next games after beating a ranked team (vs unranked): {int(R2.prev_beat_rk.sum())}')
    M('B6-02', 'Next game after beating an AP-ranked team (opponent unranked) -> vs the line', R2, R2.prev_beat_rk)
    # B6-03 revenge
    rows['pair'] = [f'{min(a, b)}|{max(a, b)}' for a, b in zip(rows.team, rows.opp)]
    rows['meet'] = rows.groupby(['season', 'pair', 'team']).cumcount() + 1
    first = rows[rows.meet == 1][['season', 'pair', 'team', 'margin']].rename(columns={'margin': 'm1'})
    s3 = rows[rows.meet == 2].merge(first, on=['season', 'pair', 'team'])
    L = L.merge(s3[['gid', 'team', 'm1']], on=['gid', 'team'], how='left'); R3 = L[L.m1.notna() & (L.m1 != 0)]
    M('B6-03', 'Second meeting in a season, the team that lost the first -> vs the line', R3, (R3.m1 < 0).astype(float))
    # B6-04 third game in three days
    R4 = L.dropna(subset=['gap2']); M('B6-04', 'Third game in three days -> vs the line', R4, (R4.gap2 <= 2.2).astype(float))
    # B6-05 overreaction
    R5 = L.dropna(subset=['prev_cover'])
    M('B6-05', 'Beat the line by 15+ last game -> next game vs the line', R5, (R5.prev_cover >= 15).astype(float))
    M('B6-05', 'Missed the line by 15+ last game -> next game vs the line', R5, (R5.prev_cover <= -15).astype(float))
    # B6-06 streaks
    rows['c4'] = rows.groupby(['team', 'season']).cover.transform(lambda s: np.sign(s).shift(1).rolling(4).sum())
    L = L.merge(rows[['gid', 'team', 'c4']], on=['gid', 'team'], how='left'); R6 = L.dropna(subset=['c4'])
    M('B6-06', 'Covered each of the last four -> next game vs the line', R6, (R6.c4 >= 4).astype(float))
    M('B6-06', 'Failed each of the last four -> next game vs the line', R6, (R6.c4 <= -4).astype(float))
    # B6-07 / B6-08 roster turnover from player season stats (minutes)
    st = frame('bb_stats')
    if len(st):
        S = pd.DataFrame({'pid': pick(st, 'athleteId').astype(str), 'team': pick(st, 'teamId').astype(str), 'season': num(pick(st, 'season', '_year')), 'mins': num(pick(st, 'minutes'))}).dropna()
        tot = S.groupby(['team', 'season']).mins.sum()
        nxt = S[['pid', 'team', 'season']].assign(season=S.season - 1)          # where each player is the season after
        back = S.merge(nxt, on=['pid', 'team', 'season'])                       # last-season minutes of players back on the same team
        ret = (back.groupby(['team', 'season']).mins.sum() / tot).rename('ret').reset_index(); ret['season'] += 1
        mv = S.merge(nxt.rename(columns={'team': 'nteam'}), on=['pid', 'season']); mv = mv[mv.team != mv.nteam]   # movers: minutes at the old school
        inc = mv.groupby(['nteam', 'season']).mins.sum().rename('inmin').reset_index().rename(columns={'nteam': 'team'})
        inc = inc.merge(tot.rename('tt').reset_index(), on=['team', 'season'], how='left'); inc['xin'] = inc.inmin / inc.tt; inc['season'] += 1
        E = L[L.date.dt.month.isin([11, 12])].merge(ret, on=['team', 'season'], how='left').merge(inc[['team', 'season', 'xin']], on=['team', 'season'], how='left')
        e7 = E.dropna(subset=['ret']); log(f'B6-07: {len(e7)} Nov–Dec team-games with returning minutes (median {e7.ret.median():.2f})')
        M('B6-07', 'Returning share of last season\'s minutes -> November–December vs the line', e7, e7.ret - e7.ret.mean(), 'pts per 1.0 of share')
        E['xin'] = E.xin.fillna(0); e8 = E.dropna(subset=['ret'])
        M('B6-08', 'Incoming transfers\' old-school minutes (share of the team\'s last-season minutes) -> Nov–Dec vs the line', e8, e8.xin, 'pts per 1.0 of share')
    # B6-09 team ATS repeats; B6-10 coach ATS repeats
    S9 = L[L.cover != 0].groupby(['team', 'season']).cover.agg(lambda s: (s > 0).mean()).rename('v').reset_index()
    S9 = S9.merge(L.groupby(['team', 'season']).size().rename('n').reset_index()); S9 = S9[S9.n >= 15].rename(columns={'team': 'key'})
    o = yoy(S9, 'key', 'v'); reg_yoy(reg, 'B6-09', 'Team cover rate (15+ lined games)', o); log(f'[B6-09] r {o["r"]:.3f} holdout {o["r_hold"]:.3f}')
    co = frame('bb_coaches', flat=False); CO = {}
    for _, r in co.iterrows():
        for s in (r.get('seasons') or []):
            CO[(str(s.get('teamId')), int(s.get('season')))] = f"{r.get('firstName', '')} {r.get('lastName', '')}".strip()
    if CO:
        S10 = S9.copy(); S10['key'] = [CO.get((k, int(s))) for k, s in zip(S10.key, S10.season)]; S10 = S10.dropna(subset=['key'])
        o = yoy(S10, 'key', 'v'); reg_yoy(reg, 'B6-10', 'Head coach cover rate (any team)', o); log(f'[B6-10] {len(S10)} coach-seasons; r {o["r"]:.3f} holdout {o["r_hold"]:.3f}')
    # B6-11 road favorites in conference; B6-12 big home dogs in conference
    C = L[L.conf.astype(bool)]
    R11 = C[C.home == 0]; M('B6-11', 'Road favorite in a conference game -> vs the line', R11, (R11.exp_t > 0).astype(float))
    R12 = C[C.home == 1]; M('B6-12', 'Home underdog by 7+ in a conference game -> vs the line', R12, (R12.exp_t <= -7).astype(float))
    # B6-13 altitude
    R13 = L[L.home == 1]; M('B6-13', 'Home game for a 4,000+ ft program -> vs the line', R13, R13.tn.isin(ALT).astype(float))
    # B6-14 overtime last game
    if per is not None:
        R14 = L.dropna(subset=['prev_ot']); M('B6-14', 'Overtime in the last game -> next game vs the line', R14, R14.prev_ot)
    # B6-15 totals: both teams' last two games over their totals by 10+ on average
    rows['tot_err'] = (rows.hp + rows.ap) - rows.tot
    rows['ov2'] = rows.groupby(['team', 'season']).tot_err.transform(lambda s: s.shift(1).rolling(2).mean())
    Gt = B[B.tot.notna()][['gid', 'season', 'h', 'a', 'hp', 'ap', 'tot']].copy(); o2 = rows[['gid', 'team', 'ov2']]
    Gt = Gt.merge(o2.rename(columns={'team': 'h', 'ov2': 'oh'}), on=['gid', 'h']).merge(o2.rename(columns={'team': 'a', 'ov2': 'oa'}), on=['gid', 'a']).dropna(subset=['oh', 'oa'])
    Gt['cover'] = (Gt.hp + Gt.ap) - Gt.tot
    M('B6-15', 'Both teams\' last two games went over their totals by 10+ on average -> this game vs its total', Gt, ((Gt.oh >= 10) & (Gt.oa >= 10)).astype(float))
    # B6-16 early blowouts of weak teams -> later vs the line (SRS)
    sr = frame('bb_srs'); SR = {}
    if len(sr): SR = dict(zip(zip(pick(sr, 'teamId').astype(str), num(pick(sr, 'season', '_year'))), num(pick(sr, 'rating'))))
    if SR:
        rows['osrs'] = [SR.get((o, s)) for o, s in zip(rows.opp, rows.season)]; rows['srs'] = [SR.get((t, s)) for t, s in zip(rows.team, rows.season)]
        ea = rows[rows.date.dt.month.isin([11, 12]) & (rows.osrs < -5)].dropna(subset=['srs'])
        ea = ea.assign(res=ea.margin - (ea.srs - ea.osrs) - (ea.home - .5) * 6).groupby(['team', 'season']).res.mean().rename('blow').reset_index()
        late = L[L.date.dt.month.isin([1, 2, 3])].merge(ea, on=['team', 'season'])
        M('B6-16', 'Nov–Dec margin beyond SRS against weak teams (per 10 pts) -> January–March vs the line', late, late.blow / 10, 'pts per 10')
    # ---------- BH pass and notices ----------
    R = reg.df(); R = R[R.hyp.astype(str).str.startswith('B6-')].copy()
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    lines = [f'bbhunt6 · {len(R)} tests · college basketball 2008 on (lines 2014 on) · BH q < .10 and the holdout ({HOLD} on) the same way']
    for _, x in R.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:330]}")
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=bbhunt6 {i + 1:02d}/{len(pack):02d}::{x}')
