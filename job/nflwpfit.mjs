/* Our own NFL win chance (Oct 11 — Sam approved "NFL win chance, our own"; the college one's twin). Runs as a probe (MODE=probe
   PROBE=nflwpfit); nothing is written to the site.
   Data: nflverse play-by-play (every play with the score, clock, down, distance, field position and the closing spread). Fit on 2021–24,
   scored blind on 2025 against two baselines (margin and time only; the spread only) and against nflverse's own win probability (`wp`)
   on the same plays — the benchmark, not something the site uses. Features from the offense's side, the same as college's: margin,
   margin over the square root of time left, the spread scaled by time left, field position, 3rd/4th down, distance, home, time left. */
import { get0, rows } from "./nfl.mjs";
const sig = z => 1 / (1 + Math.exp(-z));
export const feats = (m, secLeft, sp, ytg, down, dist, home) => { const t = Math.max(0, secLeft) / 3600; return [1, m / 7, (m / 7) / Math.sqrt(t + 0.02), sp / 7 * t, (100 - ytg) / 100, down === 3 || down === 4 ? 1 : 0, Math.min(dist || 10, 20) / 10, home ? 1 : 0, t] };
function fit(X, y, iters = 500, lr = 0.5, l2 = 1e-4) { const k = X[0].length, w = new Array(k).fill(0), n = X.length;
  for (let it = 0; it < iters; it++) { const g = new Array(k).fill(0); for (let i = 0; i < n; i++) { const x = X[i]; let z = 0; for (let j = 0; j < k; j++) z += w[j] * x[j]; const e = sig(z) - y[i]; for (let j = 0; j < k; j++) g[j] += e * x[j] } for (let j = 0; j < k; j++) w[j] -= lr * (g[j] / n + l2 * w[j]) } return w }
const pred = (w, x) => { let z = 0; for (let j = 0; j < w.length; j++) z += w[j] * x[j]; return sig(z) };
function score(P, y) { let b = 0, ll = 0; const B = Array.from({ length: 10 }, () => [0, 0, 0]);
  P.forEach((p, i) => { b += (p - y[i]) ** 2; const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); ll -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q); const k = Math.min(9, Math.floor(p * 10)); B[k][0]++; B[k][1] += p; B[k][2] += y[i] });
  return { brier: +(b / P.length).toFixed(4), logloss: +(ll / P.length).toFixed(4), calib: B.filter(x => x[0]).map(x => `${Math.round(100 * x[1] / x[0])}%→${Math.round(100 * x[2] / x[0])}% (${x[0]})`) } }
export async function run({ log = console.log, train = [2021, 2022, 2023, 2024], test = [2025] }) {
  const want = ["game_id", "season_type", "posteam", "home_team", "away_team", "score_differential", "game_seconds_remaining", "yardline_100", "down", "ydstogo", "spread_line", "result", "wp", "qtr"];
  const load = async y => { const t = await get0(`pbp/play_by_play_${y}.csv.gz`, log); if (!t) return []; const R = []; let i = 0;
    rows(t, want, o => { if (o.season_type !== "REG" || !o.posteam || o.down === "NA" || o.down === "" || o.score_differential === "NA" || o.result === "NA" || o.result === "") return; if (i++ % 2) return;
      const home = o.posteam === o.home_team, res = +o.result; if (!res) return; const won = home ? (res > 0 ? 1 : 0) : (res < 0 ? 1 : 0);
      const sp = o.spread_line === "NA" || o.spread_line === "" ? 0 : +o.spread_line;   /* nflverse spread_line: points the home team is favored by */
      R.push({ m: +o.score_differential, sec: +o.game_seconds_remaining, sp: home ? sp : -sp, ytg: +o.yardline_100, down: +o.down, dist: +o.ydstogo, home, won, wp: o.wp === "NA" ? null : +o.wp, g: o.game_id, q: +o.qtr }) });
    log(`nflwpfit: ${y} · ${R.length} plays`); return R };
  const TR = [], TE = []; for (const y of train) TR.push(...await load(y)); for (const y of test) TE.push(...await load(y));
  if (TR.length < 50000 || TE.length < 10000) return { ok: false, error: `too few plays (train ${TR.length}, test ${TE.length})` };
  const T2 = TR.filter((_, i) => i % 2 === 0), F = r => feats(r.m, r.sec, r.sp, r.ytg, r.down, r.dist, r.home), w = fit(T2.map(F), T2.map(r => r.won));
  const b1x = r => { const t = r.sec / 3600; return [1, r.m / 7, (r.m / 7) / Math.sqrt(t + .02), t] }, w1 = fit(T2.map(b1x), T2.map(r => r.won)), w2 = fit(T2.map(r => [1, r.sp / 7]), T2.map(r => r.won));
  const y = TE.map(r => r.won), ours = score(TE.map(r => pred(w, F(r))), y);
  const C = TE.filter(r => r.wp != null && isFinite(r.wp));
  const byQ = [1, 2, 3, 4].map(q => { const R = TE.filter(r => r.q === q); return R.length ? `Q${q} ${score(R.map(r => pred(w, F(r))), R.map(r => r.won)).brier}` : "" });
  return { ok: true, train: { seasons: train, plays: TR.length, used: T2.length }, test: { seasons: test, plays: TE.length, games: new Set(TE.map(r => r.g)).size }, weights: w.map(x => +x.toFixed(4)), ours,
    marginTimeOnly: score(TE.map(r => pred(w1, b1x(r))), y).brier, spreadOnly: score(TE.map(r => pred(w2, [1, r.sp / 7])), y).brier,
    nflverseSamePlays: C.length ? { plays: C.length, theirs: score(C.map(r => r.wp), C.map(r => r.won)).brier, ours: score(C.map(r => pred(w, F(r))), C.map(r => r.won)).brier } : null, byQ };
}
