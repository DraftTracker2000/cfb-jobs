/* The basketball play-by-play engine (Oct 9 — Sam: "basketball with the depth charts and minutes alone should be able to be much more
   in-depth than the college football side … give me clutch stats for the point guards. close game and comeback numbers").

   Every CBBD play lists the ten players on the floor, the score, the clock and the home team's win probability after the play. One pass
   over a season's plays (one call per day, up to ~80 MB) gives, for every player:
     minutes · plus-minus and on/off (team scoring margin per 40 with him on vs off) · the clutch line (last 5 minutes of the second
     half or overtime, within 5 points: minutes, +/-, points, shooting, free throws, assists, turnovers, steals, rebounds) · late-game
     go-ahead makes and attempts while down 0–3 in the last 2 minutes · game-winners · win probability added (all game and clutch) ·
     first-half / second-half points · who he assists and who assists him
   and for every team:
     every game's arc (largest lead, largest deficit, halftime margin, lead changes, best run for and against) → comeback wins, blown
     leads, close-game and clutch records · clutch +/- · every five-man unit's minutes and margin · each player's minutes share
   Shot zones come from the same pass. Everything is a sum, so an in-season run only reads the new days and adds them in.

   Pack: p{S}_cbb-pbp (plus the season's p{S}_cbb-shots, written alongside). */

export const PBP_V = 2;   /* 2: player names and teams kept (Oct 9) */
const r1 = x => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const PERIOD = p => p <= 2 ? 1200 : 300;
const elapsedAt = (period, secLeft) => { let t = 0; for (let p = 1; p < period; p++) t += PERIOD(p); return t + PERIOD(period) - secLeft };
const TOV = /Turnover/i, REB = /Rebound/i, FOUL = /Foul/i;
const blankP = () => ({ min: 0, gp: 0, pm: 0, onF: 0, onA: 0, teamMin: 0, teamF: 0, teamA: 0,
  c: { min: 0, pm: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, ast: 0, tov: 0, stl: 0, reb: 0, g: 0 },
  late: { gam: 0, ga: 0, gw: 0 }, wpa: 0, cwpa: 0, h1: 0, h2: 0, ast: {}, fed: {} });
const blankT = () => ({ games: [], c: { pm: 0, min: 0 }, units: {}, mins: {} });

/* one game's plays → the accumulators */
export function processGame(plays, P, T, opts = {}) {
  plays = plays.slice().sort((a, b) => a.period - b.period || b.secondsRemaining - a.secondsRemaining || a.id - b.id);
  const first = plays.find(p => p.teamId != null && p.isHomeTeam != null); if (!first) return null;
  const home = first.isHomeTeam ? first.teamId : first.opponentId, away = first.isHomeTeam ? first.opponentId : first.teamId;
  const nameOf = {}; for (const p of plays) { if (p.teamId != null && p.team) nameOf[p.team] = p.teamId; if (p.opponentId != null && p.opponent) nameOf[p.opponent] = p.opponentId }
  const side = id => id === home ? "h" : id === away ? "a" : null;
  const tm = id => T[id] = T[id] || blankT();
  const pl = id => P[id] = P[id] || blankP();
  const seen = new Set();
  let hs = 0, as = 0, maxH = 0, minH = 0, half = null, leadCh = 0, lastLead = 0, runTeam = null, run = 0, bestRun = { h: 0, a: 0 }, lastWP = null, goAheadLast = null;
  const unitsOn = { h: null, a: null };
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i], nx = plays[i + 1];
    const floor = { h: [], a: [] };
    for (const f of p.onFloor || []) { const t = nameOf[f.team]; const s = side(t); if (s && f.id != null) { floor[s].push(f.id); if (i === 0 || !P[f.id] || !P[f.id].nm) pl(f.id).nm = f.name } }
    const marginH = hs - as;                                                        /* before this play */
    const clutchNow = p.period >= 2 && p.secondsRemaining <= 300 && Math.abs(marginH) <= 5;
    /* time until the next play: credited to whoever is on the floor now */
    let dt = 0; if (nx && nx.period === p.period) dt = Math.max(0, p.secondsRemaining - nx.secondsRemaining);
    if (dt > 0 && floor.h.length === 5 && floor.a.length === 5) {
      for (const s of ["h", "a"]) { const tid = s === "h" ? home : away, X = tm(tid); X._sec = (X._sec || 0) + dt; if (clutchNow) X.c.min += dt / 60;
        for (const id of floor[s]) { const Q = pl(id); Q.min += dt / 60; seen.add(id); Q._team = tid; X.mins[id] = (X.mins[id] || 0) + dt / 60; if (clutchNow) Q.c.min += dt / 60 }
        const key = floor[s].slice().sort((x, y) => x - y).join("-"); const U = X.units[key] = X.units[key] || [0, 0, 0]; U[0] += dt / 60 }
    }
    /* scoring: the score after this play vs before */
    const nh = p.homeScore ?? hs, na = p.awayScore ?? as, dh = nh - hs, da = na - as;
    if (dh > 0 || da > 0) {
      for (const s of ["h", "a"]) { const mine = s === "h" ? dh - da : da - dh; const tid = s === "h" ? home : away, X = tm(tid);
        for (const id of floor[s]) { const Q = pl(id); Q.pm += mine; Q.onF += s === "h" ? dh : da; Q.onA += s === "h" ? da : dh; if (clutchNow) Q.c.pm += mine }
        if (clutchNow) X.c.pm += mine;
        if (floor[s].length === 5) { const key = floor[s].slice().sort((x, y) => x - y).join("-"); const U = X.units[key] = X.units[key] || [0, 0, 0]; U[1] += s === "h" ? dh : da; U[2] += s === "h" ? da : dh }
        X._f = (X._f || 0) + (s === "h" ? dh : da); X._a = (X._a || 0) + (s === "h" ? da : dh) }
      /* runs */
      const scorer = dh > 0 ? "h" : "a", pts = dh > 0 ? dh : da;
      if (runTeam === scorer) run += pts; else { runTeam = scorer; run = pts } if (run > bestRun[scorer]) bestRun[scorer] = run;
    }
    /* the actor's own line */
    const actor = (p.participants || [])[0], aid = actor && actor.id, atid = p.teamId, aside = side(atid);
    const si = p.shotInfo;
    if (si && si.shooter && si.shooter.id != null) {
      const Q = pl(si.shooter.id), made = si.made ? 1 : 0, ft = si.range === "free_throw" || /FreeThrow/.test(p.playType || ""), three = si.range === "three_pointer";
      const val = made ? (ft ? 1 : three ? 3 : 2) : 0;
      if (made) { if (p.period <= 1) Q.h1 += val; else Q.h2 += val }
      if (clutchNow) { if (ft) { Q.c.fta++; Q.c.ftm += made } else { Q.c.fga++; Q.c.fgm += made; if (three) { Q.c.tpa++; Q.c.tpm += made } } Q.c.pts += val }
      if (made && si.assisted && si.assistedBy && si.assistedBy.id != null) { const A = pl(si.assistedBy.id); A.ast[si.shooter.id] = (A.ast[si.shooter.id] || 0) + 1; Q.fed[si.assistedBy.id] = (Q.fed[si.assistedBy.id] || 0) + 1; if (clutchNow) A.c.ast++ }
      /* late: last 2 minutes of the second half or overtime, shooting team down 0–3 before the shot */
      if (p.period >= 2 && p.secondsRemaining <= 120 && aside) { const myM = aside === "h" ? marginH : -marginH;
        if (myM <= 0 && myM >= -3) { Q.late.ga++; const after = aside === "h" ? (nh - na) : (na - nh); if (made && after > 0) { Q.late.gam++; goAheadLast = { id: si.shooter.id, team: atid, period: p.period, sec: p.secondsRemaining } } } }
    } else if (aid != null && aside) {
      const Q = pl(aid), pt = p.playType || "";
      if (clutchNow) { if (TOV.test(pt)) Q.c.tov++; else if (pt === "Steal") Q.c.stl++; else if (REB.test(pt) && !/Dead Ball/.test(pt)) Q.c.reb++ }
    }
    /* win probability added: the change in the actor's team's chance, credited to the actor */
    const wp = p.homeWinProbability;
    if (wp != null && lastWP != null && aside) { const d = (wp - lastWP) * (aside === "h" ? 1 : -1); const who = si && si.shooter && si.shooter.id != null ? si.shooter.id : aid;
      if (who != null && !/Substitution|TimeOut|End|Jumpball/i.test(p.playType || "")) { const Q = pl(who); Q.wpa += d; if (clutchNow) Q.cwpa += d } }
    if (wp != null) lastWP = wp;
    /* the game's arc */
    hs = nh; as = na; const m = hs - as; if (m > maxH) maxH = m; if (m < minH) minH = m;
    const lead = Math.sign(m); if (lead !== 0 && lastLead !== 0 && lead !== lastLead) leadCh++; if (lead !== 0) lastLead = lead;
    if (half == null && p.period >= 2) half = plays[i - 1] ? (plays[i - 1].homeScore ?? 0) - (plays[i - 1].awayScore ?? 0) : 0;
  }
  if (hs === 0 && as === 0) return null;
  const won = hs > as ? "h" : "a";
  /* game-winner: the last go-ahead make, in the last minute, by the winning side */
  if (goAheadLast && goAheadLast.sec <= 60 && side(goAheadLast.team) === won) pl(goAheadLast.id).late.gw++;
  const ot = plays.some(p => p.period > 2);
  for (const s of ["h", "a"]) {
    const tid = s === "h" ? home : away, X = tm(tid), sign = s === "h" ? 1 : -1;
    const myMax = s === "h" ? maxH : -minH, myMin = s === "h" ? minH : -maxH, final = sign * (hs - as), halfM = half == null ? null : sign * half;
    const clutchGame = plays.some(p => p.period >= 2 && p.secondsRemaining <= 300 && Math.abs((p.homeScore ?? 0) - (p.awayScore ?? 0)) <= 5);
    X.games.push([opts.gid ?? plays[0].gameId, (plays[0].gameStartDate || "").slice(0, 10), s === "h" ? away : home, final, myMax, -myMin, halfM, leadCh, bestRun[s], bestRun[s === "h" ? "a" : "h"], ot ? 1 : 0, clutchGame ? 1 : 0]);
    /* team minutes and margin, for each player's off-court numbers */
    const sec = X._sec || 0, F = X._f || 0, A = X._a || 0; X._sec = 0; X._f = 0; X._a = 0;
    for (const id of seen) { const Q = P[id]; if (!Q || Q._team !== tid) continue; Q.gp++; Q.teamMin += sec / 60; Q.teamF += F; Q.teamA += A; if (clutchGame) Q.c.g++ }
  }
  return { home, away, hs, as };
}

/* turn the sums into what the page shows */
export function finishPbp(P, T) {
  const players = {};
  for (const [id, Q] of Object.entries(P)) {
    if (Q.min < 20) continue;
    const offMin = Math.max(0, Q.teamMin - Q.min), offF = Q.teamF - Q.onF, offA = Q.teamA - Q.onA;
    const on40 = Q.min ? (Q.onF - Q.onA) / Q.min * 40 : null, off40 = offMin >= 20 ? (offF - offA) / offMin * 40 : null;
    const topN = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [+k, v]);
    players[id] = { nm: Q.nm || null, tm: Q._team ?? null, min: r1(Q.min), gp: Q.gp, pm: Q.pm, on40: r1(on40), off40: r1(off40), onoff: on40 != null && off40 != null ? r1(on40 - off40) : null, offMin: r1(offMin),
      c: { ...Q.c, min: r1(Q.c.min) }, late: Q.late, wpa: Math.round(Q.wpa * 1000) / 10, cwpa: Math.round(Q.cwpa * 1000) / 10, h1: Q.h1, h2: Q.h2, ast: topN(Q.ast, 6), fed: topN(Q.fed, 6) };
  }
  const teams = {};
  for (const [id, X] of Object.entries(T)) {
    const G = X.games;
    const rec = f => { const g = G.filter(f); return [g.filter(x => x[3] > 0).length, g.filter(x => x[3] < 0).length] };
    const units = Object.entries(X.units).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, u]) => [k.split("-").map(Number), r1(u[0]), u[1], u[2]]);
    const totMin = Object.values(X.mins).reduce((a, b) => a + b, 0) / 5;
    teams[id] = { n: G.length, close: rec(g => Math.abs(g[3]) <= 5 || g[10]), clutch: rec(g => g[11]), ot: rec(g => g[10]), comeback10: G.filter(g => g[3] > 0 && g[5] >= 10).length, blown10: G.filter(g => g[3] < 0 && g[4] >= 10).length,
      trailHalf: rec(g => g[6] != null && g[6] < 0), leadHalf: rec(g => g[6] != null && g[6] > 0), bigComeback: Math.max(0, ...G.filter(g => g[3] > 0).map(g => g[5])), bigBlown: Math.max(0, ...G.filter(g => g[3] < 0).map(g => g[4])),
      cpm: X.c.pm, cmin: r1(X.c.min), units, minShare: Object.entries(X.mins).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([pid, m]) => [+pid, r1(m), totMin ? Math.round(1000 * m / totMin) / 1000 : null]), games: G };
  }
  return { players, teams };
}

/* read a season's play-by-play day by day (only days not read before), keep the raw sums (p{S}_cbb-pbpraw, job only) and publish the
   finished numbers (p{S}_cbb-pbp) and the shot chart (p{S}_cbb-shots). shots = { addShot, blankAgg, ZONES } from job/cbb.mjs. */
export async function runPbp({ cb, getPack, putPack, log, S, G, D1, full, shots, pool, days }) {
  /* PBP_V: bump when the engine changes what it adds up — the season is then read again from the start */
  let R = full ? null : await getPack(`p${S}_cbb-pbpraw`).catch(() => null);
  if (!R || !R.P || R.v !== PBP_V) R = { v: PBP_V, season: S, P: {}, T: {}, gameIds: [], sh: { players: {}, teams: {} }, done: false };
  if (R.done) { log(`pbp ${S}: complete`); return { skipped: true } }
  const have = new Set(R.gameIds);
  const finals = G.filter(g => g.season === S && g.status === "final" && !have.has(g.id));
  const dates = days || [...new Set(finals.map(g => g.startDate.slice(0, 10)))].sort();
  log(`pbp ${S}: ${dates.length} days to read`);
  let added = 0;
  await pool(dates, 3, async dt => {
    const plays = await cb("/plays/date", { date: dt });
    const byGame = {}; for (const p of plays) { if (p.season !== S || have.has(p.gameId)) continue; (byGame[p.gameId] = byGame[p.gameId] || []).push(p) }
    for (const [gid, ps] of Object.entries(byGame)) {
      if (have.has(+gid)) continue;
      const r = processGame(ps, R.P, R.T, { gid: +gid }); if (!r) continue;
      have.add(+gid); added++;
      for (const p of ps) { if (!p.shootingPlay || !p.shotInfo) continue; const sh = p.shotInfo.shooter || {};
        if (sh.id) shots.addShot(R.sh.players[sh.id] = R.sh.players[sh.id] || shots.blankAgg(), p);
        if (p.teamId) { const X = R.sh.teams[p.teamId] = R.sh.teams[p.teamId] || { o: shots.blankAgg(), d: shots.blankAgg() }; shots.addShot(X.o, p) }
        if (p.opponentId) { const X = R.sh.teams[p.opponentId] = R.sh.teams[p.opponentId] || { o: shots.blankAgg(), d: shots.blankAgg() }; shots.addShot(X.d, p) } }
    }
  });
  R.gameIds = [...have]; R.done = Date.now() > Date.UTC(S, 3, 20) && G.filter(g => g.season === S && g.status === "final").every(g => have.has(g.id) || !(D1.has(g.homeTeamId) || D1.has(g.awayTeamId)));
  await putPack(`p${S}_cbb-pbpraw`, R);
  const out = finishPbp(R.P, R.T);
  for (const id of Object.keys(out.teams)) if (!D1.has(+id)) delete out.teams[id];
  await putPack(`p${S}_cbb-pbp`, { season: S, through: new Date().toISOString().slice(0, 10), games: have.size, ...out });
  /* the shot chart from the same pass */
  const avg = shots.ZONES.map(() => [0, 0]); for (const [id, X] of Object.entries(R.sh.teams)) if (D1.has(+id)) X.o.z.forEach((v, i) => { avg[i][0] += v[0]; avg[i][1] += v[1] });
  const keep = {}; for (const [id, A] of Object.entries(R.sh.players)) if (A.z.reduce((a, v) => a + v[1], 0) + A.r.reduce((a, v) => a + v[1], 0) >= 25 || A.ft[1] >= 25) keep[id] = A;
  await putPack(`p${S}_cbb-shots`, { season: S, zones: shots.ZONES, players: keep, teams: R.sh.teams, avg, gameIds: [], through: new Date().toISOString().slice(0, 10), done: R.done, fromPbp: 1 });
  log(`pbp ${S}: ${added} new games · ${Object.keys(out.players).length} players · ${Object.keys(out.teams).length} teams`);
  return { added };
}
