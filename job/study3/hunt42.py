# Pattern hunt 42 (Nov 7, 2026): college football backtest of the new formula terms (NEW-FORMULAS.md) against the closing line. STUDY ONLY.
# Tags from earlier seasons only. Per team-game: up (Upset Artist top 15%, as the underdog, +0.8), bgh (Big-Game Hunter top 15%, vs an Elo
# top-25 opponent, +1.2), both (+1.6 total), hpoor (program in the bottom 15% of home edge vs the line, at home, −1.0).
# Home side minus away side = the adjustment. Draft weights; then weights fitted on 2008–2017 and scored on 2018–2026; each term alone.
import numpy as np, pandas as pd
from scipy import stats
import cfb_base

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy()
    sd = (T.margin - T.exp).std(); T['wx'] = T.win - stats.norm.cdf(T.exp / sd); T['dog'] = T.exp < -0.5
    T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False); T['big'] = T.orank <= 25; T['home1'] = T.ishome == 1
    rows = []
    for s in range(2008, int(T.season.max()) + 1):
        pr = T[(T.season < s) & T.dog & T.coach.notna()].groupby('coach').wx.agg(['mean', 'size']); pr = pr[pr['size'] >= 15]
        UP = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]) if len(pr) >= 20 else set()
        pb = T[(T.season < s) & T.big & T.coach.notna()].groupby('coach').cover.agg(['mean', 'size']); pb = pb[pb['size'] >= 10]
        BG = set(pb.index[pb['mean'] >= pb['mean'].quantile(.85)]) if len(pb) >= 20 else set()
        ph = T[(T.season >= s - 2) & (T.season < s)].groupby(['team', 'home1']).cover.agg(['mean', 'size']).unstack()
        try: he = (ph[('mean', True)] - ph[('mean', False)])[(ph[('size', True)] >= 6) & (ph[('size', False)] >= 6)]; HP = set(he.index[he <= he.quantile(.15)])
        except KeyError: HP = set()
        now = T[T.season == s].copy()
        now['up'] = (now.coach.isin(UP) & now.dog).astype(float); now['bgh'] = (now.coach.isin(BG) & now.big).astype(float)
        now['hpoor'] = (now.team.isin(HP) & now.home1).astype(float); rows.append(now)
    X = pd.concat(rows); X['coach_tags'] = np.where((X.up > 0) & (X.bgh > 0), 1.6, X.up * .8 + X.bgh * 1.2); X['draft'] = X.coach_tags - X.hpoor * 1.0
    H = X[X.ishome == 1].set_index('gid'); A = X[X.ishome == 0].set_index('gid'); G2 = H[['season', 'cover']].copy()
    for c in ('draft', 'up', 'bgh', 'hpoor', 'coach_tags'): G2[c] = H[c] - A[c].reindex(H.index)
    G2 = G2.dropna(); OUT = []
    def report(lab, adj, d):
        r, p = stats.pearsonr(adj, d.cover); line = f'{lab}: r with the home cover {r:+.3f} (p {p:.2g}, {len(d)} games)'
        for th in (0.5, 1.0, 1.5):
            m = adj.abs() >= th
            if m.sum() >= 30:
                ok = d.cover[m] != 0; right = (np.sign(adj[m]) == np.sign(d.cover[m])) & ok; line += f' · edge {th}+: {right.sum() / ok.sum():.1%} of {ok.sum()}'
        OUT.append(line); log(line)
    report('College draft formula, all seasons', G2.draft, G2); h = G2[G2.season >= 2018]; report('College draft formula, 2018 on (holdout)', h.draft, h)
    report('  coach tags alone, 2018 on', h.coach_tags, h); report('  poor home program alone, 2018 on', -h.hpoor, h)
    tr = G2[G2.season < 2018]; Xt = np.column_stack([tr.up, tr.bgh, tr.hpoor]); b, *_ = np.linalg.lstsq(Xt, tr.cover, rcond=None)
    OUT.append(f'weights fitted on 2008–2017: up {b[0]:+.2f}, bgh {b[1]:+.2f}, hpoor {b[2]:+.2f}'); log(OUT[-1])
    report('College fitted formula, 2018 on', h.up * b[0] + h.bgh * b[1] + h.hpoor * b[2], h)
    s_ = ' ‖ '.join(OUT); [print(f'::notice title=hunt42 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
