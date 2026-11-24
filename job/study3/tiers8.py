# Tier line for Data Busters, part 8 (Nov 23 — rule 15): "Some coaches get more out of elite rosters" (bbtalent.py, BD16) — how many of the
# elite rosters (talent 10+) were high-majors that season. Runs bbtalent.py unchanged with one count added. STUDY ONLY; prints to the run log.
import os

ADD = r'''
    _cf = pick(s, 'conference'); _TC = dict(zip(zip(pick(s, 'teamId').astype(str), num(pick(s, 'season', '_year'))), _cf))
    _hm = lambda c, y: c in ('ACC', 'Big Ten', 'Big 12', 'SEC', 'Big East') or (c == 'Pac-12' and y <= 2024)
    _E = T[T.tal >= ELITE]; _h = [_hm(_TC.get((t, y)), int(y)) for t, y in zip(_E.tid, _E.season)]
    log(f'TIERS8 elite rosters (talent {ELITE}+): {len(_E)} team-seasons, {sum(_h)} at high-majors ({100 * sum(_h) / max(len(_E), 1):.1f}%); the rest: ' +
        ', '.join(sorted(set(f"{a} {int(b)}" for a, b, h in zip(_E.team, _E.season, _h) if not h))))
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'bbtalent.py')).read()
    a = "    T['tal'] = T.w / T.mins; T = T[T.season >= 2011]\n"
    assert src.count(a) == 1, 'bbtalent anchor not found'
    src = src.replace(a, a + ADD)
    g = {'__name__': 'bbtalent_tiers8', '__file__': os.path.join(here, 'bbtalent.py')}
    exec(compile(src, 'bbtalent_tiers8', 'exec'), g)
    g['run'](reg, log, D)
