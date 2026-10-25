/* probe (Oct 25): one player's box-score rows in a season file — date, season_type, minutes, did_not_play — to square games played with ESPN */
export async function run() {
  if (process.env.TEAMS) { const out = {}; for (const y of String(process.env.TEAMS).split(",")) { const r = await fetch(`https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`, { redirect: "follow" }); const t = await r.text(); const L = t.split("\n"), H = L[0].split(","), ix = n => H.indexOf(n), G = {}, D = {};
      for (const l of L.slice(1)) { const f = l.split(","); if (f[ix("season_type")] !== "2") continue; const tm = f[ix("team_abbreviation")]; (G[tm] = G[tm] || new Set()).add(f[ix("game_id")]); D[f[ix("game_id")]] = f[ix("game_date")] }
      const n = Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.size])); const odd = Object.entries(n).filter(([, c]) => c !== 82);
      out[y] = { odd, decDates: [...new Set(Object.entries(D).filter(([, d]) => /-12-1[3-9]/.test(d)).map(([, d]) => d))].sort() } } return { ok: true, out } }
  const y = +(process.env.Y || 2026), who = process.env.WHO || "Anthony Edwards";
  const r = await fetch(`https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`, { redirect: "follow" }); const t = await r.text();
  const L = t.split("\n"), H = L[0].split(","), ix = n => H.indexOf(n); const out = []; const types = {};
  for (const l of L.slice(1)) { if (!l.includes(who)) continue; const f = l.split(","); const ty = f[ix("season_type")]; types[ty] = (types[ty] || 0) + 1; out.push([f[ix("game_date")], ty, f[ix("minutes")], f[ix("did_not_play")], f[ix("game_id")]].join(" ")) }
  return { ok: true, n: out.length, types, cols: H.filter(h => /type|date|play|active|reason|minutes/.test(h)), rows: out.slice(0, 120) };
}
