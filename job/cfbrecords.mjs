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

export async function buildCfbRecords({ site, token, cur, first = 2004, log = console.log }) {
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
    out[key] = { l, side, ss, cr } }
  const actIn = [...new Set(Object.values(out).flatMap(x => x.cr.map(r => r[0])))].filter(id => act.has(id));
  return { through, first, act: actIn, st: out } }
