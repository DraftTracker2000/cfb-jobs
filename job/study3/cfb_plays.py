# Pattern hunt 3 — college coaches' play-calling habits from CFBD play-by-play (2014 on). STUDY ONLY. Head coaches only (CFBD has no
# coordinators — checked: its /coaches answer is head coaches with their seasons, nothing else).
#  D01 fourth-down aggressiveness (go rate over the FBS rate in the same spot) repeats (same team and coach); named; D02 follows the coach
#  D03 does it pay? neutral-spot aggressiveness vs wins over the line-implied expectation (partial r, points per game controlled)
#  D04 tempo (offensive plays per game vs the season's FBS average) repeats; D05 tempo follows the coach
#  D06 early-down pass rate (downs 1-2, quarters 1-3, score within 7) repeats; named; D07 follows the coach
#  D08 second-half adjustment (2H minus 1H value per play) repeats
#  D09 fourth-down conversion over expected repeats
import numpy as np, pandas as pd
from scipy import stats
from lib3 import *
from load import answers, year_of

COLS = ["gameId", "driveId", "offense", "defense", "home", "offenseScore", "defenseScore", "period", "clockSec", "yardsToGoal", "down",
        "distance", "yardsGained", "playType", "ppa", "scoring", "offenseConference", "defenseConference"]

def plays():
    out = []
    for path, L in answers('cf_plays'):
        if not L: continue
        d = pd.DataFrame(L, columns=COLS); d['season'] = year_of(path); d['post'] = 'postseason' in path; out.append(d)
    P = pd.concat(out, ignore_index=True)
    for c in ['offenseScore', 'defenseScore', 'period', 'clockSec', 'yardsToGoal', 'down', 'distance', 'yardsGained', 'ppa']: P[c] = pd.to_numeric(P[c], errors='coerce')
    P['pt'] = P.playType.astype(str)
    return P

def run(reg, log, G, T, CO, TS):
    P = plays(); P = P[~P.post & P.offenseConference.notna() & P.defenseConference.notna()]
    log(f'plays: {len(P)} FBS-vs-FBS regular-season plays, {P.gameId.nunique()} games, {P.season.min()}-{P.season.max()}')
    co = CO.set_index(['team', 'season']).coach
    run_ = P.pt.str.contains('Rush', case=False); pas = P.pt.str.contains('Pass|Sack|Interception', case=False)
    scr = run_ | pas
    P['diff'] = P.offenseScore - P.defenseScore
    def table(rows, val, min_n, w=None):
        r = rows.copy(); r['coach'] = [co.get(k) for k in zip(r.team, r.season)]
        if w is None: S = r.groupby(['season', 'team', 'coach'])[val].agg(['mean', 'count']).reset_index().rename(columns={'mean': 'v', 'count': 'n'})
        else:
            a = r.assign(_x=r[val] * r[w]).groupby(['season', 'team', 'coach'])[['_x', w]].sum().reset_index(); S = a.assign(v=a._x / a[w], n=a[w])
        S = S[S.n >= min_n]; S['key'] = S.team + '|' + S.coach; return S, r
    def follows(hyp, label, S, min_seasons=2):
        out = []
        for c, x in S.sort_values('season').groupby('coach'):
            t = list(dict.fromkeys(x.team))
            if len(t) >= 2 and (x.team == t[0]).sum() >= min_seasons and (x.team == t[1]).sum() >= min_seasons: out.append((x[x.team == t[0]].v.mean(), x[x.team == t[1]].v.mean()))
        if len(out) < 6: log(f'{hyp}: only {len(out)} coaches with two stops'); return
        r, p, k = rtest(*zip(*out))
        reg.add(hyp, label + ' — follows the head coach to his next school (r)', 'family', r, np.nan, p, k, oos_pass=bool(r > 0), detail=f'{k} coaches with 2+ seasons at two FBS schools', unit='r')
        log(f'{hyp} follows coach: r {r:.3f} (p {p:.3g}, {k})')
    # ---------- fourth downs ----------
    f = P[(P.down == 4) & (P.clockSec.notna())].copy()
    f = f[~((f.period == 4) & (f.clockSec < 300)) & ~((f.period == 2) & (f.clockSec < 120)) & f.period.le(4) & f['diff'].abs().le(28)]
    f['punt'] = f.pt.str.contains('Punt', case=False); f['fg'] = f.pt.str.contains('Field Goal', case=False)
    f['go'] = (~f.punt & ~f.fg & scr[f.index]).astype(float)
    f = f[f.punt | f.fg | (f.go == 1)]
    f['yb'] = pd.cut(f.distance, [0, 1, 2, 3, 5, 10, 99]).astype(str); f['fb'] = (f.yardsToGoal // 10).clip(0, 9)
    f['sb'] = np.sign(f['diff']) * (f['diff'].abs() > 8) + np.sign(f['diff'])
    f['exp'] = f.groupby(['season', 'yb', 'fb', 'sb'], observed=True).go.transform('mean'); f['ag'] = f.go - f.exp; f['team'] = f.offense
    log(f'D01: {len(f)} fourth downs; go rate {f.go.mean():.3f} ({f.season.min()} {f[f.season == f.season.min()].go.mean():.3f}, {f.season.max()} {f[f.season == f.season.max()].go.mean():.3f})')
    S, R = table(f, 'ag', 15)
    o = yoy(S, 'key', 'v'); log('D01 ' + reg_yoy(reg, 'D01', 'Fourth-down aggressiveness (go rate over FBS in the same spot), same team and coach', o))
    R = R.rename(columns={'gameId': 'game_id'})
    Tn, fam = named(reg, 'D01', 'Fourth-down aggressiveness', R.dropna(subset=['coach']), 'coach', 'ag', min_seasons=5, unit='go rate')
    log(f'D01 split-half r {fam[0]:.2f} ({fam[2]})')
    if len(Tn): log(Tn.sort_values('p').head(10)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'oos', 'loo']].round(4).to_string())
    follows('D02', 'Fourth-down aggressiveness', S)
    # D03 payoff, neutral spots only
    n = f[(f.period <= 3) & f['diff'].abs().le(7)]
    Sn, _ = table(n, 'ag', 8)
    Tg = T[T.both_fbs & T.stype.astype(str).str.startswith('reg')].dropna(subset=['exp']).copy()
    Tg['wox'] = Tg.win - stats.norm.cdf(Tg.exp / 15.0)
    W = Tg.groupby(['season', 'team']).agg(wox=('wox', 'mean'), ppg=('pf', 'mean')).reset_index()
    J = Sn.merge(W, on=['season', 'team'])
    if len(J) > 50:
        X = np.column_stack([np.ones(len(J)), J.ppg]); ra = J.v - X @ np.linalg.lstsq(X, J.v, rcond=None)[0]; rb = J.wox - X @ np.linalg.lstsq(X, J.wox, rcond=None)[0]
        r, p, k = rtest(ra, rb); hm = (J.season >= HOLD).values; rh, ph, kh = rtest(ra[hm], rb[hm])
        reg.add('D03', 'Fourth-down aggressiveness pays (neutral spots): partial r with wins over the line-implied expectation, points/game controlled', 'mechanism', r, np.nan,
                2 * min(p, 1 - p), k, oos_pass=bool(np.isfinite(rh) and np.sign(rh) == np.sign(r) and (ph if r > 0 else 1 - ph) < .10), detail=f'{k} team-seasons; holdout r {rh:.3f} ({kh})', unit='r')
        log(f'D03 payoff partial r {r:.3f} (p {2 * min(p, 1 - p):.3g}); holdout {rh:.3f}')
    # D09 conversion over expected
    gof = f[f.go == 1].copy(); gof['conv'] = (gof.yardsGained >= gof.distance).astype(float)
    gof['cx'] = gof.conv - gof.groupby(['yb'], observed=True).conv.transform('mean')
    S9, _ = table(gof, 'cx', 8); o = yoy(S9, 'key', 'v'); log('D09 ' + reg_yoy(reg, 'D09', 'Fourth-down conversion over expected (same team and coach)', o))
    # ---------- tempo ----------
    s = P[scr].groupby(['gameId', 'season', 'offense']).size().rename('plays').reset_index().rename(columns={'offense': 'team'})
    s['v0'] = s.plays - s.groupby('season').plays.transform('mean')
    S4, _ = table(s, 'v0', 6); o = yoy(S4, 'key', 'v'); log('D04 ' + reg_yoy(reg, 'D04', 'Tempo (offensive plays per game vs FBS that season), same team and coach', o))
    follows('D05', 'Tempo', S4)
    # ---------- early-down pass rate ----------
    e = P[scr & P.down.isin([1, 2]) & (P.period <= 3) & P['diff'].abs().le(7)].copy(); e['pass'] = pas[e.index].astype(float); e['team'] = e.offense
    e['pv'] = e['pass'] - e.groupby('season')['pass'].transform('mean')
    S6, R6 = table(e, 'pv', 100); o = yoy(S6, 'key', 'v'); log('D06 ' + reg_yoy(reg, 'D06', 'Early-down pass rate vs FBS (neutral spots), same team and coach', o))
    R6 = R6.rename(columns={'gameId': 'game_id'})
    Tn, fam = named(reg, 'D06', 'Early-down pass rate vs FBS', R6.dropna(subset=['coach']), 'coach', 'pv', min_seasons=5, unit='pass share')
    if len(Tn): log(Tn.sort_values('p').head(8)[['name', 'ns', 'n', 'est', 'p', 'same_sign', 'oos', 'loo']].round(4).to_string())
    follows('D07', 'Early-down pass rate', S6)
    # ---------- second-half adjustment ----------
    v = P[scr & P.ppa.notna()].copy(); v['h2'] = (v.period >= 3).astype(int)
    x = v.groupby(['gameId', 'season', 'offense', 'h2']).ppa.agg(['mean', 'count']).unstack(); x = x[(x[('count', 0)] >= 15) & (x[('count', 1)] >= 15)]
    y = (x[('mean', 1)] - x[('mean', 0)]).rename('y').reset_index().rename(columns={'offense': 'team'}); y['y'] = y.y - y.groupby('season').y.transform('mean')
    S8, _ = table(y, 'y', 6); o = yoy(S8, 'key', 'v'); log('D08 ' + reg_yoy(reg, 'D08', 'Second-half offensive adjustment (2H minus 1H value per play), same team and coach', o))
