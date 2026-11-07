# Pattern hunt 44 (Nov 7, 2026 — 5:53 pm: "coaches with these tags often have the ball with a chance to win at the end of the game … would
# that be an accurate thing to say in some instances?"). STUDY ONLY. College, prediction first (rule 12): tags from earlier seasons only.
# For underdogs (Upset Artist coaches) and teams facing an Elo top-25 opponent (Big-Game Hunter coaches), how often:
#   close  the game finished within 8 points, or they won
#   ball   they had the ball in the last 2:00 of the 4th quarter (or overtime) trailing by 1–8 or tied — a chance to tie or win
#   either won, or had that chance
# Compared with untagged teams in the same spot at the same line (bins by the spread), so it isn't just "smaller underdogs".
import numpy as np, pandas as pd
from scipy import stats
import cfb_base
from cfb_plays import plays

def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.stype.astype(str).str.startswith('reg') & T.both_fbs & T.exp.notna()].copy()
    sd = (T.margin - T.exp).std(); T['wx'] = T.win - stats.norm.cdf(T.exp / sd); T['dog'] = T.exp < -0.5
    T['orank'] = T.groupby(['season', 'week']).oelo.rank(ascending=False); T['big'] = T.orank <= 25
    P = plays(); P = P[~P.post]
    late = P[((P.period == 4) & (P.clockSec <= 120)) | (P.period >= 5)].copy(); late['d'] = late.offenseScore - late.defenseScore
    ch = late[(late.d >= -8) & (late.d <= 0)][['gameId', 'offense']].drop_duplicates()
    K = lambda v: str(int(float(v))) if str(v) not in ('nan', 'None', '') else ''
    chance = set(zip(ch.gameId.map(K), ch.offense.astype(str)))
    have = set(P.gameId.map(K))
    rows = []
    for s in sorted(T.season.unique()):
        pr = T[(T.season < s) & T.dog & T.coach.notna()].groupby('coach').wx.agg(['mean', 'size']); pr = pr[pr['size'] >= 15]
        UP = set(pr.index[pr['mean'] >= pr['mean'].quantile(.85)]) if len(pr) >= 20 else set()
        pb = T[(T.season < s) & T.big & T.coach.notna()].groupby('coach').cover.agg(['mean', 'size']); pb = pb[pb['size'] >= 10]
        BG = set(pb.index[pb['mean'] >= pb['mean'].quantile(.85)]) if len(pb) >= 20 else set()
        now = T[T.season == s].copy(); now['up'] = now.coach.isin(UP); now['bg'] = now.coach.isin(BG); rows.append(now)
    X = pd.concat(rows); X = X[X.gid.map(K).isin(have)].copy()   # tags use every season; scoring needs the play-by-play (2014 on)
    X['ball'] = [(K(g), str(t)) in chance for g, t in zip(X.gid, X.team)]; X['close'] = (X.margin.abs() <= 8) | (X.win >= 1); X['either'] = X.ball | (X.win >= 1)
    X['bin'] = pd.cut(-X.exp, [0.5, 3.5, 7.5, 14.5, 99])
    OUT = []
    def cmp(lab, pool, flag):
        a = pool[pool[flag]]; b = pool[~pool[flag]]
        if len(a) < 30: OUT.append(f'{lab}: too few ({len(a)})'); return
        line = f'{lab} ({len(a)} games):'
        for col, nm in (('close', 'finished within 8 or won'), ('ball', 'had the ball at the end with a chance'), ('either', 'won or had that chance')):
            # the others reweighted to the tagged teams' mix of lines
            w = a.bin.value_counts(normalize=True); bm = b.groupby('bin')[col].mean(); exp_ = float((w * bm.reindex(w.index)).sum())
            k = int(a[col].sum()); n = len(a); p = stats.binomtest(k, n, min(max(exp_, 1e-6), 1 - 1e-6)).pvalue
            line += f' · {nm}: {k / n:.0%} vs {exp_:.0%} for others at the same lines (p {p:.2g})'
        OUT.append(line)
    dogs = X[X.dog]; cmp('Upset Artist coaches as underdogs', dogs, 'up'); cmp('Big-Game Hunter coaches vs a top-25 team (as underdogs)', X[X.big & X.dog], 'bg')
    X['any'] = X.up | X.bg; cmp('Either tag, as underdogs', dogs.assign(any=dogs.up | dogs.bg), 'any')
    d = X[(X.coach == 'Kalani Sitake') & X.dog]
    if len(d): OUT.append(f'Sitake as an underdog ({len(d)} games with play-by-play): finished within 8 or won {d.close.mean():.0%}, had the ball at the end with a chance {d.ball.mean():.0%}, won or had that chance {d.either.mean():.0%}')
    for o in OUT: log(o)
    s_ = ' ‖ '.join(OUT); [print(f'::notice title=hunt44 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
