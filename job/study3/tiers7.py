# Tier lines for Data Busters, part 7 (Nov 23 — rule 15), from the college box scores (cf_box) and lines. STUDY ONLY; prints aggregates.
#   qbstarts 2  a first-year QB's first road start and first home start against the line (starter = most passes in the game; first season =
#               his first season with a pass in the box scores, 2005 on), by his team's tier and the matchup
#   cfbcarry 4  defenses that hold quarterbacks under their own yards per attempt (pattern hunt 3's K01), by the defense's tier: year to year
#               and prediction first (the top 15% of defenses one season → the next)
import numpy as np, pandas as pd
import cfb_base
from cfb_box import box
from lib3 import yoy
from tiers2 import power, note


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    B = box(); lines = [f'box: {len(B)} player-games, {B.game_id.nunique()} games, {B.season.min()}-{B.season.max()}']
    B['pw'] = [power(c, t, int(s)) for c, t, s in zip(B.conf, B.team, B.season)]
    B['opw'] = [power(c, t, int(s)) if isinstance(c, str) else False for c, t, s in zip(B.conf_o, B.team_o, B.season)]
    # ---- qbstarts 2 ----
    q = B[(B.att >= 1) & B.conf.notna() & B.conf_o.notna()].copy()
    first = q.groupby('pid').season.min(); q['fy'] = q.season == q.pid.map(first)
    st = q.sort_values('att', ascending=False).drop_duplicates(['game_id', 'team'])   # the starter: most passes
    st = st[st.fy & (st.season >= 2005) & ~st.post]
    TT = T[T.exp.notna() & T.stype.astype(str).str.startswith('reg')][['gid', 'team', 'cover', 'margin', 'date']].copy(); TT['gid'] = TT.gid.astype(str)
    st['gid'] = st.game_id.astype(str); st = st.merge(TT, on=['gid', 'team'])
    st = st.sort_values(['pid', 'date'])
    for ha, lab in (('away', 'first road start'), ('home', 'first home start')):
        x = st[st.ha == ha].drop_duplicates('pid')
        for nm, m in (('all', x.pw | ~x.pw), ('power', x.pw), ('P vs P', x.pw & x.opw), ('G vs G', ~x.pw & ~x.opw), ('P vs G', x.pw & ~x.opw), ('G vs P', ~x.pw & x.opw)):
            z = x[m]; c = z.cover[z.cover != 0]
            lines.append(f'{lab} {nm}: {len(z)} games, won {100 * (z.margin > 0).mean():.1f}%, covered {100 * (c > 0).mean():.1f}% ({z.cover.mean():+.2f})')
    # ---- cfbcarry 4 ----
    qq = B[(B.att >= 10) & ~B.post & B.conf.notna() & B.conf_o.notna()].copy()
    k = ['pid', 'season', 'team']; sn = qq.groupby(k).pyds.transform('sum'); n = qq.groupby(k).pyds.transform('count'); sd = qq.groupby(k).att.transform('sum')
    qq['over'] = (qq.pyds - qq.att * (sn - qq.pyds) / (sd - qq.att)).where((n >= 4) & (sd - qq.att > 0))
    g = qq.dropna(subset=['over']).groupby(['game_id', 'season', 'team_o', 'opw'])[['over', 'att']].sum().reset_index(); g['v'] = g.over / g.att
    S = g.groupby(['season', 'team_o']).agg(v=('v', 'mean'), pw=('opw', 'first')).reset_index().rename(columns={'team_o': 'key'})
    nx = S[['key', 'season', 'v']].copy(); nx['season'] -= 1; J = S.merge(nx, on=['key', 'season'], suffixes=('', '_n'))
    for nm, f in (('all', lambda d: d), ('power', lambda d: d[d.pw]), ('G5', lambda d: d[~d.pw])):
        d = f(J); o = yoy(f(S)[['key', 'season', 'v']], 'key', 'v')
        lo = d.v <= d.groupby('season').v.transform(lambda x: x.quantile(.15)); hi = d.v >= d.groupby('season').v.transform(lambda x: x.quantile(.85))
        lines.append(f'QB-stopping defenses {nm}: r {o["r"]:.2f} ({o["k"]} pairs) · stingiest 15% {d[lo].v.mean():+.2f} → {d[lo].v_n.mean():+.2f} yards an attempt next season, {(d[lo].v_n < 0).sum()} of {lo.sum()} under again · '
                     f'leakiest 15% {d[hi].v.mean():+.2f} → {d[hi].v_n.mean():+.2f}')
    co = CO.set_index(['team', 'season']).coach
    S['coach'] = [co.get((t, s)) for t, s in zip(S.key, S.season)]
    P = S[S.pw].groupby('coach').agg(n=('v', 'size'), v=('v', 'mean'), under=('v', lambda s: (s < 0).sum())); P = P[P.n >= 6].sort_values('v')
    lines.append('power-program coaches (6+ seasons), stingiest: ' + ' | '.join(f'{c} {r.v:+.2f} ({int(r.under)} of {int(r.n)} under)' for c, r in P.head(8).iterrows()))
    for l in lines: log(l)
    note('tiers7', lines)
