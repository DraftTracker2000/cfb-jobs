/* College basketball national awards and consensus All-America teams (Oct 26 — Sam: "yes" to "I can add All-American teams and the
   national awards"). Read from each award's Wikipedia page and each season's "NCAA Men's Basketball All-Americans" page — but only a page
   whose text never cites Sports Reference (Sam's rule); a page that does is skipped and logged, and that award waits for another source.
   Seasons from 2008–09 on (where our college data starts). Read once a week.

   Pack p2000_cbb-awards { v, t, src: { key: page title }, skipped: [title], rows: [[season, key, name, school]] } — season is the year the
   season ends (2019 = 2018–19). */

const WUA = { headers: { "User-Agent": "mycbbbigboard.com data job (college basketball stats site; contact via the site)" } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const AWARDS = [["wooden", "John R. Wooden Award"], ["naismith", "Naismith College Player of the Year"], ["appoy", "Associated Press College Basketball Player of the Year"],
  ["oscar", "Oscar Robertson Trophy"], ["nabcpoy", "NABC Player of the Year"], ["nabcdpoy", "NABC Defensive Player of the Year"], ["naisdpoy", "Naismith Defensive Player of the Year"],
  ["frosh", "USBWA National Freshman of the Year"], ["cousy", "Bob Cousy Award"], ["west", "Jerry West Award"], ["erving", "Julius Erving Award"], ["malone", "Karl Malone Award"], ["kareem", "Kareem Abdul-Jabbar Award"]];

async function wiki(title) { for (let a = 0; a < 5; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=" + encodeURIComponent(title), WUA); const x = await r.text();
      if (x[0] === "{") { const j = JSON.parse(x); return j.parse ? j.parse.wikitext : null } } catch { } await sleep(6000 * (a + 1)) } return null }

/* the text with every <ref …>…</ref> and <ref … /> taken out */
export function noRefs(s) { let o = "", k = 0; for (;;) { const a = s.indexOf("<ref", k); if (a < 0) { o += s.slice(k); break } o += s.slice(k, a);
    const c = s.indexOf("/>", a), e = s.indexOf("</ref>", a), self = c >= 0 && (e < 0 || c < e) && s.slice(a, c).indexOf(">") < 0; k = self ? c + 2 : e >= 0 ? e + 6 : s.length } return o }

/* one table cell → its plain text: attributes dropped, {{sortname|A|B}} → "A B", [[x|y]] → y, [[x]] → x */
export function cellText(c) { let s = String(c);
  { let d = 0, cut = -1; for (let i = 0; i < s.length; i++) { const t = s.slice(i, i + 2); if (t === "[[" || t === "{{") { d++; i++ } else if (t === "]]" || t === "}}") { d--; i++ } else if (s[i] === "|" && d === 0) cut = i } if (cut >= 0 && /=/.test(s.slice(0, cut))) s = s.slice(cut + 1) }
  s = s.replace(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(\|[^}]*)?\}\}/gi, "$1 $2").replace(/\{\{\s*(?:sort|sortname)\s*\|[^|}]*\|([^}]*)\}\}/gi, "$1")
    .replace(/\{\{\s*(?:center|nowrap|small|nobold|ubl)\s*\|([^}]*)\}\}/gi, "$1").replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, (m, x) => x.replace(/\s*\((?:basketball|basketball player)[^)]*\)/i, ""))
    .replace(/'''?|<br\s*\/?>|<[^>]+>/g, " ").replace(/[*†‡§#^]+/g, "").replace(/\s+/g, " ").trim();
  return s }
/* a cell's link target, for telling a school (…basketball…) from a person */
const linkOf = c => (String(c).match(/\[\[([^\]|]*)/) || [])[1] || "";

/* every table on the page: { caption, heads: [..], rows: [[cell, …], …] } (rowspan'd cells carried down) */
export function tables(w) { const out = []; let i = 0;
  while ((i = w.indexOf("{|", i)) >= 0) { const e = w.indexOf("\n|}", i); if (e < 0) break; const body = w.slice(i, e); i = e + 3;
    const cap = cellText((body.match(/\n\|\+([^\n]*)/) || [])[1] || ""); const parts = body.split(/\n\|-[^\n]*/); const heads = []; const rows = []; let carry = [];
    for (const p of parts) { const lines = p.split("\n").filter(l => /^[|!]/.test(l) && !/^\{\||^\|\+|^\|\}/.test(l)); if (!lines.length) continue;
      const cells = []; for (const l of lines) { const isH = l[0] === "!"; for (const c of l.slice(1).split(isH ? /!!|\|\|/ : /\|\|/)) cells.push({ h: isH, raw: c, span: +((c.match(/rowspan\s*=\s*"?(\d+)/) || [])[1] || 1) }) }
      if (cells.every(c => c.h)) { if (!heads.length) heads.push(...cells.map(c => cellText(c.raw).toLowerCase())); continue }
      /* rowspan: cells still spanning from rows above go in front */
      const row = []; const live = carry.filter(c => c.left > 0); let k = 0; const total = heads.length || cells.length;
      for (let col = 0; col < Math.max(total, cells.length + live.length); col++) { const sp = live.find(c => c.col === col); if (sp) { row.push(sp.raw); sp.left--; continue } const c = cells[k++]; if (!c) break; row.push(c.raw); if (c.span > 1) carry.push({ col, raw: c.raw, left: c.span - 1 }) }
      carry = carry.filter(c => c.left > 0); rows.push(row) }
    const hs = w.slice(0, i - body.length).match(/^==+[^=\n]+==+/gm) || []; out.push({ caption: cap, heads, rows, heading: cellText((hs[hs.length - 1] || "").replace(/=/g, "")) }) }
  return out }

const seasonOf = t => { const m = String(t).match(/(\d{4})\s*[–-]\s*(\d{2,4})/); if (m) return +m[1] + 1; const y = String(t).match(/^\s*(\d{4})\b/); return y ? +y[1] : null };

export async function buildAwards({ getPack, putPack, log = console.log, force = false, nowY }) {
  const old = await getPack("p2000_cbb-awards").catch(() => null);
  if (!force && old && old.v === 1 && Date.now() - (old.t || 0) < 7 * 864e5) return old;
  const rows = [], src = {}, skipped = []; const Y1 = nowY || new Date().getUTCFullYear();
  for (const [key, title] of AWARDS) { const w0 = await wiki(title); await sleep(2500); if (!w0) { skipped.push(title + " (not read)"); continue }
    if (/sports-reference|basketball-reference/i.test(w0)) { skipped.push(title + " (cites Sports Reference)"); continue }
    src[key] = title; const w = noRefs(w0); let n = 0;
    /* the men's Division I table only — these pages also list women's winners and other divisions */
    for (const T of tables(w)) { let H = T.heads; if (/women|division (ii|iii|2|3)\b|naia|junior|njcaa|two-year|small college|high school|coach|key/i.test(T.heading + " " + T.caption)) continue;
      /* a table whose header row didn't parse (a caption on the same line): season, player, school, in that order, when the first cell is a season */
      if (!H.length) { if (!T.rows.length || !seasonOf(cellText(T.rows[0][0] || ""))) continue; H = ["season", "player", "school"] } const iS = H.findIndex(h => /season|year/.test(h)), iP = H.findIndex(h => /player|winner|recipient|name/.test(h)), iT = H.findIndex(h => /^(school|team|college)/.test(h)); if (iS < 0 || iP < 0) continue;
      for (const r of T.rows) { const y = seasonOf(cellText(r[iS] || "")); if (!y || y < 2009 || y > Y1 + 1) continue; const nm = cellText(r[iP] || "").replace(/\s*\(\d+\)$/, ""); if (!nm || /vacated|not awarded/i.test(nm)) continue;
        const sc = iT >= 0 ? cellText(r[iT] || "") : ""; rows.push([y, key, nm, sc]); n++ } }
    log(`awards: ${title} — ${n} winners since 2008–09`) }
  /* consensus All-America teams, one page a season */
  for (let y = 2009; y <= Y1; y++) { const title = `${y} NCAA Men's Basketball All-Americans`; const w0 = await wiki(title); await sleep(2500); if (!w0) continue;
    if (/sports-reference|basketball-reference/i.test(w0)) { skipped.push(title + " (cites Sports Reference)"); continue }
    const w = noRefs(w0); let n = 0;
    for (const T of tables(w)) { const key = /consensus first team/i.test(T.caption) ? "aa1" : /consensus second team/i.test(T.caption) ? "aa2" : null; if (!key) continue;
      const H = T.heads, iP = Math.max(0, H.findIndex(h => /player/.test(h))), iT = H.findIndex(h => /team|school/.test(h));
      for (const r of T.rows) { const nm = cellText(r[iP] || ""); if (!nm) continue; rows.push([y, key, nm, cellText(r[iT >= 0 ? iT : r.length - 1] || "")]); n++ } }
    if (n) src["aa" + y] = title; log(`awards: ${y} consensus All-Americans — ${n}`) }
  if (skipped.length) log(`awards: skipped ${skipped.join("; ")}`);
  const P = { v: 1, t: Date.now(), src, skipped, rows };
  if (rows.length >= 50 || !old) await putPack("p2000_cbb-awards", P); else log(`awards: only ${rows.length} rows — kept the old pack`);
  return P }
