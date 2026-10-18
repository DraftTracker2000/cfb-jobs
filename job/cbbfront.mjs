/* The NBA front offices (Oct 17 — Phase 6, Sam: "push forward with the plan"; "im going to assume theres not contract data"). Weekly:
   - each team's general manager and the year he was hired, from Wikipedia's "List of NBA general managers" table (names only; Wikipedia's
     text is CC BY-SA). The admin can correct a row on the site; the same way the NFL GM list works.
   - every rostered player's contract this season from ESPN's public NBA API (sports.core.api.espn.com …/athletes/{id}/contracts/{season}):
     salary, years left after this one, option (0 none, 1 team, 2 player), Bird rights, and whether it's a minimum deal. ESPN lists the
     current and past seasons only, so future years aren't shown as dollars — only how many are left.
   Saved as p{S}_cbb-nbafront = { at, season, gms: { ab: [name, since] }, con: { espnId: [salary, yearsLeft, option, bird, min, teamAb] } }.
   Skipped when the pack is under six days old (Sam: never re-fetch what hasn't changed). */
const UA = { "User-Agent": "mycbbbigboard.com data job (NBA front offices)" };
export function parseNbaGMs(wt, nameToAb) {
  const out = {}; const rows = wt.split(/\n\|-\s*\n/);
  for (const r of rows) {
    const L = r.split("\n").map(x => x.trim()).filter(Boolean); if (L.length < 5) continue;
    const tm = (L[0].match(/\[\[([^\]|]+)/) || [])[1]; const ab = tm && nameToAb[tm.trim()]; if (!ab) continue;
    let g = L[1].replace(/^!\s*(scope="row"\s*\|)?/, "").replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").trim();
    const m = g.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/); g = (m ? (m[2] || m[1].replace(/\s*\([^)]*\)\s*$/, "")) : g).replace(/'''?/g, "").trim();
    const since = +(L.slice(2).map(x => (x.match(/^\|\s*(\d{4})\b/) || [])[1]).find(Boolean) || 0);
    if (g) out[ab] = [g, since || null];
  }
  return out;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } })); return out }
export async function buildNbaFront({ getPack, putPack, log, S, curNba }) {
  const old = await getPack(`p${S}_cbb-nbafront`).catch(() => null);
  if (old && old.at && Date.now() - old.at < 6 * 864e5 && old.season === curNba) { log("nba front offices: kept (under a week old)"); return old }
  const G = await getPack(`p${S}_cbb-nbagames`).catch(() => null); if (!G || !G.teams) { log("nba front offices: no team list yet"); return null }
  const nameToAb = {}; for (const [ab, t] of Object.entries(G.teams)) if (t.nm) nameToAb[t.nm] = ab; nameToAb["LA Clippers"] = nameToAb["LA Clippers"] || "LAC"; nameToAb["Los Angeles Clippers"] = "LAC";
  let gms = (old && old.gms) || {};
  try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&page=List_of_NBA_general_managers&prop=wikitext&format=json&formatversion=2&redirects=1", { headers: UA });
    const j = await r.json(); const got = parseNbaGMs(j.parse.wikitext, nameToAb); if (Object.keys(got).length >= 25) gms = got; log(`nba GMs: ${Object.keys(got).length} from Wikipedia`) } catch (e) { log("nba GMs: " + e.message) }
  const ids = Object.entries(G.allp || {}).filter(([, a]) => a.tm).map(([id, a]) => [id, a.tm]);
  const con = {}; let ok = 0;
  await pool(ids, 6, async ([id, tm]) => { const r = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}/contracts/${curNba}`); if (!r.ok) return;
    const c = await r.json(); if (!c || c.salary == null) return; con[id] = [c.salary, c.yearsRemaining ?? null, c.optionType ?? 0, c.birdStatus ?? null, c.minimumSalaryException ? 1 : 0, tm]; ok++ });
  log(`nba contracts: ${ok} of ${ids.length} players (ESPN, ${curNba - 1}–${String(curNba).slice(2)})`);
  const out = { at: Date.now(), season: curNba, gms, con: ok >= 200 ? con : (old && old.con) || con };
  await putPack(`p${S}_cbb-nbafront`, out); return out;
}
