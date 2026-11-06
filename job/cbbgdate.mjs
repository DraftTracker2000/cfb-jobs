/* Game dates in Eastern time for the basketball referee files (Nov 6 — the owner, 10:46 am: "might as well just run it now").
   The referee files (p<Y>_cbb-refraw-<c|n>) keep ESPN's game date in UTC, so a 9 pm Eastern game is filed under the next day. Writes,
   beside each season's referee file, p<Y>_cbb-gdate-<c|n> { v: 2, g: { espnGameId: "YYYY-MM-DD" (Eastern) } } — a new file; nothing
   existing is changed. MODE=gdate (job/cbb.mjs, Basketball job). (The first version read ESPN's scoreboards — about 3,300 reads before
   the owner stopped it; this one reads none.) */
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDate = iso => { const t = Date.parse(iso); return isFinite(t) ? ET.format(new Date(t)) : null };
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch (e) { } await sleep(1500 * (k + 1)) } return null }
/* Nov 6, 11:30 am (the owner: "do we not have an api to do this?? that's thousands of reads you're doing at espn"): yes — the open
   sportsdataverse schedule files (the same release files the NBA job already reads) carry every game's ESPN id and start time. One
   GitHub download per season and league; no ESPN reads. */
const SCHED = (lg, y) => lg === "n" ? `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_schedules/nba_schedule_${y}.csv`
  : `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_schedules/mbb_schedule_${y}.csv`;
function rows(text) { const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); out.push(row); row = []; f = "" } else if (c !== "\r") f += c }
  if (f || row.length) { row.push(f); out.push(row) } return out }
export async function gdate({ getPack, putPack, log, curNba }) {
  let files = 0, games = 0; const out = [];
  for (const lg of ["n", "c"]) for (let y = curNba; y >= 2003; y--) {
    const raw = await getPack(`p${y}_cbb-refraw-${lg}`).catch(() => null); if (!raw || !raw.g) continue;
    const r = await fetch(SCHED(lg, y), { redirect: "follow" }).catch(() => null); files++;
    if (!r || !r.ok) { out.push(`${lg}${y}: no schedule file (${r ? r.status : "error"})`); continue }
    const R = rows(await r.text()), H = R[0], iId = H.indexOf("id"), iD = H.indexOf("date"); if (iId < 0 || iD < 0) { out.push(`${lg}${y}: columns changed`); continue }
    const P = { v: 2, src: "sportsdataverse schedules", g: {} };
    for (const x of R.slice(1)) { const id = x[iId]; if (!id || !raw.g[id]) continue; const d = etDate(x[iD]); if (d) P.g[id] = d }
    const C = raw.cols ? raw.cols.indexOf("date") : 0; let mv = 0; for (const id in P.g) if (String(raw.g[id][C]).slice(0, 10) !== P.g[id]) mv++;
    P.at = Date.now(); await putPack(`p${y}_cbb-gdate-${lg}`, P); const n = Object.keys(P.g).length; games += n;
    out.push(`${lg}${y}: ${n} of ${Object.keys(raw.g).length} games dated, ${mv} a day off in the referee file`); log("gdate " + out[out.length - 1]) }
  return { msg: `Game dates (Eastern) from the sportsdataverse schedule files: ${files} downloads, 0 ESPN reads, ${games} games dated`, out };
}
