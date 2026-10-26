/* The scheduled data job. GitHub Actions runs this (see .github/workflows/data-job.yml).

   It opens the live board in a headless browser, signed in as the data job, and asks
   the board to build its data in "builder" mode — the same code, the same math, but
   with no per-visit limits, so every season's game logs are measured completely.
   The finished pieces are uploaded to the site and published as one new version.
   Every device then downloads that version instead of building its own.

   Modes
     live     this season's stats and games (Saturdays, Thu/Fri nights, Sunday)
     weekly   this season in full + recalibrate against history (Monday/Tuesday)
     history  rebuild everything from scratch (manual — after a model change, or once a year)
     views    this season + every past season's view (manual — quicker than history)
     qb       this season + the QB profile data (splits, spread, Clutch Gene) for every team, every season any view shows (2013 on)
     coaches  the COACHES tab's data (every head coach's stops, games, lines, polls, draftees and
              their NFL careers) → pack pYYYY_coaches, plus the availability pack it uses; ~10–20 min
     nfl      the NFL side from nflverse (job/nfl.mjs): games, players, this season's and last season's logs and play-by-play, depth charts,
              plus the coordinators from Wikipedia (job/staff.mjs); a few minutes; also runs with weekly
     nflhistory  the same for every season since 1999
     nfldraft    games started by every player, every season since 2001 (depth charts), and every team's draft classes graded (pack nfl-draft); ~10 min
     honors   the bowl / playoff / conference-title file for the team History picture (p1990_honors) → packs only, a few minutes
     extras   the small college files the game-day build also makes (value per play pYYYY_ppa, Trending's numbers pYYYY_ct) → packs only, a few minutes
     probe    single-feature checks in a browser (job/probes.mjs; PROBE picks them) → notices on the GitHub run, nothing written
     look     the look check only (job/look.mjs) on PAGE_PATH → notice on the run
     cdef     the college defense chart (every FBS team's defenders, from the charted plays) → packs only
     dgtest   defender draft-grade test (Lab): refits and blind-scores the grade → pYYYY_dgtest, packs only
     grtest   grade test (Lab, PAGE_PATH=/lab/): held-out draft accuracy of the lab grade vs the old one, and every player's BoardScore
              next to the live one → pYYYY_grtest, packs only
     oltest   the OL draft chance: every FBS lineman, refit and graded → pYYYY_oltest + pYYYY_olgrade, packs only (weekly, Wednesday)
     avail    NFL availability only (weekly roster status 2016 on → weeks active / injured / away), a few minutes; also runs with weekly and history

   Needs:  SITE_URL   e.g. https://yourdomain.com
           JOB_TOKEN  from the admin page (Data & updates → Job token)

   How the board and this job talk (the board side is added at the crossover —
   see docs/HOW-THIS-SITE-WORKS.md, "Builder mode"):
     page URL        /?builder=<mode>
     before build    window.__BUILDER_SEED(files)       ← the live version's files, so
                                                          history isn't fetched again
     while running   window.__BUILDER = { stage, progress }
     when finished   window.__BUILDER = { done:true, files:{name:data}, coverage:{year:0..1},
                                          finishedThrough, note }
     on failure      window.__BUILDER = { error:"…" }                                          */

import { gzipSync } from "node:zlib";
import { refreshRefs } from "./refs.mjs";
import { buildAvailability, uploadAvailability } from "./avail.mjs";
import { buildInjHist, uploadInjHist } from "./injhist.mjs";
import { buildInjImpact, uploadInjImpact } from "./injimpact.mjs";
import { buildCollegeAvail, uploadCollegeAvail } from "./cavail.mjs";
import { buildNfl } from "./nfl.mjs";
import { buildStaff } from "./staff.mjs";

const SITE = (process.env.SITE_URL || "").replace(/\/+$/, "");
const JOB = process.env.JOB_TOKEN || "";
/* a mode not on this list used to fall through to "live" — Oct 7, a "dgtest" run published a live build from the Lab page. Unknown now fails. */
const MODES = ["cavail", "look", "probe", "extras", "honors", "live", "weekly", "history", "views", "qb", "avail", "coaches", "cdef", "nfl", "nflhistory", "nfldraft", "dgtest", "oltest", "grtest", "colgap", "style"];
if (process.env.MODE && !MODES.includes(process.env.MODE)) { console.error("Unknown MODE " + process.env.MODE); process.exit(1) }
const MODE = process.env.MODE || "live";
const NOFRESH = ["probe", "look"].includes(MODE) || /test$/.test(MODE);
const PACKS_ONLY = ["extras", "honors", "coaches", "cdef", "dgtest", "oltest", "grtest"];   // these write packs only; the shared data version is unchanged
/* the Sunday-afternoon catch-up is a "live" run that also rebuilds this season's player files and the coaches/teams data,
   so it gets far longer than a game-day run */
const SUNDAY_CATCHUP = MODE === "live" && process.env.CATCHUP === "1";
const LIMIT_MIN = SUNDAY_CATCHUP ? 120 : { cavail: 10, probe: 40, extras: 30, honors: 30, live: 45, weekly: 150, history: 340, views: 200, qb: 120, avail: 30, coaches: 150, cdef: 90, dgtest: 60, oltest: 90, grtest: 60, nfl: 30, nflhistory: 120, nfldraft: 60, colgap: 150 }[MODE];
const PAGE = ["/", "/lab/"].includes(process.env.PAGE_PATH) ? process.env.PAGE_PATH : "/";                                  // the lab page (/lab/) can be used here to try a builder before it's pushed
const started = Date.now();

if (!SITE || !JOB) { console.error("SITE_URL and JOB_TOKEN are required"); process.exit(1) }

async function api(method, path, { body, token = JOB, headers = {}, raw } = {}) {
  const r = await fetch(SITE + path, { method, body: raw ? body : body && JSON.stringify(body),
    headers: { Authorization: "Bearer " + token, ...(body && !raw ? { "Content-Type": "application/json" } : {}), ...headers } });
  const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(j && j.message) || t.slice(0, 200)}`);
  return j;
}
const STAGES = {};
const stageLine = () => { const L = Object.entries(STAGES).filter(([, ms]) => ms >= 30e3).sort((a, b) => b[1] - a[1]).slice(0, 5); return L.length ? " · slowest: " + L.map(([k, ms]) => `${k} ${(ms / 60e3).toFixed(1)}m`).join(", ") : "" };
/* CollegeFootballData calls this run spent (Oct 8 audit: 23.8k of the 75k month used by the 9th, with nothing saying where they went):
   the calls-left counter read when the run signs in and again when it reports */
let CF0 = null, CFTOK = null;
let CFERR = "";
const cfbdLeft = async () => { if (!CFTOK) return null; try { const r = await fetch(SITE + "/.netlify/functions/cfbd?path=%2Finfo", { headers: { Authorization: "Bearer " + CFTOK } }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } if (!(j && j.remainingCalls != null)) CFERR = `${r.status} ${t.slice(0, 120)}`; return j && j.remainingCalls != null ? +j.remainingCalls : null } catch (e) { CFERR = e.message; return null } };
/* the run signs in again before reporting (a later sign-in, like the pack-index read, ends the first session) */
const report = async (ok, message, detail) => { if (CF0 != null) { try { CFTOK = (await api("POST", "/api/job/session")).token } catch { } }
  const left = CF0 != null ? await cfbdLeft() : null, used = left != null ? CF0 - left : null;
  /* Oct 20 (weekly check: "the football runs don't log their CFBD call counts"): the same numbers as a GitHub notice, next to the
     basketball job's. CFBD and CBBD share one monthly pool (Tier 3, 75,000, resets on the 1st), so both counters fall together. */
  if (used != null) console.log(`::notice title=CFBD::${MODE} run used ${used.toLocaleString()} CFBD calls · ${left.toLocaleString()} left this month (pool shared with CBBD)`);
  return api("POST", "/api/job/report", { body: { kind: MODE, ok, message: (message + (used != null ? ` · ${used.toLocaleString()} CFBD calls during the run (${left.toLocaleString()} left this month)` : CFERR ? ` · CFBD counter: ${CFERR}` : "") + stageLine()).slice(0, 1200), detail: { ...(detail || {}), cfbd: used != null ? { used, left } : undefined, stages: Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [k, Math.round(v / 1000)])) }, started } }).catch(e => console.error("report failed:", e.message)) };

async function main() {
  /* the NFL side: straight from nflverse's files (job/nfl.mjs) — its own runs, and part of the weekly refresh */
  if (MODE === "nfl" || MODE === "nflhistory" || MODE === "nfldraft" || MODE === "weekly") {
    const now = new Date(), curYear = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    let sess = null; try { sess = await api("POST", "/api/job/session") } catch { }
    const getPack = async n => { const r = await fetch(SITE + "/api/pack/" + n, { headers: { Authorization: "Bearer " + (sess && sess.token) } }); return r.ok ? r.json() : null };
    const getIndex = async () => { try { const r = await fetch(SITE + "/api/pack-index", { headers: { Authorization: "Bearer " + (sess && sess.token) } }); return r.ok ? (await r.json()).packs : null } catch { return null } };
    /* coordinators: Wikipedia's current lists, so in-season firings and next season's staffs come through by themselves */
    let STAFF = {};
    try { STAFF = await buildStaff(); if (Object.keys(STAFF).length >= 28) { const r = await api("PUT", "/api/job/nflstaff", { body: { teams: STAFF } }); console.log(`staff: ${r.changed.length ? r.changed.join("; ") : "no changes"}`) } }
    catch (e) { console.log("staff: " + e.message) }
    try {
      const r = await buildNfl({ api, getPack, curYear, all: MODE === "nflhistory", startsOnly: MODE === "nfldraft", staff: STAFF, getIndex });
      console.log(`nfl: ${r.packs} packs, ${r.mb.toFixed(1)} MB, seasons ${r.seasons[0]}–${r.seasons[r.seasons.length - 1]}, ${r.minutes.toFixed(1)} min`);
      if (r.held && r.held.length) console.log("nfl: held back (much smaller than last time): " + r.held.join(", "));
      if (MODE !== "weekly") { await report(!(r.held && r.held.length), `NFL · ${r.packs} packs · ${r.mb.toFixed(1)} MB · seasons ${r.seasons[0]}–${r.seasons[r.seasons.length - 1]}${r.held && r.held.length ? ` · HELD BACK (under 40% of last size): ${r.held.join(", ")}` : ""}`); return }
    } catch (e) { if (MODE !== "weekly") throw e; console.log("nfl: " + e.message) }
  }
  /* college availability reports (job/cavail.mjs): its own quick run Wednesday night to Saturday morning, and the start of every live run */
  if (MODE === "cavail" || MODE === "live") {
    const now = new Date(), season = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    try { const data = await buildCollegeAvail({}); const up = await uploadCollegeAvail({ api, season, data });
      const n = Object.values(data.t).reduce((a, x) => a + x.p.length, 0), msg = `college availability · ${Object.keys(data.t).length} teams · ${n} players listed · ${Object.entries(data.src).map(([k, v]) => k + " " + v).join(", ")} · ${(up.bytes / 1024).toFixed(0)} KB`;
      console.log(`::notice title=college availability::${msg} · ${Object.entries(data.t).slice(0, 4).map(([t, x]) => `${t} ${x.type} ${x.d} vs ${x.opp}: ${x.p.slice(0, 3).map(p => p[0] + " " + p[3]).join(", ")}`).join(" | ")}`); if (MODE === "cavail") { await report(!Object.values(data.src).every(v => /^error/.test(v)), msg); return } }
    catch (e) { if (MODE === "cavail") throw e; console.log("college availability: " + e.message) }
  }
  /* NFL availability (weekly roster status) — its own quick run, and part of weekly / history runs */
  if (MODE === "avail" || MODE === "weekly" || MODE === "history" || MODE === "coaches") {
    const now = new Date(), season = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    /* finished seasons are read once and kept (Oct 12): last run's pack supplies every season before this one */
    let prev = null; try { const ss = await api("POST", "/api/job/session"); const r = await fetch(SITE + `/api/pack/p${season}_availability`, { headers: { Authorization: "Bearer " + (ss && ss.token) } }); if (r.ok) { const j = await r.json(); prev = j && j.avail && j.avail.v === 2 ? j.avail.d : null } } catch { }
    const data = await buildAvailability({ to: season, prev });
    const up = await uploadAvailability({ api, season, data });
    console.log(`availability: ${up.name} uploaded (${(up.bytes / 1024).toFixed(0)} KB)`);
    /* injury history, week by week (Oct 23 — the mini profile's Injuries tab): finished seasons kept from the last pack */
    try { let pi = null; try { const ss = await api("POST", "/api/job/session"); const r = await fetch(SITE + `/api/pack/p${season}_injhist`, { headers: { Authorization: "Bearer " + (ss && ss.token) } }); if (r.ok) { const j = await r.json(); pi = j && j.injhist && j.injhist.v === 2 ? j.injhist : null } } catch { }
      /* games he left hurt need the game logs, and for the latest game ESPN's current injury list (the site's slimmed copy) */
      const ss2 = await api("POST", "/api/job/session"), getPackIH = async n => { const r = await fetch(SITE + "/api/pack/" + n, { headers: { Authorization: "Bearer " + (ss2 && ss2.token) } }); return r.ok ? r.json() : null };
      let espnNow = null; try { const r = await fetch(SITE + "/api/inj", { headers: { Authorization: "Bearer " + (ss2 && ss2.token) } }); if (r.ok) { const j = await r.json(); espnNow = {}; for (const [e, x] of Object.entries((j && j.r) || {})) if (x && x[1]) espnNow[e] = x[1] } } catch { }
      const ih = await buildInjHist({ to: season, prev: pi, getPack: getPackIH, nflSeason: now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, espnNow }); const u2 = await uploadInjHist({ api, season, data: ih });
      console.log(`injury history: ${u2.name} uploaded (${(u2.bytes / 1024).toFixed(0)} KB, ${ih.inj.length} injury names)`) } catch (e) { console.log("injury history: " + e.message) }
    /* what happens after an injury (Oct 24, job/injimpact.mjs): from the injury history and the NFL game logs, no CFBD calls */
    try { const ss = await api("POST", "/api/job/session"); const getPack = async n => { const r = await fetch(SITE + "/api/pack/" + n, { headers: { Authorization: "Bearer " + (ss && ss.token) } }); return r.ok ? r.json() : null };
      const nflSeason = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const ii = await buildInjImpact({ getPack, season, nflSeason }); const u3 = await uploadInjImpact({ api, season, data: ii });
      const top = Object.entries(ii.g).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, v]) => `${k} ${v[0]}× ${Math.round(100 * v[1])}% (fell off ${Math.round(100 * v[2])}%)`).join(" · ");
      console.log(`::notice title=injury impact::${u3.name} ${(u3.bytes / 1024).toFixed(0)} KB · ${Object.keys(ii.g).length} groups · no injury: ${JSON.stringify(ii.base)} · missed a season: ${JSON.stringify(ii.posAvg)} · ${Object.keys(ii.s || {}).length} players · ${top}`) } catch (e) { console.log(`::warning title=injury impact::${String(e && e.message || e).slice(0, 500)}`) }
    if (MODE === "avail") { await report(true, `availability · ${Object.keys(data).length} seasons · ${(up.bytes / 1024).toFixed(0)} KB`); return }
  }
  const { chromium } = await import("playwright"); const { lookCheck, lookMsg } = await import("./look.mjs");

  /* the big public files first, so the board's build can use them */
  const refs = await refreshRefs({ site: SITE, jobToken: JOB, mode: MODE });
  console.log(`reference files: ${refs.refreshed} refreshed of ${refs.checked}`);

  /* Oct 26: runs that only look (probe, look) or test (…test) sign in as the probe user, so their page loads share the server's copies
     of current-season CFBD data instead of paying fresh calls (src/cfbd.js) */
  const sess = await api("POST", "/api/job/session", { body: NOFRESH ? { who: "probe" } : undefined });
  console.log(`[${MODE}] signed in to ${SITE}`);
  CFTOK = sess.token; CF0 = await cfbdLeft(); if (CF0 != null) console.log(`::notice title=CFBD::calls left at the start of this ${MODE} run: ${CF0.toLocaleString()}`);

  /* MODE=colgap: college missed-game check from box scores (job/colgap.mjs, Oct 24) */
  if (MODE === "colgap") { const { buildColGap, uploadColGap } = await import("./colgap.mjs");
    let hand = []; try { hand = (await (await fetch(SITE + "/data/col-injuries.json")).json()).p || [] } catch { }
    let d; try { d = await buildColGap({ site: SITE, token: sess.token, hand }) } catch (e) { console.log(`::warning title=college gaps failed::${String(e && e.stack || e).slice(0, 3000)}`); throw e }
    let up = { bytes: 0 }; try { up = await uploadColGap({ api, data: d }) } catch (e) { console.log(`::warning title=college gaps upload failed::${String(e && e.message || e).slice(0, 1500)}`) }
    const n = Object.keys(d.p).length, gaps = Object.values(d.p).reduce((a, r) => a + r[2].length, 0);
    console.log(`::notice title=college gaps::${d.players} players · ${d.teamSeasons} team-seasons · ${d.calls} CFBD calls${d.stopped ? " (stopped early, budget)" : ""} · ${n} players with a missed stretch · ${gaps} stretches · ${(up.bytes / 1024).toFixed(0)} KB`);
    const C = d.check.map(c => `${c[0]} ${c[1]} (Sam ${c[2]}): ${c[3] ? `last played ${c[3][0]} vs ${c[3][1]}, missed ${c[3][2]}${c[3][3] ? " to season end" : ""}` : "no gap seen"}`);
    for (let i = 0, k = 0; i < C.length && k < 6; k++) { let s = ""; while (i < C.length && (s + C[i]).length < 5800) s += C[i++] + " | "; console.log(`::notice title=college gaps check ${k + 1}::${s}`) }
    console.log(`::notice title=college gaps unplaced::${d.miss.join(", ").slice(0, 5800)}`);
    await report(true, `college gaps · ${n} players · ${gaps} stretches · ${d.calls} calls`); return }
  /* style matchups (Oct 25, job/stylepack.mjs): every weekly run, or MODE=style by hand → pack p2000_cfbstyle */
  if (MODE === "style" || MODE === "weekly") { try { const { buildStyle } = await import("./stylepack.mjs"); const { gzipSync } = await import("node:zlib");
      const now = new Date(), y = now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, d = await buildStyle({ site: SITE, token: sess.token, year: y });
      const gz = gzipSync(Buffer.from(JSON.stringify({ cfbstyle: d }))), r = await api("PUT", "/api/pack/p2000_cfbstyle", { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
      await api("PUT", "/api/pack-index", { body: { p2000_cfbstyle: { sha: r.sha, bytes: r.bytes, at: Date.now() } } });
      console.log(`::notice title=style matchups::${Object.keys(d.t).length} teams through week ${d.wk} · ${d.calls} CFBD calls · ${(r.bytes / 1024).toFixed(0)} KB`) }
    catch (e) { console.log(`::warning title=style matchups failed::${String(e && e.stack || e).slice(0, 2000)}`); if (MODE === "style") throw e }
    if (MODE === "style") { await report(true, "style matchups"); return } }
  /* MODE=probe: single-feature checks in a browser (job/probe.mjs, job/probes.mjs), results as notices on the run; PROBE picks them */
  if (MODE === "probe") { const { runProbes } = await import("./probe.mjs"); const browser = await chromium.launch();
    try { await runProbes({ browser, site: SITE, token: sess.token, only: process.env.PROBE || "" }) } finally { await browser.close() } return }
  /* MODE=look: only the look check (job/look.mjs), on the page set by PAGE_PATH */
  if (MODE === "look") { const browser = await chromium.launch(); const L = await lookCheck({ browser, site: SITE, token: sess.token, page: PAGE }); await browser.close();
    await api("POST", "/api/job/report", { body: { kind: "look", ok: L.ok, message: lookMsg(L), detail: L } });
    /* Oct 11: also put the result on the run itself, so it can be read from GitHub without opening the site */
    console.log(`::${L.ok ? "notice" : "warning"} title=look ${PAGE}::${lookMsg(L).replace(/[\r\n]+/g, " ")}`); return }
  /* the live version's files seed the build, so unchanged history isn't downloaded again */
  let seed = {};
  if (MODE !== "history") {
    try {
      const meta = await api("GET", "/api/snap-meta", { token: sess.token });
      for (const name of Object.keys((meta && meta.files) || {})) {
        const r = await fetch(SITE + "/api/snap/" + name, { headers: { Authorization: "Bearer " + sess.token } });
        if (r.ok) seed[name] = await r.json();
      }
      console.log(`seeded from ${meta && meta.current || "nothing"} (${Object.keys(seed).length} files)`);
    } catch (e) { console.log("no live version to seed from:", e.message) }
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", e => console.log("page error:", e.message));
  const BLOG = []; page.on("console", m => { if (/^\[builder\]/.test(m.text())) { console.log(m.text()); if (BLOG.length < 400) BLOG.push(m.text()) } });
  await page.goto(SITE + "/404");                                     // any page on the site, to set storage
  await page.evaluate(t => { localStorage.clear(); localStorage.setItem("cfbTok", t) }, sess.token);
  await page.goto(`${SITE}${PAGE}?builder=${MODE}${SUNDAY_CATCHUP ? "&catchup=1" : ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__BUILDER_SEED === "function" || window.__BUILDER, null, { timeout: 120000 });
  await page.evaluate(s => window.__BUILDER_SEED && window.__BUILDER_SEED(s), seed);

  let lastStage = "";
  const deadline = Date.now() + LIMIT_MIN * 60e3;
  /* how long each stage takes (Sam, Oct 3: "how would we speed them up" — measure first): stage names grouped by what comes before
     a colon or a count ("Run detail 2026: 5 of 120" → "Run detail 2026"), timed to the 5-second poll */
  const grp = st => String(st || "").split(":")[0].replace(/\d+ of \d+/, "").trim() || "start";
  let gNow = "loading the board", gAt = Date.now();
  const tick = st => { const g = grp(st); if (g !== gNow) { STAGES[gNow] = (STAGES[gNow] || 0) + (Date.now() - gAt); gNow = g; gAt = Date.now() } };
  let B;
  for (;;) {
    B = await page.evaluate(() => window.__BUILDER || null);
    if (B && (B.done || B.error)) break;
    if (B && B.stage && B.stage !== lastStage) { lastStage = B.stage; tick(B.stage); console.log(`… ${B.stage}${B.progress != null ? ` (${Math.round(B.progress * 100)}%)` : ""}`) }
    if (Date.now() > deadline) { tick("(timed out)"); throw new Error(`Timed out after ${LIMIT_MIN} min at "${lastStage}"`); }
    await new Promise(r => setTimeout(r, 5000));
  }
  tick("(done)");
  if (B.error) throw new Error("Board reported: " + B.error);
  B = await page.evaluate(() => { const b = window.__BUILDER; return { fileNames: b.fileNames || [], packNames: b.packNames || [], coverage: b.coverage, finishedThrough: b.finishedThrough, note: b.note } });
  /* Oct 12: finished-season answers the page saved this run (BC_NEW, see apiFin) go up in every mode, so the next run reads them instead of CFBD */
  { const extra = await page.evaluate(() => { try { const P = window.__PACKS = window.__PACKS || {}; const L = []; for (const [k, v] of Object.entries(typeof BC_NEW === "object" ? BC_NEW : {})) if (!P[k]) { P[k] = v; L.push(k) } return L } catch (e) { return [] } });
    if (extra.length) { B.packNames = [...B.packNames, ...extra]; console.log(`saved for next runs: ${extra.length} finished-season answers`) } }

  /* files come out of the page one at a time (a whole build at once can be too big to hand over) */
  const version = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + MODE;   // e.g. 20260926T1430-live
  const names = B.fileNames;
  if (!names.length && !PACKS_ONLY.includes(MODE)) throw new Error("The board finished but produced no files");
  let bytes = 0;
  for (const name of names) {
    const txt = await page.evaluate(n => JSON.stringify(window.__FILES[n]), name);
    const gz = gzipSync(Buffer.from(txt));
    bytes += gz.length;
    await api("PUT", `/api/snap/${version}/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    console.log(`uploaded ${name} (${(gz.length / 1024).toFixed(0)} KB)`);
  }

  /* detail packs: overwritten in place, then listed in one index */
  const index = {}, held = [];
  /* a pack under 40% of its last size is held back (Oct 6: an empty NFL schedule went out once) */
  let prevIx = {}; try { const ss = await api("POST", "/api/job/session"); const r = await fetch(SITE + "/api/pack-index", { headers: { Authorization: "Bearer " + (ss && ss.token) } }); if (r.ok) prevIx = (await r.json()).packs || {} } catch { }
  for (const name of B.packNames) {
    const txt = await page.evaluate(n => JSON.stringify(window.__PACKS[n]), name);
    const gz = gzipSync(Buffer.from(txt));
    const was = prevIx[name] && prevIx[name].bytes; if (was > 4096 && gz.length < .4 * was) { held.push(name); console.log(`HELD ${name}: ${gz.length} bytes vs ${was} last time`); continue }
    const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    index[name] = { sha: r.sha, bytes: r.bytes, at: Date.now() };
  }
  if (held.length) B.note = (B.note || MODE) + ` · HELD BACK (under 40% of last size): ${held.join(", ")}`;
  /* Oct 11: the run's logs can't be read from here, so what went wrong goes on the run as annotations — held packs and the builder's own
     messages (first and last few, and how many) */
  if (held.length) console.log(`::warning title=held packs::${held.join(", ")}`);
  if (BLOG.length) console.log(`::notice title=builder messages (${BLOG.length})::${[...BLOG.slice(0, 6), ...(BLOG.length > 10 ? ["…"] : []), ...BLOG.slice(-4)].join(" | ").replace(/[\r\n]+/g, " ").slice(0, 3500)}`);
  if (Object.keys(index).length) {
    await api("PUT", "/api/pack-index", { body: index });
    const mb = Object.values(index).reduce((a, x) => a + x.bytes, 0) / 1048576;
    console.log(`detail packs: ${B.packNames.length} uploaded (${mb.toFixed(1)} MB)`);
    console.log(`::notice title=packs::${Object.entries(index).map(([n, x]) => `${n} ${Math.round(x.bytes / 1024)} KB`).join(", ").slice(0, 3000)}`);
  }
  await browser.close();

  if (PACKS_ONLY.includes(MODE)) {          // packs only — the shared data version is unchanged
    const mins = ((Date.now() - started) / 60e3).toFixed(1);
    console.log(`coaches: ${B.packNames.join(", ")} · ${mins} min`);
    await report(true, `${B.note || MODE} · ${B.packNames.length} pack${B.packNames.length === 1 ? "" : "s"}`); return;
  }
  const pub = await api("POST", "/api/snap/publish", { body: { version, files: names, coverage: B.coverage || {}, finishedThrough: B.finishedThrough || 0, note: B.note || MODE } });
  const mins = ((Date.now() - started) / 60e3).toFixed(1);
  console.log(`published ${version} · fingerprint ${pub.fingerprint} · ${mins} min`);
  await report(true, `${B.note || MODE} · ${names.length} files, ${(bytes / 1048576).toFixed(1)} MB${B.packNames.length ? ` · ${B.packNames.length} detail packs` : ""} · fingerprint ${pub.fingerprint}`, { version, coverage: B.coverage });
  /* the look check once a day, not after every game-day update (Oct 9: ~3 min of Actions time each, up to 26 runs on a Saturday; a layout
     break doesn't need catching every 30 minutes). Standalone "look" runs are unaffected. */
  let lookDue = MODE === "live";
  if (lookDue) { try { const h = await api("GET", "/api/job/health"); lookDue = !(h.jobs || []).some(j => j.kind === "look" && Date.now() - j.finished_at < 20 * 36e5)   /* Oct 11: a failing look re-ran after every game-day update (3 min of Actions each); now once a day either way */ } catch (e) { } }
  /* Oct 11: every look run right after a game-day publish timed out waiting for the tabs, while a standalone look minutes later passed
     (34 views, all clear) — give Cloudflare's store the minute or two it takes to spread a publish before looking */
  if (lookDue) await new Promise(r => setTimeout(r, 120000));
  if (lookDue) { try { const browser2 = await chromium.launch(); const L = await lookCheck({ browser: browser2, site: SITE, token: sess.token, page: PAGE }); await browser2.close();
    await api("POST", "/api/job/report", { body: { kind: "look", ok: L.ok, message: lookMsg(L), detail: L } }) } catch (e) { console.log("look check: " + e.message) } }
}

main().catch(async e => {
  console.error("FAILED:", e.message);
  await report(false, e.message.slice(0, 900));
  process.exit(1);
});
