/* NFL CoachScore worked out in the data job, not in the page (Nov 5, 2026 — the owner, 5:24 pm: "yes a" to "do the scoring on our server, so
   browsers only get the results, never the weights"; #61; his Oct 31 rule "we don't want to tell our weights anywhere").
   The arithmetic moved here unchanged from the page's nflCoachScores (public/lab/index.html): win % shrunk with 8 wins in 16 games, wins
   over the closing lines a season, playoff wins a season and titles, each scaled across coaches with 32+ regular-season games, then
   combined and placed 1–99 by rank; coaches with fewer games get an early score pulled toward the typical rated coach.
   Out: { coach name: [score, rank (0 = early score), early 0/1, wins over the closing lines a season] } — results only, kept on the games pack as `co`. */
export function nflCoachScoresOf(G) {
  const ix = {}; G.cols.forEach((c, i) => ix[c] = i); const g0 = r => k => r[ix[k]];
  const C = {}, ncdf = x => .5 * (1 + Math.tanh(.7978845608 * (x + .044715 * x * x * x)));
  for (const r of G.g) { const g = g0(r); if (g("homeScore") == null) continue;
    for (const side of ["home", "away"]) { const c = g(side + "Coach"); if (!c) continue; const home = side === "home", pf = home ? g("homeScore") : g("awayScore"), pa = home ? g("awayScore") : g("homeScore"), won = pf > pa, tie = pf === pa;
      const o = C[c] = C[c] || { c, n: 0, w: 0, t: 0, exp: 0, pw: 0, sb: 0, con: 0, S: new Set() };
      if (g("type") === "REG") { o.n++; if (won) o.w++; else if (tie) o.t++; o.S.add(g("season")); const sp = g("spread") == null ? null : (home ? g("spread") : -g("spread")); o.exp += sp == null ? .5 : ncdf(sp / 13.5) }
      else if (won) { o.pw++; if (g("type") === "SB") o.sb++; if (g("type") === "CON") o.con++ } } }
  const L = Object.values(C); for (const o of L) { o.seas = o.S.size; o.a = (o.w + o.t / 2 + 8) / (o.n + 16); o.b = o.seas ? (o.w + o.t / 2 - o.exp) / o.seas : 0; o.cp = o.seas ? o.pw / o.seas : 0; o.d = 3 * o.sb + o.con }
  const Q = L.filter(o => o.n >= 32), z = k => { const v = Q.map(o => o[k]), m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; for (const o of L) o["z" + k] = (o[k] - m) / sd };
  if (!Q.length) return {};
  ["a", "b", "cp", "d"].forEach(z); for (const o of L) o.raw = .35 * o.za + .25 * o.zb + .15 * o.zcp + .25 * o.zd;
  const R = [...Q].sort((x, y) => y.raw - x.raw); R.forEach((o, i) => { o.score = Math.max(1, Math.round(99 - 98 * i / Math.max(1, R.length - 1))); o.rank = i + 1 });
  if (R.length > 1) { const med = R[Math.floor(R.length / 2)].raw; for (const o of L) { if (o.n >= 32 || !o.n) continue; const x = med + o.n / (o.n + 16) * (o.raw - med), i = R.filter(q => q.raw > x).length;
    o.score = Math.max(1, Math.min(99, Math.round(99 - 98 * i / Math.max(1, R.length - 1)))); o.early = true } }
  const out = {}; for (const o of L) if (o.score != null || o.n) out[o.c] = [o.score ?? null, o.rank || 0, o.early ? 1 : 0, Math.round(o.b * 100) / 100]; return out;
}
