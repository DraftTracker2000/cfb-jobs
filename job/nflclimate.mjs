/* NFL climate study (Oct 31, 1:55 am — Sam: "are there any players [who] grew up and played in college in particular climates … that when
   they got to the nfl they truly struggled in different climates … on an individual basis"). A STUDY: run as a probe (MODE=probe,
   PROBE=nflclimate-<stage>), writes only its own new pack p2026_nfl-climate-study, changes no page and no other pack.

   Stages (env STAGE):
     disc     checks what each outside source answers (shapes, limits), nothing written
     origins  active players (2026 weekly rosters, newest week: ACT/RES/INA) → CFBD hometown and school → NASA POWER normals, elevations
     games    every finished game 2005 on → stadium spot, roof, ERA5 kickoff weather, stadium elevation
     study    the per-player tests (analyze, below) on the kept origins and weather + nflverse weekly stats → result in the pack
   Sources: CFBD through the site's proxy (rosters' homeCity/homeState, high-school recruiting city/state, teams' locations), Wikipedia
   (coordinates of old stadiums), NASA POWER climatology (origin climate), Open-Meteo (elevation; ERA5 archive for kickoff weather). */

import { gzipSync } from "node:zlib";
const UA = { "User-Agent": "mycfbbigboard.com data job (NFL climate study; contact via site)" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const trim = (v, n = 400) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s && s.length > n ? s.slice(0, n) + `…<${s.length}>` : s };

async function getJ(u, opt = {}) { const r = await fetch(u, { headers: { ...UA, ...(opt.headers || {}) } }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } return { st: r.status, j, t, h: Object.fromEntries([...r.headers].filter(([k]) => /ratelimit|x-kept|content-length|retry/i.test(k))) } }

/* a result too big for one annotation: gzip + base64, cut into 3,900-character pieces titled "<tag> i/n" */
export function emit(tag, obj, log = console.log, level = "notice") {
  const b = gzipSync(Buffer.from(JSON.stringify(obj))).toString("base64"), N = Math.ceil(b.length / 3900);
  for (let i = 0; i < N; i++) log(`::${Array.isArray(level) ? level[Math.floor(i / 10)] || "error" : level} title=clim ${tag} ${i + 1}/${N}::${b.slice(i * 3900, (i + 1) * 3900)}`);
  return N;
}

/* ── shared pieces ── */
export const NFLV = "https://github.com/nflverse/nflverse-data/releases/download/";
export const nm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
export const sch = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\bst\.?$/, "state").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
/* job/colgap.mjs's NFL-name → CFBD-name list, plus a few more seen on 2026 rosters */
const ALIAS = { "miami(fl)": "Miami", "miamifl": "Miami", "southerncalifornia": "USC", "centralflorida": "UCF", "mississippi": "Ole Miss", "louisianastate": "LSU",
  "texaschristian": "TCU", "brighamyoung": "BYU", "southernmethodist": "SMU", "alabamabirmingham": "UAB", "texaselpaso": "UTEP", "texassanantonio": "UTSA",
  "nevadalasvegas": "UNLV", "northcarolinastate": "NC State", "floridainternational": "Florida International", "fiu": "Florida International", "massachusetts": "UMass", "connecticut": "UConn",
  "hawaii": "Hawai'i", "sanjosestate": "San José State", "louisianalafayette": "Louisiana", "louisianamonroe": "UL Monroe", "southernmississippi": "Southern Miss",
  "middletennesseestate": "Middle Tennessee", "bowlinggreenstate": "Bowling Green", "cal": "California", "pittsburgh": "Pittsburgh", "pitt": "Pittsburgh",
  "miamioh": "Miami (OH)", "ncstate": "NC State", "olemiss": "Ole Miss", "southflorida": "South Florida", "usf": "South Florida", "floridaatlantic": "Florida Atlantic",
  "texasaandm": "Texas A&M", "texasam": "Texas A&M", "williamandmary": "William & Mary", "northdakotastate": "North Dakota State" };
export function csvRows(t) { const out = []; let row = [], c = "", q = false; for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch; continue }
    if (ch === '"') q = true; else if (ch === ",") { row.push(c); c = "" } else if (ch === "\n") { row.push(c.replace(/\r$/, "")); out.push(row); row = []; c = "" } else c += ch }
  if (c || row.length) { row.push(c); out.push(row) } return out }
export const objs = t => { const R = csvRows(t), h = R[0]; return R.slice(1).filter(r => r.length >= h.length - 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]))) };
async function getText(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { redirect: "follow" }); if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); return /\.gz$/.test(u) ? (await import("node:zlib")).gunzipSync(b).toString() : b.toString() } } catch { } await sleep(2000) } throw new Error("couldn't read " + u) }

/* the active players: on a 53-man roster, injured reserve or inactive in the newest regular-season week of the 2026 weekly rosters */
export function activePlayers(rosterTxt) {
  const R = objs(rosterTxt).filter(r => r.game_type === "REG"); const wk = Math.max(...R.map(r => +r.week));
  return { wk, P: R.filter(r => +r.week === wk && /^(ACT|RES|INA)$/.test(r.status)).map(r => ({ g: r.gsis_id, n: r.full_name, f: r.first_name, l: r.last_name, fb: r.football_name, pos: r.position, t: r.team, st: r.status, entry: +r.entry_year || +r.rookie_year || null, col: r.college, born: r.birth_date })) };
}

/* stadiums: the site's own tables (public/lab/index.html NFL_STAD, NFL_ABROAD — copied Oct 31), and old grounds from Wikipedia's coordinates or
   CFBD's venue for the college stadiums the Cardinals and Saints used in 2005 */
export const NFL_STAD = {ARI:[33.5276,-112.2626,"r"],ATL:[33.7554,-84.4008,"r"],BAL:[39.2780,-76.6227,"o"],BUF:[42.7738,-78.7870,"o"],CAR:[35.2258,-80.8528,"o"],
 CHI:[41.8623,-87.6167,"o"],CIN:[39.0955,-84.5161,"o"],CLE:[41.5061,-81.6995,"o"],DAL:[32.7473,-97.0945,"r"],DEN:[39.7439,-105.0201,"o"],DET:[42.3400,-83.0456,"d"],
 GB:[44.5013,-88.0622,"o"],HOU:[29.6847,-95.4107,"r"],IND:[39.7601,-86.1639,"r"],JAX:[30.3239,-81.6373,"o"],KC:[39.0489,-94.4839,"o"],LV:[36.0909,-115.1833,"d"],
 LAC:[33.9535,-118.3392,"d"],LA:[33.9535,-118.3392,"d"],MIA:[25.9580,-80.2389,"o"],MIN:[44.9737,-93.2575,"d"],NE:[42.0909,-71.2643,"o"],NO:[29.9511,-90.0812,"d"],
 NYG:[40.8135,-74.0745,"o"],NYJ:[40.8135,-74.0745,"o"],PHI:[39.9008,-75.1675,"o"],PIT:[40.4468,-80.0158,"o"],SF:[37.4030,-121.9700,"o"],SEA:[47.5952,-122.3316,"o"],
 TB:[27.9759,-82.5033,"o"],TEN:[36.1665,-86.7713,"o"],WAS:[38.9076,-76.8645,"o"]};
export const NFL_ABROAD = [[/tottenham/i,[51.604,-0.066]],[/wembley/i,[51.556,-0.280]],[/allianz|bayern/i,[48.219,11.625]],[/frankfurt|deutsche bank park/i,[50.069,8.646]],
 [/olympiastadion|berlin/i,[52.515,13.240]],[/corinthians|s(ã|a)o paulo/i,[-23.545,-46.474]],[/maracan/i,[-22.912,-43.230]],[/melbourne/i,[-37.820,144.983]],
 [/stade de france|paris/i,[48.924,2.360]],[/bernab/i,[40.453,-3.688]],[/azteca|banorte/i,[19.303,-99.151]],[/croke|dublin/i,[53.361,-6.251]]];
const OLD_WIKI = [[/candlestick|monster park/i, "Candlestick Park"], [/^giants stadium/i, "Giants Stadium"], [/memorial coliseum/i, "Los Angeles Memorial Coliseum"],
  [/mcafee|o\.co|oakland|ring ?central/i, "Oakland Coliseum"], [/qualcomm/i, "San Diego Stadium"], [/stubhub/i, "Dignity Health Sports Park"], [/texas stadium/i, "Texas Stadium"],
  [/tcf bank/i, "Huntington Bank Stadium"], [/twickenham/i, "Twickenham Stadium"]];
const OLD_CFBD = [[/sun devil/i, "Arizona State"], [/tiger stadium/i, "LSU"]];
/* the job's own roof rule (job/nfl.mjs fixRoof, Oct 26 audit): open-air grounds abroad are outdoors whatever the file says */
const OPEN_ABROAD = /tottenham|wembley|twickenham|allianz|bayern|olympiastadion|berlin|corinthians|s(ã|a)o paulo|maracan|melbourne|cricket ground|stade de france|azteca|banorte|croke|dublin/i;
export const fixRoof = (roof, stadium) => (stadium && OPEN_ABROAD.test(stadium) && roof !== "outdoors" ? "outdoors" : roof || null);
/* the schedule's gametime is Eastern: kickoff in UTC */
export function etToUtc(day, hm) { const [y, m, d] = day.split("-").map(Number), [h, mi] = (hm || "13:00").split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, h + 5, mi); for (let k = 0; k < 2; k++) { const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).reduce((a, x) => (a[x.type] = x.value, a), {});
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute), want = Date.UTC(y, m - 1, d, h, mi); t += want - shown } return t }

async function putStudy({ site, data, log }) {
  /* the study's own pack: new, and only ever this name; a pack under this name that isn't the study's is never touched */
  const JOB = process.env.JOB_TOKEN; if (!JOB) return { skipped: "no job token" };
  const name = "p2026_nfl-climate-study";
  const gz = gzipSync(Buffer.from(JSON.stringify({ climateStudy: data })));
  const r = await fetch(site + "/api/pack/" + name, { method: "PUT", body: gz, headers: { Authorization: "Bearer " + JOB, "x-encoding": "gzip", "Content-Type": "application/json" } }); const j = await r.json().catch(() => null);
  if (!r.ok || !j) return { err: r.status };
  await fetch(site + "/api/pack-index", { method: "PUT", body: JSON.stringify({ [name]: { sha: j.sha, bytes: j.bytes, at: Date.now() } }), headers: { Authorization: "Bearer " + JOB, "Content-Type": "application/json" } });
  return { name, bytes: j.bytes };
}
async function getStudy({ site, token }) { try { const r = await fetch(site + "/api/pack/p2026_nfl-climate-study", { headers: { Authorization: "Bearer " + token } }); if (!r.ok) return { st: r.status, d: null }; const j = await r.json(); return { st: 200, d: j && j.climateStudy } } catch (e) { return { st: 0, d: null } } }

export async function run({ site, token, log = console.log }) {
  const STAGE = process.env.STAGE || "disc";
  const H = { headers: { Authorization: "Bearer " + token } };
  const cf = async path => { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { } return { st: r.status, kept: !!r.headers.get("x-kept"), j, len: t.length } };
  if (STAGE === "disc") {
    const o = { ok: true };
    const info = await cf("/info"); o.cfbdLeft = info.j && info.j.remainingCalls;
    /* NASA POWER climatology at Denver and Miami */
    for (const [nm, la, lo] of [["Denver", 39.74, -104.99], ["Miami", 25.77, -80.19]]) {
      const a = await getJ(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2MDEW,RH2M,PRECTOTCORR&community=AG&longitude=${lo}&latitude=${la}&format=JSON&start=1991&end=2020`);
      const p = a.j && a.j.properties && a.j.properties.parameter;
      o["power_" + nm] = { st: a.st, h: a.h, keys: a.j && Object.keys(a.j), geom: a.j && a.j.geometry, header: a.j && trim(a.j.header, 300), T2M: p && p.T2M, T2MDEW: p && p.T2MDEW, RH2M: p && p.RH2M, PREC: p && p.PRECTOTCORR, msg: a.j ? null : trim(a.t, 300) } }
    /* Open-Meteo: elevation (two points) and one archive day */
    const e = await getJ("https://api.open-meteo.com/v1/elevation?latitude=39.7439,25.9580&longitude=-105.0201,-80.2389"); o.elev = { st: e.st, j: e.j, h: e.h };
    const a = await getJ("https://archive-api.open-meteo.com/v1/archive?latitude=39.7439&longitude=-105.0201&start_date=2024-12-08&end_date=2024-12-08&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=GMT");
    o.arch = { st: a.st, h: a.h, keys: a.j && Object.keys(a.j), elevation: a.j && a.j.elevation, t: a.j && a.j.hourly && a.j.hourly.time.slice(18, 22), T: a.j && a.j.hourly && a.j.hourly.temperature_2m.slice(18, 22), D: a.j && a.j.hourly && a.j.hourly.dew_point_2m.slice(18, 22), msg: a.j ? null : trim(a.t) };
    /* Wikipedia coordinates for old stadiums */
    const T = ["Candlestick Park", "Giants Stadium", "Los Angeles Memorial Coliseum", "Oakland Coliseum", "San Diego Stadium", "Dignity Health Sports Park", "Sun Devil Stadium", "Huntington Bank Stadium", "Texas Stadium", "Tiger Stadium (LSU)", "Twickenham Stadium"];
    const w = await getJ("https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&redirects=1&format=json&titles=" + encodeURIComponent(T.join("|")));
    o.wiki = { st: w.st, pages: w.j && Object.values(w.j.query.pages).map(p => [p.title, p.coordinates && p.coordinates[0] && [p.coordinates[0].lat, p.coordinates[0].lon]]), red: w.j && w.j.query.redirects };
    /* CFBD shapes: teams (location), one roster year, one recruiting year */
    const tm = await cf("/teams?year=2025"); o.teams = { st: tm.st, kept: tm.kept, n: tm.j && tm.j.length, ex: tm.j && trim(tm.j.find(t => t.school === "Colorado"), 900) };
    const ro = await cf("/roster?year=2015"); o.roster = { st: ro.st, kept: ro.kept, n: ro.j && ro.j.length, len: ro.len, ex: ro.j && trim(ro.j[0], 600), teams: ro.j && new Set(ro.j.map(x => x.team)).size, withHome: ro.j && ro.j.filter(x => x.homeCity).length };
    const rc = await cf("/recruiting/players?year=2012&classification=HighSchool"); o.recruit = { st: rc.st, kept: rc.kept, n: rc.j && rc.j.length, ex: rc.j && trim(rc.j[0], 600) };
    const ro2 = await cf("/roster?year=2006"); o.roster2006 = { st: ro2.st, kept: ro2.kept, n: ro2.j && ro2.j.length, withHome: ro2.j && ro2.j.filter(x => x.homeCity).length };
    const after = await cf("/info"); o.cfbdLeftAfter = after.j && after.j.remainingCalls;
    /* GitHub keeps 10 annotations of each level per step, 4,096 characters each (disc run 1, Oct 31): the answer goes out gzipped in chunks,
       and this run checks whether warning and error annotations come back too */
    emit("disc", o, log);
    for (let i = 0; i < 10; i++) log(`::warning title=climlvl w${i}::w${i}`);
    for (let i = 0; i < 10; i++) log(`::error title=climlvl e${i}::e${i}`);
    return { ok: true, n: Object.keys(o).length };
  }
  /* the study's pack: read what earlier stages kept (a pack by this name that isn't the study's stops the run) */
  const prev = await getStudy({ site, token }); if (prev.st === 200 && !(prev.d && prev.d.study === "nfl-climate")) return { ok: false, error: "p2026_nfl-climate-study exists and isn't the study's — not touched" };
  const D = (prev.d && prev.d.study === "nfl-climate") ? prev.d : { study: "nfl-climate", v: 1 };

  if (STAGE === "origins") {
    const t0 = Date.now(), L0 = (await cf("/info")).j; const left0 = L0 && L0.remainingCalls; if (!(left0 > 4000)) return { ok: false, error: "CFBD calls left " + left0 + " (floor 4,000)" };
    let calls = 0; const cfj = async p => { for (let k = 0; k < 3; k++) { const r = await cf(p); if (r.st === 200) { if (!r.kept) calls++; return r.j } await sleep(3000) } return null };
    const { wk, P } = activePlayers(await getText(NFLV + "weekly_rosters/roster_weekly_2026.csv"));
    /* CFBD schools: names and stadium locations */
    const TM = (await cfj("/teams?year=2025")) || [], byKey = new Map(), loc = {};
    for (const t of TM) { for (const a of [t.school, ...(t.alternateNames || [])]) if (a && !byKey.has(sch(a))) byKey.set(sch(a), t.school); const l = t.location || {};
      if (l.latitude != null) loc[t.school] = [+(+l.latitude).toFixed(4), +(+l.longitude).toFixed(4), l.city || "", l.state || "", l.elevation != null ? Math.round(+l.elevation) : null, l.name || ""] }
    const team = c => { let k = sch(c); if (ALIAS[k]) return ALIAS[k]; if (byKey.has(k)) return byKey.get(k); k = k.replace(/^(the)?universityof|^univof|university$|college$/g, ""); return ALIAS[k] || byKey.get(k) || byKey.get(k.replace(/state$/, "st")) || null };
    /* rosters (hometown) and recruiting classes (high school town), every season an active player could have been in college */
    const minE = Math.min(...P.map(p => p.entry || 2026)); const RO = new Map(), RL = new Map(), RC = new Map(); const yrs = { ro: {}, hs: {}, ju: {} };
    for (let y = Math.max(2004, minE - 7); y <= 2025; y++) { const j = await cfj(`/roster?year=${y}`); yrs.ro[y] = j ? j.length : null;
      for (const x of j || []) { const k = nm((x.firstName || "") + (x.lastName || "")), r = { id: x.id, y, t: x.team, f: x.firstName, l: x.lastName, pos: x.position, c: x.homeCity, s: x.homeState, co: x.homeCountry, la: x.homeLatitude, lo: x.homeLongitude };
        (RO.get(k) || RO.set(k, []).get(k)).push(r); const kl = nm(x.lastName) + "|" + x.team; (RL.get(kl) || RL.set(kl, []).get(kl)).push(r) } }
    for (let y = Math.max(2002, minE - 8); y <= 2025; y++) for (const [cl, tag] of [["HighSchool", "hs"], ["JUCO", "ju"]]) { const j = await cfj(`/recruiting/players?year=${y}&classification=${cl}`); yrs[tag][y] = j ? j.length : null;
      for (const x of j || []) { const k = nm(x.name), h = x.hometownInfo || {}; (RC.get(k) || RC.set(k, []).get(k)).push({ y, t: x.committedTo, c: x.city, s: x.stateProvince, co: x.country, la: h.latitude, lo: h.longitude, sc: x.school, cl: tag }) } }
    /* match: same name, a season in his college window, one of his schools; else the same last name at one of his schools in that window (one man only) */
    const cnt = { players: P.length, hometownRoster: 0, hometownLastName: 0, hometownRecruit: 0, collegeOnly: 0, neither: 0, noCollegeMapped: 0 }, unmapped = {}, O = {};
    for (const p of P) { const cols = String(p.col || "").split(";").map(x => x.trim()).filter(Boolean), T = new Set(); for (const c of cols) { const t = team(c); if (t) T.add(t); else unmapped[c] = (unmapped[c] || 0) + 1 }
      const e = p.entry || 2026, inWin = r => r.y >= e - 7 && r.y <= e - 1;
      let rows = [...(RO.get(nm(p.f + p.l)) || []), ...(p.fb && p.fb !== p.f ? RO.get(nm(p.fb + p.l)) || [] : [])].filter(r => inWin(r) && T.has(r.t)), how = rows.length ? "roster" : null;
      if (!rows.length) { const C = []; for (const t of T) for (const r of RL.get(nm(p.l) + "|" + t) || []) if (inWin(r)) C.push(r); const ids = new Set(C.map(r => r.id)); if (ids.size === 1) { rows = C; how = "lastname" } }
      /* his school by seasons on its roster (transfers: the school he spent most seasons at, the later one on a tie) */
      const yBy = {}; for (const r of rows) (yBy[r.t] = yBy[r.t] || new Set()).add(r.y);
      const main = Object.entries(yBy).sort((a, b) => b[1].size - a[1].size || Math.max(...b[1]) - Math.max(...a[1]))[0];
      const colT = main ? main[0] : [...T][0] || null;
      const hr = rows.filter(r => r.c || r.la != null).sort((a, b) => b.y - a.y)[0];
      let home = hr ? [hr.c || "", hr.s || "", hr.co || "", hr.la != null ? +(+hr.la).toFixed(4) : null, hr.lo != null ? +(+hr.lo).toFixed(4) : null, how, hr.y] : null;
      if (!home) { const rc = (RC.get(nm(p.n)) || RC.get(nm(p.f + p.l)) || []).filter(r => r.y >= e - 8 && r.y <= e - 2 && (T.has(team(r.t)) || T.has(r.t))).sort((a, b) => b.y - a.y)[0];
        if (rc && (rc.c || rc.la != null)) home = [rc.c || "", rc.s || "", rc.co || "", rc.la != null ? +(+rc.la).toFixed(4) : null, rc.lo != null ? +(+rc.lo).toFixed(4) : null, "recruit-" + rc.cl, rc.y] }
      if (!T.size) cnt.noCollegeMapped++;
      if (home) cnt[home[5] === "roster" ? "hometownRoster" : home[5] === "lastname" ? "hometownLastName" : "hometownRecruit"]++; else if (colT && loc[colT]) cnt.collegeOnly++; else cnt.neither++;
      O[p.g] = [home, colT, main ? main[1].size : 0, rows.length ? Math.min(...rows.map(r => r.y)) : null, rows.length ? Math.max(...rows.map(r => r.y)) : null] }
    const SL = {}; for (const o of Object.values(O)) if (o[1] && loc[o[1]]) SL[o[1]] = loc[o[1]];
    /* climate (NASA POWER 1991–2020 climatology, MERRA-2 cells of 0.5° × 0.625°) and elevation (Open-Meteo, Copernicus 90 m) at every hometown and college */
    const pts = new Map(); const cellOf = (la, lo) => [Math.round(la / 0.5) * 0.5, Math.round(lo / 0.625) * 0.625].map(v => +v.toFixed(4)).join(",");
    for (const o of Object.values(O)) if (o[0] && o[0][3] != null) pts.set(o[0][3] + "," + o[0][4], 1); for (const l of Object.values(SL)) pts.set(l[0] + "," + l[1], 1);
    const cells = [...new Set([...pts.keys()].map(k => { const [a, b] = k.split(",").map(Number); return cellOf(a, b) }))];
    const CL = D.cl || {}; let pw = 0, pwErr = 0;
    const todo = cells.filter(c => !CL[c]);
    for (let i = 0; i < todo.length; i += 4) { if (Date.now() - t0 > 28 * 60e3) break; await Promise.all(todo.slice(i, i + 4).map(async c => { const [la, lo] = c.split(",");
      for (let k = 0; k < 4; k++) { const a = await getJ(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2MDEW,RH2M,PRECTOTCORR&community=AG&longitude=${lo}&latitude=${la}&format=JSON&start=1991&end=2020`); pw++;
        const q = a.j && a.j.properties && a.j.properties.parameter; if (q && q.T2M) { const m = (v, ks) => +(ks.reduce((s, x) => s + v[x], 0) / ks.length).toFixed(2);
          CL[c] = [m(q.T2M, ["DEC", "JAN", "FEB"]), m(q.T2M, ["JUN", "JUL", "AUG"]), m(q.T2MDEW, ["DEC", "JAN", "FEB"]), m(q.T2MDEW, ["JUN", "JUL", "AUG"]), m(q.RH2M, ["JUN", "JUL", "AUG"]), Math.round(q.PRECTOTCORR.ANN * 365.25), q.T2M.ANN, a.j.geometry && a.j.geometry.coordinates[2] != null ? Math.round(a.j.geometry.coordinates[2]) : null]; return }
        pwErr++; await sleep(3000 * (k + 1)) } })) }
    const EL = D.el || {}; const eTodo = [...pts.keys()].filter(k => EL[k] == null);
    for (let i = 0; i < eTodo.length; i += 100) { const B = eTodo.slice(i, i + 100), la = B.map(k => k.split(",")[0]).join(","), lo = B.map(k => k.split(",")[1]).join(",");
      for (let k = 0; k < 4; k++) { const a = await getJ(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${lo}`); if (a.j && a.j.elevation) { B.forEach((x, j) => EL[x] = a.j.elevation[j]); break } await sleep(5000 * (k + 1)) } }
    Object.assign(D, { origins: { at: Date.now(), wk, cnt, yrs, O, SL, unmapped, note: "O[gsis] = [[home city, state, country, lat, lon, how, season], CFBD school, seasons on its roster, first, last]; SL[school] = [lat, lon, city, state, elevation m, venue]" }, cl: CL, el: EL, cellNote: "cl[cell] = [winter T °C (DJF), summer T (JJA), winter dew point, summer dew point, summer RH %, precip mm/yr, annual T, MERRA-2 cell elevation m]" });
    const up = await putStudy({ site, data: D, log });
    const left1 = (await cf("/info")).j;
    const sum = { cnt, cells: cells.length, climate: Object.keys(CL).length, powerCalls: pw, powerErr: pwErr, elev: Object.keys(EL).length, cfbdCalls: calls, left: left1 && left1.remainingCalls, up, min: +((Date.now() - t0) / 60e3).toFixed(1), unmappedTop: Object.entries(unmapped).sort((a, b) => b[1] - a[1]).slice(0, 60), yrs };
    log(`::notice title=clim origins summary::${JSON.stringify(sum).slice(0, 4000)}`);
    emit("origins", { O, SL, CL, EL }, log, ["warning", "error", "notice"]);
    return { ok: true, players: P.length };
  }
  if (STAGE === "games") {
    const t0 = Date.now(), FROM = +(process.env.FROM || 2005);
    const GM = objs(await getText(NFLV + "schedules/games.csv.gz")).filter(g => +g.season >= FROM && g.home_score !== "" && g.home_score != null);
    /* old grounds: Wikipedia coordinates (one read), the two college stadiums from CFBD's school list (kept, no call) */
    const w = await getJ("https://en.wikipedia.org/w/api.php?action=query&prop=coordinates&redirects=1&format=json&titles=" + encodeURIComponent(OLD_WIKI.map(x => x[1]).join("|")));
    const WK = {}; if (w.j) { const red = {}; for (const r of w.j.query.redirects || []) red[r.to] = r.from; for (const p of Object.values(w.j.query.pages)) if (p.coordinates) WK[red[p.title] || p.title] = [+p.coordinates[0].lat.toFixed(4), +p.coordinates[0].lon.toFixed(4)] }
    const TM = (await cf("/teams?year=2025")).j || [], CV = {}; for (const t of TM) if (t.location && t.location.latitude != null) CV[t.school] = [+(+t.location.latitude).toFixed(4), +(+t.location.longitude).toFixed(4)];
    const spotByName = st => { for (const [re, t] of OLD_WIKI) if (re.test(st)) return WK[t] ? [...WK[t], "wikipedia:" + t] : null; for (const [re, t] of OLD_CFBD) if (re.test(st)) return CV[t] ? [...CV[t], "cfbd:" + t] : null;
      for (const [re, c] of NFL_ABROAD) if (re.test(st)) return [...c, "site:NFL_ABROAD"]; return null };
    const homeOf = {}; for (const g of GM) if (g.location !== "Neutral" && g.stadium) homeOf[g.stadium] = g.home_team;
    const spot = g => { const st = g.stadium || ""; const a = spotByName(st); if (a) return a; const h = g.location !== "Neutral" ? g.home_team : homeOf[st]; return h && NFL_STAD[h] ? [NFL_STAD[h][0], NFL_STAD[h][1], "site:NFL_STAD." + h] : null };
    const G = D.gw || {}, S = D.st || {}, groups = new Map(), unplaced = {}; let nOut = 0, nCtl = 0, nUnk = 0;
    for (const g of GM) { const roof = fixRoof(g.roof, g.stadium), cls = roof === "outdoors" || roof === "open" ? "o" : roof === "dome" || roof === "closed" ? "c" : "u";
      const sp = spot(g); if (!sp) { unplaced[g.stadium] = (unplaced[g.stadium] || 0) + 1 } const sk = sp ? sp[0] + "," + sp[1] : null; if (sp && !S[sk]) S[sk] = [sp[0], sp[1], null, sp[2], []]; if (sp && !S[sk][4].includes(g.stadium)) S[sk][4].push(g.stadium);
      const ko = etToUtc(g.gameday, g.gametime); if (cls === "o") nOut++; else if (cls === "c") nCtl++; else nUnk++;
      if (!G[g.game_id] || G[g.game_id][2] == null && cls === "o") G[g.game_id] = [cls, sk, null, null, null, null, ko];
      if (cls === "o" && sk && G[g.game_id][2] == null) { const k = sk + "|" + g.season; (groups.get(k) || groups.set(k, []).get(k)).push(g.game_id) } }
    /* kickoff weather: Open-Meteo's ERA5 archive, one request per stadium and season (hourly temperature, dew point, precipitation, wind) —
       the mean of the kickoff hour and the next three for temperature, dew point and wind, precipitation summed over the four hours after kickoff */
    let req = 0, w429 = 0, fail = 0; const day = t => new Date(t).toISOString().slice(0, 10);
    for (const [k, ids] of groups) { if (Date.now() - t0 > 30 * 60e3) break; const sk = k.split("|")[0], [la, lo] = sk.split(","); const kos = ids.map(id => G[id][6]);
      const a0 = day(Math.min(...kos)), a1 = day(Math.max(...kos) + 6 * 3600e3); let a = null;
      for (let r = 0; r < 6; r++) { a = await getJ(`https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=${a0}&end_date=${a1}&hourly=temperature_2m,dew_point_2m,precipitation,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm&timezone=GMT`); req++;
        if (a.st === 200 && a.j && a.j.hourly) break; if (a.st === 429) { w429++; await sleep(65000) } else await sleep(4000) }
      if (!(a && a.j && a.j.hourly)) { fail++; continue }
      const Hh = a.j.hourly, base = Date.parse(Hh.time[0] + ":00Z"); if (S[sk] && S[sk][5] == null) S[sk][5] = a.j.elevation;
      for (const id of ids) { const i = Math.floor((G[id][6] - base) / 3600e3), mean = v => { const x = [0, 1, 2, 3].map(j => v[i + j]).filter(z => z != null); return x.length ? +(x.reduce((s, z) => s + z, 0) / x.length).toFixed(1) : null };
        const pr = [1, 2, 3, 4].map(j => Hh.precipitation[i + j]).filter(z => z != null);
        G[id][2] = mean(Hh.temperature_2m); G[id][3] = mean(Hh.dew_point_2m); G[id][4] = pr.length ? +pr.reduce((s, z) => s + z, 0).toFixed(1) : null; G[id][5] = mean(Hh.wind_speed_10m) }
      await sleep(700) }
    /* stadium elevation (Copernicus 90 m DEM through Open-Meteo) */
    const sks = Object.keys(S).filter(k => S[k][2] == null);
    for (let i = 0; i < sks.length; i += 100) { const B = sks.slice(i, i + 100); const a = await getJ(`https://api.open-meteo.com/v1/elevation?latitude=${B.map(k => k.split(",")[0]).join(",")}&longitude=${B.map(k => k.split(",")[1]).join(",")}`); if (a.j && a.j.elevation) B.forEach((k, j) => S[k][2] = a.j.elevation[j]) }
    Object.assign(D, { gw: G, st: S, gwNote: "gw[game] = [o outdoors/open · c dome/closed · u roof unknown, stadium key, °F, dew point °F, precip mm in the 4 hours after kickoff, wind mph, kickoff UTC ms]; st[key] = [lat, lon, DEM elevation m, source, names, ERA5 cell elevation]" });
    const up = await putStudy({ site, data: D, log });
    const left = Object.values(G).filter(x => x[0] === "o" && x[2] == null).length;
    log(`::notice title=clim games summary::${JSON.stringify({ games: GM.length, out: nOut, ctl: nCtl, unk: nUnk, groups: groups.size, req, w429, fail, outdoorNoWx: left, unplaced, stadiums: Object.keys(S).length, up, min: +((Date.now() - t0) / 60e3).toFixed(1) }).slice(0, 4000)}`);
    const out = {}; for (const [id, x] of Object.entries(G)) if (x[0] === "o") out[id] = x.slice(1, 6);
    emit("games", { G: out, S }, log, ["warning", "error", "notice"]);
    return { ok: true, games: GM.length };
  }
  if (STAGE === "study") {
    const t0 = Date.now(); if (!(D.origins && D.gw)) return { ok: false, error: "run the origins and games stages first" };
    const { P } = activePlayers(await getText(NFLV + "weekly_rosters/roster_weekly_2026.csv"));
    const SCHED = objs(await getText(NFLV + "schedules/games.csv.gz")), STATS = [];
    for (let y = 2005; y <= new Date().getUTCFullYear(); y++) { let t = null; try { t = await getText(NFLV + `stats_player/stats_player_week_${y}.csv`) } catch { } if (t) for (const r of statRows(t)) STATS.push(r) }
    const A = analyze({ P, O: D.origins.O, SL: D.origins.SL, CL: D.cl, EL: D.el, GW: D.gw, ST: D.st, SCHED, STATS });
    const keep = t => ({ g: t.g, n: t.n, pos: t.pos, team: t.team, split: t.split, p: +t.p.toPrecision(3), q: +t.q.toPrecision(3), eff: +t.eff.toFixed(4), U: t.U, C: t.C, un: t.un.map(x => +(+x).toFixed(2)), ot: t.ot.map(x => +(+x).toFixed(2)), home: t.home, col: t.col, oc: t.oc });
    D.result = { at: Date.now(), m: A.m, kmax: A.kmax, funnel: A.funnel, whole: A.whole, survivors: A.survivors.map(keep), tests: A.tests.map(keep), statsRows: STATS.length };
    const up = await putStudy({ site, data: D, log });
    log(`::notice title=clim study::${JSON.stringify({ tests: A.m, survivors: A.survivors.map(t => [t.n, t.split, +t.eff.toFixed(3), t.p, +t.q.toFixed(4), t.un, t.ot]), top: A.tests.slice().sort((a, b) => a.p - b.p).slice(0, 6).map(t => [t.n, t.split, t.p, +t.q.toFixed(3)]), funnel: A.funnel, statsRows: STATS.length, up, min: +((Date.now() - t0) / 60e3).toFixed(1) }).slice(0, 4000)}`);
    emit("whole", A.whole, log, ["warning"]);
    return { ok: true, tests: A.m, survivors: A.survivors.length };
  }
  return { ok: false, error: "unknown STAGE " + STAGE };
}

/* ── the analysis (pure: the same code runs in the job and on a laptop) ──
   Fixed before any result was looked at (Oct 31):
   · origin = hometown (CFBD roster, else recruiting town) when known, else the college; climate = NASA POWER 1991–2020 normals of its cell
   · unlike-climate games (outdoors or roof open, ERA5 weather over the kickoff hour and the next three):
       HOT   75°F+ with a dew point 65°F+ (hot and humid) — for players whose origin isn't hot and humid (summer mean under 77°F or summer dew point under 65°F)
       COLD  40°F or colder — for players whose origin has warm winters (Dec–Feb mean 45°F+)
       ALT   a stadium 1,000 m up or more — for players whose origin is under 500 m
       WET   1 mm+ of rain or snow in the 4 hours after kickoff — for players whose origin is dry (under 500 mm a year)
     every other outdoor game is the comparison; dome and closed-roof games are their own group, shown but not tested
   · per-play measure by position, opponent-adjusted (his per-play number minus the league's that season, minus how far that opponent's defense
     sat from the league that season, leaving this game out): QB EPA per dropback; RB yards per carry; WR/TE yards per target; K field goals made
     minus expected for the distances (league rate by distance); P gross yards per punt; DL/LB pass rushers (0.4+ QB hits a game)
     QB hits a game (nflverse's hits take in the sacks) (only games he shows up in the stats). OL, DB, LS: no per-play measure in the files we use
   · home/away and season: labels are shuffled only within the same season and home/away group, and the number compared is his game minus
     that group's average, so a split can't ride on a good season or on home field
   · a test needs 6+ unlike games and 6+ others inside groups that have both, and 20+ outdoor games in all
   · two-sided permutation p (2,000 shuffles; 20,000 under .02; 200,000 under .002), Benjamini–Hochberg at 10% across every test */
const F = c => c * 9 / 5 + 32;
export const SPLITS = {
  HOT: { game: w => w.T >= 75 && w.Td >= 65, origin: c => !(F(c[1]) >= 77 && F(c[3]) >= 65), what: "hot and humid (75°F+, dew point 65°F+)" },
  COLD: { game: w => w.T <= 40, origin: c => F(c[0]) >= 45, what: "40°F or colder" },
  ALT: { game: w => w.el >= 1000, origin: (c, el) => el != null && el < 500, what: "at altitude (1,000 m+)" },
  WET: { game: w => w.P >= 1, origin: c => c[5] < 500, what: "rain or snow (1 mm+)" } };
export const cellOf = (la, lo) => [Math.round(la / 0.5) * 0.5, Math.round(lo / 0.625) * 0.625].map(v => +v.toFixed(4)).join(",");
const num = v => { const x = +v; return v === "" || v == null || v === "NA" || !isFinite(x) ? 0 : x };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
export const GROUP = pos => ({ QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", K: "K", P: "P", DL: "PR", LB: "PR" })[pos] || null;

/* one game's [opportunities, value] for a group; null when it doesn't count */
function oneGame(grp, r, fgP) {
  if (grp === "QB") { const n = num(r.attempts) + num(r.sacks_suffered); return n >= 10 ? [n, num(r.passing_epa)] : null }
  if (grp === "RB") { const n = num(r.carries); return n >= 5 ? [n, num(r.rushing_yards)] : null }
  if (grp === "WR" || grp === "TE") { const n = num(r.targets); return n >= 3 ? [n, num(r.receiving_yards)] : null }
  if (grp === "K") { const d = s => String(s || "").split(";").map(Number).filter(x => x > 0), M = d(r.fg_made_list), X = [...d(r.fg_missed_list), ...d(r.fg_blocked_list)]; const n = M.length + X.length;
    return n ? [n, M.length - [...M, ...X].reduce((s, x) => s + fgP(x), 0)] : null }
  if (grp === "P") { const n = num(r.pt_att); return n ? [n, num(r.pt_yards)] : null }
  /* QB hits as nflverse counts them already take in nearly every sack (2024 play-by-play: 1,317 of 1,392 sacks carry a QB hit; each defender's
     season def_qb_hits equals his hit plays), so sacks aren't added on top (the first draft added them and counted most sacks twice) */
  if (grp === "PR") return [1, num(r.def_qb_hits)];
  return null;
}

export function analyze({ P, O, SL, CL, EL, GW, ST, SCHED, STATS, B0 = 2000, seed = 20261031, log = () => {} }) {
  const R = rng(seed);
  /* schedule: home team, season, roof group */
  const SC = {}; for (const g of SCHED) SC[g.game_id] = { s: +g.season, h: g.home_team, a: g.away_team, neu: g.location === "Neutral", day: g.gameday };
  /* league field-goal rate by distance (every kick in the files, 2005 on), smoothed over ±2 yards */
  const fgN = {}, fgM = {}; for (const r of STATS) { const d = s => String(s || "").split(";").map(Number).filter(x => x > 0); for (const x of d(r.fg_made_list)) { fgN[x] = (fgN[x] || 0) + 1; fgM[x] = (fgM[x] || 0) + 1 } for (const x of [...d(r.fg_missed_list), ...d(r.fg_blocked_list)]) fgN[x] = (fgN[x] || 0) + 1 }
  const fgP = x => { let n = 0, m = 0; for (let k = x - 2; k <= x + 2; k++) { n += fgN[k] || 0; m += fgM[k] || 0 } return n ? m / n : 0.5 };
  /* every game's line for every group (all players, for the league and the opponents), then the active players' own */
  const act = {}; for (const p of P) { const grp = GROUP(p.pos); if (grp) act[p.g] = { ...p, grp } }
  const lg = {}, opp = {}, opG = {}, rows = {};
  const rowGrp = pos => /^QB$/.test(pos) ? "QB" : /^(RB|FB|HB)$/.test(pos) ? "RB" : /^(WR|TE)$/.test(pos) ? "WR" : pos === "K" ? "K" : pos === "P" ? "P" : /^(DE|DT|NT|DL|OLB|ILB|MLB|LB|EDGE)$/.test(pos) ? "PR" : null;
  for (const r of STATS) { const g = SC[r.game_id]; if (!g) continue; const gr = rowGrp(r.position);
    if (gr) { const x = oneGame(gr, r, fgP); if (x) { const k = gr + "|" + g.s, L = lg[k] = lg[k] || [0, 0]; L[0] += x[0]; L[1] += x[1];
        /* the side he faced: what that defense allowed (offense groups), what that offense allowed (pass rush), this game kept apart so it can be left out */
        const ok = k + "|" + r.opponent_team, Q = opp[ok] = opp[ok] || [0, 0]; Q[0] += x[0]; Q[1] += x[1]; const Qg = opG[ok + "|" + r.game_id] = opG[ok + "|" + r.game_id] || [0, 0]; Qg[0] += x[0]; Qg[1] += x[1] } }
    const me = act[r.player_id]; if (me) { const x = oneGame(me.grp === "TE" ? "WR" : me.grp, r, fgP); if (x) (rows[r.player_id] = rows[r.player_id] || []).push({ id: r.game_id, s: g.s, t: r.team, o: r.opponent_team, ha: g.neu ? "n" : r.team === g.h ? "h" : "a", n: x[0], v: x[1], r }) } }
  /* pass rush: per team-game, not per play — the league and opponent rates are per player-game */
  const tests = [], ctrl = [], dome = {}, fun = { withGames: 0, withOrigin: 0, outdoor20: 0 }, fs = {};
  for (const [gid, L] of Object.entries(rows)) { const p = act[gid], grp = p.grp === "TE" ? "WR" : p.grp; const o = O[gid] || [];
    if (grp === "PR") { const n = L.length, v = L.reduce((s, x) => s + x.v, 0); if (!(n >= 20 && v / n >= 0.4)) continue }
    /* origin */
    const home = o[0] && o[0][3] != null ? o[0] : null, sl = o[1] && SL[o[1]] || null;
    const oh = home ? { c: CL[cellOf(home[3], home[4])], el: EL[home[3] + "," + home[4]] } : null, oc = sl ? { c: CL[cellOf(sl[0], sl[1])], el: EL[sl[0] + "," + sl[1]] } : null;
    fun.withGames++; const org = oh && oh.c ? oh : oc && oc.c ? oc : null; if (!org) continue; fun.withOrigin++;
    /* opponent-adjusted per-play residual, outdoor games with weather */
    const G = [];
    for (const x of L) { const w = GW[x.id]; const k = grp + "|" + x.s, Lg = lg[k]; if (!Lg || !Lg[0]) continue; const base = Lg[1] / Lg[0];
      const Q = opp[grp + "|" + x.s + "|" + x.o], Qg = opG[grp + "|" + x.s + "|" + x.o + "|" + x.id] || [0, 0]; const qn = Q ? Q[0] - Qg[0] : 0, oa = qn > 0 && grp !== "K" && grp !== "P" ? (Q[1] - Qg[1]) / qn - base : 0;
      const z = x.v / x.n - base - oa; const cls = w ? w[0] : null;
      if (cls === "c") { (dome[gid] = dome[gid] || []).push({ ...x, z }); continue }
      if (cls !== "o" || w[2] == null) continue;
      const st = ST[w[1]] || []; G.push({ ...x, z, w: { T: w[2], Td: w[3], P: w[4], W: w[5], el: st[2] } }) }
    if (G.length < 20) continue; fun.outdoor20++;
    for (const [sp, S] of Object.entries(SPLITS)) {
      const F0 = fs[sp] = fs[sp] || { origin: 0, any6: 0, mixed6: 0 }; const elig = S.origin(org.c, org.el); if (elig) F0.origin++;
      const lab = G.map(x => S.game(x.w) ? 1 : 0);
      /* groups: season × home/away; only groups that have both kinds of game carry information */
      const grpK = G.map(x => x.s + x.ha), idx = {}; grpK.forEach((k, i) => (idx[k] = idx[k] || []).push(i));
      const mixed = Object.values(idx).filter(I => I.some(i => lab[i]) && I.some(i => !lab[i]));
      const U = mixed.reduce((s, I) => s + I.filter(i => lab[i]).length, 0), C = mixed.reduce((s, I) => s + I.filter(i => !lab[i]).length, 0);
      if (elig && lab.filter(Boolean).length >= 6) F0.any6++; if (U < 6 || C < 6) continue; if (elig) F0.mixed6++;
      /* his game minus his group's (weighted) average */
      const d = new Float64Array(G.length), n = new Float64Array(G.length); const Im = mixed.flat();
      for (const I of mixed) { let sn = 0, sz = 0; for (const i of I) { sn += G[i].n; sz += G[i].n * G[i].z } const m = sz / sn; for (const i of I) { d[i] = G[i].z - m; n[i] = G[i].n } }
      const stat = L0 => { let a = 0, b = 0; for (const I of mixed) for (const i of I) if (L0[i]) { a += n[i] * d[i]; b += n[i] } return a / b };
      const obs = stat(lab), lab2 = Uint8Array.from(lab);
      let B = 0, hit = 0, s1 = 0, s2 = 0; const runB = k => { for (let b = 0; b < k; b++) { for (const I of mixed) { for (let j = I.length - 1; j > 0; j--) { const q = Math.floor(R() * (j + 1)), t = lab2[I[j]]; lab2[I[j]] = lab2[I[q]]; lab2[I[q]] = t } }
          const t = stat(lab2); if (Math.abs(t) >= Math.abs(obs) - 1e-12) hit++; s1 += t; s2 += t * t; B++ } };
      /* players whose origin doesn't call this split unlike: the same test, for the as-a-whole comparison only (not in the individual tests) */
      if (!elig) { runB(500); const sd0 = Math.sqrt(Math.max(1e-12, s2 / B - (s1 / B) ** 2)); ctrl.push({ g: gid, grp, split: sp, eff: obs, z: obs / sd0 }); continue }
      runB(B0); if ((hit + 1) / (B + 1) < 0.02) runB(20000 - B); if ((hit + 1) / (B + 1) < 0.002) runB(200000 - B);
      const sd = Math.sqrt(Math.max(1e-12, s2 / B - (s1 / B) ** 2));
      /* plain numbers for the line: his per-play rate in unlike games and in the other outdoor games (all of them, not only mixed groups) */
      const agg = f => { let a = 0, b = 0, k = 0; G.forEach((x, i) => { if (f(i)) { a += x.v; b += x.n; k++ } }); return [k, b, a] };
      tests.push({ g: gid, n: p.n, pos: p.pos, grp, team: p.t, split: sp, p: (hit + 1) / (B + 1), B, eff: obs, z: obs / sd, U, C, games: G.length,
        un: agg(i => lab[i]), ot: agg(i => !lab[i]), home: home ? home.slice(0, 3) : null, col: o[1] || null, oc: org === oh ? "home" : "college",
        hq: oh && oh.c ? S.origin(oh.c, oh.el) : null, cq: oc && oc.c ? S.origin(oc.c, oc.el) : null, clim: org.c, el: org.el }) } }
  /* Benjamini–Hochberg at 10% */
  const srt = tests.map((t, i) => [t.p, i]).sort((a, b) => a[0] - b[0]), m = tests.length; let kmax = 0;
  srt.forEach(([p], r) => { if (p <= 0.10 * (r + 1) / m) kmax = r + 1 });
  let run = 1; for (let r = m - 1; r >= 0; r--) { const [p, i] = srt[r]; run = Math.min(run, p * m / (r + 1)); tests[i].q = run }
  tests.forEach(t => t.sig = t.q <= 0.10);
  /* as a whole: per split and group, the average standardized effect (Stouffer), and the share of p under .05 */
  const whole = {}; for (const t of tests) { const k = t.split + "|" + t.grp, W = whole[k] = whole[k] || { k: 0, zs: 0, p05: 0, eff: 0 }; W.k++; W.zs += t.z; W.p05 += t.p < 0.05 ? 1 : 0; W.eff += t.eff }
  for (const t of ctrl) { const k = t.split + "|" + t.grp, W = whole[k] = whole[k] || { k: 0, zs: 0, p05: 0, eff: 0 }; W.ck = (W.ck || 0) + 1; W.czs = (W.czs || 0) + t.z; W.ceff = (W.ceff || 0) + t.eff }
  for (const W of Object.values(whole)) { if (W.ck) { W.cZ = +(W.czs / Math.sqrt(W.ck)).toFixed(2); W.cMeanEff = +(W.ceff / W.ck).toFixed(4); delete W.czs; delete W.ceff } if (W.k) { W.Z = +(W.zs / Math.sqrt(W.k)).toFixed(2); W.meanEff = +(W.eff / W.k).toFixed(4); W.p05 = +(W.p05 / W.k).toFixed(3) } delete W.zs; delete W.eff }
  return { tests, whole, m, kmax, survivors: tests.filter(t => t.sig), dome, funnel: { ...fun, splits: fs } };
}
/* the weekly stats files, only the columns the study reads */
export const STAT_COLS = ["player_id", "player_display_name", "position", "season", "week", "season_type", "game_id", "team", "opponent_team", "completions", "attempts", "passing_yards", "sacks_suffered", "passing_epa",
  "carries", "rushing_yards", "targets", "receptions", "receiving_yards", "fg_made_list", "fg_missed_list", "fg_blocked_list", "pt_att", "pt_yards", "def_sacks", "def_qb_hits"];
export function statRows(txt) { const R = csvRows(txt), h = R[0], ix = STAT_COLS.map(c => h.indexOf(c)), out = [];
  for (let i = 1; i < R.length; i++) { const r = R[i]; if (r.length < h.length - 1) continue; const o = {}; STAT_COLS.forEach((c, j) => o[c] = ix[j] >= 0 ? r[ix[j]] : ""); out.push(o) } return out }
