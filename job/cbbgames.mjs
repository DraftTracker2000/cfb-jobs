/* The basketball games side (Oct 9 — Sam: "the h2h isnt actual games … this really isnt like the football one"): every game with its
   line, TV, our pick, the series history and both teams' records and records against the spread, plus every player's and team's game
   log. Called from job/cbb.mjs.

   Packs:
     p{S}_cbb-games   every game of season S (and next season's schedule in the off-season): line (open and close), TV, our win chance
                      and line, Elo, series since 2008 with the last meetings, and each team's splits (straight up and against the
                      spread: home/away/neutral, conference, vs ranked, favourite/underdog, last 10; favourite/underdog over three seasons)
     p{S}_cbb-logs    every player's and every team's game-by-game box score for season S
     p2000_cbb-ghist  the job's cache of past seasons' results and lines (series and the pick's test)

   Our pick: Elo before the game (CBBD's own, game by game) and home court → a logistic fit for the win chance and a straight line for
   the margin, trained on earlier seasons and tested on the latest complete ones; the test is published with the games.
   Oct 11 (Sam: "build out basketbal with everything that works"): three more inputs, each of which lowered the blind log loss in every
   test season (2024, 2025, 2026 — job/cbbtest.mjs): each team's own home edge, rest (days since the last game, back-to-backs), and
   shooting luck (season to date: points a game opponents made above the league's 3-point and free-throw percentages, and the same for
   the team's own shooting). Together: log loss 0.548 → 0.545, 0.521 → 0.519, 0.536 → 0.533; right 72.4 → 73.0%, 73.9 → 74.4%, 73.0 → 73.0%.
   Altitude and time zones crossed were tried too and didn't help. */

import { buildCoachIds, coachRecords, dedupeCoachSeasons, buildTeamHist, wikiCoaches, trustWiki, repairLateHires, wikiRecords } from "./cbbcoach.mjs";
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r3 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
/* date ranges [a, b) that keep every answer under CBBD's 3,000-row cap */
export function ranges(season, days) {
  const out = []; let d = new Date(Date.UTC(season - 1, 9, 25)); const end = new Date(Date.UTC(season, 3, 25));
  while (d < end) { const e = new Date(d); e.setUTCDate(e.getUTCDate() + days); out.push([d.toISOString(), (e < end ? e : end).toISOString()]); d = e }
  return out;
}
/* home-relative spread → did the home team cover? 1 / 0 / 0.5 (push) */
export const homeCover = (hs, as, spread) => { const v = hs - as + spread; return v > 0 ? 1 : v < 0 ? 0 : .5 };
/* pick the line to use: consensus if present, else the first provider with a spread */
export function pickLine(lines) {
  if (!lines || !lines.length) return null;
  const L = lines.find(l => /consensus/i.test(l.provider) && l.spread != null) || lines.find(l => l.spread != null) || lines[0];
  return { sp: L.spread, ou: L.overUnder, sp0: L.spreadOpen ?? null, ou0: L.overUnderOpen ?? null, ml: [L.homeMoneyline ?? null, L.awayMoneyline ?? null], prov: L.provider };
}
/* the pick. CBBD's Elo starts every team at 1500 each November, so early in a season it knows little; last season's adjusted net
   rating carries the early games and Elo takes over as games are played. Features (x): Elo difference × how far into the season,
   last season's adjusted net difference × how early it is, the same prior on its own, and home court.
   P(home wins) = σ(w·x), margin = m·x (least squares). */
export const pickX = (eloDiff, priorDiff, home, frac) => [1, (eloDiff || 0) / 100 * frac, (priorDiff || 0) / 10 * (1 - frac), (priorDiff || 0) / 10, home];
export const seasonFrac = (dateIso, season) => Math.max(0, Math.min(1, (Date.parse(dateIso) - Date.UTC(season - 1, 10, 1)) / (70 * 864e5)));
function solveN(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / (M[c][c] || 1e-12); for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] } } return M.map((r, i) => r[n] / (r[i] || 1e-12)) }
export function fitPick(rows) {
  /* rows: [x, homeWon, margin] */
  const n = rows[0] ? rows[0][0].length : 5; let w = new Array(n).fill(0);
  for (let it = 0; it < 25; it++) { const g = new Array(n).fill(0), H = Array.from({ length: n }, () => new Array(n).fill(1e-6));
    for (const [x, y] of rows) { let z = 0; for (let i = 0; i < n; i++) z += w[i] * x[i]; const p = 1 / (1 + Math.exp(-z)); for (let i = 0; i < n; i++) { g[i] += (y - p) * x[i]; for (let j = 0; j < n; j++) H[i][j] += p * (1 - p) * x[i] * x[j] } }
    const dw = solveN(H, g); for (let i = 0; i < n; i++) w[i] += dw[i] }
  const A = Array.from({ length: n }, () => new Array(n).fill(1e-6)), b = new Array(n).fill(0);
  for (const [x, , m] of rows) for (let i = 0; i < n; i++) { b[i] += x[i] * m; for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j] }
  return { w, mw: solveN(A, b) };
}
export const pickP = (P, x) => { let z = 0; for (let i = 0; i < x.length; i++) z += P.w[i] * x[i]; return 1 / (1 + Math.exp(-z)) };
export const pickM = (P, x) => { let z = 0; for (let i = 0; i < x.length; i++) z += P.mw[i] * x[i]; return z };

/* the Oct 11 inputs for every game of a season, walking it in date order: [own home edge, rest gap, back-to-back gap, defense luck gap,
   offense luck gap] (home − away). list: rows [id, date, home, away, hs, as, neutral, conf, …] (unplayed games have hs null);
   seasons: every season's rows (for the home edge); box: { gid: { tid: [o3m, o3a, oftm, ofta, u3m, u3a, uftm, ufta] } }; lg: [3P%, FT%] */
export function extrasFor(y, list, seasons, box, lg) {
  const hcaC = {}, hcaOf = tid => { if (tid in hcaC) return hcaC[tid]; let hs = 0, hn = 0, as = 0, an = 0;
    for (let z = y - 3; z < y; z++) for (const r of seasons[z] || []) { if (r[6] || !r[7] || r[4] == null) continue; if (r[2] === tid) { hs += r[4] - r[5]; hn++ } else if (r[3] === tid) { as += r[5] - r[4]; an++ } }
    if (hn < 10 || an < 10) return hcaC[tid] = null; const n = Math.min(hn, an); return hcaC[tid] = (hs / hn - as / an) / 2 * n / (n + 40) };
  const L = list.slice().sort((a, b) => String(a[1]).localeCompare(String(b[1]))); const all = []; for (const r of L) for (const t of [r[2], r[3]]) { const h = hcaOf(t); if (h != null) all.push(h) }
  const hm = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0, last = {}, lk = {}, out = {}; const [p3, pf] = lg || [.34, .71];
  for (const r of L) { const [gid, date, h, a, hs, as, neu] = r, d = Date.parse(String(date).slice(0, 10)), home = neu ? 0 : 1;
    const rest = t => { const l = last[t]; return l == null ? 7 : Math.max(1, Math.min(7, Math.round((d - l) / 864e5))) }, rh = rest(h), ra = rest(a);
    const luck = t => { const o = lk[t]; return o && o.n >= 3 ? [o.d / o.n, o.o / o.n] : [0, 0] }, [dh, oh] = luck(h), [da, oa] = luck(a), hh = hcaOf(h);
    out[gid] = [home * ((hh ?? hm) - hm) / 3, (rh - ra) / 3, (rh === 1 ? 1 : 0) - (ra === 1 ? 1 : 0), (dh - da) / 5, (oh - oa) / 5];
    if (hs == null || as == null) continue; last[h] = d; last[a] = d;
    const B = box && box[gid]; if (B) for (const t of [h, a]) { const q = B[t]; if (!q || !q[1]) continue; const o = lk[t] = lk[t] || { n: 0, d: 0, o: 0 }; o.n++;
      o.d += 3 * (q[0] - p3 * q[1]) + ((q[2] || 0) - pf * (q[3] || 0)); o.o += 3 * (q[4] - p3 * q[5]) + ((q[6] || 0) - pf * (q[7] || 0)) } }
  return out;
}
/* team box-score shooting by game (for the luck input), cached in p2000_cbb-shoot; the season in progress is re-read each run */
async function shootingCache({ cb, getPack, putPack, log, S, full, off }) {
  let SH = full ? null : await getPack("p2000_cbb-shoot").catch(() => null); if (!SH || SH.v !== 1) SH = { v: 1, s: {}, lg: {} };
  let changed = false;
  for (let y = 2016; y <= S; y++) { if (SH.s[y] && (y < S || off)) continue; const B = {};   /* a finished season is read once */
    for (const [a, b] of ranges(y, 14)) for (const t of await cb("/games/teams", { season: y, startDateRange: a, endDateRange: b })) { const o = t.opponentStats || {}, u = t.teamStats || {}, f = (x, k) => (x[k] || {});
      (B[t.gameId] = B[t.gameId] || {})[t.teamId] = [f(o, "threePointFieldGoals").made, f(o, "threePointFieldGoals").attempted, f(o, "freeThrows").made, f(o, "freeThrows").attempted, f(u, "threePointFieldGoals").made, f(u, "threePointFieldGoals").attempted, f(u, "freeThrows").made, f(u, "freeThrows").attempted].map(v => v ?? 0) }
    let m3 = 0, a3 = 0, mf = 0, af = 0; for (const g of Object.values(B)) for (const q of Object.values(g)) { m3 += q[4]; a3 += q[5]; mf += q[6]; af += q[7] }
    SH.s[y] = B; SH.lg[y] = a3 && af ? [m3 / a3, mf / af] : [.34, .71]; changed = true }
  if (changed) await putPack("p2000_cbb-shoot", SH);
  log(`shooting cache: ${Object.keys(SH.s).length} seasons`); return SH;
}

export async function buildGames({ cb, getPack, putPack, log, S, NEXT, off, G, D1, full, teamList, adj }) {
  /* ---- past seasons: results + lines (cached) ---- */
  let GH = full ? null : await getPack("p2000_cbb-ghist").catch(() => null);
  if (!GH || GH.through < S - 1 || GH.v !== 2) {
    /* Oct 12: behind by the newly finished season(s) → add just those; a full rebuild only with no cache or a new format */
    const add = GH && GH.v === 2 && GH.seasons && GH.through < S - 1 ? GH.through + 1 : null;
    if (!add) GH = { v: 2, through: S - 1, seasons: {}, lines: {} }; else GH.through = S - 1;
    for (let y = add || 2008; y < S; y++) {
      const rows = [];
      for (const [a, b] of ranges(y, 31)) for (const g of await cb("/games", { season: y, startDateRange: a, endDateRange: b })) if (g.status === "final")
        rows.push([g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
      const seen = new Set(); GH.seasons[y] = rows.filter(r => !seen.has(r[0]) && seen.add(r[0]));
    }
    for (let y = Math.max(2014, S - 4, add || 0); y < S; y++) { GH.lines[y] = {}; for (const [a, b] of ranges(y, 31)) for (const l of await cb("/lines", { season: y, startDateRange: a, endDateRange: b })) { const L = pickLine(l.lines); if (L && L.sp != null) GH.lines[y][l.gameId] = [L.sp, L.ou] } }
    await putPack("p2000_cbb-ghist", GH);
  }
  /* ---- this season (and next season's schedule) ---- */
  const LINES = {}, TV = {};
  /* a finished season's lines and TV don't change: the off-season re-uses them from the last games pack */
  const prev = off && Date.now() > Date.UTC(S, 3, 20) && !full ? await getPack(`p${S}_cbb-games`).catch(() => null) : null;
  const prevS = prev && prev.games ? prev.games.filter(g => g.s === S) : [];
  if (prevS.length > 0) for (const g of prevS) { if (g.ln) LINES[g.id] = g.ln; if (g.tv) TV[g.id] = g.tv }
  for (const y of off ? (prevS.length > 0 ? [NEXT] : [S, NEXT]) : [S]) {
    for (const [a, b] of ranges(y, 31)) {
      for (const l of await cb("/lines", { season: y, startDateRange: a, endDateRange: b })) { const L = pickLine(l.lines); if (L) LINES[l.gameId] = L }
      for (const m of await cb("/games/media", { season: y, startDateRange: a, endDateRange: b })) TV[m.gameId] = (m.broadcasts || []).map(x => x.broadcastName).filter(Boolean).slice(0, 3).join(", ");
    }
  }
  /* ---- the pick: fit on older seasons, test on the newest complete ones ---- */
  /* last season's adjusted net for each team (the early-season prior) */
  const priorNet = (tid, season) => { const a = (adj[season - 1] || {})[tid]; return a ? a[0] : null };
  const xOf = (eh, ea, h, a, home, date, season) => { const ph = priorNet(h, season), pa = priorNet(a, season); return pickX(eh != null && ea != null ? eh - ea : 0, ph != null && pa != null ? ph - pa : 0, home, seasonFrac(date + "T00:00:00Z", season)) };
  const SH = await shootingCache({ cb, getPack, putPack, log, S, full, off }).catch(e => { log("shooting cache: " + e.message); return null });
  const EXc = {}, SEAS = () => ({ ...GH.seasons, [S]: (curRowsAll || []).filter(r => r[4] != null) });
  const exFor = (season, list) => EXc[season] = EXc[season] || extrasFor(season, list, SEAS(), SH && SH.s[season], SH && SH.lg[Math.min(season, S)]);
  const rowsOf = (list, lines, season) => { const EX = exFor(season, list); return list.filter(r => r[4] != null && r[5] != null).map(r => ({ x: [...xOf(r[8], r[9], r[2], r[3], r[6] ? 0 : 1, r[1], season), ...(EX[r[0]] || [0, 0, 0, 0, 0])], y: r[4] > r[5] ? 1 : 0, m: r[4] - r[5], ln: lines && lines[r[0]] })) };
  const sY = Object.keys(GH.seasons).map(Number).sort();
  const testYs = [S - 1, S].filter(y => off || y < S);
  const trainRows = sY.filter(y => y >= S - 8 && y < testYs[0]).flatMap(y => rowsOf(GH.seasons[y], null, y));
  const curRows = G.filter(g => g.season === S && g.status === "final").map(g => [g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
  /* every game of the season in progress (and next season's schedule), played or not, for the Oct 11 inputs */
  const asRow = g => [g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.status === "final" ? g.homePoints ?? null : null, g.status === "final" ? g.awayPoints ?? null : null, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null];
  var curRowsAll = G.filter(g => g.season === S).map(asRow); const nextRowsAll = G.filter(g => g.season !== S).map(asRow);
  const curLines = Object.fromEntries(Object.entries(LINES).filter(([, L]) => L.sp != null).map(([k, L]) => [k, [L.sp, L.ou]]));
  exFor(S, curRowsAll);   /* the season in progress walks every game, played or not (cached for the rows below) */
  const P0 = fitPick(trainRows.map(r => [r.x, r.y, r.m]));
  const test = { train: `${Math.max(2008, S - 8)}–${testYs[0] - 1}`, seasons: [] };
  for (const y of testYs) {
    const rows = rowsOf(y === S ? curRows : GH.seasons[y], y === S ? curLines : GH.lines[y], y);
    if (!rows.length) continue;
    let right = 0, brier = 0, withLine = 0, lineRight = 0, ourRight = 0, ats = 0, atsN = 0, mae = 0;
    for (const r of rows) { const p = pickP(P0, r.x); right += (p >= .5) === (r.y === 1) ? 1 : 0; brier += (p - r.y) ** 2; mae += Math.abs(pickM(P0, r.x) - r.m);
      if (r.ln && r.ln[0] != null && r.ln[0] !== 0) { withLine++; lineRight += (r.ln[0] < 0) === (r.y === 1) ? 1 : 0; ourRight += (p >= .5) === (r.y === 1) ? 1 : 0;
        const our = -pickM(P0, r.x); if (Math.abs(our - r.ln[0]) >= 3) { atsN++; const homeSide = our < r.ln[0]; const c = homeCover(r.m, 0, r.ln[0]); if (c !== .5) ats += (homeSide ? c : 1 - c) } } }
    test.seasons.push({ season: y, games: rows.length, pickRight: r3(right / rows.length), brier: r3(brier / rows.length), marginMiss: r1(mae / rows.length), withLine, lineFavRight: withLine ? r3(lineRight / withLine) : null, ourRightSameGames: withLine ? r3(ourRight / withLine) : null, atsDisagree3: atsN, atsWin: atsN ? r3(ats / atsN) : null });
  }
  /* the pick the site uses: the same fit, now including the test seasons */
  const PK = fitPick([...trainRows, ...testYs.flatMap(y => rowsOf(y === S ? curRows : GH.seasons[y], null, y))].map(r => [r.x, r.y, r.m]));
  /* this season's finished games are shown with a pick from a fit that never saw them (the live fit includes them) */
  const PKx = testYs.includes(S) ? fitPick([...trainRows, ...testYs.filter(y => y !== S).flatMap(y => rowsOf(GH.seasons[y], null, y))].map(r => [r.x, r.y, r.m])) : PK;
  log(`pick test: ${test.seasons.map(t => `${t.season} ${Math.round(100 * t.pickRight)}% right (Vegas favourite ${t.lineFavRight != null ? Math.round(100 * t.lineFavRight) + "%" : "—"})`).join(" · ")}`);
  /* ---- series since 2008 ---- */
  const pairKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
  const SER = {};
  for (const y of sY) for (const r of GH.seasons[y]) (SER[pairKey(r[2], r[3])] = SER[pairKey(r[2], r[3])] || []).push([r[1], r[2], r[3], r[4], r[5]]);
  for (const r of curRows) (SER[pairKey(r[2], r[3])] = SER[pairKey(r[2], r[3])] || []).push([r[1], r[2], r[3], r[4], r[5]]);
  const seriesFor = (h, a, before) => { const L = (SER[pairKey(h, a)] || []).filter(x => x[0] < before).sort((x, y) => x[0].localeCompare(y[0])); let hw = 0, aw = 0; for (const x of L) { const hWon = (x[1] === h) === (x[3] > x[4]); hWon ? hw++ : aw++ }
    return { h: hw, a: aw, last: L.slice(-5).reverse().map(x => [x[0], x[1] === h ? x[3] : x[4], x[1] === h ? x[4] : x[3]]) } };
  /* ---- polls week by week, for "vs ranked" ---- */
  const polls = (await cb("/rankings", { season: S }).catch(() => [])).filter(p => /ap/i.test(p.pollType || ""));
  const pollWeeks = {}; for (const p of polls) { const k = (p.pollDate || "").slice(0, 10); (pollWeeks[k] = pollWeeks[k] || {})[p.teamId] = p.ranking }
  const pollDates = Object.keys(pollWeeks).filter(Boolean).sort();
  const rankAt = (team, date) => { let k = null; for (const d of pollDates) if (d <= date) k = d; return k ? pollWeeks[k][team] || null : null };
  /* ---- head coaches (ESPN staff lists; records from our results — job/cbbcoach.mjs) ---- */
  let CO = { coaches: {}, current: {} }, CI = null;
  try { CI = await buildCoachIds({ getPack, putPack, log, teams: teamList, to: NEXT, full });
    { const Wp = await getPack("p2000_cbb-wiki").catch(() => null), nm0 = Object.fromEntries((teamList || []).map(t => [t.id, t.school]));
      const n = repairLateHires(CI, Wp && Wp.c, nm0); if (n) { log(`coaches: ${n} season(s) given back to the coach before a late hire`); await putPack("p2000_cbb-coachids", CI) } }
    CO = coachRecords({ C: CI, seasons: { ...GH.seasons, [S]: curRows }, lines: { ...GH.lines, [S]: curLines }, adj, S });
    /* style by season: adj O / D, pace, 3-point rate, turnovers forced, eFG for and against, offensive rebounding — with each season's D-I rank for pace */
    const TH = await buildTeamHist({ cb, getPack, putPack, log, S, full }).catch(e => { log("team history: " + e.message); return null });
    if (TH) for (const X of Object.values(CO.coaches)) for (const [y, s] of Object.entries(X.seasons)) { const row = (TH.seasons[y] || {})[s.tm]; if (!row) continue; s.st = row.map((v, i) => i < 2 && v != null && (v < 60 || v > 150) ? null : v);   /* cached broken ratings (2020 CAA) */
      const paces = Object.values(TH.seasons[y]).filter(r => r[0] != null).map(r => r[2]).filter(v => v != null);   /* Division I only (teams with an adjusted rating) */ if (row[2] != null) s.paceRk = paces.filter(v => v > row[2]).length + 1 }
    /* full careers from Wikipedia, for every coach with a current team */
    const nameOf = Object.fromEntries((teamList || []).map(t => [t.id, t.school]));
    const W = await wikiCoaches({ getPack, putPack, log, full, coaches: Object.entries(CO.current).map(([tid, cid]) => ({ cid, nm: (CO.coaches[cid] || {}).nm, school: nameOf[tid] || "" })).filter(c => c.nm) }).catch(e => { log("wikipedia: " + e.message); return null });
    if (W) for (const [cid, X] of Object.entries(CO.coaches)) { const w = trustWiki(W.c[cid], X.seasons); if (w) X.wiki = w }
    /* their whole careers season by season from the same pages (p2000_cbb-wikirec, read by the coach pages) */
    if (W) { const curSet = new Set(Object.values(CO.current)); await wikiRecords({ getPack, putPack, log, W, S, coaches: Object.entries(CO.coaches).map(([cid, X]) => ({ cid, seasons: X.seasons, names: nameOf, cur: curSet.has(cid) })) }).catch(e => log("wikipedia records: " + e.message)) }
    CI = { ...CI, seasons: dedupeCoachSeasons(CI.seasons) };   /* one team per coach per season everywhere, game cards too */
    await putPack(`p${S}_cbb-coaches`, { season: S, next: NEXT, ...CO, bySeason: CI.seasons });
    log(`coaches: ${Object.keys(CO.coaches).length} with records, ${Object.keys(CO.current).length} current`) } catch (e) { log("coaches: " + e.message) }
  const coachOf = (tid, y) => { const m = CI && (CI.seasons[y] || CI.seasons[y - 1]); return m ? m[tid] || null : null };
  /* ---- games out ---- */
  /* rest: days since each team's previous game (Sam: travel and rest) */
  const lastBy = {}, REST = {}; for (const g of G.slice().sort((x, y) => x.startDate.localeCompare(y.startDate))) { const d = Date.parse(g.startDate.slice(0, 10));
    REST[g.id] = [g.homeTeamId, g.awayTeamId].map(t => { const l = lastBy[t]; return l != null && d - l < 15 * 864e5 ? Math.round((d - l) / 864e5) : null }); lastBy[g.homeTeamId] = d; lastBy[g.awayTeamId] = d }
  const games = G.filter(g => D1.has(g.homeTeamId) || D1.has(g.awayTeamId)).map(g => {
    const he = g.homeTeamEloStart ?? null, ae = g.awayTeamEloStart ?? null, home = g.neutralSite ? 0 : 1;
    const x = [...xOf(he, ae, g.homeTeamId, g.awayTeamId, home, g.startDate.slice(0, 10), g.season), ...((g.season === S ? exFor(S, curRowsAll) : exFor(g.season, nextRowsAll))[g.id] || [0, 0, 0, 0, 0])];
    const known = (he != null && ae != null) || (priorNet(g.homeTeamId, g.season) != null && priorNet(g.awayTeamId, g.season) != null);
    const PKg = g.season === S && g.status === "final" ? PKx : PK; const p = known ? pickP(PKg, x) : null, m = known ? pickM(PKg, x) : null;
    /* what the pick is made of (Oct 11, #333 — "show the pick inputs"): our margin split into its parts, home team's points — Elo now,
       last season's adjusted net, home court, the team's own home edge, rest, and shooting luck; they add up to our margin */
    const pm = known && g.season === S ? (c => [c(1), c(2) + c(3), c(0) + c(4), c(5), c(6) + c(7), c(8) + c(9)].map(r1))(i => (PKg.mw[i] || 0) * (x[i] || 0)) : undefined;
    return { id: g.id, sid: g.sourceId ? String(g.sourceId) : undefined, s: g.season, d: g.startDate, tbd: g.startTimeTbd ? 1 : 0, h: g.homeTeamId, a: g.awayTeamId, hs: g.homePoints ?? null, as: g.awayPoints ?? null, st: g.status, n: g.neutralSite ? 1 : 0, c: g.conferenceGame ? 1 : 0,
      t: g.tournament || null, note: g.gameNotes || null, hh: Array.isArray(g.homePeriodPoints) && Array.isArray(g.awayPeriodPoints) && g.homePeriodPoints.length >= 2 ? [g.homePeriodPoints[0], g.homePeriodPoints[1], g.awayPeriodPoints[0], g.awayPeriodPoints[1]] : undefined, post: g.seasonType === "postseason" ? 1 : 0, hSeed: g.homeSeed ?? null, aSeed: g.awaySeed ?? null, venue: g.venue || null, city: [g.city, g.state].filter(Boolean).join(", "),
      tv: TV[g.id] || null, rest: REST[g.id] || null, ln: LINES[g.id] || null, p: r3(p), m: r1(m), elo: [he != null ? Math.round(he) : null, ae != null ? Math.round(ae) : null],
      hr: g.season === S ? rankAt(g.homeTeamId, g.startDate.slice(0, 10)) : null, ar: g.season === S ? rankAt(g.awayTeamId, g.startDate.slice(0, 10)) : null,
      ser: seriesFor(g.homeTeamId, g.awayTeamId, g.startDate.slice(0, 10)), exc: r1(g.excitement), pm, co: [coachOf(g.homeTeamId, g.season), coachOf(g.awayTeamId, g.season)] };
  });
  /* ---- each team's record and ATS entering every game of season S (finals show where the teams stood that day) ---- */
  { const rec = {}; for (const g of games.filter(g => g.s === S).sort((a, b) => a.d.localeCompare(b.d))) {
      const R = id => rec[id] = rec[id] || [0, 0, 0, 0]; g.recIn = [R(g.h).slice(), R(g.a).slice()];
      if (g.st === "final" && g.hs != null) { const hw = g.hs > g.as; R(g.h)[hw ? 0 : 1]++; R(g.a)[hw ? 1 : 0]++;
        if (g.ln && g.ln.sp != null && g.ln.sp !== 0) { const c = homeCover(g.hs, g.as, g.ln.sp); if (c === 1) { R(g.h)[2]++; R(g.a)[3]++ } else if (c === 0) { R(g.h)[3]++; R(g.a)[2]++ } } } } }
  /* ---- each team's splits: season S straight up and against the spread, and favourite/underdog against the spread over three seasons ---- */
  const SPL = {};
  const T = id => SPL[id] = SPL[id] || { su: {}, ats: {}, ou: [0, 0, 0], fd3: { fav: [0, 0, 0], dog: [0, 0, 0] } };
  const add = (o, k, v) => { const a = o[k] = o[k] || [0, 0, 0]; a[v === 1 ? 0 : v === 0 ? 1 : 2]++ };
  const done = games.filter(g => g.s === S && g.st === "final" && g.hs != null).sort((a, b) => a.d.localeCompare(b.d));
  for (const g of done) for (const side of ["h", "a"]) {
    const me = g[side], opp = side === "h" ? g.a : g.h, my = side === "h" ? g.hs : g.as, th = side === "h" ? g.as : g.hs, won = my > th ? 1 : 0, X = T(me);
    const where = g.n ? "neut" : side === "h" ? "home" : "away", oppRk = side === "h" ? g.ar : g.hr, sp = g.ln && g.ln.sp != null ? (side === "h" ? g.ln.sp : -g.ln.sp) : null;
    for (const k of ["all", where, g.c ? "conf" : "nonconf", oppRk ? "rk" : "unrk", g.post ? "post" : null].filter(Boolean)) add(X.su, k, won);
    if (sp != null && sp !== 0) { const cov = homeCover(my, th, sp); const fd = sp < 0 ? "fav" : "dog"; add(X.su, fd, won); for (const k of ["all", where, fd, g.c ? "conf" : "nonconf", oppRk ? "rk" : "unrk"]) add(X.ats, k, cov);
      if (g.ln.ou != null) { const t = my + th; X.ou[t > g.ln.ou ? 0 : t < g.ln.ou ? 1 : 2]++ } }
    (X.l10 = X.l10 || []).push(won);
  }
  for (const id in SPL) { const l = (SPL[id].l10 || []).slice(-10); SPL[id].su.l10 = [l.filter(x => x).length, l.filter(x => !x).length, 0]; delete SPL[id].l10; }
  for (const y of [S - 2, S - 1]) for (const r of GH.seasons[y] || []) { const L = (GH.lines[y] || {})[r[0]]; if (!L || L[0] == null || L[0] === 0) continue;
    for (const side of ["h", "a"]) { const me = side === "h" ? r[2] : r[3], my = side === "h" ? r[4] : r[5], th = side === "h" ? r[5] : r[4], sp = side === "h" ? L[0] : -L[0]; const c = homeCover(my, th, sp); const a = T(me).fd3[sp < 0 ? "fav" : "dog"]; a[c === 1 ? 0 : c === 0 ? 1 : 2]++ } }
  for (const g of done) for (const side of ["h", "a"]) { if (!g.ln || g.ln.sp == null || g.ln.sp === 0) continue; const me = g[side], my = side === "h" ? g.hs : g.as, th = side === "h" ? g.as : g.hs, sp = side === "h" ? g.ln.sp : -g.ln.sp; const c = homeCover(my, th, sp); const a = T(me).fd3[sp < 0 ? "fav" : "dog"]; a[c === 1 ? 0 : c === 0 ? 1 : 2]++ }

  /* ---- game logs: every team's and player's box score, season S ---- */
  let LG = full ? null : await getPack(`p${S}_cbb-logs`).catch(() => null);
  /* Oct 12 (Sam: per-game defensive rating "seems important for defensive rating"): logs written before the player rows carried CBBD's
     defensive and net rating are read again once */
  if (LG && LG.cols && LG.cols.player && !LG.cols.player.includes("drtg")) LG = null;
  if (!LG || !LG.done) {
    /* in season, only the last ten days are read again (stat corrections), the rest is kept from the last run */
    const keep = LG && LG.teams && Object.keys(LG.teams).length ? LG : null, since = Date.now() - 10 * 864e5;
    const recent = rr => keep ? rr.filter(([, b]) => Date.parse(b) >= since) : rr;
    LG = keep || { season: S, teams: {}, players: {}, done: false };
    for (const [a, b] of recent(ranges(S, 14))) for (const t of await cb("/games/teams", { season: S, startDateRange: a, endDateRange: b })) {
      const u = t.teamStats || {}, o = t.opponentStats || {};
      (LG.teams[t.teamId] = LG.teams[t.teamId] || []).push([t.gameId, (t.startDate || "").slice(0, 10), t.opponentId, t.neutralSite ? 0 : t.isHome ? 1 : -1, (u.points || {}).total ?? null, (o.points || {}).total ?? null, r1(t.pace), r1(u.rating), r1(o.rating),
        (u.fieldGoals || {}).made, (u.fieldGoals || {}).attempted, (u.threePointFieldGoals || {}).made, (u.threePointFieldGoals || {}).attempted, (u.freeThrows || {}).made, (u.freeThrows || {}).attempted,
        (u.rebounds || {}).offensive, (u.rebounds || {}).total, u.assists, (u.turnovers || {}).total ?? u.turnovers, u.steals, u.blocks, ((u.points || {}).inPaint) ?? null, ((u.points || {}).fastBreak) ?? null, (o.rebounds || {}).total, (o.turnovers || {}).total ?? o.turnovers]);
    }
    for (const [a, b] of recent(ranges(S, 7))) for (const t of await cb("/games/players", { season: S, startDateRange: a, endDateRange: b }))
      for (const p of t.players || []) { if (!p.minutes) continue; if (p.name) (LG.names = LG.names || {})[p.athleteId] = p.name;
        (LG.players[p.athleteId] = LG.players[p.athleteId] || []).push([t.gameId, (t.startDate || "").slice(0, 10), t.teamId, t.opponentId, t.neutralSite ? 0 : t.isHome ? 1 : -1, p.starter ? 1 : 0, p.minutes, p.points, (p.rebounds || {}).total ?? null, (p.rebounds || {}).offensive ?? null, p.assists, p.steals, p.blocks, p.turnovers, p.fouls,
          (p.fieldGoals || {}).made, (p.fieldGoals || {}).attempted, (p.threePointFieldGoals || {}).made, (p.threePointFieldGoals || {}).attempted, (p.freeThrows || {}).made, (p.freeThrows || {}).attempted, r1(p.gameScore), r1(p.offensiveRating), r1(p.usage), r1(p.defensiveRating), r1(p.netRating)]) }
    /* newest copy of each game wins (a re-read after a stat correction replaces the old row) */
    const dedupe = rows => { const m = new Map(); for (const r of rows) m.set(r[0], r); return [...m.values()].sort((x, y) => x[1].localeCompare(y[1])) };
    for (const k in LG.teams) LG.teams[k] = dedupe(LG.teams[k]);
    for (const k in LG.players) LG.players[k] = dedupe(LG.players[k]);
    LG.done = Date.now() > Date.UTC(S, 3, 20);
    LG.cols = { team: ["gid", "date", "opp", "ha", "pts", "oppPts", "pace", "ortg", "drtg", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "reb", "ast", "tov", "stl", "blk", "paint", "fastbreak", "oppReb", "oppTov"],
      player: ["gid", "date", "team", "opp", "ha", "start", "min", "pts", "reb", "orb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "gameScore", "ortg", "usg", "drtg", "net"] };
    await putPack(`p${S}_cbb-logs`, LG);
    log(`logs: ${Object.keys(LG.teams).length} teams, ${Object.keys(LG.players).length} players`);
  }
  /* every player's name with his logs (Oct 12 — Michigan's Ins & outs showed "?" for Howard Eisley Jr. and Charlie May: 12 and 19
     minutes all season, so in no other file the page reads); a finished season's logs written before this get them once */
  if (LG && !LG.names) { const st = await cb("/stats/player/season", { season: S }).catch(() => []); LG.names = Object.fromEntries(st.filter(r => r.name).map(r => [r.athleteId, r.name])); await putPack(`p${S}_cbb-logs`, LG); log(`logs: ${Object.keys(LG.names).length} names added`) }
  await putPack(`p${S}_cbb-games`, { season: S, next: NEXT, off, pick: { ...PK, test }, games, splits: SPL });
  log(`games: ${games.length} (${games.filter(g => g.ln).length} with a line, ${games.filter(g => g.tv).length} with TV)`);
  return { test, n: games.length };
}
