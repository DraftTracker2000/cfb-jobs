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
  return { ok: false, error: "unknown STAGE " + STAGE };
}
