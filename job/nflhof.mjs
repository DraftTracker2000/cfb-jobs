/* MODE=nflhof — Pro Football Hall of Famers and their awards, from each one's Wikipedia infobox (Oct 30, 6:24–6:36 pm, Sam: "yes on the
   hall of famers" · "hall of famers and their awards. then just do the team totals of the awards on the history page" · "this should
   just be the hall of famers and anyone that we think tracks as one that retires and is in the system but they are not eligible yet").
   About ten Wikipedia reads: the inductee category (one list), then fifty infoboxes a read. Players only (coaches and contributors are
   left out; NFL head coaches already carry their own Hall of Fame mark). Each player: his teams with their seasons and every honor with
   its season, so the NFL team History tab can total them by franchise. EXTRA (comma-separated page titles) adds players who track as
   Hall of Famers but aren't eligible yet; they're marked hof:0. Writes pack p1990_nfl-hof (new; nothing else touched).
   Oct 31: Hall of Fame snubs added to the same pack as hof:-1 with `snub` {semis, finals, why, top, said} (findSnubs below; ~10 more
   reads); they're added after the team totals and never count toward them. */
import { gzipSync } from "node:zlib";
const WUA = { "User-Agent": "mycfbbigboard.com data job (football stats site; contact via the site)" };
/* a long list of titles goes as a POST (the API takes queries either way); the last failure is kept for the error message */
export let wikiFail = "";
const api = async q => { const body = new URLSearchParams({ format: "json", formatversion: "2", ...q }), post = String(body).length > 1500;
  /* Wikipedia's "too many requests" (429, Oct 31): wait what it asks (Retry-After) or 20 s more each try, up to 6 tries */
  for (let a = 0; a < 6; a++) { let wait = 2000 * (a + 1); try { const r = await fetch("https://en.wikipedia.org/w/api.php" + (post ? "" : "?" + body), post ? { method: "POST", headers: { ...WUA, "Content-Type": "application/x-www-form-urlencoded" }, body } : { headers: WUA });
      if (r.ok) return r.json(); wikiFail = `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`; if (r.status === 429) wait = Math.max(20000 * (a + 1), 1000 * (+r.headers.get("retry-after") || 0)) } catch (e) { wikiFail = String(e && e.message || e).slice(0, 200) }
    if (a < 5) await new Promise(z => setTimeout(z, Math.min(wait, 120000))) } return null };

/* franchise by any name it has played under (the site's nflverse codes; moved teams count as one franchise, as on the History tab) */
const FR = [[/Arizona Cardinals|St\.? Louis Cardinals \(football\)|Phoenix Cardinals|Chicago Cardinals|St\.? Louis Cardinals/, "ARI"], [/Atlanta Falcons/, "ATL"], [/Baltimore Ravens/, "BAL"], [/Buffalo Bills/, "BUF"],
  [/Carolina Panthers/, "CAR"], [/Chicago Bears|Decatur Staleys|Chicago Staleys/, "CHI"], [/Cincinnati Bengals/, "CIN"], [/Cleveland Browns/, "CLE"], [/Dallas Cowboys/, "DAL"], [/Denver Broncos/, "DEN"],
  [/Detroit Lions|Portsmouth Spartans/, "DET"], [/Green Bay Packers/, "GB"], [/Houston Texans/, "HOU"], [/Indianapolis Colts|Baltimore Colts/, "IND"], [/Jacksonville Jaguars/, "JAX"],
  [/Kansas City Chiefs|Dallas Texans \(AFL\)|Dallas Texans/, "KC"], [/Las Vegas Raiders|Oakland Raiders|Los Angeles Raiders/, "LV"], [/Los Angeles Chargers|San Diego Chargers/, "LAC"],
  [/Los Angeles Rams|St\.? Louis Rams|Cleveland Rams/, "LA"], [/Miami Dolphins/, "MIA"], [/Minnesota Vikings/, "MIN"], [/New England Patriots|Boston Patriots/, "NE"], [/New Orleans Saints/, "NO"],
  [/New York Giants/, "NYG"], [/New York Jets|New York Titans/, "NYJ"], [/Philadelphia Eagles|Phil-Pitt/, "PHI"], [/Pittsburgh Steelers|Pittsburgh Pirates \(football\)/, "PIT"],
  [/San Francisco 49ers/, "SF"], [/Seattle Seahawks/, "SEA"], [/Tampa Bay Buccaneers/, "TB"], [/Tennessee Titans|Tennessee Oilers|Houston Oilers/, "TEN"],
  [/Washington Commanders|Washington Redskins|Washington Football Team|Boston Redskins|Boston Braves \(NFL\)/, "WAS"]];
const frOf = s => { for (const [re, t] of FR) if (re.test(s)) return t; return null };
const ROMAN = s => { const V = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let n = 0; s = String(s).toUpperCase(); for (let i = 0; i < s.length; i++) { const a = V[s[i]], b = V[s[i + 1]] || 0; if (!a) return null; n += a < b ? -a : a } return n };
const field = (w, k) => { const m = w.match(new RegExp(`\\n[ \\t]*\\|[ \\t]*${k}[ \\t]*=([\\s\\S]*?)(?=\\n[ \\t]*\\|[ \\t]*[A-Za-z_0-9]+[ \\t]*=|\\n\\}\\})`, "i")); return m ? m[1] : "" };
const clean = s => String(s).replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\{\{\s*efn[^{}]*\}\}/gi, "").replace(/<!--[\s\S]*?-->/g, "");
const unlink = s => s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
/* seasons named in a piece of text: {{nfly|1985}}, a plain year, Super Bowl numerals (Super Bowl N = the 1965+N season), ranges with – */
function seasons(par, sb) {
  const marks = []; for (const m of par.matchAll(/\{\{\s*(?:[Nn]fly|[Aa]fly|[Nn][Ff][Ll] [Yy]ear|[Aa][Ff][Ll] [Yy]ear)\s*\|\s*(\d{4})(?:\s*\|\s*(\d{4}))?[^}]*\}\}|\b((?:19|20)\d{2})\b|\b([IVXL]+)\b|([–-])/g)) {
    if (m[5]) { marks.push("-"); continue } if (m[1]) { marks.push(+m[1]); if (m[2]) marks.push("-", +m[2]); continue } if (m[3]) { marks.push(+m[3]); continue }
    m[3] = m[4]; if (sb && m[3]) { const n = ROMAN(m[3]); if (n && n < 80) marks.push(1965 + n) } }
  const S = []; for (let i = 0; i < marks.length; i++) { if (marks[i] === "-") continue; if (marks[i + 1] === "-" && typeof marks[i + 2] === "number") { for (let y = marks[i]; y <= marks[i + 2] && y - marks[i] < 25; y++) S.push(y); i += 2 } else S.push(marks[i]) }
  return [...new Set(S)] }
const KIND = [[/Super Bowl (?:Most Valuable|MVP)/i, "sbmvp"], [/Super Bowl champion/i, "sb"], [/\b(?:NFL|AFL|AAFC) champion/i, "champ"], [/Pro Bowl MVP|Pro Bowl Most/i, null],
  [/UPI|NEA\b|Bert Bell|PFWA|Sporting News|Kansas City Committee|Newspaper Enterprise/i, null], [/Second-team All-Pro/i, null], [/Comeback Player/i, "cpoy"], [/Walter Payton|Man of the Year/i, "wpmoy"], [/All-Rookie|Rookie of the (?:Week|Month)/i, null], [/Offensive Rookie of the Year/i, "oroy"], [/Defensive Rookie of the Year/i, "droy"], [/(?:NFL|AP|AFL)\b.*Rookie of the Year/i, "roy"], [/Rookie of the Year/i, null],
  [/Offensive Player of the Year/i, "opoy"], [/Defensive Player of the Year/i, "dpoy"], [/Most Valuable Player|\bMVP\b/i, "mvp"],
  [/First-team All-Pro|All-Pro \(first team\)|\bAll-Pro\b(?!.*Second)/i, "ap1"], [/Pro Bowl|AFL All-Star/i, "pb"], [/All-Decade/i, "dec"], [/Anniversary|All-Time Team/i, "ann"]];
export function parseHof(w) {
  /* a player who now coaches or runs a team (Faulk, Deion, Lynch) has his playing position in career_position */
  const cp = unlink(clean(field(w, "career_position"))).trim(), pos = cp || unlink(clean(field(w, "position"))).trim();
  /* teams and their seasons — "As player" only */
  let pt = clean(field(w, "pastteams") || field(w, "teams")); const co = pt.search(/As (?:a )?(?:head )?coach|As executive|'''Coach/i); if (co > 0) pt = pt.slice(0, co);
  /* link targets dropped first: "[[Boston Braves (NFL)|Boston Braves / Redskins]] / [[Washington Redskins]] (1932–1937)" (Oct 30) */
  const T = []; for (const l0 of pt.split("\n")) { if (!/^\s*\*/.test(l0) || /practice squad|offseason|\*\s*\{\{\s*small/i.test(l0)) continue; const l = unlink(l0), k = l.search(/\s\(/), t = frOf(k >= 0 ? l.slice(0, k) : l); if (!t) continue;
    const par = k >= 0 ? l.slice(k) : "", y = seasons(par); if (/present/i.test(par)) y.push(NOW_SEASON()); if (y.length) T.push([t, Math.min(...y), Math.max(...y)]) }
  let h = clean(field(w, "highlights")); const hc = h.search(/'''\s*As (?:a )?(?:head )?coach|'''\s*As executive|\n;\s*As (?:a )?(?:head )?coach|\n;\s*As (?:an )?executive/i); if (hc > 0) h = h.slice(0, hc);
  const A = []; for (const l0 of h.split("\n")) { if (!/^\s*\*/.test(l0)) continue; const l = unlink(l0); const kd = KIND.find(([re]) => re.test(l)); if (!kd || !kd[1]) continue;
    const k = kd[1], cnt = +((l.match(/(\d+)\s*×/) || [])[1] || 1), par = l.slice(l.indexOf("(") >= 0 ? l.indexOf("(") : l.length), ys = seasons(par, k === "sb" || k === "sbmvp");
    if (k === "dec" || k === "ann") { A.push([k, ys[0] || 0]); continue }
    if (ys.length) for (const y of ys) A.push([k, y]); else for (let i = 0; i < cnt; i++) A.push([k, 0]) }
  return { pos, cp: !!cp, t: T, aw: A } }
/* the NFL season now: September onward is this year's season, January–August still last year's */
const NOW_SEASON = (d = new Date()) => d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
/* who comes off the not-yet-eligible list (Oct 31, 2:08 pm — Sam: "if they sign with a team and actually play, or in their 7th year after
   2 times through"). L = his last season played (from his infobox teams; "present" = this season). A player becomes eligible 5 full
   seasons after he retires, so his first ballot is the class of L+6 and his second L+7; once the L+7 class is announced (early February)
   and he wasn't picked, he comes off. He also comes off if he's playing again: a season after the one we listed him for (`since`, his last
   season when he was put on the list) or this season. Snubs are their own list (findSnubs, Sam's yes Oct 31, 3:33 pm), not kept here. */
export function hofWaitOff(L, now = new Date(), listedLast = null) {
  if (!L) return null;
  const y = now.getUTCFullYear(), afterVote = now.getUTCMonth() >= 1;   // February onward: that year's class is out
  /* playing again = a season after the one we listed him for that has already been played (in season, September–January, this season's
     games are still going, so a fresh signing doesn't count until the season is done; the September 8 run can't drop a man who only signed) */
  const m = now.getUTCMonth(), played = (m >= 8 || m === 0) ? NOW_SEASON(now) - 1 : NOW_SEASON(now);
  if (listedLast && L > listedLast && L <= played) return "playing again";
  if (y > L + 7 || (y === L + 7 && afterVote)) return `passed over twice (eligible ${L + 6} and ${L + 7})`;
  return null }
const teamIn = (T, y) => { const L = T.filter(([, a, b]) => y >= a && y <= b); return L.length ? L[L.length - 1][0] : null };

/* ---- Hall of Fame snubs (Oct 31, 3:33 pm — Sam: "yes" to: "start from the players the Hall's own voters have named as semifinalists or
   finalists in past years but never elected. Those lists are public announcements. Then apply your filters (10+ honors, or top 25 in a
   stat), using the honors from the Wikipedia pages our Hall of Fame list already reads. That avoids the record book entirely.")
   Wikipedia has no page listing the semifinalists or finalists (checked Oct 31: no yearly class articles, no list page), so the candidates
   are the player pages that say so, found with a few full-text searches; a player counts only when his own page gives the year(s) the
   Hall's selection committee named him (prose, or the title of the Hall announcement it cites). Modern-era only (senior, coach and
   contributor mentions are left out). Kept when he has 10+ Pro Bowls + first-team All-Pros (his infobox, parseHof) or is top 25 all-time
   in his position's main stat on Wikipedia's career-leader list (those lists cite Pro Football Reference — on the source flag list). */
export const SNUB_SEARCH = ['insource:"finalist" insource:"Pro Football Hall of Fame"', 'insource:"finalists" insource:"Pro Football Hall of Fame"',
  'insource:"semifinalist" insource:"Hall of Fame" football', 'insource:"semifinalists" insource:"Hall of Fame" football', 'insource:"semi-finalist" insource:"Hall of Fame" football'];
/* the stat categories: key, words for the page, the list page, its stat column, the positions it's the main stat for */
export const LEADERS = [
  ["passyds", "passing yards", "List of NFL career passing yards leaders", /^Yds$/, /quarterback/i],
  ["passtd", "passing touchdowns", "List of NFL career passing touchdowns leaders", /^TDs$/, /quarterback/i],
  ["rushyds", "rushing yards", "List of NFL career rushing yards leaders", /^Yards$/, /running back|halfback|fullback|tailback/i],
  ["rushtd", "rushing touchdowns", "List of NFL career rushing touchdowns leaders", /^Touchdowns$/, /running back|halfback|fullback|tailback/i],
  ["rec", "receptions", "List of NFL career receptions leaders", /^Receptions$/, /wide receiver|tight end|flanker|split end|^end\b|\bend$/i],
  ["recyds", "receiving yards", "List of NFL career receiving yards leaders", /^Yards$/, /wide receiver|tight end|flanker|split end|^end\b|\bend$/i],
  ["rectd", "receiving touchdowns", "List of NFL career receiving touchdowns leaders", /^Touchdowns$/, /wide receiver|tight end|flanker|split end|^end\b|\bend$/i],
  ["sacks", "sacks", "List of NFL career sacks leaders", /^Sacks$/, /defensive end|defensive tackle|linebacker|defensive line|nose tackle/i],
  ["ints", "interceptions", "List of NFL career interceptions leaders", /^Ints$/, /cornerback|safety|defensive back/i],
  ["pts", "points scored", "List of NFL career scoring leaders", /^Points$/, /kicker/i],
  ["puntyds", "punting yards", "List of NFL career punting yards leaders", /^Yards$/, /punter/i],
  ["apy", "all-purpose yards", "List of NFL career all-purpose yards leaders", /all-purpose/i, /return/i]];
/* a wikitable's rows with rowspans carried down (the passing lists give each team stint its own row under one rowspan'd player).
   Each table: { cap, head: [header text], hraw: header source, rows: [[cell]] } — a carried cell is the same object on every row it spans. */
const topSplit = (s, sep) => { const out = []; let d = 0, last = 0; for (let i = 0; i < s.length; i++) { const c2 = s.slice(i, i + 2);
    if (c2 === "[[" || c2 === "{{") { d++; i++; continue } if (c2 === "]]" || c2 === "}}") { d = Math.max(0, d - 1); i++; continue }
    if (!d && s.slice(i, i + sep.length) === sep) { out.push(s.slice(last, i)); i += sep.length - 1; last = i + 1 } } out.push(s.slice(last)); return out };
/* one cell: `rowspan=2 style="…" | content` → its content, rowspan and colspan */
const cellOf = raw => { const p = topSplit(raw, "|"), isAttr = p.length > 1 && !/\[\[|\{\{/.test(p[0]) && /=/.test(p[0]), attr = isAttr ? p[0] : "", t = isAttr ? p.slice(1).join("|") : raw;
  return { t: t.trim(), rs: +((attr.match(/rowspan\s*=\s*"?(\d+)/i) || [])[1] || 1), cs: +((attr.match(/colspan\s*=\s*"?(\d+)/i) || [])[1] || 1), h: false } };
const headText = s => s.replace(/\{\{\s*efn[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}/gi, "").replace(/\{\{\s*(?:tooltip|abbr)\s*\|([^|}]*)\|[^}]*\}\}/gi, "$1").replace(/\{\{\s*shy\s*\}\}/gi, "").replace(/\{\{\s*sronly\s*\|([^}]*)\}\}/gi, "$1")
  .replace(/<br\s*\/?>/gi, " ").replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/\s+/g, " ").trim();
export function wikiTables(w) {
  const T = []; let cur = null, row = null;
  for (const line of clean(w).split("\n")) { const l = line.trim();
    if (l.startsWith("{|")) { cur = { cap: "", head: [], hraw: "", rows: [] }; row = null; T.push(cur); continue } if (!cur) continue;
    if (l.startsWith("|}")) { cur = null; continue } if (l.startsWith("|+")) { cur.cap += l.slice(2); continue }
    if (l.startsWith("|-")) { row = []; cur.rows.push(row); continue }
    if (l.startsWith("!") || l.startsWith("|")) { const h = l[0] === "!"; if (!row) { row = []; cur.rows.push(row) }
      for (const c of topSplit(l.slice(1), h ? "!!" : "||").flatMap(x => h ? topSplit(x, "||") : [x])) { const o = cellOf(c); o.h = h; row.push(o) } continue }
    if (row && row.length) row[row.length - 1].t += "\n" + line }   /* a cell that runs onto the next line */
  for (const t of T) { t.rows = t.rows.filter(r => r.length);
    const hi = t.rows.findIndex(r => r.every(c => c.h) && r.length > 1); if (hi >= 0) { t.head = t.rows[hi].flatMap(c => Array(c.cs).fill(headText(c.t))); t.hraw = t.rows[hi].map(c => c.t).join(" ¦ "); t.rows = t.rows.slice(hi + 1) }
    const carry = []; t.rows = t.rows.map(r => { const g = []; let k = 0;
      for (let col = 0; col < Math.max(t.head.length, r.length + carry.length); col++) { if (carry[col] && carry[col].n > 0) { g[col] = carry[col].c; carry[col].n--; continue } const c = r[k++]; if (!c) break; g[col] = c; if (c.rs > 1) carry[col] = { c, n: c.rs - 1 } }
      return g }) }
  return T }
const num = s => { const m = String(s).replace(/<[^>]*>/g, "").replace(/\{\{[^{}]*\}\}/g, "").match(/-?\d[\d,]*(?:\.\d+)?/); return m ? +m[0].replace(/,/g, "") : null };
/* who a player cell links to: [[Target|Label]] or {{sortname|First|Last|link}} → { w: page title, nm: shown name } */
const whoOf = s => { let m = s.match(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)(?:\|([^|}]*))?[^}]*\}\}/i); if (m) { const nm = `${m[1].trim()} ${m[2].trim()}`; return { w: (m[3] && !/=/.test(m[3]) && m[3].trim()) || nm, nm } }
  m = s.match(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/); if (m) return { w: m[1].trim(), nm: (m[2] || m[1]).replace(/\s*\([^)]*\)\s*$/, "").trim() }; const t = unlink(s).replace(/\{\{[^{}]*\}\}|<[^>]*>|[*^†‡]/g, "").trim(); return t ? { w: t, nm: t } : null };
/* a career-leader page's ranking: the first ranking table plus any that carry its ranks on (receptions splits at 19); a table whose ranks
   start over (the playoff list on the passing-touchdown page), a "reign" or unofficial table, or a playoff table ends it. Rank comes from the
   values (ties share a rank). Returns [{ w, nm, v, r }] best first, and how far down the page's list goes (`deep`). */
export function leaderRank(w, statRe) {
  const plain = unlink(clean(w)).replace(/\{\{\s*NFL [Yy]ear\s*\|\s*(\d{4})[^}]*\}\}/g, "$1"), out = new Map(); let lastRank = 0, used = 0;
  const through = ((plain.match(/(?:Updated |current |accurate |Rank is as of )?(?:through|as of) ((?:Week \d+|the )[^'\n.<]{2,40}?(?:season|\d{4}))/i) || [])[1] || "").replace(/\s+NFL season$/, " season");
  for (const t of wikiTables(w)) { const ri = t.head.findIndex(h => /^Rank\b/i.test(h)), pi = t.head.findIndex(h => /^Player\b|^Name\b/i.test(h)), si = t.head.findIndex(h => statRe.test(h));
    if (ri < 0 || pi < 0 || si < 0 || /playoff|postseason|reign|unofficial|historical|progression/i.test(t.cap + " " + t.hraw)) { if (used && ri >= 0) break; continue }
    const first = t.rows.map(r => r[ri] && num(r[ri].t)).find(x => x != null); if (used && !(first > lastRank)) break;
    const seen = new Set(); for (const r of t.rows) { const pc = r[pi], sc = r[si]; if (!pc || !sc || seen.has(pc)) continue; seen.add(pc); const who = whoOf(pc.t), v = num(sc.t); if (!who || v == null || frOf(who.w)) continue;
      const rk = r[ri] && num(r[ri].t); if (rk != null) lastRank = Math.max(lastRank, rk); const k = who.w; if (!out.has(k) || out.get(k).v < v) out.set(k, { w: who.w, nm: who.nm, v }) }
    used++ }
  const L = [...out.values()].sort((a, b) => b.v - a.v); for (const x of L) x.r = 1 + L.filter(y => y.v > x.v).length;
  return { L, deep: L.length, tables: used, through: through.trim() } }
/* the years his own page says the Hall's selection committee named him a semifinalist / finalist (modern era). `last` = his last season. */
const OTHER_HALL = /College Football Hall of Fame|Canadian Football Hall|CFL Hall|Black College|Polynesian|Ring of Honor|Wall of Fame|Athletic Hall|Sports Hall of Fame|High School|State Hall|Hall of Fame Game|Arena Football|Hall of Honor|Legends/i;
const NEG = /\bnot (?:been |yet |again )?(?:named|selected|chosen|make|made|among)\b|\bfail(?:s|ed)? to\b|\bleft off\b|\bsnub|\bmiss(?:es|ed)? (?:the )?cut|\bpassed over\b/i;
export function ballotYears(w, last, nowY = new Date().getUTCFullYear()) {
  const semis = new Set(), finals = new Set(), said = [];
  /* modern era: from his first eligible class (5 full seasons retired: last + 6). The modern-era window is about 25 seasons (Ellard, last
     season 1998: "the class of 2023 … his last year with the Modern Era class") but not exactly (Tasker, 1997, was a Modern-Era finalist for
     2024), so a year more than 30 after his last season is taken as the senior ballot and left out (Jim Tyrer, 1974: finalist for 2025) */
  const lo = (last || 1960) + 6, hi = Math.min(nowY + 1, (last || nowY) + 30);
  const take = (s, mustClass) => { if (!/finalist/i.test(s) || !/Hall of Fame/i.test(s)) return; if (/senior|\bcoach(?:es|ing)? (?:finalist|semifinalist)|as an? (?:coach|contributor)|contributor/i.test(s)) return;
    if (OTHER_HALL.test(s) && !/Pro Football Hall of Fame/i.test(s)) return; if (NEG.test(s)) return;
    /* a keyword with a "not / never / nor / n't" shortly before it doesn't count ("has never advanced to a semi-finalist", "has not even been
       selected as a semifinalist", "has never been one of the 15 finalists" — Holmes, Alexander, Rice, Oct 31 dry run) */
    const toks = [...s.matchAll(/(semi-?\s?finalists?)|(finalists?)|\b((?:19|20)\d{2})\b(?:\s*(?:–|-|&ndash;|to|through)\s*((?:19|20)\d{2})\b)?/gi)], kw = toks.filter(m => m[1] || m[2]);
    for (const k of kw) k.neg = /\b(?:not|never|nor|no longer)\b|n't\b/i.test(s.slice(Math.max(0, k.index - 60), k.index));
    if (!kw.length) return; let got = 0;
    for (const m of toks) { if (!m[3]) continue; if (mustClass && !new RegExp(`(?:Class of|for(?: the)?(?: class of)?|in)\\s*${m[3]}`, "i").test(s.slice(Math.max(0, m.index - 20), m.index + 4))) continue;
      const before = kw.filter(k => k.index < m.index).pop(), after = kw.find(k => k.index > m.index); let k = before;
      if (!k) { if (!after) continue; const gap = s.slice(m.index + m[0].length, after.index); if (gap.length > 45 || /[;]|\band\b|inducted|named to|wall|ring|retire/i.test(gap)) continue; k = after }
      /* semifinalists are announced in November for the next year's class: "On November 22, 2011, Tasker was named …" = the Class of 2012 */
      const fall = !mustClass && /(?:November|December)(?:\s+\d{1,2},?)?\s*$/i.test(s.slice(Math.max(0, m.index - 16), m.index)) ? 1 : 0;
      const ys = []; for (let y = +m[3] + fall; y <= +(m[4] || m[3]) + fall && ys.length < 20; y++) ys.push(y);
      if (k.neg) continue;
      for (const y of ys) if (y >= lo && y <= hi) { (/semi/i.test(k[0]) ? semis : finals).add(y); got++ } }
    if (got && said.length < 3) said.push(unlink(s).replace(/\s+/g, " ").trim().slice(0, 220)) };
  /* the titles of what his page cites (the Hall's announcements: "… Semifinalists for Pro Football Hall of Fame's Class of 2023") */
  for (const m of w.matchAll(/<ref[^>]*>([\s\S]*?)<\/ref>/gi)) { for (const t of m[1].matchAll(/\|\s*title\s*=\s*([^|}]+)/gi)) take(t[1], true); for (const t of m[1].matchAll(/\[https?:\/\/\S+\s+([^\]]+)\]/g)) take(t[1], true) }
  const prose = unlink(clean(w)).replace(/\{\{[^{}]*\}\}/g, " ").replace(/'''?/g, "");
  for (const s of prose.split(/(?<=[.!?])\s+(?=[A-Z])|\n+/)) take(s, false);
  /* a year he was a finalist he was a semifinalist too; show each year once, under the furthest he got */
  for (const y of finals) semis.delete(y);
  return { semis: [...semis].sort((a, b) => a - b), finals: [...finals].sort((a, b) => a - b), said } }
const NOT_PERSON = /^(?:List of|Deaths in|History of|\d{4}\b)|\bseason$|football team$|\bfootball$|\bNFL Honors$|Super Bowl|All-Decade|All-Time Team|Ring of Honor|High School|University|College\b|\balumni\b|\bpeople\b|\bmembers\b|\(TV series\)|episodes|Hall of Fame$|Legends team|\bAward$|\bin sports$|\bin the United States$|\bin American television$/i;
const PLAYER_POS = /(back|end|tackle|guard|center|quarterback|linebacker|receiver|safety|kicker|punter|lineman|tailback|fullback|halfback|wingback|returner|cornerback)/i;
/* the snubs: searches → candidate pages (not in the Hall, not on the wait list) → their infoboxes → the filters → his page's ballot years */
export async function findSnubs({ have, api, log = () => { }, nowY = new Date().getUTCFullYear(), pause = 400 }) {
  let reads = 0; const cand = new Set(), sq = {}, rest = () => new Promise(z => setTimeout(z, pause * 5));   /* searches cost Wikipedia more: ~2 s between them */
  for (const q of SNUB_SEARCH) { await rest(); const j = await api({ action: "query", list: "search", srsearch: q, srlimit: "500", srnamespace: "0", srprop: "" }); reads++;
    if (!j || !j.query) throw new Error(`nflhof snubs: the search "${q}" didn't answer (${wikiFail}) — not writing`); sq[q] = j.query.searchinfo && j.query.searchinfo.totalhits; for (const x of j.query.search || []) cand.add(x.title) }
  const C = [...cand].filter(t => !have.has(t) && !NOT_PERSON.test(t)), X = {}, notPlayer = [];
  for (let k = 0; k < C.length; k += 50) { const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", rvsection: "0", redirects: "1", titles: C.slice(k, k + 50).join("|") }); reads++;
    if (!j) throw new Error(`nflhof snubs: candidate pages didn't answer (${wikiFail}) — not writing`);
    for (const pg of (j.query && j.query.pages) || []) { const w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content; if (!w || have.has(pg.title)) continue;
      const x = parseHof(w); if (!x.t.length || !PLAYER_POS.test(x.pos)) { notPlayer.push(pg.title); continue } X[pg.title] = x }
    await new Promise(z => setTimeout(z, pause)) }
  /* the career-leader lists, all in one read */
  await rest(); const lj = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: LEADERS.map(x => x[2]).join("|") }); reads++;
  const LW = Object.fromEntries((((lj && lj.query && lj.query.pages) || [])).map(p => [p.title, p.revisions && p.revisions[0] && p.revisions[0].slots.main.content]));
  const TOP = {}; for (const [key, , page, re] of LEADERS) { const w = LW[page]; if (!w) throw new Error(`nflhof snubs: ${page} didn't answer (${wikiFail}) — not writing`);
    const R = leaderRank(w, re); if (R.L.filter(x => x.r <= 25).length < 25) throw new Error(`nflhof snubs: ${page} gave only ${R.L.length} ranked players — its table changed; not writing`); TOP[key] = R }
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const pre = {}; for (const [t, x] of Object.entries(X)) { const pb = x.aw.filter(a => a[0] === "pb").length, ap1 = x.aw.filter(a => a[0] === "ap1").length, why = [], top = [];
    if (pb + ap1 >= 10) why.push(`${pb} Pro Bowl${pb === 1 ? "" : "s"} + ${ap1} first-team All-Pro`);
    for (const [key, words, , , posRe] of LEADERS) { if (!posRe.test(x.pos)) continue; const hit = TOP[key].L.find(e => e.r <= 25 && (e.w === t || norm(e.nm) === norm(t)));
      if (hit) { top.push([key, hit.r, hit.v]); why.push(`top 25 all-time in ${words} (No. ${hit.r}, ${hit.v.toLocaleString("en-US")})`) } }
    if (why.length) pre[t] = { x, pb, ap1, why, top } }
  /* only the kept ones: their whole page, for the years the committee named them */
  const K = Object.keys(pre), S = {}, noYears = [];
  for (let k = 0; k < K.length; k += 20) { const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: K.slice(k, k + 20).join("|") }); reads++;
    if (!j) throw new Error(`nflhof snubs: the kept players' pages didn't answer (${wikiFail}) — not writing`);
    for (const pg of (j.query && j.query.pages) || []) { const w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content, p = pre[pg.title]; if (!w || !p) continue;
      const last = p.x.t.length ? Math.max(...p.x.t.map(t => t[2])) : null, B = ballotYears(w, last, nowY);
      if (!B.semis.length && !B.finals.length) { noYears.push(pg.title); continue }
      const nm = String(pg.title).replace(/\s*\([^)]*\)\s*$/, "").trim();
      S[nm] = { w: pg.title, hof: -1, pos: p.x.pos.replace(/\s+/g, " ").slice(0, 60), t: p.x.t, aw: p.x.aw.map(([k2, y]) => [k2, y, y ? teamIn(p.x.t, y) : null]),
        snub: { semis: B.semis, finals: B.finals, why: p.why, top: p.top, said: B.said } } }
    await new Promise(z => setTimeout(z, pause)) }
  const meta = { searched: sq, pages: C.length, players: Object.keys(X).length, passed: K.length, noYears, notPlayer: notPlayer.length,
    lists: Object.fromEntries(Object.entries(TOP).map(([k, R]) => [k, { through: R.through, n: R.deep, top: R.L.slice(0, 1).concat(R.L.filter(x => x.r <= 25).slice(-1)).map(x => `${x.r}. ${x.nm} ${x.v}`) }])) };
  return { S, reads, meta } }

export async function buildNflHof({ putPack, putIndex, extra = [], dry = false, log = console.log, wiki = api, pause = 400 }) {
  let reads = 0; const titles = new Set(); let cont = {};
  for (let g = 0; g < 5; g++) { const j = await wiki({ action: "query", list: "categorymembers", cmtitle: "Category:Pro Football Hall of Fame inductees", cmlimit: "500", cmnamespace: "0", ...cont }); reads++; if (!j) break;
    for (const m of (j.query && j.query.categorymembers) || []) titles.add(m.title); if (!j.continue) break; cont = j.continue }
  if (titles.size < 300) throw new Error(`nflhof: only ${titles.size} inductees listed — not writing`);
  const XL = Object.fromEntries(extra.map(e => Array.isArray(e) ? e : [e, null])), drop = [];
  const L = [...titles].map(t => [t, 1]).concat(Object.keys(XL).filter(t => !titles.has(t)).map(t => [t, 0]));
  const P = {}, skip = [], miss = [];
  for (let k = 0; k < L.length; k += 50) { const part = L.slice(k, k + 50), hofOf = Object.fromEntries(part);
    const j = await wiki({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", rvsection: "0", redirects: "1", titles: part.map(x => x[0]).join("|") }); reads++;
    if (!j) { miss.push(...part.map(x => x[0])); continue }
    const red = Object.fromEntries(((j.query && j.query.redirects) || []).map(r => [r.to, r.from]));
    for (const pg of (j.query && j.query.pages) || []) { const w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content; const src = red[pg.title] || pg.title; if (!w) { miss.push(src); continue }
      const X = parseHof(w); /* players whose teams are long gone (Akron Pros, Brooklyn Dodgers) stay in, with no franchise to count toward */
      const PLAYER = /(back|end|tackle|guard|center|quarterback|linebacker|receiver|safety|kicker|punter|lineman|tailback|fullback|halfback|wingback)/i;
      if (!X.t.length && !PLAYER.test(X.pos) || !X.cp && /coach|owner|executive|commissioner|general manager|official|contributor|founder|president/i.test(X.pos) && !/(back|end|tackle|guard|center|quarterback|linebacker|receiver|safety|kicker|punter|lineman)/i.test(X.pos)) { skip.push(src + (X.t.length ? "" : " (no playing teams read)")); continue }
      const nm = String(pg.title).replace(/\s*\([^)]*\)\s*$/, "").trim();
      if (!(hofOf[src] ?? hofOf[pg.title] ?? 1)) { const last = X.t.length ? Math.max(...X.t.map(t => t[2])) : null, why = hofWaitOff(last, new Date(), XL[src] ?? XL[pg.title] ?? null);
        if (why) { drop.push(`${nm} (last season ${last}: ${why})`); continue } }
      P[nm] = { w: pg.title, hof: hofOf[src] ?? hofOf[pg.title] ?? 1, pos: X.pos.replace(/\s+/g, " ").slice(0, 60), t: X.t, aw: X.aw.map(([k, y]) => [k, y, y ? teamIn(X.t, y) : null]) } }
    await new Promise(z => setTimeout(z, pause)) }
  /* team totals: honors counted to the team he was with that season; Hall of Famers counted to every franchise he played 3+ seasons for */
  const TT = {}; const tt = t => TT[t] || (TT[t] = {});
  for (const p of Object.values(P)) { for (const [k, , t] of p.aw) if (t) tt(t)[k] = (tt(t)[k] || 0) + 1;
    if (p.hof) for (const t of new Set(p.t.filter(([, a, b]) => b - a + 1 >= 3).map(x => x[0]))) tt(t).hof = (tt(t).hof || 0) + 1 }
  /* the snubs go in after the team totals, so they never count toward them (hof: -1; the Lab counts hof > 0 as a Hall of Famer) */
  const gz0 = gzipSync(Buffer.from(JSON.stringify({ v: 1, t: Date.now(), p: P, tt: TT })));
  const have = new Set([...titles, ...Object.values(P).map(p => p.w), ...Object.keys(XL)]);
  const SN = await findSnubs({ have, api: wiki, log, pause }); reads += SN.reads; const clash = [];
  for (const [nm, s] of Object.entries(SN.S)) { if (P[nm]) { clash.push(nm); continue } P[nm] = s }
  const pack = { v: 1, t: Date.now(), p: P, tt: TT };
  const gz = gzipSync(Buffer.from(JSON.stringify(pack)));
  if (!dry) { const u = await putPack("p1990_nfl-hof", gz); await putIndex({ "p1990_nfl-hof": { sha: u.sha, bytes: u.bytes, at: Date.now() } }) } else log("::notice title=nfl hof::dry run — nothing written");
  const V = Object.values(P), nh = V.filter(p => p.hof === 1).length, n = V.filter(p => p.hof >= 0).length, ns = V.filter(p => p.hof === -1).length;
  log(`::notice title=nfl hof list::${drop.length} off the not-yet-eligible list${drop.length ? ": " + drop.join("; ") : ""}`);
  log(`::notice title=nfl hof::${nh} Hall of Fame players + ${n - nh} not yet eligible + ${ns} snubs · ${skip.length} coaches/contributors left out · ${miss.length} pages not read${miss.length ? ` (${miss.slice(0, 20).join(", ")})` : ""} · ${reads} Wikipedia reads (${SN.reads} for the snubs) · ${gz.length} bytes (${gz0.length} without the snubs)`);
  const yrs = s => [s.finals.length ? `finalist ${s.finals.join(", ")}` : "", s.semis.length ? `semifinalist ${s.semis.join(", ")}` : ""].filter(Boolean).join("; ");
  const SL = Object.entries(SN.S).filter(([nm]) => !clash.includes(nm)).sort((a, b) => a[0].localeCompare(b[0]));
  log(`::notice title=nfl hof snubs::${ns} — ${SL.map(([nm, p]) => `${nm} (${(p.pos.split(/[\/,]/)[0] || "").trim()}): ${p.snub.why.join(" + ")} · ${yrs(p.snub)}`).join(" | ").slice(0, 3900)}`);
  log(`::notice title=nfl hof snub evidence::${SL.map(([nm, p]) => `${nm}: ${p.snub.said.map(x => `"${x.slice(0, 150)}"`).join(" + ")}`).join(" | ").replace(/[\r\n]+/g, " ").slice(0, 3900)}`);
  const M = SN.meta; log(`::notice title=nfl hof snub search::searches ${JSON.stringify(M.searched)} · ${M.pages} candidate pages · ${M.players} players read · ${M.passed} passed a filter · ${M.noYears.length} of those with no ballot years on their page (left out: ${M.noYears.join(", ")})${clash.length ? ` · name clash, left out: ${clash.join(", ")}` : ""} · lists: ${Object.entries(M.lists).map(([k, v]) => `${k} [${v.through}] ${v.top.join(" … ")}`).join(" · ")}`.slice(0, 3900));
  const chk = ["Barry Sanders", "Jerry Rice", "Lawrence Taylor", "Calvin Johnson", "Peyton Manning", "Jim Brown"].map(x => P[x] ? `${x}: ${P[x].t.map(t => t.join(" ")).join(", ")} · ${Object.entries(P[x].aw.reduce((o, [k]) => (o[k] = (o[k] || 0) + 1, o), {})).map(e => e.join(" ")).join(" ")}` : `${x}: missing`);
  log(`::notice title=nfl hof check::${chk.join(" | ").slice(0, 5000)}`);
  log(`::notice title=nfl hof teams::${Object.entries(TT).sort().map(([t, o]) => `${t} hof ${o.hof || 0} mvp ${o.mvp || 0} sb ${o.sb || 0} ap1 ${o.ap1 || 0} pb ${o.pb || 0}`).join(" · ").slice(0, 5800)}`);
  log(`::notice title=nfl hof skipped::${skip.join(", ").slice(0, 5000)}`);
  return { n, nh, ns, reads, skip: skip.length, miss: miss.length, bytes: gz.length, bytes0: gz0.length } }
