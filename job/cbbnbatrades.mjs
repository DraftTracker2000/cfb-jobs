/* NBA trades since 2015 (Oct 24 — Sam on Be the GM: who a team will move "should take history into account … team records when they
   made trades"). NBA.com's official player movement log (the same one nba.com/players/transactions shows), trades only: each row is one
   piece a team received — a player, a draft pick, cash or draft consideration — and who it came from. The site matches players to its
   own season lines by name and reads each team's record from the season's games.
   Pack p2000_cbb-nbatrades: { v: 1, t, r: [[date "YYYY-MM-DD", trade id, received-by team name, from team name, what, NBA.com player id (0 = not a player)]] } */
const URL = "https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json";
const H = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com", "Accept": "application/json, text/plain, */*" };
export function parseTradeRow(x) {
  const m = String(x.TRANSACTION_DESCRIPTION || "").match(/^(.+?) received (.+?) from (.+?)\.?$/); if (!m) return null;
  const what = m[2].replace(/^(guard|forward|center|guard-forward|forward-guard|forward-center|center-forward)\s+/i, "").trim();
  return [String(x.TRANSACTION_DATE || "").slice(0, 10), String(x.GroupSort || "").replace(/^Trade\s*/, ""), m[1].trim(), m[3].trim(), what, +x.PLAYER_ID || 0];
}
export async function buildNbaTrades({ putPack, log = console.log }) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 60000);
  const r = await fetch(URL, { headers: H, signal: ac.signal }).finally(() => clearTimeout(to)); if (!r.ok) throw new Error("player movement " + r.status);
  const J = await r.json(), R = ((J && J.NBA_Player_Movement && J.NBA_Player_Movement.rows) || []).filter(x => x.Transaction_Type === "Trade").map(parseTradeRow).filter(Boolean);
  R.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  await putPack("p2000_cbb-nbatrades", { v: 1, t: Date.now(), r: R });
  log(`nba trades: ${R.length} pieces in ${new Set(R.map(x => x[1])).size} trades, ${R[0] && R[0][0]} to ${R.length && R[R.length - 1][0]}`); return R;
}
/* NBA playoff games since 2003 (Oct 24 — Sam picked "Name the champion" for the NBA side: a playoff run — the opponents and the series —
   name the team). ESPN's scoreboard, day by day through each spring's playoffs (about 75 reads a season, once; finished seasons are kept). The site builds the series from the games.
   Pack p2000_cbb-nbapo: { v: 1, t, s: { season: [[date, home abbr, away abbr, home pts, away pts, home name, away name, note]] } }.
   Finished seasons are kept from the last run; the current one is re-read. */
export async function buildNbaPlayoffs({ getPack, putPack, log = console.log, upto }) {
  const prev = await getPack("p2000_cbb-nbapo").catch(() => null), S = (prev && prev.s) || {}; let reads = 0;
  const last = upto || new Date().getUTCFullYear();
  /* 2020's playoffs were in the bubble (August–October) and 2021's ran late (May–July) */
  const WIN = { 2020: [7, 15, 9, 13], 2021: [4, 20, 6, 22] };
  for (let y = 2003; y <= last; y++) { if (S[y] && S[y].length && y < last && (!WIN[y] || (prev && prev.v >= 2))) continue; const [m0, d0, m1, d1] = WIN[y] || [3, 12, 5, 24];
    /* ESPN's scoreboard takes one day at a time for the NBA (a date range is refused): every day from mid-April to late June */
    try { const out = [], ev = [];
      for (let t = Date.UTC(y, m0, d0); t <= Date.UTC(y, m1, d1); t += 864e5) { const d = new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&seasontype=3`, { headers: { "User-Agent": "Mozilla/5.0 (mycbbbigboard.com data job)" } }); reads++;
        if (r.ok) { const J = await r.json(); ev.push(...(J.events || [])) } await new Promise(z => setTimeout(z, 120)) }
      for (const e of ev) { const c = (e.competitions || [])[0]; if (!c || !(c.status && c.status.type && c.status.type.completed)) continue;
        const h = (c.competitors || []).find(x => x.homeAway === "home"), a = (c.competitors || []).find(x => x.homeAway === "away"); if (!h || !a) continue;
        out.push([String(e.date || "").slice(0, 10), h.team.abbreviation, a.team.abbreviation, +h.score, +a.score, h.team.displayName, a.team.displayName, ((c.notes || [])[0] || {}).headline || ""]) }
      out.sort((p, q) => p[0].localeCompare(q[0])); if (out.length) S[y] = out; log(`nba playoffs ${y}: ${out.length} games`) } catch (e) { log(`nba playoffs ${y}: ${e.message}`) } }
  await putPack("p2000_cbb-nbapo", { v: 2, t: Date.now(), s: S }); log(`nba playoffs: ${Object.keys(S).length} seasons, ${Object.values(S).reduce((a, x) => a + x.length, 0)} games, ${reads} ESPN reads`); return S;
}
/* Every NBA playoff bracket since 1970 (Oct 24 — Sam: "no way to find it just by searching nba champions and then looking at who they beat …
   just the champions if we can go back far enough … the same thing for the team that lost the finals … chasing larry"). Wikipedia's
   "{year} NBA playoffs" page carries the bracket as a template (12TeamBracket, 16TeamBracket …): each series' two teams, their seeds (E1,
   W4 …) and series wins. One read a season; finished seasons are kept.
   Pack p2000_cbb-nbabrk: { v: 1, t, s: { season: [[round, team A, seed A, wins A, team B, seed B, wins B]] }, rd: { season: [round names] } } */
const WUA = { "User-Agent": "mycbbbigboard.com data job (basketball stats site; contact via the site)" };
export function parseNbaBracket(w) {
  const cands = [...String(w).matchAll(/\{\{\s*\d+TeamBracket[^]*?\n\}\}/g)].map(m => m[0]); const t = cands.find(c => /Finals/i.test(c) && /RD4/.test(c)) || cands.sort((a, b) => b.length - a.length)[0]; if (!t) return null;
  const P = {}, names = [];
  for (const m of t.matchAll(/\|\s*RD(\d)\s*=\s*([^\n|]*)/g)) names[+m[1]] = m[2].replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, "$1").replace(/[\[\]']/g, "").trim();
  for (const m of t.matchAll(/\|\s*RD(\d)-(seed|team|score)(\d+)\s*=\s*([^\n]*)/g)) { const k = m[1] + "|" + (+m[3]); (P[k] = P[k] || {})[m[2]] = m[4].trim() }
  const clean = v => String(v || "").replace(/\{\{\s*nowrap\s*\|/gi, "").replace(/\}\}/g, "").replace(/'{2,}/g, "").replace(/<[^>]*>/g, "").replace(/\*/g, "").trim();
  const LINKED = new Set(), team = v => { const c = clean(v), m = c.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/); if (!m) return c.replace(/[\[\]]/g, "") || null; const n = m[1].replace(/^\d{4}[–-]\d{2,4}\s+/, "").replace(/\s+season$/, "").trim(); LINKED.add(n); return n };
  const out = [];
  for (const k of Object.keys(P)) { const [r, i] = k.split("|").map(Number); if (i % 2 === 0) continue; const A = P[k], B = P[r + "|" + (i + 1)]; if (!A || !B) continue;
    const ta = team(A.team), tb = team(B.team), sa = parseInt(clean(A.score)), sb = parseInt(clean(B.score)); if (!ta || !tb || isNaN(sa) || isNaN(sb)) continue;
    out.push([r, ta, clean(A.seed), sa, tb, clean(B.seed), sb]) }
  /* later rounds often name a team by its city only ("Chicago", "LA Lakers"): give it the full name it has elsewhere in the bracket */
  const full = [...LINKED];
  const fix = n => { if (full.includes(n)) return n; const L = n.replace(/^LA\s+/, "Los Angeles "), hit = full.filter(f => f === L || f.startsWith(L + " ")); return hit.length === 1 ? hit[0] : n };
  for (const x of out) { x[1] = fix(x[1]); x[4] = fix(x[4]) }
  out.sort((a, b) => a[0] - b[0]); return { s: out, rd: names.slice(1) };
}
export async function buildNbaBrackets({ getPack, putPack, log = console.log, upto }) {
  const prev0 = await getPack("p2000_cbb-nbabrk").catch(() => null), prev = prev0 && prev0.v >= 2 ? prev0 : null, S = (prev && prev.s) || {}, RD = (prev && prev.rd) || {}; let reads = 0, bad = [];
  const now = new Date(), last = upto || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  /* four seasons a read (Wikipedia returns several pages' text at once), with retries — one read a season was throttled after three */
  const need = []; for (let y = 1970; y <= last; y++) if (!(S[y] && S[y].length && y < last)) need.push(y);
  for (let k = 0; k < need.length; k += 4) { const Y = need.slice(k, k + 4), titles = Y.map(y => y + " NBA playoffs"); let j = null;
    for (let a = 0; a < 4 && !j; a++) { try { const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join("|"))}`, { headers: WUA }); reads++;
      if (r.ok) j = await r.json(); else { log(`nba brackets: ${r.status}`); await new Promise(z => setTimeout(z, 3000 * (a + 1))) } } catch (e) { await new Promise(z => setTimeout(z, 3000 * (a + 1))) } }
    if (!j) { for (const y of Y) { try { const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(y + " NBA playoffs")}`, { headers: WUA }); reads++; const j2 = await r.json(), p2 = ((j2.query || {}).pages || [])[0], w = p2 && p2.revisions && p2.revisions[0] && p2.revisions[0].slots.main.content, B = w && parseNbaBracket(w); if (B && B.s.length) { S[y] = B.s; RD[y] = B.rd } else bad.push(y + ":" + r.status) } catch (e) { bad.push(y + ":" + e.message) } await new Promise(z => setTimeout(z, 800)) } continue }
    const red = {}; for (const x of (j.query && j.query.redirects) || []) red[x.to] = x.from;
    for (const pg of (j.query && j.query.pages) || []) { const ti = red[pg.title] || pg.title, y = +String(ti).slice(0, 4); let w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content;
      /* a batch can leave a page's text out (it continues in a later read): fetch that one on its own */
      if (!w) try { const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(y + " NBA playoffs")}`, { headers: WUA }); reads++; const j2 = await r.json(), p2 = ((j2.query || {}).pages || [])[0]; w = p2 && p2.revisions && p2.revisions[0] && p2.revisions[0].slots.main.content; await new Promise(z => setTimeout(z, 600)) } catch (e) { }
      const B = w && parseNbaBracket(w); if (B && B.s.length) { S[y] = B.s; RD[y] = B.rd } else bad.push(y) }
    await new Promise(z => setTimeout(z, 1000)) }
  await putPack("p2000_cbb-nbabrk", { v: 2, t: Date.now(), s: S, rd: RD }); log(`nba brackets: ${Object.keys(S).length} seasons, ${reads} Wikipedia reads${bad.length ? `, no bracket: ${bad.join(" ")}` : ""}`); return S;
}
/* Every NBA player's teams, season by season, back to the 1960s (Oct 24 — Sam on Teammate chain: "it only covers seasons since 2008–09 …
   this makes it a non-starter bc people would be frustrated by that"). From Wikipedia: the members of each team's "players" category,
   and each player's infobox (years1 / team1 …: {{nbay|1993|start}}–{{nbay|1998|end}}, [[2003–04 NBA season|2004]], or plain years).
   A player traded during a season is on both teams that season. Teams are folded into franchises (Bullets → Wizards, SuperSonics →
   Thunder …). Pack p2000_cbb-nbacareers: { v: 1, t, p: { name: [[franchise, first season, last season]] } } — seasons by their start year. */
export const NBA_FR = { "Atlanta Hawks": "ATL", "St. Louis Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "New Jersey Nets": "BKN", "New York Nets": "BKN", "Charlotte Hornets": "CHA", "Charlotte Bobcats": "CHA",
  "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET", "Golden State Warriors": "GS", "San Francisco Warriors": "GS", "Philadelphia Warriors": "GS",
  "Houston Rockets": "HOU", "San Diego Rockets": "HOU", "Indiana Pacers": "IND", "Los Angeles Clippers": "LAC", "LA Clippers": "LAC", "San Diego Clippers": "LAC", "Buffalo Braves": "LAC", "Los Angeles Lakers": "LAL", "Minneapolis Lakers": "LAL",
  "Memphis Grizzlies": "MEM", "Vancouver Grizzlies": "MEM", "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NO", "New Orleans Hornets": "NO", "New Orleans/Oklahoma City Hornets": "NO",
  "New York Knicks": "NY", "Oklahoma City Thunder": "OKC", "Seattle SuperSonics": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Syracuse Nationals": "PHI", "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC", "Kansas City Kings": "SAC", "Kansas City-Omaha Kings": "SAC", "Kansas City–Omaha Kings": "SAC", "Cincinnati Royals": "SAC", "Rochester Royals": "SAC", "San Antonio Spurs": "SA", "Toronto Raptors": "TOR",
  "Utah Jazz": "UTAH", "New Orleans Jazz": "UTAH", "Washington Wizards": "WSH", "Washington Bullets": "WSH", "Capital Bullets": "WSH", "Baltimore Bullets": "WSH", "Chicago Zephyrs": "WSH", "Chicago Packers": "WSH" };
export function parseNbaCareer(w, nowStart) {
  const k = String(w).search(/\{\{\s*Infobox basketball/i); if (k < 0) return null; const box = w.slice(k, k + 12000), P = {};
  for (const m of box.matchAll(/\n\s*\|\s*(years|team)(\d+)\s*=\s*([^\n]*)/g)) (P[m[2]] = P[m[2]] || {})[m[1]] = m[3];
  const out = [];
  for (const i of Object.keys(P).sort((a, b) => a - b)) { const { years, team } = P[i]; if (!years || !team) continue;
    const tm = (team.match(/\[\[([^|\]]+)/) || [])[1] || team.replace(/[\[\]']/g, "").trim(), fr = NBA_FR[tm.trim()]; if (!fr) continue;
    /* each year mark: {{nbay|Y|start}} / {{nbay|Y|end}} / {{nbay|Y}} = the season starting Y; [[1993–94 NBA season|1994]] = that season; a plain year */
    const marks = []; for (const m of years.matchAll(/\{\{\s*nbay\s*\|\s*(\d{4})[^}]*\}\}|\[\[(\d{4})[–-]\d{2,4} NBA season[^\]]*\]\]|\b(19|20)(\d{2})\b|present/gi)) {
      if (/present/i.test(m[0])) marks.push({ s: nowStart, plain: 0 }); else if (m[1]) marks.push({ s: +m[1], plain: 0 }); else if (m[2]) marks.push({ s: +m[2], plain: 0 }); else marks.push({ s: +(m[3] + m[4]), plain: 1 }) }
    if (!marks.length) continue; const a = marks[0], b = marks[marks.length - 1];
    /* plain years are calendar years: "1979–1992" is the 1979–80 season through 1991–92 */
    const s0 = a.s, s1 = marks.length === 1 ? a.s : b.plain ? Math.max(s0, b.s - 1) : b.s; out.push([fr, s0, s1]) }
  return out.length ? out : null;
}
export async function buildNbaCareers({ getPack, putPack, log = console.log }) {
  const now = new Date(), nowStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, cats = [...new Set(Object.keys(NBA_FR))].map(t => `Category:${t} players`);
  /* the names first (500 a read, each player once however many teams he played for), then the top of each page — the infobox —
     fifty players a read */
  const P = {}, T = new Set(); let reads = 0; const miss = [];
  const call = async q => { for (let a = 0; a < 4; a++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...q }), { headers: WUA }); reads++; if (r.ok) { const j = await r.json(); if (!j.error) return j; log(`nba careers: ${j.error.code} ${j.error.info}`); return null } } catch (e) { } await new Promise(z => setTimeout(z, 2500 * (a + 1))) } return null };
  for (const cat of cats) { let cont = {}, n = 0;
    for (let g = 0; g < 40; g++) { const j = await call({ action: "query", list: "categorymembers", cmtitle: cat, cmlimit: "500", cmnamespace: "0", ...cont }); if (!j) break;
      for (const m of (j.query && j.query.categorymembers) || []) { T.add(m.title); n++ } if (!j.continue) break; cont = j.continue }
    if (!n) miss.push(cat); await new Promise(z => setTimeout(z, 150)) }
  const titles = [...T]; let sec = true;
  for (let k = 0; k < titles.length; k += 50) { const L = titles.slice(k, k + 50); let cont = {};
    for (let g = 0; g < 20; g++) { let j = await call({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", ...(sec ? { rvsection: "0" } : {}), titles: L.join("|"), ...cont });
      if (!j && sec) { sec = false; j = await call({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: L.join("|"), ...cont }) } if (!j) break;
      for (const pg of (j.query && j.query.pages) || []) { const w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots && pg.revisions[0].slots.main.content; if (!w) continue;
        const C = parseNbaCareer(w, nowStart); if (!C) continue; const nm = String(pg.title).replace(/\s*\([^)]*\)\s*$/, "").trim(); const cur = P[nm] || []; for (const c of C) if (!cur.some(x => x.join() === c.join())) cur.push(c); P[nm] = cur }
      if (!j.continue) break; cont = j.continue }
    await new Promise(z => setTimeout(z, 200)) }
  log(`nba careers: ${titles.length} pages in the team categories${sec ? " (infobox sections)" : " (whole pages)"}`);
  await putPack("p2000_cbb-nbacareers", { v: 1, t: Date.now(), p: P }); log(`nba careers: ${Object.keys(P).length} players, ${reads} Wikipedia reads${miss.length ? ` · nothing from ${miss.length}: ${miss.slice(0, 12).join(", ")}` : ""}`); return P;
}
/* probe (MODE=probe, PROBE=nba-careers-test): why a few famous careers were missing */
export async function run() { const L = ["Larry Bird", "Kobe Bryant", "Scottie Pippen", "Kareem Abdul-Jabbar", "Kevin McHale"], out = {};
  for (const sec of [true, false]) { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", action: "query", prop: "revisions", rvprop: "content", rvslots: "main", ...(sec ? { rvsection: "0" } : {}), titles: L.join("|") }), { headers: WUA });
    const j = await r.json(); out[sec ? "sec" : "full"] = { st: r.status, err: j.error, cont: j.continue, warn: j.warnings, pages: ((j.query || {}).pages || []).map(p => ({ t: p.title, has: !!(p.revisions && p.revisions[0]), len: p.revisions && p.revisions[0] && p.revisions[0].slots ? p.revisions[0].slots.main.content.length : 0, car: p.revisions && p.revisions[0] && p.revisions[0].slots ? parseNbaCareer(p.revisions[0].slots.main.content, 2026) : null })) } }
  const cats = {}; for (const c of ["Category:Boston Celtics players", "Category:Los Angeles Lakers players"]) { const r = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", action: "query", list: "categorymembers", cmtitle: c, cmlimit: "500", cmnamespace: "0" }), { headers: WUA }); const j = await r.json(); const m = (j.query && j.query.categorymembers) || []; cats[c] = { n: m.length, cont: !!j.continue, bird: m.some(x => x.title === "Larry Bird"), kobe: m.some(x => x.title === "Kobe Bryant") } }
  return { ok: true, out, cats } }
