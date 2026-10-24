/* Our own in-game win probability for college football — the fit and its accuracy check (Oct 11, Sam: "who's doing the calculation?"
   → ours, checked before any page shows it). Runs as a probe (MODE=probe PROBE=wpfit); nothing is written to the site.

   Data: every FBS play of the training seasons (CFBD /plays, one call a week, through the site's proxy), each game's final score and
   its closing spread (CFBD /games and /lines). For each play, from the offense's side: score margin, time left, field position, down
   and distance, the closing spread scaled by time left, and home field. A logistic fit on the training seasons, then scored blind on
   the test season: Brier score, log loss, and calibration (what it said vs how often that side won), against two simple baselines
   (margin and time only; the closing spread only). */

const sig = z => 1 / (1 + Math.exp(-z));
function feats(p) {
  const t = p.secLeft / 3600, m = p.margin, sp = p.spread;   // t: share of regulation left; sp: points the offense was favored by
  return [1, m / 7, (m / 7) / Math.sqrt(t + 0.02), sp / 7 * t, (100 - p.ytg) / 100, p.down === 3 || p.down === 4 ? 1 : 0, Math.min(p.dist, 20) / 10, p.home ? 1 : 0, t];
}
function fit(X, y, iters = 400, lr = 0.5, l2 = 1e-4) {
  const k = X[0].length, w = new Array(k).fill(0), n = X.length;
  for (let it = 0; it < iters; it++) {
    const g = new Array(k).fill(0);
    for (let i = 0; i < n; i++) { const x = X[i]; let z = 0; for (let j = 0; j < k; j++) z += w[j] * x[j]; const e = sig(z) - y[i]; for (let j = 0; j < k; j++) g[j] += e * x[j] }
    for (let j = 0; j < k; j++) w[j] -= lr * (g[j] / n + l2 * w[j]);
  }
  return w;
}
const pred = (w, x) => { let z = 0; for (let j = 0; j < w.length; j++) z += w[j] * x[j]; return sig(z) };
function score(P, y) {
  let b = 0, ll = 0; const B = Array.from({ length: 10 }, () => [0, 0, 0]);
  P.forEach((p, i) => { b += (p - y[i]) ** 2; const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); ll -= y[i] * Math.log(q) + (1 - y[i]) * Math.log(1 - q); const k = Math.min(9, Math.floor(p * 10)); B[k][0]++; B[k][1] += p; B[k][2] += y[i] });
  return { brier: +(b / P.length).toFixed(4), logloss: +(ll / P.length).toFixed(4), calib: B.filter(x => x[0]).map(x => `${Math.round(100 * x[1] / x[0])}%→${Math.round(100 * x[2] / x[0])}% (${x[0]})`) };
}

export async function run({ site, token, log = console.log, train = [2022, 2023, 2024], test = [2025], weeks = 15 }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) return r.json(); if (r.status === 429) await new Promise(r => setTimeout(r, 4000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } return null };
  const seasonRows = async y => {
    const rows = []; let calls = 0;
    for (let w = 1; w <= weeks; w++) {
      const [G, L, Pl] = await Promise.all([cf(`/games?year=${y}&week=${w}&classification=fbs`), cf(`/lines?year=${y}&week=${w}`), cf(`/plays?year=${y}&week=${w}&classification=fbs`)]); calls += 3;
      if (!G || !Pl) continue;
      const fin = {}, spr = {};
      for (const g of G) if (g.completed && g.homePoints != null && g.homeClassification === "fbs" && g.awayClassification === "fbs") fin[g.id] = g;
      for (const g of L || []) { const ls = (g.lines || []).filter(l => l.spread != null).map(l => +l.spread).sort((a, b) => a - b); if (ls.length) spr[g.id] = ls[Math.floor(ls.length / 2)] }   // home spread: negative = home favored
      for (const p of Pl) {
        const g = fin[p.gameId]; if (!g || !(p.period >= 1 && p.period <= 4) || p.down == null || p.down < 1 || p.down > 4 || p.yardsToGoal == null || !p.clock) continue;
        if (/kickoff|timeout|end of|penalty|extra point|two point|2pt|uncategorized/i.test(p.playType || "")) continue;
        const home = p.offense === g.homeTeam; if (!home && p.offense !== g.awayTeam) continue;
        const sec = (4 - p.period) * 900 + (+p.clock.minutes || 0) * 60 + (+p.clock.seconds || 0);
        const hs = spr[g.id]; const spread = hs == null ? 0 : home ? -hs : hs;
        const won = home ? (g.homePoints > g.awayPoints ? 1 : 0) : (g.awayPoints > g.homePoints ? 1 : 0); if (g.homePoints === g.awayPoints) continue;
        rows.push({ margin: (p.offenseScore || 0) - (p.defenseScore || 0), secLeft: sec, ytg: p.yardsToGoal, down: p.down, dist: p.distance || 10, home: home && !g.neutralSite, spread, won, gid: g.id, hasLine: hs != null });
      }
      log(`wpfit: ${y} week ${w} · ${rows.length.toLocaleString()} plays so far`);
    }
    return { rows, calls };
  };
  let calls = 0; const TR = [], TE = [];
  for (const y of train) { const s = await seasonRows(y); calls += s.calls; TR.push(...s.rows) }
  for (const y of test) { const s = await seasonRows(y); calls += s.calls; TE.push(...s.rows) }
  if (TR.length < 50000 || TE.length < 20000) return { ok: false, error: `too few plays (train ${TR.length}, test ${TE.length})`, calls };
  /* thin the training plays (every 3rd) to keep the fit quick; the test season is scored in full */
  const T2 = TR.filter((_, i) => i % 3 === 0), X = T2.map(feats), Y = T2.map(r => r.won);
  const w = fit(X, Y);
  const base1X = T2.map(r => [1, r.margin / 7, (r.margin / 7) / Math.sqrt(r.secLeft / 3600 + 0.02), r.secLeft / 3600]), w1 = fit(base1X, Y);
  const base2X = T2.map(r => [1, r.spread / 7]), w2 = fit(base2X, Y);
  const yT = TE.map(r => r.won);
  const ours = score(TE.map(r => pred(w, feats(r))), yT);
  const b1 = score(TE.map(r => pred(w1, [1, r.margin / 7, (r.margin / 7) / Math.sqrt(r.secLeft / 3600 + 0.02), r.secLeft / 3600])), yT);
  const b2 = score(TE.map(r => pred(w2, [1, r.spread / 7])), yT);
  /* by quarter: how sharp it gets as the game goes on */
  const byQ = [1, 2, 3, 4].map(q => { const R = TE.filter(r => Math.min(4, 4 - Math.floor(r.secLeft / 900)) === q); return R.length ? `Q${q} ${score(R.map(r => pred(w, feats(r))), R.map(r => r.won)).brier}` : "" });
  return { ok: true, calls, train: { seasons: train, plays: TR.length, used: T2.length }, test: { seasons: test, plays: TE.length, games: new Set(TE.map(r => r.gid)).size },
    weights: w.map(x => +x.toFixed(4)), ours, marginTimeOnly: { brier: b1.brier, logloss: b1.logloss }, spreadOnly: { brier: b2.brier, logloss: b2.logloss }, byQuarter: byQ };
}
