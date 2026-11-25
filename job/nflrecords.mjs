/* NFL records (Nov 24 — the owner, 3:47 pm: "totals since 1999, single season stuff. full list of natural stat totals like touchdowns, passing yards,
   receiving yards, fumbles, interceptions, yards from scrimmage all that stuff, but not like percetages … and then the same for the defensive
   side … top 10 of each … highlight the ones that are still active on the "career records" side"). Regular season only, from our own game
   logs (nflverse, 1999 on): p<Y>_nfl-logs-<S> (QB/RB/WR/TE) and p<Y>_nfl-def-<S> (defenders). Output p2000_nfl-records:
   { through, first, act: [gsis…], st: { key: { l, side, ss: [[gsis, name, season, team, value]×10], cr: [[gsis, name, value, first, last]×10] } } } */

const OFF = [["pyd", "Passing yards", r => r.pyd], ["ptd", "Passing TDs", r => r.ptd], ["cmp", "Completions", r => r.cmp], ["int", "Interceptions thrown", r => r.int],
  ["ryd", "Rushing yards", r => r.ryd], ["rtd", "Rushing TDs", r => r.rtd], ["car", "Carries", r => r.car],
  ["rec", "Receptions", r => r.rec], ["yds", "Receiving yards", r => r.yds], ["td", "Receiving TDs", r => r.td],
  ["scr", "Yards from scrimmage", r => r.ryd + r.yds], ["stdn", "Scrimmage TDs", r => r.rtd + r.td], ["fum", "Fumbles", r => r.fum], ["sk", "Times sacked", r => r.sk]];
const DEF = [["tkl", "Tackles", r => r.solo + r.ast], ["dsk", "Sacks", r => r.sk], ["tfl", "Tackles for loss", r => r.tfl], ["qbh", "QB hits", r => r.qbh],
  ["dint", "Interceptions", r => r.int], ["pd", "Passes defended", r => r.pd], ["ff", "Forced fumbles", r => r.ff], ["fr", "Fumbles recovered", r => r.fr], ["dtd", "Defensive TDs", r => r.td]];

/* By hand (Nov 24 — the owner, 8:08 pm: "Check all, then fix"; docs/research/records-check-nov24.md): official season totals where our game logs are off.
   Brees 2011: Week 13 vs Detroit reads 29/39, 401 in the logs (official 26/36, 342 — CBS game story). (Faulk 1999 came off this list Nov 24, 11:20 pm:
   the logs now have the three games nflverse leaves out, from ESPN's box scores — job/nfl.mjs gapGames — and add up to the official 253 for 1,381 and
   87 for 1,048.) Lewis 2003: 2,066 yards
   (Hall of Fame). Turner 2008: 376 carries (StatMuse). The game logs themselves stay as they are; only these record totals change. */
const BY_HAND = { "00-0020531|2011": { pyd: 5476, cmp: 468 }, "00-0019693|2003": { ryd: 2066, car: 387 }, "00-0022821|2008": { car: 376 } };
export async function buildNflRecords({ getPack, cur, first = 1999, log = console.log }) {
  const P = n => `p${cur}_nfl-${n}`;
  const PL = await getPack(P("players")), DP = await getPack(P("dplayers"));
  const name = g => (PL && PL.p && PL.p[g] && PL.p[g][0]) || (DP && DP.p && DP.p[g] && DP.p[g][0]) || g;
  const iP = F => F && F.cols ? F.cols.indexOf("pos") : -1, pos = g => (PL && PL.p && PL.p[g] && PL.p[g][iP(PL)]) || (DP && DP.p && DP.p[g] && DP.p[g][iP(DP)]) || "";
  const seasonO = {}, seasonD = {}, careerO = {}, careerD = {}, span = {}, act = new Set(), seasonPO = {}, seasonPD = {}, games = {}, tgm = {};
  const add = (bag, g, s, team, row, LIST) => { const k = g + "|" + s, x = bag[k] = bag[k] || { g, s, team: {}, v: {} }; x.team[team] = (x.team[team] || 0) + 1;
    for (const [key, , f] of LIST) x.v[key] = (x.v[key] || 0) + (+f(row) || 0) };
  let through = first;
  for (let s = first; s <= cur; s++) {
    for (const [kind, bag, LIST] of [["logs", seasonO, OFF], ["def", seasonD, DEF]]) {
      let L = null; try { L = await getPack(P(kind + "-" + s)) } catch { L = null }
      const T = L && (kind === "def" && L.def ? L.def : L); if (!T || !T.p || !T.cols) { log(`records: no ${kind} for ${s}`); continue }
      const c = Object.fromEntries(T.cols.map((k, i) => [k, i]));
      for (const [g, rows] of Object.entries(T.p)) for (const r0 of rows) { const r = {}; for (const k of T.cols) r[k] = r0[c[k]];
        /* playoffs (Nov 24, 11:36 pm yes — idea 9): their own season and career totals */
        if (r0[c.type] === "P") { add(kind === "logs" ? seasonPO : seasonPD, g, s, r.team, r, LIST); continue }
        if (r0[c.type] !== "R") continue;   /* "R" regular season, "P" playoffs */
        add(bag, g, s, r.team, r, LIST); span[g] = [Math.min(span[g]?.[0] ?? s, s), Math.max(span[g]?.[1] ?? s, s)];
        if (s === cur) { act.add(g); (tgm[r.team] = tgm[r.team] || new Set()).add(r.game) }
        /* single games (idea 7): every regular-season game line, the top 10 kept per stat at the end */
        for (const [key, , f] of LIST) { const v = +f(r) || 0; if (v > 0) (games[key] = games[key] || []).push([g, s, r.team, v, r.week, r.opp]) } }
      through = Math.max(through, s) } }
  /* active: on a team this season (a game in this season's logs) or listed active / on a reserve list in the players files */
  /* once this season has games, "still playing" means played this season (Nov 24: Philip Rivers, last game 2025, was marked by the roster status);
     before the first game, the players files' status stands in */
  if (!act.size) for (const F of [PL, DP]) if (F && F.p && F.cols) { const iS = F.cols.indexOf("status"), iL = F.cols.indexOf("last");
    for (const [g, r] of Object.entries(F.p)) if (/^(ACT|RES|INA|DEV|EXE)$/.test(r[iS] || "") && +r[iL] >= cur - 1) act.add(g) }
  for (const [k, v] of Object.entries(BY_HAND)) { const x = seasonO[k]; if (!x) continue; for (const [stat, val] of Object.entries(v)) x.v[stat] = val; x.v.scr = x.v.ryd + x.v.yds; x.v.stdn = x.v.rtd + x.v.td; x.hand = 1 }
  const st = {};
  for (const [bag, LIST, side, car] of [[seasonO, OFF, "off", careerO], [seasonD, DEF, "def", careerD]]) {
    for (const x of Object.values(bag)) { const C = car[x.g] = car[x.g] || {}; for (const [k, v] of Object.entries(x.v)) C[k] = (C[k] || 0) + v }
    for (const [key, l] of LIST) {
      const ss = Object.values(bag).filter(x => x.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10)
        .map(x => [x.g, name(x.g), x.s, Object.entries(x.team).sort((a, b) => b[1] - a[1])[0][0], Math.round(x.v[key] * 10) / 10]);
      const cr = Object.entries(car).filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10)
        .map(([g, v]) => [g, name(g), Math.round(v[key] * 10) / 10, span[g][0], span[g][1]]);
      /* still playing: the career top 10 among active players only (Nov 24 — "highlight the ones that are still active") */
      const ca = Object.entries(car).filter(([g, v]) => v[key] > 0 && act.has(g)).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10)
        .map(([g, v]) => [g, name(g), Math.round(v[key] * 10) / 10, span[g][0], span[g][1]]);
      st[key] = { l, side, ss, cr, ca } } }
  /* the Nov 24, 11:36 pm ideas (the owner: "that all sounds great"): single games (7), rookie seasons (8), playoffs — one postseason and a career's (9),
     this season's pace against the top 10 (10), milestone clubs (11) */
  const rk = PL && PL.cols ? PL.cols.indexOf("rookie") : -1, dk = DP && DP.cols ? DP.cols.indexOf("rookie") : -1;
  const rookieY = g => +((PL && PL.p && PL.p[g] && PL.p[g][rk]) || (DP && DP.p && DP.p[g] && DP.p[g][dk]) || 0);
  const r1 = x => Math.round(x * 10) / 10, mainTm = x => Object.entries(x.team).sort((a, b) => b[1] - a[1])[0][0];
  const CLUB = { pyd: 5000, ptd: 45, ryd: 2000, rtd: 20, yds: 1700, rec: 130, scr: 2300, dsk: 20, dint: 10 };
  const tgMax = Math.max(0, ...Object.values(tgm).map(x => x.size));
  for (const [bag, LIST, pbag] of [[seasonO, OFF, seasonPO], [seasonD, DEF, seasonPD]]) {
    const pcar = {}; for (const x of Object.values(pbag)) { const C = pcar[x.g] = pcar[x.g] || { v: {}, y0: x.s, y1: x.s }; C.y0 = Math.min(C.y0, x.s); C.y1 = Math.max(C.y1, x.s); for (const [k, v] of Object.entries(x.v)) C.v[k] = (C.v[k] || 0) + v }
    for (const [key] of LIST) { const S = st[key];
      S.gm = (games[key] || []).sort((a, b) => b[3] - a[3]).slice(0, 10).map(([g, y, t, v, w, o]) => [g, name(g), y, t, r1(v), w, o]);
      S.rk = Object.values(bag).filter(x => x.v[key] > 0 && rookieY(x.g) === x.s).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10).map(x => [x.g, name(x.g), x.s, mainTm(x), r1(x.v[key])]);
      S.ps = Object.values(pbag).filter(x => x.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10).map(x => [x.g, name(x.g), x.s, mainTm(x), r1(x.v[key])]);
      S.pc = Object.entries(pcar).filter(([, C]) => C.v[key] > 0).sort((a, b) => b[1].v[key] - a[1].v[key]).slice(0, 10).map(([g, C]) => [g, name(g), r1(C.v[key]), C.y0, C.y1]);
      if (CLUB[key]) S.club = { at: CLUB[key], L: Object.values(bag).filter(x => x.v[key] >= CLUB[key]).sort((a, b) => b.v[key] - a.v[key]).map(x => [x.g, name(x.g), x.s, mainTm(x), r1(x.v[key])]) };
      /* this season's pace: his total over his team's games so far, times 17 — only while the season is under way */
      if (tgMax >= 3 && tgMax < 17) { const tenth = S.ss.length >= 10 ? S.ss[9][4] : 0;
        S.pace = Object.values(bag).filter(x => x.s === cur && x.v[key] > 0).map(x => { const t = mainTm(x), n = (tgm[t] && tgm[t].size) || tgMax; return [x.g, name(x.g), x.s, t, r1(x.v[key]), r1(x.v[key] / n * 17), n] })
          .filter(r => r[5] >= tenth).sort((a, b) => b[5] - a[5]).slice(0, 5) } } }
  const shown = [...new Set(Object.values(st).flatMap(x => [...x.ss, ...x.cr, ...x.ca, ...(x.gm || []), ...(x.rk || []), ...(x.ps || []), ...(x.pc || []), ...((x.club && x.club.L) || []), ...(x.pace || [])].map(r => r[0])))];
  return { through, first, hand: Object.keys(BY_HAND), act: shown.filter(g => act.has(g)), pos: Object.fromEntries(shown.map(g => [g, pos(g)])), st } }
