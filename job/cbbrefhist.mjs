/* Referee history, college and NBA, back to 2003 (Oct 22 — Sam: refs "have done it for a long time … coaches like john calipari have seen
   refs a lot more than just the ones we'd be counting on for him at arkansas"; "build out the ref data for the sites").
   MODE=refhist (its own workflow, every 6 hours until done, then once a day to fold in the new games):
   1. Backfill: ESPN's game summary for every finished game, 2002–03 through 2024–25 (the daily job's p2000_cbb-refs already has the
      last two seasons), read once and slowly — two at a time with a pause (Sam: not a flood of reads), NBA first, then college newest
      season first. One line a game (src/bbref.js), kept per season in p<Y>_cbb-refraw-<c|n>; a season's pack is only read by this job.
      ESPN's summaries are already read for the refs, so the fouls come with them — no CollegeBasketballData calls at all.
   2. Coaches: college from p2000_cbb-coachids (2013 on) and, before that, each coach's Wikipedia stops already on the coaches pack; NBA coaches from the nbastats pack's Wikipedia record tables (a season where a team changed
      coaches midway is left out — we can't tell whose games were whose).
   3. Totals, small enough for the pages: for each official his seasons and the teams and coaches he's toughest on, most lenient to, and
      wins and loses with (p2000_cbb-refcar-<lg><shard>), and for each coach every official he's had (p2000_cbb-coachref-<lg><shard>).
      Fouls "vs their usual" = a team's fouls in his games against that team's own average that season. */
import { bbRefRow, BB_REF_COLS } from "./lib/bbref.mjs";

const UA = { "User-Agent": "mycbbbigboard.com data job" };
const LGP = { c: "mens-college-basketball", n: "nba" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch (e) { } await sleep(2000 * (k + 1)) } return null }
export const SHARDS = 32;
export function shardOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % SHARDS }
/* a season's days: college November to mid-April; NBA October to late June (2019–20 ran to October, 2020–21 started in December) */
function span(lg, y) { if (lg === "c") return [new Date(Date.UTC(y - 1, 10, 1)), new Date(Date.UTC(y, 3, 12))];
  return [new Date(Date.UTC(y - 1, 9, 1)), new Date(Date.UTC(y, y === 2020 ? 9 : y === 2021 ? 6 : 5, y === 2020 ? 15 : 28))] }
export const FIRST = 2003;

/* ---------- 1. backfill ---------- */
async function backfillSeason({ getPack, putPack, log, lg, y, deadline }) {
  const name = `p${y}_cbb-refraw-${lg}`; let P = await getPack(name).catch(() => null);
  if (!P || P.v !== 1) P = { v: 1, cols: BB_REF_COLS, g: {}, days: {}, none: {}, done: 0 };
  if (P.done) return { P, read: 0, done: true };
  let read = 0, since = 0; const [a, b] = span(lg, y);
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    if (Date.now() > deadline) break; const key = ymd(d); if (P.days[key]) continue;
    const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LGP[lg]}/scoreboard?dates=${key}${lg === "c" ? "&groups=50&limit=500" : ""}`); read++;
    if (!sb) continue;
    /* finished regular-season and postseason games of this season (preseason and exhibitions left out) */
    const ev = (sb.events || []).filter(e => ((e.status || {}).type || {}).state === "post" && (e.season || {}).type !== 1 && (!(e.season || {}).year || e.season.year === y) && !P.g[e.id] && !P.none[e.id]);
    let i = 0, ok = true;
    await Promise.all([0, 1].map(async () => { while (i < ev.length) { const e = ev[i++]; if (Date.now() > deadline) { ok = false; return }
      const s = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LGP[lg]}/summary?event=${e.id}`); read++; await sleep(220);
      if (!s) { ok = false; continue } const row = bbRefRow(s); if (row) { P.g[e.id] = row; since++ } else P.none[e.id] = 1 } }));
    if (ok) P.days[key] = 1;
    if (since >= 600) { await putPack(name, P); since = 0 }
  }
  const all = (() => { for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) if (!P.days[ymd(d)]) return false; return true })();
  if (all) P.done = 1; P.at = Date.now(); await putPack(name, P);
  log(`refhist ${lg} ${y}: ${Object.keys(P.g).length} games${all ? " · done" : ""} (${read} reads this pass)`);
  return { P, read, done: all };
}

/* ---------- 3. totals ---------- */
/* a season's tuple: games, games with fouls, fouls, road−home fouls, games with FTA, FTA, points, O/U games, overs, home games, home wins,
   home ATS games, home covers (older box scores sometimes lack fouls, so they keep their own count) */
export const TCOLS = ["n", "fN", "f", "fd", "ftN", "fta", "pts", "ouN", "ov", "hmN", "hmW", "hcN", "hc"];
const T0 = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function addT(T, r) { T[0]++; if (r.hF != null && r.aF != null) { T[1]++; T[2] += r.hF + r.aF; T[3] += r.aF - r.hF } if (r.hFTA != null && r.aFTA != null) { T[4]++; T[5] += r.hFTA + r.aFTA } T[6] += (r.hs || 0) + (r.as || 0);
  if (r.total != null && r.hs + r.as !== r.total) { T[7]++; if (r.hs + r.as > r.total) T[8]++ }
  if (!r.neutral && r.hs !== r.as) { T[9]++; if (r.hs > r.as) T[10]++; if (r.spread != null && r.hs - r.as + r.spread !== 0) { T[11]++; if (r.hs - r.as + r.spread > 0) T[12]++ } } }
export function buildTotals({ rows, lg, coachOf, teamNm }) {
  const AV = {}; for (const r of rows) { if (r.hF == null || r.aF == null) continue; for (const [k, f] of [[r.hId || r.home, r.hF], [r.aId || r.away, r.aF]]) { const o = AV[k + "|" + r.season] = AV[k + "|" + r.season] || [0, 0]; o[0]++; o[1] += f } }
  const LG = {}, R = {}, CR = {};
  for (const r of rows) { (LG[r.season] = LG[r.season] || T0()); addT(LG[r.season], r);
    const sides = [[r.hId || r.home, r.home, r.hF, r.hs - r.as, r.spread == null ? null : Math.sign(r.hs - r.as + r.spread)], [r.aId || r.away, r.away, r.aF, r.as - r.hs, r.spread == null ? null : -Math.sign(r.hs - r.as + r.spread)]];
    for (const o of r.refs || []) { const X = R[o] = R[o] || { s: {}, t: {}, c: {} }; addT(X.s[r.season] = X.s[r.season] || T0(), r);
      for (const [k, ab, f, m, cv] of sides) { const av = AV[k + "|" + r.season], d = f != null && av && av[0] >= 6 ? f - av[1] / av[0] : null;
        const t = X.t[k] = X.t[k] || { ab, n: 0, w: 0, l: 0, dn: 0, d: 0 }; t.ab = ab; t.n++; if (m > 0) t.w++; else if (m < 0) t.l++; if (d != null) { t.dn++; t.d += d }
        const ck = coachOf(r.season, k, ab); if (!ck) continue;
        const c = X.c[ck.id] = X.c[ck.id] || { nm: ck.nm, n: 0, w: 0, l: 0, dn: 0, d: 0 }; c.n++; if (m > 0) c.w++; else if (m < 0) c.l++; if (d != null) { c.dn++; c.d += d }
        const Q = CR[ck.id] = CR[ck.id] || { nm: ck.nm, r: {} }; const q = Q.r[o] = Q.r[o] || [0, 0, 0, 0, 0, 0, 0]; q[0]++; if (m > 0) q[1]++; else if (m < 0) q[2]++; if (cv) { if (cv > 0) q[3]++; else q[4]++ } if (d != null) { q[5]++; q[6] += Math.round(d * 10) / 10 } } } }
  const minT = lg === "n" ? 8 : 5, r1 = v => Math.round(v * 10) / 10;
  const out = {}; for (const [o, X] of Object.entries(R)) { const n = Object.values(X.s).reduce((a, t) => a + t[0], 0); if (n < (lg === "n" ? 20 : 10)) continue;
    const T = Object.entries(X.t).map(([k, t]) => ({ k, ...t })), C = Object.entries(X.c).map(([k, c]) => ({ k, ...c }));
    const fd = L => L.filter(t => t.dn >= minT).map(t => ({ ...t, dd: t.d / t.dn })), wl = L => L.filter(t => t.n >= minT).map(t => ({ ...t, p: t.w / Math.max(1, t.w + t.l) }));
    const top = (L, f, k) => [...L].sort(f).slice(0, 6).map(k);
    const TF = fd(T), TW = wl(T), CF = fd(C), CW = wl(C);
    out[o] = { n, s: X.s,
      tt: top(TF.filter(t => t.dd >= .3), (a, b) => b.dd - a.dd, t => [t.k, t.ab, r1(t.dd), t.dn]), te: top(TF.filter(t => t.dd <= -.3), (a, b) => a.dd - b.dd, t => [t.k, t.ab, r1(t.dd), t.dn]),
      tw: top(TW, (a, b) => b.p - a.p || b.n - a.n, t => [t.k, t.ab, t.w, t.l]), tl: top(TW, (a, b) => a.p - b.p || b.n - a.n, t => [t.k, t.ab, t.w, t.l]),
      ct: top(CF.filter(t => t.dd >= .3), (a, b) => b.dd - a.dd, t => [t.k, t.nm, r1(t.dd), t.dn]), ce: top(CF.filter(t => t.dd <= -.3), (a, b) => a.dd - b.dd, t => [t.k, t.nm, r1(t.dd), t.dn]),
      cw: top(CW, (a, b) => b.p - a.p || b.n - a.n, t => [t.k, t.nm, t.w, t.l]), cl: top(CW, (a, b) => a.p - b.p || b.n - a.n, t => [t.k, t.nm, t.w, t.l]) } }
  return { LG, refs: out, coaches: CR };
}

export async function refHist({ getPack, putPack, log, NEXT, curNba, hours = 4.5 }) {
  const started = Date.now(), deadline = started + hours * 36e5; let reads = 0;
  /* 1. backfill, NBA first (smaller), then college newest first */
  const plan = []; for (let y = curNba - 2; y >= FIRST; y--) plan.push(["n", y]); for (let y = NEXT - 2; y >= FIRST; y--) plan.push(["c", y]);
  const raw = { c: {}, n: {} };
  for (const [lg, y] of plan) { const r = await backfillSeason({ getPack, putPack, log, lg, y, deadline }); raw[lg][y] = r.P; reads += r.read }
  /* the last two seasons from the daily pack */
  const D = await getPack("p2000_cbb-refs").catch(() => null);
  const rows = { c: [], n: [] };
  for (const lg of ["c", "n"]) { for (const [y, P] of Object.entries(raw[lg])) for (const r of Object.values(P.g || {})) rows[lg].push({ season: +y, ...Object.fromEntries(BB_REF_COLS.map((k, i) => [k, r[i]])) });
    if (D && D.g && D.cols) for (const r of Object.values(D.g[lg] || {})) rows[lg].push(Object.fromEntries(D.cols.map((k, i) => [k, r[i]]))) }
  /* old box lines without team ids borrow them from the same abbreviation in the same season or later */
  for (const lg of ["c", "n"]) { const id = {}; for (const r of [...rows[lg]].sort((a, b) => a.season - b.season)) { if (r.hId) id[r.home] = r.hId; if (r.aId) id[r.away] = r.aId }
    for (const r of rows[lg]) { if (!r.hId && id[r.home]) r.hId = id[r.home]; if (!r.aId && id[r.away]) r.aId = id[r.away] } }
  /* 2. coaches */
  const teamsP = (await getPack(`p${NEXT}_cbb-teams`).catch(() => null)) || (await getPack(`p${NEXT - 1}_cbb-teams`).catch(() => null)) || { teams: {} };
  const cbbdOfEspn = {}; for (const t of Object.values(teamsP.teams || {})) if (t.sid) cbbdOfEspn[t.sid] = t.id;
  const CI = (await getPack("p2000_cbb-coachids").catch(() => null)) || { seasons: {}, names: {} };
  /* before 2013 (Oct 22 — Sam: "we already had this information stored"): each coach's stops from his Wikipedia page, already kept on the
     coaches pack (wiki.stops: ["2000–2009", "Memphis"]) — a stop "2000–2009" is the seasons ending 2001 through 2009 */
  const CP = (await getPack(`p${NEXT}_cbb-coaches`).catch(() => null)) || (await getPack(`p${NEXT - 1}_cbb-coaches`).catch(() => null)) || { coaches: {} };
  const kn = v => String(v || "").toLowerCase().replace(/\bst\.?\b/g, "state").replace(/[^a-z]/g, ""), espnOfName = {};
  for (const t of Object.values(teamsP.teams || {})) if (t.sid) { espnOfName[kn(t.nm)] = t.sid; if (t.mascot) espnOfName[kn(t.nm + " " + t.mascot)] = t.sid }
  /* Wikipedia's school names that differ from ours */
  const WK_ALIAS = { "IUPUI": "IU Indianapolis", "FIU": "Florida International", "Appalachian State": "App State", "Seattle": "Seattle U", "UMass": "Massachusetts", "Loyola (MD)": "Loyola Maryland",
    "Loyola (IL)": "Loyola Chicago", "Loyola Marymount": "Loyola Marymount", "Penn": "Pennsylvania", "Miami (FL)": "Miami", "Miami (OH)": "Miami (OH)", "Southeastern Louisiana": "SE Louisiana", "San Jose State": "San José State",
    "USC Upstate": "South Carolina Upstate", "Arkansas–Little Rock": "Little Rock", "UALR": "Little Rock", "American": "American University", "Queens": "Queens University", "Queens (NC)": "Queens University", "Detroit": "Detroit Mercy",
    "LIU Brooklyn": "Long Island University", "LIU": "Long Island University", "Sam Houston State": "Sam Houston", "Louisiana–Monroe": "UL Monroe", "Grambling State": "Grambling", "Albany": "UAlbany", "Nicholls State": "Nicholls",
    "UTRGV": "UT Rio Grande Valley", "Texas–Pan American": "UT Rio Grande Valley", "UTPA": "UT Rio Grande Valley" };
  for (const [w, ours] of Object.entries(WK_ALIAS)) { const sid = espnOfName[kn(ours)]; if (sid) espnOfName[kn(w)] = sid }
  const WIKI = {}; let wkOk = 0, wkMiss = new Set();
  for (const [cid, c] of Object.entries(CP.coaches || {})) for (const [rng, school] of ((c.wiki || {}).stops || [])) { const m = String(rng).match(/(\d{4})\D+(\d{4}|present)/i); if (!m) continue;
    const sid = espnOfName[kn(school)]; if (!sid) { wkMiss.add(school); continue } const y1 = /present/i.test(m[2]) ? NEXT : +m[2];
    for (let y = +m[1] + 1; y <= y1; y++) { const k = y + "|" + sid; (WIKI[k] = WIKI[k] || []).push({ id: String(cid), nm: c.nm }); wkOk++ } }
  log(`refhist: coaches' Wikipedia stops placed ${wkOk} team-seasons${wkMiss.size ? ` · not matched to a school: ${[...wkMiss].slice(0, 10).join("; ")}` : ""}`);
  const colCoach = (y, espnId) => { const c1 = CI.seasons[y] && CI.seasons[y][cbbdOfEspn[espnId]]; if (c1) return { id: String(c1), nm: CI.names[c1] || "" };
    const w = WIKI[y + "|" + espnId]; return w && w.length === 1 ? w[0] : null };
  const NS = await getPack("p2000_cbb-nbastats").catch(() => null), coh = (NS && NS.coh) || {};
  /* NBA: ESPN id → today's abbreviation (franchises keep their ESPN id when they move or rename) */
  const abNow = {}; for (const r of [...rows.n].sort((a, b) => a.season - b.season)) { if (r.hId) abNow[r.hId] = r.home; if (r.aId) abNow[r.aId] = r.away }
  const AB_FIX = { NJ: "BKN", SEA: "OKC", NOH: "NO", NOK: "NO", VAN: "MEM", GSW: "GS", NYK: "NY", SAS: "SA", UTA: "UTAH", WAS: "WSH", PHO: "PHX" };
  const nbaCo = {}; for (const [nm, H] of Object.entries(coh)) for (const r of (H.r || [])) { const k = r[0] + "|" + r[1]; (nbaCo[k] = nbaCo[k] || []).push(nm) }
  const nbaCoach = (y, espnId, ab) => { const a0 = abNow[espnId] || ab, a = AB_FIX[a0] || a0, L = nbaCo[y + "|" + a]; return L && L.length === 1 ? { id: L[0], nm: L[0] } : null };
  /* 3. totals, sharded so a page loads only its own slice */
  for (const lg of ["n", "c"]) { if (!rows[lg].length) continue;
    const X = buildTotals({ rows: rows[lg], lg, coachOf: lg === "c" ? (y, k) => colCoach(y, k) : nbaCoach });
    const RS = Array.from({ length: SHARDS }, () => ({ v: 1, lg, cols: TCOLS, LG: X.LG, r: {} })), CS = Array.from({ length: SHARDS }, () => ({ v: 1, lg, c: {} }));
    for (const [o, v] of Object.entries(X.refs)) RS[shardOf(o)].r[o] = v;
    for (const [k, v] of Object.entries(X.coaches)) CS[shardOf(k)].c[k] = v;
    for (let i = 0; i < SHARDS; i++) { await putPack(`p2000_cbb-refcar-${lg}${i}`, RS[i]); await putPack(`p2000_cbb-coachref-${lg}${i}`, CS[i]) }
    log(`refhist totals ${lg}: ${rows[lg].length} games · ${Object.keys(X.refs).length} officials · ${Object.keys(X.coaches).length} coaches`) }
  return { reads, mins: (Date.now() - started) / 60e3 };
}
