/* Games CBBD still lists as unplayed after their day has passed (Nov 16 — the owner, 5:36 pm: "fix the college basketball").
   CBBD can keep a game on its old date after the schools move it or call it off. On Nov 16 two such games sat at "scheduled" for
   Nov 15: Washington at Utah (ESPN: moved to Dec 5) and a Maryland Eastern Shore home game ESPN no longer lists at all. For each game
   still "scheduled" 6 hours after its start, one read of ESPN's game summary (a handful a day, usually none):
     ESPN has a different start time      → the game takes ESPN's date (it shows on the right day, and on the team's schedule again)
     ESPN says postponed or canceled      → that status
     ESPN no longer has the game (404)    → "canceled"
   Finals are left to CBBD. Nothing is dropped: the game stays in the list with the new date or status. */
const URL = id => `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${id}`;
export async function espnHeader(id, f = fetch) {
  for (let k = 0; k < 3; k++) {
    try { const r = await f(URL(id), { headers: { "User-Agent": "mycbbbigboard data job" } }); if (r.status === 404) return { gone: true };
      if (r.ok) { const d = await r.json(), c = ((d.header || {}).competitions || [])[0]; if (!c) return { gone: true };
        return { date: c.date || null, st: ((c.status || {}).type || {}).name || "" } } } catch { }
    await new Promise(r => setTimeout(r, 1500 * (k + 1)));
  }
  return null;   /* couldn't read it: leave the game as CBBD has it */
}
const OPEN = new Set(["scheduled", "in_progress", "", undefined, null]);
export async function fixStale(G, { log = () => { }, now = Date.now(), get = espnHeader, max = 40 } = {}) {
  const stale = G.filter(g => OPEN.has(g.status) && g.sourceId && Date.parse(g.startDate) < now - 6 * 36e5).slice(0, max), out = [];
  for (const g of stale) {
    const e = await get(String(g.sourceId)); if (!e) continue;
    const was = g.startDate.slice(0, 16);
    if (e.gone) { g.status = "canceled"; out.push(`${g.id} ${was}: ESPN no longer lists it → canceled`); continue }
    if (/POSTPONED/.test(e.st)) { g.status = "postponed"; out.push(`${g.id} ${was}: postponed`); continue }
    if (/CANCEL/.test(e.st)) { g.status = "canceled"; out.push(`${g.id} ${was}: canceled`); continue }
    const t = Date.parse(e.date);
    if (isFinite(t) && Math.abs(t - Date.parse(g.startDate)) > 3 * 36e5) { g.startDate = new Date(t).toISOString(); out.push(`${g.id} ${was} → ${g.startDate.slice(0, 16)} (ESPN's date)`) }
  }
  log(`stale games: ${stale.length} checked${out.length ? " · " + out.join(" · ") : ""}`);
  return { checked: stale.length, changed: out };
}
