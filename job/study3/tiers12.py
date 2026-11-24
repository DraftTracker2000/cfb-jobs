# Tier lines for Data Busters, part 12 (Nov 23 — rule 15): pattern hunt 3's player tests run unchanged (cfb_players.py), each transfer test
# (P01–P04: does a mover keep his game) also run on moves INTO a power program and into the Group of 5, and each college → NFL test (N03–N09)
# on power-program and Group of 5 picks apart (the 'g5' column the script already builds). STUDY ONLY; prints to the run log.
import os

CARRY = r'''        def carry(hyp, label, j, c, unit):
            _out = _c0(hyp, label, j, c, unit)
            try:
                from tiers2 import power as _pw
                _cs = TS.reset_index().set_index(['team', 'season']).conf if 'conf' in TS.reset_index().columns else {}
                _p = [_pw(_cs.get((tn, int(s) + 1), ''), tn, int(s) + 1) if isinstance(tn, str) else False for tn, s in zip(j.team_n, j.season)]
                _j = j.assign(_p=_p)
                _c0(hyp, '[INTO POWER] ' + label, _j[_j._p].drop(columns='_p'), c, unit); _c0(hyp, '[INTO G5] ' + label, _j[~_j._p].drop(columns='_p'), c, unit)
            except Exception as _e: log(f'{hyp} tier split failed: {_e!r}')
            return _out
        def _c0(hyp, label, j, c, unit):
'''
NT = r'''        def nt(hyp, label, x, col, unit):
            _nt0(hyp, label, x, col, unit)
            if 'g5' in x.columns: _nt0(hyp, '[POWER] ' + label, x[x.g5 == 0], col, unit); _nt0(hyp, '[G5] ' + label, x[x.g5 == 1], col, unit)
        def _nt0(hyp, label, x, col, unit):
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'cfb_players.py')).read()
    a, b = "        def carry(hyp, label, j, c, unit):\n", "        def nt(hyp, label, x, col, unit):\n"
    assert src.count(a) == 1 and src.count(b) == 1, 'cfb_players anchors not found'
    src = src.replace(a, CARRY).replace(b, NT)
    g = {'__name__': 'cfb_players_tiers12', '__file__': os.path.join(here, 'cfb_players.py')}
    exec(compile(src, 'cfb_players_tiers12', 'exec'), g)
    import cfb_base
    G, T, CO, TS = cfb_base.build()
    P = g['player_seasons']()
    g['run'](reg, log, G, T, CO, TS, P)
