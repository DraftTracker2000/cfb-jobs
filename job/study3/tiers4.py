# Tier lines for Data Busters, part 4 (Nov 23 — rule 15): hunt 51's basketball development tests (prediction first: coaches tagged on
# their last 4 seasons, scored on the next) run three ways — everyone, high-majors only (ACC, Big Ten, Big 12, SEC, Big East, Pac-12
# through 2024, by the team's conference that season) and everyone else. Same code as hunt51.py: its prediction step is wrapped so each
# test runs once per group. STUDY ONLY; prints to the run log. Batches: fromarchive,bb_stats,bb_roster,bb_recruits,bb_srs
import os, re

HM = "(lambda c, y: c in ('ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East') or (c == 'Pac-12' and y <= 2024))"
WRAP = '''    def pred(d, col, lab, need, lag=1, mr=15, low=False):
        _TC = dict(zip(zip(A.tid, A.season.astype(int)), A.conf))
        _hm = %s
        _s0 = (d.season - 1).astype(int) if 'after' in d.columns else d.season.astype(int)
        _c = d['conf'] if 'conf' in d.columns else pd.Series([_TC.get((t, s)) for t, s in zip(d.tid, _s0)], index=d.index)
        _h = pd.Series([_hm(c, int(s)) for c, s in zip(_c, _s0)], index=d.index)
        for _nm, _m in (('ALL', _h | ~_h), ('HIGH-MAJOR', _h), ('REST', ~_h)):
            log(f'[{_nm}] {int(_m.sum())} rows')
            _pred(d[_m], col, f'[{_nm}] ' + lab, need, lag=lag, mr=max(5, mr if _nm == 'ALL' else mr * 2 // 3), low=low)
    def _pred(d, col, lab, need, lag=1, mr=15, low=False):
''' % HM


def run(reg, log, D):
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hunt51.py')).read()
    old = '    def pred(d, col, lab, need, lag=1, mr=15, low=False):\n'
    assert src.count(old) == 1, 'hunt51 pred() not found'
    src = src.replace(old, WRAP)
    src = src.replace("if len(pr) < 30: continue", "if len(pr) < (30 if lab.startswith('[ALL]') else 12): continue")   # fewer coaches in one group
    g = {'__name__': 'hunt51_tiers', '__file__': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hunt51.py')}
    exec(compile(src, 'hunt51_tiers', 'exec'), g)
    g['run'](reg, log, D)
