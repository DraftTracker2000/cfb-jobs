/* NBA trades since 2015 (Oct 24 — Sam on Be the GM: who a team will move "should take history into account … team records when they
   made trades"). NBA.com's official player movement log (the same one nba.com/players/transactions shows), trades only: each row is one
   piece a team received — a player, a draft pick, cash or draft consideration — and who it came from. The site matches players to its
   own season lines by name and reads each team's record from the season's games.
   Pack p2000_cbb-nbatrades: { v: 1, t, r: [[date "YYYY-MM-DD", trade id, received-by team name, from team name, what, NBA.com player id (0 = not a player)]] } */
const URL = "https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json";
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com", "Accept": "application/json, text/plain, */*" };
export function parseTradeRow(x) {
  const m = String(x.TRANSACTION_DESCRIPTION || "").match(/^(.+?) received (.+?) from (.+?)\.?$/); if (!m) return null;
  const what = m[2].replace(/^(guard|forward|center|guard-forward|forward-guard|forward-center|center-forward)\s+/i, "").trim();
  return [String(x.TRANSACTION_DATE || "").slice(0, 10), String(x.GroupSort || "").replace(/^Trade\s*/, ""), m[1].trim(), m[3].trim(), what, +x.PLAYER_ID || 0];
}
export async function buildNbaTrades({ putPack, log = console.log }) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 60000);
  const r = await fetch(URL, { headers: H, signal: ac.signal }).finally(() => clearTimeout(to)); if (!r.ok) throw new Error("player movement " + r.status);
  const J = await r.json(), R = ((J && J.NBA_Player_Movement && J.NBA_Player_Movement.rows) || []).filter(x => x.Transaction_Type === "Trade").map(parseTradeRow).filter(Boolean);
  R.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  await putPack("p2000_cbb-nbatrades", { v: 1, t: Date.now(), r: R });
  log(`nba trades: ${R.length} pieces in ${new Set(R.map(x => x[1])).size} trades, ${R[0] && R[0][0]} to ${R.length && R[R.length - 1][0]}`); return R;
}
/* NBA playoff games since 2003 (Oct 24 — Sam picked "Name the champion" for the NBA side: a playoff run — the opponents and the series —
   name the team). ESPN's scoreboard for each spring's playoff window (one read a season). The site builds the series from the games.
   Pack p2000_cbb-nbapo: { v: 1, t, s: { season: [[date, home abbr, away abbr, home pts, away pts, home name, away name, note]] } }.
   Finished seasons are kept from the last run; the current one is re-read. */
export async function buildNbaPlayoffs({ getPack, putPack, log = console.log, upto }) {
  const prev = await getPack("p2000_cbb-nbapo").catch(() => null), S = (prev && prev.s) || {}; let reads = 0;
  const last = upto || new Date().getUTCFullYear();
  for (let y = 2003; y <= last; y++) { if (S[y] && S[y].length && y < last) continue;
    try { const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${y}0410-${y}0630&seasontype=3&limit=500`, { headers: { "User-Agent": "Mozilla/5.0 (mycbbbigboard.com data job)" } }); reads++;
      if (!r.ok) { log(`nba playoffs ${y}: ${r.status}`); continue } const J = await r.json(), out = [];
      for (const e of J.events || []) { const c = (e.competitions || [])[0]; if (!c || !(c.status && c.status.type && c.status.type.completed)) continue;
        const h = (c.competitors || []).find(x => x.homeAway === "home"), a = (c.competitors || []).find(x => x.homeAway === "away"); if (!h || !a) continue;
        out.push([String(e.date || "").slice(0, 10), h.team.abbreviation, a.team.abbreviation, +h.score, +a.score, h.team.displayName, a.team.displayName, ((c.notes || [])[0] || {}).headline || ""]) }
      out.sort((p, q) => p[0].localeCompare(q[0])); if (out.length) S[y] = out; await new Promise(z => setTimeout(z, 300)) } catch (e) { log(`nba playoffs ${y}: ${e.message}`) } }
  await putPack("p2000_cbb-nbapo", { v: 1, t: Date.now(), s: S }); log(`nba playoffs: ${Object.keys(S).length} seasons, ${Object.values(S).reduce((a, x) => a + x.length, 0)} games, ${reads} ESPN reads`); return S;
}
