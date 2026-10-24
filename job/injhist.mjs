/* NFL injury history, week by week (Oct 23 — Sam: "there needs to be an injuries tab with all of their injuries, newest injury first").
   From nflverse's weekly injury reports and weekly rosters, 2016 on (the roster files before 2016 can't tell a missed week, see avail.mjs).
   For each season and player, every regular-season week he was on the injury report with a real injury, or missed hurt:
     [week, injury index (into inj, -1 = none listed), status, missed, left hurt?]
       status 1 questionable · 2 doubtful · 3 out · 4 on reserve (IR, PUP, NFI — not on the report, the roster file says so)
     a fifth value, 1, when he left that game hurt (Oct 24 — Sam: "mid game injuries should be included when they are ruled out before halftime like ladd was"):
         he played under half his usual share of the offense's snaps (his median of the 3 games before, when that was 40%+), and the next
         injury report (a bye skipped) — or, for the latest game, ESPN's current injury list — names an injury. Snaps from the game logs
         (Sleeper's weekly stats), so 2020 on.
       missed 1 = he didn't play that week because he was hurt (reserve-injured, or inactive with an injury listed)
   Rest days, personal reasons, coach's decisions and COVID aren't injuries (notHurt). The site groups the weeks into stints.
   Output: pack "pYYYY_injhist" = { injhist: { t, v: 1, from, inj: [names], d: { season: { gsis: [[w, i, s, m], …] } } } } */

import { gzipSync } from "node:zlib";
import { csvRows } from "./lib/files.mjs";
import { classify, notHurt } from "./avail.mjs";

const NFLV = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_";
const NFLI = "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_";
const ST = { questionable: 1, doubtful: 2, out: 3 };

/* "Hamstring - Hamstring", "Knee - MCL" → "Hamstring", "Knee (MCL)" */
export function injName(s) {
  const p = [...new Set(String(s || "").split(/\s+-\s+|\s*\/\s*/).map(x => x.trim()).filter(Boolean))];
  if (!p.length) return "";
  const t = p[0].replace(/^./, c => c.toUpperCase());
  return p.length > 1 && !new RegExp(p[1], "i").test(t) ? `${t} (${p.slice(1).join(", ")})` : t;
}

export async function buildInjHist({ from = 2016, to, prev = null, getPack = null, nflSeason = to, espnNow = null, log = console.log } = {}) {
  let PL = null; try { PL = getPack ? await getPack(`p${nflSeason}_nfl-players`) : null } catch { }
  const espnOf = {}; if (PL && PL.p) { const ie = PL.cols.indexOf("espn"); for (const g in PL.p) if (PL.p[g][ie]) espnOf[g] = String(PL.p[g][ie]) }
  let exits = 0;
  const names = prev && prev.inj ? [...prev.inj] : [], idx = new Map(names.map((n, i) => [n, i]));
  const id = n => { if (!n) return -1; if (!idx.has(n)) { idx.set(n, names.length); names.push(n) } return idx.get(n) };
  const d = {};
  for (let y = from; y <= to; y++) {
    if (prev && prev.d && y < to && prev.d[y] && Object.keys(prev.d[y]).length > 300) { d[y] = prev.d[y]; continue }   /* finished seasons kept */
    const W = {};   // gsis -> week -> [i, s, m]
    try {
      const r = await fetch(NFLI + y + ".csv", { redirect: "follow" });
      if (r.ok) { const R = csvRows(await r.text()), h = R[0], c = k => h.indexOf(k), jG = c("gsis_id"), jW = c("week"), jT = c("game_type"), jI = c("report_primary_injury"), jS = c("report_status");
        for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[jT] && x[jT] !== "REG") continue; const g = x[jG], w = +x[jW], inj = x[jI] || ""; if (!g || !w || !inj || notHurt(inj)) continue;
          const s = ST[String(x[jS] || "").toLowerCase()] || 0; (W[g] = W[g] || {})[w] = [id(injName(inj)), s, 0] } }
      else log(`injury history ${y}: reports ${r.status}`);
    } catch (e) { log(`injury history ${y}: ${e.message}`) }
    try {
      const r = await fetch(NFLV + y + ".csv", { redirect: "follow" });
      if (r.ok) { const R = csvRows(await r.text()), H = R[0], c = k => H.indexOf(k), iS = c("status"), iC = c("status_description_abbr"), iG = c("gsis_id"), iT = c("game_type"), iW = c("week"), seen = new Set();
        for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[iT] && x[iT] !== "REG") continue; const g = x[iG], w = +x[iW]; if (!g || !w) continue; const k = g + "|" + w; if (seen.has(k)) continue; seen.add(k);
          const cl = classify(x[iS], x[iC]), cur = W[g] && W[g][w];
          if (cl === 1) { (W[g] = W[g] || {})[w] = [cur ? cur[0] : -1, 4, 1] }          // on reserve, hurt
          else if (cl === 2 || (cl === 3 && cur)) { if (cur) cur[2] = 1; else (W[g] = W[g] || {})[w] = [-1, 3, 1] }   // inactive, hurt
        } }
      else log(`injury history ${y}: rosters ${r.status}`);
    } catch (e) { log(`injury history ${y}: ${e.message}`) }
    /* left the game hurt */
    if (getPack && y >= 2020) { let L = null; try { L = await getPack(`p${nflSeason}_nfl-logs-${y}`) } catch { }
      if (L && L.p) { const c = Object.fromEntries(L.cols.map((k, i) => [k, i])), lastW = Math.max(0, ...Object.values(L.p).flat().filter(r => r[c.type] === "R").map(r => +r[c.week]));
        for (const g in L.p) { const G = L.p[g].filter(r => r[c.type] === "R" && r[c.tsnp] > 0).map(r => ({ w: +r[c.week], sh: r[c.snp] / r[c.tsnp] })).sort((a, b) => a.w - b.w);
          for (let k = 2; k < G.length; k++) { const prev3 = G.slice(Math.max(0, k - 3), k).map(x => x.sh).sort((a, b) => a - b), base = prev3[Math.floor(prev3.length / 2)];
            if (!(base >= .4) || !(G[k].sh <= .5 * base)) continue; const w = G[k].w, nx = W[g] && (W[g][w + 1] || W[g][w + 2]);
            let i = nx && nx[0] >= 0 ? nx[0] : -1;
            if (i < 0 && w === lastW && y === to && espnNow) { const e = espnNow[espnOf[g]]; if (e && !notHurt(e)) i = id(injName(e)) }
            if (i < 0) continue; const cur = W[g] && W[g][w];
            if (cur) { if (!cur[2]) { cur[3] = 1; if (cur[0] < 0) cur[0] = i } } else (W[g] = W[g] || {})[w] = [i, 0, 0, 1]; exits++ } } } }
    /* a reserve week with no injury named takes the injury from the nearest listed week before it */
    const S = {};
    for (const g in W) { const ws = Object.keys(W[g]).map(Number).sort((a, b) => a - b); let last = -1; const rows = [];
      for (const w of ws) { const v = W[g][w]; if (v[0] < 0 && last >= 0) v[0] = last; if (v[0] >= 0) last = v[0]; if (v[1] === 3 && !v[2]) v[2] = 1; rows.push(v[3] ? [w, v[0], v[1], v[2], 1] : [w, v[0], v[1], v[2]]) }
      S[g] = rows }
    d[y] = S; log(`injury history ${y}: ${Object.keys(S).length} players${exits ? `, ${exits} left a game hurt so far` : ""}`);
  }
  return { inj: names, d };
}

export async function uploadInjHist({ api, season, data }) {
  const name = `p${season}_injhist`;
  const gz = gzipSync(Buffer.from(JSON.stringify({ injhist: { t: Date.now(), v: 2, from: Math.min(...Object.keys(data.d).map(Number)), inj: data.inj, d: data.d } })));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
