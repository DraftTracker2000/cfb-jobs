/* The NBA side of the basketball board (Oct 9 — Sam approved the open sportsdataverse / hoopR NBA data, the basketball counterpart of
   nflverse). Every NBA box score since 2002 is published as one CSV per season on GitHub (release "espn_nba_player_boxscores",
   player_box_{season}.csv). ESPN player ids are the same in college and the NBA, and CBBD keeps each college player's ESPN id
   (athleteSourceId), so a college player's NBA career joins straight on.

   Pack p2000_cbb-nbahist (job cache): one compact line per player per NBA season, re-read only for the season in progress.
   Pack p{S}_cbb-nba: every NBA player who played Division I since 2008 — NBA seasons, career totals, an outcome tag, his college
   (CBBD) id and his draft slot. */
const URL_OF = y => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* a CSV line → fields (quotes and commas inside quotes handled) */
export function csvLine(s) { const out = []; let cur = "", q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = "" } else cur += c } out.push(cur); return out }
/* one season's box scores → { espnId: [name, team, gp, gs, min, pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta] } (regular season + playoffs kept apart: playoffs in p) */
export function seasonFromCsv(text) {
  const lines = text.split(/\r?\n/); const H = csvLine(lines[0]).map(h => h.trim().toLowerCase()); const ix = n => H.indexOf(n);
  const I = { id: ix("athlete_id"), nm: ix("athlete_display_name"), tm: ix("team_abbreviation"), min: ix("minutes"), pts: ix("points"), reb: ix("rebounds"), ast: ix("assists"), stl: ix("steals"), blk: ix("blocks"), tov: ix("turnovers"),
    fgm: ix("field_goals_made"), fga: ix("field_goals_attempted"), tpm: ix("three_point_field_goals_made"), tpa: ix("three_point_field_goals_attempted"), ftm: ix("free_throws_made"), fta: ix("free_throws_attempted"), st: ix("starter"), dnp: ix("did_not_play"), type: ix("season_type") };
  if (I.id < 0 || I.min < 0) throw new Error("NBA box score columns changed: " + H.slice(0, 20).join(","));
  const out = {};
  for (let k = 1; k < lines.length; k++) { if (!lines[k]) continue; const f = csvLine(lines[k]); const id = f[I.id]; if (!id) continue;
    if (I.dnp >= 0 && /true/i.test(f[I.dnp])) continue; const min = +f[I.min] || 0; if (!min) continue;
    const po = I.type >= 0 && +f[I.type] === 3; const key = po ? "p" : "r";
    const X = out[id] = out[id] || { nm: f[I.nm], tm: f[I.tm], r: new Array(15).fill(0), p: new Array(15).fill(0) };
    const A = X[key]; A[0]++; if (I.st >= 0 && /true/i.test(f[I.st])) A[1]++; A[2] += min;
    ["pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta"].forEach((c, j) => A[3 + j] += (+f[I[c]] || 0));
    if (!po) X.tm = f[I.tm] || X.tm }
  return out;
}
/* how an NBA career turned out, from what he did on the floor (no awards data): Star · Former star · Starter · Rotation · Bench · Brief.
   Oct 12 (Sam: "we also call a lot of people stars in the NBA when there probably arent that many … a lot of them are vets that arent
   playing at their level anymore, they should be denoted"): a star is measured against the league, not a points line. Each season every
   player with 30+ games is ranked twice — by box-score game score per game (points, shooting, rebounds, assists, steals, blocks,
   turnovers) and by points per game (seasonRanks). A star season: top 15 in either. A star career: a top-5 season (top 3 in scoring) or
   two star seasons. Still a star: a star season in one of the last two (an injury year doesn't end it). A star career that isn't still
   at that level → "Former star"; a retired star stays "Star". (Was: any 20-point season — 73 active stars.) */
export const gameScore = r => { const [, , gp, , , pts, reb, ast, stl, blk, tov, fgm, fga, , , ftm, fta] = r; return gp ? (pts + .4 * fgm - .7 * fga - .4 * (fta - ftm) + .4 * reb + stl + .7 * ast + .7 * blk - tov) / gp : 0 };
export function seasonRanks(seasons) { const RK = {};
  for (const [y, P] of Object.entries(seasons)) { const E = Object.entries(P).filter(([, r]) => r[2] >= 30); if (E.length < 150) continue; RK[y] = {};
    E.map(([k, r]) => [k, gameScore(r)]).sort((a, b) => b[1] - a[1]).forEach(([k], i) => RK[y][k] = [i + 1, 0]);
    E.map(([k, r]) => [k, r[5] / r[2]]).sort((a, b) => b[1] - a[1]).forEach(([k], i) => RK[y][k][1] = i + 1) }
  return RK }
const starSeason = r => !!r && (r[0] <= 15 || r[1] <= 15), topSeason = r => !!r && (r[0] <= 5 || r[1] <= 3);
export function nbaTag(seasons, curY, rk = null, latest = null) {
  const reg = seasons.map(s => ({ y: s[0], gp: s[2], gs: s[3], mpg: s[2] ? s[4] / s[2] : 0, ppg: s[2] ? s[5] / s[2] : 0 }));
  const gp = reg.reduce((a, s) => a + s.gp, 0), starterYrs = reg.filter(s => s.gs >= 41).length, rotYrs = reg.filter(s => s.gp >= 40 && s.mpg >= 18).length;
  const young = curY - Math.min(...reg.map(s => s.y)) < 3;
  if (rk) { const R = Object.values(rk);
    if (R.some(topSeason) || R.filter(starSeason).length >= 2) { const active = latest && reg.some(s => s.y >= latest - 1), now = latest && [latest, latest - 1].some(y => starSeason(rk[y]));
      return active && !now ? { t: "Former star", c: "ok" } : { t: "Star", c: "gold" } } }
  else { const peak = Math.max(0, ...reg.filter(s => s.gp >= 40).map(s => s.ppg)); if (peak >= 20 || reg.filter(s => s.gp >= 50 && s.ppg >= 17).length >= 3) return { t: "Star", c: "gold" } }
  if (starterYrs >= 3) return { t: "Starter", c: "good" };
  if (rotYrs >= 3 || starterYrs >= 2) return { t: "Rotation", c: "ok" };
  if (young) return { t: "Early career", c: "" };
  if (gp >= 150) return { t: "Bench", c: "" };
  return { t: "Brief", c: "bad" };
}

export async function buildNba({ getPack, putPack, log, full, curNba, live, sidToCbbd, draftById, nameMatch }) {
  let NH = full ? null : await getPack("p2000_cbb-nbahist").catch(() => null);
  if (!NH || !NH.seasons) NH = { seasons: {} };
  const want = []; for (let y = 2009; y <= curNba; y++) if (!NH.seasons[y] || (live && y === curNba)) want.push(y);
  for (const y of want) {
    let txt = null; for (let k = 0; k < 3 && !txt; k++) { try { const r = await fetch(URL_OF(y), { redirect: "follow" }); if (r.status === 404) break; if (r.ok) txt = await r.text() } catch { } if (!txt) await sleep(2000) }
    if (!txt) { log(`nba ${y}: no file`); continue }
    const S = seasonFromCsv(txt); NH.seasons[y] = Object.fromEntries(Object.entries(S).map(([id, X]) => [id, [X.nm, X.tm, ...X.r.map(v => Math.round(v)), X.p[0] ? X.p.map(v => Math.round(v)) : null]]));
    log(`nba ${y}: ${Object.keys(S).length} players`);
  }
  await putPack("p2000_cbb-nbahist", NH);
  /* NBA careers of players who played Division I (by ESPN id) */
  const players = {};
  /* ESPN id → college id; failing that, a name match against his first NBA season (see nameMatch in job/cbb.mjs) */
  const firstY = {}, nmOf = {}; for (const [y, P] of Object.entries(NH.seasons)) for (const [eid, row] of Object.entries(P)) { if (!firstY[eid] || +y < firstY[eid]) firstY[eid] = +y; nmOf[eid] = row[0] }
  let byNm = 0; const cidOf = {}; for (const eid of Object.keys(firstY)) { let c = sidToCbbd[eid]; if (!c && nameMatch && firstY[eid] >= 2010) { c = nameMatch(nmOf[eid], firstY[eid]); if (c) byNm++ } if (c) cidOf[eid] = c }
  log(`nba: ${byNm} players joined to college by name`);
  for (const [y, P] of Object.entries(NH.seasons)) for (const [eid, row] of Object.entries(P)) {
    const cid = cidOf[eid]; if (!cid) continue;
    const X = players[eid] = players[eid] || { nm: row[0], cid, seasons: [] };
    X.seasons.push([+y, row[1], ...row.slice(2, 17), row[17] ? row[17].slice(0, 3).concat([row[17][3]]) : null]);
  }
  const RKS = seasonRanks(NH.seasons), latestY = Object.keys(RKS).length ? Math.max(...Object.keys(RKS).map(Number)) : null, rkOf = eid => { const o = {}; for (const [y, M] of Object.entries(RKS)) if (M[eid]) o[y] = M[eid]; return o };
  for (const [eid, X] of Object.entries(players)) { X.seasons.sort((a, b) => a[0] - b[0]); X.tag = nbaTag(X.seasons, curNba, Object.keys(RKS).length ? rkOf(eid) : null, latestY);   /* a tiny test league has no ranks: the old points rule */ const d = draftById[X.cid]; if (d) X.draft = [d.year, d.overall, d.draftTeam];
    const t = X.seasons.reduce((a, s) => { for (let i = 2; i <= 16; i++) a[i - 2] += s[i] || 0; return a }, new Array(15).fill(0)); X.tot = t }
  /* this year's and last year's draft picks who haven't played an NBA game yet (Oct 11 — Sam: "their nba pages should have their college
     data, which would then populate the players like them tab"): an NBA page with no NBA seasons, so the college season, BoardScore and
     college comparisons attach to him like everyone else */
  { const sidOf = {}; for (const [sid, cid] of Object.entries(sidToCbbd)) if (!sidOf[cid]) sidOf[cid] = sid; let n = 0;
    for (const [cid, d] of Object.entries(draftById || {})) { if (!(d.year >= curNba - 2)) continue; const sid = sidOf[cid]; if (!sid || players[sid]) continue;
      players[sid] = { nm: d.name || d.athleteName || "", cid: d._id || cid, seasons: [], tag: { t: "Rookie", c: "" }, draft: [d.year, d.overall, d.draftTeam], tot: new Array(15).fill(0) }; n++ }
    log(`nba: ${n} draft picks with no NBA games yet`) }
  log(`nba: ${Object.keys(players).length} former Division I players`);
  return players;
}

/* ---- NBA games (Oct 10 — Sam: "the NBA side is also very thin with the no head to head data") ----
   The same open sportsdataverse / hoopR release files: this season's schedule with scores (espn_nba_schedules), last season's team
   box scores (espn_nba_team_boxscores) for each team's ratings, and current rosters (espn_nba_rosters) — joined to the college players
   by ESPN id. Pack p{S}_cbb-nbagames: { season, teams: { ABBR: {...} }, games: [[id, date, home, away, hs, as, state, tv]], cols }. */
export const REL = (rel, f) => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/${rel}/${f}`;
/* one download per file per run (Oct 12: the finished season's team box scores were fetched twice) */
const CSV_MEMO = {};
export function getCsv(url) { return CSV_MEMO[url] = CSV_MEMO[url] || getCsv0(url).then(t => { if (t == null) delete CSV_MEMO[url]; return t }) }
async function getCsv0(url) { for (let k = 0; k < 3; k++) { try { const r = await fetch(url, { redirect: "follow" }); if (r.status === 404) return null; if (r.ok) return await r.text() } catch { } await sleep(2000) } return null }
/* a whole CSV file (quoted fields may hold commas and line breaks) → objects */
export function rowsOf(text) { const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = "" } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0]) rows.push(row); row = [] } else cur += c }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const H = rows.shift() || []; return rows.map(f => { const o = {}; H.forEach((h, j) => o[h] = f[j]); return o }) }
export const AL_COLS = [["pts", "team_score"], ["reb", "total_rebounds"], ["oreb", "offensive_rebounds"], ["ast", "assists"], ["stl", "steals"], ["blk", "blocks"], ["tpm", "three_point_field_goals_made"], ["tpa", "three_point_field_goals_attempted"], ["fgm", "field_goals_made"], ["fga", "field_goals_attempted"], ["paint", "points_in_paint"]];
export function nbaTeamRatings(box, minG = 20) {
  const T = {};
  /* the other side of each game (Oct 12 — Sam picked box-score stand-ins for the defense play types NBA.com doesn't track): fast-break
     points and offensive rebounds given up, per game */
  const byG = {}; for (const r of box) if (+r.season_type === 2) (byG[r.game_id] = byG[r.game_id] || []).push(r);
  for (const r of box) { if (+r.season_type !== 2) continue; const a = r.team_abbreviation; const X = T[a] = T[a] || { nm: r.team_display_name, id: +r.team_id, c1: r.team_color, g: 0, w: 0, pf: 0, pa: 0, poss: 0, fga: 0, tpa: 0, paint: 0, fb: 0, tov: 0, ofb: 0, oorb: 0, og: 0 };
    const op = (byG[r.game_id] || []).find(x => x !== r && x.team_abbreviation !== a); if (op) { X.og++; X.ofb += +op.fast_break_points || 0; X.oorb += +op.offensive_rebounds || 0;
      /* what the defense gives up, per game (Oct 21 — the nightly matchup lists): the other side's line in each game */
      const al = X.al = X.al || {}; for (const [k, c] of AL_COLS) al[k] = (al[k] || 0) + (+op[c] || 0) }
    const poss = (+r.field_goals_attempted || 0) - (+r.offensive_rebounds || 0) + (+r.total_turnovers || +r.turnovers || 0) + .44 * (+r.free_throws_attempted || 0);
    X.g++; if (/true/i.test(r.team_winner)) X.w++; X.pf += +r.team_score || 0; X.pa += +r.opponent_team_score || 0; X.poss += poss; X.fga += +r.field_goals_attempted || 0; X.tpa += +r.three_point_field_goals_attempted || 0; X.paint += +r.points_in_paint || 0; X.fb += +r.fast_break_points || 0; X.tov += +r.total_turnovers || 0 }
  const r1 = x => Math.round(10 * x) / 10;
  for (const [k, X] of Object.entries(T)) if (X.g < minG) delete T[k];   /* the All-Star teams (a whole season: under 20 games) */
  for (const X of Object.values(T)) { const p = X.poss || 1; X.l = X.g - X.w; X.ortg = r1(100 * X.pf / p); X.drtg = r1(100 * X.pa / p); X.net = r1(X.ortg - X.drtg); X.pace = r1(p / Math.max(1, X.g)); X.tpr = r1(100 * X.tpa / Math.max(1, X.fga)); X.paint = r1(X.paint / Math.max(1, X.g)); X.fb = r1(X.fb / Math.max(1, X.g)); X.ofb = X.og ? r1(X.ofb / X.og) : null; X.oorb = X.og ? r1(X.oorb / X.og) : null; if (X.al) { for (const k in X.al) X.al[k] = r1(X.al[k] / Math.max(1, X.og)); X.al.g = X.og } delete X.og; X.tovp = r1(100 * X.tov / p); delete X.poss; delete X.fga; delete X.tpa; delete X.tov; X.pf = r1(X.pf / Math.max(1, X.g)); X.pa = r1(X.pa / Math.max(1, X.g)) }
  return T;
}
/* our pick (Oct 11, refit — job/nbatest.mjs): the gap in net rating (points per 100; last season blended with this one) → a logistic
   fit on 2022–23 games, scored blind on 2024–26; the page then takes off for rotation players listed out (see NBA_OUT on the page):
   P(home) = σ(0.259 + 0.985 × gap/10 − 0.28 × (home minutes out − away minutes out) / 48), margin = 1.92 + 7.12 × gap/10 − 2.57 × (…)/48.
   Neutral floors drop the home terms (0.259 and 1.92). */
export function nbaPick(H, A, neutral) { const g = ((H.net || 0) - (A.net || 0)) / 10, z = (neutral ? 0 : 0.259) + 0.985 * g, m = (neutral ? 0 : 1.92) + 7.12 * g;
  return { m: Math.round(10 * m) / 10, p: Math.round(1000 / (1 + Math.exp(-z))) / 1000 } }
/* ---- NBA play-by-play: shot zones, close games and the season series (Oct 10 — Sam: "you have still given me no H2H NBA side") ----
   espn_nba_pbp/play_by_play_{y}.csv (~280 MB a season), read as a stream. coordinate_x_raw runs 0–50 across the court, the hoop at
   (25, 0); coordinate_y_raw is feet from the hoop toward half court (dunks sit at y≈1, corner threes at y −4…7). Checked against a
   sample: 68% at the rim, 38% from the corners, 34% from the top of the arc, the median three 25.8 ft — the NBA's real numbers.
   The zones are the college ones (same keys), so the same court drawing works for both. */
export const NBA_ZONES = ["rim", "paint", "mbL", "mwL", "mt", "mwR", "mbR", "c3L", "w3L", "t3", "w3R", "c3R"];
const NZI = Object.fromEntries(NBA_ZONES.map((z, i) => [z, i]));
export function nbaZone(x, y, pts) {
  if (!(x > -100) || !(y > -100)) return null;
  const dx = x - 25, d = Math.hypot(dx, y), a = Math.atan2(dx, Math.max(y, .01)) * 180 / Math.PI;
  if (pts === 3) { if (y < 9) return dx > 0 ? "c3L" : "c3R"; return a > 36 ? "w3L" : a < -36 ? "w3R" : "t3" }
  if (d < 4) return "rim";
  if (y < 13.75 && Math.abs(dx) < 8) return "paint";
  if (y < 9) return dx > 0 ? "mbL" : "mbR";
  return a > 36 ? "mwL" : a < -36 ? "mwR" : "mt";
}
/* lines of a CSV → field arrays, as they stream in (a quoted field may run across lines) */
export async function* csvStream(chunks) {
  let rest = "", buf = "";
  for await (const ch of chunks) { rest += typeof ch === "string" ? ch : new TextDecoder().decode(ch, { stream: true }); let i;
    while ((i = rest.indexOf("\n")) >= 0) { const line = rest.slice(0, i).replace(/\r$/, ""); rest = rest.slice(i + 1);
      buf = buf ? buf + "\n" + line : line; if ((buf.match(/"/g) || []).length % 2) continue; yield csvLine(buf); buf = "" } }
  if (rest || buf) yield csvLine(buf ? buf + "\n" + rest : rest);
}
/* one season's play-by-play → { games, avg, teams: { ABBR: { o, d, cl:[w,l] } }, series: [[date, home, away, hs, as]] } (regular season) */
export async function nbaPbpSummary(rows) {
  let I = null; const G = {}, T = {}, avg = NBA_ZONES.map(() => [0, 0]), PL = {};
  /* on the floor (Oct 12 — Sam: the "where opponents shot with him on" court chart on the NBA defense tab, like college): the file has
     no lineups, so each game is replayed from its substitutions — a period's starters are the players who show up (as the main name on
     a play, or subbed out) before being subbed in; then every shot is credited to the five defenders on the floor: dz[zone] = [made, tries] */
  let gRows = [], gId = null;
  const onCourt = rows => { const byP = {}; for (const f of rows) (byP[+f[I.per] || 0] = byP[+f[I.per] || 0] || []).push(f);
    for (const R of Object.values(byP)) { const on = {}, seenIn = {};
      for (const f of R) { const t = f[I.tid]; if (!t) continue; const S0 = on[t] = on[t] || new Set(), IN = seenIn[t] = seenIn[t] || new Set();
        if (f[I.ty] === "584") { const a = f[I.a1], b = f[I.a2]; if (b && b !== "NA" && !IN.has(b) && S0.size < 5) S0.add(b); if (a && a !== "NA") IN.add(a) }
        else { const a = f[I.a1]; if (a && a !== "NA" && !IN.has(a) && S0.size < 5) S0.add(a) } }
      const cur = {}; for (const [t, S0] of Object.entries(on)) cur[t] = new Set(S0);
      for (const f of R) { const t = f[I.tid];
        if (f[I.ty] === "584") { const C = cur[t] = cur[t] || new Set(); C.delete(f[I.a2]); C.add(f[I.a1]); continue }
        if (f[I.sh] !== "true") continue; const pts = +f[I.pa]; if (pts !== 2 && pts !== 3) continue; const z = nbaZone(+f[I.x], +f[I.y], pts); if (!z) continue;
        const dt = Object.keys(cur).find(k => k !== t); if (!dt) continue; const k = NZI[z], m = f[I.sc] === "true" ? 1 : 0;
        for (const id of cur[dt]) { const P = pl(id, null); if (!P) continue; P.dz = P.dz || NBA_ZONES.map(() => [0, 0]); P.dz[k][0] += m; P.dz[k][1]++; P.dtm = P.dtm || null } } } };
  /* players (Oct 11 — Sam approved "NBA player play-by-play"): the shooter's zones, his assists (the second athlete on a made shot), and
     his clutch line — last 5 minutes of the 4th or overtime, within 5: [points, fgm, fga, ftm, fta] */
  const pl = (id, ab) => { if (!id || id === "NA") return null; const P = PL[id] = PL[id] || { tm: ab, z: NBA_ZONES.map(() => [0, 0]), ast: 0, cl: [0, 0, 0, 0, 0] }; if (ab) P.tm = ab; return P };
  const team = ab => T[ab] = T[ab] || { o: NBA_ZONES.map(() => [0, 0]), d: NBA_ZONES.map(() => [0, 0]), cl: [0, 0] };
  for await (const f of rows) {
    if (!I) { const ix = n => f.indexOf(n); I = { st: ix("season_type"), gid: ix("game_id"), ha: ix("home_team_abbrev"), aa: ix("away_team_abbrev"), hid: ix("home_team_id"), tid: ix("team_id"), hs: ix("home_score"), as: ix("away_score"), per: ix("period_number"), rem: ix("end_game_seconds_remaining"), sh: ix("shooting_play"), sc: ix("scoring_play"), pa: ix("points_attempted"), a1: ix("athlete_id_1"), a2: ix("athlete_id_2"), x: ix("coordinate_x_raw"), y: ix("coordinate_y_raw"), dt: ix("game_date"), ty: ix("type_id") };
      if (I.gid < 0 || I.x < 0 || I.pa < 0) throw new Error("NBA play-by-play columns changed: " + f.slice(0, 25).join(",")); continue }
    if (f[I.st] !== "2") continue;
    if (f[I.gid] !== gId) { if (gRows.length) onCourt(gRows); gRows = []; gId = f[I.gid] } gRows.push(f);
    const ha = f[I.ha], aa = f[I.aa]; if (!ha || !aa) continue;
    const g = G[f[I.gid]] = G[f[I.gid]] || { h: ha, a: aa, d: f[I.dt], hs: 0, as: 0, cl: false };
    const hs = +f[I.hs] || 0, as = +f[I.as] || 0; if (hs > g.hs) g.hs = hs; if (as > g.as) g.as = as;
    const per = +f[I.per] || 0; if (per > 4 || (per === 4 && +f[I.rem] <= 300 && Math.abs(hs - as) <= 5)) g.cl = true;
    if (f[I.sh] !== "true") continue; const pts = +f[I.pa];
    const off0 = f[I.tid] === f[I.hid] ? ha : aa, made0 = f[I.sc] === "true", clutch = per > 4 || (per === 4 && +f[I.rem] <= 300 && Math.abs(hs - as) <= 5 + (made0 ? pts : 0));
    const S1 = I.a1 >= 0 ? pl(f[I.a1], off0) : null;
    if (S1 && clutch) { if (pts === 1) { S1.cl[3] += made0 ? 1 : 0; S1.cl[4]++ } else if (pts === 2 || pts === 3) { S1.cl[1] += made0 ? 1 : 0; S1.cl[2]++ } if (made0) S1.cl[0] += pts }
    if (pts !== 2 && pts !== 3) continue;
    if (made0 && I.a2 >= 0) { const A2 = pl(f[I.a2], off0); if (A2) A2.ast++ }
    const z = nbaZone(+f[I.x], +f[I.y], pts); if (!z) continue;
    const off = off0, def = off === ha ? aa : ha, k = NZI[z], m = made0 ? 1 : 0; if (S1) { S1.z[k][0] += m; S1.z[k][1]++ }
    team(off).o[k][0] += m; team(off).o[k][1]++; team(def).d[k][0] += m; team(def).d[k][1]++; avg[k][0] += m; avg[k][1]++;
  }
  if (gRows.length) onCourt(gRows);
  const series = [];
  for (const g of Object.values(G)) { if (!g.hs && !g.as) continue; series.push([g.d, g.h, g.a, g.hs, g.as]);
    if (g.cl) { const hw = g.hs > g.as; team(g.h).cl[hw ? 0 : 1]++; team(g.a).cl[hw ? 1 : 0]++ } }
  series.sort((x, y) => x[0].localeCompare(y[0]));
  return { v: 3, games: series.length, avg, teams: T, series, players: PL };
}
async function nbaPbpSeason(y, log) {
  const r = await fetch(REL("espn_nba_pbp", `play_by_play_${y}.csv`), { redirect: "follow" }).catch(() => null);
  if (!r || r.status === 404 || !r.ok || !r.body) return null;
  const t0 = Date.now(), out = await nbaPbpSummary(csvStream(r.body));
  log(`nba pbp ${y}: ${out.games} games, ${Object.keys(out.teams).length} teams, ${Math.round((Date.now() - t0) / 1000)}s`);
  return out;
}

/* roster extras for the NBA profile header (Oct 12 — Sam: "the nba player profile header should also be a lot more like this"): weight,
   jersey, where he's from, ESPN's position name */
export const rosExtra = r => [parseInt(r.weight) || null, r.jersey != null && r.jersey !== "" && r.jersey !== "NA" ? String(r.jersey) : null,
  [r.birth_place_city, r.birth_place_country && r.birth_place_country !== "USA" ? r.birth_place_country : r.birth_place_state].filter(x => x && x !== "NA").join(", ") || null, r.position_name && r.position_name !== "NA" ? r.position_name : null];
export async function buildNbaGames({ getPack, putPack, log, S, curNba, players, colOfEspn = () => null }) {
  /* last season is finished, so its team ratings are worked out once and kept (Oct 17 — Sam: "calling the information only once and keeping
     the stagnant information on site"); only this season's files are read each run */
  const sched = await getCsv(REL("espn_nba_schedules", `nba_schedule_${curNba}.csv`)), ros = await getCsv(REL("espn_nba_rosters", `rosters_${curNba}.csv`));
  const LT = await getPack("p2000_cbb-nbalastteams").catch(() => null); let T;
  if (LT && LT.season === curNba - 1 && LT.T && Object.keys(LT.T).length >= 30 && Object.values(LT.T)[0].al) { T = LT.T; log(`nba: ${curNba - 1} team ratings kept`) }
  else { const box = await getCsv(REL("espn_nba_team_boxscores", `team_box_${curNba - 1}.csv`)); if (!box) { log("nba games: files not out yet"); return null }
    T = nbaTeamRatings(rowsOf(box)); await putPack("p2000_cbb-nbalastteams", { season: curNba - 1, T: JSON.parse(JSON.stringify(T)) }) }
  if (!sched) { log("nba games: files not out yet"); return null }
  /* this season, once it starts (Oct 10 — "ready to start populating with the new season?"): this season's box scores blend into the
     rating behind our pick, game by game (15 games = half each), and each team's record this season rides along */
  const curBox = await getCsv(REL("espn_nba_team_boxscores", `team_box_${curNba}.csv`)).catch(() => null), TC = curBox ? nbaTeamRatings(rowsOf(curBox), 1) : {};
  for (const [ab, X] of Object.entries(T)) { const c = TC[ab]; X.pnet = X.net;
    /* allowed per game: this season blended in game by game (15 games = half each), like the net rating */
    if (c && c.al && c.al.g && X.al) { const w = c.al.g / (c.al.g + 15), b = {}; for (const k in X.al) if (k !== "g") b[k] = Math.round(10 * (w * (c.al[k] || 0) + (1 - w) * X.al[k])) / 10; X.alNow = b; X.alNow.cg = c.al.g }
    if (c && c.g) { const w = c.g / (c.g + 15); X.pnet = Math.round(10 * (w * c.net + (1 - w) * X.net)) / 10; X.cw = c.w; X.cl = c.l; X.cnet = c.net } }
  /* this season's rosters: every player, with his college (our ESPN-id join) and last season's NBA line */
  const byE = {}; for (const [eid, X] of Object.entries(players || {})) byE[eid] = X;
  /* last season's line for everyone (college or not) from the box-score cache */
  const NH = getPack ? await getPack("p2000_cbb-nbahist").catch(() => null) : null, lastS = (NH && NH.seasons && NH.seasons[curNba - 1]) || {};
  /* each team's rotation for the "who's out" adjustment: players on the current roster with 12+ minutes a game (this season once he
     has 3 games, otherwise last season's with 10+) — [espnId, name, minutes a game] */
  const curS = (NH && NH.seasons && NH.seasons[curNba]) || {};
  if (ros) for (const r of rowsOf(ros)) { const X = T[r.team_abbreviation]; if (!X) continue; const c = curS[r.athlete_id], l = lastS[r.athlete_id];
    const mpg = c && c[2] >= 3 ? c[4] / c[2] : l && l[2] >= 10 ? l[4] / l[2] : 0; if (mpg >= 12) (X.rot = X.rot || []).push([String(r.athlete_id), r.display_name, Math.round(10 * mpg) / 10]) }
  if (ros) for (const r of rowsOf(ros)) { const X = T[r.team_abbreviation]; if (!X) continue; const P = byE[r.athlete_id], ls = lastS[r.athlete_id];
    (X.ros = X.ros || []).push([r.athlete_id, r.display_name, r.position_abbreviation, r.height, +r.experience_years || 0, P ? P.cid : null, ls && ls[2] ? Math.round(10 * ls[5] / ls[2]) / 10 : null, P ? P.tag.t : null, ls ? ls[2] : 0, colOfEspn(String(r.athlete_id)), String(r.date_of_birth || "").slice(0, 10) || null, ...rosExtra(r)]) }   /* [9] college team id, [10] birth date (Oct 12); [11] weight, [12] jersey, [13] from, [14] position name (Oct 12, the profile header) */
  const games = []; for (const g of rowsOf(sched)) { const st = +g.season_type; if (st !== 2 && st !== 3 && st !== 5) continue;   /* 5 = play-in (Oct 21 audit) */ const h = g.home_abbreviation, a = g.away_abbreviation; if (!T[h] || !T[a]) continue;
    const pk = nbaPick({ net: T[h].pnet }, { net: T[a].pnet }, /true/i.test(g.neutral_site)); games.push([+g.id, g.date, h, a, /true/i.test(g.status_type_completed) ? +g.home_score : null, /true/i.test(g.status_type_completed) ? +g.away_score : null, g.status_type_state, g.broadcast_name || g.broadcast || "", pk.p, pk.m, st === 3 ? 1 : 0]) }
  games.sort((x, y) => x[1].localeCompare(y[1]));
  /* shot zones, close games and the series from the play-by-play: last season's is cached (it won't change); this season's is
     re-read each run and takes over once there are 150 games */
  let last = getPack ? await getPack(`p2000_cbb-nbapbp${curNba - 1}`).catch(() => null) : null;
  if (!last || !last.games || last.v !== 3) {   /* v3 (Oct 12): opponents' shots with each player on the floor — the finished season read once more for it, then kept */ last = await nbaPbpSeason(curNba - 1, log).catch(e => (log("nba pbp: " + e.message), null)); if (last && last.games > 1000 && putPack) await putPack(`p2000_cbb-nbapbp${curNba - 1}`, last) }
  const cur = await nbaPbpSeason(curNba, log).catch(e => (log("nba pbp: " + e.message), null));
  const Z = cur && cur.games >= 150 ? cur : last, zSeason = Z === cur ? curNba : curNba - 1;
  if (Z) for (const [ab, X] of Object.entries(T)) { const z = Z.teams[ab]; if (z) { X.zo = z.o; X.zd = z.d; X.close = z.cl } }   /* "close": last season's close games ("cl" is this season's losses — Oct 22 audit) */
  const series = [...(last ? last.series.map(g => [curNba - 1, ...g]) : []), ...(cur ? cur.series.map(g => [curNba, ...g]) : [])];
  /* players' zones, assists and clutch lines from the same season as the team zones (20+ shots, or any clutch shot) */
  const pz = {}; if (Z && Z.players) for (const [id, P] of Object.entries(Z.players)) { const n = P.z.reduce((a, z) => a + z[1], 0); if (n >= 20 || P.cl[2] + P.cl[4] > 0 || (P.dz && P.dz.reduce((a, z) => a + z[1], 0) >= 300)) pz[id] = P }
  /* game logs (this season once it has games, else last season): [date, team, opp, home 1/0, min, pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, +/-, started] */
  try { const LG0 = await getPack(`p${S}_cbb-nbalogs`).catch(() => null);
    for (const y of [curNba, curNba - 1]) { if (y < curNba && LG0 && LG0.season === y && LG0.p && LG0.v === 2) { log(`nba logs ${y}: kept (season finished)`); break }   /* a finished season's logs never change (Oct 17) */
      const txt = await getCsv(REL("espn_nba_player_boxscores", `player_box_${y}.csv`)); if (!txt) continue; const R = rowsOf(txt).filter(r => [2, 3, 5].includes(+r.season_type) && +r.minutes > 0); if (R.length < 120) continue;   /* Oct 21 audit: playoffs and play-in count too, and the new season takes over after about two nights (was 500 rows, 3–4 nights) */
      const P = {}; for (const r of R) (P[r.athlete_id] = P[r.athlete_id] || []).push([String(r.game_date || "").slice(0, 10), r.team_abbreviation, r.opponent_team_abbreviation, /home/i.test(r.home_away) ? 1 : 0, Math.round(+r.minutes), +r.points || 0, +r.rebounds || 0, +r.assists || 0, +r.steals || 0, +r.blocks || 0, +r.turnovers || 0, +r.field_goals_made || 0, +r.field_goals_attempted || 0, +r.three_point_field_goals_made || 0, +r.three_point_field_goals_attempted || 0, +r.free_throws_made || 0, +r.free_throws_attempted || 0, r.plus_minus === "" || r.plus_minus == null ? null : +r.plus_minus, /true/i.test(r.starter) ? 1 : 0, +r.offensive_rebounds || 0]);
      for (const k in P) P[k].sort((a, b) => a[0].localeCompare(b[0]));
      /* keep last season's full logs when this season takes over — the nightly matchup lists are tuned on them (Oct 22) */
      if (LG0 && LG0.p && LG0.season === y - 1 && y === curNba) await putPack("p2000_cbb-nbalogs-prev", LG0).catch(e => log("nba logs prev: " + e.message));
      await putPack(`p${S}_cbb-nbalogs`, { season: y, cols: ["date", "team", "opp", "home", "min", "pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "pm", "start", "oreb"], p: P, v: 2 });
      log(`nba logs ${y}: ${Object.keys(P).length} players`); break } } catch (e) { log("nba logs: " + e.message) }
  /* last season's per-game lines with offensive rebounds (Oct 21 — the nightly matchup lists need a full season behind each player while this
     one is young): p2000_cbb-nbaprev = { season, cols, p: { espnId: [games, min, pts, reb, oreb, ast, stl, blk, fgm, fga, tpm, tpa, ftm, fta] a game } }, built once */
  try { const PV = await getPack("p2000_cbb-nbaprev").catch(() => null), y = curNba - 1;
    if (!PV || PV.season !== y) { const txt = await getCsv(REL("espn_nba_player_boxscores", `player_box_${y}.csv`));
      if (txt) { const A = {}; for (const r of rowsOf(txt)) { if (+r.season_type !== 2 || !(+r.minutes > 0)) continue; const a = A[r.athlete_id] = A[r.athlete_id] || new Array(14).fill(0); a[0]++;
          [r.minutes, r.points, r.rebounds, r.offensive_rebounds, r.assists, r.steals, r.blocks, r.field_goals_made, r.field_goals_attempted, r.three_point_field_goals_made, r.three_point_field_goals_attempted, r.free_throws_made, r.free_throws_attempted].forEach((v, i) => a[i + 1] += +v || 0) }
        const P = {}; for (const [id, a] of Object.entries(A)) if (a[0] >= 5) P[id] = [a[0], ...a.slice(1).map(v => Math.round(10 * v / a[0]) / 10)];
        await putPack("p2000_cbb-nbaprev", { season: y, cols: ["g", "min", "pts", "reb", "oreb", "ast", "stl", "blk", "fgm", "fga", "tpm", "tpa", "ftm", "fta"], p: P }); log(`nba prev ${y}: ${Object.keys(P).length} players`) } } } catch (e) { log("nba prev: " + e.message) }
  /* every NBA player on a current roster or who played the last two seasons gets a profile (Oct 11 — Sam: "multiple players are unclickable
     for the NBA"): his NBA seasons since 2009 — [season, team, gp, gs, min, pts, reb, ast, stl, blk, tov, fgm, fga, tpm, tpa, ftm, fta, playoffs [gp, gs, min, pts] or null] */
  /* Oct 12 (Sam: career tags for NBA players who skipped college "seems like a yes"): every NBA player gets the same tag, against the league */
  const RKS = seasonRanks((NH && NH.seasons) || {}), latestY = Object.keys(RKS).length ? Math.max(...Object.keys(RKS).map(Number)) : null;
  const tagOf = (id, S0) => { const o = {}; for (const [y, M] of Object.entries(RKS)) if (M[id]) o[y] = M[id]; return nbaTag(S0, curNba, Object.keys(RKS).length ? o : null, latestY).t };
  const allp = {}; { const want = new Set([...Object.keys(lastS), ...Object.keys(curS)]); if (ros) for (const r of rowsOf(ros)) want.add(String(r.athlete_id));
    const nmR = {}; if (ros) for (const r of rowsOf(ros)) nmR[String(r.athlete_id)] = [r.display_name, r.team_abbreviation, r.position_abbreviation, r.height, +r.experience_years || 0];
    for (const id of want) { const S0 = []; for (const [y, P] of Object.entries((NH && NH.seasons) || {})) { const r = P[id]; if (r) S0.push([+y, r[1], ...r.slice(2, 17), r[17] ? r[17].slice(0, 3).concat([r[17][3]]) : null]) }
      S0.sort((a, b) => a[0] - b[0]); const rr = nmR[id]; if (!S0.length && !rr) continue; allp[id] = { tag: S0.length ? tagOf(id, S0) : "Rookie", nm: rr ? rr[0] : (S0.length ? (NH.seasons[S0[S0.length - 1][0]][id] || [])[0] : ""), tm: rr ? rr[1] : (S0.length ? S0[S0.length - 1][1] : null), pos: rr ? rr[2] : null, ht: rr ? rr[3] : null, exp: rr ? rr[4] : null, s: S0 } } }
  /* every NBA team's seasons (Oct 12 — Sam: "the NBA team profiles look very thin compared to every other profile"): from the team box
     scores, 2010 on, keyed by ESPN team id (abbreviations changed: NJN → BKN, NOH → NOP) → p2000_cbb-nbateamhist
     { cols, s: { season: { teamId: [w, l, net, ortg, drtg, pace, playoffW, playoffL, abbr] } } }; finished seasons are read once */
  try { let TH = await getPack("p2000_cbb-nbateamhist").catch(() => null); if (!TH || !TH.s) TH = { s: {} }; let got = 0;
    for (let y = 2010; y <= curNba; y++) { if (TH.s[y] && y < curNba - 1 && Object.values(TH.s[y])[0] && Object.values(TH.s[y])[0].length >= 11) continue;   /* rows without play-in games (Oct 12) are read once more */ const txt = await getCsv(REL("espn_nba_team_boxscores", `team_box_${y}.csv`)).catch(() => null); if (!txt) continue;
      const R = rowsOf(txt), Tr = nbaTeamRatings(R, y === curNba ? 1 : 20), po = {};
      const pi = {}; for (const r of R) { const st = +r.season_type; if (st === 3) { const o = po[r.team_id] = po[r.team_id] || [0, 0]; if (/true/i.test(r.team_winner)) o[0]++; else o[1]++ }
        else if (st === 5) { const o = pi[r.team_id] = pi[r.team_id] || [0, 0]; if (/true/i.test(r.team_winner)) o[0]++; else o[1]++ } }   /* 5 = play-in (2021 on) */
      const out = {}; for (const [ab, X] of Object.entries(Tr)) out[X.id] = [X.w, X.l, X.net, X.ortg, X.drtg, X.pace, (po[X.id] || [0, 0])[0], (po[X.id] || [0, 0])[1], ab, (pi[X.id] || [0, 0])[0], (pi[X.id] || [0, 0])[1]];
      if (Object.keys(out).length) { TH.s[y] = out; got++ } }
    TH.cols = ["w", "l", "net", "ortg", "drtg", "pace", "playoffW", "playoffL", "abbr", "playInW", "playInL"]; if (got) await putPack("p2000_cbb-nbateamhist", TH); log(`nba team history: ${Object.keys(TH.s).length} seasons (${got} read)`) } catch (e) { log("nba team history: " + e.message) }
  /* everyone else with an NBA season since 2009 (Oct 11 audit: retired and overseas draft picks — Emmanuel Mudiay, Dragan Bender — had no
     page): the same shape as allp, in its own pack the page reads only when it needs a name it can't find */
  { const all = {}; for (const [y, P] of Object.entries((NH && NH.seasons) || {})) for (const [id, r] of Object.entries(P)) { if (allp[id]) continue; const X = all[id] = all[id] || { nm: r[0], tm: r[1], s: [] }; X.s.push([+y, r[1], ...r.slice(2, 17), r[17] ? r[17].slice(0, 3).concat([r[17][3]]) : null]); X.tm = r[1] }
    for (const [id, X] of Object.entries(all)) { X.s.sort((a, b) => a[0] - b[0]); X.tag = tagOf(id, X.s) }
    await putPack(`p${S}_cbb-nbaall`, { p: all }); log(`nba: ${Object.keys(all).length} more NBA players with pages`) }
  /* the five positions (Oct 17 — Sam: "why … when those are all pretty common positions to know"): ESPN's NBA feed only says G, F or C,
     so the PG / SG / SF / PF / C come from ESPN's fantasy basketball player list (same player ids), one call per run */
  const p5 = {}; for (const yy of [curNba + 1, curNba]) { try { const r = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${yy}/players?view=players_wl`, { headers: { "x-fantasy-filter": JSON.stringify({ filterActive: { value: true } }), accept: "application/json" } });
      if (!r.ok) continue; const L = await r.json(); if (!Array.isArray(L) || L.length < 300) continue; const PN = ["", "PG", "SG", "SF", "PF", "C"];
      for (const x of L) { const k = PN[x.defaultPositionId]; if (k) p5[String(x.id)] = k } log(`nba positions (ESPN fantasy ${yy}): ${Object.keys(p5).length}`); break } catch (e) { log("nba positions: " + e.message) } }
  for (const [id, X] of Object.entries(allp)) if (p5[id]) X.p5 = p5[id];
  await putPack(`p${S}_cbb-nbagames`, { season: curNba, zSeason: Z ? zSeason : null, zAvg: Z ? Z.avg : null, pz, allp, p5, series, seriesCols: ["season", "date", "home", "away", "hs", "as"], teams: T, games, cols: ["id", "date", "home", "away", "hs", "as", "state", "tv", "pHome", "ourMargin", "playoffs"], rosCols: ["espnId", "name", "pos", "ht", "exp", "collegeCbbdId", "ppgLast", "outcome", "gamesLast"] });
  log(`nba games: ${games.length} games, ${Object.keys(T).length} teams`);
  return true;
}
/* the nbastats-only run (no CBBD or ESPN calls): bring the play-by-play summary up to date (v3 = with opponents' shots on the floor) and
   patch the players' zones into the games pack already on the site, without rebuilding it (Oct 12) */
export async function refreshNbaOnCourt({ getPack, putPack, log, curNba, packNames }) {
  let last = await getPack(`p2000_cbb-nbapbp${curNba - 1}`).catch(() => null);
  if (!last || !last.games || last.v !== 3) { last = await nbaPbpSeason(curNba - 1, log).catch(e => (log("nba pbp: " + e.message), null)); if (last && last.games > 1000) await putPack(`p2000_cbb-nbapbp${curNba - 1}`, last) }
  if (!last || !last.players) return;
  for (const nm of packNames) { const G = await getPack(nm).catch(() => null); if (!G || !G.pz) continue; if (G.zSeason !== curNba - 1) { log(`nba on-court: ${nm} shows ${G.zSeason}, left alone`); return }
    try { const ros = await getCsv(REL("espn_nba_rosters", `rosters_${curNba}.csv`)); if (ros) { const X = {}; for (const r of rowsOf(ros)) X[String(r.athlete_id)] = rosExtra(r);
        for (const T of Object.values(G.teams || {})) for (const row of T.ros || []) { const e = X[String(row[0])]; if (e) row.splice(11, 4, ...e) } } } catch (e) { log("nba roster extras: " + e.message) }
    let n = 0; for (const [id, P] of Object.entries(last.players)) { if (!P.dz || P.dz.reduce((a, z) => a + z[1], 0) < 300) continue; G.pz[id] = { ...(G.pz[id] || { tm: P.tm, z: P.z, ast: P.ast, cl: P.cl }), dz: P.dz }; n++ }
    await putPack(nm, G); log(`nba on-court: ${n} players' opponent shots added to ${nm}`); return }
}
