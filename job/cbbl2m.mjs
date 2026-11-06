/* NBA Last Two Minute reports by official (Nov 6 — ideas doc #14, the owner: "yes that would be good for the refs pages and info. how well
   they do in the last two minutes or a last two minutes accuracy column"; the source OK'd Oct 28: "3 NBA Last Two Minute reports: YES").
   MODE=l2m (job/cbb.mjs, Basketball job workflow).
   1. The league's reports, compiled (atlhawksfanatic/L2M on GitHub, MIT): every reviewed play March 2015 – Nov 2023 with the league's
      ruling — CC correct call, CNC correct non-call, IC incorrect call, INC incorrect non-call. Only the play columns are read: that file's
      referee names come from Basketball Reference (a banned source), so they are never used.
   2. Newer reports, from the league itself (official.nba.com/l2m/json/<game id>.json), when the job can reach it.
   3. The officials of each game from our own referee files (p<Y>_cbb-refraw-n, ESPN's game pages), matched by date and teams.
   Writes p2000_cbb-l2m { v, at, cols, lg: {season: row}, r: {official: {all: row, s: {season: row}}}, games, matched, src }
   row = [games, plays reviewed, CC, CNC, IC, INC]. */
const UA = { "User-Agent": "mycbbbigboard.com data job" };
const CSV = "https://raw.githubusercontent.com/atlhawksfanatic/L2M/master/1-tidy/L2M/L2M.csv";
/* the compilation's team codes → ESPN's */
const AB = { GSW: "GS", NYK: "NY", SAS: "SA", NOP: "NO", UTA: "UTAH", WAS: "WSH" };
const ab = t => AB[t] || t;
const KIND = { CC: 2, CNC: 3, IC: 4, INC: 5 };

function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = "" } else if (c !== "\r") f += c }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows;
}
/* NBA season for a date: October–June → the year it ends */
const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 8 ? y + 1 : y };

export async function l2m({ getPack, putPack, log }) {
  const games = {};   /* "date|home|away" → { d, h, a, k: [CC, CNC, IC, INC] } */
  const addPlay = (d, h, a, dec) => { const k = KIND[dec]; if (!k || !d || !h || !a) return; const id = `${d}|${ab(h)}|${ab(a)}`, g = games[id] = games[id] || { d, h: ab(h), a: ab(a), k: [0, 0, 0, 0] }; g.k[k - 2]++ };
  const src = { csv: 0, official: 0, officialTried: 0, officialErr: null };
  /* 1. the compilation */
  const r = await fetch(CSV, { headers: UA }); if (!r.ok) throw new Error("L2M compilation " + r.status);
  const R = parseCsv(await r.text()), H = R[0], ix = n => H.indexOf(n);
  const iD = ix("date"), iH = ix("home"), iA = ix("away"), iX = ix("decision");
  if ([iD, iH, iA, iX].some(i => i < 0)) throw new Error("L2M compilation: columns changed " + H.join(","));
  let last = "";
  for (const x of R.slice(1)) { if (x.length < H.length - 2) continue; const d = x[iD]; if (!/^\d{4}-\d\d-\d\d$/.test(d)) continue; addPlay(d, x[iH], x[iA], x[iX]); src.csv++; if (d > last) last = d }
  log(`l2m: compilation ${src.csv} plays, ${Object.keys(games).length} games, through ${last}`);
  /* 2. the league's own reports after the compilation ends (regular season game ids 002YY00001…01230) — skipped when unreachable */
  const prev = await getPack("p2000_cbb-l2m").catch(() => null), tried = (prev && prev.tried) || {}, offG = (prev && prev.off) || {};
  try {
    const now = new Date(), endY = now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    for (let s = Math.max(2024, seasonOf(last || "2023-11-01")); s <= endY; s++) {
      const yy = String(s - 1).slice(2); let miss = 0;
      for (let n = 1; n <= 1230 && miss < 60; n++) {
        const id = `002${yy}0${String(n).padStart(4, "0")}`; if (tried[id] === 1 || offG[id]) continue;
        const res = await fetch(`https://official.nba.com/l2m/json/${id}.json`, { headers: { ...UA, Referer: "https://official.nba.com/" } }); src.officialTried++;
        if (res.status === 404 || res.status === 403) { if (s < endY) tried[id] = 1; miss = res.status === 403 ? miss + 1 : miss; continue }
        if (!res.ok) { src.officialErr = "status " + res.status; break }
        const j = await res.json().catch(() => null), G = j && (j.game && j.game[0] || j.Game || {}), L = (j && (j.l2m || j.L2M)) || [];
        if (!G || !L.length) { if (s < endY) tried[id] = 1; continue }
        const d = String(G.GameDate || G.gameDate || "").slice(0, 10), h = G.HomeTeamAbbreviation || G.Home_team_abbr || G.HomeTeam || "", a = G.AwayTeamAbbreviation || G.Away_team_abbr || G.AwayTeam || "";
        offG[id] = { d, h: ab(h), a: ab(a), k: [0, 0, 0, 0] };
        for (const p of L) { const k = KIND[p.CallRatingName || p.decision]; if (k) offG[id].k[k - 2]++ }
        src.official++; await new Promise(z => setTimeout(z, 250)) }
    }
  } catch (e) { src.officialErr = String(e.message || e).slice(0, 200) }
  for (const id in offG) { const g = offG[id]; if (!g.d) continue; const key = `${g.d}|${g.h}|${g.a}`; if (!games[key]) games[key] = { d: g.d, h: g.h, a: g.a, k: g.k.slice() } }
  log(`l2m: league reports read ${src.official} (${src.officialTried} tried${src.officialErr ? ", stopped: " + src.officialErr : ""})`);
  /* 3. officials from our referee files */
  const refBy = {}, seasons = [...new Set(Object.values(games).map(g => seasonOf(g.d)))].sort();
  for (const s of seasons) { const P = await getPack(`p${s}_cbb-refraw-n`).catch(() => null); if (!P || !P.cols) continue; const C = Object.fromEntries(P.cols.map((c, i) => [c, i]));
    for (const row of Object.values(P.g || {})) { const d = String(row[C.date] || "").slice(0, 10), refs = row[C.refs]; if (!d || !refs || !refs.length) continue;
      refBy[`${d}|${row[C.home]}|${row[C.away]}`] = refs } }
  const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const lg = {}, out = {}; let matched = 0;
  const bump = (A, g) => { A[0]++; for (let i = 0; i < 4; i++) A[i + 2] += g.k[i]; A[1] += g.k.reduce((a, b) => a + b, 0) };
  for (const g of Object.values(games)) { const s = seasonOf(g.d); bump(lg[s] = lg[s] || [0, 0, 0, 0, 0, 0], g);
    const refs = refBy[`${g.d}|${g.h}|${g.a}`] || refBy[`${shift(g.d, -1)}|${g.h}|${g.a}`] || refBy[`${shift(g.d, 1)}|${g.h}|${g.a}`]; if (!refs) continue; matched++;
    for (const nm of refs) { const o = out[nm] = out[nm] || { all: [0, 0, 0, 0, 0, 0], s: {} }; bump(o.all, g); bump(o.s[s] = o.s[s] || [0, 0, 0, 0, 0, 0], g) } }
  const P = { v: 1, at: Date.now(), cols: ["games", "plays", "CC", "CNC", "IC", "INC"], lg, r: out, games: Object.keys(games).length, matched, src, tried, off: offG };
  await putPack("p2000_cbb-l2m", P);
  const tot = Object.values(lg).reduce((a, x) => a.map((v, i) => v + x[i]), [0, 0, 0, 0, 0, 0]);
  const msg = `L2M: ${P.games} games (${matched} matched to our officials), ${tot[1]} plays reviewed, ${tot[4]} incorrect calls + ${tot[5]} incorrect non-calls, ${Object.keys(out).length} officials`;
  log(msg); return { msg };
}
