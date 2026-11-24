# Tier line for Data Busters, part 10 (Nov 23 — rule 15; the owner 11:25 pm "Rerun the originals"): "An offense that hasn't faced a good defense
# gets exposed by one" — hunt50.py unchanged (week-before defense ranks), with the power / Group of 5 split added. STUDY ONLY.
import os

ADD = r'''
    from tiers2 import power as _pw
    X['pw'] = [_pw(c, t, int(s)) for c, t, s in zip(X.conf, X.team, X.season)]; X['opw'] = [_pw(c, t, int(s)) for c, t, s in zip(X.oconf, X.opp, X.season)]
    _top = X[X.orank <= 25]
    for _n, _m in (('POWER offense', _top.pw), ('POWER vs POWER', _top.pw & _top.opw), ('G5 offense', ~_top.pw), ('G5 vs POWER', ~_top.pw & _top.opw)):
        cmp(f'[{_n}] untested offense vs a top-25 defense, compared with every other offense vs one', _top[_m & _top.untested], _top[_m & ~_top.untested])
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'hunt50.py')).read()
    a = "    cmp('D2 untested offense vs a top-10 defense', X[(X.orank <= 10) & X.untested], X[(X.orank <= 10) & ~X.untested])\n"
    assert src.count(a) == 1, 'hunt50 anchor not found'
    src = src.replace(a, a + ADD)
    g = {'__name__': 'hunt50_tiers10', '__file__': os.path.join(here, 'hunt50.py')}
    exec(compile(src, 'hunt50_tiers10', 'exec'), g)
    g['run'](reg, log, D)
