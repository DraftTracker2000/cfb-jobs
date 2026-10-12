/* What the open sportsdataverse / hoopR release files hold (Oct 12 — Sam on NBA Stats data: "we have this?"). Probe only: lists the
   release tags of the repos the NBA job reads from, and the first few file names of any NBA Stats ones. Nothing is written. */
export async function run({ log = console.log }) {
  const out = {};
  for (const repo of ["sportsdataverse/sportsdataverse-data", "sportsdataverse/hoopR-nba-data", "sportsdataverse/hoopR-nba-raw"]) {
    const tags = []; for (let pg = 1; pg <= 4; pg++) { const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${pg}`, { headers: { "User-Agent": "cfb-board-probe" } }); if (!r.ok) { tags.push("HTTP " + r.status); break } const j = await r.json(); if (!j.length) break;
      for (const x of j) { const nba = /nba/i.test(x.tag_name); tags.push(nba ? `${x.tag_name} [${(x.assets || []).length}: ${(x.assets || []).slice(0, 4).map(a => a.name).join(", ")}]` : x.tag_name) } }
    out[repo] = tags.filter(t => /nba/i.test(t)).slice(0, 80); log(`${repo}: ${tags.length} tags`) }
  /* the files of a few NBA Stats releases for the last two seasons */
  const files = {};
  for (const tag of ["nba_stats_synergy", "nba_stats_hustle", "nba_stats_player_season_stats", "nba_stats_team_season_stats", "nba_stats_matchups", "nba_stats_shots"]) {
    const r = await fetch(`https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/${tag}`, { headers: { "User-Agent": "cfb-board-probe" } }); if (!r.ok) { files[tag] = "HTTP " + r.status; continue }
    const j = await r.json(); files[tag] = (j.assets || []).map(a => a.name + " " + Math.round(a.size / 1024) + "K").filter(n => /2026/.test(n) && !/playoff/i.test(n)).map(n => n.replace(/_2026\.(parquet|csv|rds)/, "").replace(/ \d+K$/, "")).filter((n, i, a) => a.indexOf(n) === i).slice(0, 40) }
  return { ok: true, files };
}
