/* Our own in-game win chance for college basketball (Oct 11 — the football one's twin; Sam: "if it works and you've tested it to death
   then always an add"). Runs as a probe (MODE=probe PROBE=cbbwpfit); nothing is written to the site.

   Data: CBBD play-by-play for a sample of days (every 9th day, Nov–Mar) of the 2024 and 2025 seasons to fit, and of 2026 to score blind;
   each game's closing spread (consensus) and final score. For each play (every 3rd, so one game's plays don't swamp the fit), from the
   home side: score margin, time left, the closing spread scaled by time left, and whether it's on the home floor. A logistic fit, then
   scored on 2026 against two baselines (margin and time only; the spread only) and against CBBD's own win probability on the same plays. */
import { configure, cb, getPack } from "./cbb.mjs";
import { pickLine } from "./cbbgames.mjs";

const sig = z => 1 / (1 + Math.exp(-z));
export const feats = (m, secLeft, sp, home) => { const t = Math.max(0, secLeft) / 2400; return [1, m / 10, (m / 10) / Math.sqrt(t + 0.01), sp / 10 * t, t, home ? 1 : 0] };
function fit(X, y, iters = 500, lr = 0.5, l2 = 1e-4) { const k = X[0].length, w = new Array(k).fill(0), n = X.length;
  for (let it = 0; it < iters; it++) { const g = new Array(k).fill(0); for (let i = 0; i < n; i++) { const x = X[i]; let z = 0; for (let j = 0; j < k; j++) z += w[j] * x[j]; const e = sig(z) - y[i]; for (let j = 0; j < k; j++) g[j] += e * x[j] } for (let j = 0; j < k; j++) w[j] -= lr * (g[j] / n + l2 * w[j]) } return w }
const pred = (w, x) => { let z = 0; for (let j = 0; j < w.length; j++) z += w[j] * x[j]; return sig(z) };
function score(P, y) { let b = 0, ll = 0; const B = Array.from({ length: 10 }, () => [0, 0, 0]);
  P.forEach((p, i) => { b += (p - y[i]) ** 2; const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); ll -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q); const k = Math.min(9, Math.floor(p * 10)); B[k][0]++; B[k][1] += p; B[k][2] += y[i] });
  return { brier: +(b / P.length).toFixed(4), logloss: +(ll / P.length).toFixed(4), calib: B.filter(x => x[0]).map(x => `${Math.round(100 * x[1] / x[0])}%→${Math.round(100 * x[2] / x[0])}% (${x[0]})`) } }
const days = y => { const out = []; for (let d = new Date(Date.UTC(y - 1, 10, 8)); d < new Date(Date.UTC(y, 2, 10)); d.setUTCDate(d.getUTCDate() + 9)) out.push(d.toISOString().slice(0, 10)); return out };

export async function run({ site, token, log = console.log, train = [2024, 2025], test = [2026] }) {
  configure({ site, token: process.env.JOB_TOKEN || token, mode: "cbb" });
  const GH = await getPack("p2000_cbb-ghist"); const LN = {};
  for (const y of [...train, ...test]) { if (GH && GH.lines && GH.lines[y]) { for (const [k, v] of Object.entries(GH.lines[y])) LN[k] = v[0]; continue }
    for (let m = 0; m < 6; m++) { const a = new Date(Date.UTC(y - 1, 10 + m, 1)), b = new Date(Date.UTC(y - 1, 11 + m, 1)); for (const l of await cb("/lines", { season: y, startDateRange: a.toISOString(), endDateRange: b.toISOString() })) { const L = pickLine(l.lines); if (L && L.sp != null) LN[l.gameId] = L.sp } } }
  const rowsOf = async y => { const R = []; for (const dt of days(y)) { const plays = await cb("/plays/date", { date: dt }).catch(() => []); const G = {};
      for (const p of plays) (G[p.gameId] = G[p.gameId] || []).push(p);
      for (const [gid, P] of Object.entries(G)) { const sp = LN[gid]; if (sp == null) continue; P.sort((a, b) => a.period - b.period || b.secondsRemaining - a.secondsRemaining || a.id - b.id);
        const last = P[P.length - 1]; const hs = +last.homeScore, as = +last.awayScore; if (!(hs >= 0) || hs === as || last.period < 2) continue; const won = hs > as ? 1 : 0;
        const neutral = P.some(p => p.neutralSite === true) ? 1 : 0;   /* not on every play; home floor assumed otherwise */
        P.forEach((p, i) => { if (i % 3) return; const per = p.period, sec = per <= 2 ? (2 - per) * 1200 + (+p.secondsRemaining || 0) : 0, ot = per > 2;
          R.push({ m: (+p.homeScore || 0) - (+p.awayScore || 0), sec: ot ? Math.min(300, +p.secondsRemaining || 0) : sec, sp: -sp, home: !neutral, won, cbbd: p.homeWinProbability, gid }) }) }
      log(`cbbwpfit: ${y} ${dt} · ${R.length.toLocaleString()} plays so far`) } return R };
  const TR = [], TE = []; for (const y of train) TR.push(...await rowsOf(y)); for (const y of test) TE.push(...await rowsOf(y));
  if (TR.length < 20000 || TE.length < 8000) return { ok: false, error: `too few plays (train ${TR.length}, test ${TE.length})` };
  const X = TR.map(r => feats(r.m, r.sec, r.sp, r.home)), Y = TR.map(r => r.won), w = fit(X, Y);
  const b1 = TR.map(r => { const t = r.sec / 2400; return [1, r.m / 10, (r.m / 10) / Math.sqrt(t + .01), t] }), w1 = fit(b1, Y), w2 = fit(TR.map(r => [1, r.sp / 10]), Y);
  const yT = TE.map(r => r.won);
  const ours = score(TE.map(r => pred(w, feats(r.m, r.sec, r.sp, r.home))), yT);
  const mt = score(TE.map(r => { const t = r.sec / 2400; return pred(w1, [1, r.m / 10, (r.m / 10) / Math.sqrt(t + .01), t]) }), yT);
  const so = score(TE.map(r => pred(w2, [1, r.sp / 10])), yT);
  const C = TE.filter(r => r.cbbd != null && isFinite(+r.cbbd)); const cbbd = C.length ? { plays: C.length, theirs: score(C.map(r => +r.cbbd), C.map(r => r.won)).brier, oursSamePlays: score(C.map(r => pred(w, feats(r.m, r.sec, r.sp, r.home))), C.map(r => r.won)).brier } : null;
  const byHalf = [[2400, 1200, "1st half"], [1200, 300, "2nd half to 5:00"], [300, -1, "last 5:00 + OT"]].map(([a, b, k]) => { const R = TE.filter(r => r.sec <= a && r.sec > b); return R.length ? `${k} ${score(R.map(r => pred(w, feats(r.m, r.sec, r.sp, r.home))), R.map(r => r.won)).brier}` : "" });
  return { ok: true, train: { seasons: train, plays: TR.length, games: new Set(TR.map(r => r.gid)).size }, test: { seasons: test, plays: TE.length, games: new Set(TE.map(r => r.gid)).size },
    weights: w.map(x => +x.toFixed(4)), ours, marginTimeOnly: { brier: mt.brier, logloss: mt.logloss }, spreadOnly: { brier: so.brier, logloss: so.logloss }, cbbd, byHalf };
}
