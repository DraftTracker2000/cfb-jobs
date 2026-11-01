# Pattern hunt 3 — reassemble a study run's results from its notices (GitHub check-run annotations, read with `gh api`). STUDY ONLY.
# usage: python3 read_results.py RUN_ID OUT.json
import sys, json, gzip, base64, subprocess, re
rid, out = sys.argv[1], sys.argv[2]
j = json.loads(subprocess.check_output(['gh', 'api', f'repos/DraftTracker2000/cfb-jobs/actions/runs/{rid}/jobs']))['jobs'][0]['id']
A = []
for page in (1, 2):
    A += json.loads(subprocess.check_output(['gh', 'api', f'repos/DraftTracker2000/cfb-jobs/check-runs/{j}/annotations?per_page=100&page={page}']))
P = {}
for a in A:
    m = re.match(r'study results (\d+)/(\d+)', a.get('title') or '')
    if m: P[int(m.group(1))] = (int(m.group(2)), a['message'])
if not P: sys.exit('no result pieces')
n = list(P.values())[0][0]; missing = [i for i in range(1, n + 1) if i not in P]
if missing: sys.exit(f'missing pieces {missing}')
res = json.loads(gzip.decompress(base64.b64decode(''.join(P[i][1] for i in range(1, n + 1)))))
json.dump(res, open(out, 'w'), indent=1); print(n, 'pieces;', res['counts'], 'errors:', res['errors'])
