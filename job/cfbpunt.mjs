/* College punts and returns (Oct 28 — Sam: "yes" to data set 5, CFBD punting/returns; "either way just run it" on the CFBD budget).
   CFBD /punting/players/season?year= (one call a season: each punter's and returner's season line) and /punting/plays?year=&week=&seasonType=
   (one call a week: every punt with the punter, returner, field position, punt, return and net yards, touchback / fair catch / out of bounds /
   downed / blocked / muffed / return TD / turnover / penalty, down, distance, quarter and clock). CFBD has these from 2015 on (2014 is empty,
   checked Oct 28). About 17 calls a season, about 215 for 2015–2026 the first time; after that a finished season is kept for good (never
   fetched again) and only the season being played is refreshed.

   Pack p2000_cfbpunt-<season> = { cfbpunt: { v: 1, t, season, players: [CFBD rows as sent], cols: [play fields], plays: [[…], …] } } —
   kept as CFBD sends it, our own copy (Sam: keep data for good). */
import { gzipSync } from "node:zlib";

const COLS = ["gameId", "playId", "driveId", "week", "seasonType", "puntingTeam", "puntingConference", "receivingTeam", "receivingConference", "period", "clock",
  "down", "distance", "playType", "playText", "punterId", "punter", "receiverId", "receiver", "returnerId", "returner", "blockerId", "blocker", "countsAsPunt",
  "countsAsReturn", "startYardsToGoal", "puntYards", "returnYards", "returnerYards", "netPuntYards", "kickEndYardline", "endYardline", "isTouchback",
  "isFairCatch", "isOutOfBounds", "isDowned", "isBlocked", "isMuffed", "isReturnTouchdown", "isReceivingTeamTurnover", "hasPenalty", "parseStatus"];
export const puntName = y => `p2000_cfbpunt-${y}`;

export async function buildPunts({ site, token, api, getIndex, log = console.log, first = 2015, minLeft = 1500 }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  let calls = 0;
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() }
        if (r.status === 400 || r.status === 404) return null; if (r.status === 429) await new Promise(z => setTimeout(z, 20000)) } catch (e) { } await new Promise(z => setTimeout(z, 2000 * (k + 1))) } throw new Error("CFBD " + path + " failed 3 times") };
  const left = async () => { const j = await cf("/info"); return j && j.remainingCalls != null ? +j.remainingCalls : null };
  const now = new Date(), cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const idx = (await getIndex()) || {}, out = [];
  for (let y = first; y <= cur; y++) {
    if (y < cur && idx[puntName(y)]) { log(`punts ${y}: kept`); continue }
    const lf = await left(); if (lf != null && lf < minLeft) { log(`punts: stopped before ${y}, ${lf} CFBD calls left (floor ${minLeft})`); out.push({ y, stopped: true }); break }
    const players = (await cf(`/punting/players/season?year=${y}`)) || [];
    const plays = [], seen = new Set();
    for (const [st, ws] of [["regular", Array.from({ length: 16 }, (_, i) => i + 1)], ["postseason", [1]]]) for (const w of ws) {
      const L = (await cf(`/punting/plays?year=${y}&week=${w}&seasonType=${st}`)) || [];
      for (const p of L) { const id = String(p.playId); if (seen.has(id)) continue; seen.add(id); plays.push(COLS.map(c => p[c] === undefined ? null : p[c])) }
      if (y === cur && st === "regular" && !L.length && w > 2) break }
    /* nothing back (a CFBD hiccup, or a season it doesn't have): don't write an empty pack over a good one */
    if (!plays.length && !players.length) { log(`punts ${y}: nothing returned, not written`); out.push({ y, plays: 0, players: 0 }); continue }
    if (y < cur && plays.length < 1000) { log(`punts ${y}: only ${plays.length} punts — not written, will try again next run`); out.push({ y, plays: plays.length, players: players.length, short: true }); continue }
    const gz = gzipSync(Buffer.from(JSON.stringify({ cfbpunt: { v: 1, t: Date.now(), season: y, players, cols: COLS, plays } })));
    const r = await api("PUT", `/api/pack/${puntName(y)}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    await api("PUT", "/api/pack-index", { body: { [puntName(y)]: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
    const pun = players.filter(x => x.punting).length, ret = players.filter(x => x.returning).length;
    log(`punts ${y}: ${plays.length} punts · ${pun} punters · ${ret} returners · ${(r.bytes / 1024).toFixed(0)} KB`); out.push({ y, plays: plays.length, punters: pun, returners: ret, kb: Math.round(r.bytes / 1024) }) }
  return { calls, seasons: out }
}
