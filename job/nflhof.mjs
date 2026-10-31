/* MODE=nflhof — Pro Football Hall of Famers and their awards, from each one's Wikipedia infobox (Oct 30, 6:24–6:36 pm, Sam: "yes on the
   hall of famers" · "hall of famers and their awards. then just do the team totals of the awards on the history page" · "this should
   just be the hall of famers and anyone that we think tracks as one that retires and is in the system but they are not eligible yet").
   About ten Wikipedia reads: the inductee category (one list), then fifty infoboxes a read. Players only (coaches and contributors are
   left out; NFL head coaches already carry their own Hall of Fame mark). Each player: his teams with their seasons and every honor with
   its season, so the NFL team History tab can total them by franchise. EXTRA (comma-separated page titles) adds players who track as
   Hall of Famers but aren't eligible yet; they're marked hof:0. Writes pack p1990_nfl-hof (new; nothing else touched). */
import { gzipSync } from "node:zlib";
const WUA = { "User-Agent": "mycfbbigboard.com data job (football stats site; contact via the site)" };
const api = async q => { for (let a = 0; a < 4; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...q }), { headers: WUA }); if (r.ok) return r.json() } catch { } await new Promise(z => setTimeout(z, 2000 * (a + 1))) } return null };

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
   season when he was put on the list) or this season. Snubs (keeping some anyway) are parked: Sam, "so im stuck on that". */
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

export async function buildNflHof({ putPack, putIndex, extra = [], dry = false, log = console.log }) {
  let reads = 0; const titles = new Set(); let cont = {};
  for (let g = 0; g < 5; g++) { const j = await api({ action: "query", list: "categorymembers", cmtitle: "Category:Pro Football Hall of Fame inductees", cmlimit: "500", cmnamespace: "0", ...cont }); reads++; if (!j) break;
    for (const m of (j.query && j.query.categorymembers) || []) titles.add(m.title); if (!j.continue) break; cont = j.continue }
  if (titles.size < 300) throw new Error(`nflhof: only ${titles.size} inductees listed — not writing`);
  const XL = Object.fromEntries(extra.map(e => Array.isArray(e) ? e : [e, null])), drop = [];
  const L = [...titles].map(t => [t, 1]).concat(Object.keys(XL).filter(t => !titles.has(t)).map(t => [t, 0]));
  const P = {}, skip = [], miss = [];
  for (let k = 0; k < L.length; k += 50) { const part = L.slice(k, k + 50), hofOf = Object.fromEntries(part);
    const j = await api({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", rvsection: "0", redirects: "1", titles: part.map(x => x[0]).join("|") }); reads++;
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
    await new Promise(z => setTimeout(z, 400)) }
  /* team totals: honors counted to the team he was with that season; Hall of Famers counted to every franchise he played 3+ seasons for */
  const TT = {}; const tt = t => TT[t] || (TT[t] = {});
  for (const p of Object.values(P)) { for (const [k, , t] of p.aw) if (t) tt(t)[k] = (tt(t)[k] || 0) + 1;
    if (p.hof) for (const t of new Set(p.t.filter(([, a, b]) => b - a + 1 >= 3).map(x => x[0]))) tt(t).hof = (tt(t).hof || 0) + 1 }
  const pack = { v: 1, t: Date.now(), p: P, tt: TT };
  const gz = gzipSync(Buffer.from(JSON.stringify(pack)));
  if (!dry) { const u = await putPack("p1990_nfl-hof", gz); await putIndex({ "p1990_nfl-hof": { sha: u.sha, bytes: u.bytes, at: Date.now() } }) } else log("::notice title=nfl hof::dry run — nothing written");
  const n = Object.keys(P).length, nh = Object.values(P).filter(p => p.hof).length;
  log(`::notice title=nfl hof list::${drop.length} off the not-yet-eligible list${drop.length ? ": " + drop.join("; ") : ""}`);
  log(`::notice title=nfl hof::${nh} Hall of Fame players + ${n - nh} not yet eligible · ${skip.length} coaches/contributors left out · ${miss.length} pages not read${miss.length ? ` (${miss.slice(0, 20).join(", ")})` : ""} · ${reads} Wikipedia reads · ${(gz.length / 1024).toFixed(0)} KB`);
  const chk = ["Barry Sanders", "Jerry Rice", "Lawrence Taylor", "Calvin Johnson", "Peyton Manning", "Jim Brown"].map(x => P[x] ? `${x}: ${P[x].t.map(t => t.join(" ")).join(", ")} · ${Object.entries(P[x].aw.reduce((o, [k]) => (o[k] = (o[k] || 0) + 1, o), {})).map(e => e.join(" ")).join(" ")}` : `${x}: missing`);
  log(`::notice title=nfl hof check::${chk.join(" | ").slice(0, 5000)}`);
  log(`::notice title=nfl hof teams::${Object.entries(TT).sort().map(([t, o]) => `${t} hof ${o.hof || 0} mvp ${o.mvp || 0} sb ${o.sb || 0} ap1 ${o.ap1 || 0} pb ${o.pb || 0}`).join(" · ").slice(0, 5800)}`);
  log(`::notice title=nfl hof skipped::${skip.join(", ").slice(0, 5000)}`);
  return { n, nh, reads, skip: skip.length, miss: miss.length } }
