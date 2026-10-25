/* The NBA's official injury reports (Oct 25 — Sam: "yes" to reading them; "rest should for sure be tallied tho and in a panel at the
   top"). The league posts a PDF before every game day (since 2021–22) at ak-static.cms.nba.com/referee/injury/Injury-Report_<date>_<time>.pdf:
   one row per player listed — game date, time, matchup, team, player ("Last, First"), status (Out / Doubtful / Questionable / Probable /
   Available) and the reason ("Injury/Illness - Left Knee; Surgery", "Rest", "G League - Two-Way", "Personal Reasons", "Injury/Illness -
   Left Knee; Injury Management"). The file name changed in late 2025 from _05PM to _05_00PM.

   One report per game day — the late-afternoon one, after most teams have filed. Past days are read once and kept; each run reads at most
   MAXD new days, so the first runs fill the history over a few nights and after that it's one new report a day.

   Pack p2000_cbb-nbainj: { v, t, done: {yyyymmdd: 1|0}, T: [team names], R: [reasons], p: { "First Last": [[yyyymmdd, team#, status, reason#], …] } }
   status: O Out, D Doubtful, Q Questionable, P Probable. "Available" rows aren't kept (he played). */
import { inflateSync } from "node:zlib";

const UA = { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Referer: "https://official.nba.com/" } };
const BASE = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_";
const TIMES = ["05_00PM", "05_30PM", "04_30PM", "06_00PM", "05PM", "06PM", "04PM", "01PM"];
const ST = { out: "O", doubtful: "D", questionable: "Q", probable: "P" };
const COLX = [[115, "date"], [195, "time"], [260, "match"], [420, "team"], [581, "player"], [662, "status"], [9999, "reason"]];

/* the text of a PDF: each table cell is its own BT…ET block, drawn at an absolute x,y with the words after it offset from there */
export function nbaInjRows(buf) {
  const s = buf.toString("latin1"), out = []; let i = 0, cur = null, date = "", team = "";
  const pages = [];
  while ((i = s.indexOf("stream", i)) >= 0) { let a = i + 6; if (s[a] === "\r") a++; if (s[a] === "\n") a++; const b = s.indexOf("endstream", a); if (b < 0) break;
    try { const t = inflateSync(buf.subarray(a, b)).toString("latin1"); if (/\bTj\b/.test(t) && /Td/.test(t)) pages.push(t) } catch (e) {} i = b + 9 }
  for (const t of pages) {
    for (const bt of t.matchAll(/BT([\s\S]*?)ET/g)) { const body = bt[1]; let x = null, y = null, words = [], big = /\/F0 -22 Tf/.test(body);
      for (const m of body.matchAll(/(-?[\d.]+) (-?[\d.]+) Td|\(((?:\\.|[^\\)])*)\) Tj/g)) {
        if (m[1] != null) { if (x == null) { x = +m[1]; y = +m[2] } } else words.push(m[3].replace(/\\([()\\])/g, "$1")) }
      if (big || x == null || !words.length) continue; const txt = words.join(" ").replace(/\s+/g, " ").trim(); if (/^Page \d+ of \d+$/.test(txt)) continue;
      const col = COLX.find(([lim]) => x < lim)[1];
      if (col === "date") { if (/^\d\d\/\d\d\/\d{4}$/.test(txt)) date = txt; continue }
      if (col === "team") { team = txt; continue }
      if (col === "player") { if (/NOT YET SUBMITTED/i.test(txt)) { cur = null; continue } cur = { date, team, player: txt, status: "", reason: "" }; out.push(cur); continue }
      if (col === "status" && cur) { cur.status = txt; continue }
      if (col === "reason") { if (/NOT YET SUBMITTED/i.test(txt)) { cur = null; continue } if (cur) cur.reason = cur.reason ? cur.reason + " " + txt : txt }
    } }
  return out }

const name = s => { const m = String(s).match(/^(.+?),\s*(.+)$/); return (m ? `${m[2]} ${m[1]}` : String(s)).replace(/\s+/g, " ").trim() };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function buildNbaInj({ getPack, putPack, log = console.log, curNba, MAXD = 450 }) {
  const P = (await getPack("p2000_cbb-nbainj").catch(() => null)) || { v: 1, done: {}, T: [], R: [], p: {} };
  const Ti = Object.fromEntries(P.T.map((x, i) => [x, i])), Ri = Object.fromEntries(P.R.map((x, i) => [x, i]));
  const idx = (A, I, v) => I[v] != null ? I[v] : (I[v] = A.push(v) - 1);
  /* the days to read: Oct 15 – Jun 25 of each season from 2021–22, newest first so this season fills in on the first run; today is
     re-read every run until tomorrow (late filings), and a day that had no report is tried again for a week */
  const today = new Date(), days = [];
  for (let s = curNba; s >= 2022; s--) for (let d = new Date(Date.UTC(s, 5, 25)); d >= new Date(Date.UTC(s - 1, 9, 15)); d.setUTCDate(d.getUTCDate() - 1)) {
    if (d > today) continue; const k = ymd(d), age = (today - d) / 864e5; if (P.done[k] === 1 && age > 1.2) continue; if (P.done[k] === 0 && age > 7) continue; days.push(new Date(d)) }
  let read = 0, rows = 0, miss = 0; const todo = days.slice(0, MAXD);
  const one = async d => { const iso = d.toISOString().slice(0, 10), k = ymd(d), newStyle = k >= "20251201";
    for (const tm of newStyle ? TIMES : TIMES.filter(t => !t.includes("_")).concat(TIMES.filter(t => t.includes("_")))) {
      let r; try { r = await fetch(`${BASE}${iso}_${tm}.pdf`, UA) } catch (e) { continue } if (!r.ok) continue;
      const R = nbaInjRows(Buffer.from(await r.arrayBuffer())); read++;
      /* this report replaces what an earlier read of the same day said */
      for (const nm of Object.keys(P.p)) P.p[nm] = P.p[nm].filter(z => z[0] !== +k);
      for (const x of R) { const st = ST[String(x.status).toLowerCase()]; if (!st) continue; const dt = x.date ? +(x.date.slice(6) + x.date.slice(0, 2) + x.date.slice(3, 5)) : +k;
        (P.p[name(x.player)] = P.p[name(x.player)] || []).push([dt, idx(P.T, Ti, x.team), st, idx(P.R, Ri, x.reason || "")]); rows++ }
      P.done[k] = 1; return }
    P.done[k] = 0; miss++ };
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(one));
  for (const nm in P.p) P.p[nm].sort((a, b) => a[0] - b[0]);
  P.t = Date.now(); await putPack("p2000_cbb-nbainj", P);
  const left = days.length - todo.length; log(`nba injury reports: ${read} read, ${rows} rows, ${miss} days with none, ${Object.keys(P.p).length} players${left > 0 ? ` · ${left} days still to read` : ""}`);
  return { read, rows, miss, left } }

/* probe: one old-style and one new-style report, parsed */
export async function run() { const out = [];
  for (const f of ["2024-03-15_05PM", "2026-03-10_05_00PM", "2022-01-15_05PM"]) { const r = await fetch(BASE + f + ".pdf", UA); const R = nbaInjRows(Buffer.from(await r.arrayBuffer()));
    out.push({ f, n: R.length, teams: new Set(R.map(x => x.team)).size, st: R.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {}), sample: R.filter((x, i) => i % Math.ceil(R.length / 7) === 0 || /Finger|Rest|Management/i.test(x.reason)).slice(0, 12).map(x => [x.date, x.team, x.player, x.status, x.reason]) }) }
  return out }
