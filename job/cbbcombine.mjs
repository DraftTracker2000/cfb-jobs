/* NBA draft combine measurements (Oct 10 — Sam: "5 if we already have it"). The open sportsdataverse release
   "nba_stats_draft_combine" has every combine since 2001 as Parquet (draftcombinestats_{year}.parquet, ZSTD-compressed): height
   without shoes, weight, wingspan, standing reach, hands, body fat, verticals, lane agility, the sprint. Read with hyparquet (installed
   by the workflow, pinned) and Node's own ZSTD (Node 24).

   Player ids there are NBA.com's; ours are ESPN's. nba_crosswalk/nba_player_crosswalk_{season}.csv maps the two for current NBA
   players; everyone else (went back to school, never stuck) is matched on the page by name and combine year.

   Pack p2000_cbb-combine: { v, cols, got: [years read], rows: [[year, nbaId, espnId, name, pos, ht, wt, wing, reach, handL, handW, fat, vStand, vMax, lane, sprint]] }.
   Past years are cached; the newest is re-read in May–July (the combine is in May). The file for season Y holds the combine of May Y−1. */
import { zstdDecompressSync } from "node:zlib";
export const REL = f => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/${f}`;
export const COMBINE_COLS = ["year", "nbaId", "espnId", "name", "pos", "ht", "wt", "wing", "reach", "handL", "handW", "fat", "vStand", "vMax", "lane", "sprint"];
const num = v => { if (v == null || v === "") return null; const n = typeof v === "bigint" ? Number(v) : +v; return isFinite(n) && n > 0 ? Math.round(100 * n) / 100 : null };

/* one combine's rows (objects from the Parquet file) → compact rows; espnOf maps NBA ids to ESPN ids */
export function combineRows(year, objs, espnOf = {}) {
  const out = [];
  for (const r of objs) {
    const id = r.player_id != null ? Number(r.player_id) : null, name = String(r.player_name || `${r.first_name || ""} ${r.last_name || ""}`).trim(); if (!name) continue;
    const row = [year, id, espnOf[id] || null, name, r.position || null, num(r.height_wo_shoes), num(r.weight), num(r.wingspan), num(r.standing_reach), num(r.hand_length), num(r.hand_width),
      num(r.body_fat_pct), num(r.standing_vertical_leap), num(r.max_vertical_leap), num(r.lane_agility_time), num(r.three_quarter_sprint)];
    if (row.slice(5).some(v => v != null)) out.push(row);
  }
  return out;
}

export async function readParquet(url) {
  const r = await fetch(url, { redirect: "follow" }); if (r.status === 404) return null; if (!r.ok) throw new Error(`${r.status} ${url}`);
  const file = await r.arrayBuffer(), { parquetReadObjects } = await import("hyparquet");
  return parquetReadObjects({ file, compressors: { ZSTD: input => new Uint8Array(zstdDecompressSync(input)) } });
}
export async function crosswalk(seasons) {
  const map = {};
  for (const y of seasons) { const r = await fetch(REL(`nba_crosswalk/nba_player_crosswalk_${y}.csv`), { redirect: "follow" }).catch(() => null); if (!r || !r.ok) continue;
    const lines = (await r.text()).split(/\r?\n/), H = lines[0].split(","), ni = H.indexOf("nba_player_id"), ei = H.indexOf("espn_athlete_id");
    for (const l of lines.slice(1)) { const f = l.split(","); if (f[ni] && f[ei]) map[+f[ni]] = String(f[ei]) } }
  return map;
}

export async function buildCombine({ getPack, putPack, log, S, full }) {
  let P = full ? null : await getPack("p2000_cbb-combine").catch(() => null);
  if (!P || P.v !== 3) P = { v: 3, cols: COMBINE_COLS, got: [], rows: [] };   /* v3: combine years fixed (file year − 1) */
  const mo = new Date().getUTCMonth(), fresh = mo >= 4 && mo <= 6, last = new Date().getUTCFullYear(), espnOf = await crosswalk([S, S + 1]);
  let read = 0;
  /* files are named by NBA season: draftcombinestats_2026 is the May 2025 combine (Cooper Flagg), so the combine year is the file year
     minus one, and this May's combine is the file for next season */
  for (let f = 2002; f <= last + 1; f++) {
    const y = f - 1; if (P.got.includes(y) && !(y === last && fresh)) continue;
    const objs = await readParquet(REL(`nba_stats_draft_combine/draftcombinestats_${f}.parquet`)).catch(e => (log(`combine ${f}: ${e.message}`), null)); read++;
    if (objs && objs.length) { P.rows = P.rows.filter(r => r[0] !== y).concat(combineRows(y, objs, espnOf)); if (!P.got.includes(y)) P.got.push(y) }
  }
  /* the crosswalk grows each season: re-apply it to every cached year */
  P.rows = P.rows.map(r => { const e = espnOf[r[1]]; return e && !r[2] ? [...r.slice(0, 2), e, ...r.slice(3)] : r }).sort((a, b) => a[0] - b[0]);
  await putPack("p2000_cbb-combine", P);
  log(`combine: ${P.rows.length} measured players in ${P.got.length} combines (${P.rows.filter(r => r[2]).length} tied to ESPN ids) · ${read} files read`);
  return P;
}
