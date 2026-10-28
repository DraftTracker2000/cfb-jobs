/* The NBA front offices (Oct 17 — Phase 6, Sam: "push forward with the plan"; "im going to assume theres not contract data"). Weekly:
   - each team's general manager and the year he was hired, from Wikipedia's "List of NBA general managers" table (names only; Wikipedia's
     text is CC BY-SA). The admin can correct a row on the site; the same way the NFL GM list works.
   - every rostered player's contract this season from ESPN's public NBA API (sports.core.api.espn.com …/athletes/{id}/contracts/{season}):
     salary, years left after this one, option (0 none, 1 team, 2 player), Bird rights, and whether it's a minimum deal. ESPN lists the
     current and past seasons only, so future years aren't shown as dollars — only how many are left.
   Saved as p{S}_cbb-nbafront = { at, season, gms: { ab: [name, since] }, con: { espnId: [salary, yearsLeft, option, bird, min, teamAb] } }.
   Skipped when the pack is under six days old (Sam: never re-fetch what hasn't changed). */
import { noSR, srSkipped } from "./wikisr.mjs";
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
  /* contracts are checked daily (Oct 26 — Sam: rookies, two-ways and new deals were "unknown" for days); the GM list stays weekly */
  if (old && old.at && Date.now() - old.at < 20 * 36e5 && old.season === curNba && old.v === 3) { log("nba front offices: kept (checked today)"); return old }
  const G = await getPack(`p${S}_cbb-nbagames`).catch(() => null); if (!G || !G.teams) { log("nba front offices: no team list yet"); return null }
  const nameToAb = {}; for (const [ab, t] of Object.entries(G.teams)) if (t.nm) nameToAb[t.nm] = ab; nameToAb["LA Clippers"] = nameToAb["LA Clippers"] || "LAC"; nameToAb["Los Angeles Clippers"] = "LAC";
  let gms = (old && old.gms) || {}, gmsAt = (old && old.gmsAt) || 0;
  if (Object.keys(gms).length >= 25 && Date.now() - gmsAt < 6 * 864e5) log("nba GMs: kept (under a week old)"); else try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&page=List_of_NBA_general_managers&prop=wikitext&format=json&formatversion=2&redirects=1", { headers: UA });
    const j = noSR(await r.json()); const got = parseNbaGMs(j.parse.wikitext, nameToAb); if (Object.keys(got).length >= 25) { gms = got; gmsAt = Date.now() } log(`nba GMs: ${Object.keys(got).length} from Wikipedia`) } catch (e) { log("nba GMs: " + e.message) }
  /* the team is the one ESPN has the contract with this season (v2, Oct 17 — rosters can lag a trade) */
  const abOfId = {}; for (const [ab, t] of Object.entries(G.teams)) if (t.id != null) abOfId[String(t.id)] = ab;
  const ids = Object.entries(G.allp || {}).filter(([, a]) => a.tm).map(([id, a]) => [id, a.tm]);
  const con = {}; let ok = 0;
  /* Oct 26 (#47 — 301 rostered players had no contract): ESPN often has no record for this season yet but does for last season; a deal with
     years left then carries on (same salary, one year fewer; marked "py"). A deal that ended last season — re-signed or signed elsewhere —
     stays unknown. */
  let carried = 0;
  await pool(ids, 6, async ([id, tm]) => { let r = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}/contracts/${curNba}`), py = false;
    if (!r.ok) { r = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/${id}/contracts/${curNba - 1}`); py = true; if (!r.ok) return }
    const c = await r.json(); if (!c || c.salary == null) return; if (py && !(c.yearsRemaining >= 1)) return;
    const tid = ((c.team && c.team.$ref) || "").match(/teams\/(\d+)/); con[id] = [c.salary, py ? c.yearsRemaining - 1 : c.yearsRemaining ?? null, c.optionType ?? 0, c.birdStatus ?? null, c.minimumSalaryException ? 1 : 0, py ? tm : (tid && abOfId[tid[1]]) || tm, ...(py ? ["py"] : [])]; ok++; if (py) carried++ });
  log(`nba contracts: ${carried} carried over from last season's records`);
  log(`nba contracts: ${ok} of ${ids.length} players (ESPN, ${curNba - 1}–${String(curNba).slice(2)})`);
  const out = { v: 3, at: Date.now(), season: curNba, gms, gmsAt, con: ok >= 200 ? con : (old && old.con) || con };
  await putPack(`p${S}_cbb-nbafront`, out); return out;
}
