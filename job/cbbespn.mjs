/* Current rosters from ESPN (Oct 9 — Sam: "some of the rosters are wrong, trey fort and carson cooper are no longer on michigan state";
   CBBD's next-season rosters aren't out yet, ESPN's are: the 2026-27 Michigan State roster lists 15 players without them).
   One call per Division I team (ESPN team id = CBBD sourceId). Each athlete: ESPN id (= CBBD athleteSourceId), name, class, position,
   height, weight, jersey, hometown and any listed injury. The board is built from these lists when at least 80% of Division I answers. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) { for (let k = 0; k < 4; k++) { try { const r = await fetch(url, { headers: { "User-Agent": "mycbbbigboard data job" } }); if (r.status === 404) return null; if (r.ok) return await r.json() } catch { } await sleep(1200 * (k + 1)) } return null }
const CLS = { FR: "FR", SO: "SO", JR: "JR", SR: "SR", GR: "GR", "RS-FR": "FR", "RS-SO": "SO", "RS-JR": "JR", "RS-SR": "SR" };
export async function fetchRosters({ teams, log }) {
  const out = {}; let i = 0, seasonLabel = null;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < teams.length) { const t = teams[i++]; if (!t.sourceId) continue;
    const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${t.sourceId}/roster`); if (!j || !Array.isArray(j.athletes)) continue;
    if (j.season && j.season.year) seasonLabel = j.season.year;
    out[t.id] = j.athletes.map(a => ({ eid: String(a.id), nm: a.fullName || a.displayName, cls: CLS[(a.experience || {}).abbreviation] || null, pos: (a.position || {}).abbreviation || null, ht: a.height || null, wt: a.weight || null, jersey: a.jersey || null,
      home: a.birthPlace ? [a.birthPlace.city, a.birthPlace.state, a.birthPlace.country !== "USA" ? a.birthPlace.country : null].filter(Boolean).join(", ") : "",
      inj: (a.injuries || []).length ? (a.injuries[0].status || a.injuries[0].type || "Injured") : null })) } }));
  log(`ESPN rosters: ${Object.keys(out).length} teams, ${Object.values(out).reduce((a, r) => a + r.length, 0)} players (season ${seasonLabel})`);
  return { rosters: out, season: seasonLabel };
}

/* ESPN's game summary (Oct 10 — found while hunting hidden data): the same plays as CBBD (CBBD's play sourceId is ESPN's play id) but
   with a court coordinate on every TURNOVER, plus the officials and attendance. One call per game; only what we use is kept:
   { off: [referee names], att, tov: { espnPlayId: [x, y] } } — x 0–50 across the floor, y feet out from the offense's baseline. */
export async function fetchSummary(eventId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`;
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url, { headers: { "User-Agent": "mycbbbigboard data job" } }); if (r.status === 404) return null;
      if (r.ok) { const d = await r.json(), gi = d.gameInfo || {}, tov = {};
        for (const p of d.plays || []) { const t = (p.type || {}).text || "", c = p.coordinate; if (/Turnover/i.test(t) && c && c.x > -100 && c.y > -100 && !(c.x === 25 && c.y === 0)) tov[p.id] = [c.x, c.y] }
        return { off: (gi.officials || []).map(o => o.displayName || o.fullName).filter(Boolean), att: gi.attendance || null, tov } } } catch { }
    await new Promise(r => setTimeout(r, 1500 * (k + 1)));
  }
  return null;
}
