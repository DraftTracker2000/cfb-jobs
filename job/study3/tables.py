# Pattern hunt 3 — the doc's tables, built from a run's reassembled results (read_results.py output), so no number is retyped. STUDY ONLY.
# usage: python3 tables.py RESULTS.json > tables.md
import sys, json, re
r = json.load(open(sys.argv[1])); T = r['tests']
def f(x, d=3):
    if x is None: return '—'
    return f'{x:.{d}g}' if abs(x) < 1e-3 or abs(x) >= 1e4 else f'{x:.{d}f}'.rstrip('0').rstrip('.') if abs(x) < 1 else f'{x:.2f}'
print(f"{r['counts']['tests']} tests in {r['counts']['hyps']} hypotheses; {r['counts']['q10']} with q < .10; {r['counts']['survive']} pass every check.\n")
print('## Pattern tests (every repeat / mechanism test)\n\n| ID | Test | Estimate | q | Out of sample | Survives |\n|---|---|---|---|---|---|')
for t in sorted([t for t in T if t['kind'] != 'named'], key=lambda t: (t['hyp'][0], int(t['hyp'][1:]), t['q'])):
    print(f"| {t['hyp']} | {t['label']} | {f(t['est'])} {t.get('unit') or ''} | {t['q']:.2g} | {'yes' if t['oos_pass'] else 'no'} | {'**yes**' if t['survives'] else 'no'} |")
print('\n## Named survivors (top 8 per hypothesis by q)\n\n| ID | Test | Name | Estimate | Rows | q |\n|---|---|---|---|---|---|')
by = {}
for t in sorted([t for t in T if t['kind'] == 'named' and t['survives']], key=lambda t: t['q']): by.setdefault(t['hyp'], []).append(t)
for h in sorted(by, key=lambda h: (h[0], int(h[1:]))):
    for t in by[h][:8]:
        lab, nm = (t['label'].split(': ', 1) + [''])[:2]
        print(f"| {h} | {lab} | {nm} | {f(t['est'])} {t.get('unit') or ''} | {t['n']} | {t['q']:.2g} |")
    if len(by[h]) > 8: print(f"| {h} | … and {len(by[h]) - 8} more | | | | |")
