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
export async function run() { if (process.env.FINGERS) return fingers(); if (process.env.RAW) return raw(process.env.RAW, +(process.env.OFF || 0)); const R = [];
  for (const u of URLS) { try { const r = await fetch(u, H); const b = r.ok ? Buffer.from(await r.arrayBuffer()) : null; const T = b ? text(b) : [];
      R.push({ f: u.split("_").slice(1).join("_"), st: r.status, ct: r.headers.get("content-type"), kb: b ? Math.round(b.length / 1024) : 0, lines: T.length, sample: T.filter(x => /Injury|Ankle|Knee|Rest|Out|Questionable/i.test(x)).slice(0, 6) }) }
    catch (e) { R.push({ f: u, err: String(e.message).slice(0, 120) }) } }
  return R }

/* (Oct 25 — Sam: "do we have specific finger injuries for basketball?"): every hand / finger / thumb reason across a spread of report days */
async function fingers() { const days = []; for (const y of [2022, 2023, 2024, 2025]) for (const m of ["01", "02", "03"]) for (const d of ["05", "12", "19", "26"]) days.push(`${y}-${m}-${d}_05PM`);
  for (const d of ["2025-12-29_05_00PM", "2026-01-12_05_00PM", "2026-02-09_05_00PM", "2026-03-16_05_00PM", "2026-04-06_05_00PM"]) days.push(d);
  const seen = {}; let ok = 0;
  for (const s of days) { try { const r = await fetch(`https://ak-static.cms.nba.com/referee/injury/Injury-Report_${s}.pdf`, H); if (!r.ok) continue; ok++;
      const T = text(Buffer.from(await r.arrayBuffer())).join(" ").replace(/\s+/g, " ");
      for (const m of T.matchAll(/Injury\/Illness\s*-\s*([^;]{0,60}?(?:Finger|Thumb|Hand|Wrist|Pinky)[^;]{0,25});\s*([A-Za-z ]{0,30})/gi)) { const k = m[1].trim() + "; " + m[2].trim().split(" ").slice(0, 2).join(" "); seen[k] = (seen[k] || 0) + 1 } } catch (e) {} }
  return { reports: ok, kinds: Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 60) } }

/* the raw drawing commands of one report's first text stream, to see how rows and columns are laid out */
async function raw(name, off) { const r = await fetch(`https://ak-static.cms.nba.com/referee/injury/Injury-Report_${name}.pdf`, H); const buf = Buffer.from(await r.arrayBuffer()), s = buf.toString("latin1"); let i = 0, best = "";
  while ((i = s.indexOf("stream", i)) >= 0) { let a = i + 6; if (s[a] === "\r") a++; if (s[a] === "\n") a++; const b = s.indexOf("endstream", a); if (b < 0) break;
    try { const t = inflateSync(buf.subarray(a, b)).toString("latin1"); if (/Tj|TJ/.test(t) && t.length > best.length) best = t } catch (e) {} i = b + 9 }
  if (off < 0) off = Math.max(0, best.indexOf("BT")); return best.slice(off, off + 3300) }
