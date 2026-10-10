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
   the margin, trained on earlier seasons and tested on the latest complete ones; the test is published with the games. */

import { buildCoachIds, coachRecords } from "./cbbcoach.mjs";
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
/* the pick: P(home wins) = σ(a + b·eloDiff + c·home); margin = d + e·eloDiff + f·home */
export function fitPick(rows) {
  /* rows: [eloDiff, home(1/0), homeWon(1/0), margin] — two-parameter-plus-intercept logistic by Newton steps, least squares for margin */
  let w = [0, 0, 0];
  for (let it = 0; it < 25; it++) {
    const g = [0, 0, 0], H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const [d, h, y] of rows) { const x = [1, d / 100, h]; const z = w[0] + w[1] * x[1] + w[2] * x[2]; const p = 1 / (1 + Math.exp(-z)); for (let i = 0; i < 3; i++) { g[i] += (y - p) * x[i]; for (let j = 0; j < 3; j++) H[i][j] -= p * (1 - p) * x[i] * x[j] } }
    const dw = solve3(H, g.map(v => -v)); for (let i = 0; i < 3; i++) w[i] += dw[i];
  }
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  for (const [d, h, , m] of rows) { const x = [1, d / 100, h]; for (let i = 0; i < 3; i++) { b[i] += x[i] * m; for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j] } }
  const mw = solve3(A, b);
  return { w, mw };
}
function solve3(A, b) { const M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / (M[c][c] || 1e-12); for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k] } } return M.map((r, i) => r[3] / (r[i] || 1e-12)) }
export const pickP = (P, eloDiff, home) => 1 / (1 + Math.exp(-(P.w[0] + P.w[1] * eloDiff / 100 + P.w[2] * home)));
export const pickM = (P, eloDiff, home) => P.mw[0] + P.mw[1] * eloDiff / 100 + P.mw[2] * home;

export async function buildGames({ cb, getPack, putPack, log, S, NEXT, off, G, D1, full, teamList, adj }) {
  /* ---- past seasons: results + lines (cached) ---- */
  let GH = full ? null : await getPack("p2000_cbb-ghist").catch(() => null);
  if (!GH || GH.through < S - 1 || GH.v !== 2) {
    GH = { v: 2, through: S - 1, seasons: {}, lines: {} };
    for (let y = 2008; y < S; y++) {
      const rows = [];
      for (const [a, b] of ranges(y, 31)) for (const g of await cb("/games", { season: y, startDateRange: a, endDateRange: b })) if (g.status === "final")
        rows.push([g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
      const seen = new Set(); GH.seasons[y] = rows.filter(r => !seen.has(r[0]) && seen.add(r[0]));
    }
    for (let y = Math.max(2014, S - 4); y < S; y++) { GH.lines[y] = {}; for (const [a, b] of ranges(y, 31)) for (const l of await cb("/lines", { season: y, startDateRange: a, endDateRange: b })) { const L = pickLine(l.lines); if (L && L.sp != null) GH.lines[y][l.gameId] = [L.sp, L.ou] } }
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
  const rowsOf = (list, lines) => list.filter(r => r[8] != null && r[9] != null).map(r => ({ d: r[8] - r[9], h: r[6] ? 0 : 1, y: r[4] > r[5] ? 1 : 0, m: r[4] - r[5], ln: lines && lines[r[0]] }));
  const sY = Object.keys(GH.seasons).map(Number).sort();
  const testYs = [S - 1, S].filter(y => off || y < S);
  const trainRows = sY.filter(y => y >= S - 8 && y < testYs[0]).flatMap(y => rowsOf(GH.seasons[y]));
  const curRows = G.filter(g => g.season === S && g.status === "final").map(g => [g.id, g.startDate.slice(0, 10), g.homeTeamId, g.awayTeamId, g.homePoints, g.awayPoints, g.neutralSite ? 1 : 0, g.conferenceGame ? 1 : 0, g.homeTeamEloStart ?? null, g.awayTeamEloStart ?? null, g.seasonType === "postseason" ? 1 : 0, g.tournament || null]);
  const curLines = Object.fromEntries(Object.entries(LINES).filter(([, L]) => L.sp != null).map(([k, L]) => [k, [L.sp, L.ou]]));
  const P0 = fitPick(trainRows.map(r => [r.d, r.h, r.y, r.m]));
  const test = { train: `${Math.max(2008, S - 8)}–${testYs[0] - 1}`, seasons: [] };
  for (const y of testYs) {
    const rows = rowsOf(y === S ? curRows : GH.seasons[y], y === S ? curLines : GH.lines[y]);
    if (!rows.length) continue;
    let right = 0, brier = 0, withLine = 0, lineRight = 0, ourRight = 0, ats = 0, atsN = 0, mae = 0;
    for (const r of rows) { const p = pickP(P0, r.d, r.h); right += (p >= .5) === (r.y === 1) ? 1 : 0; brier += (p - r.y) ** 2; mae += Math.abs(pickM(P0, r.d, r.h) - r.m);
      if (r.ln && r.ln[0] != null && r.ln[0] !== 0) { withLine++; lineRight += (r.ln[0] < 0) === (r.y === 1) ? 1 : 0; ourRight += (p >= .5) === (r.y === 1) ? 1 : 0;
        const our = -pickM(P0, r.d, r.h); if (Math.abs(our - r.ln[0]) >= 3) { atsN++; const homeSide = our < r.ln[0]; const c = homeCover(r.m, 0, r.ln[0]); if (c !== .5) ats += (homeSide ? c : 1 - c) } } }
    test.seasons.push({ season: y, games: rows.length, pickRight: r3(right / rows.length), brier: r3(brier / rows.length), marginMiss: r1(mae / rows.length), withLine, lineFavRight: withLine ? r3(lineRight / withLine) : null, ourRightSameGames: withLine ? r3(ourRight / withLine) : null, atsDisagree3: atsN, atsWin: atsN ? r3(ats / atsN) : null });
  }
  /* the pick the site uses: the same fit, now including the test seasons */
  const PK = fitPick([...trainRows, ...testYs.flatMap(y => rowsOf(y === S ? curRows : GH.seasons[y]))].map(r => [r.d, r.h, r.y, r.m]));
  log(`pick test: ${test.seasons.map(t => `${t.season} ${Math.round(100 * t.pickRight)}% right (Vegas favourite ${t.lineFavRight != null ? Math.round(100 * t.lineFavRight) + "%" : "—"})`).join(" · ")}`);
  /* latest Elo per team, for games that don't have one yet (next season): a quarter of the way back to 1500 between seasons */
  const lastElo = {};
  for (const g of [...G].filter(g => g.status === "final").sort((a, b) => a.startDate.localeCompare(b.startDate))) { if (g.homeTeamEloEnd != null) lastElo[g.homeTeamId] = g.homeTeamEloEnd; if (g.awayTeamEloEnd != null) lastElo[g.awayTeamId] = g.awayTeamEloEnd }
  const eloFor = (g, home) => { const v = home ? g.homeTeamEloStart : g.awayTeamEloStart; if (v != null) return v; const id = home ? g.homeTeamId : g.awayTeamId; const e = lastElo[id]; if (e == null) return null; return g.season > S ? 1500 + .75 * (e - 1500) : e };
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
    CO = coachRecords({ C: CI, seasons: { ...GH.seasons, [S]: curRows }, lines: { ...GH.lines, [S]: curLines }, adj, S });
    await putPack(`p${S}_cbb-coaches`, { season: S, next: NEXT, ...CO, bySeason: CI.seasons });
    log(`coaches: ${Object.keys(CO.coaches).length} with records, ${Object.keys(CO.current).length} current`) } catch (e) { log("coaches: " + e.message) }
  const coachOf = (tid, y) => { const m = CI && (CI.seasons[y] || CI.seasons[y - 1]); return m ? m[tid] || null : null };
  /* ---- games out ---- */
  const games = G.filter(g => D1.has(g.homeTeamId) || D1.has(g.awayTeamId)).map(g => {
    const he = eloFor(g, true), ae = eloFor(g, false), home = g.neutralSite ? 0 : 1;
    const p = he != null && ae != null ? pickP(PK, he - ae, home) : null, m = he != null && ae != null ? pickM(PK, he - ae, home) : null;
    return { id: g.id, s: g.season, d: g.startDate, tbd: g.startTimeTbd ? 1 : 0, h: g.homeTeamId, a: g.awayTeamId, hs: g.homePoints ?? null, as: g.awayPoints ?? null, st: g.status, n: g.neutralSite ? 1 : 0, c: g.conferenceGame ? 1 : 0,
      t: g.tournament || null, note: g.gameNotes || null, post: g.seasonType === "postseason" ? 1 : 0, hSeed: g.homeSeed ?? null, aSeed: g.awaySeed ?? null, venue: g.venue || null, city: [g.city, g.state].filter(Boolean).join(", "),
      tv: TV[g.id] || null, ln: LINES[g.id] || null, p: r3(p), m: r1(m), elo: [he != null ? Math.round(he) : null, ae != null ? Math.round(ae) : null],
      hr: g.season === S ? rankAt(g.homeTeamId, g.startDate.slice(0, 10)) : null, ar: g.season === S ? rankAt(g.awayTeamId, g.startDate.slice(0, 10)) : null,
      ser: seriesFor(g.homeTeamId, g.awayTeamId, g.startDate.slice(0, 10)), exc: r1(g.excitement), co: [coachOf(g.homeTeamId, g.season), coachOf(g.awayTeamId, g.season)] };
  });
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
      if (g.ln.ou != null) { const t = my + th; X.ou[t > g.ln.ou ? 0 : t < g.ln.ou ? 1 : 2] += .5 } }
    (X.l10 = X.l10 || []).push(won);
  }
  for (const id in SPL) { const l = (SPL[id].l10 || []).slice(-10); SPL[id].su.l10 = [l.filter(x => x).length, l.filter(x => !x).length, 0]; delete SPL[id].l10; SPL[id].ou = SPL[id].ou.map(Math.round) }
  for (const y of [S - 2, S - 1]) for (const r of GH.seasons[y] || []) { const L = (GH.lines[y] || {})[r[0]]; if (!L || L[0] == null || L[0] === 0) continue;
    for (const side of ["h", "a"]) { const me = side === "h" ? r[2] : r[3], my = side === "h" ? r[4] : r[5], th = side === "h" ? r[5] : r[4], sp = side === "h" ? L[0] : -L[0]; const c = homeCover(my, th, sp); const a = T(me).fd3[sp < 0 ? "fav" : "dog"]; a[c === 1 ? 0 : c === 0 ? 1 : 2]++ } }
  for (const g of done) for (const side of ["h", "a"]) { if (!g.ln || g.ln.sp == null || g.ln.sp === 0) continue; const me = g[side], my = side === "h" ? g.hs : g.as, th = side === "h" ? g.as : g.hs, sp = side === "h" ? g.ln.sp : -g.ln.sp; const c = homeCover(my, th, sp); const a = T(me).fd3[sp < 0 ? "fav" : "dog"]; a[c === 1 ? 0 : c === 0 ? 1 : 2]++ }

  /* ---- game logs: every team's and player's box score, season S ---- */
  let LG = full ? null : await getPack(`p${S}_cbb-logs`).catch(() => null);
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
      for (const p of t.players || []) { if (!p.minutes) continue;
        (LG.players[p.athleteId] = LG.players[p.athleteId] || []).push([t.gameId, (t.startDate || "").slice(0, 10), t.teamId, t.opponentId, t.neutralSite ? 0 : t.isHome ? 1 : -1, p.starter ? 1 : 0, p.minutes, p.points, (p.rebounds || {}).total ?? null, (p.rebounds || {}).offensive ?? null, p.assists, p.steals, p.blocks, p.turnovers, p.fouls,
          (p.fieldGoals || {}).made, (p.fieldGoals || {}).attempted, (p.threePointFieldGoals || {}).made, (p.threePointFieldGoals || {}).attempted, (p.freeThrows || {}).made, (p.freeThrows || {}).attempted, r1(p.gameScore), r1(p.offensiveRating), r1(p.usage)]) }
    /* newest copy of each game wins (a re-read after a stat correction replaces the old row) */
    const dedupe = rows => { const m = new Map(); for (const r of rows) m.set(r[0], r); return [...m.values()].sort((x, y) => x[1].localeCompare(y[1])) };
    for (const k in LG.teams) LG.teams[k] = dedupe(LG.teams[k]);
    for (const k in LG.players) LG.players[k] = dedupe(LG.players[k]);
    LG.done = Date.now() > Date.UTC(S, 3, 20);
    LG.cols = { team: ["gid", "date", "opp", "ha", "pts", "oppPts", "pace", "ortg", "drtg", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "orb", "reb", "ast", "tov", "stl", "blk", "paint", "fastbreak", "oppReb", "oppTov"],
      player: ["gid", "date", "team", "opp", "ha", "start", "min", "pts", "reb", "orb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "gameScore", "ortg", "usg"] };
    await putPack(`p${S}_cbb-logs`, LG);
    log(`logs: ${Object.keys(LG.teams).length} teams, ${Object.keys(LG.players).length} players`);
  }
  await putPack(`p${S}_cbb-games`, { season: S, next: NEXT, off, pick: { ...PK, test }, games, splits: SPL });
  log(`games: ${games.length} (${games.filter(g => g.ln).length} with a line, ${games.filter(g => g.tv).length} with TV)`);
  return { test, n: games.length };
}
