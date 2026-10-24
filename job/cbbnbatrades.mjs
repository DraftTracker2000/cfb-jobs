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
