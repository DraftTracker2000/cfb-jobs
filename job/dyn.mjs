/* Dynasty inputs for the fantasy pages (Oct 20 — Sam: "find the best route" for pricing stars in dynasty trades).
   One row per QB/RB/WR/TE who played in the last 18 league weeks: the inputs the page's dynasty model (FL_DYN2 in the board) needs.
   The model itself stays in the page (like FL_DYN); this only counts what each player did, from our own game logs (nflverse, PPR).

   Windows: the last 18 regular-season league weeks with games played = "this season" (W0) — at the end of a season it is exactly that
   season — then the 18 before it (W1), and so on back to W4. So mid-season the newest games count right away, the same way the
   model's seasons count when it was fitted (scratchpad dyn2/, 2009-24 seasons, PPR points per team game, missed games as zero).

   Inputs, in the model's order (FEATS), all from W0 unless noted:
     ppg (PPR a game played), gsh (share of his team's games he played), m1 (ppg in W1, or ppg if he didn't play then), m1na, age, a26, a29,
     rook (first or second season), lpick (log draft pick, 300 undrafted), ppg×gsh, ppg×years past 27, ppg×rook,
     b2 (best two of ppg and W1-W3 with 35%+ of games), b2gap, dip_y (gap × years under 28), dip_o (gap × years over 28),
     g20 (share of games with 20+), h2d (second half vs first half of W0), nel / nt24 (elite / top-24 finishes in W1-W4), lpk_y,
     miss (games missed in W1-W3, a window he didn't play counts as all missed), td_sh (share of his points from touchdowns),
     comp_next (targets a game, in W0, of the teammates on his team now), comp_chg (that minus his W0 team's), moved (team now isn't
     his W0 team), comp_pg (comp_next × ppg / 10). */
export const DYN_FEATS = ["ppg","gsh","m1","m1na","age","a26","a29","rook","lpick","pg_g","pg_a27","pg_rk","b2","b2gap","dip_y","dip_o",
  "g20","h2d","nel","nt24","lpk_y","miss","td_sh","comp_next","comp_chg","moved","comp_pg"];
const ELITE = { QB: 6, RB: 8, WR: 10, TE: 5 }, TOP24 = { QB: 12, RB: 24, WR: 30, TE: 12 };
const FILL = { td_sh: 0.3, comp_next: 26, comp_chg: -5 };   // medians from the fit (scratchpad dyn2/dynmodel.json "fill")
const LC = { week: 0, type: 1, team: 3, rtd: 13, tgt: 14, td: 17, fp: 22 };

/** G: games pack ({cols, g}); PLp: players pack rows by gsis; logsOf(season) -> logs pack or null; asOf: optional [season, week] to stop at (tests) */
export async function dynFeatures({ G, PLp, logsOf, asOf = null, log = () => { }, fill = FILL }) {
  const gc = {}; G.cols.forEach((c, i) => gc[c] = i);
  // league week slots with regular-season games played, oldest first
  const done = G.g.filter(g => g[gc.type] === "REG" && g[gc.homeScore] != null && (!asOf || g[gc.season] < asOf[0] || (g[gc.season] === asOf[0] && g[gc.week] <= asOf[1])));
  const slotKey = (s, w) => s * 100 + w, slots = [...new Set(done.map(g => slotKey(g[gc.season], g[gc.week])))].sort((a, b) => a - b);
  if (slots.length < 18) return null;
  const win = k => new Set(slots.slice(Math.max(0, slots.length - 18 * (k + 1)), slots.length - 18 * k));   // W0 = newest 18
  const W = [0, 1, 2, 3, 4].map(win);
  const wOf = key => { for (let k = 0; k < 5; k++) if (W[k].has(key)) return k; return -1 };
  // each team's games in each window
  const tg = {}; for (const g of done) { const k = wOf(slotKey(g[gc.season], g[gc.week])); if (k < 0) continue; for (const t of [g[gc.home], g[gc.away]]) { const a = tg[t] = tg[t] || [0, 0, 0, 0, 0]; a[k]++ } }
  const seasons = [...new Set(slots.slice(-90).map(x => Math.floor(x / 100)))];
  // every player's regular-season games by window
  const P = {};   // gsis -> [W0..W4] arrays of {key, team, fp, tgt, tdpts}
  for (const s of seasons) {
    const L = await logsOf(s); if (!L || !L.p) { log(`dyn: no logs for ${s}`); continue }
    for (const id in L.p) for (const r of L.p[id]) {
      if (r[LC.type] !== "R") continue; const key = slotKey(s, r[LC.week]), k = wOf(key); if (k < 0) continue;
      const A = P[id] = P[id] || [[], [], [], [], []];
      A[k].push({ key, team: r[LC.team], fp: r[LC.fp] || 0, tgt: r[LC.tgt] || 0, tdp: 6 * ((r[LC.rtd] || 0) + (r[LC.td] || 0)) });
    }
  }
  const pos = id => { const x = PLp[id]; if (!x) return null; const p = String(x[1] || "").toUpperCase(); return p === "FB" || p === "HB" ? "RB" : ["QB", "RB", "WR", "TE"].includes(p) ? p : null };
  const mode = L => { const c = {}; for (const g of L) c[g.team] = (c[g.team] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null };
  const sum = (L, f) => L.reduce((a, g) => a + f(g), 0);
  // per window: ppg, games share, team; finish ranks (ppg among 8+ games at the position)
  const S = {};
  for (const id in P) { const p = pos(id); if (!p) continue; S[id] = P[id].map(L => { if (!L.length) return null; const t = mode(L);
    return { gp: L.length, ppg: sum(L, g => g.fp) / L.length, team: t, tgt: sum(L, g => g.tgt), pts: sum(L, g => g.fp), tdp: sum(L, g => g.tdp) } }) }
  for (const id in S) for (let k = 0; k < 5; k++) { const x = S[id][k]; if (x) x.gsh = Math.min(1, x.gp / Math.max(1, ((tg[x.team] || [])[k] || 17))) }
  for (let k = 1; k < 5; k++) { const by = {}; for (const id in S) { const x = S[id][k]; if (x && x.gp >= 8) (by[pos(id)] = by[pos(id)] || []).push([id, x.ppg]) }
    for (const p in by) by[p].sort((a, b) => b[1] - a[1]).forEach(([id], i) => S[id][k].fin = i + 1) }
  // teammates' targets a game in W0, by team now (each team's last 3 game weeks) and by his W0 team (its first 3 game weeks in W0)
  const w0 = [...W[0]].sort((a, b) => a - b), tpg0 = {}, onTeam = {};
  for (const id in P) { const L = P[id][0]; if (!L.length) continue; tpg0[id] = sum(L, g => g.tgt) / L.length; for (const g of L) (onTeam[g.team] = onTeam[g.team] || []).push([g.key, id]) }
  const roster = (t, first) => { const L = (onTeam[t] || []); const keys = [...new Set(L.map(x => x[0]))].sort((a, b) => a - b); const pick = new Set(first ? keys.slice(0, 3) : keys.slice(-3)); return new Set(L.filter(x => pick.has(x[0])).map(x => x[1])) };
  const compOf = (t, first, me) => { let c = 0; for (const id of roster(t, first)) if (id !== me) c += tpg0[id] || 0; return c };
  const lastSeason = Math.floor(w0[w0.length - 1] / 100), fromPrev = w0.filter(x => Math.floor(x / 100) < lastSeason).length;
  const out = {};
  for (const id in S) {
    const p = pos(id), X = S[id], x0 = X[0]; if (!x0 || x0.gp < 1) continue;
    const pl = PLp[id], born = pl[3] ? Date.parse(pl[3]) : NaN, by = isNaN(born) ? null : new Date(born).getUTCFullYear() + (new Date(born) - Date.UTC(new Date(born).getUTCFullYear(), 0, 1)) / 3.15576e10;
    const age = by == null ? ({ QB: 28, RB: 25, WR: 26, TE: 27 })[p] : lastSeason + .67 - by - fromPrev / 18;
    const rookie = pl[10] != null ? +pl[10] : null, exp = rookie == null ? 3 : lastSeason - rookie, rook = exp <= 1 ? 1 : 0;
    const lpick = Math.log(Math.min(300, Math.max(1, pl[8] != null && pl[8] !== "" ? +pl[8] : 300)));
    const ppg = x0.ppg, gsh = x0.gsh, m1v = X[1] ? X[1].ppg : null, m1 = m1v ?? ppg, m1na = m1v == null ? 1 : 0;
    const prior = [1, 2, 3].map(k => X[k] && X[k].gsh >= .35 ? X[k].ppg : null).filter(v => v != null);
    const top = [ppg, ...prior].sort((a, b) => b - a), b2 = top.length > 1 ? (top[0] + top[1]) / 2 : top[0], b2gap = Math.max(0, b2 - ppg);
    const L = P[id][0], half = w0[8], h1 = L.filter(g => g.key <= half), h2 = L.filter(g => g.key > half);
    const h2d = h1.length >= 3 && h2.length >= 3 ? (sum(h2, g => g.fp) / h2.length - sum(h1, g => g.fp) / h1.length) / Math.max(1, ppg) : 0;
    const g20 = L.filter(g => g.fp >= 20).length / L.length;
    const nel = [1, 2, 3, 4].filter(k => X[k] && X[k].fin != null && X[k].fin <= ELITE[p]).length, nt24 = [1, 2, 3, 4].filter(k => X[k] && X[k].fin != null && X[k].fin <= TOP24[p]).length;
    const miss = [1, 2, 3].reduce((a, k) => a + 1 - (X[k] ? X[k].gsh : 0), 0);
    const td_sh = x0.pts > 0 ? x0.tdp / Math.max(1, x0.pts) : fill.td_sh;
    const now = [...L].sort((a, b) => b.key - a.key)[0].team, moved = now !== x0.team ? 1 : 0;
    const comp_next = compOf(now, false, id), comp_now = compOf(x0.team, true, id), comp_chg = comp_next - comp_now;
    const f = { ppg, gsh, m1, m1na, age, a26: Math.max(0, age - 26), a29: Math.max(0, age - 29), rook, lpick, pg_g: ppg * gsh, pg_a27: ppg * Math.max(0, age - 27), pg_rk: ppg * rook,
      b2, b2gap, dip_y: b2gap * Math.max(0, 28 - age), dip_o: b2gap * Math.max(0, age - 28), g20, h2d, nel, nt24, lpk_y: age < 25 ? lpick : 0, miss, td_sh,
      comp_next, comp_chg, moved, comp_pg: comp_next * ppg / 10 };
    out[id] = [p, x0.gp, ...DYN_FEATS.map(c => Math.round(f[c] * 1000) / 1000)];
  }
  log(`dyn: ${Object.keys(out).length} players, window ${w0[0]}-${w0[w0.length - 1]}`);
  return { cols: ["pos", "gp", ...DYN_FEATS], window: [w0[0], w0[w0.length - 1]], p: out, at: Date.now() };
}
