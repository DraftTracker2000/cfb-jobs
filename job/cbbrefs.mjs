/* Basketball referees (Oct 21 — Sam: "yes do this for college basketball and nba"). ESPN's game summaries list each game's officials;
   for every finished college (Division I) and NBA game of last season and this one, the job keeps one line (src/bbref.js: score, both
   teams' fouls and free-throw attempts, the closing total and spread, the officials) in p2000_cbb-refs. A game is read once; at most
   CAP summaries a run, so the first runs fill last season over a few days and after that each run only reads the new finals.
   The basketball pages add the lines up by referee. */
import { bbRefRow, BB_REF_COLS } from "./lib/bbref.mjs";

const UA = { "User-Agent": "mycbbbigboard.com data job" };
const LG = { c: "mens-college-basketball", n: "nba" };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");
async function j(u) { for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 404) return null } catch (e) { } await new Promise(r => setTimeout(r, 1500 * (k + 1))) } return null }

/* season S runs Nov (S−1) to mid-April S (college), Oct (S−1) to June S (NBA) */
const span = (lg, S) => lg === "c" ? [new Date(Date.UTC(S - 1, 10, 1)), new Date(Date.UTC(S, 3, 10))] : [new Date(Date.UTC(S - 1, 9, 15)), new Date(Date.UTC(S, 5, 25))];

export async function buildBbRefs({ getPack, putPack, log = console.log, S, CAP = 2500 }) {
  let P = await getPack("p2000_cbb-refs").catch(() => null);
  if (!P || P.v !== 1) P = { v: 1, cols: BB_REF_COLS, g: { c: {}, n: {} }, days: { c: {}, n: {} }, none: { c: {}, n: {} } };
  const now = Date.now(); let read = 0, added = 0;
  for (const lg of ["c", "n"]) for (const y of [S - 1, S]) {
    const [a, b] = span(lg, y);
    for (let d = new Date(a); d <= b && d.getTime() < now - 864e5 * 0.5; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = ymd(d); if (P.days[lg][key]) continue;   /* a day whose games are all read */
      if (read >= CAP) break;
      const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LG[lg]}/scoreboard?dates=${key}${lg === "c" ? "&groups=50&limit=500" : ""}`); if (!sb) continue;
      const ev = (sb.events || []).filter(e => ((e.status || {}).type || {}).state === "post"); let all = true;
      for (const e of ev) { if (P.g[lg][e.id] || P.none[lg][e.id]) continue; if (read >= CAP) { all = false; break }
        read++; const s = await j(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LG[lg]}/summary?event=${e.id}`); if (!s) { all = false; continue }
        const row = bbRefRow(s); if (row) { P.g[lg][e.id] = [y, ...row]; added++ } else P.none[lg][e.id] = 1 }
      /* a past day is done once every final is read (today and yesterday stay open for late games) */
      if (all && d.getTime() < now - 2 * 864e5) P.days[lg][key] = 1;
    }
  }
  P.cols = ["season", ...BB_REF_COLS]; P.at = Date.now();
  if (added || read) await putPack("p2000_cbb-refs", P);
  log(`refs: read ${read} summaries, ${added} games added · college ${Object.keys(P.g.c).length} · NBA ${Object.keys(P.g.n).length}`);
  return P;
}
