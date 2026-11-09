# Hunt 77 (Nov 8–9, 2026 — the owner, 11:33 pm: "after the audits start more hunts with the api pulled data that remains"). College football.
# STUDY ONLY. Prediction first (rule 12): every tag is known before kickoff, scored against the closing line (break-even 52.4%), all seasons
# with a line (2013 on) and two halves (2013–19, 2020–26).
#   A RETURNING USAGE   (cf_usage, the batch only hunt 7 read, and not against the line): the share of last season's offensive usage that is
#                       back (players who played for the team both seasons) → September covers (weeks 1–4). Most-returning 20% vs least 20%.
#   B MENTOR VS PROTÉGÉ (the coordinator pack + CFBD head coaches, the hunt 74 rule: coordinator years before his first head job): the mentor's
#                       cover, as favorite and as underdog — the coaching-matchup post's one number.
#   C UPSET VICTIMS     a team that lost as a 14+ point favorite → its next game vs the line (hunt 71 #2 did the winners' letdown, not the losers)
#   D BLOWN OUT         a team that lost by 30+ as a favorite or by 30+ more than the line said → its next game
import os, gzip, json, numpy as np, pandas as pd
from scipy import stats
from load import frame, pick, num, norm_name
import cfb_base


def summ(c):
    c = pd.Series(c).dropna(); c = c[c != 0]
    if len(c) < 10: return f'n {len(c)}'
    return f'{c.mean():+.2f} pts vs the line, covers {100 * (c > 0).mean():.1f}% of {len(c)} (p {stats.ttest_1samp(c, 0).pvalue:.2f})'


def halves(d): return f"{summ(d.cover)} [2013–19 {summ(d[d.season <= 2019].cover)} · 2020–26 {summ(d[d.season >= 2020].cover)}]"


def run(reg, log, D):
    G, T, CO, TS = cfb_base.build()
    T = T[T.both_fbs & T.stype.astype(str).str.startswith('reg') & T.exp.notna()].copy()
    T['dt'] = pd.to_datetime(T.date, utc=True, errors='coerce'); T = T.sort_values(['team', 'dt'])
    out = []
    # A returning usage
    try:
        U = frame('cf_usage'); U['season'] = num(pick(U, 'season', '_year')); U['team'] = pick(U, 'team').astype(str); U['pid'] = pick(U, 'id', 'playerId').astype(str); U['u'] = num(pick(U, 'usage.overall'))
        U = U[np.isfinite(U.u)]
        tot = U.groupby(['team', 'season']).u.sum()
        nxt = set(zip(U.team, U.season, U.pid))
        U['back'] = [(t, s + 1, p) in nxt for t, s, p in zip(U.team, U.season, U.pid)]
        R = (U[U.back].groupby(['team', 'season']).u.sum() / tot).rename('ret').reset_index(); R['season'] += 1   # share of LAST season's usage that's back THIS season
        S = T[T.week <= 4].merge(R, on=['team', 'season'], how='left'); S = S.dropna(subset=['ret'])
        q = S.drop_duplicates(['team', 'season']).ret.quantile([.2, .8]).values
        out.append(f"A RETURNING USAGE weeks 1–4 (most back = {q[1]:.2f}+ of last season's usage; least = {q[0]:.2f} or less): MOST {halves(S[S.ret >= q[1]])} ‖ LEAST {halves(S[S.ret <= q[0]])} ‖ middle {summ(S[(S.ret > q[0]) & (S.ret < q[1])].cover)}")
        L5 = T[T.week >= 9].merge(R, on=['team', 'season'], how='left').dropna(subset=['ret'])
        out.append(f"A2 … the same tags in weeks 9+ (does the market catch up?): MOST {summ(L5[L5.ret >= q[1]].cover)} ‖ LEAST {summ(L5[L5.ret <= q[0]].cover)}")
    except Exception as e: out.append(f'A failed: {e!r}')
    # B mentor vs protégé
    try:
        f = [x for x in os.listdir(D) if x.startswith('site_p') and x.endswith('_coord.json.gz')]
        C = json.load(gzip.open(os.path.join(D, f[0]))); C = C.get('col') or C.get('coord', {}).get('col') or {}
        rows = []
        for k, v in C.items():
            y, t = k.split('|', 1)
            for nm in v or []:
                for n in str(nm or '').split(' / '):
                    if n.strip(): rows.append((norm_name(n), t, int(y)))
        K = pd.DataFrame(rows, columns=['key', 'team', 'season'])
        hc = CO.dropna(subset=['coach']).copy(); hc['key'] = hc.coach.map(norm_name); hcs = hc.set_index(['team', 'season']).coach
        K['mkey'] = [norm_name(hcs.get((t, s))) if hcs.get((t, s)) else None for t, s in zip(K.team, K.season)]; first = hc.groupby('key').season.min()
        K = K[K.mkey.notna() & (K.key != K.mkey) & K.key.isin(first.index)]; K = K[K.season < K.key.map(first)]
        M = K.groupby('key').mkey.agg(set).to_dict()
        T['ck'] = T.coach.map(lambda c: norm_name(c) if isinstance(c, str) else None); T['ok'] = T.ocoach.map(lambda c: norm_name(c) if isinstance(c, str) else None)
        T['mentor'] = [bool(o and c and c in M.get(o, set())) for c, o in zip(T.ck, T.ok)]   # this team's coach is the opponent coach's mentor
        m = T[T.mentor]
        out.append(f"B MENTOR VS PROTÉGÉ, the mentor's side: {halves(m)} · straight up {100 * (m.margin > 0).mean():.0f}% of {len(m)} ‖ mentor favored: {summ(m[m.exp > 0].cover)} ‖ mentor the underdog: {summ(m[m.exp < 0].cover)}")
        T['same'] = [bool(c and o and (M.get(c, set()) & M.get(o, set()))) for c, o in zip(T.ck, T.ok)]
        s_ = T[T.same]; out.append(f"B2 SAME TREE (both under the same mentor) — favorites: {summ(s_[s_.exp > 0].cover)} (n games {len(s_) // 2})")
    except Exception as e: out.append(f'B failed: {e!r}')
    # C / D the week after
    g = T.groupby(['team', 'season'])
    T['p_exp'] = g.exp.shift(1); T['p_margin'] = g.margin.shift(1); T['p_cover'] = g.cover.shift(1)
    nx = T.dropna(subset=['p_exp'])
    ups = nx[(nx.p_exp >= 14) & (nx.p_margin < 0)]
    out.append(f"C UPSET VICTIMS (lost as a 14+ favorite) next game: {halves(ups)} ‖ … as a favorite again: {summ(ups[ups.exp > 0].cover)} ‖ everyone else: {summ(nx[~nx.index.isin(ups.index)].cover)}")
    blow = nx[(nx.p_cover <= -30)]
    out.append(f"D MISSED THE LINE BY 30+ last game, next game: {halves(blow)} ‖ BEAT IT BY 30+: {halves(nx[nx.p_cover >= 30])}")
    for o in out: log(o)
    s_ = ' ‖ '.join(out); [print(f'::notice title=hunt77 {i + 1}::{s_[i * 3900:(i + 1) * 3900]}') for i in range((len(s_) + 3899) // 3900)]
