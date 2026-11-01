# Pattern hunt 3 follow-up — home edge by game type, college football and college basketball (Sam, Nov 1 9:32 am: "id like to know about
# home field vs non-conferene and conference, unranked and ranked and if that matters for homefield for the better team in the matchup").
# STUDY ONLY. Regular season, true home games only (neutral sites and basketball tournament games left out).
#   home edge (SRS)  = home margin minus the two teams' season SRS gap (what the home team got beyond who it was)
#   cover            = home margin minus the closing line's expected home margin (what the market missed)
#   plain margin, home win rate, and wins minus the line-implied win chance
# Tests (game-level rows; robust SEs, each game one row; holdout = seasons 2022+; one BH pass over this follow-up's tests in run.py):
#   H?01/02 conference vs non-conference (SRS edge, cover)         H?03/04 ranked/unranked pairings vs neither ranked (SRS edge, cover)
#   H?05 home team better by SRS vs worse, at the same gap size     H?06/07 line favourite at home vs home underdog (cover, wins vs expected)
#   H?08-12 by program, year to year: overall home edge; conference-minus-non-conference; as favourite minus as underdog; vs ranked minus
#   vs unranked visitors; home cover.   ? = F (football) or B (basketball). Gap-size controls: bins of |SRS gap| (or |line|) and the gap itself.
import numpy as np, pandas as pd
from scipy import stats
from lib3 import *
from load import frame, pick, num

def poll_cfb(log):
    r = frame('cf_rankings', flat=False); P = {}
    for _, w in r.iterrows():
        for p in w.get('polls') or []:
            if 'AP' in str(p.get('poll', '')):
                P[(int(w['season']), int(w['week']))] = {x['school']: x['rank'] for x in p.get('ranks') or []}
    return P

def tests(reg, log, sp, G, bins, sigma_hint):
    """G: one row per game with season, home, away, margin, exp_srs, exp_line, conf (bool), hr, ar (AP ranks or NaN)."""
    G = G.dropna(subset=['margin', 'exp_srs']).copy()
    G['edge'] = G.margin - G.exp_srs; G['cover'] = G.margin - G.exp_line
    sig = (G.margin - G.exp_line).std() if G.exp_line.notna().sum() > 100 else sigma_hint
    G['win'] = np.where(G.margin > 0, 1.0, np.where(G.margin == 0, .5, 0.0)); G['wx'] = G.win - stats.norm.cdf(G.exp_line / sig)
    G['gb'] = pd.cut(G.exp_srs.abs(), bins, labels=False); G['lb'] = pd.cut(G.exp_line.abs(), bins, labels=False)
    gd = [(G.gb == k).astype(float) for k in range(1, len(bins) - 1)]; ld = [(G.lb == k).astype(float) for k in range(1, len(bins) - 1)]
    gn = [f'gap{k}' for k in range(1, len(bins) - 1)]
    G['rk'] = np.where(G.hr.notna() & G.ar.isna(), 'ranked home v unranked', np.where(G.hr.isna() & G.ar.notna(), 'unranked home v ranked',
                       np.where(G.hr.notna() & G.ar.notna(), 'both ranked', 'neither ranked')))
    G['hbetter'] = (G.exp_srs > 0).astype(float); G['hfav'] = (G.exp_line > 0).astype(float)
    g = 'gid'
    log(f'{sp}: {len(G)} true home games {int(G.season.min())}-{int(G.season.max())}; with a line {G.exp_line.notna().mean():.2f}; line sigma {sig:.1f}; '
        f'home margin {G.margin.mean():+.2f}, home edge beyond SRS {G.edge.mean():+.2f}, home cover {G.cover.mean():+.2f}, home wins {G.win.mean():.3f}')
    # descriptive tables
    def desc(by, label):
        t = G.groupby(by).agg(games=('gid', 'size'), margin=('margin', 'mean'), edge=('edge', 'mean'), cover=('cover', 'mean'), lined=('cover', 'count'),
                              homewin=('win', 'mean'), wx=('wx', 'mean'), srsgap=('exp_srs', 'mean'))
        log(f'{sp} by {label}:\n' + t.round(3).to_string())
    desc('conf', 'conference game'); desc('rk', 'AP ranking'); desc('hbetter', 'home team better by SRS (1) or worse (0)')
    L = G.dropna(subset=['exp_line']);
    if len(L): log(f'{sp} by line favourite at home (1) or home underdog (0):\n' + L.groupby('hfav').agg(games=('gid', 'size'), margin=('margin', 'mean'),
        edge=('edge', 'mean'), cover=('cover', 'mean'), homewin=('win', 'mean'), wx=('wx', 'mean'), ats=('cover', lambda c: (c > 0).mean())).round(3).to_string())
    H = 'HF' if sp == 'football' else 'HB'
    def c(hyp, label, y, X, names, term, unit, sub=None):
        d = G if sub is None else G[sub]
        Xs = [x if sub is None else x[sub] for x in X]
        m = np.isfinite(d[y].values) & np.all([np.isfinite(np.asarray(x, float)) for x in Xs], axis=0)
        r = coef(reg, hyp, f'{sp}: {label}', d[y].values[m], [np.asarray(x, float)[m] for x in Xs], names, d[g].values[m], d.season.values[m], term, unit=unit)
        log(f'{hyp} {label}: {r["d"]}')
    cf = G.conf.astype(float)
    c(f'{H}01', 'conference game vs non-conference: home edge beyond SRS (same gap size)', 'edge', [cf, G.exp_srs] + gd, ['conf', 'gap'] + gn, 'conf', 'points')
    c(f'{H}02', 'conference game vs non-conference: home cover vs the line', 'cover', [cf, G.exp_line] + ld, ['conf', 'line'] + gn, 'conf', 'points', sub=G.exp_line.notna())
    for k, nm in [('ranked home v unranked', 'rh'), ('unranked home v ranked', 'uh'), ('both ranked', 'bb')]:
        x = (G.rk == k).astype(float); sub = G.rk.isin([k, 'neither ranked'])
        c(f'{H}03', f'{k} vs neither ranked: home edge beyond SRS (same gap size)', 'edge', [x, G.exp_srs] + gd, [nm, 'gap'] + gn, nm, 'points', sub=sub)
        c(f'{H}04', f'{k} vs neither ranked: home cover vs the line', 'cover', [x, G.exp_line] + ld, [nm, 'line'] + gn, nm, 'points', sub=sub & G.exp_line.notna())
    c(f'{H}05', 'home team better by SRS vs worse: home edge beyond SRS at the same gap size', 'edge', [G.hbetter] + gd, ['hbetter'] + gn, 'hbetter', 'points')
    c(f'{H}06', 'line favourite at home vs home underdog: home cover (same line size)', 'cover', [G.hfav] + ld, ['hfav'] + gn, 'hfav', 'points', sub=G.exp_line.notna())
    c(f'{H}07', 'line favourite at home vs home underdog: wins minus the line-implied chance (same line size)', 'wx', [G.hfav] + ld, ['hfav'] + gn, 'hfav', 'wins/game', sub=G.exp_line.notna())
    # by program, year to year (home team's seasons)
    def ps(f, min_each=2):
        out = []
        for (s, t), d in G.groupby(['season', 'home']):
            v = f(d)
            if v is not None: out.append((s, t, v))
        return pd.DataFrame(out, columns=['season', 'team', 'v'])
    def diff(d, col, a, b, y='edge'):
        x, z = d[d[col] == a][y], d[d[col] == b][y]
        return x.mean() - z.mean() if len(x) >= 2 and len(z) >= 2 else None
    for hyp, lab, f in [(f'{H}08', 'program home edge beyond SRS', lambda d: d.edge.mean() if len(d) >= 3 else None),
                        (f'{H}09', 'program conference-minus-non-conference home edge', lambda d: diff(d, 'conf', True, False)),
                        (f'{H}10', 'program home edge as the better team minus as the worse team', lambda d: diff(d, 'hbetter', 1.0, 0.0)),
                        (f'{H}11', 'program home edge vs ranked visitors minus vs unranked', lambda d: (d[d.ar.notna()].edge.mean() - d[d.ar.isna()].edge.mean()) if d.ar.notna().sum() >= 2 and d.ar.isna().sum() >= 2 else None),
                        (f'{H}12', 'program home cover vs the line', lambda d: d.cover.mean() if d.cover.notna().sum() >= 3 else None)]:
        S = ps(f).dropna()
        if len(S) < 30: log(f'{hyp}: only {len(S)} program-seasons'); continue
        o = yoy(S, 'team', 'v'); log(f'{hyp} {lab}: SD {S.v.std():.2f}; ' + reg_yoy(reg, hyp, f'{sp}: {lab} — repeats year to year (r)', o))

def run(reg, log):
    # ---------------- football ----------------
    try:
        import cfb_base
        G0, T, CO, TS = cfb_base.build()
        g = G0[(G0.stype.astype(str).str.startswith('reg')) & ~G0.neutral & G0.both_fbs].copy()
        srs = TS.set_index(['team', 'season']).srs
        g['exp_srs'] = [srs.get((h, s), np.nan) - srs.get((a, s), np.nan) for h, a, s in zip(g.home, g.away, g.season)]
        # the closing line: CFBD's spread is from the home side (negative = home favoured) — checked here against the margins
        cr = np.corrcoef(g.dropna(subset=['exp_home']).exp_home, g.dropna(subset=['exp_home']).margin)[0, 1]
        log(f'football: corr(expected home margin from the line, margin) = {cr:.3f} (positive = sign right)')
        g['exp_line'] = g.exp_home
        agree = (g.conf_game == (g.hconf == g.aconf)).mean(); log(f'football: conferenceGame flag agrees with same-conference that season in {agree:.3f} of games')
        P = poll_cfb(log)
        # which poll is "the week before": CFBD numbers the poll released before week W's games as week W? check on ranked teams that lost
        def rank(t, s, w): return (P.get((s, w)) or {}).get(t)
        chA, chB = [], []
        for _, x in g.iterrows():
            s, w = int(x.season), int(x.week)
            for t, lost in [(x.home, x.margin < 0), (x.away, x.margin > 0)]:
                if not lost: continue
                r0, r1, r2 = rank(t, s, w - 1), rank(t, s, w), rank(t, s, w + 1)
                if r1 is not None and (s, w + 1) in P: chA.append((r2 or 26) - r1)
                if r0 is not None and (s, w) in P: chB.append((r1 or 26) - r0)
        lag = 0 if np.mean(chA) > np.mean(chB) else 1
        log(f'football polls: {len(P)} AP polls; ranked losers drop {np.mean(chA):.2f} places from poll W to W+1 and {np.mean(chB):.2f} from W-1 to W, '
            f'so the poll in force before week W\'s games is CFBD week W{"" if lag == 0 else " - 1"}')
        def rk_before(t, s, w):
            for k in range(w - lag, 0, -1):
                if (s, k) in P: return P[(s, k)].get(t)
            return None
        g['hr'] = [rk_before(t, int(s), int(w)) for t, s, w in zip(g.home, g.season, g.week)]
        g['ar'] = [rk_before(t, int(s), int(w)) for t, s, w in zip(g.away, g.season, g.week)]
        g['hr'] = pd.to_numeric(g.hr); g['ar'] = pd.to_numeric(g.ar); g['conf'] = g.conf_game
        tests(reg, log, 'football', g[['gid', 'season', 'home', 'away', 'margin', 'exp_srs', 'exp_line', 'conf', 'hr', 'ar']], [0, 3, 7, 14, 21, 1e9], 15.0)
    except Exception as e:
        import traceback; log('home football FAILED: ' + repr(e)[:300] + ' | ' + traceback.format_exc()[-1500:])
    # ---------------- basketball ----------------
    try:
        b = frame('bb_games')
        G = pd.DataFrame({'gid': pick(b, 'id'), 'season': num(pick(b, 'season', '_year')), 'home': pick(b, 'homeTeamId').astype(str), 'away': pick(b, 'awayTeamId').astype(str),
                          'hp': num(pick(b, 'homePoints')), 'ap': num(pick(b, 'awayPoints')), 'neutral': pick(b, 'neutralSite').fillna(False).astype(bool),
                          'conf': pick(b, 'conferenceGame').fillna(False).astype(bool), 'st': pick(b, 'seasonType').astype(str), 'tour': pick(b, 'tournament'),
                          'hc': pick(b, 'homeConference'), 'ac': pick(b, 'awayConference'),
                          'date': pd.to_datetime(pick(b, 'startDate'), errors='coerce', utc=True)}).dropna(subset=['hp', 'ap']).drop_duplicates('gid')
        G = G[~G.neutral & G.st.str.contains('reg', case=False) & G.tour.isna()].copy(); G['margin'] = G.hp - G.ap
        log(f'basketball: conferenceGame flag agrees with same-conference that season in {(G.conf == (G.hc == G.ac)).mean():.3f} of games')
        s = frame('bb_srs'); sr = pd.DataFrame({'t': pick(s, 'teamId').astype(str), 's': num(pick(s, 'season', '_year')), 'r': num(pick(s, 'rating'))}).dropna().drop_duplicates(['t', 's']).set_index(['t', 's']).r
        G['exp_srs'] = [sr.get((h, y), np.nan) - sr.get((a, y), np.nan) for h, a, y in zip(G.home, G.away, G.season)]
        l = frame('bb_lines', flat=False); L = {}
        for gid, LL in zip(pick(l, 'gameId'), pick(l, 'lines')):
            if isinstance(LL, list) and LL:
                v = [x.get('spread') for x in LL if 'consensus' in str(x.get('provider', '')).lower() and x.get('spread') is not None] or [x.get('spread') for x in LL if x.get('spread') is not None]
                if v: L[gid] = float(np.mean([float(a) for a in v]))
        G['spread'] = G.gid.map(L)
        cr = np.corrcoef(G.dropna(subset=['spread']).spread, G.dropna(subset=['spread']).margin)[0, 1] if G.spread.notna().sum() > 100 else np.nan
        G['exp_line'] = -G.spread if cr < 0 else G.spread
        log(f'basketball: lines for {G.spread.notna().sum()} games; corr(spread, margin) = {cr:.3f}, so expected home margin = {"-spread" if cr < 0 else "spread"}')
        r = frame('bb_rankings'); r = r[pick(r, 'pollType').astype(str).str.contains('AP', case=False)] if len(r) else r
        R = pd.DataFrame({'t': pick(r, 'teamId').astype(str), 's': num(pick(r, 'season', '_year')), 'd': pd.to_datetime(pick(r, 'pollDate'), errors='coerce', utc=True),
                          'rk': num(pick(r, 'ranking'))}).dropna(subset=['d', 'rk'])
        R = R[R.rk <= 25]
        log(f'basketball polls: {R.d.dt.date.nunique()} AP poll dates, {int(R.s.min()) if len(R) else 0}-{int(R.s.max()) if len(R) else 0}')
        # the poll in force: the latest AP poll dated before the game
        PD = {s_: sorted(d.d.unique()) for s_, d in R.groupby('s')}; RK = {(s_, d_): dict(zip(x.t, x.rk)) for (s_, d_), x in R.groupby(['s', 'd'])}
        def before(t, s_, d_):
            ds = PD.get(s_)
            if ds is None or pd.isna(d_): return np.nan
            i = np.searchsorted(np.array(ds, dtype='datetime64[ns]'), np.datetime64(d_.tz_convert(None)), side='left') - 1
            return RK[(s_, ds[i])].get(t, np.nan) if i >= 0 else np.nan
        G['hr'] = [before(t, s_, d_) for t, s_, d_ in zip(G.home, G.season, G.date)]; G['ar'] = [before(t, s_, d_) for t, s_, d_ in zip(G.away, G.season, G.date)]
        tests(reg, log, 'basketball', G[['gid', 'season', 'home', 'away', 'margin', 'exp_srs', 'exp_line', 'conf', 'hr', 'ar']], [0, 3, 6, 10, 15, 1e9], 11.0)
    except Exception as e:
        import traceback; log('home basketball FAILED: ' + repr(e)[:300] + ' | ' + traceback.format_exc()[-1500:])
