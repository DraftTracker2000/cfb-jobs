/* The college basketball data job (Oct 9 — Sam: "scan everything the api pulls now and start seeing what you can build out from it").
   Pure Node, no browser: it reads CollegeBasketballData (CBBD) through the site's own door (/api/job/cbbd, so the key never leaves the
   Worker), builds the basketball board's files and uploads them as detail packs (the same storage the football side uses).

   Modes (MODE env):
     cbb         the everyday run: this season's players, teams, polls, portal, recruits, draft results, and any new games' shots.
                 Re-uses the history cache (p2000_cbb-hist), so a quiet day costs ~15 CBBD calls.
     cbbhistory  also rebuilds the history cache (every season's player stats, rosters, recruits and team ratings since 2008) and the
                 shot charts for every season with shot locations (2021 on) — the first run, or after a model change. ~600–900 calls.

   What it builds (packs, all gzipped JSON):
     p{S}_cbb-core     the board: every player from season S (and incoming freshmen in the off-season), with stats, the draft grade,
                       closest past profiles, and the comparison bands
     p{S}_cbb-careers  each board player's season-by-season lines (opened from a profile)
     p{S}_cbb-teams    every Division I team: ratings, record, poll rank, roster, recruiting class, portal moves, NBA picks
     p{Y}_cbb-shots    one season's shot chart: every player's and team's shots by zone (made/attempts), shot types, clutch
     p{S}_cbb-draft    the NBA draft since 2001 with each pick's college, and how the draft grade tested on held-out seasons
     p2000_cbb-hist    the history cache (job only)

   The draft grade (see buildModel): three logistic fits on every Division I player-season since 2012 — eventually drafted, first round,
   lottery — from per-40 production, efficiency, role, size, class, recruiting rank and team strength. It's trained on seasons whose
   outcome is known (three drafts later) and tested on later seasons it never saw; the test is published with the board. */
import { gzipSync } from "node:zlib";
import { buildGames, ranges } from "./cbbgames.mjs";
import { buildNcaaRuns } from "./cbbncaa.mjs";
import { buildCombine } from "./cbbcombine.mjs";
import { buildPast, confTourneyIds } from "./cbbpast.mjs";
import { runPbp } from "./cbbpbp.mjs";
import { buildNba, buildNbaGames } from "./cbbnba.mjs";
import { fetchRosters, fetchSummary } from "./cbbespn.mjs";

let SITE = (process.env.SITE_URL || "").replace(/\/+$/, "");
let JOB = process.env.JOB_TOKEN || "";
let MODE = process.env.MODE || "cbb";
export function configure(o) { SITE = o.site; JOB = o.token; MODE = o.mode || MODE; CALLS = 0; SESS = null; for (const k in INDEX) delete INDEX[k] }
const started = Date.now();
let CALLS = 0, LEFT0 = null, LEFT = null;
const log = (...a) => console.log("[cbb]", ...a);

/* ---------- talking to the site ---------- */
async function site(method, path, { body, raw, token = JOB, headers = {} } = {}) {
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(SITE + path, { method, body: raw ? body : body && JSON.stringify(body), headers: { Authorization: "Bearer " + token, ...(body && !raw ? { "Content-Type": "application/json" } : {}), ...headers } });
      const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { }
      if (!r.ok) { if (r.status >= 500 && k < 3) throw new Error("retry " + r.status); throw Object.assign(new Error(`${method} ${path} → ${r.status} ${(j && j.message) || t.slice(0, 160)}`), { fatal: true }) }
      return j;
    } catch (e) { if (e.fatal || k >= 3) throw e; await sleep(2000 * (k + 1)) }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* one CBBD call (counted). Big answers (a day of plays is up to ~30 MB) come straight through. */
export async function cb(path, params = {}) {
  const q = new URLSearchParams({ path, ...Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)) });
  for (let k = 0; ; k++) {
    try {
      CALLS++;
      const r = await fetch(`${SITE}/api/job/cbbd?${q}`, { headers: { Authorization: "Bearer " + JOB } });
      const left = r.headers.get("x-calllimit-remaining"); if (left) { LEFT = +left; if (LEFT0 == null) LEFT0 = LEFT + 1 }
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`CBBD ${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
      return await r.json();
    } catch (e) { if (k >= 3) throw e; await sleep(3000 * (k + 1)) }
  }
}
let SESS = null;
async function getPack(name) {
  if (!SESS) SESS = (await site("POST", "/api/job/session")).token;
  const r = await fetch(SITE + "/api/pack/" + name, { headers: { Authorization: "Bearer " + SESS } });
  return r.ok ? r.json() : null;
}
const INDEX = {};
async function putPack(name, obj) {
  const gz = gzipSync(Buffer.from(JSON.stringify(obj)));
  const r = await site("PUT", "/api/pack/" + name, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  INDEX[name] = { sha: r.sha, bytes: r.bytes, at: Date.now() };
  log(`uploaded ${name} (${(gz.length / 1024).toFixed(0)} KB)`);
}
/* run fn over items, n at a time */
async function pool(items, n, fn) { let i = 0; const out = []; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } })); return out }

/* ---------- small helpers ---------- */
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r3 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
export const normName = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
/* PG / SG / SF / PF / C (Oct 9 — Sam: "do we not have pg, sg, sf, pf, c?"). CBBD and ESPN mostly list only G / F / C, so the five come from
   how he plays: assist rate splits guards, three-point share and passing split forwards, size with rebounding or shot-blocking makes a
   centre. Without stats: a recruiting position (PG, SG, SF, PF, C; a combo guard counts as SG), else height within his listed group. */
export function pos5({ pos, ht, d, listed }) {
  const L = String(listed || "").toUpperCase();
  if (d && d.pts40 != null) {
    const h = ht || d.ht || 0;
    if (pos === "C" || (h >= 82 && (d.reb40 >= 10.5 || d.blk40 >= 2)) || (h >= 83 && d.tpr < .15)) return "C";
    if (pos === "G") return d.ast40 >= 4.6 || (d.ast40 >= 3.8 && h && h <= 75) ? "PG" : (h >= 79 && d.reb40 >= 7 ? "SF" : "SG");
    if (d.ast40 >= 4.6 && h && h <= 78) return "PG";
    return (d.tpr >= .32 && h <= 81) || (d.ast40 >= 3.4 && h <= 80) || (h && h <= 78) ? "SF" : "PF";
  }
  if (/^(PG|SG|SF|PF|C)$/.test(L)) return L;
  if (L === "CG") return "SG"; if (L === "WF" || L === "W") return "SF";
  const g = posGroup(listed || pos), h = ht || 0;
  return g === "C" ? "C" : g === "G" ? (h && h <= 75 ? "PG" : "SG") : (h >= 81 ? "PF" : "SF");
}
/* G / F / C from any of CBBD's spellings ("G", "Guard", "PG", "CG" = combo guard, "SF", "Forward", "C", "Center"…) */
export const posGroup = p => { p = String(p || "").toUpperCase().trim(); if (/^(PG|SG|CG|G\b|G$|GUARD|COMBO)/.test(p)) return "G"; if (/^(C|CENTER)$/.test(p)) return "C"; return "F" };

/* ---------- shot zones (shared with the page — keep the two in step) ----------
   Court coordinates from CBBD are tenths of a foot on the full 94×50 court. Each shot is folded onto one half court:
   X = feet from the baseline, Y = feet across (0–50), the basket at (5.25, 25). Twelve zones: at the rim (inside 4 ft), the rest of the
   paint, mid-range (baseline / wing / top, each side), and threes (corner / wing / top). */
export const ZONES = ["rim", "paint", "mbL", "mwL", "mt", "mwR", "mbR", "c3L", "w3L", "t3", "w3R", "c3R"];
export function zoneOf(x, y, range) {
  if (x == null || y == null) return null;
  let X = x / 10, Y = y / 10; if (X > 47) { X = 94 - X; Y = 50 - Y }
  const dx = X - 5.25, dy = Y - 25, d = Math.hypot(dx, dy), a = Math.atan2(dy, Math.max(dx, .01)) * 180 / Math.PI;
  const three = range ? range === "three_pointer" : (d >= 22.15 || (X < 10 && Math.abs(dy) >= 21.6));
  if (three) { if (X < 10) return dy > 0 ? "c3L" : "c3R"; return a > 36 ? "w3L" : a < -36 ? "w3R" : "t3" }
  if (d < 4) return "rim";
  if (X < 19 && Math.abs(dy) < 6) return "paint";
  if (X < 10) return dy > 0 ? "mbL" : "mbR";
  return a > 36 ? "mwL" : a < -36 ? "mwR" : "mt";
}
const ZI = Object.fromEntries(ZONES.map((z, i) => [z, i]));
const blankAgg = () => ({ z: ZONES.map(() => [0, 0]), r: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], t: [[0, 0], [0, 0], [0, 0], [0, 0]], cl: [0, 0], ft: [0, 0], cft: [0, 0], ast: 0 });
const RNG = { rim: 0, jumper: 1, three_pointer: 2 };
const TYP = { DunkShot: 0, LayUpShot: 1, JumpShot: 2, TipShot: 3 };
/* add one shooting play to a player's (or team's) tally */
export function addShot(A, p) {
  const s = p.shotInfo || {}; const made = s.made ? 1 : 0;
  const clutch = p.period >= 2 && p.secondsRemaining != null && p.secondsRemaining <= 300 && Math.abs((p.homeScore || 0) - (p.awayScore || 0)) <= 5;
  if (s.range === "free_throw" || /FreeThrow/.test(p.playType || "")) { A.ft[0] += made; A.ft[1]++; if (clutch) { A.cft[0] += made; A.cft[1]++ } return }
  const loc = s.location || {}; const z = zoneOf(loc.x, loc.y, s.range);
  if (z) { A.z[ZI[z]][0] += made; A.z[ZI[z]][1]++ }
  const ri = RNG[s.range]; if (ri != null) { A.r[ri][0] += made; A.r[ri][1]++; if (made && s.assisted) A.r[ri][2]++ }
  const ti = TYP[p.playType]; if (ti != null) { A.t[ti][0] += made; A.t[ti][1]++ }
  if (made && s.assisted) A.ast++;
  if (clutch) { A.cl[0] += made; A.cl[1]++ }
}

/* ---------- the logistic fits ---------- */
export function fitLogistic(X, y, { l2 = 2e-3, epochs = 500, lr = .05, w0 } = {}) {
  const n = X.length, m = X[0].length; let w = w0 ? w0.slice() : new Array(m + 1).fill(0);
  const mw = new Array(m + 1).fill(0), vw = new Array(m + 1).fill(0); const b1 = .9, b2 = .999;
  for (let ep = 1; ep <= epochs; ep++) {
    const g = new Array(m + 1).fill(0);
    for (let i = 0; i < n; i++) { const xi = X[i]; let z = w[m]; for (let j = 0; j < m; j++) z += w[j] * xi[j]; const p = 1 / (1 + Math.exp(-z)), e = p - y[i]; for (let j = 0; j < m; j++) g[j] += e * xi[j]; g[m] += e }
    for (let j = 0; j <= m; j++) { const gj = g[j] / n + (j < m ? l2 * w[j] : 0); mw[j] = b1 * mw[j] + (1 - b1) * gj; vw[j] = b2 * vw[j] + (1 - b2) * gj * gj; w[j] -= lr * (mw[j] / (1 - b1 ** ep)) / (Math.sqrt(vw[j] / (1 - b2 ** ep)) + 1e-8) }
  }
  return w;
}
export const predict = (w, x) => { let z = w[x.length]; for (let j = 0; j < x.length; j++) z += w[j] * x[j]; return 1 / (1 + Math.exp(-z)) };
export function auc(scores, labels) {
  const ix = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]); let pos = 0, neg = 0, rank = 0, sumR = 0;
  ix.forEach((i, k) => { if (labels[i]) { pos++; sumR += k + 1 } else neg++ });
  return pos && neg ? (sumR - pos * (pos + 1) / 2) / (pos * neg) : null;
}

/* one player-season → the numbers the grade and the comparisons use */
/* CBBD gives the turnover rate as a fraction (0.18): kept as a percent so one decimal still tells teams apart */
const pctOf = x => x == null ? x : (x < 1 ? 100 * x : x);
export function derive(s) {
  const g = s.g || 0, mn = s.min || 0, p40 = v => mn > 0 ? v * 40 / mn : 0;
  const fga = s.fga || 0, fta = s.fta || 0, tpa = s.tpa || 0;
  return {
    mpg: g ? mn / g : 0, minSh: g ? Math.min(1, mn / (g * 40)) : 0, g,
    pts40: p40(s.pts), reb40: p40(s.reb), orb40: p40(s.orb), ast40: p40(s.ast), stl40: p40(s.stl), blk40: p40(s.blk), tov40: p40(s.tov), pf40: p40(s.pf),
    ts: (fga + .44 * fta) > 0 ? s.pts / (2 * (fga + .44 * fta)) : 0,
    tpr: fga ? tpa / fga : 0, ftr: fga ? fta / fga : 0,
    tpp: (s.tpm + .33 * 15) / (tpa + 15), ftp: (s.ftm + .70 * 15) / (fta + 15), twp: ((s.fgm - s.tpm) + .48 * 20) / ((fga - tpa) + 20),
    usg: s.usg || 0, ortg: Math.max(60, Math.min(150, s.ortg || 100)), drtg: Math.max(80, Math.min(130, s.drtg || 105)),
    porp: s.porp || 0, ws40: s.ws40 || 0, ast2tov: (s.ast + 1) / (s.tov + 1)
  };
}
const FEATS = ["y1", "y2", "y3", "pts40", "reb40", "orb40", "ast40", "stl40", "blk40", "tov40", "ts", "tpr", "ftr", "tpp", "ftp", "usg", "ortg", "drtg", "porp", "ws40", "minSh", "ht", "htMiss", "pPG", "pSG", "pSF", "pPF", "net", "confNet", "rec", "recMiss", "ptsYr", "blkHt", "g"];
function featVec(d) { return FEATS.map(k => d[k] ?? 0) }

/* ---------- main ---------- */
export async function main() {
  if (!SITE || !JOB) throw new Error("SITE_URL and JOB_TOKEN are required");
  const now = new Date(), M = now.getUTCMonth() + 1, Yr = now.getUTCFullYear();
  const UPCOMING = M >= 9 ? Yr + 1 : Yr;                       // the season that ends next spring (Oct 2026 → 2027); stats may not exist yet
  const full = MODE === "cbbhistory";

  /* teams and Division I */
  const teamsRaw = await cb("/teams");
  const TEAM = Object.fromEntries(teamsRaw.map(t => [t.id, t]));
  /* the newest season with real stats */
  let S = UPCOMING, statsNow = await cb("/stats/player/season", { season: S });
  if (statsNow.length < 3000) { S = UPCOMING - 1; statsNow = await cb("/stats/player/season", { season: S }) }
  /* off-season (after the title game, until next season's stats come in): the board looks ahead — players who left for the NBA are
     off it, transfers sit with their new team, and the incoming freshmen are on it */
  const off = Date.now() > Date.UTC(S, 3, 10);
  const inSeason = !off, NEXT = off ? S + 1 : S;
  log(`stats season ${S}; the board is for ${NEXT - 1}–${String(NEXT).slice(2)}${off ? " (off-season)" : ""}`);

  /* the history cache: every season's player rows, rosters (height), team ratings and recruits */
  const trimRow = r => ({ id: r.athleteId, sid: r.athleteSourceId || null, tm: r.teamId, s: r.season, nm: r.name, pos: posGroup(r.position), g: r.games || 0, gs: r.starts || 0, min: r.minutes || 0, pts: r.points || 0, tov: r.turnovers || 0, pf: r.fouls || 0, ast: r.assists || 0, stl: r.steals || 0, blk: r.blocks || 0,
    usg: r.usage, ortg: r.offensiveRating, drtg: r.defensiveRating, porp: r.PORPAG, fgm: (r.fieldGoals || {}).made || 0, fga: (r.fieldGoals || {}).attempted || 0, tpm: (r.threePointFieldGoals || {}).made || 0, tpa: (r.threePointFieldGoals || {}).attempted || 0,
    ftm: (r.freeThrows || {}).made || 0, fta: (r.freeThrows || {}).attempted || 0, orb: (r.rebounds || {}).offensive || 0, drb: (r.rebounds || {}).defensive || 0, reb: (r.rebounds || {}).total || 0, ws: (r.winShares || {}).total, ws40: (r.winShares || {}).totalPer40, wso: (r.winShares || {}).offensive, wsd: (r.winShares || {}).defensive });
  let H = full ? null : await getPack("p2000_cbb-hist").catch(() => null);
  const HFROM = 2008;
  if (!H || !H.stats || H.through < S - 1 || H.v !== 2) {
    log("building the history cache…");
    H = { v: 2, stats: {}, ht: {}, start: {}, adj: {}, rec: {}, through: S - 1 };
    const seasons = []; for (let y = HFROM; y < S; y++) seasons.push(y);
    await pool(seasons, 3, async y => {
      const st = await cb("/stats/player/season", { season: y }); H.stats[y] = st.filter(r => r.minutes > 0).map(trimRow);
      const ro = await cb("/teams/roster", { season: y }); for (const t of ro) for (const p of t.players || []) { if (p.height) H.ht[p.id] = [p.height, p.weight || null]; if (p.startSeason) H.start[p.id] = Math.min(H.start[p.id] || 9999, p.startSeason) }
      let adj = await cb("/ratings/adjusted", { season: y }); if (!adj.length) adj = (await cb("/ratings/srs", { season: y })).map(t => ({ teamId: t.teamId, conference: t.conference, netRating: t.rating * 1.0 }));
      H.adj[y] = Object.fromEntries(adj.map(t => [t.teamId, [r1(t.netRating), t.conference]]));
    });
    for (let y = HFROM - 1; y < S; y++) { const rc = await cb("/recruiting/players", { year: y }); H.rec[y] = rc.map(r => [normName(r.name), (r.committedTo || {}).id || null, r.rating, r.stars, r.ranking, r.heightInches, r.athleteId || null]) }
    await putPack("p2000_cbb-hist", H);
  }
  /* this season */
  const rowsS = statsNow.filter(r => r.minutes > 0).map(trimRow);
  const rosterS = await cb("/teams/roster", { season: S });
  const RO = {}; for (const t of rosterS) for (const p of t.players || []) RO[p.id] = { ht: p.height, wt: p.weight, start: p.startSeason, jersey: p.jersey, home: p.hometown ? [p.hometown.city, p.hometown.state, p.hometown.country].filter(Boolean).join(", ") : "", posFull: p.position, tm: t.teamId };
  for (const [id, r] of Object.entries(RO)) { if (r.ht) H.ht[id] = [r.ht, r.wt || null]; if (r.start) H.start[id] = Math.min(H.start[id] || 9999, r.start) }
  let adjS = await cb("/ratings/adjusted", { season: S });
  const ADJ = Object.fromEntries(adjS.map(t => [t.teamId, t]));
  H.adj[S] = Object.fromEntries(adjS.map(t => [t.teamId, [r1(t.netRating), t.conference]]));
  /* the source's 2020 ratings for five CAA teams are broken (William & Mary +556, James Madison −205; Oct 10 audit): a net beyond ±45
     isn't a basketball team, so it's dropped wherever it's read (player model, coach seasons, conference strength) */
  for (const m of Object.values(H.adj)) for (const v of Object.values(m)) if (v[0] != null && Math.abs(v[0]) > 45) v[0] = null;
  const D1 = new Set(adjS.map(t => t.teamId));
  const srsS = await cb("/ratings/srs", { season: S }); const SRS = Object.fromEntries(srsS.map(t => [t.teamId, t.rating]));
  if (!H.rec[S - 1]) { const rc = await cb("/recruiting/players", { year: S - 1 }); H.rec[S - 1] = rc.map(r => [normName(r.name), (r.committedTo || {}).id || null, r.rating, r.stars, r.ranking, r.heightInches, r.athleteId || null]) }
  /* the incoming class (off-season: recruits of year S, who play in S+1) */
  const recFresh = off ? await cb("/recruiting/players", { year: S }) : [];
  const ALL = { ...H.stats, [S]: rowsS };

  /* the NBA draft, each pick linked to a college player where we can */
  const draft = await cb("/draft/picks");
  const byNameTeam = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) { const k = normName(r.nm) + "|" + r.tm; (byNameTeam[k] = byNameTeam[k] || []).push(r) }
  const byName = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) (byName[normName(r.nm)] = byName[normName(r.nm)] || new Set()).add(r.id);
  const DRAFTED = {};                                            // athleteId → pick
  const ANY = new Set(); for (const rows of Object.values(ALL)) for (const r of rows) ANY.add(r.id);
  for (const d of draft) {
    let id = d.athleteId && ANY.has(d.athleteId) ? d.athleteId : null;
    if (!id && d.sourceTeamCollegeId) { const c = byNameTeam[normName(d.name) + "|" + d.sourceTeamCollegeId]; if (c) id = c.sort((a, b) => b.s - a.s)[0].id }
    if (!id && d.sourceTeamCollegeId) { const set = byName[normName(d.name)]; if (set && set.size === 1) id = [...set][0] }
    d._id = id; if (id && (!DRAFTED[id] || DRAFTED[id].overall > d.overall)) DRAFTED[id] = d;
  }
  log(`draft: ${draft.length} picks, ${Object.keys(DRAFTED).length} linked to college players`);

  /* NBA careers (job/cbbnba.mjs), joined on the ESPN id CBBD keeps for every college player */
  const sidToCbbd = {}; for (const rows of Object.values(ALL)) for (const r of rows) if (r.sid) sidToCbbd[r.sid] = r.id;
  for (const t of rosterS) for (const p of t.players || []) if (p.sourceId && !sidToCbbd[p.sourceId]) sidToCbbd[p.sourceId] = p.id;
  const nbaLive = (M >= 10 && now.getUTCDate() >= 20) || M >= 11 || M <= 6, curNba = M >= 10 ? (nbaLive ? Yr + 1 : Yr) : Yr;
  let NBA = {}; try { NBA = await buildNba({ getPack, putPack, log, full, curNba, live: nbaLive, sidToCbbd, draftById: DRAFTED }) } catch (e) { log("nba: " + e.message) }
  try { await buildNbaGames({ getPack, putPack, log, S, curNba: M >= 7 ? Yr + 1 : Yr, players: NBA }) } catch (e) { log("nba games: " + e.message) }
  /* an old NBA ESPN id can be a different person's college ESPN id (Tony Parker's 1015 matched a 2009 college player): the surnames must agree */
  { const nmOf = {}; for (const rows of Object.values(ALL)) for (const r of rows) if (r.sid) nmOf[r.sid] = r.nm;
    const sur = n => String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).map(w => w.replace(/[^a-z]/g, "")).filter(w => w && !/^(jr|sr|ii|iii|iv|v)$/.test(w)).pop() || "";
    let drop = 0; for (const eid of Object.keys(NBA)) { const c = nmOf[eid]; if (c && sur(c) !== sur(NBA[eid].nm)) { delete NBA[eid]; drop++ } } if (drop) log(`nba: ${drop} id matches dropped (names disagree)`) }
  const lastTeamOf = {}; for (const y of Object.keys(ALL).sort()) for (const r of ALL[y]) lastTeamOf[r.id] = [r.tm, +y];
  for (const X of Object.values(NBA)) { const lt = lastTeamOf[X.cid]; if (lt) { X.col = lt[0]; X.colY = lt[1] } }
  const NBA_BY_CID = {}; for (const [eid, X] of Object.entries(NBA)) NBA_BY_CID[X.cid] = { eid, tag: X.tag };

  /* recruits → athletes: the class year before a player's first season, by name and school */
  const REC = {};
  const firstSeason = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) firstSeason[r.id] = Math.min(firstSeason[r.id] || 9999, +y);
  const firstTeam = {}; for (const [y, rows] of Object.entries(ALL)) for (const r of rows) if (+y === firstSeason[r.id]) firstTeam[r.id] = r.tm;
  const recIx = {}; for (const [y, list] of Object.entries(H.rec)) for (const r of list) (recIx[r[0] + "|" + (+y + 1)] = recIx[r[0] + "|" + (+y + 1)] || []).push(r);
  /* Oct 11: CBBD's recruit rows carry the athlete id — match on it first; the name-and-school match stays as the fallback */
  const recById = {}; for (const list of Object.values(H.rec)) for (const r of list) if (r[6] != null) recById[String(r[6])] = r;
  let byId = 0, changed = 0;
  for (const [y, rows] of Object.entries(ALL)) for (const r of rows) {
    if (REC[r.id] !== undefined) continue;
    const fs = Math.min(firstSeason[r.id], H.start[r.id] || 9999);
    const idHit = recById[String(r.id)];
    if (idHit && process.env.REC_BY_ID === "1") { const c0 = recIx[normName(r.nm) + "|" + fs] || recIx[normName(r.nm) + "|" + (fs + 1)] || recIx[normName(r.nm) + "|" + (fs - 1)];
      const nameHit = c0 ? (c0.find(x => x[1] === firstTeam[r.id]) || (c0.length === 1 ? c0[0] : null)) : null; if (nameHit !== idHit) changed++; byId++; REC[r.id] = idHit; continue }
    const c = recIx[normName(r.nm) + "|" + fs] || recIx[normName(r.nm) + "|" + (fs + 1)] || recIx[normName(r.nm) + "|" + (fs - 1)];
    REC[r.id] = c ? (c.find(x => x[1] === firstTeam[r.id]) || (c.length === 1 ? c[0] : null)) : null;
  }
  log(`recruits: ${byId} matched by athlete id (${changed} differ from the old name match), the rest by name and school`); console.log(`::notice title=cbb recruits::${byId} matched by athlete id, ${changed} differ from the old name match`);

  /* every player-season → features */
  const confNet = {}; for (const [y, m] of Object.entries(H.adj)) { const by = {}; for (const [, [n, c]] of Object.entries(m)) (by[c] = by[c] || []).push(n || 0); confNet[y] = Object.fromEntries(Object.entries(by).map(([c, a]) => [c, a.reduce((x, z) => x + z, 0) / a.length])) }
  const posHt = { G: 75, F: 79, C: 82 };
  function featuresOf(r, yr) {
    const d = derive(r), a = (H.adj[r.s] || {})[r.tm] || [null, null], ht = (H.ht[r.id] || [])[0], rc = REC[r.id];
    Object.assign(d, { yr, y1: yr === 1 ? 1 : 0, y2: yr === 2 ? 1 : 0, y3: yr === 3 ? 1 : 0, ht: ht || posHt[r.pos] || 78, htMiss: ht ? 0 : 1, net: a[0] ?? -10, confNet: (confNet[r.s] || {})[a[1]] ?? -10, rec: rc ? (rc[2] || 0) : 0, recMiss: rc ? 0 : 1, ptsYr: d.pts40 / yr, blkHt: d.blk40 * ((ht || 78) - 70) / 10 });
    /* five positions (Oct 9 — Sam: "narrow down our ratings and draft profiles more granularly than just the 3 positions") */
    d.p5 = pos5({ pos: r.pos, ht: ht || null, d }); d.pPG = d.p5 === "PG" ? 1 : 0; d.pSG = d.p5 === "SG" ? 1 : 0; d.pSF = d.p5 === "SF" ? 1 : 0; d.pPF = d.p5 === "PF" ? 1 : 0;
    return d;
  }
  const yrOf = r => Math.max(1, Math.min(5, r.s - Math.min(firstSeason[r.id] || r.s, H.start[r.id] || 9999) + 1));
  const TRAIN_FROM = 2012, KNOWN_TO = S - 3;                     // a season's outcome is known three drafts later
  const hist = [];
  for (let y = TRAIN_FROM; y <= S; y++) for (const r of (ALL[y] || [])) {
    if (r.min < 100 || !(H.adj[y] || {})[r.tm]) continue;
    const yr = yrOf(r), d = featuresOf(r, yr), pk = DRAFTED[r.id];
    const later = pk && pk.year >= y;                               // drafted at or after this season
    hist.push({ r, yr, d, x: featVec(d), dr: later ? 1 : 0, r1: later && pk.overall <= 30 ? 1 : 0, lot: later && pk.overall <= 14 ? 1 : 0, pk: later ? pk : null });
  }
  /* standardize on the training rows */
  const train = hist.filter(h => h.r.s <= KNOWN_TO && h.r.min >= 150);
  const mu = FEATS.map((_, j) => train.reduce((a, h) => a + h.x[j], 0) / train.length);
  const sd = FEATS.map((_, j) => Math.sqrt(train.reduce((a, h) => a + (h.x[j] - mu[j]) ** 2, 0) / train.length) || 1);
  const Z = x => x.map((v, j) => (v - mu[j]) / sd[j]);
  for (const h of hist) h.z = Z(h.x);

  /* the held-out test: fit on 2012–2018, score 2019–(S−3), never seen */
  const TEST_FROM = Math.min(2019, KNOWN_TO - 2);
  const tr0 = train.filter(h => h.r.s < TEST_FROM), te0 = train.filter(h => h.r.s >= TEST_FROM);
  const fit = (rows, key) => fitLogistic(rows.map(h => h.z), rows.map(h => h[key]), { epochs: 400 });
  const wt = { dr: fit(tr0, "dr"), r1: fit(tr0, "r1"), lot: fit(tr0, "lot") };
  const score = (w, h) => .25 * predict(w.dr, h.z) + .45 * predict(w.r1, h.z) + .30 * predict(w.lot, h.z);
  const tScores = te0.map(h => score(wt, h));
  const test = { seasons: `${TEST_FROM}–${KNOWN_TO}`, trainSeasons: `${TRAIN_FROM}–${TEST_FROM - 1}`, n: te0.length,
    aucDrafted: r3(auc(te0.map(h => predict(wt.dr, h.z)), te0.map(h => h.dr))), aucR1: r3(auc(te0.map(h => predict(wt.r1, h.z)), te0.map(h => h.r1))), aucLottery: r3(auc(te0.map(h => predict(wt.lot, h.z)), te0.map(h => h.lot))) };
  /* top-N hit rate per test season: of each season's top 30 grades, how many were drafted / first-rounders */
  { const per = {}; te0.forEach((h, i) => (per[h.r.s] = per[h.r.s] || []).push([tScores[i], h])); const rows = [];
    for (const [y, a] of Object.entries(per)) { a.sort((p, q) => q[0] - p[0]); const top = a.slice(0, 30).map(p => p[1]); const drafted = a.filter(p => p[1].dr).length;
      rows.push({ season: +y, top30Drafted: top.filter(h => h.dr).length, top30R1: top.filter(h => h.r1).length, draftedInSeason: drafted }) }
    test.bySeason = rows.sort((a, b) => a.season - b.season) }
  log(`held-out test ${test.seasons}: AUC drafted ${test.aucDrafted}, first round ${test.aucR1}, lottery ${test.aucLottery}`);
  /* the board's fit: every season with a known outcome */
  const W = { dr: fit(train, "dr"), r1: fit(train, "r1"), lot: fit(train, "lot") };
  for (const h of hist) { h.pD = predict(W.dr, h.z); h.pR1 = predict(W.r1, h.z); h.pL = predict(W.lot, h.z); h.m = .25 * h.pD + .45 * h.pR1 + .30 * h.pL }
  /* the 0–100 grade: percentile of the combined chance among every player-season since 2012 */
  const allM = hist.filter(h => h.r.min >= 150).map(h => h.m).sort((a, b) => a - b);
  const pct0 = m => { let lo = 0, hi = allM.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (allM[mid] < m) lo = mid + 1; else hi = mid } return 100 * lo / allM.length };
  const pct = pct0;
  /* spread the top: 1 − (1 − percentile)^0.35, so the ~2% who get drafted aren't all a 99 (99.99th pct → 96, 99.5th → 85, 97.5th → 73,
     90th → 55, 50th → 22) */
  const grade = m => Math.min(99, Math.round(100 * (1 - Math.pow(1 - pct(m) / 100.0001, .35))));
  const PROF = ["Lottery", "Round 1", "Round 2", "Fringe", "Undrafted"];
  const profileOf = h => h.pL >= .4 ? "Lottery" : h.pR1 >= .45 ? "Round 1" : h.pD >= .45 ? "Round 2" : h.pD >= .15 ? "Fringe" : "Undrafted";

  /* the freshmen fit: recruiting rank alone → drafted / first round / lottery (classes with a known outcome) */
  const recRows = [];
  for (const [y, list] of Object.entries(H.rec)) { if (+y + 1 > KNOWN_TO || +y < 2009) continue;
    for (const r of list) { if (!r[2]) continue; const ids = byName[r[0]]; let id = null; if (ids) for (const c of ids) if (firstTeam[c] === r[1] || ids.size === 1) id = c; const pk = id && DRAFTED[id];
      recRows.push({ x: [r[2] || 0, Math.log(r[4] || 300), r[3] || 0], dr: pk ? 1 : 0, r1: pk && pk.overall <= 30 ? 1 : 0, lot: pk && pk.overall <= 14 ? 1 : 0 }) } }
  const rmu = [0, 1, 2].map(j => recRows.reduce((a, h) => a + h.x[j], 0) / (recRows.length || 1)), rsd = [0, 1, 2].map(j => Math.sqrt(recRows.reduce((a, h) => a + (h.x[j] - rmu[j]) ** 2, 0) / (recRows.length || 1)) || 1);
  const RZ = x => x.map((v, j) => (v - rmu[j]) / rsd[j]); recRows.forEach(h => h.z = RZ(h.x));
  const RW = recRows.length > 200 ? { dr: fit(recRows, "dr"), r1: fit(recRows, "r1"), lot: fit(recRows, "lot") } : null;

  /* comparison bands: what drafted (by range) and undrafted players looked like, by position and class */
  const BAND_STATS = ["pts40", "reb40", "ast40", "stl40", "blk40", "tov40", "ts", "tpp", "tpr", "ftp", "ftr", "usg", "ortg", "ws40", "porp", "ht", "net"];
  const bands = {};
  for (const h of hist) { if (h.r.s > KNOWN_TO || h.r.min < 400) continue;
    const b = h.lot ? "L" : h.r1 ? "R1" : h.dr ? "R2" : "U"; const k = h.d.p5 + Math.min(4, h.yr);
    const B = (bands[k] = bands[k] || { L: { n: 0 }, R1: { n: 0 }, R2: { n: 0 }, U: { n: 0 } })[b]; B.n++; for (const s of BAND_STATS) B[s] = (B[s] || 0) + h.d[s] }
  for (const k in bands) for (const b in bands[k]) { const B = bands[k][b]; for (const s of BAND_STATS) B[s] = B.n ? r3(B[s] / B.n) : null }
  /* percentiles by position (the Grade column): 21 cut points per stat */
  const QS = {};
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) { const rows = hist.filter(h => h.d.p5 === pos && h.r.min >= 400 && h.r.s <= S - 1); QS[pos] = {};
    for (const s of BAND_STATS) { const v = rows.map(h => h.d[s]).sort((a, b) => a - b); QS[pos][s] = Array.from({ length: 21 }, (_, i) => r3(v[Math.min(v.length - 1, Math.floor(i / 20 * (v.length - 1)))])) } }

  /* comps: the six closest past player-seasons, same position, class within one */
  const CF = ["pts40", "reb40", "ast40", "stl40", "blk40", "tov40", "ts", "tpr", "tpp", "ftr", "usg", "ht", "ws40", "net"], CW = [1.3, 1, 1.1, .7, .8, .6, 1, .9, .6, .5, .9, 1, .9, .6];
  const pool0 = hist.filter(h => h.r.s < S && h.r.min >= 400);
  const cmu = CF.map(k => pool0.reduce((a, h) => a + h.d[k], 0) / pool0.length), csd = CF.map((k, j) => Math.sqrt(pool0.reduce((a, h) => a + (h.d[k] - cmu[j]) ** 2, 0) / pool0.length) || 1);
  const cvec = d => CF.map((k, j) => (d[k] - cmu[j]) / csd[j] * CW[j]);
  for (const h of pool0) h.cv = cvec(h.d);
  const byPos = { PG: [], SG: [], SF: [], PF: [], C: [] }; for (const h of pool0) byPos[h.d.p5].push(h);
  const outcome = h => { const pk = DRAFTED[h.r.id], nb = NBA_BY_CID[h.r.id]; if (pk) return { y: pk.year, pk: pk.overall, nba: pk.draftTeam, tag: nb ? nb.tag.t : null };
    if (nb) return { u: 1, tag: nb.tag.t }; return h.r.s <= KNOWN_TO ? { u: 1 } : { tbd: 1 } };
  function comps(h) {
    const v = cvec(h.d), out = [];
    for (const c of byPos[h.d.p5]) { if (c.r.id === h.r.id || Math.abs(c.yr - h.yr) > 1) continue; let d2 = 0; for (let j = 0; j < v.length; j++) d2 += (v[j] - c.cv[j]) ** 2; out.push([d2, c]) }
    out.sort((a, b) => a[0] - b[0]); const seen = new Set(), res = [];
    for (const [d2, c] of out) { if (seen.has(c.r.id)) continue; seen.add(c.r.id); res.push({ id: c.r.id, nm: c.r.nm, s: c.r.s, tm: c.r.tm, yr: c.yr, sim: Math.max(1, Math.round(100 * Math.exp(-d2 / 14))), ...outcome(c) }); if (res.length >= 6) break }
    return res;
  }

  /* ---------- the board ---------- */
  const portal = await cb("/recruiting/portal", { year: S });
  const portalNext = [];
  const PORT = {}; for (const p of portal) { const nm = normName(p.firstName + " " + p.lastName), from = (p.origin || {}).id; const c = byNameTeam[nm + "|" + from]; if (c) PORT[c[0].id] = p }
  const lastRow = {}; for (const r of rowsS) if (!lastRow[r.id] || r.min > lastRow[r.id].min) lastRow[r.id] = r;
  const H_S = Object.fromEntries(hist.filter(h => h.r.s === S).map(h => [h.r.id + "|" + h.r.tm, h]));
  const board = [];
  const CLS = ["FR", "SO", "JR", "SR", "GR"];
  /* career totals (every Division I season since 2008) — the tiles show last season and the career side by side */
  const CAR = {}; for (const [y, rows] of Object.entries(ALL)) for (const x of rows) { if (!x.g) continue; const c = CAR[x.id] = CAR[x.id] || { g: 0, gs: 0, n: 0, min: 0, pts: 0 }; c.g += x.g; c.gs += x.gs; c.n++; c.min += x.min; c.pts += x.pts }
  const statEntry = (r, h, tm, extra = {}) => { const pt = PORT[r.id], ro = RO[r.id] || {}, hw = H.ht[r.id] || [], rc = REC[r.id], yrNext = Math.min(5, off ? h.yr + 1 : h.yr);
    return { id: r.id, nm: r.nm, pos: r.pos, posFull: ro.posFull || "", tm, from: tm !== r.tm ? r.tm : null, portal: pt ? { to: pt.destination ? pt.destination.id : null, toName: pt.destination ? pt.destination.name : null, el: pt.eligibility || null } : null,
      cls: CLS[Math.min(4, yrNext - 1)], yr: yrNext, ht: hw[0] || null, wt: hw[1] || null, home: ro.home || "", jersey: ro.jersey || "",
      rec: rc ? { r: r3(rc[2]), st: rc[3], rk: rc[4] } : null,
      s: { g: r.g, gs: r.gs, min: r.min, pts: r.pts, reb: r.reb, orb: r.orb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf, fgm: r.fgm, fga: r.fga, tpm: r.tpm, tpa: r.tpa, ftm: r.ftm, fta: r.fta, usg: r1(r.usg), ortg: r1(r.ortg), drtg: r1(r.drtg), porp: r1(r.porp), ws: r1(r.ws), ws40: r3(r.ws40), wso: r1(r.wso), wsd: r1(r.wsd) },
      d: Object.fromEntries(BAND_STATS.map(k => [k, r3(h.d[k])])),
      g: { score: grade(h.m), pD: r3(h.pD), pR1: r3(h.pR1), pL: r3(h.pL), prof: profileOf(h) },
      comps: r.min >= 250 ? comps(h) : [], p5: h.d.p5, car: CAR[r.id] || null, ...extra } };
  const recGrade = rc => { const z = RZ([rc.rating || 0, Math.log(rc.ranking || 300), rc.stars || 0]); const pD = predict(RW.dr, z), pR1 = predict(RW.r1, z), pL = predict(RW.lot, z), m = .25 * pD + .45 * pR1 + .30 * pL;
    return { score: grade(m), pD: r3(pD), pR1: r3(pR1), pL: r3(pL), prof: profileOf({ pD, pR1, pL }), recOnly: 1 } };
  /* ESPN's current rosters are the truth for who is where (job/cbbespn.mjs): every listed player, his stats from last season wherever he
     played them, incoming freshmen graded from their recruiting rank, anyone else listed with no grade yet */
  let ESPN = { rosters: {} }; try { ESPN = await fetchRosters({ teams: teamsRaw.filter(t => D1.has(t.id)), log }) } catch (e) { log("ESPN rosters: " + e.message) }
  const useEspn = Object.keys(ESPN.rosters).length >= .8 * D1.size;   /* most of Division I answered */
  const rowByName = {}; for (const r of rowsS) (rowByName[normName(r.nm)] = rowByName[normName(r.nm)] || []).push(r);
  const recByName = {}; for (const rc of recFresh) recByName[normName(rc.name)] = rc;
  const usedRec = new Set();
  if (useEspn) { const USED = new Set();
    for (const [tidS, list] of Object.entries(ESPN.rosters)) { const tid = +tidS;
      for (const a of list) {
        let cid = sidToCbbd[a.eid] || null; let r = cid ? lastRow[cid] : null;
        /* no id match: the same name on this team, or a portal move from elsewhere to this team (a bare name match across the country put
           one Trent Perry's stats on another) */
        if (!r) { const c = (rowByName[normName(a.nm)] || []).filter(x => x.tm === tid || (PORT[x.id] && PORT[x.id].destination && PORT[x.id].destination.id === tid)); if (c.length === 1) { r = lastRow[c[0].id] || c[0]; cid = r.id } }
        if (r && USED.has(r.id)) r = null; if (r) USED.add(r.id);
        const h = r ? H_S[r.id + "|" + r.tm] : null;
        const espn = { cls: a.cls || undefined, jersey: a.jersey || undefined, inj: a.inj || undefined, eid: a.eid };
        if (r && h && r.min >= 20) { const e = statEntry(r, h, tid, {}); /* class: ours (seasons played) — ESPN's preseason lists still carry last season's class */ if (a.jersey) e.jersey = a.jersey; if (a.inj) e.inj = a.inj; if (a.ht && !e.ht) e.ht = a.ht; if (a.wt && !e.wt) e.wt = a.wt; e.eid = a.eid; board.push(e); continue }
        const rc = recByName[normName(a.nm)];
        if (rc && RW && !usedRec.has(rc.id) && ((rc.committedTo || {}).id === tid || !a.cls || a.cls === "FR")) { usedRec.add(rc.id);   /* the recruit must be headed here (two Marcus Johnsons shared one recruit id) */
          board.push({ id: "r" + rc.id, eid: a.eid, nm: a.nm, pos: posGroup(rc.position || a.pos), posFull: rc.position || a.pos || "", tm: tid, from: (rc.committedTo || {}).id && rc.committedTo.id !== tid ? rc.committedTo.id : null, fr: 1, cls: a.cls || "FR", yr: 1,
          ht: a.ht || rc.heightInches || null, wt: a.wt || rc.weightPounds || null, home: a.home || (rc.hometown ? [rc.hometown.city, rc.hometown.state].filter(Boolean).join(", ") : ""), hs: rc.school || "", jersey: a.jersey || "", inj: a.inj || undefined,
          rec: { r: r3(rc.rating), st: rc.stars, rk: rc.ranking }, s: null, d: { ht: a.ht || rc.heightInches || null }, g: recGrade(rc), comps: [] }); continue }
        /* listed, but no Division I stats and not a ranked recruit (walk-ons, internationals, players from other levels) */
        board.push({ id: "e" + a.eid, eid: a.eid, nm: a.nm, pos: posGroup(a.pos), posFull: a.pos || "", tm: tid, from: null, cls: a.cls || "FR", yr: 1, ht: a.ht, wt: a.wt, home: a.home, jersey: a.jersey || "", inj: a.inj || undefined, nodata: 1, s: null, d: { ht: a.ht }, g: { score: 0, pD: 0, pR1: 0, pL: 0, prof: "Undrafted", none: 1 }, comps: [] });
      } }
  } else for (const r of Object.values(lastRow)) {
    /* no ESPN lists: last season's players, minus NBA draftees and (off-season) anyone out of eligibility (four seasons played, or five since his first) */
    if (r.min < 100 || !D1.has(r.tm)) continue;
    const h = H_S[r.id + "|" + r.tm]; if (!h) continue;
    const pk = DRAFTED[r.id]; if (off && pk && pk.year >= S) continue;
    const played = Object.values(ALL).filter(rows => rows.some(x => x.id === r.id && x.g > 0)).length; if (off && (played >= 4 || h.yr >= 5)) continue;
    const pt = PORT[r.id]; const nowTeam = off && pt && pt.destination && pt.destination.id ? pt.destination.id : r.tm;
    board.push(statEntry(r, h, nowTeam));
  }
  /* incoming freshmen (off-season only): graded on recruiting rank alone until they play */
  if (off && RW && !useEspn) for (const rc of recFresh) {
    const to = (rc.committedTo || {}).id; if (!to || !D1.has(to) || !rc.rating) continue;
    const z = RZ([rc.rating || 0, Math.log(rc.ranking || 300), rc.stars || 0]); const pD = predict(RW.dr, z), pR1 = predict(RW.r1, z), pL = predict(RW.lot, z), m = .25 * pD + .45 * pR1 + .30 * pL;
    board.push({ id: "r" + rc.id, nm: rc.name, pos: posGroup(rc.position), posFull: rc.position || "", tm: to, from: null, fr: 1, cls: "FR", yr: 1, ht: rc.heightInches || null, wt: rc.weightPounds || null,
      home: rc.hometown ? [rc.hometown.city, rc.hometown.state].filter(Boolean).join(", ") : "", hs: rc.school || "", rec: { r: r3(rc.rating), st: rc.stars, rk: rc.ranking },
      s: null, d: { ht: rc.heightInches || null }, g: { score: grade(m), pD: r3(pD), pR1: r3(pR1), pL: r3(pL), prof: profileOf({ pD, pR1, pL }), recOnly: 1 }, comps: [] });
  }
  for (const p of board) if (!p.p5) p.p5 = pos5({ pos: p.pos, ht: p.ht, d: p.s ? p.d : null, listed: p.posFull });
  board.sort((a, b) => b.g.score - a.g.score || (b.g.pR1 - a.g.pR1) || (a.nodata ? 1 : 0) - (b.nodata ? 1 : 0));
  /* the tags are capped by rank, so a class can't have far more "lottery" or "first round" players than a draft takes from college
     (about 11 of the 14 lottery picks and 24 of 30 first-rounders have been college players since 2015) */
  const CAP = [18, 36, 72, 140];
  board.forEach((p, i) => { const capIx = CAP.findIndex(c => i < c); const capLab = capIx < 0 ? 4 : capIx; const mine = PROF.indexOf(p.g.prof); p.g.prof = PROF[Math.max(mine, capLab)] });
  log(`board: ${board.length} players (${board.filter(p => p.fr).length} incoming freshmen)`);

  /* careers: every season of every board player */
  const careers = {};
  const ids = new Set(board.map(p => p.id));
  for (const [y, rows] of Object.entries(ALL)) for (const r of rows) if (ids.has(r.id) && r.min > 0)
    (careers[r.id] = careers[r.id] || []).push([+y, r.tm, r.g, r.gs, r.min, r.pts, r.reb, r.ast, r.stl, r.blk, r.tov, r.fgm, r.fga, r.tpm, r.tpa, r.ftm, r.fta, r1(r.usg), r1(r.ortg), r1(r.ws), r3(r.ws40)]);
  for (const k in careers) careers[k].sort((a, b) => a[0] - b[0]);

  /* ---------- teams ---------- */
  const games = [];
  for (const y of off ? [S, S + 1] : [S]) for (const [a, b] of ranges(y, 31)) games.push(...await cb("/games", { season: y, startDateRange: a, endDateRange: b }));   /* CBBD answers at most 3,000 rows: a month at a time */
  const seen = new Set(), G = games.filter(g => !seen.has(g.id) && seen.add(g.id));
  const isAP = p => /ap/i.test(p.pollType || "");
  const polls = (await cb("/rankings", { season: NEXT }).catch(() => [])).filter(isAP);
  const pollsLast = off ? (await cb("/rankings", { season: S }).catch(() => [])).filter(isAP) : [];
  const latestPoll = arr => { if (!arr.length) return {}; const wk = Math.max(...arr.map(p => (p.seasonType === "postseason" ? 100 : 0) + (p.week || 0))); return Object.fromEntries(arr.filter(p => (p.seasonType === "postseason" ? 100 : 0) + (p.week || 0) === wk).map(p => [p.teamId, p.ranking])) };
  const AP = latestPoll(polls), APlast = latestPoll(pollsLast);
  const tstats = await cb("/stats/team/season", { season: S });
  const TST = Object.fromEntries(tstats.map(t => [t.teamId, t]));
  /* conference-tournament games, so conference records are the regular season only */
  const TOURN = confTourneyIds(G.filter(g => g.season === S).map(g => [g.id, String(g.startDate).slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0]), id => (TEAM[id] || {}).conference || (ADJ[id] || {}).conference);
  const teams = {};
  for (const id of D1) {
    const t = TEAM[id] || {}, a = ADJ[id] || {}, ts = TST[id] || {};
    const gs = G.filter(g => g.season === S && (g.homeTeamId === id || g.awayTeamId === id) && g.status === "final");
    let w = 0, l = 0, cw = 0, cl = 0; const res = [];
    for (const g of gs.sort((p, q) => new Date(p.startDate) - new Date(q.startDate))) { const home = g.homeTeamId === id; const won = home ? g.homeWinner : g.awayWinner; won ? w++ : l++; if (g.conferenceGame && g.seasonType !== "postseason" && !g.tournament && !TOURN.has(g.id)) won ? cw++ : cl++;   /* conference record: not the conference tournament */
      res.push([g.startDate.slice(0, 10), home ? g.awayTeamId : g.homeTeamId, g.neutralSite ? 0 : home ? 1 : -1, home ? g.homePoints : g.awayPoints, home ? g.awayPoints : g.homePoints, g.tournament || (g.seasonType === "postseason" ? "Post" : "")]) }
    const next = G.filter(g => g.season === NEXT && NEXT !== S && (g.homeTeamId === id || g.awayTeamId === id)).sort((p, q) => new Date(p.startDate) - new Date(q.startDate)).map(g => { const home = g.homeTeamId === id; return [g.startDate.slice(0, 16), home ? g.awayTeamId : g.homeTeamId, g.neutralSite ? 0 : home ? 1 : -1, g.status, home ? g.homePoints : g.awayPoints, home ? g.awayPoints : g.homePoints] });
    const u = ts.teamStats || {}, o = ts.opponentStats || {};
    teams[id] = { id, nm: t.school, mascot: t.mascot, ab: t.abbreviation, c1: t.primaryColor, c2: t.secondaryColor, conf: t.conference || a.conference, venue: t.currentVenue, city: [t.currentCity, t.currentState].filter(Boolean).join(", "),
      adj: a.offensiveRating ? { o: r1(a.offensiveRating), d: r1(a.defensiveRating), n: r1(a.netRating), ro: (a.rankings || {}).offense, rd: (a.rankings || {}).defense, rn: (a.rankings || {}).net } : null, srs: r1(SRS[id]),
      rec: [w, l, cw, cl], ap: AP[id] || null, apLast: APlast[id] || null, pace: r1(ts.pace),
      ff: u.fourFactors ? { efg: r1(u.fourFactors.effectiveFieldGoalPct), tov: r1(pctOf(u.fourFactors.turnoverRatio)), orb: r1(u.fourFactors.offensiveReboundPct), ftr: r1(u.fourFactors.freeThrowRate), oefg: r1((o.fourFactors || {}).effectiveFieldGoalPct), otov: r1(pctOf((o.fourFactors || {}).turnoverRatio)), oorb: r1((o.fourFactors || {}).offensiveReboundPct), oftr: r1((o.fourFactors || {}).freeThrowRate) } : null,
      games: res, next, roster: board.filter(p => p.tm === id).map(p => p.id),
      recruits: recFresh.filter(r => (r.committedTo || {}).id === id).map(r => ({ nm: r.name, pos: r.position, st: r.stars, rk: r.ranking, r: r3(r.rating), ht: r.heightInches })),
      portalIn: [...portal, ...portalNext].filter(p => p.destination && p.destination.id === id).map(p => ({ nm: p.firstName + " " + p.lastName, pos: p.position, from: (p.origin || {}).name, st: p.stars, y: p.year })),
      portalOut: [...portal, ...portalNext].filter(p => p.origin && p.origin.id === id).map(p => ({ nm: p.firstName + " " + p.lastName, pos: p.position, to: p.destination ? p.destination.name : null, st: p.stars, y: p.year })),
      nba: draft.filter(d => d.sourceTeamCollegeId === id).map(d => [d.year, d.overall, d.name, d.draftTeam]).sort((a, b) => b[0] - a[0] || a[1] - b[1]) };
  }
  log(`teams: ${Object.keys(teams).length} Division I`);

  /* ---------- games: lines, TV, our pick, series, splits, game logs (job/cbbgames.mjs) ---------- */
  const GM = await buildGames({ cb, getPack, putPack, log, S, NEXT, off, G, D1, full, teamList: teamsRaw.filter(t => D1.has(t.id)), adj: H.adj });
  /* NCAA tournament runs since 2008, for the "Name the run" game (job/cbbncaa.mjs) */
  let NCAA = null; try { NCAA = await buildNcaaRuns({ cb, getPack, putPack, log, S, full }) } catch (e) { log("ncaa runs: " + e.message) }
  /* NBA draft combine measurements since 2001 (job/cbbcombine.mjs) */
  try { await buildCombine({ getPack, putPack, log, S, full }) } catch (e) { log("combine: " + e.message) }

  /* the last ten finished seasons, for the season picker (job/cbbpast.mjs) */
  try { const curGames = G.filter(g => g.season === S && g.status === "final").map(g => [g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, null, null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
    await buildPast({ cb, getPack, putPack, log, S, off, full, hist, grade, profileOf, H, NCAA, curGames }) } catch (e) { log("past seasons: " + e.message) }

  /* ---------- shot charts ---------- */
  /* this season: the full play-by-play engine (minutes, on/off, clutch, comebacks, lineups … — job/cbbpbp.mjs), which writes the shot
     chart too; earlier seasons keep their shooting-only charts */
  /* context for the on-court numbers: each opponent's adjusted net (quality of competition) and each teammate's win shares per 40 */
  const pbpCtx = { adjNet: Object.fromEntries(Object.entries(H.adj[S] || {}).map(([k, v]) => [k, v[0]])), rating: Object.fromEntries(rowsS.filter(r => r.min >= 150 && r.ws40 != null).map(r => [r.id, r.ws40])) };
  /* height and position (0 = PG … 4 = C) for matching defenders to attackers */
  pbpCtx.size = {}; { const PI = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 }; for (const h of hist) if (h.r.s <= S && (!pbpCtx.size[h.r.id] || h.r.s === S)) pbpCtx.size[h.r.id] = [(H.ht[h.r.id] || [])[0] || null, PI[h.d.p5] ?? 2] }
  const PB = await runPbp({ cb, getPack, putPack, log, S, G, D1, full, shots: { addShot, blankAgg, ZONES }, pool, ctx: pbpCtx, summary: fetchSummary });
  const SHOT_FROM = 2021;
  const shotSeasons = (full ? Array.from({ length: S - SHOT_FROM + 1 }, (_, i) => SHOT_FROM + i) : [S - 1]).filter(y => y !== S);
  for (const y of shotSeasons) {
    let P = full ? null : await getPack(`p${y}_cbb-shots`).catch(() => null);
    if (P && P.done) { log(`shots ${y}: complete`); continue }
    if (!P) P = { season: y, zones: ZONES, players: {}, teams: {}, gameIds: [], done: false };
    const have = new Set(P.gameIds);
    const yGames = y === S ? G.filter(g => g.season === y) : null;
    let dates;
    if (yGames && yGames.length) dates = [...new Set(yGames.filter(g => g.status === "final" && !have.has(g.id)).map(g => g.startDate.slice(0, 10)))].sort();
    else { dates = []; for (let d = new Date(Date.UTC(y - 1, 10, 1)); d <= new Date(Date.UTC(y, 3, 10)); d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10)) }
    log(`shots ${y}: ${dates.length} days to read`);
    let added = 0;
    await pool(dates, 4, async dt => {
      const plays = await cb("/plays/date", { date: dt, shootingPlaysOnly: "true" });
      const fresh = new Set();
      for (const p of plays) {
        if (have.has(p.gameId) || p.season !== y) continue; fresh.add(p.gameId);
        const sh = (p.shotInfo || {}).shooter || {}; if (!sh.id && !p.teamId) continue;
        if (sh.id) addShot(P.players[sh.id] = P.players[sh.id] || blankAgg(), p);
        if (p.teamId) { const T = P.teams[p.teamId] = P.teams[p.teamId] || { o: blankAgg(), d: blankAgg() }; addShot(T.o, p) }
        if (p.opponentId) { const T = P.teams[p.opponentId] = P.teams[p.opponentId] || { o: blankAgg(), d: blankAgg() }; addShot(T.d, p) }
      }
      for (const g of fresh) have.add(g); added += fresh.size;
    });
    P.gameIds = [...have];
    /* the Division I average by zone, for colouring the charts */
    const avg = ZONES.map(() => [0, 0]); for (const [id, T] of Object.entries(P.teams)) if (D1.has(+id)) T.o.z.forEach((v, i) => { avg[i][0] += v[0]; avg[i][1] += v[1] });
    P.avg = avg; P.through = new Date().toISOString().slice(0, 10);
    P.done = Date.now() > Date.UTC(y, 3, 20);
    /* players: only Division I players with 25+ shots are kept (the pack stays small) */
    const keep = {}; for (const [id, A] of Object.entries(P.players)) if (A.z.reduce((a, v) => a + v[1], 0) + A.r.reduce((a, v) => a + v[1], 0) >= 25 || A.ft[1] >= 25) keep[id] = A;
    P.players = keep;
    log(`shots ${y}: ${added} new games, ${Object.keys(keep).length} players`);
    await putPack(`p${y}_cbb-shots`, P);
  }

  /* ---------- publish ---------- */
  /* each pick's grade from his final college season before the draft (seasons after ${KNOWN_TO} were never in the fit) */
  const hBy = {}; for (const h of hist) (hBy[h.r.id] = hBy[h.r.id] || []).push(h);
  /* every NBA player's college seasons (Oct 10 — Sam: "do pro players not have profiles?" … "like college"): the College tab of his NBA page */
  { const want = new Set(Object.values(NBA).map(X => X.cid).filter(Boolean)), car = {};
    for (const [y, rows] of Object.entries(ALL)) for (const r of rows) if (want.has(r.id) && r.min > 0) (car[r.id] = car[r.id] || []).push([+y, r.tm, r.g, r.gs, r.min, r.pts, r.reb, r.ast, r.stl, r.blk, r.tov, r.fgm, r.fga, r.tpm, r.tpa, r.ftm, r.fta, r3(r.ws40)]);
    for (const X of Object.values(NBA)) if (car[X.cid]) X.car = car[X.cid].sort((a, b) => a[0] - b[0]) }
  /* each NBA player's final college season, for the Blind résumé game and his NBA profile */
  for (const X of Object.values(NBA)) { const a = (hBy[X.cid] || []).filter(h => h.r.min >= 200).sort((x, y) => y.r.s - x.r.s)[0];
    if (a) X.cl = { s: a.r.s, tm: a.r.tm, yr: a.yr, pos: a.r.pos, p5: a.d.p5, g: a.r.g, mpg: r1(a.d.mpg), grade: grade(a.m), prof: profileOf(a), pD: r3(a.pD), pR1: r3(a.pR1), pL: r3(a.pL), ...Object.fromEntries(["pts40", "reb40", "ast40", "stl40", "blk40", "tov40", "ts", "tpp", "tpr", "ftp", "usg", "ws40", "ht", "net"].map(k => [k, r3(a.d[k])])) } }
  const finalGrade = d => { const a = (hBy[d._id] || []).filter(h => h.r.s <= d.year).sort((x, y) => y.r.s - x.r.s || y.r.min - x.r.min)[0]; return a ? { g: grade(a.m), s: a.r.s, fresh: a.r.s > KNOWN_TO ? 1 : 0, p5: a.d.p5 } : null };
  const draftOut = draft.map(d => ({ y: d.year, pk: d.overall, rd: d.round, nm: d.name, nba: d.draftTeam, col: d.sourceTeamCollegeId || null, from: d.sourceTeamCollegeId ? null : [...new Set([d.sourceTeamLocation, d.sourceTeamName].filter(Boolean))].join(" "), rk: d.overallRank || null, pos: d.position, ht: d.height, id: d._id || null, our: d._id ? finalGrade(d) : null }));
  const meta = { built: Date.now(), season: S, next: NEXT, off, test, pickTest: GM.test, trainSeasons: `${TRAIN_FROM}–${KNOWN_TO}`, nTrain: train.length, recTrain: recRows.length, calls: CALLS, feats: FEATS };
  await putPack(`p${S}_cbb-core`, { meta, players: board, bands, qs: QS, bandStats: BAND_STATS, teamNames: Object.fromEntries(Object.entries(TEAM).map(([id, t]) => [id, [t.school, t.abbreviation, t.primaryColor]])) });
  await putPack(`p${S}_cbb-careers`, careers);
  await putPack(`p${S}_cbb-teams`, { season: S, next: NEXT, teams });
  await putPack(`p${S}_cbb-draft`, { picks: draftOut.map(d => ({ ...d, tag: d.id && NBA_BY_CID[d.id] ? NBA_BY_CID[d.id].tag.t : null })), test });
  await putPack(`p${S}_cbb-nba`, { curNba, players: NBA, cols: ["season", "team", "gp", "gs", "min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "playoffs[gp,gs,min,pts]"], carCols: ["season", "team", "g", "gs", "min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "ws40"] });
  await site("PUT", "/api/pack-index", { body: INDEX });
  const mins = ((Date.now() - started) / 60e3).toFixed(1);
  const msg = `Basketball · ${board.length} players · ${Object.keys(teams).length} teams · test AUC ${test.aucDrafted}/${test.aucR1}/${test.aucLottery} · ${CALLS} CBBD calls${LEFT != null ? ` (${LEFT.toLocaleString()} left)` : ""} · ${mins} min`;
  log(msg);
  console.log(`::notice title=cbb run::${String(msg).replace(/[\r\n]+/g, " ").slice(0, 3000)}`);
  await site("POST", "/api/job/report", { body: { kind: MODE, ok: true, message: msg, detail: { test, calls: CALLS }, started } }).catch(e => log("report failed: " + e.message));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(async e => {
  console.error("FAILED:", e.stack || e.message);
  await site("POST", "/api/job/report", { body: { kind: MODE, ok: false, message: ("Basketball job failed: " + e.message).slice(0, 900), started } }).catch(() => { });
  process.exit(1);
});
