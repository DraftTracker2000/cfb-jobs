# Pattern hunt 3 — college football base tables built on the runner from the study pulls. STUDY ONLY.
#  G  games (FBS vs FBS, completed): season, week, seasonType, neutral, conference game, home/away team, points, pregame Elo, spread
#  T  team-game rows (two per game): team, opp, home (1/0/neutral 0.5), margin, cover (margin minus the line's expected margin), coach
#  CO head coach by (team, season) from CFBD /coaches (the one with the most games that season)
#  TS team-season: SRS, SP+, talent, recruiting points (4-class average), conference, coach, wins, expected wins
import numpy as np, pandas as pd
from load import frame, pick, num

def build():
    g = frame('cf_games')
    G = pd.DataFrame({
        'gid': pick(g, 'id'), 'season': num(pick(g, 'season', '_year')), 'week': num(pick(g, 'week')),
        'stype': pick(g, 'seasonType', 'season_type'), 'neutral': pick(g, 'neutralSite', 'neutral_site').fillna(False).astype(bool),
        'conf_game': pick(g, 'conferenceGame', 'conference_game').fillna(False).astype(bool),
        'home': pick(g, 'homeTeam', 'home_team'), 'away': pick(g, 'awayTeam', 'away_team'),
        'hconf': pick(g, 'homeConference', 'home_conference'), 'aconf': pick(g, 'awayConference', 'away_conference'),
        'hcls': pick(g, 'homeClassification', 'home_division'), 'acls': pick(g, 'awayClassification', 'away_division'),
        'hpts': num(pick(g, 'homePoints', 'home_points')), 'apts': num(pick(g, 'awayPoints', 'away_points')),
        'helo': num(pick(g, 'homePregameElo', 'home_pregame_elo')), 'aelo': num(pick(g, 'awayPregameElo', 'away_pregame_elo')),
        'date': pick(g, 'startDate', 'start_date')})
    G = G.dropna(subset=['hpts', 'apts']).drop_duplicates('gid')
    fbs = lambda s: s.astype(str).str.lower().isin(['fbs', 'nan']) if s.notna().any() else True
    G['both_fbs'] = fbs(G.hcls) & fbs(G.acls) & G.hconf.notna() & G.aconf.notna()
    # lines: consensus where given, else the average over providers; CFBD spread is from the home side (negative = home favoured)
    l = frame('cf_lines', flat=False)
    sp = {}
    if len(l):
        for gid, L in zip(pick(l, 'id'), pick(l, 'lines')):
            if not isinstance(L, list) or not L: continue
            v = [x.get('spread') for x in L if x.get('provider') in ('consensus', 'Consensus') and x.get('spread') is not None]
            if not v: v = [x.get('spread') for x in L if x.get('spread') is not None]
            v = [float(a) for a in v if a not in (None, '')]
            if v: sp[gid] = -float(np.mean(v))          # expected home margin
    G['exp_home'] = G.gid.map(sp)
    G['margin'] = G.hpts - G.apts
    # coaches
    c = frame('cf_info', flat=False)
    rows = []
    if len(c) and 'seasons' in c.columns:
        for _, x in c.iterrows():
            nm = f"{x.get('firstName', x.get('first_name', ''))} {x.get('lastName', x.get('last_name', ''))}".strip()
            for s in x['seasons'] if isinstance(x.get('seasons'), list) else []:
                rows.append((s.get('school'), s.get('year'), nm, s.get('games') or 0, s.get('wins'), s.get('losses')))
    CO = pd.DataFrame(rows, columns=['team', 'season', 'coach', 'cg', 'w', 'l']).sort_values('cg', ascending=False).drop_duplicates(['team', 'season'])
    co = CO.set_index(['team', 'season']).coach
    h = G.assign(team=G.home, opp=G.away, conf=G.hconf, oconf=G.aconf, pf=G.hpts, pa=G.apts, ishome=np.where(G.neutral, .5, 1.0),
                 exp=G.exp_home, elo=G.helo, oelo=G.aelo)
    a = G.assign(team=G.away, opp=G.home, conf=G.aconf, oconf=G.hconf, pf=G.apts, pa=G.hpts, ishome=np.where(G.neutral, .5, 0.0),
                 exp=-G.exp_home, elo=G.aelo, oelo=G.helo)
    T = pd.concat([h, a], ignore_index=True)[['gid', 'season', 'week', 'stype', 'neutral', 'conf_game', 'team', 'opp', 'conf', 'oconf', 'pf', 'pa',
                                             'ishome', 'exp', 'elo', 'oelo', 'both_fbs', 'date']]
    T['margin'] = T.pf - T.pa; T['cover'] = T.margin - T.exp; T['win'] = np.sign(T.margin).clip(lower=0) + (T.margin == 0) * .5
    T['coach'] = [co.get((t, s)) for t, s in zip(T.team, T.season)]
    T['ocoach'] = [co.get((t, s)) for t, s in zip(T.opp, T.season)]
    # team-season
    def ts(batch, col, *alts):
        d = frame(batch)
        if not len(d): return pd.Series(dtype=float)
        return pd.DataFrame({'team': pick(d, 'team', 'school'), 'season': num(pick(d, 'year', 'season', '_year')), 'v': num(pick(d, col, *alts))}) \
            .dropna().drop_duplicates(['team', 'season']).set_index(['team', 'season']).v
    srs = ts('cf_srs', 'rating'); sp_ = ts('cf_sp', 'rating'); tal = ts('cf_talent', 'talent'); rp = ts('cf_rteams', 'points')
    TS = T[T.stype.astype(str).str.startswith('reg')].groupby(['team', 'season']).agg(games=('gid', 'size'), conf=('conf', 'first'),
                                                                                        coach=('coach', 'first'), wins=('win', 'sum')).reset_index()
    k = list(zip(TS.team, TS.season))
    TS['srs'] = [srs.get(x) for x in k]; TS['sp'] = [sp_.get(x) for x in k]; TS['talent'] = [tal.get(x) for x in k]
    TS['rec4'] = [np.nanmean([rp.get((t, s - i), np.nan) for i in range(4)]) if any((t, s - i) in rp.index for i in range(4)) else np.nan for t, s in k]
    TS['key'] = TS.team + '|' + TS.coach.fillna('?')
    return G, T, CO, TS
