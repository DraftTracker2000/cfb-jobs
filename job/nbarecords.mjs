/* NBA records (Nov 24 — the owner, 3:47 pm, records for every sport: "full list of natural stat totals … top 10 of each … highlight the ones that
   are still active on the career records side … the nba one will be the most lacking since stuff happened more back then"). Season and career
   top 10s of plain counting stats, regular season, from the open sportsdataverse NBA box scores (the files the NBA job already reads; ESPN's —
   on the source flag list), every season on file. Writes p2000_nba-records { through, first, act: [espnId…], st: { key: { l, side,
   ss: [[id, name, season, team, value]×10], cr: [[id, name, value, first, last]×10] } } }. Season = the year it ends (2017 = 2016-17). MODE=nbarec. */
const URL_OF = y => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`;
function rows(text) { const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); out.push(row); row = []; f = "" } else if (c !== "\r") f += c }
  if (f || row.length) { row.push(f); out.push(row) } return out }
const STATS = [["pts", "Points", g => g.pts], ["reb", "Rebounds", g => g.reb], ["ast", "Assists", g => g.ast], ["stl", "Steals", g => g.stl], ["blk", "Blocks", g => g.blk],
  ["fg3", "3-pointers made", g => g.fg3], ["ftm", "Free throws made", g => g.ftm], ["gp", "Games played", () => 1], ["dd", "Double-doubles", g => g.dd], ["td", "Triple-doubles", g => g.td],
  ["g40", "40-point games", g => g.pts >= 40 ? 1 : 0], ["g50", "50-point games", g => g.pts >= 50 ? 1 : 0]];
export async function buildNbaRecords({ curNba, first = 2002, log = console.log }) {
  const S = {}, nm = {}, span = {}, act = new Set(); let through = first, from = null;
  for (let y = first; y <= curNba; y++) {
    const r = await fetch(URL_OF(y), { redirect: "follow" }).catch(() => null); if (!r || !r.ok) { log(`nba records ${y}: no file`); continue }
    const R = rows(await r.text()), H = R[0], ix = n => H.indexOf(n);
    const I = { st: ix("season_type"), id: ix("athlete_id"), nm: ix("athlete_display_name"), tm: ix("team_abbreviation"), min: ix("minutes"), dnp: ix("did_not_play"),
      pts: ix("points"), reb: ix("rebounds"), ast: ix("assists"), stl: ix("steals"), blk: ix("blocks"), fg3: ix("three_point_field_goals_made"), ftm: ix("free_throws_made") };
    let n = 0; const seen = new Set(), gi = ix("game_id");
    /* real teams only: the All-Star game is filed as a regular-season game (teams EAST/WEST, or the captains' names) — a real team has hundreds of rows */
    const tc = {}; for (const x of R.slice(1)) if (+x[I.st] === 2) tc[x[I.tm]] = (tc[x[I.tm]] || 0) + 1;
    for (const x of R.slice(1)) { if (+x[I.st] !== 2 || !x[I.id] || /true/i.test(x[I.dnp] || "") || !(parseFloat(x[I.min]) > 0)) continue;
      if ((tc[x[I.tm]] || 0) < 300) continue;
      const gk = x[gi] + "|" + x[I.id]; if (seen.has(gk)) continue; seen.add(gk);   /* a game listed twice in the file counts once */
      const g = {}; for (const k of ["pts", "reb", "ast", "stl", "blk", "fg3", "ftm"]) g[k] = parseFloat(x[I[k]]) || 0;
      const ten = ["pts", "reb", "ast", "stl", "blk"].filter(k => g[k] >= 10).length; g.dd = ten >= 2 ? 1 : 0; g.td = ten >= 3 ? 1 : 0;
      const id = x[I.id], k = id + "|" + y, s = S[k] = S[k] || { id, y, tm: {}, v: {} }; s.tm[x[I.tm]] = (s.tm[x[I.tm]] || 0) + 1; nm[id] = x[I.nm];
      for (const [key, , f] of STATS) s.v[key] = (s.v[key] || 0) + f(g);
      span[id] = [Math.min(span[id]?.[0] ?? y, y), Math.max(span[id]?.[1] ?? y, y)]; if (y === curNba) act.add(id); n++ }
    if (n) { through = y; if (from == null) from = y } log(`nba records ${y}: ${n} player-games`) }
  const C = {}; for (const s of Object.values(S)) { const c = C[s.id] = C[s.id] || {}; for (const [k, v] of Object.entries(s.v)) c[k] = (c[k] || 0) + v }
  const st = {};
  for (const [key, l] of STATS) {
    const ss = Object.values(S).filter(s => s.v[key] > 0).sort((a, b) => b.v[key] - a.v[key]).slice(0, 10).map(s => [s.id, nm[s.id], s.y, Object.entries(s.tm).sort((a, b) => b[1] - a[1])[0][0], s.v[key]]);
    const cr = Object.entries(C).filter(([, v]) => v[key] > 0).sort((a, b) => b[1][key] - a[1][key]).slice(0, 10).map(([id, v]) => [id, nm[id], v[key], span[id][0], span[id][1]]);
    st[key] = { l, side: "all", ss, cr } }
  const actIn = [...new Set(Object.values(st).flatMap(x => x.cr.map(r => r[0])))].filter(id => act.has(id));
  return { through, first: from ?? first, act: actIn, st } }
