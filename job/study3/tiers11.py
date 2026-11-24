# Tier lines for Data Busters, part 11 (Nov 23 — rule 15; the owner 11:25 pm "Rerun the originals"): hunt36.py unchanged (the player splits,
# prediction first: top/bottom 15% from earlier seasons → the next), each test also run on power-program players and Group of 5 players apart
# (the player's team's conference that season). Covers cfbroles 3 (clutch / big-game), 6 (home receivers), 7 (third-down passers). STUDY ONLY.
import os

WRAP = r'''    def split_test(rows, flag, val, lab, min_in):
        if '_pw' not in rows.columns:
            from tiers2 import power as _pw
            from load import frame as _fr, pick as _pk, num as _nm
            _G = _fr('cf_games'); _cf = {}
            for _t, _c, _s in list(zip(_pk(_G, 'homeTeam'), _pk(_G, 'homeConference'), _nm(_pk(_G, 'season')))) + list(zip(_pk(_G, 'awayTeam'), _pk(_G, 'awayConference'), _nm(_pk(_G, 'season')))):
                if isinstance(_c, str) and _s == _s: _cf.setdefault((str(_t), int(_s)), _c)
            rows = rows.copy(); rows['_pw'] = [_pw(_cf.get((str(t), int(s)), ''), str(t), int(s)) for t, s in zip(rows.team, rows.season)]
        _st0(rows, flag, val, lab, min_in); _st0(rows[rows._pw], flag, val, '[POWER] ' + lab, min_in); _st0(rows[~rows._pw], flag, val, '[G5] ' + lab, min_in)
    def _st0(rows, flag, val, lab, min_in):
'''


def run(reg, log, D):
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'hunt36.py')).read()
    a = "    def split_test(rows, flag, val, lab, min_in):\n"
    assert src.count(a) == 1, 'hunt36 anchor not found'
    src = src.replace(a, WRAP)
    src = src.replace("if len(pr) < 20: continue", "if len(pr) < (12 if lab.startswith(\"[\") else 20): continue")
    g = {'__name__': 'hunt36_tiers11', '__file__': os.path.join(here, 'hunt36.py')}
    exec(compile(src, 'hunt36_tiers11', 'exec'), g)
    g['run'](reg, log, D)
