# Pattern hunt 5, round 2 (Nov 6, 2026 — Sam: "try all pattern hunts"). STUDY ONLY. The four questions that need players on each play,
# from the per-play player file pulled Nov 5–6 (cf_playstats: CFBD /plays/stats, FBS games 2020–2025; each row a player's part in a play
# with both teams' scores at the snap).
#  H5-07 blowout padding: a player's share of his yards gained with his team up 17+ — does it go with being drafted, beyond his total?
#  H5-08 big-game production: his yards a game against AP-ranked opponents vs others — the same question
#  H5-09 new transfer QB, first three games: his team against the line, vs teams whose starter isn't new
#  H5-10 backup QB starts: a game started by someone other than the season's main passer, against the line
# The draft outcome is nflverse's players file (nfl_draft.csv: drafted 2003–2026). Only 2020–2024 final seasons can have an answer
# (drafts 2021–2025), so H5-07/08 measure whether the draft rewards it, not NFL careers (too few seasons yet). Same bar as hunt 5.
import os, re
import numpy as np, pandas as pd
import cfb_base
from lib3 import bh, mech, ols_cl, HOLD
from load import answers, frame, pick, num

HERE = os.path.dirname(os.path.abspath(__file__))
nm = lambda s: re.sub(r'[^a-z]', '', re.sub(r'\b(jr|sr|ii|iii|iv)\b\.?', '', str(s).lower()))


def playstats():
    out = []
    for path, L in answers('cf_playstats'):
        if isinstance(L, list) and L: out.append(pd.DataFrame(L))
    if not out: return None
    P = pd.concat(out, ignore_index=True)
    for c in ['gameId', 'season', 'week', 'teamScore', 'opponentScore', 'stat']: P[c] = pd.to_numeric(P.get(c), errors='coerce')
    P['st'] = P.statType.astype(str); P['g'] = P.gameId.astype('Int64').astype(str)
    return P


def run(reg, log, D):
    P = playstats()
    if P is None: log('hunt5b: no per-play player file in this run'); return
    log(f'hunt5b: {len(P)} player-play rows, {P.gameId.nunique()} games, seasons {int(P.season.min())}–{int(P.season.max())}; stat types: '
        + ', '.join(f'{k} {v}' for k, v in P.st.value_counts().head(14).items()))
    G, T, CO, TS = cfb_base.build()
    T = T[T.both_fbs & (T.stype.astype(str) == 'regular') & T.exp.notna()].copy(); T['g'] = T.gid.astype(str); T['season'] = T.season.astype(int)
    out = []
    def fit(y, cols, g):
        df, n = ols_cl(y, cols, g); r = df.iloc[-1]; return float(r.b), float(r.se), float(r.p)

    # ---------- H5-07 / H5-08: rushing and receiving yards, the player's final season in the file ----------
    Y = P[P.st.isin(['Rush', 'Reception'])].copy(); Y['diff'] = Y.teamScore - Y.opponentScore
    rk = frame('cf_rankings', flat=False); ranked = set()
    if len(rk):
        for _, r in rk.iterrows():
            for poll in (r.get('polls') or []):
                if 'AP' in str(poll.get('poll', '')):
                    for x in poll.get('ranks') or []: ranked.add((int(r.get('season', r.get('_year'))), int(r.get('week', 0)), x.get('school')))
    Y['vsrk'] = [(int(s), int(w), o) in ranked or (int(s), int(w) - 1, o) in ranked for s, w, o in zip(Y.season, Y.week.fillna(0), Y.opponent)]
    S = Y.groupby(['athleteId', 'athleteName', 'team', 'season']).agg(yds=('stat', 'sum'), g=('g', 'nunique'),
        blow=('stat', lambda s: s[Y.loc[s.index, 'diff'] >= 17].sum()), rky=('stat', lambda s: s[Y.loc[s.index, 'vsrk']].sum()),
        rkg=('g', lambda s: s[Y.loc[s.index, 'vsrk']].nunique())).reset_index()
    last = S.sort_values('season').groupby('athleteId').tail(1)
    last = last[(last.season <= 2024) & (last.yds >= 400) & (last.g >= 6)].copy()
    dr = pd.read_csv(os.path.join(HERE, 'nfl_draft.csv'), comment='#'); dr['nm'] = dr.name.map(nm)
    got = set(zip(dr.nm, dr.draft_year))
    last['drafted'] = [float((nm(n), s + 1) in got or (nm(n), s + 2) in got) for n, s in zip(last.athleteName, last.season)]
    last['blowsh'] = last.blow / last.yds.clip(lower=1); last['lyds'] = np.log(last.yds)
    log(f'H5-07/08: {len(last)} final seasons 2020–2024 with 400+ rushing/receiving yards; drafted {last.drafted.mean():.3f}')
    if len(last) > 200:
        b, se, p = fit(last.drafted.values, [last.lyds.values, last.blowsh.values], last.team.values)
        h = (last.season >= HOLD - 1).values; bh_, seh, _ = fit(last.drafted.values[h], [last.lyds.values[h], last.blowsh.values[h]], last.team.values[h])
        reg.add('H5-07', 'Share of his yards with his team up 17+ -> drafted, beyond his total (final season 2020–24)', 'mechanism', b, se, p, len(last),
                oos_pass=bool(np.sign(bh_) == np.sign(b) and seh > 0 and abs(bh_ / seh) > 1.28), detail=f'per 1.0 of share; holdout seasons 2021+ est {bh_:+.3f} (se {seh:.3f})')
        R = last[last.rkg >= 2].copy()
        if len(R) > 150:
            R['rkpg'] = R.rky / R.rkg; R['opg'] = (R.yds - R.rky) / (R.g - R.rkg).clip(lower=1); R['gap'] = R.rkpg - R.opg
            b, se, p = fit(R.drafted.values, [R.lyds.values, (R.gap / 10).values], R.team.values)
            h = (R.season >= HOLD - 1).values; bh_, seh, _ = fit(R.drafted.values[h], [R.lyds.values[h], (R.gap / 10).values[h]], R.team.values[h])
            reg.add('H5-08', 'Yards a game vs AP-ranked opponents minus vs others (per 10) -> drafted, beyond his total', 'mechanism', b, se, p, len(R),
                    oos_pass=bool(np.sign(bh_) == np.sign(b) and seh > 0 and abs(bh_ / seh) > 1.28), detail=f'{len(R)} players with 2+ ranked games; holdout 2021+ est {bh_:+.3f} (se {seh:.3f})')

    # ---------- H5-09 / H5-10: the passer in each game ----------
    Q = P[P.st.isin(['Completion', 'Incompletion', 'Interception Thrown', 'Sack Taken'])]
    pa = Q.groupby(['g', 'season', 'team', 'athleteId', 'athleteName']).size().rename('n').reset_index()
    st = pa.sort_values('n').groupby(['g', 'team']).tail(1)   # the game's main passer
    main = pa.groupby(['season', 'team', 'athleteId']).n.sum().reset_index().sort_values('n').groupby(['season', 'team']).tail(1).rename(columns={'athleteId': 'mainQB'})
    st = st.merge(main[['season', 'team', 'mainQB']], on=['season', 'team'])
    # transfer QB: his previous season's main team was another school
    prev = pa.groupby(['season', 'athleteId', 'team']).n.sum().reset_index().sort_values('n').groupby(['season', 'athleteId']).tail(1)
    prev = prev.assign(season=prev.season + 1).rename(columns={'team': 'pteam'})[['season', 'athleteId', 'pteam']]
    st = st.merge(prev, on=['season', 'athleteId'], how='left')
    st['transfer'] = (st.pteam.notna() & (st.pteam != st.team)).astype(float)
    X9 = T.merge(st[['g', 'team', 'athleteId', 'mainQB', 'transfer']], on=['g', 'team'])
    X9 = X9.sort_values(['team', 'season', 'date']); X9['gno'] = X9.groupby(['team', 'season']).cumcount() + 1
    E = X9[X9.gno <= 3]
    log(f'H5-09: {len(X9)} team-games with a line and a passer; transfer starters in games 1–3: {int(E.transfer.sum())}')
    if E.transfer.sum() > 60:
        r = mech(reg, 'H5-09', 'Transfer QB starting, games 1–3 of the season -> vs the line', E.cover.values, E.transfer.values, E.g.values, E.season.values, unit='pts')
        L = X9[X9.gno >= 4]
        r = mech(reg, 'H5-09', 'Transfer QB starting, games 4+ -> vs the line (the comparison)', L.cover.values, L.transfer.values, L.g.values, L.season.values, unit='pts')
    X9['backup'] = (X9.athleteId != X9.mainQB).astype(float)
    log(f'H5-10: {int(X9.backup.sum())} games started by someone other than the season\'s main passer')
    if X9.backup.sum() > 100:
        r = mech(reg, 'H5-10', 'Game started by someone other than the season\'s main passer -> vs the line', X9.cover.values, X9.backup.values, X9.g.values, X9.season.values, unit='pts')

    # ---------- this round's BH pass ----------
    R = reg.df(); R = R[R.hyp.astype(str).str.match(r'H5-(07|08|09|10)')].copy()
    R['q'] = bh(pd.to_numeric(R.p, errors='coerce').fillna(1).values); R['survives'] = (R.q < .10) & (R.oos_pass == True)
    lines = [f'hunt5b · {len(R)} tests · per-play player file 2020–2025 · BH q < .10 and the later seasons the same way']
    for _, x in R.iterrows():
        lines.append(f"{'SURVIVES' if x.survives else 'no'} · {x.hyp} {x.label}: est {x.est:+.4g} (p {x.p:.3g}, q {x.q:.3g}, n {x.n}) · {str(x.detail)[:380]}")
    pack, cur = [], ''
    for l_ in lines:
        if len(cur) + len(l_) + 3 > 3800: pack.append(cur); cur = ''
        cur = (cur + ' ‖ ' if cur else '') + l_
    if cur: pack.append(cur)
    for i, x in enumerate(pack[:10]): print(f'::notice title=hunt5b {i + 1:02d}/{len(pack):02d}::{x}')
