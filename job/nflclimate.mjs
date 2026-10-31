/* NFL climate study (Oct 31, 1:55 am — Sam: "are there any players [who] grew up and played in college in particular climates … that when
   they got to the nfl they truly struggled in different climates … on an individual basis"). A STUDY: run as a probe (MODE=probe,
   PROBE=nflclimate-<stage>), writes only its own new pack p2026_nfl-climate-study, changes no page and no other pack.

   Stages (env STAGE):
     disc   checks what each outside source answers (shapes, limits), nothing written
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
  return { ok: false, error: "unknown STAGE " + STAGE };
}
