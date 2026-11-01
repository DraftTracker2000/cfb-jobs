# Pattern hunt 3 — college basketball (CBBD player seasons, rosters, recruits, games, SRS; head coaches from the site's own coaches pack,
# p2026_cbb-coaches, built by the basketball job from ESPN — read-only here). STUDY ONLY.
#  B01 head coaches whose players jump year to year (beyond class year and level; named, split-half)
#  B02 freshman-to-sophomore jump beyond older players, by position   B03 transfers: production carries over (movers' r); movers' change
#  B04 transfer level change: per-40 change per SRS point of the new team   B05 program home edge repeats; named programs
#  B06 programs that rise late (Feb-Mar margin beyond SRS minus Nov-Dec) repeat   B07 staff recruit hit rates (first two seasons beyond rating)
import os, glob, gzip, json
import numpy as np, pandas as pd
from lib3 import *
from load import frame, pick, num

def coaches(data_dir):
    f = glob.glob(os.path.join(data_dir, 'site_p2026_cbb-coaches.json.gz'))
    if not f: return {}
    j = json.load(gzip.open(f[0])); j = j.get('cbb-coaches', j)
    names = {k: v.get('nm') for k, v in (j.get('coaches') or {}).items()}
    out = {}
    for s, M in (j.get('bySeason') or {}).items():
        for t, c in (M or {}).items(): out[(str(t), int(s))] = names.get(str(c), str(c))
    return out

def run(reg, log, data_dir):
    s = frame('bb_stats')
    if not len(s): log('cbb: no player stats'); return
    m = num(pick(s, 'minutes'))
    S = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str),
                      'team': pick(s, 'team'), 'pos': pick(s, 'position'), 'min': m, 'name': pick(s, 'name'),
                      'p40': num(pick(s, 'points')) / m * 40, 'ws40': num(pick(s, 'winShares.totalPer40')), 'porpag': num(pick(s, 'PORPAG', 'porpag'))})
    S = S[S['min'] >= 200].drop_duplicates(['pid', 'season'])
    met = 'ws40' if S.ws40.notna().mean() > .5 else 'p40'
    log(f'cbb: {len(S)} player-seasons with 200+ minutes, {int(S.season.min())}-{int(S.season.max())}; metric {met}')
    ro = frame('bb_roster', flat=False); start = {}
    if len(ro) and 'players' in ro:
        for L in ro.players:
            for p in L if isinstance(L, list) else []:
                if p.get('startSeason'): start[str(p.get('id'))] = p['startSeason']
    S['yr'] = S.season - S.pid.map(start) + 1
    srs = frame('bb_srs'); sr = pd.DataFrame({'tid': pick(srs, 'teamId').astype(str), 'season': num(pick(srs, 'season', '_year')), 'srs': num(pick(srs, 'rating'))}).dropna().drop_duplicates(['tid', 'season']).set_index(['tid', 'season']).srs
    CO = coaches(data_dir); log(f'cbb coaches pack: {len(CO)} team-seasons; matched to stat teams {np.mean([(t, int(y)) in CO for t, y in zip(S.tid, S.season)]):.2f}')
    a = S[['pid', 'season', 'tid', 'pos', 'yr', met]]; b = a.copy(); b['season'] -= 1
    j = a.merge(b, on=['pid', 'season'], suffixes=('', '_n')); j['mover'] = (j.tid != j.tid_n).astype(float); j['chg'] = j[met + '_n'] - j[met]
    j = j.dropna(subset=[met, met + '_n'])
    # B03 transfers
    mv = j[j.mover == 1]; st = j[j.mover == 0]; r1, p1_, k1 = rtest(mv[met], mv[met + '_n']); r0, _, k0 = rtest(st[met], st[met + '_n'])
    h = mv[mv.season + 1 >= HOLD]; rh, ph, kh = rtest(h[met], h[met + '_n'])
    reg.add('B03', f'Basketball transfer: {met} carries over (movers, r)', 'family', r1, np.nan, p1_, k1, oos_pass=bool(np.isfinite(rh) and rh > 0 and ph < .10),
            detail=f'movers r {r1:.3f} ({k1}); stayers r {r0:.3f} ({k0}); holdout r {rh:.3f} ({kh})', unit='r')
    r_ = coef(reg, 'B03', f'Basketball movers change beyond regression to the mean ({met})', j[met + '_n'], [j[met], j.mover], ['this', 'mover'], j.pid, j.season + 1, 'mover', unit=met)
    log(f'B03 movers r {r1:.3f} ({k1}) vs stayers {r0:.3f}; {r_["d"]}')
    m2 = mv.copy(); m2['gap'] = [sr.get((b_, s_ + 1), np.nan) - sr.get((a_, s_), np.nan) for a_, b_, s_ in zip(m2.tid, m2.tid_n, m2.season)]; m2 = m2.dropna(subset=['gap'])
    if len(m2) > 50:
        r_ = mech(reg, 'B04', f'Basketball transfer level change: {met} change per SRS point of the new team over the old', m2.chg, m2.gap, m2.pid, m2.season + 1, unit=f'{met} per SRS pt')
        log('B04 ' + r_['d'])
    # B02 freshman -> sophomore
    for g_ in ['G', 'F', 'C']:
        x = st[st.pos.astype(str).str.startswith(g_)].dropna(subset=['yr'])
        x = x[x.yr.between(1, 4)].assign(frosh=lambda d: (d.yr == 1).astype(float))
        if len(x) < 100 or x.frosh.sum() < 30: continue
        r_ = coef(reg, 'B02', f'Basketball freshman-to-sophomore jump beyond older players ({g_})', x.chg, [x.frosh, x[met]], ['frosh', 'level'], x.pid, x.season + 1, 'frosh', unit=met,
                  detail=f'{int(x.frosh.sum())} freshman pairs')
        log(f'B02 {g_}: ' + r_['d'])
    # B01 coaches whose players jump
    x = st.dropna(subset=['yr']).copy(); x = x[x.yr.between(1, 4)]
    if len(x) > 200:
        X = np.column_stack([np.ones(len(x)), x[met]] + [(x.yr == k).astype(float) for k in (1, 2, 3)]); bb = np.linalg.lstsq(X, x.chg, rcond=None)[0]; x['res'] = x.chg - X @ bb
        x['coach'] = [CO.get((t, int(s_) + 1)) for t, s_ in zip(x.tid, x.season)]; x['season'] = x.season + 1
        Tn, fam = named(reg, 'B01', f'Basketball head coach whose players jump ({met} beyond class and level)', x.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=40, g='pid', unit=met)
        log(f'B01 split-half r {fam[0]:.2f} ({fam[2]} coaches)')
        if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'oos', 'loo']].round(4).to_string())
        Sx = x.dropna(subset=['coach']).groupby(['season', 'tid', 'coach']).res.agg(['mean', 'count']).reset_index().rename(columns={'mean': 'v'})
        Sx = Sx[Sx['count'] >= 3]; Sx['key'] = Sx.tid + '|' + Sx.coach
        o = yoy(Sx, 'key', 'v'); log('B01 ' + reg_yoy(reg, 'B01', f'Basketball team-season player jumps repeat (same team and coach)', o))
    # games
    g = frame('bb_games')
    if len(g):
        G = pd.DataFrame({'gid': pick(g, 'id'), 'season': num(pick(g, 'season', '_year')), 'h': pick(g, 'homeTeamId').astype(str), 'a': pick(g, 'awayTeamId').astype(str),
                          'hp': num(pick(g, 'homePoints')), 'ap': num(pick(g, 'awayPoints')), 'neutral': pick(g, 'neutralSite').fillna(False).astype(bool),
                          'date': pd.to_datetime(pick(g, 'startDate'), errors='coerce', utc=True), 'st': pick(g, 'seasonType')}).dropna(subset=['hp', 'ap']).drop_duplicates('gid')
        G = G[~G.st.astype(str).str.contains('post', case=False)]
        G['hs'] = [sr.get((t, s_)) for t, s_ in zip(G.h, G.season)]; G['as_'] = [sr.get((t, s_)) for t, s_ in zip(G.a, G.season)]
        G = G.dropna(subset=['hs', 'as_']); G['m'] = G.hp - G.ap
        h_ = G.assign(team=G.h, margin=G.m, home=np.where(G.neutral, .5, 1.0), over=G.m - (G.hs - G.as_)); a_ = G.assign(team=G.a, margin=-G.m, home=np.where(G.neutral, .5, 0.0), over=-(G.m - (G.hs - G.as_)))
        TG = pd.concat([h_, a_]).rename(columns={'gid': 'game_id'})
        HH = TG[~TG.neutral]; hs = HH.groupby(['season', 'team', 'home']).margin.mean().unstack(); Sh = (hs[1.0] - hs[0.0]).rename('v').reset_index()
        o = yoy(Sh, 'team', 'v'); log(f'B05 basketball home edge SD {Sh.v.std():.2f}; ' + reg_yoy(reg, 'B05', 'Basketball program home edge (home margin minus road margin)', o))
        HH = HH.assign(sc=np.where(HH.home == 1, HH.over, -HH.over))
        Tn, fam = named(reg, 'B05', 'Basketball program home edge beyond SRS (half of home-minus-road)', HH, 'team', 'sc', min_seasons=10, unit='points')
        if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'oos', 'loo']].round(3).to_string())
        TG['mo'] = TG.date.dt.month; TG['late'] = np.where(TG.mo.isin([2, 3]), 1, np.where(TG.mo.isin([11, 12]), -1, 0))
        L = TG[TG.late != 0]; ls = L.groupby(['season', 'team', 'late']).over.mean().unstack(); Sl = (ls[1] - ls[-1]).rename('v').reset_index()
        o = yoy(Sl, 'team', 'v'); log('B06 ' + reg_yoy(reg, 'B06', 'Basketball late riser (Feb-Mar margin beyond SRS minus Nov-Dec)', o))
    # B07 recruits' first two seasons beyond their rating, by head coach at signing
    rc = frame('bb_recruits')
    if len(rc):
        R = pd.DataFrame({'pid': pick(rc, 'athleteId').astype(str), 'year': num(pick(rc, 'year', '_year')), 'rating': num(pick(rc, 'rating')), 'stars': num(pick(rc, 'stars')),
                          'tid': pick(rc, 'committedTo.id').astype(str).str.replace(r'\.0$', '', regex=True)}).dropna(subset=['rating', 'year'])
        R = R[~R.pid.isin(['nan', 'None'])]
        first2 = S.merge(R[['pid', 'year']], on='pid'); first2 = first2[first2.season.between(first2.year + 1, first2.year + 2)].groupby('pid')[met].mean()
        R['got'] = R.pid.map(first2).fillna(S[met].quantile(.05))
        R['rb'] = pd.qcut(R.rating.rank(method='first'), 10, labels=False); R['res'] = R.got - R.groupby('rb').got.transform('mean')
        R['coach'] = [CO.get((t, int(y) + 1)) for t, y in zip(R.tid, R.year)]; R['season'] = R.year.astype(int)
        Tn, fam = named(reg, 'B07', 'Basketball staff whose recruits beat their rating in their first two seasons', R.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=20, g='pid', unit=met)
        log(f'B07: {len(R)} recruits; split-half r {fam[0]:.2f} ({fam[2]})')
        if len(Tn): log(Tn.sort_values('p').head(6)[['name', 'ns', 'n', 'est', 'p', 'oos', 'loo']].round(4).to_string())
