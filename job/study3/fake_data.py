# Pattern hunt 3 — a small synthetic study-data/ folder in the shapes CFBD/CBBD send, to run run.py end to end before it goes to the
# runner (catches code errors, not findings). STUDY ONLY. usage: python3 fake_data.py OUT_DIR
import sys, os, gzip, json, random
import numpy as np
O = sys.argv[1]; os.makedirs(O, exist_ok=True); rng = random.Random(1); nr = np.random.default_rng(1)
YEARS = range(2012, 2027); TEAMS = [f'Team{i}' for i in range(40)]; CONF = {t: ['SEC', 'ACC', 'MAC', 'Sun Belt'][i % 4] for i, t in enumerate(TEAMS)}
def put(batch, y, data): json.dump({'v': 1, 'batch': batch, 'data': data}, gzip.open(f'{O}/{batch}{"_" + str(y) if y else ""}.json.gz', 'wt'))
put('cf_info', 0, {'/conferences': [{'name': 'SEC'}], '/coaches?minYear=2000&maxYear=2026': [
    {'firstName': 'Coach', 'lastName': str(i), 'seasons': [{'school': TEAMS[(i + (y > 2018) * 3) % 40], 'year': y, 'games': 12, 'wins': 6, 'losses': 6} for y in YEARS]} for i in range(40)]})
gid = 0; Q = {t: nr.normal() * 10 for t in TEAMS}
for y in YEARS:
    G, L = [], []
    for w in range(1, 13):
        sh = TEAMS[:]; rng.shuffle(sh)
        for a, b in zip(sh[::2], sh[1::2]):
            gid += 1; m = Q[a] - Q[b] + 3 + nr.normal() * 14
            G.append({'id': gid, 'season': y, 'week': w, 'seasonType': 'regular' if w < 12 else 'postseason', 'neutralSite': w == 12, 'conferenceGame': CONF[a] == CONF[b],
                      'homeTeam': a, 'awayTeam': b, 'homeConference': CONF[a], 'awayConference': CONF[b], 'homeClassification': 'fbs', 'awayClassification': 'fbs',
                      'homePoints': max(0, int(28 + m / 2)), 'awayPoints': max(0, int(28 - m / 2)), 'homePregameElo': 1500, 'awayPregameElo': 1500, 'startDate': f'{y}-09-0{1 + w % 8}'})
            L.append({'id': gid, 'lines': [{'provider': 'consensus', 'spread': -(Q[a] - Q[b] + 3)}]})
    put('cf_games', y, {f'/games?year={y}&seasonType=both': G}); put('cf_lines', y, {f'/lines?year={y}&seasonType=regular': L})
    put('cf_srs', y, {f'/ratings/srs?year={y}': [{'year': y, 'team': t, 'rating': Q[t]} for t in TEAMS]})
    put('cf_sp', y, {f'/ratings/sp?year={y}': [{'year': y, 'team': t, 'rating': Q[t]} for t in TEAMS]})
    put('cf_talent', y, {f'/talent?year={y}': [{'year': y, 'school': t, 'talent': 500 + Q[t] * 10} for t in TEAMS]})
    put('cf_rteams', y, {f'/recruiting/teams?year={y}': [{'year': y, 'team': t, 'points': 200 + Q[t] * 5 + nr.normal() * 10} for t in TEAMS]})
    put('cf_teams', y, {f'/teams/fbs?year={y}': [{'school': t, 'conference': CONF[t], 'location': {'state': 'TX' if i % 2 else 'FL'}} for i, t in enumerate(TEAMS)]})
    rec = [{'id': f'r{y}{i}', 'athleteId': f'p{y}{i}', 'year': y, 'name': f'Rec {y} {i}', 'stars': 2 + i % 4, 'rating': .8 + (i % 20) / 100, 'committedTo': TEAMS[i % 40],
            'stateProvince': 'TX', 'position': ['QB', 'RB', 'WR', 'TE', 'LB', 'DB', 'DL'][i % 7]} for i in range(300)]
    put('cf_recruits', y, {f'/recruiting/players?year={y}&classification=HighSchool': rec})
    put('cf_portal', y, {f'/player/portal?year={y}': [{'season': y, 'firstName': 'Rec', 'lastName': f'{y - 1} {i}', 'origin': TEAMS[i % 40], 'destination': TEAMS[(i + 1) % 40], 'stars': 3, 'rating': .85, 'position': 'WR'} for i in range(50)]})
    # player season stats: players recruited y-3..y
    rows = []
    for c in range(y - 3, y + 1):
        for i in range(300):
            pid = f'p{c}{i}'; pos = ['QB', 'RB', 'WR', 'TE', 'LB', 'DB', 'DL'][i % 7]; t = TEAMS[(i + (y - c == 2 and i % 9 == 0)) % 40]
            if pos == 'QB' and i % 3: continue
            base = dict(season=y, playerId=pid, player=f'Rec {c} {i}', position=pos, team=t, conference=CONF[t])
            st = {'QB': [('passing', 'ATT', 250), ('passing', 'YDS', 2000), ('passing', 'COMPLETIONS', 150)], 'RB': [('rushing', 'CAR', 120), ('rushing', 'YDS', 600), ('receiving', 'YDS', 100)],
                  'WR': [('receiving', 'REC', 40), ('receiving', 'YDS', 500)], 'TE': [('receiving', 'YDS', 200)], 'LB': [('defensive', 'TOT', 60), ('defensive', 'SACKS', 2)],
                  'DB': [('defensive', 'TOT', 40)], 'DL': [('defensive', 'TOT', 30), ('defensive', 'SACKS', 4)]}[pos]
            for cat, s_, v in st: rows.append({**base, 'category': cat, 'statType': s_, 'stat': str(int(v * (0.5 + nr.random()) * (1 + (y - c) * .2)))})
    put('cf_pstats', y, {f'/stats/player/season?year={y}&category=all': rows})
    if y >= 2014:
        put('cf_ppa', y, {f'/ppa/players/season?year={y}': [{'season': y, 'id': r['playerId'], 'name': r['player'], 'position': 'QB', 'team': r['team'], 'averagePPA': {'pass': nr.normal() * .2, 'thirdDown': nr.normal() * .2}} for r in rows if r['position'] == 'QB' and r['statType'] == 'ATT']})
    box = {}; plays = {}
    for w in range(1, 12):
        Lb = []; Lp = []
        for g in [g for g in G if g['week'] == w]:
            for side, opp in [('homeTeam', 'awayTeam'), ('awayTeam', 'homeTeam')]:
                t = g[side]; pl_ = [r for r in rows if r['team'] == t and r['statType'] in ('ATT', 'CAR', 'YDS')][:12]
                Lb.append([g['id'], t, CONF[t], 'home' if side == 'homeTeam' else 'away', g['homePoints'], 'tot', 'Team', {}])
                for r in pl_:
                    s = {'QB': {'passing.C/ATT': f'{rng.randint(10, 20)}/{rng.randint(20, 35)}', 'passing.YDS': str(rng.randint(100, 350)), 'passing.INT': str(rng.randint(0, 2))},
                         'RB': {'rushing.CAR': str(rng.randint(5, 25)), 'rushing.YDS': str(rng.randint(10, 150)), 'receiving.YDS': str(rng.randint(0, 40))},
                         'DL': {'defensive.SACKS': str(rng.randint(0, 2))}}.get(r['position'], {'receiving.YDS': str(rng.randint(0, 120)), 'receiving.REC': '3'})
                    Lb.append([g['id'], t, CONF[t], 'home', 20, r['playerId'], r['player'], s])
                if y >= 2014:
                    for k in range(60):
                        Lp.append([g['id'], 1, t, g[opp], g['homeTeam'], rng.randint(0, 30), rng.randint(0, 30), 1 + k // 15, rng.randint(0, 900), rng.randint(1, 99), 1 + k % 4, rng.randint(1, 10), rng.randint(-3, 15),
                                   rng.choice(['Rush', 'Pass Reception', 'Pass Incompletion', 'Punt', 'Field Goal Good', 'Sack']), nr.normal() * .5, 0, CONF[t], CONF[g[opp]]])
        box[f'/games/players?year={y}&week={w}&seasonType=regular'] = Lb
        if y >= 2014: plays[f'/plays?year={y}&week={w}&seasonType=regular'] = Lp
    put('cf_box', y, box)
    if plays: put('cf_plays', y, plays)
    # basketball
    put('bb_stats', y, {f'/stats/player/season?season={y}': [{'season': y, 'athleteId': f'b{c}{i}', 'teamId': str((i + (y - c == 2 and i % 7 == 0)) % 40), 'team': f'T{i % 40}', 'position': 'GFC'[i % 3],
                                                              'minutes': 500, 'points': 200 + 20 * (y - c) + rng.randint(0, 50), 'name': 'x', 'winShares': {'totalPer40': .1 + .02 * (y - c) + nr.normal() * .03}}
                                                             for c in range(y - 3, y + 1) for i in range(150)]})
    put('bb_roster', y, {f'/teams/roster?season={y}': [{'teamId': str(t), 'players': [{'id': f'b{c}{i}', 'startSeason': c} for c in range(y - 3, y + 1) for i in range(150) if i % 40 == t]} for t in range(40)]})
    put('bb_srs', y, {f'/ratings/srs?season={y}': [{'season': y, 'teamId': str(t), 'rating': nr.normal() * 8} for t in range(40)]})
    put('bb_recruits', y, {f'/recruiting/players?year={y}': [{'athleteId': f'b{y + 1}{i}', 'year': y, 'rating': .8 + i % 10 / 100, 'stars': 3, 'committedTo': {'id': i % 40}} for i in range(150)]})
    bg = []
    for k in range(600):
        a, b = rng.sample(range(40), 2); bg.append({'id': f'{y}{k}', 'season': y, 'homeTeamId': str(a), 'awayTeamId': str(b), 'homePoints': rng.randint(50, 90), 'awayPoints': rng.randint(50, 90),
                                                  'neutralSite': False, 'conferenceGame': k % 2 == 0, 'tournament': None, 'homeConference': 'A', 'awayConference': 'A' if k % 2 == 0 else 'B', 'startDate': f'{y}-0{rng.choice([1, 2, 3])}-10T00:00:00Z' if k % 2 else f'{y - 1}-1{rng.choice([1, 2])}-10T00:00:00Z', 'seasonType': 'regular'})
    put('bb_games', y, {f'/games?season={y}&startDateRange=x': bg})
for y in YEARS:
    put('cf_rankings', y, {f'/rankings?year={y}&seasonType=regular': [{'season': y, 'seasonType': 'regular', 'week': w, 'polls': [{'poll': 'AP Top 25', 'ranks': [{'rank': i + 1, 'school': TEAMS[(i + w) % 40]} for i in range(25)]}]} for w in range(1, 13)]})
    put('bb_rankings', y, {f'/rankings?season={y}': [{'season': y, 'pollDate': f'{y - 1}-12-{d:02d}T00:00:00Z', 'pollType': 'AP Top 25', 'teamId': str((i + d) % 40), 'ranking': i + 1} for d in (1, 15) for i in range(25)]})
    put('bb_lines', y, {f'/lines?season={y}&x=1': [{'gameId': f'{y}{k}', 'lines': [{'provider': 'consensus', 'spread': rng.uniform(-10, 10)}]} for k in range(600)]})
json.dump({'cbb-coaches': {'coaches': {str(i): {'nm': f'BB Coach {i}'} for i in range(40)}, 'bySeason': {str(y): {str(t): str(t) for t in range(40)} for y in YEARS}}},
          gzip.open(f'{O}/site_p2026_cbb-coaches.json.gz', 'wt'))
json.dump({'batches': []}, open(f'{O}/manifest.json', 'w')); print('fake data written')
