# Pattern hunt 3 — college football players: transfers, freshman-to-sophomore, returning production, recruiting hit rates, college -> NFL.
# STUDY ONLY. Player-season lines are CFBD /stats/player/season (by category); the player id is CFBD's athlete id, which stays the same
# when a player changes schools, so transfers are found for every season (2004 on), not only the portal years.
#  P01 transfer QB efficiency (yards per attempt) carries over (movers' r) | P02 movers drop beyond regression to the mean
#  P03 QB value per dropback (CFBD PPA, 2014 on) carries over a transfer | P04 transfers by position: share of the team's production carries
#  P05 the level change: a mover's drop grows with the new team's strength (SRS gap) | P06 portal stars predict the move beyond production
#  P07 freshman-to-sophomore jump beyond upperclassmen, by position | P08 head coaches whose sophomores jump (named, split-half)
#  P09 returning production predicts next season beyond this season's rating
#  P10 recruiting hit rates by staff: recruits drafted beyond their rating, by head coach at signing (named, split-half)
#  P11 in-state recruits are drafted more than their rating says
#  N01 college conference beats/misses the NFL draft slot (repeats across eras; named conferences) | N02 Group of 5 vs Power conferences
#  N03 WR/TE college market share beats the slot | N04 QB college YPA / completion beats the slot | N05 QB third-down value (PPA) beats the slot
#  N06 RB college receiving share beats the slot | N07 college sack share (DL/LB) beats the slot | N08 recruiting stars beat the slot
#  N09 WR breakout age beats the slot | N10 players drafted after 3 or fewer college seasons beat the slot
import os, re
import numpy as np, pandas as pd
from lib3 import *
from load import frame, pick, num, norm_name, school

HERE = os.path.dirname(os.path.abspath(__file__))
GRP = {'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE', 'DL': 'DL', 'DE': 'DL', 'DT': 'DL', 'NT': 'DL', 'LB': 'LB', 'OLB': 'LB',
       'ILB': 'LB', 'DB': 'DB', 'CB': 'DB', 'S': 'DB', 'FS': 'DB', 'SS': 'DB'}

def player_seasons():
    s = frame('cf_pstats')
    s = pd.DataFrame({'pid': pick(s, 'playerId', 'player_id').astype(str), 'name': pick(s, 'player'), 'pos': pick(s, 'position'),
                      'team': pick(s, 'team'), 'conf': pick(s, 'conference'), 'season': num(pick(s, 'season', '_year')),
                      'k': pick(s, 'category').astype(str) + '.' + pick(s, 'statType', 'stat_type').astype(str), 'v': num(pick(s, 'stat'))})
    s = s.dropna(subset=['v', 'season'])
    P = s.pivot_table(index=['pid', 'season', 'team'], columns='k', values='v', aggfunc='first').reset_index()
    meta = s.drop_duplicates(['pid', 'season', 'team']).set_index(['pid', 'season', 'team'])[['name', 'pos', 'conf']]
    P = P.join(meta, on=['pid', 'season', 'team']); P['grp'] = P.pos.map(GRP)
    g = lambda c: P[c] if c in P else pd.Series(np.nan, index=P.index)
    for c in ['passing.ATT', 'passing.YDS', 'passing.COMPLETIONS', 'passing.TD', 'passing.INT', 'rushing.CAR', 'rushing.YDS', 'receiving.REC',
              'receiving.YDS', 'defensive.TOT', 'defensive.SACKS', 'defensive.TFL']: P[c] = g(c)
    tot = P.groupby(['team', 'season'])[['passing.ATT', 'rushing.YDS', 'receiving.YDS', 'defensive.TOT', 'defensive.SACKS', 'passing.YDS']].transform('sum')
    P['ypa'] = (P['passing.YDS'] / P['passing.ATT']).where(P['passing.ATT'] >= 100)
    P['cmp'] = (P['passing.COMPLETIONS'] / P['passing.ATT']).where(P['passing.ATT'] >= 100)
    P['ypc'] = (P['rushing.YDS'] / P['rushing.CAR']).where(P['rushing.CAR'] >= 60)
    P['rush_sh'] = P['rushing.YDS'] / tot['rushing.YDS']; P['rec_sh'] = P['receiving.YDS'] / tot['receiving.YDS']
    P['tkl_sh'] = P['defensive.TOT'] / tot['defensive.TOT']; P['sack_sh'] = P['defensive.SACKS'] / tot['defensive.SACKS'].replace(0, np.nan)
    P['yds'] = P[['passing.YDS', 'rushing.YDS', 'receiving.YDS']].fillna(0).sum(1)
    P['team_yds'] = P.groupby(['team', 'season']).yds.transform('sum')
    return P

def nxt(P, cols):
    a = P[['pid', 'season', 'team', 'grp', 'name'] + cols].copy(); b = a.copy(); b['season'] -= 1
    j = a.merge(b, on=['pid', 'season'], suffixes=('', '_n'))
    j['mover'] = (j.team != j.team_n).astype(float); return j

def run(reg, log, G, T, CO, TS):
    P = player_seasons(); log(f'player-seasons: {len(P)}; with a position group {P.grp.notna().mean():.2f}; seasons {int(P.season.min())}-{int(P.season.max())}')
    srs = TS.set_index(['team', 'season']).srs; co = CO.set_index(['team', 'season']).coach
    # ---------------- transfers ----------------
    def carry(hyp, label, j, c, unit):
        j = j.dropna(subset=[c, c + '_n']); mv = j[j.mover == 1]; st = j[j.mover == 0]
        r1, p1_, k1 = rtest(mv[c], mv[c + '_n']); r0, _, k0 = rtest(st[c], st[c + '_n']); h = mv[mv.season + 1 >= HOLD]; rh, ph, kh = rtest(h[c], h[c + '_n'])
        reg.add(hyp, f'{label}: carries over a transfer (movers, r)', 'family', r1, np.nan, p1_, k1, oos_pass=bool(np.isfinite(rh) and rh > 0 and ph < .10),
                detail=f'movers r = {r1:.3f} ({k1}); stayers r = {r0:.3f} ({k0}); holdout (moved into {HOLD}+) r = {rh:.3f} (p {ph:.3g}, {kh})', unit='r')
        # beyond regression to the mean: next = a + b*this + c*mover
        Tb, n = ols_cl(j[c + '_n'], [j[c], j.mover], j.pid, ['this', 'mover'])
        hm = (j.season + 1 >= HOLD).values; Th, nh = ols_cl(j[c + '_n'].values[hm], [j[c].values[hm], j.mover.values[hm]], j.pid.values[hm], ['this', 'mover'])
        bm, sm, pm = Tb.loc['mover']; bh_, sh_ = Th.loc['mover', 'b'], Th.loc['mover', 'se']
        ph2 = p1(bh_ / sh_ * np.sign(bm)) if sh_ > 0 else np.nan
        reg.add(hyp, f'{label}: movers change beyond regression to the mean (mover coefficient)', 'mechanism', bm, sm, pm, n, oos_pass=bool(np.isfinite(ph2) and ph2 < .10),
                detail=f'{int(j.mover.sum())} moves of {n} pairs; mover {bm:+.4f} (se {sm:.4f}); holdout {bh_:+.4f} (se {sh_:.4f}); clustered by player', unit=unit)
        log(f'{hyp} {label}: movers r {r1:.3f} ({k1}) vs stayers {r0:.3f}; holdout {rh:.3f}; mover change {bm:+.4f} (se {sm:.4f})')
        return j
    j = nxt(P, ['ypa', 'cmp'])
    jq = carry('P01', 'Transfer QB yards per attempt', j[j.grp == 'QB'], 'ypa', 'yards/att')
    carry('P02', 'Transfer QB completion rate', j[j.grp == 'QB'], 'cmp', 'share')
    # P03 PPA
    pp = frame('cf_ppa')
    if len(pp):
        Q = pd.DataFrame({'pid': pick(pp, 'id').astype(str), 'season': num(pick(pp, 'season', '_year')), 'team': pick(pp, 'team'), 'pos': pick(pp, 'position'),
                          'ppa': num(pick(pp, 'averagePPA.pass', 'average_ppa.pass')), 'ppa3': num(pick(pp, 'averagePPA.thirdDown', 'average_ppa.third_down')),
                          'name': pick(pp, 'name')})
        Q['grp'] = Q.pos.map(GRP)
        qa = P[P.grp == 'QB'][['pid', 'season', 'team', 'passing.ATT']]
        Q = Q.merge(qa, on=['pid', 'season', 'team']); Q = Q[Q['passing.ATT'] >= 100]
        carry('P03', 'Transfer QB value per pass (CFBD PPA)', nxt(Q.assign(grp='QB'), ['ppa', 'ppa3']), 'ppa', 'PPA')
    else: Q = pd.DataFrame()
    j2 = nxt(P, ['rush_sh', 'rec_sh', 'tkl_sh', 'sack_sh', 'ypc'])
    for g_, c in [('RB', 'rush_sh'), ('RB', 'ypc'), ('WR', 'rec_sh'), ('TE', 'rec_sh'), ('LB', 'tkl_sh'), ('DB', 'tkl_sh'), ('DL', 'sack_sh')]:
        x = j2[j2.grp == g_]; x = x[(x[c] >= (.05 if c != 'ypc' else 0))] if c != 'ypc' else x
        carry('P04', f'Transfer {g_} {c}', x, c, 'share' if c != 'ypc' else 'yards/carry')
    # P05 level change for QBs
    m = jq[jq.mover == 1].copy(); m['gap'] = [(srs.get((b_, s + 1), np.nan) - srs.get((a_, s), np.nan)) for a_, b_, s in zip(m.team, m.team_n, m.season)]
    m = m.dropna(subset=['gap', 'ypa', 'ypa_n']); m['chg'] = m.ypa_n - m.ypa
    if len(m) > 30:
        r_ = mech(reg, 'P05', 'Transfer QB: YPA change per SRS point of the new team over the old (level change)', m.chg, m.gap, m.pid, m.season + 1, unit='yards/att per SRS pt',
                  detail=f'{len(m)} QB moves with SRS for both schools')
        log('P05 ' + r_['d'])
    # P06 portal stars
    po = frame('cf_portal')
    if len(po) and len(Q):
        po = pd.DataFrame({'nm': (pick(po, 'firstName').astype(str) + pick(po, 'lastName').astype(str)).map(norm_name), 'origin': pick(po, 'origin'),
                           'dest': pick(po, 'destination'), 'pseason': num(pick(po, 'season', '_year')), 'stars': num(pick(po, 'stars')), 'rating': num(pick(po, 'rating')),
                           'pos': pick(po, 'position')})
        mm = j2.merge(P[['pid', 'season', 'name']], on=['pid', 'season'], how='left', suffixes=('', '_x'))
        mm = mm[mm.mover == 1].copy(); mm['nm'] = mm.name.map(norm_name)
        mm = mm.merge(po.dropna(subset=['stars']), left_on=['nm', 'team'], right_on=['nm', 'origin']); mm = mm[mm.pseason == mm.season + 1]
        for c in ['rec_sh', 'rush_sh', 'tkl_sh']:
            x = mm.dropna(subset=[c, c + '_n']).copy()
            if len(x) < 40: continue
            b = np.polyfit(x[c], x[c + '_n'], 1); x['res'] = x[c + '_n'] - np.polyval(b, x[c])
            r_ = mech(reg, 'P06', f'Portal stars predict post-transfer {c} beyond prior production (per star)', x.res, x.stars, x.pid, x.season + 1, unit='share per star',
                      detail=f'{len(x)} portal movers matched by name and school')
            log(f'P06 {c}: ' + r_['d'])
    # ---------------- freshman -> sophomore ----------------
    rc = frame('cf_recruits')
    R_ = pd.DataFrame({'aid': pick(rc, 'athleteId', 'athlete_id').astype(str), 'year': num(pick(rc, 'year', '_year')), 'stars': num(pick(rc, 'stars')),
                       'rating': num(pick(rc, 'rating')), 'team': pick(rc, 'committedTo', 'committed_to'), 'name': pick(rc, 'name'),
                       'state': pick(rc, 'stateProvince', 'state_province'), 'pos': pick(rc, 'position'), 'rid': pick(rc, 'id').astype(str)}) if len(rc) else pd.DataFrame()
    log(f'recruits: {len(R_)}; with an athlete id {(R_.aid.notna() & ~R_.aid.isin(["nan", "None", ""])).mean() if len(R_) else 0:.2f}')
    if len(R_):
        cls = R_[~R_.aid.isin(['nan', 'None', ''])].dropna(subset=['year']).drop_duplicates('aid').set_index('aid').year
        # older recruits have no athlete id: the roster's recruitIds link a player id to his recruit record (and so his class)
        ro = frame('cf_roster', flat=False); ry = R_.dropna(subset=['year']).drop_duplicates('rid').set_index('rid').year
        if len(ro) and 'recruitIds' in ro:
            extra = {}
            for pid_, L in zip(ro['id'].astype(str), ro['recruitIds']):
                if isinstance(L, list):
                    for r_id in L:
                        if str(r_id) in ry.index: extra.setdefault(pid_, ry[str(r_id)])
            cls = pd.concat([cls, pd.Series(extra, dtype=float)]); cls = cls[~cls.index.duplicated()]
        log(f'P07: recruit class known for {len(cls)} player ids')
        j3 = nxt(P, ['ypa', 'rush_sh', 'rec_sh', 'tkl_sh', 'sack_sh'])
        j3 = j3[j3.mover == 0].copy(); j3['cls'] = j3.pid.map(cls); j3 = j3.dropna(subset=['cls'])
        j3['yr'] = j3.season - j3.cls + 1            # 1 = true freshman season
        j3['frosh'] = (j3.yr == 1).astype(float); j3 = j3[j3.yr.between(1, 4)]
        for g_, c in [('QB', 'ypa'), ('RB', 'rush_sh'), ('WR', 'rec_sh'), ('TE', 'rec_sh'), ('LB', 'tkl_sh'), ('DB', 'tkl_sh'), ('DL', 'sack_sh')]:
            x = j3[(j3.grp == g_)].dropna(subset=[c, c + '_n'])
            if len(x) < 60 or x.frosh.sum() < 20: continue
            x = x.assign(chg=x[c + '_n'] - x[c])
            r_ = coef(reg, 'P07', f'Freshman-to-sophomore jump beyond upperclassmen ({g_}, {c})', x.chg, [x.frosh, x[c]], ['frosh', 'level'], x.pid, x.season + 1, 'frosh',
                      unit='share' if c != 'ypa' else 'yards/att', detail=f'{int(x.frosh.sum())} freshman-to-sophomore pairs, {int((1 - x.frosh).sum())} older pairs; controls this season\'s level')
            log(f'P07 {g_} {c}: ' + r_['d'])
        # P08 coaches whose sophomores jump: residual of the change after level, freshmen only, all skill/defense shares pooled (z-scored within group)
        rows = []
        for g_, c in [('RB', 'rush_sh'), ('WR', 'rec_sh'), ('TE', 'rec_sh'), ('LB', 'tkl_sh'), ('DB', 'tkl_sh')]:
            x = j3[(j3.grp == g_)].dropna(subset=[c, c + '_n']).copy()
            if len(x) < 60: continue
            b = np.polyfit(x[c], x[c + '_n'], 1); x['res'] = (x[c + '_n'] - np.polyval(b, x[c])); x['res'] = x.res / x.res.std()
            rows.append(x[x.frosh == 1][['pid', 'season', 'team', 'res']])
        if rows:
            F = pd.concat(rows); F['coach'] = [co.get((t, s + 1)) for t, s in zip(F.team, F.season)]; F['season'] = F.season + 1
            Tn, fam = named(reg, 'P08', 'Head coach whose sophomores jump (z-score of the jump beyond the level)', F.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, g='pid', unit='z')
            log(f'P08 split-half r {fam[0]:.2f} ({fam[2]})')
            if len(Tn): log(Tn.sort_values('p').head(6)[['name', 'ns', 'n', 'est', 'p', 'oos', 'loo']].round(3).to_string())
    # ---------------- returning production ----------------
    rp = P[['pid', 'season', 'team', 'yds', 'team_yds']].copy(); nx_ = rp[['pid', 'season', 'team']].copy(); nx_['season'] -= 1; nx_['back'] = 1
    rp = rp.merge(nx_, on=['pid', 'season', 'team'], how='left').fillna({'back': 0})
    ret = rp.groupby(['team', 'season']).apply(lambda d: (d.yds * d.back).sum() / max(d.yds.sum(), 1), include_groups=False).rename('ret').reset_index()
    ts = TS[['team', 'season', 'srs']].copy(); tn = ts.copy(); tn['season'] -= 1
    J = ret.merge(ts, on=['team', 'season']).merge(tn, on=['team', 'season'], suffixes=('', '_n')).dropna()
    if len(J) > 100:
        J['chg'] = J.srs_n - J.srs
        r_ = coef(reg, 'P09', 'Returning offensive production predicts next season (SRS change per 100% returning)', J.chg, [J.ret, J.srs], ['ret', 'srs'], J.team, J.season + 1, 'ret',
                  unit='SRS points', detail=f'{len(J)} team-seasons; controls this season\'s SRS (regression to the mean)')
        log('P09 ' + r_['d'])
    # ---------------- recruiting hit rates by staff (drafted beyond rating) ----------------
    dr = pd.read_csv(os.path.join(HERE, 'nfl_draft.csv'), comment='#')
    dr['nm'] = dr.name.map(norm_name); dr['sch'] = dr.college.map(school)
    if len(R_):
        X = R_.dropna(subset=['rating', 'year']).copy(); X = X[(X.year >= 2003) & (X.year <= 2020)]
        X['nm'] = X.name.map(norm_name)
        hit = set(zip(dr.nm, dr.sch)); hitn = dr.groupby('nm').draft_year.apply(list).to_dict()
        X['drafted'] = [float((n, t) in hit or any(y + 3 <= dy <= y + 6 for dy in hitn.get(n, []))) for n, t, y in zip(X.nm, X.team, X.year)]
        X['rb'] = pd.qcut(X.rating.rank(method='first'), 20, labels=False); X['exp'] = X.groupby('rb').drafted.transform('mean'); X['res'] = X.drafted - X.exp
        X['coach'] = [co.get((t, y)) for t, y in zip(X.team, X.year)]; X['season'] = X.year.astype(int)
        log(f'P10: {len(X)} recruits 2003-20; drafted {X.drafted.mean():.3f}; 5-star {X[X.stars == 5].drafted.mean():.2f}, 3-star {X[X.stars == 3].drafted.mean():.3f}')
        Tn, fam = named(reg, 'P10', 'Staff gets recruits drafted beyond their rating (head coach at signing)', X.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=60, g='rid', unit='draft rate')
        log(f'P10 split-half r {fam[0]:.2f} ({fam[2]})')
        if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'oos', 'loo']].round(3).to_string())
        lo = X[X.stars <= 3]
        Tn, fam = named(reg, 'P10', 'Staff develops 3-star-and-below recruits into draft picks', lo.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=50, g='rid', unit='draft rate')
        if len(Tn): log(Tn.sort_values('p').head(6)[['name', 'ns', 'n', 'est', 'p', 'oos', 'loo']].round(3).to_string())
        # P11 in-state
        tstate = frame('cf_teams'); st = dict(zip(pick(tstate, 'school'), pick(tstate, 'location.state', 'state')))
        X['instate'] = [float(st.get(t) == s) if st.get(t) and isinstance(s, str) else np.nan for t, s in zip(X.team, X.state)]
        x = X.dropna(subset=['instate'])
        r_ = mech(reg, 'P11', 'In-state recruits are drafted beyond their rating', x.res, x.instate, x.rid, x.season + 4, unit='draft rate', detail=f'{len(x)} recruits; in-state {x.instate.mean():.2f}')
        log('P11 ' + r_['d'])
    # ---------------- college -> NFL (nflverse draft + round-1 starter rate) ----------------
    nf = pd.read_csv(os.path.join(HERE, 'nfl_start4.csv'), comment='#'); nf['nm'] = nf.name.map(norm_name); nf['sch'] = nf.college.map(school)
    P['nm'] = P.name.map(norm_name)
    last = P.sort_values('season').drop_duplicates(['pid', 'team'], keep='last')
    M = nf.merge(last, left_on=['nm', 'sch'], right_on=['nm', 'team'], how='left', suffixes=('', '_c'))
    M = M[(M.season.isna()) | (M.season.between(M.draft_year - 2, M.draft_year - 1))].sort_values('season').drop_duplicates('gsis_id', keep='last')
    log(f'N: {len(nf)} picks 2002-20; matched to a college line {M.season.notna().mean():.2f}')
    cs = TS.set_index(['team', 'season']).conf
    M['conf'] = [cs.get((t, s)) if isinstance(t, str) else None for t, s in zip(M.sch, M.draft_year - 1)]
    P5 = {'SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12', 'Pac-10', 'Big East', 'FBS Independents'}
    M['g5'] = np.where(M.conf.isna(), np.nan, (~M.conf.isin(P5)).astype(float))
    def nt(hyp, label, x, col, unit):
        x = x.dropna(subset=[col, 'res'])
        if len(x) < 40: log(f'{hyp} {label}: only {len(x)}'); return
        b, se, n = cdiff(x.res, x[col], x.sch); h = x.draft_year >= 2016; bh_, sh_, nh = cdiff(x.res[h], x[col][h], x.sch[h])
        e1 = x.draft_year <= 2010; b1, _, _ = cdiff(x.res[e1], x[col][e1], x.sch[e1])
        ph = p1(bh_ / sh_ * np.sign(b)) if sh_ and sh_ > 0 else np.nan
        reg.add(hyp, label, 'mechanism', b, se, p2(b / se) if se > 0 else 1, n, oos_pass=bool(np.isfinite(ph) and ph < .10),
                detail=f'{n} picks; {b:+.4f} (se {se:.4f}); classes 2002-10 {b1:+.4f}; holdout 2016-20 {bh_:+.4f} (se {sh_:.4f}, p {ph:.3g}, {nh}); clustered by school', unit=unit)
        log(f'{hyp} {label}: {b:+.4f} (se {se:.4f}, n {n}); holdout {bh_:+.4f} (p {ph:.3g})')
    nt('N02', 'Group of 5 / FCS-level conference picks vs Power picks, beyond the slot (starter rate)', M, 'g5', 'starter rate')
    e = M[M.draft_year <= 2011].groupby('conf').res.agg(['mean', 'count']); l = M[M.draft_year > 2011].groupby('conf').res.agg(['mean', 'count'])
    jj = e.join(l, lsuffix='_e', rsuffix='_l', how='inner'); jj = jj[(jj.count_e >= 15) & (jj.count_l >= 15)]
    r, p, k = rtest(jj.mean_e, jj.mean_l)
    reg.add('N01', 'College conference beats its slot — repeats across draft eras (r)', 'family', r, np.nan, p, k, oos_pass=bool(np.isfinite(r) and r > 0),
            detail=f'{k} conferences with 15+ picks per era: ' + ', '.join(f'{c} {a:+.3f}/{b_:+.3f}' for c, a, b_ in zip(jj.index, jj.mean_e, jj.mean_l)), unit='r')
    for c_, x in M.dropna(subset=['conf']).groupby('conf'):
        if len(x) < 60: continue
        est = x.res.mean(); se = x.res.std(ddof=1) / np.sqrt(len(x)); late = x[x.draft_year > 2011].res
        reg.add('N01', f'Conference beats its slot: {c_}', 'named', est, se, tp(est / se, len(x) - 1), len(x),
                oos_pass=bool(len(late) > 10 and np.sign(late.mean()) == np.sign(est) and p1(late.mean() / (late.std(ddof=1) / np.sqrt(len(late))) * np.sign(est)) < .10),
                loo_pass=None, detail=f'{len(x)} picks; started {x.start4.mean():.3f} vs {x.exp.mean():.3f} by slot; later classes {late.mean():+.3f}', unit='starter rate')
    log(f'N01 conferences across eras r = {r:.3f} ({k})')
    nt('N03', 'WR college receiving-yards share (final season) beats the slot, per 10 pts of share', M[M.pg == 'WR'].assign(sh10=lambda d: d.rec_sh * 10), 'sh10', 'starter rate')
    nt('N03', 'TE college receiving-yards share beats the slot, per 10 pts', M[M.pg == 'TE'].assign(sh10=lambda d: d.rec_sh * 10), 'sh10', 'starter rate')
    nt('N04', 'QB college yards per attempt beats the slot (per yard)', M[M.pg == 'QB'], 'ypa', 'starter rate')
    nt('N04', 'QB college completion rate beats the slot (per 10 pts)', M[M.pg == 'QB'].assign(c10=lambda d: d.cmp * 10), 'c10', 'starter rate')
    if len(Q):
        q3 = Q.sort_values('season').drop_duplicates('pid', keep='last')[['pid', 'ppa3', 'ppa']]
        nt('N05', 'QB college third-down value (PPA per pass on 3rd down) beats the slot', M[M.pg == 'QB'].merge(q3, on='pid', how='left'), 'ppa3', 'starter rate')
    nt('N06', 'RB college receiving share beats the slot, per 10 pts', M[M.pg == 'RB'].assign(sh10=lambda d: d.rec_sh * 10), 'sh10', 'starter rate')
    nt('N07', 'DL/LB college sack share beats the slot, per 10 pts', M[M.pg.isin(['DL', 'LB'])].assign(sh10=lambda d: d.sack_sh * 10), 'sh10', 'starter rate')
    if len(R_):
        rs = R_.dropna(subset=['stars']).assign(nm=lambda d: d.name.map(norm_name)).drop_duplicates(['nm', 'team'])
        M2 = M.merge(rs[['nm', 'team', 'stars']].rename(columns={'team': 'rteam'}), left_on=['nm', 'sch'], right_on=['nm', 'rteam'], how='left')
        nt('N08', 'Recruiting stars beat the NFL slot (per star)', M2, 'stars', 'starter rate')
    # N09 breakout age (WR): first season with 20%+ of the team's receiving yards, age on Sept 1
    wr = P[(P.grp == 'WR') & (P.rec_sh >= .20)].groupby('pid').season.min().rename('bo')
    Mw = M[M.pg == 'WR'].copy(); Mw['bo'] = Mw.pid.map(wr)
    Mw['bo_age'] = Mw.bo - pd.to_datetime(Mw.birth_date, errors='coerce').dt.year - ((pd.to_datetime(Mw.birth_date, errors='coerce').dt.month >= 9) * 1)
    nt('N09', 'WR breakout age (first 20% share season) beats the slot (per year younger)', Mw.assign(young=lambda d: -d.bo_age), 'young', 'starter rate')
    # N10 3 or fewer college seasons with stats
    nseas = P.groupby('pid').season.nunique(); M['early'] = (M.pid.map(nseas) <= 3).astype(float).where(M.pid.notna())
    nt('N10', 'Drafted after 3 or fewer college seasons with stats beats the slot', M, 'early', 'starter rate')
