# Findings packs (Nov 1, 2026 — the owner, 10:03 am: the college and basketball findings "are good to go", Lab first). Builds the two site packs
# from the study archive, on the runner: study-data/findings/p2026_cfb-findings.json and p2026_cbb-findings.json (job/findings.mjs uploads
# them). Signed-in readable like any pack; finished numbers only, no raw study data.
# EVERY VALUE RE-CHECKS ITSELF ON EACH RUN: each family's repeat test is re-run on the data of the day, and a tag's `shows` is true only
# while its numbers pass the hunt's bar —
#   team-season tags (defense, home court, late risers): the family repeats (year-to-year r > 0, p < .001, and the 2022+ holdout r > 0 at
#     one-sided p < .10) AND the team is in its season's top or bottom fifth (|z| >= 0.84) AND last season pointed the same way;
#   coach / program names: Benjamini-Hochberg q < .10 within the family's named tests, the later half of his seasons keeps the sign
#     (one-sided p < .10), and leave-one-out holds (lib3.named);
#   single effects (transfer carry-over, draft flags, home-field splits): p < .01 and the 2022+ holdout (or 2016-20 draft classes) at
#     one-sided p < .10.
# Schema: docs/HOW-THIS-SITE-WORKS.md, "Findings packs". usage: python3 findings.py STUDY_DATA_DIR
import sys, os, json, time, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd
from scipy import stats
import load
from lib3 import Reg, bh, yoy, named, ols_cl, cdiff, rtest, p1, p2, HOLD

D = sys.argv[1]; OUT = os.path.join(D, 'findings'); os.makedirs(OUT, exist_ok=True); load.init(D)
HERE = os.path.dirname(os.path.abspath(__file__))
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print(s, flush=True)
R3 = lambda x: None if x is None or not np.isfinite(x) else round(float(x), 3)
R4 = lambda x: None if x is None or not np.isfinite(x) else round(float(x), 4)
def jsafe(o):
    if isinstance(o, dict): return {str(k): jsafe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [jsafe(v) for v in o]
    if isinstance(o, (np.floating, float)): return None if not np.isfinite(o) else round(float(o), 4)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.bool_,)): return bool(o)
    return o

def family(S, key, val, label):
    o = yoy(S, key, val)
    ok = bool(np.isfinite(o['r']) and o['r'] > 0 and o['p'] < .001 and o['oos'])
    return {'label': label, 'r': R3(o['r']), 'p': R4(o['p']), 'pairs': int(o['k']), 'r_hold': R3(o['r_hold']), 'p_hold': R4(o['p_hold']),
            'carry': R3(o['slope']), 'passes': ok}

def team_rows(S, key, val, fam, good, min_n=6, n='n'):
    """per team-season: value, z within the season, last season's sign, shows flag. good = -1 when low is the tag (killers), +1 when high."""
    S = S.copy(); S['z'] = S.groupby('season')[val].transform(lambda x: (x - x.mean()) / x.std())
    prev = S[[key, 'season', 'z']].copy(); prev['season'] += 1
    S = S.merge(prev.rename(columns={'z': 'zp'}), on=[key, 'season'], how='left')
    S['side'] = np.where(S.z * good > 0, 1, -1)           # 1 = the tag (killer / stuffer / home fortress ...), -1 = the opposite end
    S['repeat'] = (np.sign(S.zp) == np.sign(S.z)) & S.zp.notna()
    S['shows'] = fam['passes'] & (S.z.abs() >= .84) & S.repeat & (S[n] >= min_n)
    out = {}
    for t, d in S.sort_values('season').groupby(key):
        out[str(t)] = [[int(r.season), R3(getattr(r, val)), R3(r.z), int(getattr(r, n)), int(r.side), bool(r.repeat), bool(r.shows)] for r in d.itertuples()]
    cnt = S[S.shows]; latest = S.season.max()
    return out, {'shows': int(cnt.shape[0]), 'teams_ever': int(cnt[key].nunique()), 'latest_season': int(latest),
                 'shows_latest': int(cnt[cnt.season == latest].shape[0]), 'shows_latest_tag': int(cnt[(cnt.season == latest) & (cnt.side == 1)].shape[0])}

def names_bh(T):
    """named-test table (lib3.named) -> rows with q and shows"""
    if not len(T): return []
    T = T.copy(); T['q'] = bh(T.p.values); T['shows'] = (T.q < .10) & T.oos & T.loo
    return T

def effect(b, se, p, bh_, seh, n, nh, label, unit):
    ph = p1(bh_ / seh * np.sign(b)) if seh and np.isfinite(seh) and seh > 0 else np.nan
    return {'label': label, 'unit': unit, 'est': R4(b), 'se': R4(se), 'p': R4(p), 'n': int(n), 'est_hold': R4(bh_), 'p_hold': R4(ph), 'n_hold': int(nh),
            'passes': bool(p < .01 and np.isfinite(ph) and ph < .10)}

# =============================================== college football ===============================================
def cfb():
    import cfb_base, cfb_players, cfb_box, cfb_plays, home
    from load import frame, pick, num, norm_name, school
    P = {'v': 1, 'built': int(time.time() * 1000), 'note': 'study findings, re-checked every run; see docs/HOW-THIS-SITE-WORKS.md "Findings packs"', 'errors': []}
    G0, T, CO, TS = cfb_base.build(); co = CO.set_index(['team', 'season']).coach
    PS = cfb_players.player_seasons()
    # ---------- defense tags ----------
    try:
        B = cfb_box.box(); pos = PS.groupby('pid').grp.agg(lambda s: s.mode().iat[0] if s.notna().any() else None); B['grp'] = B.pid.map(pos)
        B = B[~B.post & B.conf.notna() & B.conf_o.notna()]
        def own(d, num_, den=None, min_g=4):
            k = ['pid', 'season', 'team']; sn = d.groupby(k)[num_].transform('sum'); n_ = d.groupby(k)[num_].transform('count')
            if den is None: return (d[num_] - (sn - d[num_]) / (n_ - 1)).where(n_ >= min_g)
            sd = d.groupby(k)[den].transform('sum'); return (d[num_] - d[den] * (sn - d[num_]) / (sd - d[den])).where((n_ >= min_g) & (sd - d[den] > 0))
        def seasonal(rows, val, w=None):
            rows = rows.dropna(subset=[val])
            if w is None: g = rows.groupby(['game_id', 'season', 'team_o'])[val].sum().rename('v').reset_index()
            else: g = rows.groupby(['game_id', 'season', 'team_o'])[[val, w]].sum().reset_index(); g['v'] = g[val] / g[w].replace(0, np.nan)
            return g.dropna(subset=['v']).rename(columns={'team_o': 'team'}).groupby(['season', 'team']).v.agg(['mean', 'size']).reset_index().rename(columns={'mean': 'v', 'size': 'n'})
        q = B[B.att >= 10].copy(); q['over'] = own(q, 'pyds', 'att'); q['iover'] = own(q, 'int', 'att')
        defs = {'qb_killer': (seasonal(q, 'over', 'att'), -1, 'QB killer: opposing QBs\' yards per attempt vs their own', 'yards/att'),
                'pick_defense': (seasonal(q, 'iover'), 1, 'Pick defense: interceptions per game beyond the QBs\' own rate', 'INT/game')}
        for k, gg, lab in [('wr_killer', 'WR', 'WR killer: opposing WRs\' receiving yards vs their own'), ('te_killer', 'TE', 'TE killer: opposing TEs\' receiving yards vs their own'),
                           ('rb_rec_killer', 'RB', 'RB-receiving killer: opposing RBs\' receiving yards vs their own')]:
            x = B[B.grp == gg].copy(); x['over'] = own(x, 'recyds'); defs[k] = (seasonal(x, 'over'), -1, lab, 'yards/game')
        x = B[(B.grp == 'RB') & (B.car >= 3)].copy(); x['over'] = own(x, 'ryds', 'car')
        defs['run_stuffer'] = (seasonal(x, 'over', 'car'), -1, 'Run-stuffer: opposing RBs\' yards per carry vs their own', 'yards/carry')
        sk = B.groupby(['game_id', 'season', 'team', 'team_o']).sacks.sum().reset_index()
        al = sk.groupby(['season', 'team_o']).sacks.agg(['sum', 'count']).rename(columns={'sum': 'as', 'count': 'ag'}); sk = sk.join(al, on=['season', 'team_o'])
        sk['v'] = sk.sacks - (sk['as'] - sk.sacks) / (sk.ag - 1); sk = sk[sk.ag >= 6]
        defs['sack_defense'] = (sk.groupby(['season', 'team']).v.agg(['mean', 'size']).reset_index().rename(columns={'mean': 'v', 'size': 'n'}), 1,
                                'Sack defense: sacks per game beyond the opponents\' own sacks allowed', 'sacks/game')
        out = {}
        for k, (S, good, lab, unit) in defs.items():
            fam = family(S, 'team', 'v', lab); rows, cnt = team_rows(S, 'team', 'v', fam, good)
            out[k] = {'label': lab, 'unit': unit, 'good': good, 'family': fam, 'counts': cnt, 'cols': ['season', 'value', 'z', 'games', 'side', 'repeat', 'shows'], 't': rows}
            log(f'cfb tag {k}: family r {fam["r"]} (holdout {fam["r_hold"]}) passes {fam["passes"]}; shows {cnt}')
        P['defense'] = out
    except Exception as e: P['errors'].append('defense: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- head coach style ----------
    try:
        PL = cfb_plays.plays(); PL = PL[~PL.post & PL.offenseConference.notna() & PL.defenseConference.notna()]
        run_ = PL.pt.str.contains('Rush', case=False); pas = PL.pt.str.contains('Pass|Sack|Interception', case=False); scr = run_ | pas
        PL['diff'] = PL.offenseScore - PL.defenseScore
        f = PL[(PL.down == 4) & PL.clockSec.notna()].copy()
        f = f[~((f.period == 4) & (f.clockSec < 300)) & ~((f.period == 2) & (f.clockSec < 120)) & f.period.le(4) & f['diff'].abs().le(28)]
        f['punt'] = f.pt.str.contains('Punt', case=False); f['fg'] = f.pt.str.contains('Field Goal', case=False); f['go'] = (~f.punt & ~f.fg & scr[f.index]).astype(float)
        f = f[f.punt | f.fg | (f.go == 1)]
        f['yb'] = pd.cut(f.distance, [0, 1, 2, 3, 5, 10, 99]).astype(str); f['fb'] = (f.yardsToGoal // 10).clip(0, 9); f['sb'] = np.sign(f['diff']) * (f['diff'].abs() > 8) + np.sign(f['diff'])
        f['y'] = f.go - f.groupby(['season', 'yb', 'fb', 'sb'], observed=True).go.transform('mean'); f['team'] = f.offense
        t = PL[scr].groupby(['gameId', 'season', 'offense']).size().rename('plays').reset_index().rename(columns={'offense': 'team'}); t['y'] = t.plays - t.groupby('season').plays.transform('mean')
        e = PL[scr & PL.down.isin([1, 2]) & (PL.period <= 3) & PL['diff'].abs().le(7)].copy(); e['team'] = e.offense; e['p'] = pas[e.index].astype(float); e['y'] = e.p - e.groupby('season').p.transform('mean')
        R_ = T[T.both_fbs].rename(columns={'gid': 'game_id'}).copy(); rp = TS.set_index(['team', 'season']).rec4
        R_['rec'] = [rp.get(k) for k in zip(R_.team, R_.season)]; R_['orec'] = [rp.get(k) for k in zip(R_.opp, R_.season)]
        R_ = R_.dropna(subset=['rec', 'orec', 'margin']); R_['dr'] = R_.rec - R_.orec; R_['hh'] = R_.ishome * 2 - 1
        bb_ = np.linalg.lstsq(np.column_stack([np.ones(len(R_)), R_.dr, R_.hh]), R_.margin, rcond=None)[0]; R_['y'] = R_.margin - (bb_[0] + bb_[1] * R_.dr + bb_[2] * R_.hh)
        styles = {}
        for k, rows, gcol, lab, unit in [('fourth_down', f, 'gameId', '4th-down go rate over FBS in the same spot', 'go rate'), ('tempo', t, 'gameId', 'Offensive plays per game vs FBS that season', 'plays/game'),
                                         ('early_pass', e, 'gameId', 'Early-down pass rate vs FBS (downs 1-2, quarters 1-3, score within 7)', 'pass share'),
                                         ('outplays_recruiting', R_[R_.stype.astype(str).str.startswith('reg')], 'game_id', 'Game margin beyond both rosters\' recruiting and home field', 'points/game')]:
            r = rows.copy(); r['coach'] = [co.get(x) for x in zip(r.team, r.season)]; r = r.dropna(subset=['coach']).rename(columns={gcol: 'game_id'})
            S = r.groupby(['season', 'team', 'coach']).y.agg(['mean', 'size']).reset_index().rename(columns={'mean': 'v', 'size': 'n'}); S['key'] = S.team + '|' + S.coach
            fam = family(S, 'key', 'v', lab)
            fo = []
            for c_, x in S.sort_values('season').groupby('coach'):
                ts_ = list(dict.fromkeys(x.team))
                if len(ts_) >= 2 and (x.team == ts_[0]).sum() >= 2 and (x.team == ts_[1]).sum() >= 2: fo.append((x[x.team == ts_[0]].v.mean(), x[x.team == ts_[1]].v.mean()))
            rf, pf, kf = rtest(*zip(*fo)) if len(fo) >= 6 else (np.nan, 1.0, 0)
            fam.update({'follows_r': R3(rf), 'follows_p': R4(pf), 'follows_coaches': int(kf)})
            Tn, _ = named(Reg(None), 'x', lab, r, 'coach', 'y', min_seasons=3, unit=unit); Tn = names_bh(Tn)
            by = {c_: [[t_, int(d.season.min()), int(d.season.max()), int(len(d)), R4(np.average(d.v, weights=d.n))] for t_, d in x.groupby('team')] for c_, x in S.groupby('coach')}
            co_out = {}
            if len(Tn):
                for x in Tn.itertuples():
                    co_out[x.agent] = {'v': R4(x.est), 'seasons': int(x.ns), 'first': int(x.first), 'last': int(x.last), 'rows': int(x.n), 'p': R4(x.p), 'q': R4(x.q),
                                       'same_sign': int(x.same_sign), 'later_half': R4(x.late), 'shows': bool(x.shows and fam['passes']), 'by_school': by.get(x.agent, [])}
            styles[k] = {'label': lab, 'unit': unit, 'family': fam, 'coaches': co_out, 'counts': {'coaches': len(co_out), 'shows': sum(v['shows'] for v in co_out.values())}}
            log(f'cfb style {k}: family r {fam["r"]} follows {fam["follows_r"]} passes {fam["passes"]}; {styles[k]["counts"]}')
        P['coach_style'] = styles
    except Exception as e: P['errors'].append('coach_style: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- recruits drafted above their rating, by head coach at signing ----------
    try:
        rc = frame('cf_recruits')
        X = pd.DataFrame({'year': num(pick(rc, 'year', '_year')), 'stars': num(pick(rc, 'stars')), 'rating': num(pick(rc, 'rating')), 'team': pick(rc, 'committedTo'),
                          'name': pick(rc, 'name'), 'rid': pick(rc, 'id').astype(str)}).dropna(subset=['rating', 'year'])
        X = X[(X.year >= 2003) & (X.year <= 2020) & X.team.map(lambda t_: isinstance(t_, str))].copy()
        dr = pd.read_csv(os.path.join(HERE, 'nfl_draft.csv'), comment='#'); dr['nm'] = dr.name.map(norm_name); dr['sch'] = dr.college.map(school)
        hit = set(zip(dr.nm, dr.sch)); hitn = dr.groupby('nm').draft_year.apply(list).to_dict(); X['nm'] = X.name.map(norm_name)
        X['drafted'] = [float((n_, t_) in hit or any(y + 3 <= dy <= y + 6 for dy in hitn.get(n_, []))) for n_, t_, y in zip(X.nm, X.team, X.year)]
        X['rb'] = pd.qcut(X.rating.rank(method='first'), 20, labels=False); X['res'] = X.drafted - X.groupby('rb').drafted.transform('mean')
        X['coach'] = [co.get((t_, int(y))) for t_, y in zip(X.team, X.year)]; X['coach'] = X.coach.map(lambda c_: c_ if isinstance(c_, str) else None); X['season'] = X.year.astype(int)
        Tn, fam = named(Reg(None), 'x', 'recruits drafted', X.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=60, g='rid', unit='draft rate'); Tn = names_bh(Tn)
        famok = bool(np.isfinite(fam[0]) and fam[0] > 0 and fam[1] < .05)   # the family (early vs late classes across coaches) must repeat too
        out = {x.agent: {'v': R4(x.est), 'classes': int(x.ns), 'recruits': int(x.n), 'p': R4(x.p), 'q': R4(x.q), 'later_half': R4(x.late), 'shows': bool(x.shows and famok)} for x in Tn.itertuples()} if len(Tn) else {}
        P['recruit_hits'] = {'label': 'Recruits drafted beyond their rating (head coach at signing), classes 2003-20', 'unit': 'draft rate', 'base_rate': R4(X.drafted.mean()),
                             'family': {'split_half_r': R3(fam[0]), 'p': R4(fam[1]), 'coaches': int(fam[2]), 'passes': famok}, 'coaches': out, 'counts': {'coaches': len(out), 'shows': sum(v['shows'] for v in out.values())}}
        log(f'cfb recruit hits: {P["recruit_hits"]["counts"]}')
    except Exception as e: P['errors'].append('recruit_hits: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- transfers ----------
    try:
        cols = ['ypa', 'cmp', 'rush_sh', 'rec_sh', 'tkl_sh', 'sack_sh']
        a = PS[['pid', 'season', 'team', 'grp', 'name'] + cols].copy(); b = a.copy(); b['season'] -= 1
        j = a.merge(b, on=['pid', 'season'], suffixes=('', '_n')); j['mover'] = (j.team != j.team_n).astype(float)
        spec = [('QB', 'ypa', 'yards per attempt', 0), ('QB', 'cmp', 'completion rate', 0), ('RB', 'rush_sh', 'share of team rushing yards', .05), ('WR', 'rec_sh', 'share of team receiving yards', .05),
                ('TE', 'rec_sh', 'share of team receiving yards', .05), ('LB', 'tkl_sh', 'share of team tackles', .05), ('DB', 'tkl_sh', 'share of team tackles', .05), ('DL', 'sack_sh', 'share of team sacks', .05)]
        posout, cur = [], int(PS.season.max())
        movers26 = []
        for g_, c, lab, mn in spec:
            x = j[(j.grp == g_)].dropna(subset=[c, c + '_n']); x = x[x[c] >= mn]
            mv, st = x[x.mover == 1], x[x.mover == 0]; r1, p1_, k1 = rtest(mv[c], mv[c + '_n']); r0, _, k0 = rtest(st[c], st[c + '_n'])
            h = mv[mv.season + 1 >= HOLD]; rh, ph, kh = rtest(h[c], h[c + '_n'])
            Tb, n_ = ols_cl(x[c + '_n'], [x[c], x.mover], x.pid, ['this', 'mover']); hm = (x.season + 1 >= HOLD).values
            Th, nh = ols_cl(x[c + '_n'].values[hm], [x[c].values[hm], x.mover.values[hm]], x.pid.values[hm], ['this', 'mover'])
            mvb = effect(Tb.loc['mover', 'b'], Tb.loc['mover', 'se'], Tb.loc['mover', 'p'], Th.loc['mover', 'b'], Th.loc['mover', 'se'], n_, nh, 'movers beyond regression to the mean', lab)
            # movers-only line for the expected number at the new school
            bm = np.polyfit(mv[c], mv[c + '_n'], 1) if len(mv) > 20 else [np.nan, np.nan]
            posout.append({'pos': g_, 'measure': c, 'label': lab, 'movers_r': R3(r1), 'movers_p': R4(p1_), 'movers': int(k1), 'stayers_r': R3(r0), 'stayers': int(k0),
                           'movers_r_hold': R3(rh), 'movers_p_hold': R4(ph), 'carries': bool(np.isfinite(r1) and r1 > 0 and p1_ < .01 and rh > 0 and ph < .10),
                           'mover_change': mvb, 'mover_line': [R4(bm[1]), R4(bm[0])]})
            # each transfer into the latest season: before (last season at the old school) and after (this season so far)
            for r in mv[mv.season + 1 == cur].itertuples():
                movers26.append([r.name, g_, r.team, r.team_n, c, R4(getattr(r, c)), R4(getattr(r, c + '_n')), R4(bm[1] + bm[0] * getattr(r, c)) if np.isfinite(bm[0]) else None])
        P['transfers'] = {'label': 'Transfer carry-over by position (CFBD athlete ids; a move = a different school the next season)', 'positions': posout, 'season': cur,
                          'cols': ['name', 'pos', 'from', 'to', 'measure', 'before', 'after_so_far', 'expected_after'], 'movers': movers26,
                          'counts': {'positions_carrying': sum(p['carries'] for p in posout), 'movers': len(movers26)}}
        log(f'cfb transfers: {P["transfers"]["counts"]}; ' + ', '.join(f'{p["pos"]} {p["measure"]} r {p["movers_r"]} vs {p["stayers_r"]}' for p in posout))
    except Exception as e: P['errors'].append('transfers: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- draft-slot flags ----------
    try:
        nf = pd.read_csv(os.path.join(HERE, 'nfl_start4.csv'), comment='#'); nf['nm'] = nf.name.map(norm_name); nf['sch'] = nf.college.map(school)
        pp = frame('cf_ppa'); Q = pd.DataFrame({'pid': pick(pp, 'id').astype(str), 'season': num(pick(pp, 'season', '_year')), 'team': pick(pp, 'team'), 'name': pick(pp, 'name'),
                                                 'ppa3': num(pick(pp, 'averagePPA.thirdDown')), 'pos': pick(pp, 'position')})
        Q = Q.merge(PS[PS.grp == 'QB'][['pid', 'season', 'team', 'passing.ATT']], on=['pid', 'season', 'team']); Q = Q[Q['passing.ATT'] >= 100]; Q['nm'] = Q.name.map(norm_name)
        last = Q.sort_values('season').drop_duplicates('pid', keep='last')
        M = nf[nf.pg == 'QB'].merge(last, left_on=['nm', 'sch'], right_on=['nm', 'team']); M = M[M.season.between(M.draft_year - 2, M.draft_year - 1)].dropna(subset=['ppa3', 'res'])
        def slope(M, col, yr0):
            b, se, n_ = cdiff(M.res, M[col], M.sch); h = M.draft_year >= yr0; bh_, sh_, nh = cdiff(M.res[h], M[col][h], M.sch[h])
            return effect(b, se, p2(b / se) if se and se > 0 else 1.0, bh_, sh_, n_, int(h.sum()), 'NFL starter rate (first 4 seasons) beyond the draft slot, per unit', 'starter rate')
        q3 = slope(M, 'ppa3', 2016); q3['passes'] = bool(q3['p'] is not None and q3['p'] < .05 and q3['p_hold'] is not None and q3['p_hold'] < .10)
        cs = Q[Q.season >= Q.season.max() - 1].copy(); cs['pct'] = cs.groupby('season').ppa3.rank(pct=True)
        qb = [[r.name, r.team, int(r.season), R4(r.ppa3), R3(r.pct), bool(q3['passes'] and r.pct >= .8)] for r in cs.itertuples()]
        # WR breakout CLASS (college players have no birth dates in CFBD): first season with 20%+ of the team's receiving yards, in years since the recruit class
        rc = frame('cf_recruits'); cls = pd.Series(num(pick(rc, 'year', '_year')).values, index=pick(rc, 'athleteId').astype(str)).dropna(); cls = cls[~cls.index.isin(['nan', 'None'])]; cls = cls[~cls.index.duplicated()]
        wr = PS[(PS.grp == 'WR')].copy(); wr['cls'] = wr.pid.map(cls); bo = wr[wr.rec_sh >= .20].groupby('pid').agg(bo=('season', 'min'), cls=('cls', 'first'))
        bo['bo_year'] = bo.bo - bo.cls + 1
        lastw = PS[PS.grp == 'WR'].sort_values('season').drop_duplicates('pid', keep='last').assign(nm=lambda d: d.name.map(norm_name))
        Mw = nf[nf.pg == 'WR'].merge(lastw, left_on=['nm', 'sch'], right_on=['nm', 'team']); Mw = Mw[Mw.season.between(Mw.draft_year - 2, Mw.draft_year - 1)]
        Mw['early'] = -Mw.pid.map(bo.bo_year); Mw = Mw.dropna(subset=['early', 'res'])
        wb = slope(Mw, 'early', 2016); wb['label'] = 'NFL starter rate beyond the slot, per year earlier the breakout (by year in school)'
        wb['passes'] = bool(wb['p'] is not None and wb['p'] < .05 and wb['p_hold'] is not None and wb['p_hold'] < .10)
        cw = wr[wr.season >= wr.season.max() - 1].merge(bo[['bo_year']], left_on='pid', right_index=True, how='left')
        wrs = [[r.name, r.team, int(r.season), R3(r.rec_sh), None if pd.isna(r.bo_year) else int(r.bo_year), bool(wb['passes'] and r.bo_year in (1, 2))] for r in cw.itertuples() if r.rec_sh >= .1]
        P['draft_flags'] = {'qb_third_down': {**q3, 'qbs': int(len(M)), 'cols': ['name', 'team', 'season', 'ppa_third_down', 'percentile', 'shows'], 'current': qb},
                            'wr_breakout': {**wb, 'wrs': int(len(Mw)), 'cols': ['name', 'team', 'season', 'rec_share', 'breakout_year_in_school', 'shows'], 'current': wrs},
                            'counts': {'qb_shows': sum(r[-1] for r in qb), 'wr_shows': sum(r[-1] for r in wrs)}}
        log(f'cfb draft flags: QB 3rd-down {q3["est"]} p {q3["p"]} hold {q3["p_hold"]} passes {q3["passes"]}; WR breakout {wb["est"]} p {wb["p"]} hold {wb["p_hold"]} passes {wb["passes"]}; {P["draft_flags"]["counts"]}')
    except Exception as e: P['errors'].append('draft_flags: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- home field: both ranked ----------
    try:
        home.run(Reg(None), log, do_tests=False); g = home.FRAMES['football'].dropna(subset=['exp_line']).copy()
        g['cover'] = g.margin - g.exp_line; g['rk'] = np.where(g.hr.notna() & g.ar.notna(), 'both', np.where(g.hr.notna(), 'home', np.where(g.ar.notna(), 'away', 'neither')))
        bins = [0, 3, 7, 14, 21, 1e9]; g['lb'] = pd.cut(g.exp_line.abs(), bins, labels=False); x = g[g.rk.isin(['both', 'neither'])]
        X = [(x.rk == 'both').astype(float), x.exp_line] + [(x.lb == k).astype(float) for k in range(1, 5)]; nm_ = ['both', 'line'] + [f'b{k}' for k in range(1, 5)]
        Tb, n_ = ols_cl(x.cover, X, x.gid, nm_); hm = (x.season >= HOLD).values; Th, nh = ols_cl(x.cover.values[hm], [np.asarray(c)[hm] for c in X], x.gid.values[hm], nm_)
        ef = effect(Tb.loc['both', 'b'], Tb.loc['both', 'se'], Tb.loc['both', 'p'], Th.loc['both', 'b'], Th.loc['both', 'se'], n_, nh, 'Both teams ranked: home cover vs the line, compared with neither ranked', 'points')
        tab = g.groupby('rk').agg(games=('gid', 'size'), margin=('margin', 'mean'), cover=('cover', 'mean'), ats=('cover', lambda c_: (c_ > 0).mean())).round(3).reset_index().values.tolist()
        P['home_field'] = {'both_ranked': ef, 'by_ranking': {'cols': ['ranked', 'games', 'home_margin', 'home_cover', 'home_ats'], 'rows': tab,
                           'note': 'ranked = AP Top 25 in force before the game; true home games, FBS v FBS, regular season, games with a closing line'}}
        log(f'cfb home both ranked: {ef}')
    except Exception as e: P['errors'].append('home_field: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    return P

# =============================================== college basketball ===============================================
def cbb():
    import home, cbb as cb_
    from load import frame, pick, num
    P = {'v': 1, 'built': int(time.time() * 1000), 'note': 'study findings, re-checked every run; see docs/HOW-THIS-SITE-WORKS.md "Findings packs"', 'errors': []}
    s = frame('bb_stats'); m = num(pick(s, 'minutes'))
    S = pd.DataFrame({'pid': pick(s, 'athleteId').astype(str), 'season': num(pick(s, 'season', '_year')), 'tid': pick(s, 'teamId').astype(str), 'team': pick(s, 'team'), 'pos': pick(s, 'position'),
                      'min': m, 'name': pick(s, 'name'),
                      'bx40': (num(pick(s, 'points')) + num(pick(s, 'rebounds.total')) + num(pick(s, 'assists')) + num(pick(s, 'steals')) + num(pick(s, 'blocks')) - num(pick(s, 'turnovers'))) / m * 40})
    S = S[S['min'] >= 200].drop_duplicates(['pid', 'season']); tname = dict(zip(S.tid, S.team))
    sr0 = frame('bb_srs'); sr = pd.DataFrame({'t': pick(sr0, 'teamId').astype(str), 's': num(pick(sr0, 'season', '_year')), 'r': num(pick(sr0, 'rating'))}).dropna().drop_duplicates(['t', 's']).set_index(['t', 's']).r
    home.run(Reg(None), log, do_tests=False); G = home.FRAMES['basketball'].dropna(subset=['exp_srs']).copy()
    G['edge'] = G.margin - G.exp_srs; G['cover'] = G.margin - G.exp_line
    # ---------- program home-court edge ----------
    try:
        G['e0'] = G.edge - G.groupby('season').edge.transform('mean')
        Sx = G.groupby(['season', 'home']).e0.agg(['mean', 'size']).reset_index().rename(columns={'mean': 'v', 'size': 'n', 'home': 'team'})
        fam = family(Sx, 'team', 'v', 'Home edge beyond SRS, compared with the league that season'); rows, cnt = team_rows(Sx, 'team', 'v', fam, 1, min_n=8)
        Tn, _ = named(Reg(None), 'x', 'home edge', G.rename(columns={'gid': 'game_id'}), 'home', 'e0', min_seasons=8, unit='points'); Tn = names_bh(Tn)
        prog = {x.agent: {'name': tname.get(x.agent, x.agent), 'v': R3(x.est), 'seasons': int(x.ns), 'games': int(x.n), 'q': R4(x.q), 'shows': bool(x.shows and fam['passes'])} for x in Tn.itertuples()} if len(Tn) else {}
        P['home_court'] = {'label': 'Program home-court edge: home margin beyond the SRS gap, minus the league\'s home edge that season', 'unit': 'points',
                           'league_edge': {str(int(k)): R3(v) for k, v in G.groupby('season').edge.mean().items()}, 'family': fam,
                           'cols': ['season', 'value', 'z', 'games', 'side', 'repeat', 'shows'], 't': rows, 'names': {k: tname.get(k, k) for k in rows},
                           'programs': prog, 'counts': {**cnt, 'programs_named': len(prog), 'programs_shows': sum(v['shows'] for v in prog.values())}}
        log(f'cbb home court: family r {fam["r"]} passes {fam["passes"]}; {P["home_court"]["counts"]}')
    except Exception as e: P['errors'].append('home_court: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- home underdog note ----------
    try:
        L = G.dropna(subset=['exp_line']).copy(); L['hfav'] = (L.exp_line > 0).astype(float); bins = [0, 3, 6, 10, 15, 1e9]; L['lb'] = pd.cut(L.exp_line.abs(), bins, labels=False)
        X = [L.hfav] + [(L.lb == k).astype(float) for k in range(1, 5)]; nm_ = ['hfav'] + [f'b{k}' for k in range(1, 5)]
        Tb, n_ = ols_cl(L.cover, X, L.gid, nm_); hm = (L.season >= HOLD).values; Th, nh = ols_cl(L.cover.values[hm], [np.asarray(c)[hm] for c in X], L.gid.values[hm], nm_)
        ef = effect(Tb.loc['hfav', 'b'], Tb.loc['hfav', 'se'], Tb.loc['hfav', 'p'], Th.loc['hfav', 'b'], Th.loc['hfav', 'se'], n_, nh, 'Home favourite vs home underdog: home cover vs the line, same line size', 'points')
        tab = L.groupby('hfav').agg(games=('gid', 'size'), cover=('cover', 'mean'), ats=('cover', lambda c_: (c_ > 0).mean())).round(3).reset_index().values.tolist()
        P['home_underdog'] = {**ef, 'cols': ['home_favourite', 'games', 'home_cover', 'home_ats'], 'rows': tab}
        log(f'cbb home underdog: {ef}')
    except Exception as e: P['errors'].append('home_underdog: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- coach player development + transfers ----------
    try:
        ro = frame('bb_roster', flat=False); start, dest = {}, {}
        if len(ro) and 'players' in ro:
            for tid_, se_, L_ in zip(pick(ro, 'teamId').astype(str), num(pick(ro, 'season', '_year')), ro.players):
                for p_ in L_ if isinstance(L_, list) else []:
                    if p_.get('startSeason'): start[str(p_.get('id'))] = p_['startSeason']
                    dest[(str(p_.get('id')), int(se_))] = tid_
        S['yr'] = S.season - S.pid.map(start) + 1
        CO = cb_.coaches(D)
        a = S[['pid', 'season', 'tid', 'pos', 'yr', 'bx40', 'name']]; b = a.copy(); b['season'] -= 1
        j = a.merge(b.drop(columns='name'), on=['pid', 'season'], suffixes=('', '_n')).dropna(subset=['bx40', 'bx40_n']); j['mover'] = (j.tid != j.tid_n).astype(float); j['chg'] = j.bx40_n - j.bx40
        st = j[j.mover == 0].dropna(subset=['yr']).copy(); st = st[st.yr.between(1, 4)]
        st['dsrs'] = [sr.get((t, s_ + 1), np.nan) - sr.get((t, s_), np.nan) for t, s_ in zip(st.tid, st.season)]; st = st.dropna(subset=['dsrs'])
        Xm = np.column_stack([np.ones(len(st)), st.bx40, st.dsrs] + [(st.yr == k).astype(float) for k in (1, 2, 3)]); bb_ = np.linalg.lstsq(Xm, st.chg, rcond=None)[0]; st['res'] = st.chg - Xm @ bb_
        st['coach'] = [CO.get((t, int(s_) + 1)) for t, s_ in zip(st.tid, st.season)]; st['season'] = st.season + 1
        Tn, fam = named(Reg(None), 'x', 'development', st.dropna(subset=['coach']), 'coach', 'res', min_seasons=6, min_rows=40, g='pid', unit='bx40'); Tn = names_bh(Tn)
        famok = bool(np.isfinite(fam[0]) and fam[0] > 0 and fam[1] < .05)
        dev = {x.agent: {'v': R4(x.est), 'seasons': int(x.ns), 'players': int(x.n), 'first': int(x.first), 'last': int(x.last), 'p': R4(x.p), 'q': R4(x.q), 'same_sign': int(x.same_sign),
                         'shows': bool(x.shows and famok)} for x in Tn.itertuples()} if len(Tn) else {}
        P['coach_development'] = {'label': 'Returning players\' year-to-year change in box production per 40 (points+rebounds+assists+steals+blocks-turnovers), beyond class year, '
                                  'their own level and the team\'s SRS change', 'unit': 'bx40 per player-season', 'family': {'split_half_r': R3(fam[0]), 'p': R4(fam[1]), 'coaches': int(fam[2]), 'passes': famok},
                                  'coaches': dev, 'counts': {'coaches': len(dev), 'shows': sum(v['shows'] for v in dev.values())}}
        log(f'cbb coach development: {P["coach_development"]["counts"]}; family {P["coach_development"]["family"]}')
        # transfers, adjusted for the new team's level
        mv = j[j.mover == 1].copy(); mv['gap'] = [sr.get((b_, s_), np.nan) - sr.get((a_, s_), np.nan) for a_, b_, s_ in zip(mv.tid, mv.tid_n, mv.season)]
        allp = j.copy(); allp['gap'] = 0.0; allp.loc[mv.index, 'gap'] = mv.gap; allp = allp.dropna(subset=['gap'])
        nm_ = ['this', 'mover', 'mover_gap']; Xa = [allp.bx40, allp.mover, allp.mover * allp.gap]
        Tb, n_ = ols_cl(allp.bx40_n, Xa, allp.pid, nm_); hm = (allp.season + 1 >= HOLD).values; Th, nh = ols_cl(allp.bx40_n.values[hm], [np.asarray(c)[hm] for c in Xa], allp.pid.values[hm], nm_)
        coefs = {k: {'b': R4(Tb.loc[k, 'b']), 'se': R4(Tb.loc[k, 'se']), 'p': R4(Tb.loc[k, 'p']), 'b_hold': R4(Th.loc[k, 'b'])} for k in ['const'] + nm_}
        lvl = effect(Tb.loc['mover_gap', 'b'], Tb.loc['mover_gap', 'se'], Tb.loc['mover_gap', 'p'], Th.loc['mover_gap', 'b'], Th.loc['mover_gap', 'se'], n_, nh, 'per SRS point the new team is better', 'bx40')
        mvr = rtest(mv.bx40, mv.bx40_n); str_ = rtest(j[j.mover == 0].bx40, j[j.mover == 0].bx40_n)
        # this coming season's movers: last season's line at the old school, the roster's new school
        cur = int(S.season.max()); nxt = cur + 1; cand = S[S.season == cur]
        rows = []
        for r in cand.itertuples():
            d_ = dest.get((r.pid, nxt))
            if d_ and d_ != r.tid:
                gp = sr.get((d_, cur), np.nan) - sr.get((r.tid, cur), np.nan)
                ex = coefs['const']['b'] + coefs['this']['b'] * r.bx40 + coefs['mover']['b'] + (coefs['mover_gap']['b'] * gp if np.isfinite(gp) else 0)
                rows.append([r.name, r.pos, tname.get(r.tid, r.tid), tname.get(d_, d_), R3(r.bx40), R3(gp), R3(ex)])
        P['transfers'] = {'label': 'Basketball transfer carry-over, adjusted for the new team\'s level (SRS gap, same season)', 'unit': 'bx40', 'movers_r': R3(mvr[0]), 'movers': int(mvr[2]),
                          'stayers_r': R3(str_[0]), 'model': coefs, 'level': lvl, 'season_from': cur, 'season_to': nxt,
                          'cols': ['name', 'pos', 'from', 'to', 'bx40_last', 'srs_gap', 'expected_bx40'], 'movers_next': rows, 'counts': {'movers_next': len(rows)}}
        log(f'cbb transfers: movers r {R3(mvr[0])} stayers {R3(str_[0])}; level {lvl}; next-season movers {len(rows)}')
    except Exception as e: P['errors'].append('development/transfers: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    # ---------- late-season risers ----------
    try:
        h_ = G.assign(team=G.home, over=G.margin - G.exp_srs - G.groupby('season').edge.transform('mean'))
        a_ = G.assign(team=G.away, over=-(G.margin - G.exp_srs - G.groupby('season').edge.transform('mean')))
        TG = pd.concat([h_, a_]); TG = TG[TG.exp_srs.abs() <= 10]; TG['mo'] = pd.to_datetime(TG.date).dt.month
        TG['late'] = np.where(TG.mo.isin([2, 3]), 1, np.where(TG.mo.isin([11, 12]), -1, 0)); TG = TG[TG.late != 0]
        ls = TG.groupby(['season', 'team', 'late']).over.agg(['mean', 'size']).unstack()
        Sl = pd.DataFrame({'v': ls[('mean', 1)] - ls[('mean', -1)], 'n': ls[('size', 1)].fillna(0) + ls[('size', -1)].fillna(0)}).dropna().reset_index()
        fam = family(Sl, 'team', 'v', 'Late riser: Feb-Mar margin beyond SRS minus Nov-Dec (competitive games)'); rows, cnt = team_rows(Sl, 'team', 'v', fam, 1, min_n=8)
        P['late_risers'] = {'label': fam['label'], 'unit': 'points', 'family': fam, 'cols': ['season', 'value', 'z', 'games', 'side', 'repeat', 'shows'], 't': rows,
                            'names': {k: tname.get(k, k) for k in rows}, 'counts': cnt}
        log(f'cbb late risers: family r {fam["r"]} passes {fam["passes"]}; {cnt}')
    except Exception as e: P['errors'].append('late_risers: ' + repr(e)[:200]); log(traceback.format_exc()[-1500:])
    return P

for name, fn, key in [('p2026_cfb-findings', cfb, 'cfbfind'), ('p2026_cbb-findings', cbb, 'cbbfind')]:
    try: pk = fn()
    except Exception as e: pk = {'v': 1, 'errors': ['build: ' + repr(e)[:300]]}; log(traceback.format_exc()[-2000:])
    json.dump({key: jsafe(pk)}, open(os.path.join(OUT, name + '.json'), 'w'), separators=(',', ':'))
    log(f'{name}: {os.path.getsize(os.path.join(OUT, name + ".json")) / 1e3:.0f} KB; errors {pk.get("errors")}')
open(os.path.join(OUT, 'log.txt'), 'w').write('\n'.join(LOG))
