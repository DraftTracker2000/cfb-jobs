/* Legacy's season-by-season NFL totals, done once by the data job (Nov 10, 8:10 am: "why wouldn't we do the running and then they just
   pull it from us in a lighter way? none of the past season stuff changes. it only has to add the most updated season stuff to it").

   Before: every browser read 27 seasons of NFL stats (1999 on, the trimmed nflverse stats_player_reg files) and added them up each time
   Legacy opened. Now the job keeps every season's rows in one pack, p<Y>_nfl-legtot, and each run re-reads only this season and last
   (stat corrections), plus any season the pack doesn't have yet. Past seasons are carried over from the last pack as they are.

   The rows are the same rows the browser read — the same trimming code (src/cfbd.js trimmedFile: skill positions, the same columns) — so
   the board adds them up exactly as before, in one quick pass over one file. Pack:
     { v, through, cols, y: { "<season>": [[player_id, position, recent_team, games, attempts, carries, targets, passing_yards, passing_tds,
                                            passing_interceptions, rushing_yards, rushing_tds, receiving_yards, receiving_tds], …] } } */
import { trimmedFile, csvRows } from "./lib/files.mjs";

export const LEGTOT_V = 1, FIRST = 1999;
export const LEGTOT_COLS = ["player_id", "position", "recent_team", "games", "attempts", "carries", "targets", "passing_yards", "passing_tds",
  "passing_interceptions", "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds"];
const NUM = new Set(LEGTOT_COLS.slice(3));

/* one season's trimmed file → rows (numbers as numbers, blanks as 0, text as text) */
export function seasonRows(csv) {
  const R = csvRows(csv || ""); if (R.length < 2) return [];
  const H = R[0], ix = LEGTOT_COLS.map(k => H.indexOf(k)), out = [];
  for (let i = 1; i < R.length; i++) { const a = R[i]; if (!a || !a[ix[0]]) continue;
    out.push(LEGTOT_COLS.map((k, j) => { const v = ix[j] < 0 ? "" : a[ix[j]]; return NUM.has(k) ? (+v || 0) : (v || "") })) }
  return out }

/* the pack: last pack's seasons kept, these seasons read again (fetchSeason(y) → trimmed CSV text, or null when there's no file) */
export async function buildLegtot({ prev, nflSeason, fetchSeason, log = console.log, full = false }) {
  const keep = !full && prev && prev.v === LEGTOT_V && prev.y ? prev.y : {};
  const y = {}, redo = [];
  for (let s = FIRST; s <= nflSeason; s++) { if (s >= nflSeason - 1 || !keep[s] || !keep[s].length) redo.push(s); else y[s] = keep[s] }
  for (const s of redo) { const csv = await fetchSeason(s); const rows = csv ? seasonRows(csv) : [];
    if (rows.length) y[s] = rows; else if (keep[s]) y[s] = keep[s];   /* a season that didn't come keeps last run's rows */ }
  const n = Object.values(y).reduce((a, r) => a + r.length, 0);
  log(`legacy totals: ${Object.keys(y).length} seasons, ${n} rows (${redo.length} read this run: ${redo.join(", ")})`);
  return { v: LEGTOT_V, at: Date.now(), through: nflSeason, cols: LEGTOT_COLS, y } }

/* the problem check before upload: every season 1999 → last finished one present with a normal number of rows */
export function legtotProblem(P, nflSeason) {
  if (!P || P.v !== LEGTOT_V || !P.y) return "no pack";
  for (let s = FIRST; s < nflSeason; s++) { const n = (P.y[s] || []).length; if (n < 300) return `season ${s} has only ${n} rows` }
  return null }

/* fetch one season's trimmed stats file exactly as the site's proxy serves it */
export const fetchTrimmedSeason = async s => { const f = await trimmedFile("stats", { season: String(s) }); return f.status === 200 ? f.body : null };
