# Pattern hunt 3 — the driver the data job's study mode runs on the GitHub runner (job/study3/run.py study-data <part>). STUDY ONLY.
# Part 1 runs every hypothesis (each in its own try, so one broken test doesn't stop the rest), one Benjamini-Hochberg pass over every
# test registered this round, and packs the RESULTS (tests, survivors, the log of tables) as gzip + base64 in study-data/results.b64.
# Each part then prints 10 pieces of it as notices (GitHub keeps 10 notices a step, 4,096 characters each): part 1 pieces 1-10, part 2
# 11-20, part 3 21-30. Only aggregate results go out; the pulled data stays on the runner. Reassemble with read_results.py.
import sys, os, json, gzip, base64, traceback, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, pandas as pd
from lib3 import Reg, bh
import load

D, part = sys.argv[1], int(sys.argv[2])
OUT = os.path.join(D, 'results.b64'); PIECE = 3900

def emit(start):
    if not os.path.exists(OUT): print('study results: no results file (a findings-only run has none)'); return
    s = open(OUT).read(); n = (len(s) + PIECE - 1) // PIECE
    for i in range(start, min(start + 10, n)): print(f'::notice title=study results {i + 1:02d}/{n:02d}::{s[i * PIECE:(i + 1) * PIECE]}')
    if part == 3 and n > 30: print(f'::warning title=study results::{n} pieces, only 30 printed — trim the log')

if part > 1: emit((part - 1) * 10); sys.exit(0)

load.init(D)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); LOG.append(s); print(s, flush=True)
reg = Reg(os.path.join(D, 'reg.pkl')); t0 = time.time(); errors = []
def step(name, f, *a):
    t = time.time()
    try: r = f(*a); log(f'[{name}] done in {time.time() - t:.0f}s'); return r
    except Exception as e: errors.append(f'{name}: {e!r}'); log(f'[{name}] FAILED: {traceback.format_exc()[-1500:]}'); return None

import cfb_base, cfb_teams, cfb_players, cfb_box, cfb_plays, cbb, home
try: FOCUS = json.load(open(os.path.join(D, 'manifest.json'))).get('focus')
except Exception: FOCUS = None
log(f'focus: {FOCUS or "everything"}')
if FOCUS == 'findings': print('focus:findings — no hunt analysis this run; findings.py builds the packs'); sys.exit(0)
if FOCUS == 'hunt4':   # pattern hunt 4 (Thursday #41, Nov 5): the game-level topics, its own notices; nothing else this run
    import hunt4; step('hunt4', hunt4.run, reg, log, D); print('hunt4 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt5':   # pattern hunt 5 (Nov 6 — the owner: "try all pattern hunts"), its own notices; nothing else this run
    import hunt5; step('hunt5', hunt5.run, reg, log, D); print('hunt5 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'bbhunt6':   # pattern hunt 6, college basketball (Nov 6 — the owner, 10:09 am), its own notices; nothing else this run
    import bbhunt6; step('bbhunt6', bbhunt6.run, reg, log, D); print('bbhunt6 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt15b':   # hunt 15 round 2: defenders from the season stat lines
    import hunt15; step('hunt15b', hunt15.run_b, reg, log, D); print('hunt15b errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt15':   # pattern hunt 15 (Nov 6, 9:54 pm — the owner: "back to hunts"): college defenders
    import hunt15; step('hunt15', hunt15.run, reg, log, D); print('hunt15 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt44':   # tagged coaches: close at the end? (Nov 7, 5:53 pm)
    import hunt44; step('hunt44', hunt44.run, reg, log, D); print('hunt44 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt43':   # coach tags: coach or program? (Nov 7)
    import hunt43; step('hunt43', hunt43.run, reg, log, D); print('hunt43 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt42':   # backtest of the new college formula terms (Nov 7)
    import hunt42; step('hunt42', hunt42.run, reg, log, D); print('hunt42 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt36':   # retest series part 8 (Nov 7, rule 12): college player splits, prediction first
    import hunt36; step('hunt36', hunt36.run, reg, log, D); print('hunt36 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt33':   # pattern hunt 33 (Nov 7, 2:16 pm): untested offenses vs strong defenses; Utah and BYU this season
    import hunt33; step('hunt33', hunt33.run, reg, log, D); print('hunt33 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt31':   # retest series part 5 (Nov 7, rule 12): college teams and coaches vs the line, prediction first
    import hunt31; step('hunt31', hunt31.run, reg, log, D); print('hunt31 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt26':   # pattern hunt 26 (Nov 7 — rule 12): the coach tags, prediction first, then the same ilk
    import hunt26; step('hunt26', hunt26.run, reg, log, D); print('hunt26 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt25':   # pattern hunt 25 (Nov 7 — 1:28 pm: "i like testing that in all ways"): first-year college coaches, every cut
    import hunt25; step('hunt25', hunt25.run, reg, log, D); print('hunt25 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt24':   # pattern hunt 24 (Nov 7 — the owner, 1:16 pm): head-coach experience, Upset Artist, Big-Game Hunter (college football)
    import hunt24; step('hunt24', hunt24.run, reg, log, D); print('hunt24 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt23':   # pattern hunt 23 (Nov 7 — the owner, 1:42 am: "do all the hunts you listed"): college football coach style follows the coach?
    import hunt23; step('hunt23', hunt23.run, reg, log, D); print('hunt23 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt13f':   # pattern hunt 13, college football team splits (Nov 6 — the owner: "team splits")
    import hunt13f; step('hunt13f', hunt13f.run, reg, log, D); print('hunt13f errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt11':   # pattern hunt 11 (Nov 6, 8:59 pm — the owner: "DEEP hunts … like the player studies"): college player splits, tells, receivers with new passers
    import hunt11; step('hunt11', hunt11.run, reg, log, D); print('hunt11 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt9c':   # pattern hunt 9, college (Nov 6, 8:29 pm — the owner: "keep going"): second pass on cf_records, cf_tstats, bb_portal
    import hunt9c; step('hunt9c', hunt9c.run, reg, log, D); print('hunt9c errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt8':   # pattern hunt 8 (Nov 6 — the owner: "all angles"; "more hidden data hunts" for broadcasters): college play-by-play
    import hunt8; step('hunt8', hunt8.run, reg, log, D); print('hunt8 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt7e':   # hunt 7 round 6: every level to every level
    import hunt7; step('hunt7e', hunt7.run_e, reg, log, D); print('hunt7e errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt7d':   # hunt 7 round 5: football transfers up and down a level
    import hunt7; step('hunt7d', hunt7.run_d, reg, log, D); print('hunt7d errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt7c':   # hunt 7 round 4: vacated usage by why the players left
    import hunt7; step('hunt7c', hunt7.run_c, reg, log, D); print('hunt7c errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt7b':   # hunt 7 round 3: basketball transfers joined to season stats
    import hunt7; step('hunt7b', hunt7.run_b, reg, log, D); print('hunt7b errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt7':   # pattern hunt 7 (Nov 6 — the owner, 5:04 pm: "exhaust these before releasing. all angles"): the batches no hunt had read
    import hunt7; step('hunt7', hunt7.run, reg, log, D); print('hunt7 errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'hunt5b':   # pattern hunt 5 round 2 (Nov 6): the per-play player file
    import hunt5b; step('hunt5b', hunt5b.run, reg, log, D); print('hunt5b errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'cfprate':   # Thursday #5/#6 (Nov 5): the rating settings and Elo vs this season, its own notices; nothing else this run
    import cfprate; step('cfprate', cfprate.run, reg, log, D); print('cfprate errors:', errors); sys.exit(1 if errors else 0)
if FOCUS == 'coachdev':
    import coachdev; step('coachdev', coachdev.run, reg, log, D)
if FOCUS in ('bbdiag', 'bbdev'):
    import bbdev; step(FOCUS, bbdev.diag if FOCUS == 'bbdiag' else bbdev.run, reg, log, D)
if FOCUS == 'bb5':
    import bb5star; step('bb5', bb5star.run, reg, log, D)
if FOCUS == 'bbtal':
    import bbtalent; step('bbtal', bbtalent.run, reg, log, D)
# "focus:home" (Nov 1 follow-up): only the home-edge tests, so this follow-up's BH pass covers its own tests
base = step('home', home.run, reg, log) if FOCUS == 'home' else None if FOCUS in ('coachdev', 'bbdiag', 'bbdev', 'bb5', 'bbtal') else step('base', cfb_base.build)
if base and FOCUS not in ('home', 'coachdev', 'bbdiag', 'bbdev', 'bb5', 'bbtal'):
    G, T, CO, TS = base
    log(f'base: {len(G)} games ({int(G.both_fbs.sum())} FBS v FBS), lines for {G.exp_home.notna().mean():.2f}; {len(CO)} coach-seasons; {len(TS)} team-seasons; '
        f'SRS {TS.srs.notna().mean():.2f}, talent {TS.talent.notna().mean():.2f}, recruiting {TS.rec4.notna().mean():.2f}')
    step('teams', cfb_teams.run, reg, log, G, T, CO, TS)
    P = step('player seasons', cfb_players.player_seasons)
    step('players', cfb_players.run, reg, log, G, T, CO, TS, P)
    if P is not None: step('box', cfb_box.run, reg, log, G, T, CO, TS, P)
    step('plays', cfb_plays.run, reg, log, G, T, CO, TS)
if FOCUS not in ('home', 'coachdev', 'bbdiag', 'bbdev', 'bb5', 'bbtal'): step('cbb', cbb.run, reg, log, D)

R = reg.df()
if len(R):
    R['p'] = pd.to_numeric(R.p, errors='coerce').clip(lower=1e-300).fillna(1.0); R['q'] = bh(R.p.values)
    R['survives'] = (R.q < .10) & (R.oos_pass == True) & (R.loo_pass != False)
# what goes out: every pattern test, and the named tests that matter (survivors and p < .01, at most 25 per hypothesis), plus each
# hypothesis's best 3 names; details cut to 200 characters
if len(R):
    nm = R[R.kind == 'named'].sort_values('p')
    keep = pd.concat([R[R.kind != 'named'], nm[(nm.p < .01) | nm.survives].groupby('hyp').head(25), nm.groupby('hyp').head(3), nm[nm.label.str.contains('Tom Izzo|Dan Hurley|Kyle Smith|Jamie Dixon')] if FOCUS == 'bbdev' else nm[nm.label.str.contains('Tom Izzo|Dan Hurley|Bill Self|John Calipari|Jon Scheyer|Mike Krzyzewski|Mark Few')] if FOCUS in ('bb5', 'bbtal') else nm.head(0)]).drop_duplicates(['hyp', 'label'])
    keep = keep.assign(detail=keep.detail.astype(str).str.slice(0, 200))
else: keep = R
try: man = json.load(open(os.path.join(D, 'manifest.json')))
except Exception: man = {}
res = {'v': 1, 'at': time.time(), 'minutes': (time.time() - t0) / 60, 'manifest': man, 'errors': errors,
       'counts': {'tests': int(len(R)), 'hyps': int(R.hyp.nunique()) if len(R) else 0, 'q10': int((R.q < .1).sum()) if len(R) else 0,
                  'survive': int(R.survives.sum()) if len(R) else 0, 'named': int((R.kind == 'named').sum()) if len(R) else 0},
       'per_hyp': (R.groupby('hyp').agg(n=('p', 'size'), best_q=('q', 'min'), surv=('survives', 'sum'), named_surv=('survives', lambda x: int((x & (R.loc[x.index, 'kind'] == 'named')).sum()))).reset_index().to_dict('records') if len(R) else []),
       'log': LOG, 'tests': json.loads(keep.replace({np.nan: None}).to_json(orient='records')) if len(R) else []}
raw = json.dumps(res, default=str).encode()
while True:
    b = base64.b64encode(gzip.compress(raw, 9)).decode()
    if len(b) <= 30 * PIECE: break
    if len(res['tests']) > 300: res['tests'] = [t for t in res['tests'] if t['kind'] != 'named'] + sorted([t for t in res['tests'] if t['kind'] == 'named'], key=lambda t: t['p'])[: int(sum(t['kind'] == 'named' for t in res['tests']) * .8)]
    elif len(res['log']) > 50: res['log'] = res['log'][: int(len(res['log']) * .8)] + ['… log cut to fit the 30 notices']
    else: break
    raw = json.dumps(res, default=str).encode()
open(OUT, 'w').write(b)
print(f'results: {len(R)} tests, {res["counts"]["survive"]} survive; {len(b)} characters in {(len(b) + PIECE - 1) // PIECE} pieces; errors: {errors}')
emit(0)
