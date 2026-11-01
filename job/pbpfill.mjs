/* MODE=pbpfill (Nov 1 — Oct 31, 10:13 pm, quoting the three draft-model inputs to test: "testing these would also be good", answering
   "Say 'test them' and I'll fill the past seasons, then test each one the same way: the 17 drafts, with each draft held out in turn.
   Nothing changes on the board without your yes."):
   the college play-by-play fields the job has built since Oct 31 (cgmAcc in the pages: fsc, drv, duo, ks — first scores, drives, QB →
   receiver pairs, kicks) added to PAST seasons' p<Y>_pbp packs, which were built before those fields existed. The NFL job's add-onto-the-
   pack way (job/nfl.mjs, DONE.ts: "already has … left as it is"), not a rebuild:
   - a season whose pack already has all four is left alone; a season with no p<Y>_pbp pack is skipped (nothing to add onto);
   - everything already in a pack is kept exactly as it was — the page checks it, and this file checks it again against the pack as it
     is on the site before uploading (sameExcept), and refuses a filled pack smaller than the one it replaces;
   - with it, a study-only pack p<Y>_study-rzt (red zone by player; for a season with no p<Y>_pbp, the QB → receiver pairs too) for the
     input test; admin and data job only (src/api/packs.js), nothing on the site reads it.
   Before the page, the same run keeps the whole of each season's CFBD play-by-play and game context as study packs (job/cfbarchive.mjs).

   How: the job opens the Lab page in builder mode (?builder=pbpfill) and hands it one season at a time (window.__PBPFILL, pbpFillSeason in
   public/lab/index.html). The page reads the same CFBD answers builderQB reads, through api() → apiFin, so answers kept as builder-cache
   packs (p{year}_bc-api1-{hash}) cost 0 calls; any it has to fetch are kept the same way (BC_NEW) and uploaded here.

   Budget: BUDGET CFBD calls for the whole run (the owner's job budget: under 6,000) and the prefetch floor (4,000 left this month); the count left
   is read before every season, and a season whose upper-bound estimate would cross either is not started.

   PBPFILL_DRY=1 (the run's dry box): no browser and no CFBD call — reads the pack index and each season's p<Y>_pbp, and lists the seasons,
   whether each has the fields, its pack size, and the CFBD calls it would cost (each path not kept as a pack: at most 1, 0 if the proxy
   kept it). */
import { gzipSync } from "node:zlib";
import { bcPackName } from "./prefetch.mjs";

export const FIELDS = ["fsc", "drv", "duo", "ks"];
/* Oct 31 10:45 pm (via the coordinator): up to 15,000 CFBD calls for this job (the archive and the fill together), and the month never
   under 40,000 left — other study runs share the pool tonight */
export const BUDGET = 15000, FLOOR = 40000;
export const rztName = y => `p${y}_study-rzt`;
/* the page's CATS (seasonStats) and HIST: the last HIST seasons also read the season stat file, as the weekly run's pbpIndex has it */
export const CATS = ["passing", "rushing", "receiving", "fumbles"], HIST = 5;
/* the weeks of a season's /plays the page asks for when /games isn't kept yet (16 regular + 1 postseason, prefetch's list) */
export const WEEKS_GUESS = 17;

export const hasFields = pk => !!(pk && pk.pbp && typeof pk.pbp === "object") && FIELDS.every(k => pk.pbp[k] != null);

/* true when every key the old pack had (top level and inside pbp) is unchanged in the new one, and the new one only adds keys inside pbp */
export function sameExcept(old, neu) {
  if (!old || !neu || !old.pbp || !neu.pbp) return false;
  const J = JSON.stringify;
  for (const k of Object.keys(old)) if (k !== "pbp" && J(old[k]) !== J(neu[k])) return false;
  for (const k of Object.keys(neu)) if (!(k in old)) return false;
  for (const k of Object.keys(old.pbp)) if (J(old.pbp[k]) !== J(neu.pbp[k])) return false;
  return true;
}

/* "2014-2025", "2014,2016", "" (= 2014 to last season) */
export function parseSeasons(s, cur) {
  const out = new Set(); s = String(s || "").trim();
  if (!s) { for (let y = 2000; y < cur; y++) out.add(y) }
  for (const part of s.split(/[,\s]+/).filter(Boolean)) { const m = /^(\d{4})(?:-(\d{4}))?$/.exec(part); if (!m) continue; const a = +m[1], b = +(m[2] || m[1]); for (let y = Math.min(a, b); y <= Math.max(a, b); y++) out.add(y) }
  return [...out].filter(y => y >= 2000 && y < cur).sort((a, b) => a - b);
}

/* the weeks the page asks for, from /games (pbpFillSeason, builderQB) */
export const weeksOf = G => [...new Set((G || []).filter(g => g.completed !== false).map(g => (g.seasonType === "postseason" ? "p" : "r") + g.week))];

/* every CFBD path pbpFillSeason asks for in season y, written as the page writes them (same string → same builder-cache pack) */
export function seasonPaths(y, cur, games) {
  const L = [`/games?year=${y}&seasonType=both`, `/drives?year=${y}`, `/roster?year=${y}`];
  if (y >= cur - HIST + 1) for (const c of CATS) L.push(`/stats/player/season?year=${y}&seasonType=regular&category=${c}`);
  if (games) for (const w of weeksOf(games)) L.push(`/plays?year=${y}&week=${w.slice(1)}&seasonType=${w[0] === "p" ? "postseason" : "regular"}`);
  return L;
}

/* the plan, from the pack index and each season's pack (getPack(name) → JSON or null): which seasons, what each has, what it would cost */
export async function planFill({ seasons, idx, getPack, cur }) {
  const out = [];
  for (const y of seasons) {
    const name = `p${y}_pbp`, e = idx && idx[name], rzt = !!(idx && idx[rztName(y)]);
    const s = { y, name, packKB: e ? Math.round(e.bytes / 1024) : null, rzt, has: false, todo: false, paths: 0, kept: 0, est: 0, weeks: null, keys: [], noPack: !e };
    if (!e && rzt) { s.why = "no p" + y + "_pbp pack; red-zone study pack already there"; out.push(s); continue }
    if (e) { let pk = null; try { pk = await getPack(name) } catch { }
      if (!pk || !pk.pbp) { s.why = "pack didn't load"; out.push(s); continue }
      s.keys = Object.keys(pk.pbp); s.jsonKB = Math.round(JSON.stringify(pk).length / 1024); s.has = hasFields(pk);
      if (s.has && rzt) { s.why = "already has fsc, drv, duo, ks — left as it is"; out.push(s); continue } }
    s.todo = true;
    const gName = bcPackName(`/games?year=${y}&seasonType=both`, cur);
    let G = null; if (idx[gName]) { try { const g = await getPack(gName); G = g && g.v } catch { } }
    const P = seasonPaths(y, cur, G); s.weeks = G ? weeksOf(G).length : null;
    s.paths = P.length + (G ? 0 : WEEKS_GUESS); s.kept = P.filter(p => idx[bcPackName(p, cur)]).length;
    s.est = s.paths - s.kept;
    out.push(s);
  }
  return out;
}
export const planLine = s => `${s.y}: ${s.packKB == null ? "no p" + s.y + "_pbp pack" : `p${s.y}_pbp ${s.packKB} KB gz${s.jsonKB ? ` (${s.jsonKB} KB JSON)` : ""}, has ${s.keys.join(", ") || "—"}`}` +
  (s.todo ? ` · to fill${s.noPack ? " (nothing to add onto: red-zone study pack only, with the QB→receiver pairs)" : s.has ? " (fields there; red-zone study pack only)" : ""} · ${s.paths} CFBD paths${s.weeks == null ? ` (weeks unknown until /games: ${WEEKS_GUESS} assumed)` : ` (${s.weeks} weeks)`}, ${s.kept} kept as packs → at most ${s.est} CFBD calls (0 for any the proxy kept)` : ` · ${s.why}`);

/* the run: page = a Playwright page on /lab/?builder=pbpfill with window.__PBPFILL ready. left() → CFBD calls left this month (or null);
   getPack(name) → the pack as it is on the site; putPack(name, gz) → { sha, bytes }; putIndex(entries) writes the pack index once, at the end. */
export async function runFill({ page, plan, idx, left, getPack, putPack, putIndex, deadline, log = console.log, budget = BUDGET, floor = FLOOR, used0 = 0 }) {
  const C = { cf: 0, kept: 0 };
  const onResp = r => { try { const u = new URL(r.url()); if (!/\/cfbd$/.test(u.pathname) || !u.searchParams.get("path") || u.searchParams.get("path") === "/info") return; if (r.headers()["x-kept"]) C.kept++; else C.cf++ } catch (e) { } };
  page.on("response", onResp);
  const IX = {}, R = { seasons: [], calls: 0, stop: null, uploaded: 0, kb: 0, bc: 0 };
  let start = null;
  try {
    for (const s of plan) {
      if (!s.todo) { R.seasons.push({ y: s.y, skip: s.why }); continue }
      if (deadline && Date.now() > deadline) { R.stop = "out of time"; break }
      const l = await left(); if (l == null) { R.stop = "couldn't read CFBD calls left"; break }
      if (start == null) start = l;
      const used = used0 + Math.max(R.calls, start - l);
      if (used + s.est > budget) { R.stop = `the run's budget: ${used} used, ${s.y} could take ${s.est}, budget ${budget}`; break }
      if (l - s.est < floor) { R.stop = `CFBD calls left ${l.toLocaleString()}, ${s.y} could take ${s.est}, floor ${floor.toLocaleString()}`; break }
      const b0 = C.cf, t0 = Date.now();
      let r; try { r = await page.evaluate(y => window.__PBPFILL(y), s.y) } catch (e) { r = { y: s.y, err: e.message } }
      const calls = C.cf - b0; R.calls += calls;
      const row = { y: s.y, calls, line: r && r.line, skip: r && r.skip, err: r && r.err, packs: [] };
      if (r && r.names) for (const name of r.names) {
        const txt = await page.evaluate(n => { const v = window.__PACKS[n]; delete window.__PACKS[n]; return v ? JSON.stringify(v) : null }, name);
        if (!txt) { row.err = `${name} couldn't be read out of the page`; continue }
        if (/_pbp$/.test(name)) {
          /* checked again here against the pack as it is on the site: only the new fields added, nothing else changed */
          const neu = JSON.parse(txt), old = await getPack(name).catch(() => null);
          if (!hasFields(neu) || !sameExcept(old, neu)) { row.err = `${name}: the filled pack doesn't match the one on the site outside the new fields — not uploaded`; continue }
        }
        const gz = gzipSync(Buffer.from(txt)), was = idx && idx[name] && idx[name].bytes;
        if (was && gz.length < was) { row.err = `${name}: ${gz.length} bytes, smaller than the ${was} it replaces — not uploaded`; continue }
        let u; try { u = await putPack(name, gz) } catch (e) { row.err = `${name} upload failed: ${e.message}`; continue }
        IX[name] = { sha: u.sha, bytes: u.bytes, at: Date.now() }; R.uploaded++; R.kb += gz.length / 1024; row.packs.push(`${name} ${Math.round(gz.length / 1024)} KB${was ? ` (was ${Math.round(was / 1024)} KB)` : " (new)"}`);
      }
      /* answers the page fetched this season (BC_NEW) are dropped, not uploaded as builder-cache packs: the proxy keeps each one already and
         the study archive has them in full, so a third copy would only add storage (later builds read the proxy's copy for 0 calls) */
      R.bc += await page.evaluate(() => { try { const n = Object.keys(BC_NEW).length; for (const k of Object.keys(BC_NEW)) delete BC_NEW[k]; return n } catch (e) { return 0 } });
      row.sec = Math.round((Date.now() - t0) / 1000); R.seasons.push(row);
      log(`[pbpfill] ${s.y}: ${row.err ? "ERROR " + row.err : row.skip ? "skipped: " + row.skip : row.packs.join(", ")} · ${calls} CFBD call${calls === 1 ? "" : "s"} · ${row.sec}s`);
    }
  } finally {
    page.off("response", onResp);
    if (Object.keys(IX).length) { try { await putIndex(IX) } catch (e) { log(`[pbpfill] pack index write FAILED (${Object.keys(IX).length} packs uploaded but not listed): ${e.message}`); R.indexFailed = true } }
  }
  R.packs = Object.keys(IX).length; R.proxyKept = C.kept;
  return R;
}
