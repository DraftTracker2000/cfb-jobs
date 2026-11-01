/* The college study archive (Nov 1 — Oct 31, 10:45 pm, on the play-by-play fill's call ceiling: "then get more out of this and absorb
   as much information as you can and keep it even if we arent using it to examine it again for these oddities and stats we are finding").
   Runs first in MODE=pbpfill (job/build.mjs), before the page adds the site-facing fields (job/pbpfill.mjs).

   For every season CFBD has play-by-play for (2001 on; the run checks 2000 and earlier come back empty), every answer CFBD gives for a
   season's plays, drives and game context, kept as CFBD sent it (every field, nothing trimmed, nothing deduplicated), gzipped, as study
   packs: admin and data job only (src/api/packs.js refuses "_study-" packs to anyone else and leaves them out of their pack index), never read
   by a public page.
     p<Y>_study-cfb-pbp-plays-<r|p><week>   { v, y, path, n, at, plays: [/plays?year&week&seasonType answer] } — one pack per week
     p<Y>_study-cfb-pbp-box                 { v, y, at, weeks: { "<r|p><week>": [/games/teams answer] } } — team box scores
     p<Y>_study-cfb-pbp-ctx                 { v, y, at, games, drives: {regular, postseason}, lines: {…}, weather: {…}, media: {…}, adv: {…},
                                          empty: [paths CFBD answered with nothing] } — /games (both), /drives, /lines, /games/weather,
                                          /games/media, /stats/game/advanced, regular and postseason
     p2000_study-cfb-pbp-manifest           { v, at, seasons: { <Y>: { packs: {name: bytes}, rows: {kind: n}, calls, done } }, how } — what's there
   Not kept: per-player box scores (/games/players, ~17 calls and ~30 MB a season) and per-play player stats (/plays/stats, one call per game,
   ~800 a season) — named for the owner, not fetched.

   Calls: through the site's CFBD proxy with the run's own sign-in. The proxy keeps every finished-season answer it has fetched once
   ("past:cfbd<path>", src/cfbd.js, since Oct 24) and answers it again with X-Kept for no call, so a path any run has already asked for costs
   0 (plays 2014–25 were asked for by the Oct 30–31 prefetch). Each season is one batch: calls left this month are read before it, the
   batch is not started if its upper bound would cross the run's budget or the month's floor, and the calls it used are logged. */
import { gzipSync } from "node:zlib";

export const V = 1, MAX_GZ = 24 * 1024 * 1024, FIRST = 2001;
export const SEASON_TYPES = ["regular", "postseason"];
export const studyName = (y, part) => `p${y}_study-cfb-pbp-${part}`;
export const MANIFEST = "p2000_study-cfb-pbp-manifest";

/* the weeks to read, from /games (the same rule the page's builders use) */
export const weeksOf = G => [...new Set((G || []).filter(g => g.completed !== false).map(g => (g.seasonType === "postseason" ? "p" : "r") + g.week))];
const st = w => w[0] === "p" ? "postseason" : "regular";
/* the season-level context paths; /games and /drives and /lines written as the page's builders write them, so a kept copy is shared */
export function ctxPaths(y) {
  return [
    ["games", null, `/games?year=${y}&seasonType=both`],
    ["drives", "regular", `/drives?year=${y}`], ["drives", "postseason", `/drives?year=${y}&seasonType=postseason`],
    ["lines", "regular", `/lines?year=${y}`], ["lines", "postseason", `/lines?year=${y}&seasonType=postseason`],
    ["weather", "regular", `/games/weather?year=${y}&seasonType=regular`], ["weather", "postseason", `/games/weather?year=${y}&seasonType=postseason`],
    ["media", "regular", `/games/media?year=${y}&seasonType=regular`], ["media", "postseason", `/games/media?year=${y}&seasonType=postseason`],
    ["adv", "regular", `/stats/game/advanced?year=${y}&seasonType=regular`], ["adv", "postseason", `/stats/game/advanced?year=${y}&seasonType=postseason`]];
}
export const playsPath = (y, w) => `/plays?year=${y}&week=${w.slice(1)}&seasonType=${st(w)}`;
export const boxPath = (y, w) => `/games/teams?year=${y}&week=${w.slice(1)}&seasonType=${st(w)}`;
/* the most calls a season can take: the context paths, and plays + box per week (weeks unknown until /games: 17 assumed) */
export const seasonMax = (y, weeks) => ctxPaths(y).length + 2 * (weeks == null ? 17 : weeks);
/* a season is done when the manifest says so and every pack it lists is in the pack index */
export const seasonDone = (man, idx, y) => { const s = man && man.seasons && man.seasons[y]; return !!(s && s.done && Object.keys(s.packs || {}).every(n => idx && idx[n])) };

/* cf(path) → { j, kept } (kept = the proxy's copy, no CFBD call) or throws; putPack(name, gz) → { sha, bytes } */
export async function archiveSeason({ y, cf, putPack, log = () => {} }) {
  const at = Date.now(), packs = {}, rows = {}, empty = [];
  let calls = 0;
  const get = async p => { const r = await cf(p); if (!r.kept) calls++; const j = r.j; if (j == null || (Array.isArray(j) && !j.length)) { empty.push(p); return null } return j };
  const put = async (name, obj) => { const gz = gzipSync(Buffer.from(JSON.stringify(obj))); if (gz.length > MAX_GZ) throw new Error(`${name} is ${(gz.length / 1048576).toFixed(1)} MB gzipped, over the 24 MB pack limit`);
    const u = await putPack(name, gz); packs[name] = { sha: u.sha, bytes: u.bytes || gz.length }; return gz.length };
  const ctx = { v: V, y, at, games: null, drives: {}, lines: {}, weather: {}, media: {}, adv: {}, empty };
  for (const [k, s, p] of ctxPaths(y)) { const j = await get(p); if (s) ctx[k][s] = j; else ctx[k] = j; if (j) rows[k] = (rows[k] || 0) + (Array.isArray(j) ? j.length : 1) }
  const W = weeksOf(ctx.games);
  if (!W.length) return { y, packs, rows, empty, calls, weeks: 0, noPlays: true };
  const box = { v: V, y, at, weeks: {} };
  let nPlays = 0;
  for (const w of W) {
    const P = await get(playsPath(y, w)); if (P) { nPlays += P.length; await put(studyName(y, "plays-" + w), { v: V, y, week: +w.slice(1), seasonType: st(w), path: playsPath(y, w), n: P.length, at, plays: P }) }
    const B = await get(boxPath(y, w)); if (B) { box.weeks[w] = B; rows.box = (rows.box || 0) + B.length }
  }
  rows.plays = nPlays;
  if (Object.keys(box.weeks).length) await put(studyName(y, "box"), box);
  await put(studyName(y, "ctx"), ctx);
  const kb = Object.values(packs).reduce((a, x) => a + x.bytes, 0) / 1024;
  log(`[archive] ${y}: ${W.length} weeks · ${nPlays.toLocaleString()} plays · ${Object.keys(packs).length} packs, ${(kb / 1024).toFixed(1)} MB gz · ${calls} CFBD calls · ${empty.length} empty answers`);
  return { y, packs, rows, empty, calls, weeks: W.length, noPlays: nPlays === 0, kb };
}

/* the run: seasons in order; left() → calls left this month (or null); budget = the run's own ceiling (shared with the fill after it);
   floor = calls the month must keep. Returns { seasons, calls, stop, index, manifest }. getPack(name) reads the manifest. */
export async function runArchive({ seasons, idx, cf, left, getPack, putPack, putIndex, budget, floor, used0 = 0, deadline, log = console.log }) {
  const R = { seasons: [], calls: 0, stop: null, packs: 0, mb: 0 };
  let man = null; try { man = await getPack(MANIFEST) } catch { }
  man = man && man.seasons ? man : { v: V, seasons: {} };
  man.how = "Study only (Sam, Oct 31 10:45 pm). One pack per thing per season, gzipped JSON, read with GET /api/pack/<name> as the admin or the data job (the job token's session). Names: p<Y>_study-cfb-pbp-plays-<r|p><week> (CFBD /plays, every field, as sent), p<Y>_study-cfb-pbp-box (/games/teams by week), p<Y>_study-cfb-pbp-ctx (/games, /drives, /lines, /games/weather, /games/media, /stats/game/advanced; regular and postseason). seasons[Y].packs lists each season's packs and gz bytes.";
  const IX = {};
  try {
    for (const y of seasons) {
      if (seasonDone(man, idx, y)) { R.seasons.push({ y, skip: "already archived" }); continue }
      if (deadline && Date.now() > deadline) { R.stop = "out of time"; break }
      const l = await left(); if (l == null) { R.stop = "couldn't read CFBD calls left"; break }
      const max = seasonMax(y, null), used = used0 + R.calls;
      if (used + max > budget) { R.stop = `the run's budget: ${used} used, ${y} could take ${max}, budget ${budget.toLocaleString()}`; break }
      if (l - max < floor) { R.stop = `CFBD calls left ${l.toLocaleString()}, ${y} could take ${max}, the month's floor ${floor.toLocaleString()}`; break }
      let a; try { a = await archiveSeason({ y, cf, putPack, log }) } catch (e) { R.seasons.push({ y, err: String(e && e.message || e).slice(0, 300), left: l }); log(`[archive] ${y}: ERROR ${e && e.message}`); R.stop = "error"; break }
      R.calls += a.calls;
      for (const [n, x] of Object.entries(a.packs)) IX[n] = { sha: x.sha, bytes: x.bytes, at: Date.now() };
      R.packs += Object.keys(a.packs).length; R.mb += (a.kb || 0) / 1024;
      man.seasons[y] = { packs: Object.fromEntries(Object.entries(a.packs).map(([n, x]) => [n, x.bytes])), rows: a.rows, weeks: a.weeks, empty: a.empty, calls: a.calls, at: Date.now(), done: true, noPlays: a.noPlays };
      R.seasons.push({ y, calls: a.calls, left: l, weeks: a.weeks, rows: a.rows, packs: Object.keys(a.packs).length, kb: a.kb, noPlays: a.noPlays, empty: a.empty.length });
    }
  } finally {
    if (Object.keys(IX).length || R.seasons.some(x => x.calls != null)) {
      man.at = Date.now();
      try { const gz = gzipSync(Buffer.from(JSON.stringify(man))), u = await putPack(MANIFEST, gz); IX[MANIFEST] = { sha: u.sha, bytes: u.bytes || gz.length, at: Date.now() } } catch (e) { log(`[archive] manifest upload failed: ${e.message}`); R.manifestFailed = true }
      try { await putIndex(IX) } catch (e) { log(`[archive] pack index write FAILED: ${e.message}`); R.indexFailed = true }
    }
  }
  R.manifest = man;
  return R;
}
