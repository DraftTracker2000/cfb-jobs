/* probe (Oct 25 — Sam: "yes" to testing the NBA's official injury reports): can the job reach the league's injury-report PDFs, and is
   the text readable? Tries a few days from 2021–22 on, in both file-name styles, and inflates the PDF's text streams to look for lines. */
import { inflateSync } from "node:zlib";
const H = { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", Referer: "https://official.nba.com/" } };
const URLS = ["2022-01-15_05PM", "2023-02-10_01PM", "2024-03-15_05PM", "2025-04-10_05PM", "2025-11-20_05_00PM", "2025-12-22_01_30PM", "2026-03-10_05_00PM", "2026-10-24_05_00PM", "2026-10-24_05PM"]
  .map(s => `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${s}.pdf`);
function text(buf) { const s = buf.toString("latin1"), out = []; let i = 0;
  while ((i = s.indexOf("stream", i)) >= 0) { let a = i + 6; if (s[a] === "\r") a++; if (s[a] === "\n") a++; const b = s.indexOf("endstream", a); if (b < 0) break;
    try { const t = inflateSync(buf.subarray(a, b)).toString("latin1"); const m = [...t.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:[^\]])*)\]\s*TJ/g)].map(x => x[1] != null ? x[1] : [...x[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(y => y[1]).join("")); if (m.length) out.push(...m) } catch (e) {} i = b + 9 }
  return out }
export async function run() { const R = [];
  for (const u of URLS) { try { const r = await fetch(u, H); const b = r.ok ? Buffer.from(await r.arrayBuffer()) : null; const T = b ? text(b) : [];
      R.push({ f: u.split("_").slice(1).join("_"), st: r.status, ct: r.headers.get("content-type"), kb: b ? Math.round(b.length / 1024) : 0, lines: T.length, sample: T.filter(x => /Injury|Ankle|Knee|Rest|Out|Questionable/i.test(x)).slice(0, 6) }) }
    catch (e) { R.push({ f: u, err: String(e.message).slice(0, 120) }) } }
  return R }
