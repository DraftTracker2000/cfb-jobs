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
/* how an NBA career turned out, from what he did on the floor (no awards data): Star · Starter · Rotation · Bench · Brief */
export function nbaTag(seasons, curY) {
  const reg = seasons.map(s => ({ y: s[0], gp: s[2], gs: s[3], mpg: s[2] ? s[4] / s[2] : 0, ppg: s[2] ? s[5] / s[2] : 0 }));
  const gp = reg.reduce((a, s) => a + s.gp, 0), starterYrs = reg.filter(s => s.gs >= 41).length, rotYrs = reg.filter(s => s.gp >= 40 && s.mpg >= 18).length, peak = Math.max(0, ...reg.filter(s => s.gp >= 40).map(s => s.ppg));
  const yrs = reg.length, young = curY - Math.min(...reg.map(s => s.y)) < 3;
  if (peak >= 20 || reg.filter(s => s.gp >= 50 && s.ppg >= 17).length >= 3) return { t: "Star", c: "gold" };
  if (starterYrs >= 3) return { t: "Starter", c: "good" };
  if (rotYrs >= 3 || starterYrs >= 2) return { t: "Rotation", c: "ok" };
  if (young) return { t: "Early career", c: "" };
  if (gp >= 150) return { t: "Bench", c: "" };
  return { t: "Brief", c: "bad" };
}

export async function buildNba({ getPack, putPack, log, full, curNba, live, sidToCbbd, draftById }) {
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
  for (const [y, P] of Object.entries(NH.seasons)) for (const [eid, row] of Object.entries(P)) {
    const cid = sidToCbbd[eid]; if (!cid) continue;
    const X = players[eid] = players[eid] || { nm: row[0], cid, seasons: [] };
    X.seasons.push([+y, row[1], ...row.slice(2, 17), row[17] ? row[17].slice(0, 3).concat([row[17][3]]) : null]);
  }
  for (const X of Object.values(players)) { X.seasons.sort((a, b) => a[0] - b[0]); X.tag = nbaTag(X.seasons, curNba); const d = draftById[X.cid]; if (d) X.draft = [d.year, d.overall, d.draftTeam];
    const t = X.seasons.reduce((a, s) => { for (let i = 2; i <= 16; i++) a[i - 2] += s[i] || 0; return a }, new Array(15).fill(0)); X.tot = t }
  log(`nba: ${Object.keys(players).length} former Division I players`);
  return players;
}

/* ---- NBA games (Oct 10 — Sam: "the NBA side is also very thin with the no head to head data") ----
   The same open sportsdataverse / hoopR release files: this season's schedule with scores (espn_nba_schedules), last season's team
   box scores (espn_nba_team_boxscores) for each team's ratings, and current rosters (espn_nba_rosters) — joined to the college players
   by ESPN id. Pack p{S}_cbb-nbagames: { season, teams: { ABBR: {...} }, games: [[id, date, home, away, hs, as, state, tv]], cols }. */
const REL = (rel, f) => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/${rel}/${f}`;
async function getCsv(url) { for (let k = 0; k < 3; k++) { try { const r = await fetch(url, { redirect: "follow" }); if (r.status === 404) return null; if (r.ok) return await r.text() } catch { } await sleep(2000) } return null }
/* a whole CSV file (quoted fields may hold commas and line breaks) → objects */
function rowsOf(text) { const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = "" } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0]) rows.push(row); row = [] } else cur += c }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const H = rows.shift() || []; return rows.map(f => { const o = {}; H.forEach((h, j) => o[h] = f[j]); return o }) }
export function nbaTeamRatings(box) {
  const T = {};
  for (const r of box) { if (+r.season_type !== 2) continue; const a = r.team_abbreviation; const X = T[a] = T[a] || { nm: r.team_display_name, id: +r.team_id, c1: r.team_color, g: 0, w: 0, pf: 0, pa: 0, poss: 0, fga: 0, tpa: 0, paint: 0, fb: 0, tov: 0 };
    const poss = (+r.field_goals_attempted || 0) - (+r.offensive_rebounds || 0) + (+r.total_turnovers || +r.turnovers || 0) + .44 * (+r.free_throws_attempted || 0);
    X.g++; if (/true/i.test(r.team_winner)) X.w++; X.pf += +r.team_score || 0; X.pa += +r.opponent_team_score || 0; X.poss += poss; X.fga += +r.field_goals_attempted || 0; X.tpa += +r.three_point_field_goals_attempted || 0; X.paint += +r.points_in_paint || 0; X.fb += +r.fast_break_points || 0; X.tov += +r.total_turnovers || 0 }
  const r1 = x => Math.round(10 * x) / 10;
  for (const [k, X] of Object.entries(T)) if (X.g < 20) delete T[k];   /* the All-Star teams */
  for (const X of Object.values(T)) { const p = X.poss || 1; X.l = X.g - X.w; X.ortg = r1(100 * X.pf / p); X.drtg = r1(100 * X.pa / p); X.net = r1(X.ortg - X.drtg); X.pace = r1(p / Math.max(1, X.g)); X.tpr = r1(100 * X.tpa / Math.max(1, X.fga)); X.paint = r1(X.paint / Math.max(1, X.g)); X.fb = r1(X.fb / Math.max(1, X.g)); X.tovp = r1(100 * X.tov / p); delete X.poss; delete X.fga; delete X.tpa; delete X.tov; X.pf = r1(X.pf / Math.max(1, X.g)); X.pa = r1(X.pa / Math.max(1, X.g)) }
  return T;
}
/* our pick: the gap in last season's net rating (points per 100) plus 2.5 for home court, as a margin; the chance from a normal curve with a 12-point spread */
export function nbaPick(H, A, neutral) { const m = (H.net || 0) - (A.net || 0) + (neutral ? 0 : 2.5); const z = m / 12; const t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2), p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return { m: Math.round(10 * m) / 10, p: Math.round(1000 * (z > 0 ? 1 - p : p)) / 1000 } }
export async function buildNbaGames({ getPack, putPack, log, S, curNba, players }) {
  const sched = await getCsv(REL("espn_nba_schedules", `nba_schedule_${curNba}.csv`)), box = await getCsv(REL("espn_nba_team_boxscores", `team_box_${curNba - 1}.csv`)), ros = await getCsv(REL("espn_nba_rosters", `rosters_${curNba}.csv`));
  if (!sched || !box) { log("nba games: files not out yet"); return null }
  const T = nbaTeamRatings(rowsOf(box));
  /* this season's rosters: every player, with his college (our ESPN-id join) and last season's NBA line */
  const byE = {}; for (const [eid, X] of Object.entries(players || {})) byE[eid] = X;
  /* last season's line for everyone (college or not) from the box-score cache */
  const NH = getPack ? await getPack("p2000_cbb-nbahist").catch(() => null) : null, lastS = (NH && NH.seasons && NH.seasons[curNba - 1]) || {};
  if (ros) for (const r of rowsOf(ros)) { const X = T[r.team_abbreviation]; if (!X) continue; const P = byE[r.athlete_id], ls = lastS[r.athlete_id];
    (X.ros = X.ros || []).push([r.athlete_id, r.display_name, r.position_abbreviation, r.height, +r.experience_years || 0, P ? P.cid : null, ls && ls[2] ? Math.round(10 * ls[5] / ls[2]) / 10 : null, P ? P.tag.t : null, ls ? ls[2] : 0]) }
  const games = []; for (const g of rowsOf(sched)) { const st = +g.season_type; if (st !== 2 && st !== 3) continue; const h = g.home_abbreviation, a = g.away_abbreviation; if (!T[h] || !T[a]) continue;
    const pk = nbaPick(T[h], T[a], /true/i.test(g.neutral_site)); games.push([+g.id, g.date, h, a, g.status_type_completed === "true" ? +g.home_score : null, g.status_type_completed === "true" ? +g.away_score : null, g.status_type_state, g.broadcast_name || g.broadcast || "", pk.p, pk.m, st === 3 ? 1 : 0]) }
  games.sort((x, y) => x[1].localeCompare(y[1]));
  await putPack(`p${S}_cbb-nbagames`, { season: curNba, teams: T, games, cols: ["id", "date", "home", "away", "hs", "as", "state", "tv", "pHome", "ourMargin", "playoffs"], rosCols: ["espnId", "name", "pos", "ht", "exp", "collegeCbbdId", "ppgLast", "outcome", "gamesLast"] });
  log(`nba games: ${games.length} games, ${Object.keys(T).length} teams`);
  return true;
}
