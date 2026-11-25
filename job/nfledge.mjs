/* EDGE as its own group (Nov 25 — the owner, 12:21 am: "we know what guys are edge so you can just make them edge … however you think for when guys
   come in"; 12:42 am: "the ap split is fine" — the AP All-Pro team's front seven since 2016: edge rushers, interior linemen, linebackers).
   The players file's position is the team roster label (Myles Garrett LB, T.J. Watt OLB, Nick Bosa DE); its edge column is Next Gen Stats'
   and PFF's, which the site doesn't use. So the role comes from the depth charts (nflverse, 2001 on), week by week, read against the team's
   front that week:
   - a 3-man front (the chart lists inside linebackers, or a nose tackle with outside linebackers): OLB / SAM / WILL / SLB / WLB are edge,
     ILB / MIKE are off-ball, DE / DT / NT interior;
   - a 4-man front: DE / LE / RE are edge, every linebacker spot is off-ball, DT / NT interior;
   - EDGE / RUSH / JACK / BUCK are edge in either.
   A defender is EDGE when at least half of his charted weeks (4 or more) are at an edge spot, or — a strong-side backer who rushes, the way
   Denver listed Von Miller — at least a quarter are and he averages 0.45+ sacks a game (our game logs). Only DE, LB and OLB roster labels
   become EDGE; interior linemen and the rest keep theirs.
   Output p2000_nfl-edge: { v:1, at, first, through, rule, p: { gsis: [edgeWeeks, offWeeks, interiorWeeks, sacks, games] }, edge: [gsis…] } */
import { get0, depthIdFix } from "./nfl.mjs";

const ILB = new Set(["ILB", "LILB", "RILB", "MILB"]), DE = new Set(["DE", "LDE", "RDE", "LE", "RE"]), INT = new Set(["DT", "NT", "LDT", "RDT", "DL"]);
const OUT34 = new Set(["OLB", "LOLB", "ROLB", "SLB", "WLB", "SAM", "WILL", "LB"]), LB43 = new Set(["LB", "OLB", "SLB", "WLB", "MLB", "SAM", "WILL", "MIKE", "LOLB", "ROLB", ...ILB]);
const ANY = new Set(["EDGE", "RUSH", "JACK", "BUCK"]);
export const edgeSpot = (p, front) => { p = String(p || "").trim().toUpperCase(); if (!p) return null; if (ANY.has(p)) return 0;
  if (front === 3) return OUT34.has(p) ? 0 : ILB.has(p) || p === "MLB" || p === "MIKE" ? 1 : DE.has(p) || INT.has(p) ? 2 : null;
  return DE.has(p) ? 0 : LB43.has(p) ? 1 : INT.has(p) ? 2 : null };
export const frontOf = spots => { const s = new Set(spots); return [...s].some(p => ILB.has(p)) || (s.has("NT") && [...s].some(p => /^(L|R)?OLB$/.test(p))) ? 3 : 4 };

function csvRows(txt) { const L = txt.split(/\r?\n/); const H = L[0].split(","); const out = [];
  for (let i = 1; i < L.length; i++) { if (!L[i]) continue; const c = []; let cur = "", q = false; for (const ch of L[i]) { if (ch === '"') q = !q; else if (ch === "," && !q) { c.push(cur); cur = "" } else cur += ch } c.push(cur);
    const o = {}; H.forEach((h, j) => o[h] = c[j]); out.push(o) } return out }

export async function buildNflEdge({ getPack, cur, first = 2001, log = console.log }) {
  const P = {}, bump = (g, i) => { const x = P[g] = P[g] || [0, 0, 0, 0, 0]; x[i]++ };
  let through = first;
  for (let s = first; s <= cur; s++) {
    const path = `depth_charts/depth_charts_${s}.csv`; let txt = null;
    try { txt = await get0(path, log); if (txt) txt = await depthIdFix(path, txt, log) } catch (e) { log(`edge: ${s} depth charts: ${e.message}`) }
    if (!txt) continue; const R = csvRows(txt); let n = 0;
    if (R.length && "pos_abb" in R[0]) {   /* 2025 on: dated snapshots; pos_grp names the front ("Base 3-4 D") — one count per player per day */
      const seen = new Set();
      for (const r of R) { const g = r.gsis_id, grp = r.pos_grp || ""; if (!g || !/^Base .* D$/.test(grp)) continue; const k = g + "|" + String(r.dt || "").slice(0, 10); if (seen.has(k)) continue; seen.add(k);
        const sp = edgeSpot(r.pos_abb, /3-4/.test(grp) ? 3 : 4); if (sp != null) { bump(g, sp); n++ } } }
    else {   /* through 2024: weekly charts by team; the front from that week's own slot names */
      const by = {}; for (const r of R) { if (r.formation !== "Defense" || !r.gsis_id || (r.game_type && r.game_type !== "REG")) continue; (by[r.club_code + "|" + r.week] = by[r.club_code + "|" + r.week] || []).push(r) }
      for (const rows of Object.values(by)) { const f = frontOf(rows.map(r => String(r.depth_position || "").trim().toUpperCase()));
        for (const r of rows) { const sp = edgeSpot(r.depth_position, f); if (sp != null) { bump(r.gsis_id, sp); n++ } } } }
    through = s; log(`edge: ${s} · ${n} charted defender-weeks`) }
  /* sacks and games from our game logs (regular season) */
  for (let s = 1999; s <= cur; s++) { let L = null; try { L = await getPack(`p${cur}_nfl-def-${s}`) } catch { } const T = L && (L.def || L); if (!T || !T.p || !T.cols) continue;
    const c = Object.fromEntries(T.cols.map((k, i) => [k, i]));
    for (const [g, rows] of Object.entries(T.p)) { if (!P[g]) continue; for (const r of rows) { if (r[c.type] !== "R") continue; P[g][3] += +r[c.sk] || 0; P[g][4]++ } } }
  const DP = await getPack(`p${cur}_nfl-dplayers`), iP = DP && DP.cols ? DP.cols.indexOf("pos") : -1;
  const roster = g => String((DP && DP.p && DP.p[g] && DP.p[g][iP]) || "").toUpperCase();
  const edge = [];
  for (const [g, [e, o, i, sk, gm]] of Object.entries(P)) { const n = e + o + i; if (n < 4 || !/^(DE|LB|OLB)$/.test(roster(g))) continue;
    if (e / n >= 0.5 || (e / n >= 0.25 && gm >= 16 && sk / gm >= 0.45)) edge.push(g) }
  for (const g of Object.keys(P)) P[g][3] = Math.round(P[g][3] * 10) / 10;
  return { v: 1, at: Date.now(), first, through, rule: "half of 4+ charted weeks at an edge spot, or a quarter with 0.45+ sacks a game; roster DE/LB/OLB only", p: P, edge };
}
