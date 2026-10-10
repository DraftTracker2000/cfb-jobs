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
