/* NCAA tournament runs (Oct 10 — Sam: "one game i'd like to do is guess the teams final four run. or guess the cinderella by looking
   at the route they took in the tourney to get there. cinderella would have to be teams that got to the sweet 16 or further and like
   9 seed or higher").

   One CBBD call per season (/games?seasonType=postseason&tournament=NCAA) gives every tournament game with both seeds, the region,
   the conferences and the score. Round labels change wording over the years ("1st Round", "1st Rd AT DENVER CO"), so rounds are
   counted from wins instead: the First Four are the early games between equal seeds; after that a team's round is 1 + its wins.

   Pack p2000_cbb-ncaa: { v, seasons: { y: [[date, region, hId, aId, hSeed, aSeed, hs, as, hConf, aConf, firstFour]] }, names: { id: name },
   runs: [[y, teamId, seed, reach, region]] } — reach: 1 round of 64 … 5 Final Four, 6 runner-up, 7 champion. Every Sweet 16 team or
   better is a run; the page picks Final Four runs and Cinderellas (seed 9 or worse, Sweet 16 or better) from them. Past seasons are
   cached; the newest season is re-read in March and April. */
const REGION = /-\s*(East|West|South|Midwest|Southeast|Southwest)\s+Region/i;

/* one season's games → { rows, runs } */
export function seasonRuns(y, games) {
  const G = games.filter(g => g.status === "final" && g.homePoints != null && g.awayPoints != null).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const firstMain = G.find(g => g.homeSeed !== g.awaySeed);
  /* a stored row keeps the flag worked out from full timestamps: a 10 pm Eastern First Four game is the next day in UTC (UCLA 2021),
     so date-only rows can't re-derive it */
  const ff = new Set(G.some(g => g.first != null) ? G.filter(g => g.first).map(g => g.id) : firstMain ? G.filter(g => g.homeSeed === g.awaySeed && g.startDate < firstMain.startDate).map(g => g.id) : []);
  const T = {}, rows = [];
  for (const g of G) {
    const m0 = REGION.exec(g.gameNotes || ""), m = m0 && [m0[0], m0[1][0].toUpperCase() + m0[1].slice(1).toLowerCase()], first = ff.has(g.id) ? 1 : 0;
    rows.push([String(g.startDate).slice(0, 10), m ? m[1] : null, g.homeTeamId, g.awayTeamId, g.homeSeed, g.awaySeed, g.homePoints, g.awayPoints, g.homeConference || null, g.awayConference || null, first]);
    if (first) continue;
    for (const [id, s, won, reg] of [[g.homeTeamId, g.homeSeed, g.homePoints > g.awayPoints, m && m[1]], [g.awayTeamId, g.awaySeed, g.awayPoints > g.homePoints, m && m[1]]]) {
      const x = T[id] = T[id] || { s, w: 0, reg: null }; if (won) x.w++; if (reg && !x.reg) x.reg = reg }
  }
  const runs = Object.entries(T).filter(([, x]) => x.w >= 2).map(([id, x]) => [y, +id, x.s, 1 + x.w, x.reg]);
  return { rows, runs };
}

export async function buildNcaaRuns({ cb, getPack, putPack, log, S, full }) {
  let P = full ? null : await getPack("p2000_cbb-ncaa").catch(() => null);
  if (!P || P.v !== 1) P = { v: 1, seasons: {}, names: {}, runs: [] };
  const mo = new Date().getUTCMonth(), live = mo === 2 || mo === 3;
  let calls = 0;
  for (let y = 2008; y <= S; y++) {
    if (y === 2020) continue;   /* no tournament (COVID) */
    if (P.seasons[y] && !(y === S && live)) continue;
    const games = await cb("/games", { season: y, seasonType: "postseason", tournament: "NCAA" }); calls++;
    if (!games || !games.length) continue;
    for (const g of games) { if (g.homeTeamId) P.names[g.homeTeamId] = g.homeTeam; if (g.awayTeamId) P.names[g.awayTeamId] = g.awayTeam }
    const { rows } = seasonRuns(y, games);
    if (rows.length >= 60) P.seasons[y] = rows;   /* a finished tournament (63 games and the First Four) */
  }
  P.runs = [];
  for (const [y, rows] of Object.entries(P.seasons)) {
    const games = rows.map((r, i) => ({ id: i, status: "final", startDate: r[0], gameNotes: r[1] ? `- ${r[1]} Region` : "", homeTeamId: r[2], awayTeamId: r[3], homeSeed: r[4], awaySeed: r[5], homePoints: r[6], awayPoints: r[7], first: r[10] }));
    P.runs.push(...seasonRuns(+y, games).runs);
  }
  P.runs.sort((a, b) => a[0] - b[0] || b[3] - a[3]);
  await putPack("p2000_cbb-ncaa", P);
  const ff = P.runs.filter(r => r[3] >= 5).length, cin = P.runs.filter(r => r[2] >= 9 && r[3] >= 3).length;
  log(`ncaa runs: ${Object.keys(P.seasons).length} tournaments, ${ff} Final Four runs, ${cin} Cinderellas (9 seed or worse, Sweet 16+) · ${calls} calls`);
  return P;
}
