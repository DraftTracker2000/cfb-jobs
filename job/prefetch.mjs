/* MODE=prefetch (Oct 30 — Sam approved spending October's spare CollegeFootballData calls before the Nov 1 reset, Sat Oct 31 8 pm ET):
   finished-season CFBD answers pulled once and kept for good, so the features that need them later cost 0 calls.

   How: the job opens the Lab page in builder mode (?builder=prefetch) and hands it one path at a time (window.__PREFETCH). Each goes
   through the page's api() → apiFin, the same road every builder run takes, so the answer is saved as the builder-cache pack
   p{year}_bc-api1-{hash} (BC_NEW) and every later build reads it from there instead of CFBD. The proxy also keeps any finished-season
   answer under "past:cfbd<path>" (src/cfbd.js, Oct 24), so a path some run already asked for comes back marked X-Kept and costs 0 calls.

   Skips: a path whose pack is already in the pack index is never handed to the page (apiFin would read it back the same way: bcGet).
   Empty answers aren't kept by apiFin or the proxy, so a week CFBD has nothing for is asked again on every run (logged as "empty").

   Floor: CFBD calls left this month are read (/info, through the proxy, not counted by the site's counter) before the first CFBD call and
   again after every CHECK_EVERY calls; between readings the calls this run spent are subtracted. The run stops before any call that
   would take the count under FLOOR (4,000 — the Saturday reserve in docs/research/transfers-and-api-plan.md, section D), and stops if
   the count can't be read at all.

   PREFETCH_DRY=1: no browser and no CFBD call — lists every path, how many are already kept as packs, and what a run would ask for. */
import { gzipSync } from "node:zlib";

export const FLOOR = 4000, CHECK_EVERY = 10;

/* the page's apiHash / apiFinY / bcName (public/lab/index.html, "function apiHash"), so the job can tell from the pack index alone
   which answers are already kept. tests/run.mjs checks these against the page's own code. */
export function apiHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }
export const API_FIN_V = 1;
export function apiFinY(p, cur) { if (/^\/(info|live|scoreboard)/.test(p) || /minYear|maxYear|startYear|endYear/.test(p)) return 0; const m = String(p).match(/[?&]year=(\d{4})(?!\d)/); const y = m ? +m[1] : 0; return y && y < cur && y >= 1990 ? y : 0 }
export const bcPackName = (p, cur) => { const y = apiFinY(p, cur); return y ? `p${y}_bc-api${API_FIN_V}-${apiHash(p)}` : null };
/* the page's season (CURYEAR): August 20 on is the new season */
export const pageSeason = (d = new Date()) => { const m = d.getMonth() + 1, dy = d.getDate(); return m > 8 || (m === 8 && dy >= 20) ? d.getFullYear() : d.getFullYear() - 1 };

const REG = Array.from({ length: 16 }, (_, i) => i + 1);
/* the list, in Sam's order. Path strings are written exactly as the page's builders write them, so an answer one of them already kept
   (same string → same hash → same pack) counts as kept:
     plays  /plays?year&week&seasonType — builderQB (lab "QB data … plays, week"), every finished season it covers
     gp     /games/players?year&week&seasonType — builderQB's play-by-play weeks (pbpAcc) and bowl box scores
     def    awYearLive0 (6 stat categories + records + final regular-season poll) and dgTestBuild (roster, high-school recruiting) */
export function prefetchPaths(cur) {
  const L = [], add = (g, y, path, tag) => { if (y < cur) L.push({ g, y, path, tag }) };
  for (let y = 2014; y <= 2025; y++) { for (const w of REG) add("plays", y, `/plays?year=${y}&week=${w}&seasonType=regular`, "r" + w); add("plays", y, `/plays?year=${y}&week=1&seasonType=postseason`, "p1") }
  for (let y = 2021; y <= 2025; y++) { for (const w of REG) add("gp", y, `/games/players?year=${y}&week=${w}&seasonType=regular`, "r" + w); add("gp", y, `/games/players?year=${y}&week=1&seasonType=postseason`, "p1") }
  for (let y = 2011; y <= 2025; y++) {
    for (const c of ["passing", "rushing", "receiving", "defensive", "interceptions", "fumbles"]) add("def", y, `/stats/player/season?year=${y}&category=${c}`, c);
    add("def", y, `/records?year=${y}`, "records"); add("def", y, `/rankings?year=${y}&seasonType=regular`, "rankings");
    add("def", y, `/roster?year=${y}`, "roster"); add("def", y, `/recruiting/players?year=${y}&classification=HighSchool`, "recruits") }
  return L.map(x => ({ ...x, pack: bcPackName(x.path, cur) }));
}
export const GROUP_NAME = { plays: "plays 2014–25 (tacklers stops, per-play grades)", gp: "games/players 2021–25 (per-game transfer grades)", def: "defender-grade pulls 2011–25" };

/* what's kept, per group and season: { plays: { n, kept, seasons: { 2014: { n, kept, todo: [tags] } } } } */
export function prefetchPlan(list, idx) {
  const P = {};
  for (const x of list) { const g = P[x.g] = P[x.g] || { n: 0, kept: 0, seasons: {} }, s = g.seasons[x.y] = g.seasons[x.y] || { n: 0, kept: 0, todo: [] };
    g.n++; s.n++; if (idx && idx[x.pack]) { g.kept++; s.kept++ } else s.todo.push(x.tag) }
  return P;
}
export function planLines(P) {
  const out = [];
  for (const [g, v] of Object.entries(P)) {
    const todo = Object.entries(v.seasons).filter(([, s]) => s.todo.length).map(([y, s]) => `${y}: ${s.todo.length === s.n ? "all " + s.n : s.todo.join(" ")}`);
    out.push({ g, n: v.n, kept: v.kept, line: `${GROUP_NAME[g] || g}: ${v.n} paths · ${v.kept} kept as packs · ${v.n - v.kept} to ask for${todo.length ? " — " + todo.join(" · ") : ""}` }) }
  return out;
}

/* the defender pulls are also kept in a built form by the builders that use them (awYear → p{y}_bc-aw4, 40 days; dgTestBuild → p{y}_bc-dgro1
   roster and p{y}_bc-dgrc1 recruits, 30 days). While those are fresh the builders don't ask for the raw answers, so the raw packs above can
   be missing even though the data is on file; this says which built ones exist and how old they are */
export function derivedLine(idx, from = 2011, to = 2025, now = Date.now()) {
  const out = [];
  for (const [k, ttl] of [["aw4", 40], ["dgro1", 30], ["dgrc1", 30]]) {
    const have = [], stale = [], none = [];
    for (let y = from; y <= to; y++) { const e = idx && idx[`p${y}_bc-${k}`]; if (!e) none.push(y); else if (e.at && now - e.at > ttl * 864e5) stale.push(y); else have.push(y) }
    out.push(`${k}: ${have.length} fresh${stale.length ? ` · ${stale.length} past ${ttl} days (${stale.join(" ")})` : ""}${none.length ? ` · none for ${none.join(" ")}` : ""}`) }
  return "built defender packs (not counted above): " + out.join(" · ");
}

/* the run: page = a Playwright page already on /lab/?builder=prefetch with window.__PREFETCH ready.
   left() → CFBD calls left this month (or null); putPack(name, gzBuffer) → { sha, bytes }; putIndex(entries) → writes the pack index once. */
export async function runPrefetch({ page, list, idx, left, putPack, putIndex, deadline, log = console.log, floor = FLOOR, every = CHECK_EVERY }) {
  /* every answer the page gets from the proxy: X-Kept = the proxy's kept copy of a finished season (no CFBD call), otherwise one CFBD call */
  const C = { cf: 0, kept: 0 };
  const onResp = r => { try { const u = new URL(r.url()); if (!/\/cfbd$/.test(u.pathname) || !u.searchParams.get("path") || u.searchParams.get("path") === "/info") return;
    if (r.headers()["x-kept"]) C.kept++; else C.cf++ } catch (e) { } };
  page.on("response", onResp);
  const IX = {}, S = { stored: 0, fetched: 0, proxyKept: 0, empty: 0, errors: 0, calls: 0, uploaded: 0, kb: 0, perGroup: {} }, done = [];
  let last = null, since = 0, stop = null, errRun = 0;
  const G = g => S.perGroup[g] = S.perGroup[g] || { stored: 0, fetched: 0, proxyKept: 0, empty: 0, errors: 0, calls: 0 };
  try {
    for (const x of list) {
      const g = G(x.g);
      if (idx && idx[x.pack]) { S.stored++; g.stored++; log(`[prefetch] ${x.path} · already kept (${x.pack}) · 0 calls`); continue }
      if (deadline && Date.now() > deadline) { stop = "out of time"; break }
      if (last == null || since >= every) { last = await left(); since = 0; if (last == null) { stop = "couldn't read CFBD calls left"; break } log(`[prefetch] CFBD calls left this month: ${last.toLocaleString()}`) }
      if (last - since - 1 < floor) { stop = `CFBD calls left ${(last - since).toLocaleString()}, floor ${floor.toLocaleString()}`; break }
      const b0 = { ...C }, t0 = Date.now();
      let r; try { r = await page.evaluate(p => window.__PREFETCH(p), x.path) } catch (e) { r = { err: e.message } }
      const used = C.cf - b0.cf, pk = C.kept - b0.kept; since += used; S.calls += used; g.calls += used;
      if (r && r.err) { S.errors++; g.errors++; errRun++; log(`[prefetch] ${x.path} · FAILED: ${String(r.err).slice(0, 200)} · ${used} call${used === 1 ? "" : "s"}`); if (errRun >= 5) { stop = "5 failures in a row"; break } continue }
      errRun = 0;
      const how = pk && !used ? "from the proxy's kept copy" : "fetched from CFBD";
      if (pk && !used) { S.proxyKept++; g.proxyKept++ } else { S.fetched++; g.fetched++ }
      if (!r.kept) { S.empty++; g.empty++; log(`[prefetch] ${x.path} · ${how} · empty, nothing kept · ${used} call${used === 1 ? "" : "s"}`); continue }
      /* out of the page right away (a season of plays held in the page all at once could run it out of memory), up as its own pack */
      const txt = await page.evaluate(n => { const v = BC_NEW[n]; delete BC_NEW[n]; return v ? JSON.stringify(v) : null }, r.name);
      if (!txt) { S.errors++; g.errors++; log(`[prefetch] ${x.path} · kept in the page but couldn't be read out`); continue }
      const gz = gzipSync(Buffer.from(txt)); let u;
      try { u = await putPack(r.name, gz) } catch (e) { S.errors++; g.errors++; log(`[prefetch] ${x.path} · upload failed: ${e.message}`); continue }
      IX[r.name] = { sha: u.sha, bytes: u.bytes, at: Date.now() }; S.uploaded++; S.kb += gz.length / 1024; done.push(x.path);
      log(`[prefetch] ${x.path} · ${how} · ${r.n.toLocaleString()} rows · kept as ${r.name} (${(gz.length / 1024).toFixed(0)} KB) · ${used} call${used === 1 ? "" : "s"} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  } finally {
    page.off("response", onResp);
    /* the pack index is written once, at the end (job/cfbpunt.mjs, Oct 28: writes seconds apart read a cached copy and drop each other's entries) */
    if (Object.keys(IX).length) { try { await putIndex(IX) } catch (e) { log(`[prefetch] pack index write FAILED (${Object.keys(IX).length} packs uploaded but not listed): ${e.message}`); S.indexFailed = true } }
  }
  return { ...S, stop, left: last == null ? null : last - since, packs: Object.keys(IX).length };
}
