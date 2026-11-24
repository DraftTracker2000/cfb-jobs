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

export async function buildNflRecords({ getPack, cur, first = 1999, log = console.log }) {
  const P = n => `p${cur}_nfl-${n}`;
  const PL = await getPack(P("players")), DP = await getPack(P("dplayers"));
  const name = g => (PL && PL.p && PL.p[g] && PL.p[g][0]) || (DP && DP.p && DP.p[g] && DP.p[g][0]) || g;
  const seasonO = {}, seasonD = {}, careerO = {}, careerD = {}, span = {}, act = new Set();
  const add = (bag, g, s, team, row, LIST) => { const k = g + "|" + s, x = bag[k] = bag[k] || { g, s, team: {}, v: {} }; x.team[team] = (x.team[team] || 0) + 1;
    for (const [key, , f] of LIST) x.v[key] = (x.v[key] || 0) + (+f(row) || 0) };
  let through = first;
  for (let s = first; s <= cur; s++) {
    for (const [kind, bag, LIST] of [["logs", seasonO, OFF], ["def", seasonD, DEF]]) {
      let L = null; try { L = await getPack(P(kind + "-" + s)) } catch { L = null }
      const T = L && (kind === "def" && L.def ? L.def : L); if (!T || !T.p || !T.cols) { log(`records: no ${kind} for ${s}`); continue }
      const c = Object.fromEntries(T.cols.map((k, i) => [k, i]));
      for (const [g, rows] of Object.entries(T.p)) for (const r0 of rows) { if (r0[c.type] !== "R") continue;   /* "R" regular season, "P" playoffs */
        const r = {}; for (const k of T.cols) r[k] = r0[c[k]]; add(bag, g, s, r.team, r, LIST); span[g] = [Math.min(span[g]?.[0] ?? s, s), Math.max(span[g]?.[1] ?? s, s)];
        if (s === cur) act.add(g) }
      through = Math.max(through, s) } }
  /* active: on a team this season (a game in this season's logs) or listed active / on a reserve list in the players files */
  for (const F of [PL, DP]) if (F && F.p && F.cols) { const iS = F.cols.indexOf("status"), iL = F.cols.indexOf("last");
    for (const [g, r] of Object.entries(F.p)) if (/^(ACT|RES|INA|DEV|EXE)$/.test(r[iS] || "") && +r[iL] >= cur - 1) act.add(g) }
  const st = {};
  for (const [bag, LIST, side, car] of [[seasonO, OFF, "off", careerO], [seasonD, DEF, "def", careerD]]) {
    for (const x of Object.values(bag)) { const C = car[x.g] = car[x.g] || {}; for (const [k, v] of Object.entries(x.v)) C[k] = (C[k] || 0) + v }
    for (const [key, l] of LIST) {
      const ss = Object.values(bag).filter(x => x.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10)
        .map(x => [x.g, name(x.g), x.s, Object.entries(x.team).sort((a, b) => b[1] - a[1])[0][0], Math.round(x.v[key] * 10) / 10]);
      const cr = Object.entries(car).filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10)
        .map(([g, v]) => [g, name(g), Math.round(v[key] * 10) / 10, span[g][0], span[g][1]]);
      st[key] = { l, side, ss, cr } } }
  const actIn = [...new Set(Object.values(st).flatMap(x => x.cr.map(r => r[0])))].filter(g => act.has(g));
  return { through, first, act: actIn, st } }
