# Tier line for Data Busters, part 9 (Nov 23 — rule 15): "Upset coaches have the ball at the end with a chance" (hunt44.py) run on power
# programs and the Group of 5 apart (the underdog's conference that season). Runs hunt44.py unchanged with the split added. STUDY ONLY.
import os

ADD = r'''
    from tiers2 import power as _pw
    X['pw'] = [_pw(c, t, int(s)) for c, t, s in zip(X.conf, X.team, X.season)]
    for _n, _m in (('POWER', X.pw), ('G5', ~X.pw)):
        _d = X[_m & X.dog]; cmp(f'[{_n}] Upset Artist coaches as underdogs', _d, 'up'); cmp(f'[{_n}] Big-Game Hunter coaches vs a top-25 team (as underdogs)', X[_m & X.big & X.dog], 'bg')
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'hunt44.py')).read()
    a = "    X['any'] = X.up | X.bg; cmp('Either tag, as underdogs', dogs.assign(any=dogs.up | dogs.bg), 'any')\n"
    assert src.count(a) == 1, 'hunt44 anchor not found'
    src = src.replace(a, a + ADD)
    g = {'__name__': 'hunt44_tiers9', '__file__': os.path.join(here, 'hunt44.py')}
    exec(compile(src, 'hunt44_tiers9', 'exec'), g)
    g['run'](reg, log, D)
