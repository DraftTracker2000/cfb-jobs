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

/* the text of a PDF. Every table cell is its own text block (BT…ET) placed at an x,y; the header row ("Game Date … Player Name …
   Current Status … Reason") says where each column starts, so a block goes to the column whose header is just left of it. Rows are
   matched by height: a status or reason belongs to the player on the same line (a wrapped reason sits a few points above or below him),
   and a reason at the very top of a page with no player beside it is the end of the last one on the page before. Team and date cells
   span several rows (merged cells), so each player takes the nearest team and date at or above his line.
   2021–22's reports draw with a subset font (two bytes a letter, the code 29 below the letter); later ones use plain text. */
function pdfStr(raw) { let o = ""; for (let i = 0; i < raw.length; i++) { const c = raw[i]; if (c !== "\\") { o += c; continue } const n = raw[++i];
    if (/[0-7]/.test(n)) { let d = n; while (d.length < 3 && /[0-7]/.test(raw[i + 1])) d += raw[++i]; o += String.fromCharCode(parseInt(d, 8)) } else o += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[n] || n }
  if (o.length >= 2 && o.length % 2 === 0 && [...o].every((ch, j) => j % 2 || ch.charCodeAt(0) === 0)) { let t = ""; for (let j = 1; j < o.length; j += 2) t += String.fromCharCode(o.charCodeAt(j) + 29); return t }
  return o }
const HEAD = [[/^Game Date/, "date"], [/^Game Time/, "time"], [/^Matchup/, "match"], [/^Team$/, "team"], [/^Player( Name)?$/, "player"], [/^Current( Status)?$/, "status"], [/^Reason$/, "reason"]];
export function nbaInjRows(buf) {
  const s = buf.toString("latin1"), out = []; let i = 0; const pages = [];
  while ((i = s.indexOf("stream", i)) >= 0) { let a = i + 6; if (s[a] === "\r") a++; if (s[a] === "\n") a++; const b = s.indexOf("endstream", a); if (b < 0) break;
    try { const t = inflateSync(buf.subarray(a, b)).toString("latin1"); if (/T[jJ]/.test(t)) pages.push(t) } catch (e) {} i = b + 9 }
  let last = null, cols = null, lastTeam = "", lastDate = "";   /* a team or date cell doesn't repeat on the next page: carry it over */
  for (const t of pages) { const down = /1 0 0 -1 0 [\d.]+ cm/.test(t), B = [];
    for (const bt of t.matchAll(/BT([\s\S]*?)ET/g)) { const body = bt[1]; let x = null, y = null, words = [];
      if (/\/F0 -22 Tf/.test(body)) continue;
      for (const m of body.matchAll(/[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ (-?[\d.]+) (-?[\d.]+) Tm|(-?[\d.]+) (-?[\d.]+) Td|\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
        if (m[1] != null) { x = +m[1]; y = +m[2] } else if (m[3] != null) { if (x == null) { x = +m[3]; y = +m[4] } else if (!words.length) { x += +m[3]; y += +m[4] } }
        else if (m[5] != null) words.push(pdfStr(m[5])); else words.push([...m[6].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(q => pdfStr(q[1])).join("")) }
      if (x == null || !words.length) continue; let txt = words.join(" ").replace(/\s+/g, " ").replace(/(\w)- (?=\w)/g, "$1-").trim();
      if (!txt || /^Page \d+( of( \d+)?)?$/.test(txt) || /^Injury Report:/.test(txt)) continue; B.push({ x, y: down ? y : -y, txt }) }
    /* the header row sets the columns (it's on every page) */
    const H = HEAD.map(([h, k]) => { const z = B.find(q => h.test(q.txt)); return z ? [z.x, k] : null }).filter(Boolean);
    if (H.length >= 5) { cols = H.sort((p, q) => p[0] - q[0]); const hy = B.find(q => /^Player( Name)?$/.test(q.txt)).y; for (let j = B.length - 1; j >= 0; j--) if (Math.abs(B[j].y - hy) < 3) B.splice(j, 1) }
    if (!cols) continue;
    const colOf = x => { let k = cols[0][1]; for (const [cx, kk] of cols) if (x >= cx - 4) k = kk; return k };
    for (const q of B) q.c = colOf(q.x);
    const P = B.filter(q => q.c === "player" && !/NOT YET SUBMITTED/i.test(q.txt)).map(q => ({ ...q, status: "", reason: [] })), T = B.filter(q => q.c === "team"), D = B.filter(q => q.c === "date" && /^\d\d\/\d\d\/\d{4}$/.test(q.txt));
    const near = (q, L, lim) => { let best = null, bd = lim; for (const z of L) { const d = Math.abs(z.y - q.y); if (d < bd) { bd = d; best = z } } return best };
    const above = (q, L) => { let best = null; for (const z of L) if (z.y <= q.y + 6 && (!best || z.y > best.y)) best = z; return best };
    for (const q of B) { if (q.c !== "status" && q.c !== "reason") continue; if (/^NOT\b|^YET\b|^SUBMITTED\b/.test(q.txt)) continue;
      const pl = near(q, P, 16);
      if (pl) { if (q.c === "status") pl.status = q.txt; else pl.reason.push([q.y, q.txt]) }
      else if (q.c === "reason" && last && (!P.length || q.y < Math.min(...P.map(z => z.y)))) last.reason += " " + q.txt }
    P.sort((p, q) => p.y - q.y);
    /* merged cells (2021–22 centers the team in a cell several rows tall): the cell's rectangle says which rows it covers */
    const R = [...t.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re/g)].map(m => { const x = +m[1], y0 = +m[2], h = +m[4]; return down ? { x, a: y0, b: y0 + h } : { x, a: -(y0 + h), b: -y0 } });
    const cellOf = (lab, colx) => R.filter(r => r.x <= lab.x && r.x >= colx - 14 && lab.y >= r.a - 1 && lab.y <= r.b + 1 && r.b - r.a > 1).sort((p, q) => (q.b - q.a) - (p.b - p.a))[0];
    const tx = (cols.find(c => c[1] === "team") || [0])[0], dx = (cols.find(c => c[1] === "date") || [0])[0];
    const span = (L, colx) => L.map(l => ({ l, c: cellOf(l, colx) }));
    const TS = span(T, tx), DS = span(D, dx);
    const pick = (pl, S, L) => { const inCell = S.find(z => z.c && z.c.b - z.c.a > 30 && pl.y >= z.c.a - 1 && pl.y <= z.c.b + 1); return inCell ? inCell.l : above(pl, L) };
    for (const pl of P) { const tm = pick(pl, TS, T), dt = pick(pl, DS, D); if (tm) lastTeam = tm.txt; if (dt) lastDate = dt.txt;
      last = { date: lastDate, team: lastTeam, player: pl.txt, status: pl.status, reason: pl.reason.sort((p, q) => p[0] - q[0]).map(z => z[1]).join(" ") }; out.push(last) } }
  return out }

const name = s => { const m = String(s).match(/^(.+?),\s*(.+)$/); return (m ? `${m[2]} ${m[1]}` : String(s)).replace(/\s+/g, " ").trim() };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");

export async function buildNbaInj({ getPack, putPack, log = console.log, curNba, MAXD = 600 }) {
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

/* probe: one report of each style, grouped by team so a wrong team or date shows */
export async function run() { const out = [];
  for (const f of ["2022-01-15_05PM", "2024-03-15_05PM", "2026-03-10_05_00PM"]) { const r = await fetch(BASE + f + ".pdf", UA); const R = nbaInjRows(Buffer.from(await r.arrayBuffer())); const G = {};
    for (const x of R) (G[x.date + " " + x.team] = G[x.date + " " + x.team] || []).push(x.player.split(",")[0] + ":" + (ST[String(x.status).toLowerCase()] || x.status[0] || "?"));
    out.push({ f, n: R.length, g: Object.entries(G).slice(0, 14).map(([k, v]) => k.replace(/\/20\d\d/, "") + " = " + v.join(" ")) }) }
  return out }
