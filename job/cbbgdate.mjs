/* Game dates in Eastern time for the basketball referee files (Nov 6 — Sam, 10:46 am: "might as well just run it now").
   The referee files (p<Y>_cbb-refraw-<c|n>) keep ESPN's game date in UTC, so a 9 pm Eastern game is filed under the next day. This reads
   ESPN's scoreboard once per day of each season (one read a day, not one a game) and writes, beside each season's referee file,
   p<Y>_cbb-gdate-<c|n> { v, g: { espnGameId: "YYYY-MM-DD" (Eastern) }, days: { yyyymmdd: 1 }, done } — a new file; nothing existing is
   changed. MODE=gdate (job/cbb.mjs, Basketball job). Resumes where it stopped. */
const UA = { "User-Agent": "mycbbbigboard.com data job" };
const LGP = { c: "mens-college-basketball", n: "nba" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDate = iso => { const t = Date.parse(iso); return isFinite(t) ? ET.format(new Date(t)) : null };
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch (e) { } await sleep(1500 * (k + 1)) } return null }
function span(lg, y) { if (lg === "c") return [new Date(Date.UTC(y - 1, 10, 1)), new Date(Date.UTC(y, 3, 12))];
  return [new Date(Date.UTC(y - 1, 9, 1)), new Date(Date.UTC(y, y === 2020 ? 9 : y === 2021 ? 6 : 5, y === 2020 ? 15 : 28))] }

export async function gdate({ getPack, putPack, log, curNba, deadlineMin = 105 }) {
  const deadline = Date.now() + deadlineMin * 6e4; let reads = 0, games = 0, moved = 0; const out = [];
  for (const lg of ["n", "c"]) for (let y = curNba; y >= 2003; y--) {
    if (Date.now() > deadline) break;
    const name = `p${y}_cbb-gdate-${lg}`; let P = await getPack(name).catch(() => null);
    if (!P || P.v !== 1) P = { v: 1, g: {}, days: {}, done: 0 };
    if (P.done && y < curNba) continue;
    const raw = await getPack(`p${y}_cbb-refraw-${lg}`).catch(() => null); if (!raw || !raw.g) continue;
    const want = new Set(Object.keys(raw.g)), [a, b] = span(lg, y), days = [];
    for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) { const k = ymd(d); if (!P.days[k] || (y === curNba && Date.now() - d.getTime() < 3 * 864e5)) days.push(k) }
    let i = 0, n0 = Object.keys(P.g).length;
    await Promise.all([0, 1, 2].map(async () => { while (i < days.length && Date.now() < deadline) { const k = days[i++];
      const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LGP[lg]}/scoreboard?dates=${k}${lg === "c" ? "&groups=50&limit=500" : ""}`); reads++; await sleep(150);
      if (!sb) continue; for (const e of sb.events || []) { if (!want.has(String(e.id))) continue; const d = etDate(e.date); if (d) P.g[e.id] = d } P.days[k] = 1 } }));
    const C = raw.cols ? raw.cols.indexOf("date") : 0; let mv = 0; for (const id in P.g) { const r = raw.g[id]; if (r && String(r[C]).slice(0, 10) !== P.g[id]) mv++ }
    const all = days.every(k => P.days[k]); if (all && y < curNba) P.done = 1; P.at = Date.now(); await putPack(name, P);
    const n = Object.keys(P.g).length; games += n - n0; moved += mv;
    out.push(`${lg}${y}: ${n} of ${want.size} games dated, ${mv} on a different day than the UTC date${all ? "" : " (partial)"}`); log("gdate " + out[out.length - 1]) }
  return { msg: `Game dates (Eastern): ${reads} ESPN scoreboard reads · ${games} games dated this run · ${out.length} seasons touched`, out };
}
