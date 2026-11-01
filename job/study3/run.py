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
if FOCUS == 'coachdev':
    import coachdev; step('coachdev', coachdev.run, reg, log, D)
if FOCUS in ('bbdiag', 'bbdev'):
    import bbdev; step(FOCUS, bbdev.diag if FOCUS == 'bbdiag' else bbdev.run, reg, log, D)
if FOCUS == 'bb5':
    import bb5star; step('bb5', bb5star.run, reg, log, D)
# "focus:home" (Nov 1 follow-up): only the home-edge tests, so this follow-up's BH pass covers its own tests
base = step('home', home.run, reg, log) if FOCUS == 'home' else None if FOCUS in ('coachdev', 'bbdiag', 'bbdev', 'bb5') else step('base', cfb_base.build)
if base and FOCUS not in ('home', 'coachdev', 'bbdiag', 'bbdev', 'bb5'):
    G, T, CO, TS = base
    log(f'base: {len(G)} games ({int(G.both_fbs.sum())} FBS v FBS), lines for {G.exp_home.notna().mean():.2f}; {len(CO)} coach-seasons; {len(TS)} team-seasons; '
        f'SRS {TS.srs.notna().mean():.2f}, talent {TS.talent.notna().mean():.2f}, recruiting {TS.rec4.notna().mean():.2f}')
    step('teams', cfb_teams.run, reg, log, G, T, CO, TS)
    P = step('player seasons', cfb_players.player_seasons)
    step('players', cfb_players.run, reg, log, G, T, CO, TS, P)
    if P is not None: step('box', cfb_box.run, reg, log, G, T, CO, TS, P)
    step('plays', cfb_plays.run, reg, log, G, T, CO, TS)
if FOCUS not in ('home', 'coachdev', 'bbdiag', 'bbdev', 'bb5'): step('cbb', cbb.run, reg, log, D)

R = reg.df()
if len(R):
    R['p'] = pd.to_numeric(R.p, errors='coerce').clip(lower=1e-300).fillna(1.0); R['q'] = bh(R.p.values)
    R['survives'] = (R.q < .10) & (R.oos_pass == True) & (R.loo_pass != False)
# what goes out: every pattern test, and the named tests that matter (survivors and p < .01, at most 25 per hypothesis), plus each
# hypothesis's best 3 names; details cut to 200 characters
if len(R):
    nm = R[R.kind == 'named'].sort_values('p')
    keep = pd.concat([R[R.kind != 'named'], nm[(nm.p < .01) | nm.survives].groupby('hyp').head(25), nm.groupby('hyp').head(3), nm[nm.label.str.contains('Tom Izzo|Dan Hurley|Kyle Smith|Jamie Dixon')] if FOCUS == 'bbdev' else nm[nm.label.str.contains('Tom Izzo|Dan Hurley|Bill Self|John Calipari|Jon Scheyer|Mike Krzyzewski|Mark Few')] if FOCUS == 'bb5' else nm.head(0)]).drop_duplicates(['hyp', 'label'])
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
