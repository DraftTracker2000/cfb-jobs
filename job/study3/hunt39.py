# Pattern hunt 39 (Nov 7, 2026 — 3:16 pm: "literally all of the player ones … could help game by game projections"). STUDY ONLY.
# Does a player's history against a team improve his game projection? Baseline: his season average + what that defense allows (both
# leagues, every stat, per 36, full-strength opponents as in hunt 38). Add: w x (his average beyond the baseline in EARLIER meetings with
# that team), w = n / (n + K). K chosen on 2015-2020, error measured on 2021-2026. Reports the error drop (RMSE) on games with a history.
import sys, os, numpy as np, pandas as pd
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hunt38.py')).read().split("    F = P[P.full]")[0].replace("for lg in ('nba', 'mbb'):", "def prep(lg):").replace("D = sys.argv[1]; OUT = []", "D = sys.argv[1]") + "    return P\n")
for lg in ('nba', 'mbb'):
    P = prep(lg); F = P[P.full].sort_values(['athlete_id', 'opponent_team_id', 'game_date']).copy()
    print(f'== {lg.upper()}', flush=True)
    for c, (lab, good) in STATS.items():
        x = 'x_' + c; key = [F.athlete_id, F.opponent_team_id]; v0 = F[x].fillna(0); n0 = F[x].notna().astype(int)
        cs = v0.groupby(key).cumsum() - v0; cn = n0.groupby(key).cumsum() - n0
        d = pd.DataFrame({'x': F[x], 'pm': np.where(cn > 0, cs / cn.replace(0, 1), np.nan), 'n': cn, 'season': F.season}).dropna()
        tr, te = d[d.season <= 2020], d[d.season >= 2021]
        Ks = [1, 2, 4, 8, 16, 32, 64]; err = {K: np.sqrt(((tr.x - tr.n / (tr.n + K) * tr.pm) ** 2).mean()) for K in Ks}; K = min(err, key=err.get)
        b = np.sqrt((te.x ** 2).mean()); e = np.sqrt(((te.x - te.n / (te.n + K) * te.pm) ** 2).mean())
        m3 = te[te.n >= 3]; b3 = np.sqrt((m3.x ** 2).mean()); e3 = np.sqrt(((m3.x - m3.n / (m3.n + K) * m3.pm) ** 2).mean())
        print(f'{lab}: K {K} · error on {len(te)} later games {b:.3f} → {e:.3f} ({100 * (b - e) / b:+.2f}%) · with 3+ earlier meetings ({len(m3)}) {100 * (b3 - e3) / b3:+.2f}%', flush=True)
