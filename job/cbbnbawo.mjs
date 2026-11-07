/* NBA "When he's out" (Nov 6 — Sam, 11:51 am: "what about the when a player is out which players get boosts on basketball teams … like
   paul reed last year for detroit when a big man was out"; the study at 11:45 am showed the boost repeats, split-half r .34, and goes to the
   same position; 6:29 pm: "you don't need my go ahead"). From the open sportsdataverse NBA player box scores (GitHub; the files the NBA job
   already reads), this season and last, regular season:
   - a key player: 18+ minutes a game when he plays (Sam's example, Isaiah Stewart, played about 20), 5+ team games missed between his first and last game for the team (a coach's decision,
     the box score's "COACH'S DECISION" reason, isn't counted as out)
   - for each teammate with 3+ games while he sat and 3+ with him: minutes, points, rebounds and assists a game, with him and without him,
     and the team's average margin both ways.
   Writes p2000_cbb-nbawo { v, at, cols, s: { season: { espnId: { nm, tm, gp, out, mg: [with, without], m: [[mateId, name, pos, gIn, gOut,
   minIn, minOut, ptsIn, ptsOut, rebIn, rebOut, astIn, astOut]] } } } }. MODE=nbawo (job/cbb.mjs). No ESPN reads. */
const URL_OF = y => `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`;
function rows(text) { const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); out.push(row); row = []; f = "" } else if (c !== "\r") f += c }
  if (f || row.length) { row.push(f); out.push(row) } return out }
const r1 = v => Math.round(v * 10) / 10;
export function whenOut(R, minMpg = 18) {
  const H = R[0], ix = n => H.indexOf(n), I = { gid: ix("game_id"), d: ix("game_date"), st: ix("season_type"), id: ix("athlete_id"), nm: ix("athlete_display_name"), pos: ix("athlete_position_abbreviation"),
    tm: ix("team_abbreviation"), min: ix("minutes"), pts: ix("points"), reb: ix("rebounds"), ast: ix("assists"), dnp: ix("did_not_play"), why: ix("reason"), ts: ix("team_score"), os: ix("opponent_team_score") };
  const T = {}, P = {};   /* T[team] = { games: { gid: { d, mg } } } ; P[team|id] = { nm, pos, g: { gid: [min, pts, reb, ast] | null (coach's decision) } } */
  for (const x of R.slice(1)) { if (+x[I.st] !== 2) continue; const tm = x[I.tm], gid = x[I.gid]; if (!tm || !gid) continue;
    const t = T[tm] = T[tm] || { games: {} }; t.games[gid] = t.games[gid] || { d: x[I.d], mg: (+x[I.ts] || 0) - (+x[I.os] || 0) };
    const k = tm + "|" + x[I.id], p = P[k] = P[k] || { id: x[I.id], tm, nm: x[I.nm], pos: x[I.pos], g: {} }, min = parseFloat(x[I.min]);
    if (/true/i.test(x[I.dnp] || "") || !(min > 0)) { if (/coach/i.test(x[I.why] || "")) p.g[gid] = null; continue }
    p.g[gid] = [min, +x[I.pts] || 0, +x[I.reb] || 0, +x[I.ast] || 0] }
  const out = {};
  for (const k in P) { const p = P[k], t = T[p.tm], played = Object.entries(p.g).filter(([, v]) => v); if (played.length < 10) continue;
    const mpg = played.reduce((a, [, v]) => a + v[0], 0) / played.length; if (mpg < minMpg) continue;
    const order = Object.entries(t.games).sort((a, b) => String(a[1].d).localeCompare(String(b[1].d))).map(([g]) => g), ds = played.map(([g]) => t.games[g].d).sort();
    const span = order.filter(g => t.games[g].d >= ds[0] && t.games[g].d <= ds[ds.length - 1]), outG = span.filter(g => !(g in p.g)), inG = span.filter(g => p.g[g]);
    if (outG.length < 5) continue;
    const mg = s => r1(s.reduce((a, g) => a + t.games[g].mg, 0) / Math.max(1, s.length)), M = [];
    for (const k2 in P) { const q = P[k2]; if (q.tm !== p.tm || q.id === p.id) continue; const a = inG.filter(g => q.g[g]), b = outG.filter(g => q.g[g]); if (a.length < 3 || b.length < 3) continue;
      const av = (L, j) => r1(L.reduce((s, g) => s + q.g[g][j], 0) / L.length);
      M.push([q.id, q.nm, q.pos, a.length, b.length, av(a, 0), av(b, 0), av(a, 1), av(b, 1), av(a, 2), av(b, 2), av(a, 3), av(b, 3)]) }
    M.sort((x, y) => (y[6] - y[5]) - (x[6] - x[5]));
    out[p.id] = { nm: p.nm, tm: p.tm, pos: p.pos, gp: inG.length, out: outG.length, mpg: r1(mpg), mg: [mg(inG), mg(outG)], m: M.slice(0, 12) } }
  return out;
}
/* college missed games (Nov 6, #76 — the college basketball injury outline): each player's regular-season games missed between his first and
   last game for a team, by date. The college box scores give no reason, so the page says "no reason given" unless a hand entry
   (public/data/cbb-injuries.json) covers the dates. { espnId: [yyyymmdd] }, rotation players (5+ games, 10+ minutes a game) with at least one missed game */
export function colMiss(R) {
  const H = R[0], ix = n => H.indexOf(n), I = { gid: ix("game_id"), d: ix("game_date"), st: ix("season_type"), id: ix("athlete_id"), tm: ix("team_abbreviation"), min: ix("minutes"), dnp: ix("did_not_play") };
  const T = {}, P = {};
  for (const x of R.slice(1)) { if (+x[I.st] !== 2) continue; const tm = x[I.tm], gid = x[I.gid], id = x[I.id]; if (!tm || !gid || !id) continue; const d = +String(x[I.d] || "").slice(0, 10).replace(/-/g, ""); if (!d) continue;
    (T[tm] = T[tm] || {})[gid] = d; const p = P[tm + "|" + id] = P[tm + "|" + id] || { id, tm, g: new Map() }; if (/true/i.test(x[I.dnp] || "") || !(parseFloat(x[I.min]) > 0)) continue; p.g.set(gid, parseFloat(x[I.min])) }
  const out = {};
  for (const k in P) { const p = P[k]; if (p.g.size < 5 || [...p.g.values()].reduce((a, m) => a + m, 0) / p.g.size < 10) continue;   /* rotation players: 5+ games, 10+ minutes a game */
    const t = T[p.tm], ds = [...p.g.keys()].map(g => t[g]).sort((a, b) => a - b), lo = ds[0], hi = ds[ds.length - 1];
    const miss = Object.entries(t).filter(([g, d]) => d >= lo && d <= hi && !p.g.has(g)).map(([, d]) => d).sort((a, b) => a - b); if (miss.length) out[p.id] = [...(out[p.id] || []), ...miss] }
  return out;
}
export async function buildNbaWo({ putPack, log, curNba }) {
  const s = {}; let n = 0;
  for (const y of [curNba, curNba - 1]) { const r = await fetch(URL_OF(y), { redirect: "follow" }).catch(() => null); if (!r || !r.ok) { log(`nbawo ${y}: no file (${r ? r.status : "error"})`); continue }
    const W = whenOut(rows(await r.text())); s[y] = W; n += Object.keys(W).length; log(`nbawo ${y}: ${Object.keys(W).length} key players with 5+ games out`) }
  const P = { v: 1, at: Date.now(), cols: ["id", "name", "pos", "gIn", "gOut", "minIn", "minOut", "ptsIn", "ptsOut", "rebIn", "rebOut", "astIn", "astOut"], s };
  await putPack("p2000_cbb-nbawo", P);
  /* college (Nov 6, 7:38 pm — the study's college run: split-half r .56, stronger than the NBA's): the men's college box scores, the same
     shape; a key player plays 22+ minutes; the college files give no reason for a missed game, so every missed game counts */
  const c = {}; let nc = 0;
  for (const y of [curNba, curNba - 1]) { const r = await fetch(`https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_player_boxscores/player_box_${y}.csv`, { redirect: "follow" }).catch(() => null);
    if (!r || !r.ok) { log(`colwo ${y}: no file (${r ? r.status : "error"})`); continue } const W = whenOut(rows(await r.text()), 22); c[y] = W; nc += Object.keys(W).length; log(`colwo ${y}: ${Object.keys(W).length} key players with 5+ games out`) }
  await putPack("p2000_cbb-colwo", { ...P, s: c });
  /* college missed games, 2022 on (#76): seasons already read above are parsed again from their text, the rest downloaded */
  const cm = {}; let ncm = 0;
  for (let y = 2022; y <= curNba; y++) { const r = await fetch(`https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_player_boxscores/player_box_${y}.csv`, { redirect: "follow" }).catch(() => null);
    if (!r || !r.ok) { log(`colmiss ${y}: no file (${r ? r.status : "error"})`); continue } const M = colMiss(rows(await r.text())); cm[y] = M; ncm += Object.keys(M).length; log(`colmiss ${y}: ${Object.keys(M).length} players with a missed game`) }
  await putPack("p2000_cbb-colmiss", { v: 1, at: Date.now(), s: cm });
  return { msg: `When he's out: ${n} NBA and ${nc} college key players across ${Object.keys(s).join(", ")} · college missed games: ${ncm} player-seasons` };
}
