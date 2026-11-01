/* MODE=study (Nov 1, 2026): pattern hunt 3's college pulls — STUDY ONLY, nothing here is written to the site's packs or shown on it.
   Sam, Oct 31 10:25 pm, on the study call budget: "as long as you make them worth it and dive through literally everything i do not care".

   What it does
   - Reads CFBD through the site's proxy (/api/cfbd, with the run's probe sign-in, so answers the proxy already keeps cost no call) and
     CBBD through the basketball door (/api/job/cbbd, job token). Path strings for plays, box scores, rosters, recruits and player
     stats are written exactly as the page's builders and job/prefetch.mjs write them, so already-kept answers are reused.
   - Keeps every answer it pulls (Sam, Oct 31 10:45 pm: "absorb as much information as you can and keep it even if we arent using it to
     examine it again for these oddities and stats we are finding"): one study-only archive pack per batch and season,
     p<season>_study-<cfb|cbb>-<batch> (p2000_ when the answer has no season; -2, -3 … when one season passes 22 MB gzipped), holding
     { study: { v: 1, source, batch, season, at, answers: { "<path>": <the answer exactly as sent> } } }. The admin and the data job only
     (src/api/packs.js, _study-), never read by a page. Plays are left to the play-by-play archive (another job), so cf_plays is not archived.
   - For the analysis, each batch also goes to study-data/ on the runner's own disk (gone when the run ends); the workflow's next steps
     run job/study3/*.py (published from cfb-board docs/research/patternhunt3/) and print only results, as notices. This repo is public,
     so no raw data goes into the run's output.
   - What the site stores anyway: the proxy keeps every finished-season answer under 20 MB in its KV for good (src/cfbd.js, "past:cfbd"),
     for every caller. The notices give, per batch, how many answers were new to KV and their size.
   - Budget: before each batch the pool's calls-left is read (/info, free). A batch is skipped when calls-left minus the batch's size would
     go under STUDY_FLOOR (default 46,000: 40,000 kept for the site's own runs + 6,000 for another job tonight), or when this run's calls
     would pass STUDY_CAP (default 20,000). Calls used per batch = the counter before minus after (CFBD and CBBD share one pool).
   - GitHub keeps 10 notices a step, 4,096 characters each (measured Nov 1, t_echo), so the batch lines and the field list are packed
     into a few notices.
   STUDY = comma list of batch names (empty = all). */
import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const W16 = R(1, 16);
/* compact rows for the two big ones */
const playRow = p => [p.gameId, p.driveId, p.offense, p.defense, p.home, p.offenseScore, p.defenseScore, p.period,
  p.clock ? (p.clock.minutes || 0) * 60 + (p.clock.seconds || 0) : null, p.yardsToGoal ?? p.yardline, p.down, p.distance, p.yardsGained, p.playType,
  p.ppa ?? null, p.scoring ? 1 : 0, p.offenseConference ?? null, p.defenseConference ?? null];
export const PLAY_COLS = ["gameId", "driveId", "offense", "defense", "home", "offenseScore", "defenseScore", "period", "clockSec", "yardsToGoal", "down",
  "distance", "yardsGained", "playType", "ppa", "scoring", "offenseConference", "defenseConference"];
const KEEP_CAT = new Set(["passing", "rushing", "receiving", "defensive", "interceptions", "fumbles"]);
const boxRows = L => { const out = [];
  for (const g of L || []) for (const t of g.teams || []) { const A = {};
    for (const c of t.categories || []) { if (!KEEP_CAT.has(c.name)) continue;
      for (const ty of c.types || []) for (const a of ty.athletes || []) { const x = A[a.id] || (A[a.id] = { n: a.name, s: {} }); x.s[c.name + "." + ty.name] = a.stat } }
    for (const [id, x] of Object.entries(A)) out.push([g.id, t.team ?? t.school, t.conference ?? null, t.homeAway ?? null, t.points ?? null, id, x.n, x.s]) }
  return out };

export function batches(cur) {
  /* every batch is written one season per file (memory stays small); cf_info and bb_coaches have no season and go in one file */
  const C = (name, paths, opt = {}) => ({ name, api: "cfbd", paths, perYear: true, ...opt }), B = (name, items, opt = {}) => ({ name, api: "cbbd", items, perYear: true, ...opt });
  const cbbRanges = y => { const L = []; let a = Date.UTC(y - 1, 10, 1); const end = Date.UTC(y, 3, 15);
    while (a <= end) { const b = Math.min(a + 30 * 864e5, end); L.push([new Date(a).toISOString().slice(0, 10), new Date(b).toISOString().slice(0, 10)]); a = b + 864e5 } return L };
  return [
    C("cf_info", ["/conferences", "/coaches?minYear=2000&maxYear=" + cur]),
    C("cf_teams", R(2004, cur).map(y => `/teams/fbs?year=${y}`)),
    C("cf_games", R(2004, cur).map(y => `/games?year=${y}&seasonType=both`)),
    C("cf_lines", R(2004, cur).map(y => `/lines?year=${y}&seasonType=regular`)),
    C("cf_records", R(2004, cur).map(y => `/records?year=${y}`)),
    C("cf_srs", R(2004, cur).map(y => `/ratings/srs?year=${y}`)),
    C("cf_sp", R(2004, cur).map(y => `/ratings/sp?year=${y}`)),
    C("cf_talent", R(2015, cur).map(y => `/talent?year=${y}`)),
    C("cf_rteams", R(2002, cur).map(y => `/recruiting/teams?year=${y}`)),
    C("cf_recruits", R(2002, cur).map(y => `/recruiting/players?year=${y}&classification=HighSchool`)),
    C("cf_roster", R(2011, cur).map(y => `/roster?year=${y}`)),
    C("cf_portal", R(2021, cur).map(y => `/player/portal?year=${y}`)),
    C("cf_tstats", R(2004, cur).map(y => `/stats/season?year=${y}`)),
    C("cf_adv", R(2014, cur).map(y => `/stats/season/advanced?year=${y}`)),
    C("cf_pstats", R(2004, cur).flatMap(y => ["passing", "rushing", "receiving", "defensive", "interceptions", "fumbles"].map(c => `/stats/player/season?year=${y}&category=${c}`))),
    C("cf_ppa", R(2014, cur).map(y => `/ppa/players/season?year=${y}`)),
    C("cf_usage", R(2013, cur).map(y => `/player/usage?year=${y}`)),
    C("cf_box", R(2004, cur).flatMap(y => [...W16.map(w => `/games/players?year=${y}&week=${w}&seasonType=regular`), `/games/players?year=${y}&week=1&seasonType=postseason`]),
      { compact: boxRows, perYear: true, stopEmpty: true }),
    C("cf_plays", R(2014, cur).flatMap(y => [...W16.map(w => `/plays?year=${y}&week=${w}&seasonType=regular`), `/plays?year=${y}&week=1&seasonType=postseason`]),
      { compact: L => (L || []).map(playRow), perYear: true, stopEmpty: true, archive: false }),
    B("bb_stats", R(2008, cur + 1).map(y => ["/stats/player/season", { season: y }])),
    B("bb_roster", R(2008, cur + 1).map(y => ["/teams/roster", { season: y }])),
    B("bb_recruits", R(2007, cur + 1).map(y => ["/recruiting/players", { year: y }])),
    B("bb_portal", R(2019, cur + 1).map(y => ["/recruiting/portal", { year: y }])),
    B("bb_srs", R(2008, cur + 1).map(y => ["/ratings/srs", { season: y }])),
    B("bb_coaches", [["/coaches", { season: cur + 1 }], ["/coaches", { season: cur }]]),
    B("bb_games", R(2008, cur + 1).flatMap(y => cbbRanges(y).map(([a, b]) => ["/games", { season: y, startDateRange: a, endDateRange: b }]))),
    /* Nov 1 follow-up (home edge by game type, Sam 9:32 am): AP polls for both sports, basketball closing lines */
    C("cf_rankings", R(2004, cur).map(y => `/rankings?year=${y}&seasonType=regular`)),
    B("bb_rankings", R(2008, cur + 1).map(y => ["/rankings", { season: y }])),
    B("bb_lines", R(2014, cur + 1).flatMap(y => cbbRanges(y).map(([a, b]) => ["/lines", { season: y, startDateRange: a, endDateRange: b }]))),
  ];
}

/* the field list of one answer row (names, with nested names one level down and a short value), for writing the analysis */
const shape = x => { if (x == null || typeof x !== "object") return JSON.stringify(x)?.slice(0, 24);
  if (Array.isArray(x)) return "[" + (x.length ? shape(x[0]) : "") + "]";
  return "{" + Object.entries(x).map(([k, v]) => k + ":" + (v && typeof v === "object" ? (Array.isArray(v) ? "[" + (v.length && typeof v[0] === "object" ? Object.keys(v[0]).join("|") : "") + "]" : "{" + Object.keys(v).join("|") + "}") : JSON.stringify(v)?.slice(0, 18))).join(",") + "}" };
const pack = (L, max) => { const out = []; let s = ""; for (const x of L) { if ((s + x).length > 3900) { out.push(s); s = "" } s += x + " ‖ " } if (s) out.push(s); return out.slice(0, max) };
export async function runStudy({ site, token, job, log = console.log, out = "study-data", archive = process.env.STUDY_ARCHIVE !== "0" }) {
  const want0 = String(process.env.STUDY || "").split(",").map(s => s.trim()).filter(Boolean);
  /* "noarchive" in STUDY: an analysis rerun — the answers are already kept, so no study packs are written again */
  if (want0.includes("noarchive")) archive = false;
  /* "fromarchive": a batch already kept as study packs is read back from them (no CFBD/CBBD call); "focus:<name>" tells the analysis
     which part to run (job/study3/run.py) */
  const fromArchive = want0.includes("fromarchive"), focus = (want0.find(x => x.startsWith("focus:")) || "").slice(6) || null;
  const want = want0.filter(x => x !== "noarchive" && x !== "fromarchive" && !x.startsWith("focus:"));
  const FLOOR = +process.env.STUDY_FLOOR || 46000, CAP = +process.env.STUDY_CAP || 20000;
  const now = new Date(), cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;   // the proxy's season (src/cfbd.js)
  const H = { headers: { Authorization: "Bearer " + token } }, sleep = ms => new Promise(z => setTimeout(z, ms));
  let lastLeft = null;
  const cfGet = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H);
        if (r.ok) { const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
          return { j, bytes: t.length, kept: !!r.headers.get("x-kept") || /^(hit|global)$/.test(r.headers.get("x-live-cache") || "") } }
        if (r.status === 400 || r.status === 404) return { j: null, status: r.status, err: (await r.text()).slice(0, 160) };
        if (r.status === 429) await sleep(20000) } catch (e) { } await sleep(2500 * (k + 1)) } return { j: null, status: 0, err: "failed 4 times" } };
  const bbGet = async ([path, params]) => { const q = new URLSearchParams({ path, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    for (let k = 0; k < 4; k++) { try { const r = await fetch(`${site}/api/job/cbbd?${q}`, { headers: { Authorization: "Bearer " + job } });
        const left = r.headers.get("x-calllimit-remaining"); if (left) lastLeft = +left;
        if (r.ok) { const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } return { j, bytes: t.length, kept: false } }
        if (r.status === 400 || r.status === 404) return { j: null, status: r.status, err: (await r.text()).slice(0, 160) };
        if (r.status === 429) await sleep(20000) } catch (e) { } await sleep(2500 * (k + 1)) } return { j: null, status: 0, err: "failed 4 times" } };
  const left = async () => { const r = await cfGet("/info"); return r.j && r.j.remainingCalls != null ? +r.j.remainingCalls : null };
  mkdirSync(out, { recursive: true });
  /* the archive packs: written as each season finishes; the pack index once at the end (back-to-back index writes drop entries — cfbpunt.mjs) */
  const IX = {}, ARCH = [];
  const putPack = async (name, obj) => { const gz = gzipSync(Buffer.from(JSON.stringify(obj)));
    for (let k = 0; k < 3; k++) { const r = await fetch(`${site}/api/pack/${name}`, { method: "PUT", body: gz, headers: { Authorization: "Bearer " + job, "x-encoding": "gzip", "Content-Type": "application/json" } });
      if (r.ok) { const j = await r.json(); IX[name] = { sha: j.sha, bytes: j.bytes, at: Date.now() }; ARCH.push([name, j.bytes]); return j.bytes } await sleep(3000 * (k + 1)) }
    throw new Error("PUT " + name + " failed") };
  const putArchive = async (b, y, answers) => { const keys = Object.keys(answers); if (!keys.length) return { n: 0, mb: 0 };
    const base = `p${y || 2000}_study-${b.api === "cfbd" ? "cfb" : "cbb"}-${b.name.replace(/^(cf|bb)_/, "")}`, meta = { v: 1, source: b.api, batch: b.name, season: y || null, at: Date.now() };
    /* one pack per season unless it passes 22 MB gzipped (the pack limit is 24 MB): then split the answers into parts */
    let groups = [keys]; for (let t = 0; t < 6; t++) { const sizes = groups.map(g => gzipSync(Buffer.from(JSON.stringify(Object.fromEntries(g.map(k => [k, answers[k]]))))).length);
      if (sizes.every(x => x < 22e6)) break; groups = groups.flatMap((g, i) => sizes[i] < 22e6 || g.length < 2 ? [g] : [g.slice(0, g.length >> 1), g.slice(g.length >> 1)]) }
    let n = 0, mb = 0; for (let i = 0; i < groups.length; i++) { const by = await putPack(base + (i ? "-" + (i + 1) : ""), { study: { ...meta, part: i + 1, parts: groups.length, answers: Object.fromEntries(groups[i].map(k => [k, answers[k]])) } }); n++; mb += by / 1e6 }
    return { n, mb } };
  const L0 = await left(); log(`study start: ${L0 != null ? L0.toLocaleString() : "?"} calls left in the pool · floor ${FLOOR.toLocaleString()} · cap ${CAP.toLocaleString()} this run`);
  const man = { started: Date.now(), left0: L0, floor: FLOOR, cap: CAP, focus, batches: [] };
  const getPackJ = async name => { try { const r = await fetch(`${site}/api/pack/${name}`, H); return r.ok ? await r.json() : null } catch (e) { return null } };
  let used = 0; const LINES = [], SCHEMA = {};
  for (const b of batches(cur).filter(b => !want.length || want.includes(b.name))) {
    const n = (b.paths || b.items).length, before = await left();
    if (before != null && before - n < FLOOR) { log(`::warning title=study ${b.name} skipped::${before} left − ${n} would pass the floor ${FLOOR}`); man.batches.push({ name: b.name, skipped: "floor" }); continue }
    if (used + n > CAP) { log(`::warning title=study ${b.name} skipped::this run's cap ${CAP} (used ${used})`); man.batches.push({ name: b.name, skipped: "cap" }); continue }
    const t0 = Date.now(), res = {}, raw = {}, errs = []; let kept = 0, fresh = 0, newKV = 0, bytes = 0, got = 0, rows = 0, packs = 0, packMB = 0;
    const arch = archive && b.archive !== false;
    const list = b.api === "cfbd" ? b.paths.map(p => [p, p]) : b.items.map(it => [it[0] + "?" + new URLSearchParams(Object.entries(it[1]).map(([k, v]) => [k, String(v)])), it]);
    const year = key => +((key.match(/[?&](?:year|season)=(\d{4})/) || [])[1] || 0);
    const flush = y => { const part = Object.fromEntries(Object.entries(res).filter(([k]) => !y || year(k) === y)); if (!Object.keys(part).length) return;
      const gz = gzipSync(Buffer.from(JSON.stringify({ v: 1, batch: b.name, cols: b.name === "cf_plays" ? PLAY_COLS : undefined, data: part })));
      writeFileSync(`${out}/${b.name}${y ? "_" + y : ""}.json.gz`, gz); for (const k of Object.keys(part)) delete res[k];
      if (arch) archQ.push(putArchive(b, y, Object.fromEntries(Object.keys(part).filter(k => k in raw).map(k => [k, raw[k]]))).then(r => { packs += r.n; packMB += r.mb }).catch(e => errs.push("archive " + b.name + " " + y + ": " + String(e.message || e).slice(0, 120))));
      for (const k of Object.keys(part)) delete raw[k] };
    const archQ = [];
    /* read back from the study archive when asked (and when the first season's pack is there); otherwise ask the API as usual */
    if (fromArchive && b.archive !== false) {
      const tag = `study-${b.api === "cfbd" ? "cfb" : "cbb"}-${b.name.replace(/^(cf|bb)_/, "")}`, years = [...new Set(list.map(([k]) => year(k)))];
      let okA = true, nA = 0;
      for (const y of years) { const p1 = await getPackJ(`p${y || 2000}_${tag}`); if (!p1 || !p1.study) { if (y === years[0]) { okA = false; break } continue }
        const A = { ...p1.study.answers }; for (let i = 2; i <= (p1.study.parts || 1); i++) { const pi = await getPackJ(`p${y || 2000}_${tag}-${i}`); if (pi && pi.study) Object.assign(A, pi.study.answers) }
        for (const [k, v] of Object.entries(A)) { got++; nA++; const c = b.compact ? b.compact(v) : v; if (Array.isArray(c)) rows += c.length; res[k] = c
          if (!SCHEMA[b.name] && Array.isArray(v) && v.length) SCHEMA[b.name] = shape(v[Math.min(5, v.length - 1)]) }
        flush(y) }
      if (okA) { const after = await left(); flush(0); const line = `${n} paths · read ${nA} answers from the study archive (no call) · pool ${before ?? "?"} → ${after ?? "?"} · ${rows} rows`;
        log(`study ${b.name}: ${line}`); LINES.push(`${b.name}: ${line}`); man.batches.push({ name: b.name, fromArchive: true, got: nA, rows, before, after, calls: 0 }); continue }
    }
    const doneYear = new Set(); let emptyRun = {};
    for (let i = 0; i < list.length; i += 3) {
      const chunk = list.slice(i, i + 3);
      const R3 = await Promise.all(chunk.map(([key, arg]) => (b.api === "cfbd" ? cfGet(arg) : bbGet(arg)).then(r => [key, r])));
      for (const [key, r] of R3) {
        if (r.j == null) { errs.push(`${key} → ${r.status} ${r.err || ""}`.slice(0, 200)); continue }
        got++; bytes += r.bytes; if (r.kept) kept++; else { fresh++; const y = year(key); if (b.api === "cfbd" && y && y < cur && r.bytes > 2 && r.bytes < 20e6) newKV += r.bytes }
        const v = b.compact ? b.compact(r.j) : r.j; if (Array.isArray(v)) rows += v.length; res[key] = v; if (arch) raw[key] = r.j
        if (!SCHEMA[b.name] && Array.isArray(r.j) && r.j.length) SCHEMA[b.name] = shape(r.j[Math.min(5, r.j.length - 1)]) }
      /* the season being played: stop asking for weeks that haven't happened */
      if (b.stopEmpty) { const y = year(chunk[0][0]); if (y === cur) { const empties = R3.filter(([k, r]) => /seasonType=regular/.test(k) && Array.isArray(r.j) && !r.j.length).length; emptyRun[y] = (emptyRun[y] || 0) + empties;
        if (emptyRun[y] >= 3) { const skip = list.slice(i + 3).filter(([k]) => year(k) === y && /seasonType=regular/.test(k)).map(([k]) => k); for (const k of skip) list.splice(list.findIndex(x => x[0] === k), 1) } } }
      /* per-season files for the big ones, so memory stays small */
      if (b.perYear) { const yNext = list[i + 3] ? year(list[i + 3][0]) : 0; for (const [k] of chunk) { const y = year(k); if (y !== yNext && !doneYear.has(y)) { flush(y); doneYear.add(y) } } }
    }
    flush(0); await Promise.all(archQ);
    const after = await left(), calls = before != null && after != null ? before - after : fresh;
    used += calls;
    const line = `${n} asked · ${got} answered · ${kept} already kept (no call) · ${fresh} fresh · pool ${before ?? "?"} → ${after ?? "?"} = ${calls} calls · ${rows ? rows + " rows · " : ""}${(bytes / 1e6).toFixed(1)} MB read · ${(newKV / 1e6).toFixed(1)} MB newly kept in the site's KV by the proxy · ${arch ? `archived as ${packs} study packs, ${packMB.toFixed(1)} MB gzipped · ` : ""}${((Date.now() - t0) / 60e3).toFixed(1)} min${errs.length ? ` · ${errs.length} errors: ${errs.slice(0, 4).join(" | ")}` : ""}`;
    log(`study ${b.name}: ${line}`); LINES.push(`${b.name}: ${line}`);
    man.batches.push({ name: b.name, asked: n, got, kept, fresh, before, after, calls, rows, mb: +(bytes / 1e6).toFixed(2), newKVmb: +(newKV / 1e6).toFixed(2), packs, packMB: +packMB.toFixed(2), errors: errs.slice(0, 20) });
  }
  /* the site's own packs the analysis needs (read only): basketball head coaches by team and season (ESPN, built by the basketball job) */
  for (const n of ["p2026_cbb-coaches"]) { try { const r = await fetch(`${site}/api/pack/${n}`, H); if (r.ok) writeFileSync(`${out}/site_${n}.json.gz`, gzipSync(Buffer.from(await r.text()))) } catch (e) { } }
  const L1 = await left(); man.left1 = L1; man.used = used; man.cbbdLeft = lastLeft;
  if (Object.keys(IX).length) { for (let k = 0; k < 3; k++) { const r = await fetch(`${site}/api/pack-index`, { method: "PUT", body: JSON.stringify(IX), headers: { Authorization: "Bearer " + job, "Content-Type": "application/json" } }); if (r.ok) break; await sleep(4000) } }
  man.archive = { packs: ARCH.length, mb: +(ARCH.reduce((a, x) => a + x[1], 0) / 1e6).toFixed(1), names: ARCH };
  log(`::notice title=study archive::${ARCH.length} study packs · ${man.archive.mb} MB gzipped · ${[...new Set(ARCH.map(x => x[0].replace(/^p\d{4}_/, "").replace(/-\d+$/, "")))].join(", ")}`.slice(0, 4000));
  pack(LINES, 4).forEach((x, i) => log(`::notice title=study batches ${i + 1}::${x}`));
  pack(Object.entries(SCHEMA).map(([k, v]) => `${k} ${v}`.slice(0, 1200)), 3).forEach((x, i) => log(`::notice title=study fields ${i + 1}::${x}`));
  writeFileSync(`${out}/manifest.json`, JSON.stringify(man, null, 1));
  log(`study done: ${used.toLocaleString()} calls this run · ${L1 != null ? L1.toLocaleString() : "?"} left · ${(man.batches.reduce((a, x) => a + (x.newKVmb || 0), 0)).toFixed(1)} MB newly kept in KV`);
  return { batches: man.batches.length, calls: used, keptMB: +man.batches.reduce((a, x) => a + (x.newKVmb || 0), 0).toFixed(1) };
}
