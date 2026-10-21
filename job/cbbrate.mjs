/* Our own college basketball team ratings (Oct 21 — Sam: "would be very interesting, we certainly have more basketball data than
   football to do this"). Runs as a probe (MODE=probe PROBE=cbbrate); nothing is written to the site.

   Ratings like KenPom's, from the box scores: each game's points per 100 possessions for both teams. Offense (O) and defense (D, higher = better) are
   solved together so a team's numbers are adjusted for who it played and where (home court): points per 100 = league + O(team) −
   D(opponent) ± home edge. Pace the same way. Before each game day the ratings are solved from that season's games so far, started from
   last season's final ratings pulled toward average (worth K games), so nothing a game couldn't know at tip-off is used.

   The test, like cbbtest: train 2017–23, score blind on 2024, 2025, 2026 (log loss, Brier, right %, margin miss, and against the closing
   line where our number and the line differ by 3+). Sets compared:
     base     the site's pick today: CBBD Elo × season fraction, last season's CBBD adjusted net (one scale), home
     own      our rating: predicted margin from our O, D and pace before the game, plus home
     both     base + own
   And a plain one: our predicted margin straight against the margin, next to the closing line's. */
import { configure, cb, getPack } from "./cbb.mjs";
import { pickX, seasonFrac, fitPick, pickP, pickM, ranges, pickLine, homeCover } from "./cbbgames.mjs";

let K = 6, PULL = .6;   /* read again in run(): a probe module is imported once, so env set for a later probe must be read at run time */

/* solve O, D, pace for every team from a list of team-games; prior: { tid: [o, d, pace] } (already pulled to average) */
function solve(games, prior, k) {
  const T = new Map(); const get = t => { if (!T.has(t)) T.set(t, { o: 0, d: 0, p: 0, g: [] }); return T.get(t) };
  let sumPts = 0, sumPos = 0, sumPace = 0, n = 0;
  for (const g of games) { sumPts += g.pf; sumPos += g.poss; sumPace += g.poss; n++; get(g.t).g.push(g); get(g.opp) }
  if (!n) return { T, lg: 100, lp: 68, h: 0 };
  const lg = 100 * sumPts / sumPos, lp = sumPace / n;
  for (const [t, r] of T) { const q = prior[t]; if (q) { r.o = q[0]; r.d = q[1]; r.p = q[2] } }
  let h = 1.5;
  for (let it = 0; it < 30; it++) {
    let hs = 0, hn = 0;
    for (const [t, r] of T) {
      const q = prior[t] || [0, 0, 0];
      let so = 0, sd = 0, sp = 0; const m = r.g.length;
      for (const g of r.g) { const op = T.get(g.opp); const loc = g.home * h / 2;   /* home +1, road −1, neutral 0 */
        so += 100 * g.pf / g.poss - lg + op.d - loc;              /* what his offense did, given the defense it faced */
        sd += lg + op.o - loc - 100 * g.pa / g.poss;              /* what his defense held them to, given the offense */
        sp += g.poss - lp - op.p }
      r.o = (so + k * q[0]) / (m + k); r.d = (sd + k * q[1]) / (m + k); r.p = (sp + k * q[2]) / (m + k) }
    { let mo = 0, md = 0, mp = 0; for (const r of T.values()) { mo += r.o; md += r.d; mp += r.p } const c = T.size; for (const r of T.values()) { r.o -= mo / c; r.d -= md / c; r.p -= mp / c } }   /* O and D only matter as differences: keep both centered on 0 */
    for (const g of games) if (g.home === 1) { const a = T.get(g.t), b = T.get(g.opp); hs += (100 * (g.pf - g.pa) / g.poss) - ((a.o - b.d) - (b.o - a.d)); hn++ }
    if (hn) h = Math.max(0, Math.min(8, hs / hn));
  }
  return { T, lg, lp, h };
}
const margin = (R, h, a, home) => { const A = R.T.get(h), B = R.T.get(a); if (!A || !B) return null;
  const pace = R.lp + A.p + B.p, net = (A.o - B.d) - (B.o - A.d) + (home ? R.h : 0); return net * pace / 100 };

export async function run({ site, token, log = console.log }) {
  K = +(process.env.RATE_K || 6); PULL = +(process.env.RATE_PULL || .6);
  configure({ site, token: process.env.JOB_TOKEN || token, mode: "cbb" });
  const GH = await getPack("p2000_cbb-ghist"), HI = await getPack("p2000_cbb-hist");
  if (!GH || !HI) return { ok: false, error: "history packs missing" };
  const S = 2026, Y0 = 2016;
  const adj = HI.adj;
  /* last winter's games and lines aren't in the history pack yet (it holds finished seasons up to the one before): read them here, like cbbtest */
  if (!GH.seasons[S]) { const rows = []; for (const [a, b] of ranges(S, 31)) for (const g of await cb("/games", { season: S, startDateRange: a, endDateRange: b })) if (g.status === "final")
    rows.push([g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null]);
    const seen = new Set(); GH.seasons[S] = rows.filter(r => !seen.has(r[0]) && seen.add(r[0])) }
  if (!GH.lines[S]) { GH.lines[S] = {}; for (const [a, b] of ranges(S, 31)) for (const l of await cb("/lines", { season: S, startDateRange: a, endDateRange: b })) { const L = pickLine(l.lines); if (L && L.sp != null) GH.lines[S][l.gameId] = [L.sp, L.ou] } }
  /* box scores: possessions and points by game and team */
  const BOX = globalThis.__CBBRATE_BOX || (globalThis.__CBBRATE_BOX = {}); let sample = null;
  for (let y = Y0; y <= S; y++) { if (BOX[y]) continue; BOX[y] = {}; for (const [a, b] of ranges(y, 14)) for (const t of await cb("/games/teams", { season: y, startDateRange: a, endDateRange: b })) {
    const u = t.teamStats || {}; if (!sample) sample = Object.keys(u).join(",");
    const fga = (u.fieldGoals || {}).attempted, orb = (u.rebounds || {}).offensive, tov = (u.turnovers || {}).total ?? u.turnovers, fta = (u.freeThrows || {}).attempted;
    const est = fga != null && fta != null ? fga - (orb || 0) + (typeof tov === "number" ? tov : 0) + .475 * fta : null;
    const poss = typeof u.possessions === "number" && u.possessions > 40 ? u.possessions : est;
    (BOX[y][t.gameId] = BOX[y][t.gameId] || {})[t.teamId] = poss }
    log(`cbbrate: box ${y} · ${Object.keys(BOX[y]).length} games`) }
  log("cbbrate: team box keys: " + sample);

  const rows = [], FINAL = {};
  for (let y = Y0; y <= S; y++) {
    const L = (GH.seasons[y] || []).filter(r => r[4] != null).slice().sort((a, b) => a[1].localeCompare(b[1]));
    /* prior: last season's final ours, pulled toward average */
    const prior = {}; for (const [t, r] of (FINAL[y - 1] ? FINAL[y - 1].T : new Map())) prior[t] = [r.o * PULL, r.d * PULL, r.p * PULL];
    const past = []; let R = solve([], prior, K), day = null;
    for (const r of L) {
      const [gid, date, h, a, hs, as, neu] = r;
      if (date !== day) { R = solve(past, prior, K); day = date }
      const home = neu ? 0 : 1, B = (BOX[y] || {})[gid] || {};
      const own = y > Y0 ? margin(R, h, a, home) : null;
      const x = pickX(r[8] != null && r[9] != null ? r[8] - r[9] : 0, (adj[y - 1] || {})[h] && (adj[y - 1] || {})[a] ? adj[y - 1][h][0] - adj[y - 1][a][0] : 0, home, seasonFrac(date + "T00:00:00Z", y));
      if (own != null) rows.push({ y, gid, x, own, won: hs > as ? 1 : 0, m: hs - as, ln: (GH.lines[y] || {})[gid] || null });
      const ph = B[h], pa = B[a], poss = ph && pa ? (ph + pa) / 2 : ph || pa;
      if (poss && poss > 40 && poss < 110) { past.push({ t: h, opp: a, pf: hs, pa: as, poss, home }); past.push({ t: a, opp: h, pf: as, pa: hs, poss, home: -home }) }
    }
    FINAL[y] = solve(past, prior, K);
    const top = [...FINAL[y].T.entries()].map(([t, q]) => [t, q.o + q.d]).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([t, v]) => `${t}:${v.toFixed(1)}`).join(" ");
    log(`cbbrate: ${y} · ${L.length} games · home edge ${FINAL[y].h.toFixed(2)}/100 · top ${top}`);
  }
  const TEST = [2024, 2025, 2026], train = rows.filter(r => r.y < TEST[0]);
  const score = (P, R, X) => { let ll = 0, br = 0, right = 0, mae = 0, atsN = 0, ats = 0; for (const r of R) { const x = X(r), p = Math.min(1 - 1e-6, Math.max(1e-6, pickP(P, x))), mg = pickM(P, x);
      ll -= r.won * Math.log(p) + (1 - r.won) * Math.log(1 - p); br += (p - r.won) ** 2; right += (p >= .5) === (r.won === 1) ? 1 : 0; mae += Math.abs(mg - r.m);
      if (r.ln && r.ln[0] != null && r.ln[0] !== 0) { const our = -mg; if (Math.abs(our - r.ln[0]) >= 3) { const c = homeCover(r.m, 0, r.ln[0]); if (c !== .5) { atsN++; ats += our < r.ln[0] ? c : 1 - c } } } }
    const n = R.length; return { ll: +(ll / n).toFixed(4), br: +(br / n).toFixed(4), right: +(right / n).toFixed(4), mae: +(mae / n).toFixed(2), ats: atsN ? `${(100 * ats / atsN).toFixed(1)}% of ${atsN}` : "—" } };
  const SETS = { base: r => r.x, own: r => [1, r.own / 10, r.x[4]], both: r => [...r.x, r.own / 10] };
  const out = {};
  for (const [name, X] of Object.entries(SETS)) { const P = fitPick(train.map(r => [X(r), r.won, r.m]));
    out[name] = { w: P.w.map(v => +v.toFixed(4)), mw: P.mw.map(v => +v.toFixed(4)), ...Object.fromEntries(TEST.map(y => [y, score(P, rows.filter(r => r.y === y), X)])) } }
  /* raw: our margin, and the closing line, straight against the result (games with a line) */
  const raw = {}; for (const y of TEST) { const R = rows.filter(r => r.y === y && r.ln && r.ln[0] != null); let a = 0, b = 0; for (const r of R) { a += Math.abs(r.own - r.m); b += Math.abs(-r.ln[0] - r.m) }
    raw[y] = { games: R.length, oursMiss: +(a / R.length).toFixed(2), lineMiss: +(b / R.length).toFixed(2) } }
  const better = ["own", "both"].filter(k => TEST.every(y => out[k][y].ll < out.base[y].ll));
  return { ok: true, K, PULL, train: `2017–23 (${train.length} games)`, out, raw, betterEverySeason: better };
}

/* ---------- the site's own ratings (Oct 21 — Sam: "ok but seems it went well"), the setting that tested best: K 3, last season × 0.8 ----------
   Blind test (train 2017–23): log loss 2024 .5636 → .5363, 2025 .5343 → .5220, 2026 .5477 → .5279; margin miss 10.3/10.1/10.4 → 9.4/9.4/9.5.
   The win chance and margin come from the fit on our predicted margin (own/10) and home: */
export const OWN = { K: 3, PULL: .8, w: [0.1007, 1.4493, -0.2938], mw: [0.1853, 10.3654, -1.6053] };
export const ownPick = (marginRaw, home) => { const x = [1, marginRaw / 10, home ? 1 : 0]; let z = 0, m = 0; for (let i = 0; i < 3; i++) { z += OWN.w[i] * x[i]; m += OWN.mw[i] * x[i] } return { p: 1 / (1 + Math.exp(-z)), m } };
const possOf = u => { const fga = (u.fieldGoals || {}).attempted, orb = (u.rebounds || {}).offensive, tov = (u.turnovers || {}).total ?? u.turnovers, fta = (u.freeThrows || {}).attempted;
  const est = fga != null && fta != null ? fga - (orb || 0) + (typeof tov === "number" ? tov : 0) + .475 * fta : null;
  return typeof u.possessions === "number" && u.possessions > 40 ? u.possessions : est };
async function possFor(cb, y, until) { const B = {}; for (const [a, b] of ranges(y, 14)) { if (until && Date.parse(a) > until) break;
  for (const t of await cb("/games/teams", { season: y, startDateRange: a, endDateRange: b })) (B[t.gameId] = B[t.gameId] || {})[t.teamId] = possOf(t.teamStats || {}) } return B }
const teamGames = (rows, B) => { const past = [];
  for (const [gid, , h, a, hs, as, neu] of rows) { if (hs == null || as == null) continue; const q = B[gid] || {}, ph = q[h], pa = q[a], poss = ph && pa ? (ph + pa) / 2 : ph || pa; if (!(poss > 40 && poss < 110)) continue;
    const home = neu ? 0 : 1; past.push({ t: h, opp: a, pf: hs, pa: as, poss, home }, { t: a, opp: h, pf: as, pa: hs, poss, home: -home }) } return past };
/* every finished season's final ratings are worked out once and kept (p2000_cbb-own); this season's are solved each run from its games so far,
   starting from last season's × 0.8. Returns { by: { teamId: [off, def, net, tempo, rank, offRank, defRank, games] }, pick(h, a, home) } */
export async function ownRatings({ cb, getPack, putPack, log, NEXT, G }) {
  let C = await getPack("p2000_cbb-own").catch(() => null); if (!C || C.v !== 2 || C.K !== OWN.K || C.PULL !== OWN.PULL) C = { v: 2, K: OWN.K, PULL: OWN.PULL, fin: {}, base: {} };
  const GH = await getPack("p2000_cbb-ghist").catch(() => null), Y0 = 2015;
  const rowsOf = y => (GH && GH.seasons && GH.seasons[y]) || G.filter(g => g.season === y && g.status === "final").map(g => [g.id, String(g.startDate).slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0]);
  const priorOf = y => { const f = C.fin[y - 1]; const p = {}; if (f) for (const [t, q] of Object.entries(f)) p[t] = [q[0] * OWN.PULL, q[1] * OWN.PULL, q[2] * OWN.PULL]; return p };
  let changed = 0;
  for (let y = Y0; y < NEXT; y++) { if (C.fin[y]) continue; const rows = rowsOf(y); if (!rows.length) continue;
    const R = solve(teamGames(rows, await possFor(cb, y)), priorOf(y), OWN.K);
    C.fin[y] = Object.fromEntries([...R.T.entries()].map(([t, q]) => [t, [+q.o.toFixed(2), +q.d.toFixed(2), +q.p.toFixed(2), q.g.length]])); C.base[y] = [+R.lg.toFixed(2), +R.lp.toFixed(2)]; changed++; log(`own ratings: ${y} kept (${rows.length} games)`) }
  if (changed) await putPack("p2000_cbb-own", C);
  const cur = G.filter(g => g.season === NEXT && g.status === "final").map(g => [g.id, String(g.startDate).slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0]);
  const past = cur.length ? teamGames(cur, await possFor(cb, NEXT, Date.now())) : [];
  const prior = priorOf(NEXT); const R = solve(past, prior, OWN.K);
  for (const t of Object.keys(prior)) if (!R.T.has(+t) && !R.T.has(t)) { const q = prior[t]; R.T.set(+t, { o: q[0], d: q[1], p: q[2], g: [] }) }
  const lg = past.length ? R.lg : 104, lp = past.length ? R.lp : 68;
  const show = (T, lg, lp) => { const ent = [...T.entries()], rk = f => { const s = ent.map(([t, q]) => [t, f(q)]).sort((a, b) => b[1] - a[1]); return Object.fromEntries(s.map(([t], i) => [t, i + 1])) };
    const rN = rk(q => q.o + q.d), rO = rk(q => q.o), rD = rk(q => q.d), r1 = v => Math.round(v * 10) / 10;
    return Object.fromEntries(ent.map(([t, q]) => [t, [r1(lg + q.o), r1(lg - q.d), r1(q.o + q.d), r1(lp + q.p), rN[t], rO[t], rD[t], q.g.length ?? q.n ?? 0]])) };
  /* a finished season's final ratings, the same shape (the off-season site shows last season) */
  const finBy = y => { const f = C.fin[y], b = C.base[y]; if (!f || !b) return null; return show(new Map(Object.entries(f).map(([t, q]) => [+t, { o: q[0], d: q[1], p: q[2], g: { length: q[3] || 0 } }])), b[0], b[1]) };
  const by = show(R.T, lg, lp);
  log(`own ratings: ${NEXT} from ${cur.length} games · home edge ${R.h.toFixed(2)}/100 · #1 ${Object.entries(by).find(([, v]) => v[4] === 1)?.[0]}`);
  return { by, finBy, h: past.length ? R.h : 3, pick: (h, a, home) => { const m = margin(past.length ? R : { ...R, h: 3, lp }, h, a, home); return m == null ? null : ownPick(m, home) } };
}
