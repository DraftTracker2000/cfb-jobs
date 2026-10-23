/* NFL availability, boiled down from nflverse's weekly rosters (every player's status every week).
   For every player (all positions — the coaches tab rates durability for linemen and defenders too) and regular season: [active, reserve-injured, inactive-injured, inactive-unclear, other].

   Only 2016 on: before that the files carry one status for the whole season copied onto every week
   (Rodgers shows active all of 2013, when he missed 7 games; Gronkowski shows on reserve all of 2012,
   when he played 11), so those years can't tell a missed week from a played one.

   1 reserve-injured  RES with an injury code — R01 injured reserve, R48 IR designated to return, R04 PUP,
                      R05 non-football injury, R23 waived/injured — or with no reason given (2016–2019
                      files mostly leave it blank; Rodgers/Watson/Beckham on IR in 2017 look like that); PUP
   2 inactive-injured INA I01
   3 inactive-unclear INA A01 — game-day inactive, reason not given: could be hurt, could be a healthy
                      scratch, a rest week or a holdout (Watson sat all of 2021 this way). A week the injury
                      report lists him with an injury or an illness moves to 2 (inactive-injured); the rest stay here
                      (rest, personal, coach's decision and COVID don't count).
   4 other            suspension (R40, SUS), COVID list (R59), left squad (R27, R33), retired, cut, waived,
                      practice squad, exempt …
   No row at all = not on a roster (unsigned) and isn't counted.
   Output: pack "pYYYY_availability" = { avail: { t, v:2, from, d: { season: { gsis: [a, r, i, u, o] } } } } */

import { gzipSync } from "node:zlib";
import { csvRows } from "./lib/files.mjs";

const NFLV = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_";
const NFLI = "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_";
/* "injuries" that aren't missed time for durability: rest days, personal matters, coach's decisions, and COVID
   (Sam, Sept 29: "a wild time … not their fault"). Illness does count (Sam, Sept 29). */
const NOT_HURT = /not injury|rest|personal|non-injury|coach|suspen|covid/i;
export const notHurt = s => NOT_HURT.test(s) && !/non-covid/i.test(s);
const SKILL = new Set(["QB", "RB", "WR", "TE", "FB", "HB"]);
const INJ_RES = new Set(["R01", "R48", "R04", "R05", "R23"]);

const BLANK = new Set(["", "A01", "I01"]);   // RES with no reason given (2016–2019 files)
export function classify(status, code) {
  if (status === "ACT") return 0;
  if (status === "PUP") return 1;
  if (status === "RES") return INJ_RES.has(code) || BLANK.has(code) ? 1 : 4;
  if (status === "INA") return code === "I01" ? 2 : code === "A01" ? 3 : 4;
  return 4;
}

/* before 2016 (Oct 23 — Sam: "why don't we have available scores for players? and why is brady's so wrong?"): the weekly roster files
   can't tell a missed week from a played one, so a season is read from the weekly stat lines instead: the weeks his team played and the
   weeks he has a line. A week his team played without him counts injured when the week's injury report lists him hurt (2009 on), or —
   for 1999–2008, before injury reports — whenever he missed it in a season he otherwise played (stars rarely sit healthy). A whole season
   with no line between two he played (Peyton Manning 2011, neck) counts as all injured. [a, r, i, u, o] like the roster-file years. */
const NFLS = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_";
async function oldSeasons(from, to, log) {
  const play = {}, teamW = {}, mainT = {}, hurt = {};
  for (let y = from; y <= to; y++) {
    const r = await fetch(NFLS + y + ".csv", { redirect: "follow" }); if (!r.ok) { log(`availability (stats) ${y}: ${r.status}`); continue }
    const R = csvRows(await r.text()), H = R[0], iG = H.indexOf("player_id"), iT = H.indexOf("season_type"), iW = H.indexOf("week"), iTm = H.indexOf("team");
    const P = play[y] = {}, T = teamW[y] = {}, M = mainT[y] = {};
    for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[iT] && x[iT] !== "REG") continue; const g = x[iG], w = +x[iW], t = x[iTm]; if (!g || !t) continue;
      (T[t] = T[t] || new Set()).add(w); (P[g] = P[g] || new Set()).add(w); const m = M[g] = M[g] || {}; m[t] = (m[t] || 0) + 1 }
    if (y >= 2009) { const h = hurt[y] = new Set(); try { const ir = await fetch(NFLI + y + ".csv", { redirect: "follow" }); if (ir.ok) { const Q = csvRows(await ir.text()), q = Q[0], jG = q.indexOf("gsis_id"), jW = q.indexOf("week"), jT = q.indexOf("game_type"), jI = q.indexOf("report_primary_injury");
      for (let i = 1; i < Q.length; i++) { const x = Q[i]; if (x[jT] && x[jT] !== "REG") continue; const inj = x[jI] || ""; if (!inj || notHurt(inj)) continue; h.add(x[jG] + "|" + x[jW]) } } } catch (e) { log(`injury reports ${y}: ${e.message}`) } }
    log(`availability (stats) ${y}: ${Object.keys(P).length} players`) }
  const out = {}, years = Object.keys(play).map(Number).sort((a, b) => a - b), first = {}, last = {};
  for (const y of years) for (const g in play[y]) { if (first[g] == null) first[g] = y; last[g] = y }
  for (const y of years) { const S = out[y] = {};
    for (const g in play[y]) { const M = mainT[y][g], t = Object.keys(M).sort((a, b) => M[b] - M[a])[0], tw = teamW[y][t] || new Set(), me = play[y][g]; let a = 0, i = 0;
      for (const w of tw) { if (me.has(w)) { a++; continue } if (y >= 2009 ? hurt[y] && hurt[y].has(g + "|" + w) : true) i++ }
      /* before injury reports (1999–2008) a missed week only counts for a player in the lineup: 8+ games this season or last (Brady 2008
         counts; Rodgers sitting behind Favre in 2007 doesn't) */
      if (y < 2009 && i > 0 && a < 8 && !((play[y - 1] && play[y - 1][g] && play[y - 1][g].size >= 8))) i = 0;
      S[g] = [a, 0, i, 0, 0] }
    /* a whole season missed between two he played */
    for (const g in first) if (first[g] < y && last[g] > y && !play[y][g]) { const prevY = play[y - 1] && play[y - 1][g] ? y - 1 : null; if (prevY == null) continue; const M = mainT[prevY][g], t = Object.keys(M).sort((a, b) => M[b] - M[a])[0]; const n = (teamW[y][t] || new Set()).size || 16; S[g] = [0, n, 0, 0, 0] } }
  return out }

export async function buildAvailability({ from = 1999, to, log = console.log, prev = null } = {}) {
  const out = {};
  const oldTo = Math.min(2015, to); let OLD = null;
  if (from <= oldTo) { const need = []; for (let y = from; y <= oldTo; y++) if (!(prev && prev[y] && Object.keys(prev[y]).length > 500)) need.push(y);
    if (need.length) OLD = await oldSeasons(from, oldTo, log);
    for (let y = from; y <= oldTo; y++) out[y] = OLD ? OLD[y] || {} : prev[y] }
  for (let y = Math.max(from, 2016); y <= to; y++) {
    if (prev && y < to && prev[y] && Object.keys(prev[y]).length > 500) { out[y] = prev[y]; continue }   /* a finished season, kept (Oct 12) */
    const r = await fetch(NFLV + y + ".csv", { redirect: "follow" });
    if (!r.ok) { log(`availability ${y}: ${r.status}`); continue }
    const rows = csvRows(await r.text());
    const H = rows[0], ix = k => H.indexOf(k);
    const iS = ix("status"), iC = ix("status_description_abbr"), iP = ix("position"), iG = ix("gsis_id"), iT = ix("game_type"), iW = ix("week");
    /* game-day inactives (A01) the injury report lists with an injury that week count as injured: a player ruled out
       with a sprained ankle is marked inactive, not put on reserve (Lamar Jackson missed 10 games in 2021–22 that way) */
    const hurt = new Set();
    try {
      const ir = await fetch(NFLI + y + ".csv", { redirect: "follow" });
      if (ir.ok) { const R = csvRows(await ir.text()), h = R[0], jG = h.indexOf("gsis_id"), jW = h.indexOf("week"), jT = h.indexOf("game_type"), jI = h.indexOf("report_primary_injury");
        for (let i = 1; i < R.length; i++) { const x = R[i]; if (x[jT] && x[jT] !== "REG") continue; const inj = x[jI] || ""; if (!inj || notHurt(inj)) continue; hurt.add(x[jG] + "|" + x[jW]) } }
      else log(`injury reports ${y}: ${ir.status}`);
    } catch (e) { log(`injury reports ${y}: ${e.message}`) }
    const S = {}, seen = new Set();
    for (let i = 1; i < rows.length; i++) {
      const x = rows[i];
      if (x[iT] && x[iT] !== "REG") continue;
      const g = x[iG]; if (!g) continue;
      const k = g + "|" + x[iW]; if (seen.has(k)) continue; seen.add(k);   // one row per player-week
      let c = classify(x[iS], x[iC]);
      if (c === 3 && hurt.has(k)) c = 2;
      (S[g] = S[g] || [0, 0, 0, 0, 0])[c]++;
    }
    out[y] = S;
    log(`availability ${y}: ${Object.keys(S).length} players`);
  }
  return out;
}

/* upload as a pack (the same place the QB packs live) */
export async function uploadAvailability({ api, season, data }) {
  const name = `p${season}_availability`;
  const gz = gzipSync(Buffer.from(JSON.stringify({ avail: { t: Date.now(), v: 2, from: Math.min(...Object.keys(data).map(Number)), d: data } })));
  const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
  return { name, bytes: r.bytes };
}
