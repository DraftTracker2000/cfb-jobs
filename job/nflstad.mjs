/* "In their stadium" on NFL team pages, kept current (Nov 7 — the owner, 10:20 am: "yes, i would now like the stadium thing to be ever lasting").
   Rebuilds what public/data/nfl-stadiums.json held (made once from 2009–2025) every weekly run, so this season's injuries count as they come in.
   Sources (nflverse, same as job/injhist.mjs): the schedules file (stadium, roof, surface for every game) and the weekly injury reports.
   New injury (pattern hunts 17 and 21): a player on his team's next report (within two weeks) with an injury, on neither of the two reports
   before the game. Rest, personal, illness and non-football don't count. A rate is that count against the league average that season (1.00).
   Each team's numbers are for its current home stadium (one stadium = one row, so the Jets and Giants share MetLife's).
   Output: pack p2000_nflstad = { nflstad: { v, at, through, t: { TEAM: {stad, surface, roof, games, y0, all, vis, home, road, soft, soft19,
   knee, ankle, foot, soft19rk} }, nStad } } — the same shape as the old file. */

import { csvRows } from "./lib/files.mjs";

const SCHED = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
const NFLI = "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_";
const FIX = { STL: "LA", SD: "LAC", OAK: "LV" }, tk = t => FIX[t] || t;
const NOT_HURT = /not injury|rest|^$|personal|illness|resting|non-football|nir/;
const TYPES = ["soft", "knee", "ankle", "foot", "conc", "other"];
export function injType(s) {
  if (/hamstring|groin|calf|quad|thigh|hip flexor|pectoral|pec\b|abdom|oblique|adductor/.test(s)) return "soft";
  if (/knee|acl|mcl|meniscus|patella/.test(s)) return "knee";
  if (/ankle/.test(s)) return "ankle";
  if (/foot|toe|achilles|heel|plantar/.test(s)) return "foot";
  if (/concuss|head/.test(s)) return "conc";
  return "other";
}

/* text: optional { sched, inj: {year: csvText} } to run from local files (tests); otherwise fetched */
/* fixes: the site's hand list (public/data/nfl-injuries.json) — injuries the reports never named (a player put straight on IR). Each one with the
   game week he was hurt (hurt), hurt in that game or in its pregame warmups (12:46 pm: "pregame doesnt happen at the stadium? i feel like that
   should count"), counts. Camp injuries aggravated in a game don't (12:47 pm: "if he hurt it in camp it would be against the team facilities") as a new injury in that game (Nov 7: the IR lookups). */
export async function buildStadiums({ from = 2009, to, text = null, fixes = null, log = console.log } = {}) {
  const get = async u => { const r = await fetch(u, { redirect: "follow" }); if (!r.ok) throw new Error(`${u.split("/").pop()}: ${r.status}`); return r.text() };
  const S = csvRows(text ? text.sched : await get(SCHED)), h = S[0], c = k => h.indexOf(k);
  const G = [];
  for (let i = 1; i < S.length; i++) { const x = S[i], y = +x[c("season")];
    if (y < from || y > to || x[c("game_type")] !== "REG" || x[c("home_score")] === "" || x[c("home_score")] == null) continue;
    G.push({ id: x[c("game_id")], y, w: +x[c("week")], home: tk(x[c("home_team")]), away: tk(x[c("away_team")]), sid: x[c("stadium_id")], stad: x[c("stadium")],
      roof: x[c("roof")], surface: String(x[c("surface")] || "").trim().toLowerCase(), neutral: x[c("location")] === "Neutral" }) }
  /* reports: season|team|week → all players; and → hurt players with their injury type */
  const rep = new Map(), hurt = new Map(), weeks = new Map(); let through = from;
  for (let y = from; y <= to; y++) {
    let t; try { t = text ? text.inj[y] : await get(NFLI + y + ".csv") } catch (e) { log(`stadiums: injuries ${y}: ${e.message}`); continue }
    if (!t) continue;
    const R = csvRows(t), H = R[0], j = k => H.indexOf(k), jG = j("gsis_id"), jW = j("week"), jT = j("game_type"), jTm = j("team"), jR = j("report_primary_injury"), jP = j("practice_primary_injury");
    let n = 0;
    for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[jT] !== "REG") continue; const g = x[jG], w = +x[jW], tm = tk(x[jTm]); if (!g || !w || !tm) continue; n++;
      const k = `${y}|${tm}|${w}`; if (!rep.has(k)) rep.set(k, new Set()); rep.get(k).add(g);
      const wk = `${y}|${tm}`; if (!weeks.has(wk)) weeks.set(wk, new Set()); weeks.get(wk).add(w);
      const inj = String(x[jR] || x[jP] || "").toLowerCase(); if (NOT_HURT.test(inj)) continue;
      if (!hurt.has(k)) hurt.set(k, new Map()); hurt.get(k).set(g, injType(inj)) }
    if (n) through = y }
  /* hand-listed injuries: his team that season from the reports, charged to that week's game */
  const teamOf = new Map(); for (const k of rep.keys()) { const [y, tm, w] = k.split("|"); for (const g of rep.get(k)) { const kk = `${y}|${g}`, cur = teamOf.get(kk); if (!cur || +w > cur.w) teamOf.set(kk, { tm, w: +w }) } }
  const extra = new Map(); let nFix = 0;
  for (const z of fixes || []) { if (!z || !z.hurt || (z.how && !/pregame/.test(z.how)) || !z.gsis || !z.season || !z.injury || /not an injury/i.test(z.injury)) continue;
    const t = teamOf.get(`${z.season}|${z.gsis}`); if (!t) continue; const k = `${z.season}|${t.tm}|${z.hurt}`;
    if (!extra.has(k)) extra.set(k, []); extra.get(k).push([z.gsis, injType(String(z.injury).toLowerCase())]) }
  /* team facilities (12:47–12:48 pm: "if he hurt it in camp it would be against the team facilities" · "you could make a note of the
     facilities tho"): hand-listed injuries from practice or camp, noted under his team that season — kept, not on the card yet */
  const fac = {}; for (const z of fixes || []) { if (!z || !z.how || !/practice|camp/.test(z.how) || !z.gsis) continue; const t = teamOf.get(`${z.season}|${z.gsis}`); if (!t) continue;
    (fac[t.tm] = fac[t.tm] || []).push([z.name, z.season, z.injury, z.how]) }
  /* team-games with a next report: new injuries by type */
  const TG = [];
  for (const g of G) for (const [team, home] of [[g.home, 1], [g.away, 0]]) {
    const W = weeks.get(`${g.y}|${team}`); if (!W) continue;
    const nx = [...W].filter(w => w > g.w && w <= g.w + 2).sort((a, b) => a - b)[0]; if (nx == null) continue;
    const after = hurt.get(`${g.y}|${team}|${nx}`) || new Map(), b0 = rep.get(`${g.y}|${team}|${g.w}`), b1 = rep.get(`${g.y}|${team}|${g.w - 1}`);
    const o = { g, team, home }; for (const t of TYPES) o[t] = 0;
    const seen = new Set(); for (const [pid, t] of after) if (!(b0 && b0.has(pid)) && !(b1 && b1.has(pid))) { o[t]++; seen.add(pid) }
    for (const [pid, t] of extra.get(`${g.y}|${team}|${g.w}`) || []) if (!seen.has(pid)) { o[t]++; seen.add(pid); nFix++ }
    o.all = TYPES.reduce((a, t) => a + o[t], 0); TG.push(o) }
  /* each season's average a team-game, for the expected counts */
  const avg = {}; for (const o of TG) { const a = avg[o.g.y] = avg[o.g.y] || { n: 0 }; a.n++; for (const t of [...TYPES, "all"]) a[t] = (a[t] || 0) + o[t] }
  const rate = (L, t) => { let ob = 0, ex = 0; for (const o of L) { ob += o[t]; ex += avg[o.g.y][t] / avg[o.g.y].n } return ex ? Math.round(100 * ob / ex) / 100 : null };
  const bySid = new Map(); for (const o of TG) { if (!bySid.has(o.g.sid)) bySid.set(o.g.sid, []); bySid.get(o.g.sid).push(o) }
  /* soft tissue since 2019, every stadium with 25+ games, highest first */
  const rk = [...bySid].map(([sid, L]) => { const M = L.filter(o => o.g.y >= 2019); return { sid, n: new Set(M.map(o => o.g.id)).size, r: rate(M, "soft") } })
    .filter(x => x.n >= 25).sort((a, b) => b.r - a.r); const rkOf = new Map(rk.map((x, i) => [x.sid, i + 1]));
  /* each team's current home stadium: its latest home game that isn't at a neutral site */
  const out = {};
  const teams = [...new Set(G.map(g => g.home))];
  for (const t of teams) {
    const last = G.filter(g => g.home === t && !g.neutral).sort((a, b) => b.y - a.y || b.w - a.w)[0]; if (!last || last.y < to - 1) continue;
    const L = bySid.get(last.sid) || []; if (!L.length) continue;
    const ids = new Set(L.map(o => o.g.id)), L19 = L.filter(o => o.g.y >= 2019);
    const hs = G.filter(g => g.sid === last.sid).sort((a, b) => b.y - a.y || b.w - a.w), sf = (hs.find(g => g.surface && g.surface !== "nan") || {}).surface || "", rf = (hs.find(g => g.roof) || {}).roof || "";   /* the schedule leaves some games' surface blank */
    out[t] = { stad: last.stad, surface: sf, roof: rf, games: ids.size, y0: Math.min(...L.map(o => o.g.y)),
      all: rate(L, "all"), vis: rate(L.filter(o => !o.home), "all"), home: rate(L.filter(o => o.home), "all"), road: rate(TG.filter(o => o.team === t && !o.home), "all"),
      soft: rate(L, "soft"), soft19: rate(L19, "soft"), knee: rate(L, "knee"), ankle: rate(L, "ankle"), foot: rate(L, "foot"), soft19rk: rkOf.get(last.sid) || null } }
  log(`stadiums: ${TG.length} team-games, ${nFix} hand-listed injuries added, ${Object.keys(out).length} teams, through ${through}`);
  return { v: 2, at: Date.now(), through: String(through), t: out, nStad: rk.length, fac };
}
