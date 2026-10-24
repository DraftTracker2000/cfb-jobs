/* What happens after an injury (Oct 24 — Sam: "you can work out from all this injury data specific drops in performance risks based on their
   specific injury data. like sometimes a player doesnt fall off when they get a particular injury").

   Every NFL stint since 2016 where a QB, RB, WR or TE missed at least one game hurt (the injury history pack), against his own games:
     before — his last 4 regular-season games played before the stint (this season, or the end of last season)
     after  — his first 4 games back (rest of the season, or next season if it ended his year)
   PPR points a game and snap share, before and after. Grouped by position and injury (hamstring, high ankle, ACL …), the typical player's
   "after" as a share of his "before" (the median), how often he fell off (under 80%), and how many came back that season.
   Only stints with 2+ games on each side count, so one bad game doesn't decide it.
   Output: pack "pYYYY_injimpact" = { injimpact: { t, v: 1, g: { "RB|hamstring": [n, med, fell, snapMed, backSame] }, p: { gsis: [[season, w0,
   key, before, after, snapBefore, snapAfter, nAfter], …] } } } */

import { gzipSync, gunzipSync } from "node:zlib";
import { csvRows } from "./lib/files.mjs";

export function injKey(name) {
  const s = String(name || "").toLowerCase();
  if (!s || /not listed|illness|covid|personal|rest|suspen/.test(s)) return "";
  if (/\bacl\b|cruciate/.test(s)) return "acl";
  if (/achilles/.test(s)) return "achilles";
  if (/ankle/.test(s) && /high/.test(s)) return "high ankle";
  if (/\bmcl\b/.test(s)) return "mcl";
  if (/concuss|head/.test(s)) return "concussion";
  for (const k of ["hamstring", "ankle", "knee", "foot", "toe", "groin", "hip", "calf", "quad", "shoulder", "back", "neck", "ribs", "chest", "hand", "finger", "thumb", "wrist", "elbow", "abdom", "oblique", "pectoral", "biceps", "forearm", "heel", "shin", "fibula", "collarbone", "clavicle"])
    if (s.includes(k)) return k === "abdom" || k === "oblique" ? "core" : k === "clavicle" ? "collarbone" : k === "finger" || k === "thumb" ? "hand" : k;
  return "";
}
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2 };

export async function buildInjImpact({ getPack, season, nflSeason = season, log = console.log }) {
  const IHp = await getPack(`p${season}_injhist`), IH = IHp && IHp.injhist; if (!IH) throw new Error("no injury history pack");
  const PL = await getPack(`p${nflSeason}_nfl-players`); const posOf = {};
  if (PL && PL.p) { const ip = PL.cols.indexOf("pos"); for (const g in PL.p) posOf[g] = PL.p[g][ip] }
  const games = {};   // season -> gsis -> [{w, fp, sh}]
  for (let y = 2015; y <= season; y++) {
    let L = null; try { L = await getPack(`p${nflSeason}_nfl-logs-${y}`) } catch { }
    if (!L || !L.p) { log(`injury impact: no logs for ${y}`); continue }
    const c = Object.fromEntries(L.cols.map((k, i) => [k, i])); const S = games[y] = {};
    for (const g in L.p) S[g] = L.p[g].filter(r => r[c.type] === "R").map(r => ({ w: +r[c.week], fp: +r[c.fp] || 0, sh: r[c.tsnp] > 0 ? r[c.snp] / r[c.tsnp] : null, tm: r[c.team] })).sort((a, b) => a.w - b.w);
  }
  const P = {}, G = {};
  for (const ys in IH.d) { const y = +ys;
    for (const g in IH.d[ys]) { const pos = posOf[g]; if (!["QB", "RB", "WR", "TE", "FB"].includes(pos)) continue; const P2 = pos === "FB" ? "RB" : pos;
      /* stints as the site groups them: consecutive weeks (a bye inside a missed run doesn't split it) */
      const rows = IH.d[ys][g]; let cur = null; const S = [];
      for (const [w, i, s, m] of rows) { if (cur && (w - cur.w1 <= 1 || (w - cur.w1 === 2 && cur.lm && m)) && (i === cur.i || i < 0 || cur.i < 0)) { cur.w1 = w; if (cur.i < 0) cur.i = i; cur.m += m; cur.lm = m }
        else { cur = { w0: w, w1: w, i, m, lm: m }; S.push(cur) } }
      for (const st of S) { if (!st.m) continue; const key = injKey(st.i >= 0 ? IH.inj[st.i] : ""); if (!key) continue;
        const mine = (games[y] && games[y][g]) || [], prevY = (games[y - 1] && games[y - 1][g]) || [];
        let before = mine.filter(x => x.w < st.w0).slice(-4); if (before.length < 2) before = [...prevY.slice(-(4 - before.length)), ...before];
        let after = mine.filter(x => x.w > st.w1).slice(0, 4), same = after.length > 0; if (after.length < 4) after = [...after, ...((games[y + 1] && games[y + 1][g]) || []).slice(0, 4 - after.length)];
        if (before.length < 2 || after.length < 2) continue;
        const b = before.reduce((a, x) => a + x.fp, 0) / before.length, a = after.reduce((s2, x) => s2 + x.fp, 0) / after.length;
        const sb = med(before.map(x => x.sh).filter(x => x != null)), sa = med(after.map(x => x.sh).filter(x => x != null));
        (P[g] = P[g] || []).push([y, st.w0, key, +b.toFixed(1), +a.toFixed(1), sb == null ? null : +sb.toFixed(2), sa == null ? null : +sa.toFixed(2), after.length]);
        if (b >= 5) { const k = P2 + "|" + key, A = G[k] = G[k] || { r: [], s: [], same: 0, m: [] }; A.r.push(a / b); if (sb && sa != null) A.s.push(sa / sb); if (same) A.same++; A.m.push(st.m) } } } }
  const out = {};
  for (const k in G) { const A = G[k]; if (A.r.length < 8) continue;
    out[k] = [A.r.length, +med(A.r).toFixed(3), +(A.r.filter(x => x < 0.8).length / A.r.length).toFixed(3), A.s.length ? +med(A.s).toFixed(3) : null, +(A.same / A.r.length).toFixed(3), med(A.m)] }
  /* his whole injury picture (Oct 24 — Sam: "there have to be more injury related stats"), per player:
     points lost (games missed × his points a game that season), how often he played when listed questionable and what he scored,
     his team with him and without him (record and points a game, regular season), injuries that came back, and games missed a season
     against everyone at his position */
  const SCH = {};   // "season|week|team" -> [pf, pa]
  try { const r = await fetch("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz", { redirect: "follow" });
    const R = csvRows(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()), h = R[0], c = k => h.indexOf(k);
    for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[c("game_type")] !== "REG" || x[c("home_score")] === "") continue; const y = x[c("season")], w = x[c("week")], hs = +x[c("home_score")], as = +x[c("away_score")];
      SCH[`${y}|${w}|${x[c("home_team")]}`] = [hs, as]; SCH[`${y}|${w}|${x[c("away_team")]}`] = [as, hs] } } catch (e) { log("injury impact: schedule " + e.message) }
  const tmFix = t => ({ LA: "LA", LAR: "LA", STL: "LA", SD: "LAC", OAK: "LV", JAC: "JAX", WSH: "WAS" }[t] || t);
  const SUM = {}, posTot = {};
  const allG = new Set(); for (const y in games) for (const g in games[y]) allG.add(g); for (const y in IH.d) for (const g in IH.d[y]) allG.add(g);
  for (const g of allG) { const pos0 = posOf[g]; if (!["QB", "RB", "WR", "TE", "FB"].includes(pos0)) continue; const pos = pos0 === "FB" ? "RB" : pos0;
    let lost = 0, seasons = 0, missed = 0, qN = 0, qP = 0, qFp = 0, wW = 0, wL = 0, wPF = 0, wN = 0, oW = 0, oL = 0, oPF = 0, oN = 0; const keys = {};
    for (const ys of new Set([...Object.keys(games).filter(y => games[y][g]), ...Object.keys(IH.d).filter(y => IH.d[y][g])])) { const y = +ys;
      const pl = (games[y] && games[y][g]) || [], rows = (IH.d[ys] && IH.d[ys][g]) || [];
      if (pl.length < 1 && !rows.some(r => r[3])) continue; seasons++;
      const ppg = pl.length ? pl.reduce((a, x) => a + x.fp, 0) / pl.length : (games[y - 1] && games[y - 1][g] && games[y - 1][g].length ? games[y - 1][g].reduce((a, x) => a + x.fp, 0) / games[y - 1][g].length : 0);
      const m = rows.filter(r => r[3]).length; missed += m; lost += m * ppg;
      for (const r of rows) if (r[2] === 1) { qN++; const gm = pl.find(x => x.w === r[0]); if (gm) { qP++; qFp += gm.fp } }
      const teamAt = w => { let best = null, d = 99; for (const x of pl) { const dd = Math.abs(x.w - w); if (dd < d) { d = dd; best = x.tm } } return best };
      for (const x of pl) { const sc = SCH[`${y}|${x.w}|${x.tm}`] || SCH[`${y}|${x.w}|${tmFix(x.tm)}`]; if (!sc) continue; wN++; wPF += sc[0]; if (sc[0] > sc[1]) wW++; else if (sc[0] < sc[1]) wL++ }
      for (const r of rows) { if (!r[3]) continue; const tm = teamAt(r[0]); const sc = tm && (SCH[`${y}|${r[0]}|${tm}`] || SCH[`${y}|${r[0]}|${tmFix(tm)}`]); if (!sc) continue; oN++; oPF += sc[0]; if (sc[0] > sc[1]) oW++; else if (sc[0] < sc[1]) oL++ }
      /* injuries that came back: the distinct stints of each kind, by season */
      let lastW = -9, lastK = ""; for (const r of rows) { const k = injKey(r[1] >= 0 ? IH.inj[r[1]] : ""); if (!k) continue; if (!(k === lastK && r[0] - lastW <= 2)) keys[k] = (keys[k] || 0) + 1; lastK = k; lastW = r[0] } }
    if (!seasons) continue;
    const T = posTot[pos] = posTot[pos] || [0, 0]; T[0] += missed; T[1] += seasons;
    const rep = Object.entries(keys).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(",");
    if (missed || qN || rep) SUM[g] = [Math.round(lost), seasons, missed, qN, qP, qP ? +(qFp / qP).toFixed(1) : null, wW, wL, wN ? +(wPF / wN).toFixed(1) : null, wN, oW, oL, oN ? +(oPF / oN).toFixed(1) : null, oN, rep] }
  const posAvg = {}; for (const p in posTot) posAvg[p] = +(posTot[p][0] / Math.max(1, posTot[p][1])).toFixed(2);
  /* the yardstick: the same comparison with no injury in between — any 4 games against the 4 before them, players at 5+ points — because
     points bounce around anyway; an injury "costs" only what it takes beyond this */
  const base = {};
  for (const y in games) for (const g in games[y]) { const pos = posOf[g] === "FB" ? "RB" : posOf[g]; if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    const L = games[y][g]; for (let i = 4; i + 4 <= L.length; i += 4) { const b = L.slice(i - 4, i).reduce((a, x) => a + x.fp, 0) / 4, a = L.slice(i, i + 4).reduce((s2, x) => s2 + x.fp, 0) / 4;
      if (b >= 5) (base[pos] = base[pos] || []).push(a / b) } }
  const B = {}; for (const pos in base) B[pos] = [base[pos].length, +med(base[pos]).toFixed(3), +(base[pos].filter(x => x < 0.8).length / base[pos].length).toFixed(3)];
  log(`injury impact: ${Object.keys(out).length} position-injury groups, ${Object.keys(P).length} players · no-injury yardstick ${JSON.stringify(B)}`);
  log(`injury impact: ${Object.keys(SUM).length} player summaries · games missed a season by position ${JSON.stringify(posAvg)}`);
  return { g: out, p: P, base: B, s: SUM, posAvg };
}

export async function uploadInjImpact({ api, season, data }) {
  const name = `p${season}_injimpact`;
  const gz = gzipSync(Buffer.from(JSON.stringify({ injimpact: { t: Date.now(), v: 1, ...data } })));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
