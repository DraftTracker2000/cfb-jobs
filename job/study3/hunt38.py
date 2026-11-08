# Pattern hunt 38 (Nov 7, 2026 — 3:07 pm: "for a players toughest team the next season and really in the season. you can't just look at
# points … bad rebounding games … having to shoot more to get the points … hurts their efficiency … more turnovers. all of those things and
# more. every angle"). STUDY ONLY. Box scores (sportsdataverse, flagged), NBA and men's college 2015–2026, regular season.
# Every stat per 36 minutes (efficiency as true shooting), each as: the game minus his own season average minus what that opponent usually
# allows (vs the league). Only games where the opponent had its top-5 minutes players (full strength; hunt 32). Prediction first (rule 12):
#  A  every later meeting: tagged by all his EARLIER full-strength meetings with that team (any season, 2+), scored on this meeting
#  B  next season: tagged from earlier seasons only, scored on the next season's meetings
# "Toughest" = the worst 15% for that stat (most turnovers, most fouls, most shots needed count as worst). Plus "how many of his stats went bad
# at once" and the Hollinger game score per 36 as an all-in-one.
import sys, os, numpy as np, pandas as pd
from scipy import stats

D = sys.argv[1]; OUT = []
def say(s): OUT.append(s); print(s, flush=True)
STATS = {'pts': ('points', +1), 'fga': ('shots taken', -1), 'ts': ('true shooting %', +1), 'reb': ('rebounds', +1), 'oreb': ('offensive rebounds', +1),
         'ast': ('assists', +1), 'tov': ('turnovers', -1), 'stl': ('steals', +1), 'blk': ('blocks', +1), 'pf': ('fouls', -1), 'fta': ('free throws drawn', +1),
         'gs': ('game score (all-in-one)', +1)}
for lg in ('nba', 'mbb'):
    B = pd.concat([pd.read_csv(f'{D}/{lg}{y}.csv', low_memory=False) for y in range(2015, 2027) if os.path.exists(f'{D}/{lg}{y}.csv')], ignore_index=True)
    B = B[B.season_type == 2].copy()
    num = ['minutes', 'points', 'field_goals_made', 'field_goals_attempted', 'three_point_field_goals_made', 'free_throws_made', 'free_throws_attempted', 'offensive_rebounds',
           'defensive_rebounds', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls']
    for c in num: B[c] = pd.to_numeric(B[c], errors='coerce')
    B['minutes'] = B.minutes.fillna(0)
    reg = B[B.minutes > 0].groupby(['season', 'team_id', 'athlete_id']).agg(mpg=('minutes', 'mean'), gp=('minutes', 'size')).reset_index(); reg = reg[(reg.mpg >= 20) & (reg.gp >= 20)]
    top5 = reg.sort_values('mpg', ascending=False).groupby(['season', 'team_id']).head(5).groupby(['season', 'team_id']).athlete_id.apply(set).to_dict()
    on = B[B.minutes >= 20].groupby(['game_id', 'team_id']).athlete_id.apply(set)
    P = B[B.minutes >= 15].copy(); k = 36 / P.minutes
    P['pts'] = P.points * k; P['fga'] = P.field_goals_attempted * k; P['reb'] = P.rebounds * k; P['oreb'] = P.offensive_rebounds * k; P['ast'] = P.assists * k
    P['tov'] = P.turnovers * k; P['stl'] = P.steals * k; P['blk'] = P.blocks * k; P['pf'] = P.fouls * k; P['fta'] = P.free_throws_attempted * k
    den = 2 * (P.field_goals_attempted + .44 * P.free_throws_attempted); P['ts'] = np.where(den > 0, P.points / den, np.nan)
    P['gs'] = (P.points + .4 * P.field_goals_made - .7 * P.field_goals_attempted - .4 * (P.free_throws_attempted - P.free_throws_made) + .7 * P.offensive_rebounds
               + .3 * P.defensive_rebounds + P.steals + .7 * P.assists + .7 * P.blocks - .4 * P.fouls - P.turnovers) * k
    P = P[P.groupby(['season', 'athlete_id']).minutes.transform('size') >= 20]
    P['full'] = [top5.get((s, o), set()) <= on.get((g, o), set()) for g, s, o in zip(P.game_id, P.season, P.opponent_team_id)]
    for c in STATS:
        own = P.groupby(['season', 'athlete_id'])[c].transform('mean'); dav = P.groupby(['season', 'opponent_team_id'])[c].transform('mean') - P.groupby('season')[c].transform('mean')
        P['x_' + c] = P[c] - own - dav
    F = P[P.full].sort_values(['athlete_id', 'opponent_team_id', 'game_date']).copy()
    say(f'== {lg.upper()}: {len(F)} full-strength player-games')
    res = {}
    for c, (lab, good) in STATS.items():
        x = 'x_' + c; key = [F.athlete_id, F.opponent_team_id]; v0 = F[x].fillna(0); n0 = F[x].notna().astype(int)
        cs = v0.groupby(key).cumsum() - v0; cn = n0.groupby(key).cumsum() - n0; F['pm'] = np.where(cn > 0, cs / cn.replace(0, 1), np.nan); F['pn'] = cn
        A_ = F[(F.pn >= 2) & F.pm.notna() & F[x].notna()].copy()
        # worst 15% for this stat, cut within each season
        if good > 0: A_['tag'] = A_.pm <= A_.groupby('season').pm.transform(lambda s: s.quantile(.15))
        else: A_['tag'] = A_.pm >= A_.groupby('season').pm.transform(lambda s: s.quantile(.85))
        a, b = A_[A_.tag][x], A_[~A_.tag][x]; t, p = stats.ttest_ind(a, b, equal_var=False)
        same = ((a < b.mean()) if good > 0 else (a > b.mean())).mean()
        res[c] = (a.mean() - b.mean(), p, len(a), same)
        # B next season
        pair = F.groupby(['athlete_id', 'opponent_team_id', 'season'])[x].agg(['sum', 'size']).reset_index(); vals = []
        for s in sorted(pair.season.unique())[2:]:
            w = pair[(pair.season < s) & (pair.season >= s - 3)].groupby(['athlete_id', 'opponent_team_id'])[['sum', 'size']].sum(); w = w[w['size'] >= 2]
            if not len(w): continue
            m = w['sum'] / w['size']; tg_ = m.index[m <= m.quantile(.15)] if good > 0 else m.index[m >= m.quantile(.85)]
            now = pair[pair.season == s].set_index(['athlete_id', 'opponent_team_id']); vals.append((now['sum'] / now['size']).reindex(tg_).dropna())
        v = pd.concat(vals); t2, p2 = stats.ttest_1samp(v, 0)
        say(f'{lab}: later meetings (same season or after) {a.mean() - b.mean():+.3f} vs his other matchups (p {p:.2g}, {len(a)} games; {same:.0%} on the bad side) · '
            f'next season {v.mean():+.3f} (p {p2:.2g}, {len(v)} pairs)')
    # how often several things go bad at once against a tagged-toughest (by game score) team
    Fz = F.copy(); bads = []
    for c, (lab, good) in STATS.items():
        if c == 'gs': continue
        z = Fz['x_' + c] / Fz['x_' + c].std(); bads.append((z < -.5) if good > 0 else (z > .5))
    Fz['nbad'] = np.sum(np.vstack([b.fillna(False).values for b in bads]), axis=0)
    key = [Fz.athlete_id, Fz.opponent_team_id]; v0 = Fz.x_gs.fillna(0); n0 = Fz.x_gs.notna().astype(int)
    cs = v0.groupby(key).cumsum() - v0; cn = n0.groupby(key).cumsum() - n0; Fz['pm'] = np.where(cn > 0, cs / cn.replace(0, 1), np.nan); Fz['pn'] = cn
    A_ = Fz[(Fz.pn >= 2) & Fz.pm.notna()].copy(); A_['tag'] = A_.pm <= A_.groupby('season').pm.transform(lambda s: s.quantile(.15))
    say(f'Stats gone bad at once (of {len(bads)}) vs a team that was his toughest by game score before: {A_[A_.tag].nbad.mean():.2f} vs {A_[~A_.tag].nbad.mean():.2f} against his other opponents')
