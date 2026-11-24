/* College season-stat holes (Nov 24 — the owner, 3:17 pm, on Cam Newton missing from our 2010 college stats: "well yeah that needs to be fixed
   obviously, data run is fine"). CollegeFootballData's season totals (/stats/player/season) leave some players out entirely — 2010: Cam Newton,
   LaMichael James, Terrelle Pryor, Bobby Rainey, all of Idaho's passing (98 player-category lines that year) — while its game box scores
   (/games/players) have them. This adds up the box scores for every FBS player-category missing from the season totals, regular season and
   bowls kept apart, so the proxy (src/cfbd.js, mergeHoles) can add them back to every season-stats answer.

   Only players with no season line at all in that category (by id, and by name on the same team) are added; nobody's existing numbers change.
   Past seasons only (they never change). Calls: the proxy keeps every past-season answer for good, so a re-run costs nothing.
   Output: one pack per season, p{Y}_cfb-holes = { v: 1, y, r: [[playerId, name, team, conference, position, category, "r"|"p", { statType: n }]] } */

import { gzipSync } from "node:zlib";

const CATS = { passing: ["COMPLETIONS", "ATT", "YDS", "TD", "INT"], rushing: ["CAR", "YDS", "TD", "LONG"], receiving: ["REC", "YDS", "TD", "LONG"],
  defensive: ["TOT", "SOLO", "SACKS", "TFL", "PD", "QB HUR", "TD"], interceptions: ["INT", "YDS", "TD"], fumbles: ["FUM", "LOST", "REC"] };
const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");

export async function buildCfbHoles({ site, token, years, log = console.log, minLeft = 8000 }) {
  /* x-raw: the proxy's own answer, before it adds holes back (otherwise a re-run would see last run's fill as "already there") */
  const H = { headers: { Authorization: "Bearer " + token, "x-raw": "1" } };
  let calls = 0;
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() }
    if (r.status === 429) await new Promise(r => setTimeout(r, 5000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } throw new Error("CFBD failed: " + path) };
  const left = async () => { const j = await cf("/info"); return j && j.remainingCalls != null ? +j.remainingCalls : null };
  const out = {}, sum = [];
  for (const y of years) {
    const l = await left(); if (l != null && l < minLeft) { log(`holes: stopping before ${y}, ${l} calls left`); break }
    const fbsL = await cf(`/teams/fbs?year=${y}`), fbs = new Map((fbsL || []).map(t => [t.school, t.conference || ""]));
    const cal = await cf(`/calendar?year=${y}`), weeks = { regular: new Set(), postseason: new Set() };
    for (const w of cal || []) { const st = w.seasonType || w.season_type; if (weeks[st]) weeks[st].add(+w.week) }
    if (!weeks.regular.size) for (let w = 1; w <= 16; w++) weeks.regular.add(w);
    if (!weeks.postseason.size) weeks.postseason.add(1);
    const rows = [];
    for (const cat of Object.keys(CATS)) {
      const S = await cf(`/stats/player/season?year=${y}&category=${cat}`) || [];
      const ids = new Set(S.map(r => String(r.playerId))), names = new Set(S.map(r => r.team + "|" + nm(r.player)));
      const tot = new Map();   // id -> { n, t, r: {}, p: {} }
      for (const st of ["regular", "postseason"]) for (const wk of [...weeks[st]].sort((a, b) => a - b)) {
        const G = await cf(`/games/players?year=${y}&week=${wk}&seasonType=${st}&category=${cat}`) || [];
        for (const g of G) for (const tm of g.teams || []) { if (!fbs.has(tm.team)) continue;
          for (const c of tm.categories || []) { if (c.name !== cat) continue;
            for (const ty of c.types || []) for (const a of ty.athletes || []) { const id = String(a.id); if (!id || id === "-1" || ids.has(id) || names.has(tm.team + "|" + nm(a.name))) continue;
              const x = tot.get(id) || tot.set(id, { n: a.name, t: tm.team, r: {}, p: {}, g: new Set() }).get(id), b = st === "regular" ? x.r : x.p; x.g.add(g.id);
              if (ty.name === "C/ATT") { const [cm, at] = String(a.stat).split("/").map(Number); b.COMPLETIONS = (b.COMPLETIONS || 0) + (cm || 0); b.ATT = (b.ATT || 0) + (at || 0); continue }
              if (!CATS[cat].includes(ty.name)) continue; const v = parseFloat(a.stat) || 0;
              b[ty.name] = ty.name === "LONG" ? Math.max(b[ty.name] || 0, v) : (b[ty.name] || 0) + v } } } }
      for (const [id, x] of tot) for (const k of ["r", "p"]) if (Object.values(x[k]).some(v => v)) rows.push([id, x.n, x.t, fbs.get(x.t) || "", "", cat, k, x[k]]) }
    /* positions: the team's roster that season (one call per team with a hole) */
    const teams = [...new Set(rows.map(r => r[2]))], pos = {};
    for (const t of teams) { const R = await cf(`/roster?year=${y}&team=${encodeURIComponent(t)}`).catch(() => []) || []; for (const p of R) pos[String(p.id)] = p.position || "" }
    for (const r of rows) r[4] = pos[r[0]] || "";
    out[y] = { v: 1, y, r: rows };
    const big = rows.filter(r => r[6] === "r" && r[7].YDS >= 500).map(r => `${r[1]} (${r[2]}) ${r[5]} ${r[7].YDS}`);
    sum.push(`${y}: ${new Set(rows.map(r => r[0] + r[5])).size} player-categories, ${teams.length} teams${big.length ? " · 500+ yds: " + big.join(", ") : ""}`);
    log(`holes ${y}: ${rows.length} rows · ${calls} calls so far`) }
  return { out, sum, calls } }

export async function uploadCfbHoles({ api, out }) {
  let bytes = 0; const idx = {};
  for (const [y, d] of Object.entries(out)) { const gz = gzipSync(Buffer.from(JSON.stringify(d))); const name = `p${y}_cfb-holes`;
    const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    if (r && r.sha) idx[name] = { sha: r.sha, bytes: r.bytes, at: Date.now() }; bytes += gz.length }
  if (Object.keys(idx).length) await api("PUT", "/api/pack-index", { body: idx });
  return { bytes, packs: Object.keys(idx).length } }

/* read-only check (Nov 24: 2004-2008 filled 2,000-5,000 lines a season vs ~50-470 later): per season and category, how many players CFBD's own
   season totals list, how many the fill adds, the biggest added lines, and any added player whose last name matches a listed player on the
   same team (a possible double under a different first-name spelling). No writes. MODE=cfbholes, PROBE=check:2004-2008 */
export async function checkCfbHoles({ site, token, years, log = console.log }) {
  const raw = { headers: { Authorization: "Bearer " + token, "x-raw": "1" } }, mer = { headers: { Authorization: "Bearer " + token } };
  const get = async (p, H) => { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(p), H); return r.ok ? r.json() : [] };
  const last = s => nm(String(s || "").split(" ").slice(-1)[0] === "" ? s : String(s).replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, "").split(" ").slice(-1)[0]);
  const out = [];
  for (const y of years) for (const cat of ["passing", "rushing", "receiving", "defensive"]) {
    const p = `/stats/player/season?year=${y}&category=${cat}&seasonType=regular`, A = await get(p, raw), B = await get(p, mer);
    const ids = new Set(A.map(r => String(r.playerId))), add = B.filter(r => !ids.has(String(r.playerId)));
    const stat = cat === "defensive" ? "TOT" : "YDS", big = add.filter(r => r.statType === stat).sort((a, b) => b.stat - a.stat);
    const lastT = new Set(A.map(r => r.team + "|" + last(r.player))), twin = big.filter(r => lastT.has(r.team + "|" + last(r.player)));
    const line = `${y} ${cat}: CFBD lists ${ids.size} players · fill adds ${new Set(add.map(r => r.playerId)).size} · biggest: ${big.slice(0, 6).map(r => `${r.player} (${r.team}) ${r.stat}`).join(", ")} · same team + last name as a listed player: ${twin.length}${twin.length ? " (" + twin.slice(0, 6).map(r => `${r.player} ${r.team} ${r.stat}`).join(", ") + ")" : ""}`;
    out.push(line); log(line) }
  return out }
