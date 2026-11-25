/* College football records (Nov 24 — the owner, 3:47 pm, records for every sport: season and career top 10s of plain counting stats, active players
   highlighted). FBS players, CollegeFootballData's season totals (bowls in, as the NCAA counts them since 2002) with the season-stat holes filled
   (job/cfbholes.mjs — Cam Newton 2010 and the rest), 2004 on. Past seasons are kept by the proxy, so a run costs ~6 calls (this season).
   Writes p2000_cfb-records { through, first, act: [playerId…], st: { key: { l, side, ss: [[id, name, season, team, value]×10],
   cr: [[id, name, value, first, last, team]×10] } } }. MODE=cfbrec, and with the weekly run. */
const ST = [["passing", "YDS", "pyd", "Passing yards", "off"], ["passing", "TD", "ptd", "Passing TDs", "off"], ["passing", "COMPLETIONS", "cmp", "Completions", "off"], ["passing", "INT", "int", "Interceptions thrown", "off"],
  ["rushing", "YDS", "ryd", "Rushing yards", "off"], ["rushing", "TD", "rtd", "Rushing TDs", "off"], ["rushing", "CAR", "car", "Carries", "off"],
  ["receiving", "REC", "rec", "Receptions", "off"], ["receiving", "YDS", "yds", "Receiving yards", "off"], ["receiving", "TD", "td", "Receiving TDs", "off"],
  ["defensive", "TOT", "tkl", "Tackles", "def"], ["defensive", "SACKS", "dsk", "Sacks", "def"], ["defensive", "TFL", "tfl", "Tackles for loss", "def"], ["defensive", "PD", "pd", "Passes defended", "def"],
  ["interceptions", "INT", "dint", "Interceptions", "def"], ["interceptions", "TD", "pick6", "Pick-sixes", "def"], ["fumbles", "FUM", "fum", "Fumbles", "off"]];
const DERIVED = [["scr", "Yards from scrimmage", "off", v => (v.ryd || 0) + (v.yds || 0)], ["stdn", "Scrimmage TDs", "off", v => (v.rtd || 0) + (v.td || 0)]];

export async function buildCfbRecords({ site, token, cur, first = 2004, games = false, log = console.log }) {
  const H = { headers: { Authorization: "Bearer " + token } };
  const cf = async path => { for (let k = 0; k < 4; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) return r.json(); if (r.status === 429) await new Promise(r => setTimeout(r, 5000)) } catch (e) { } await new Promise(r => setTimeout(r, 1500)) } throw new Error("CFBD failed: " + path) };
  const S = {}, nm = {}, span = {}, act = new Set(); let through = first;
  for (let y = first; y <= cur; y++) {
    const fbs = new Set(((await cf(`/teams/fbs?year=${y}`)) || []).map(t => t.school));
    for (const cat of [...new Set(ST.map(s => s[0]))]) {
      const L = (await cf(`/stats/player/season?year=${y}&category=${cat}`)) || [];
      for (const r of L) { if (!fbs.has(r.team)) continue; const def = ST.find(s => s[0] === cat && s[1] === r.statType); if (!def) continue;
        const id = String(r.playerId); if (!id || id === "-1") continue; const k = id + "|" + y, s = S[k] = S[k] || { id, y, t: r.team, v: {} }; s.v[def[2]] = (s.v[def[2]] || 0) + (+r.stat || 0);
        nm[id] = r.player; span[id] = [Math.min(span[id]?.[0] ?? y, y), Math.max(span[id]?.[1] ?? y, y), r.team]; if (y === cur) act.add(id) } }
    through = y; log(`college records ${y}: ${Object.keys(S).length} player-seasons so far`) }
  for (const s of Object.values(S)) for (const [k, , , f] of DERIVED) s.v[k] = f(s.v);
  const C = {}; for (const s of Object.values(S)) { const c = C[s.id] = C[s.id] || {}; for (const [k, v] of Object.entries(s.v)) c[k] = (c[k] || 0) + v }
  const out = {}, all = [...ST.map(s => [s[2], s[3], s[4]]), ...DERIVED.map(d => [d[0], d[1], d[2]])];
  for (const [key, l, side] of all) {
    const ss = Object.values(S).filter(s => s.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10).map(s => [s.id, nm[s.id], s.y, s.t, Math.round(s.v[key] * 10) / 10]);
    const cr = Object.entries(C).filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10).map(([id, v]) => [id, nm[id], Math.round(v[key] * 10) / 10, span[id][0], span[id][1], span[id][2]]);
    const ca = Object.entries(C).filter(([id, v]) => v[key] > 0 && act.has(id)).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10).map(([id, v]) => [id, nm[id], Math.round(v[key] * 10) / 10, span[id][0], span[id][1], span[id][2]]);
    out[key] = { l, side, ss, cr, ca } }
  /* the Nov 24, 11:36 pm ideas (the owner: "that all sounds great"): milestone clubs (11), this season's pace against the top 10 (10), single games (7) */
  const CLUB = { pyd: 5000, ptd: 50, ryd: 2000, rtd: 25, rec: 120, yds: 1700, scr: 2500, dsk: 15, dint: 9 }, r1 = x => Math.round(x * 10) / 10;
  for (const [key, x] of Object.entries(out)) if (CLUB[key]) x.club = { at: CLUB[key], L: Object.values(S).filter(s => s.v[key] >= CLUB[key]).sort((a, b) => b.v[key] - a.v[key]).map(s => [s.id, nm[s.id], s.y, s.t, r1(s.v[key])]) };
  const TG = {}; for (const r of (await cf(`/records?year=${cur}`)) || []) TG[r.team] = +(r.total && r.total.games) || 0;
  const tgMax = Math.max(0, ...Object.values(TG));
  if (tgMax >= 3 && tgMax < 13) for (const [key, x] of Object.entries(out)) { const tenth = x.ss.length >= 10 ? x.ss[9][4] : 0;
    x.pace = Object.values(S).filter(s => s.y === cur && s.v[key] > 0 && TG[s.t]).map(s => [s.id, nm[s.id], s.y, s.t, r1(s.v[key]), r1(s.v[key] / TG[s.t] * 13), TG[s.t]]).filter(r => r[5] >= tenth).sort((a, b) => b[5] - a[5]).slice(0, 5) }
  /* single games: every FBS player's box score line, week by week (the proxy keeps finished seasons), the top 10 per stat */
  if (games) { const G = {}, MAPG = { passing: { YDS: "pyd", TD: "ptd" }, rushing: { YDS: "ryd", TD: "rtd", CAR: "car" }, receiving: { REC: "rec", YDS: "yds", TD: "td" },
      defensive: { TOT: "tkl", SACKS: "dsk", TFL: "tfl", PD: "pd" }, interceptions: { INT: "dint", TD: "pick6" } };
    let calls = 0, lines = 0;
    for (let y = first; y <= cur; y++) { const fbs = new Set(((await cf(`/teams/fbs?year=${y}`)) || []).map(t => t.school));
      for (const [st, wk] of [...Array.from({ length: 16 }, (_, i) => ["regular", i + 1]), ["postseason", 1]]) {
        const L = await cf(`/games/players?year=${y}&week=${wk}&seasonType=${st}`); calls++; if (!L || !L.length) continue;
        for (const gm of L) { const T = gm.teams || []; if (T.length !== 2) continue;
          for (const [i, t] of T.entries()) { if (!fbs.has(t.team)) continue; const opp = T[1 - i].team, P = {};
            for (const c of t.categories || []) { const M = MAPG[c.name]; if (!M) continue; for (const ty of c.types || []) { const k = M[ty.name]; if (!k) continue;
              for (const a of ty.athletes || []) { const v = +a.stat; if (!(v > 0) || !a.id || +a.id < 0) continue; const p = P[a.id] = P[a.id] || { n: a.name, v: {} }; p.v[k] = (p.v[k] || 0) + v } } }
            for (const [id, p] of Object.entries(P)) { p.v.scr = (p.v.ryd || 0) + (p.v.yds || 0); p.v.stdn = (p.v.rtd || 0) + (p.v.td || 0); lines++;
              for (const [k, v] of Object.entries(p.v)) if (v > 0 && out[k]) { const A = G[k] = G[k] || []; A.push([String(id), p.n, y, t.team, r1(v), st === "postseason" ? "bowl" : wk, opp]); if (A.length > 400) { A.sort((a, b) => b[4] - a[4]); A.length = 10 } } } } } }
      log(`college records: single games through ${y}`) }
    for (const [k, x] of Object.entries(out)) x.gm = (G[k] || []).sort((a, b) => b[4] - a[4]).slice(0, 10);
    log(`college records: single games · ${calls} week files · ${lines} player-game lines`) }
  const actIn = [...new Set(Object.values(out).flatMap(x => [...x.ss, ...x.cr, ...x.ca, ...(x.gm || []), ...((x.club && x.club.L) || []), ...(x.pace || [])].map(r => r[0])))].filter(id => act.has(id));
  return { through, first, act: actIn, st: out } }
