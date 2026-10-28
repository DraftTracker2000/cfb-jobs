/* Read-only measure (Oct 28 — Sam's item 23, "show what it adds"): the awards job (job/cbbawards.mjs) skips a whole award page when the
   page cites Sports Reference anywhere. A per-line check would drop only a winner whose own table row cites it. For every page the job
   reads, this counts the winners (2008–09 on, men's Division I tables) each way. Nothing is written. */
import { AWARDS, noRefs, cellText, tables } from "./cbbawards.mjs";

const SR = /sports-reference|basketball-reference/i;
const UA = { headers: { "User-Agent": "mycbbbigboard.com data job (awards source check, read only)" } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wiki(title) { for (let a = 0; a < 5; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title), UA); const x = await r.text();
  if (x[0] === "{") { const j = JSON.parse(x); return j.parse ? j.parse.wikitext : null } } catch { } await sleep(6000 * (a + 1)) } return null }
const seasonOf = t => { const m = String(t).match(/(\d{4})\s*[–-]\s*(\d{2,4})/); if (m) return +m[1] + 1; const y = String(t).match(/^\s*(\d{4})\b/); return y ? +y[1] : null };

/* winners on one award page: [{y, nm, sr (this row cites Sports Reference)}] — the same table and column rules as the job */
function awardRows(w0, Y1) { const out = [];
  for (const T of tables(w0)) { let H = T.heads.map(h => cellText(noRefs(h)).toLowerCase()); const cap = cellText(noRefs(T.heading + " " + T.caption));
    if (/women|division (ii|iii|2|3)\b|naia|junior|njcaa|two-year|small college|high school|coach|key/i.test(cap)) continue;
    if (!H.length) { if (!T.rows.some(r => seasonOf(cellText(noRefs(r[0] || ""))))) continue; H = ["season", "player", "school"] }
    const iS = H.findIndex(h => /season|year/.test(h)), iP = H.findIndex(h => /player|winner|recipient|name/.test(h)); if (iS < 0 || iP < 0) continue;
    for (const r of T.rows) { const y = seasonOf(cellText(noRefs(r[iS] || ""))); if (!y || y < 2009 || y > Y1 + 1) continue; const nm = cellText(noRefs(r[iP] || "")).replace(/\s*\(\d+\)$/, ""); if (!nm || /vacated|not awarded/i.test(nm)) continue;
      out.push({ y, nm, sr: SR.test(r.join(" ")) }) } }
  return out }
function aaRows(w0) { const out = [];
  for (const T of tables(w0)) { const cap = cellText(noRefs(T.caption)); if (!/consensus (first|second) team/i.test(cap)) continue; const H = T.heads.map(h => cellText(noRefs(h)).toLowerCase()), iP = Math.max(0, H.findIndex(h => /player/.test(h)));
    for (const r of T.rows) { const nm = cellText(noRefs(r[iP] || "")); if (nm) out.push({ nm, sr: SR.test(r.join(" ")) }) } }
  return out }

export async function awLine({ log = console.log, nowY } = {}) { const Y1 = nowY || new Date().getUTCFullYear(), res = [];
  for (const [key, title] of AWARDS) { const w0 = await wiki(title); await sleep(2500); if (!w0) { res.push([title, "not read"]); continue }
    const R = awardRows(w0, Y1), cites = SR.test(w0), n = R.length, drop = R.filter(x => x.sr).length;
    res.push([title, cites ? `skipped today · per line: ${n - drop} winners kept, ${drop} dropped${drop ? " (" + R.filter(x => x.sr).map(x => x.y + " " + x.nm).slice(0, 4).join("; ") + ")" : ""}` : `kept today: ${n} winners (no Sports Reference on the page)`]) }
  let aaSkip = 0, aaAdd = 0, aaDrop = 0;
  for (let y = 2009; y <= Y1; y++) { const t = `${y} NCAA Men's Basketball All-Americans`, w0 = await wiki(t); await sleep(2500); if (!w0 || !SR.test(w0)) continue; aaSkip++; const R = aaRows(w0); aaAdd += R.filter(x => !x.sr).length; aaDrop += R.filter(x => x.sr).length }
  res.push(["Consensus All-Americans", `${aaSkip} season pages skipped today · per line: ${aaAdd} players kept, ${aaDrop} dropped`]);
  for (const r of res) log("awline " + r.join(" — ")); return res }
