/* "This day in history" — every day of the year, built once (Nov 6 — Sam, 10:46 am: "might as well just run it now. but yea they look
   great"; 3:43 pm: "build away"). The same moments the three sample cards came from (probe thisday), for all 366 days:
     NFL      games (nflverse): big upsets by the closing line, 80+ point games; player game logs 1999 on: 450+ passing yards, 5+ TD
              passes, 200+ rushing or receiving yards, 4+ touchdowns
     college  football (CFBD games + AP poll, 2014 on, via the site's kept CFBD answers): unranked over a top-10 team, top-10 meetings
     NBA and college basketball (our referee files, 2003 on, Eastern dates from p<Y>_cbb-gdate-<lg>): big upsets by the line, huge totals
   Bars lowered after the first run (236 of 366 days had a moment) so spring and summer days get one too: NFL upsets 7+, 75+ points;
   NBA upsets 8+, 260+ points; college basketball upsets 12+, 185+ points. Still the best 14 of each kind a day. A shootout needs both teams scoring (NBA 120+, college 85+ — no 147–39 blowouts).
   Written out, not box scores (Sam, 4:00 pm: "these should be written better not just the boxscore … for the basketball one same written
   out, but we really shouldnt be abbreviating the names of the teams in our featured stat"): each moment carries a headline and a line
   under it with full team names — NFL names by era, college football's mascots and stadiums (CFBD), basketball names, city, ranks,
   overtime and tournament notes from the open sportsdataverse schedule files (GitHub, matched by ESPN game id).
   Writes p2000_thisday { v: 2, at, cols, d: { "MM-DD": [[kind, year, score, headline, line under it, sport], …] } } — the 14 best of each kind a day.
   No reads at ESPN; CFBD's finished seasons come from the proxy's kept answers (x-kept), so a rerun costs next to nothing. The Lab's
   Posts page (/lab/posts.html) picks from it each morning. MODE=thisday (job/build.mjs). */
const KEEP = 14;
/* NFL [place, nickname] by the code the season used */
const NFLN = { ARI: ["Arizona", "Cardinals"], ATL: ["Atlanta", "Falcons"], BAL: ["Baltimore", "Ravens"], BUF: ["Buffalo", "Bills"], CAR: ["Carolina", "Panthers"], CHI: ["Chicago", "Bears"],
  CIN: ["Cincinnati", "Bengals"], CLE: ["Cleveland", "Browns"], DAL: ["Dallas", "Cowboys"], DEN: ["Denver", "Broncos"], DET: ["Detroit", "Lions"], GB: ["Green Bay", "Packers"], HOU: ["Houston", "Texans"],
  IND: ["Indianapolis", "Colts"], JAX: ["Jacksonville", "Jaguars"], JAC: ["Jacksonville", "Jaguars"], KC: ["Kansas City", "Chiefs"], LA: ["Los Angeles", "Rams"], LAR: ["Los Angeles", "Rams"], STL: ["St. Louis", "Rams"],
  LAC: ["Los Angeles", "Chargers"], SD: ["San Diego", "Chargers"], LV: ["Las Vegas", "Raiders"], OAK: ["Oakland", "Raiders"], MIA: ["Miami", "Dolphins"], MIN: ["Minnesota", "Vikings"], NE: ["New England", "Patriots"],
  NO: ["New Orleans", "Saints"], NYG: ["New York", "Giants"], NYJ: ["New York", "Jets"], PHI: ["Philadelphia", "Eagles"], PIT: ["Pittsburgh", "Steelers"], SF: ["San Francisco", "49ers"], SEA: ["Seattle", "Seahawks"],
  TB: ["Tampa Bay", "Buccaneers"], TEN: ["Tennessee", "Titans"], WAS: ["Washington", "Commanders"] };
const nfl = (t, y) => { const n = NFLN[t] || [t, t]; return t === "WAS" && y < 2022 ? ["Washington", y >= 2020 ? "Football Team" : "Washington"] : n };
const nick = (t, y) => { const n = nfl(t, y); return n[1] === "Washington" ? "Washington" : n[1] === "Football Team" ? "Washington Football Team" : "the " + n[1] };
const Nick = (t, y) => { const s = nick(t, y); return s.replace(/^the /, "The ") };
const full = (t, y) => { const n = nfl(t, y); return n[1] === "Washington" ? "Washington" : n[1] === "Football Team" ? "Washington Football Team" : n.join(" ") };
const plur = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const and = (a, n, w1, w2) => n ? `${a}, ${plur(n, w1, w2)}` : a;   /* "17 catches" — no "0 touchdowns" */
const SCHED = (lg, y) => lg === "n" ? `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_schedules/nba_schedule_${y}.csv`
  : `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_mens_college_basketball_schedules/mbb_schedule_${y}.csv`;
function csv(text) { const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c; continue }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); out.push(row); row = []; f = "" } else if (c !== "\r") f += c }
  if (f || row.length) { row.push(f); out.push(row) } return out }
export async function buildThisDay({ site, token, getPack, getIndex, putPack, log = console.log, nowYear = new Date().getUTCFullYear() }) {
  const H = { headers: { Authorization: "Bearer " + token } }; let calls = 0, files = 0;
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() }
    if (r.status === 400 || r.status === 404) return null } catch (e) { } await new Promise(z => setTimeout(z, 2000 * (k + 1))) } return null };
  const D = {}, add = (md, k, y, sc, h, sub, sp) => { (D[md] = D[md] || []).push([k, +y, sc, h, sub, sp]) };
  const ix = (await getIndex()) || {}, part = p => { let b = null; for (const n in ix) { const m = /^p(\d{4})_nfl-(.+)$/.exec(n); if (m && m[2] === p && (b == null || +m[1] > b)) b = +m[1] } return b == null ? null : `p${b}_nfl-${p}` };
  const obj = P => P && P.cols ? (r => Object.fromEntries(P.cols.map((c, i) => [c, r[i]]))) : null;
  const out = { nflGames: 0, nflLogs: 0, cfb: 0, bb: { n: 0, c: 0 }, named: 0 };
  /* NFL games */
  const GP = await getPack(part("games")); const G = {};
  if (GP) { const o = obj(GP); for (const r of GP.g) { const g = o(r); G[g.id] = g; const md = String(g.gameday || g.date || "").slice(5, 10); if (!md || g.homeScore == null) continue; out.nflGames++;
    const y = +String(g.gameday || g.date).slice(0, 4), S = g.season || y, m = g.homeScore - g.awayScore, sp = g.spread, hw = m > 0, W = hw ? g.home : g.away, L = hw ? g.away : g.home, ws = Math.max(g.homeScore, g.awayScore), ls = Math.min(g.homeScore, g.awayScore);
    const score = `${full(W, S)} ${ws}, ${full(L, S)} ${ls}`, where = hw ? `at home` : `in ${nfl(g.home, S)[0]}`;
    if (sp != null && m !== 0) { const dogHome = sp < 0, won = dogHome ? m > 0 : m < 0; if (won && Math.abs(sp) >= 7) add(md, "nflupset", y, Math.abs(sp), `${Nick(W, S)} stun ${nick(L, S)} as ${Math.abs(sp)}-point underdogs`, `${score} ${where}.`, "nfl") }
    if (g.homeScore + g.awayScore >= 75 && m !== 0) add(md, "nflpts", y, g.homeScore + g.awayScore, `${Nick(W, S)} outlast ${nick(L, S)} in a ${g.homeScore + g.awayScore}-point shootout`, `${score} ${where}.`, "nfl") } }
  /* NFL player games */
  const PP = await getPack(part("players")), PL = {}; if (PP && PP.p) { const ni = PP.cols.indexOf("name"); for (const g in PP.p) PL[g] = PP.p[g][ni] }
  for (let S = 1999; S < nowYear; S++) { const L = await getPack(part("logs-" + S)).catch(() => null); if (!L || !L.p) continue; const o = obj(L);
    for (const gs in L.p) for (const row of L.p[gs]) { const r = o(row), g = G[r.game]; if (!g) continue; const md = String(g.gameday || g.date || "").slice(5, 10); out.nflLogs++;
      const nm = PL[gs] || gs, tm = r.team, home = tm === g.home, op = home ? g.away : g.home, ts = home ? g.homeScore : g.awayScore, os = home ? g.awayScore : g.homeScore, y = +String(g.gameday || g.date).slice(0, 4);
      const res = ts > os ? `in a ${ts}–${os} win over ${nick(op, S)}` : ts < os ? `in a ${os}–${ts} loss to ${nick(op, S)}` : `in a ${ts}–${os} tie with ${nick(op, S)}`, at = home ? "" : ` in ${nfl(op, S)[0]}`;
      if ((r.pyd || 0) >= 450) add(md, "pyd", y, r.pyd, `${nm} throws for ${r.pyd} yards`, `${and(`${r.cmp} of ${r.att}`, r.ptd, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.ptd || 0) >= 5) add(md, "ptd", y, r.ptd, `${nm} throws ${r.ptd} touchdown passes`, `${r.pyd} yards for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.ryd || 0) >= 200) add(md, "ryd", y, r.ryd, `${nm} runs for ${r.ryd} yards`, `${and(`${r.car} carries`, r.rtd, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.yds || 0) >= 200) add(md, "recyd", y, r.yds, `${nm} piles up ${r.yds} receiving yards`, `${and(`${r.rec} catches`, r.td, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if (((r.rtd || 0) + (r.td || 0)) >= 4) add(md, "td", y, r.rtd + r.td, `${nm} scores ${r.rtd + r.td} touchdowns`, `For ${nick(tm, S)} ${res}${at}.`, "nfl") } }
  /* college football: games + AP poll + mascots, Eastern dates */
  const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", month: "2-digit", day: "2-digit" });
  const masc = {}; for (const t of (await cf("/teams")) || []) masc[t.school] = t.mascot;
  for (let y = 2014; y < nowYear; y++) { const Gc = (await cf(`/games?year=${y}&seasonType=regular&classification=fbs`)) || [], R = (await cf(`/rankings?year=${y}&seasonType=regular`)) || [], rk = {};
    for (const w of R) for (const p of w.polls || []) if (/AP/i.test(p.poll)) for (const r of p.ranks || []) rk[w.week + "|" + r.school] = r.rank;
    for (const g of Gc) { const hp = g.homePoints ?? g.home_points, ap = g.awayPoints ?? g.away_points, ht = g.homeTeam ?? g.home_team, at = g.awayTeam ?? g.away_team, st = g.startDate ?? g.start_date;
      if (hp == null || ap == null || !st || hp === ap) continue; const md = ET.format(new Date(st)).replace(/(\d\d)\D(\d\d)/, "$1-$2"); out.cfb++;
      const hr = rk[g.week + "|" + ht], ar = rk[g.week + "|" + at], hw = hp > ap, W = hw ? ht : at, Lr = hw ? ar : hr, Wr = hw ? hr : ar, L = hw ? at : ht, ws = Math.max(hp, ap), ls = Math.min(hp, ap);
      const ot = ((g.homeLineScores || g.home_line_scores || []).length > 4) ? " in overtime" : "", ven = g.venue ? ` at ${g.venue}` : "", neu = g.neutralSite || g.neutral_site;
      const sub = `${W}${masc[W] ? " " + masc[W] : ""} ${ws}, ${L}${masc[L] ? " " + masc[L] : ""} ${ls}${ot}${ven}.`;
      if (Lr && Lr <= 10 && !Wr) add(md, "cfbupset", y, 11 - Lr, `Unranked ${W} ${neu || hw ? "knocks off" : "goes on the road and beats"} No. ${Lr} ${L}`, sub, "cfb");
      if (hr && ar && hr <= 10 && ar <= 10) add(md, "cfbtop10", y, 20 - hr - ar, `No. ${Wr} ${W} beats No. ${Lr} ${L}${ot}`, sub, "cfb") } }
  /* basketball: referee files (scores, lines), Eastern dates, names from the schedule files */
  for (const lg of ["n", "c"]) for (let y = 2003; y <= nowYear + 1; y++) { const P = await getPack(`p${y}_cbb-refraw-${lg}`).catch(() => null); if (!P || !P.g) continue;
    const GD = (await getPack(`p${y}_cbb-gdate-${lg}`).catch(() => null)) || { g: {} }, o = obj(P), NM = {};
    try { const r = await fetch(SCHED(lg, y), { redirect: "follow" }); files++; if (r.ok) { const R = csv(await r.text()), Hh = R[0], c = n => Hh.indexOf(n);
      const I = { id: c("id"), hl: c("home_location"), hn: c("home_name"), al: c("away_location"), an: c("away_name"), city: c("venue_address_city"), hr: c("home_current_rank"), ar: c("away_current_rank"), note: c("notes_headline"), per: c("status_period"), reg: c("format_regulation_periods"), neu: c("neutral_site") };
      for (const x of R.slice(1)) if (x[I.id] && P.g[x[I.id]]) NM[x[I.id]] = { hl: x[I.hl], hn: x[I.hn], al: x[I.al], an: x[I.an], city: x[I.city], hr: +x[I.hr] || 0, ar: +x[I.ar] || 0, note: x[I.note] || "", ot: +x[I.per] > (+x[I.reg] || (lg === "n" ? 4 : 2)), neu: /true/i.test(x[I.neu] || "") } } } catch (e) { }
    for (const [id, row] of Object.entries(P.g)) { const x = o(row); if (x.hs == null || x.as == null || x.hs === x.as) continue; const dt = GD.g[id] || String(x.date || "").slice(0, 10), md = dt.slice(5, 10), yy = dt.slice(0, 4); if (!md) continue; out.bb[lg]++;
      const N = NM[id]; if (!N || !N.hl) continue; out.named++;   /* no names, no card: we don't feature abbreviations */
      const sp = lg === "n" ? "nba" : "cbb", hw = x.hs > x.as, rk = r => r > 0 && r <= 25 && lg === "c" ? (/Championship/.test(N.note) && r <= 16 ? `No. ${r} seed ` : `No. ${r} `) : "";   /* NCAA tournament: seeds */
      const T = h => h ? { loc: N.hl, nm: N.hn, r: N.hr, s: x.hs } : { loc: N.al, nm: N.an, r: N.ar, s: x.as }, W = T(hw), L = T(!hw);
      const short = t => lg === "n" ? "the " + t.nm : t.loc, Short = t => lg === "n" ? "The " + t.nm : t.loc;
      const tail = `${N.ot ? " in overtime" : ""}${N.neu ? (N.city ? ` in ${N.city}` : "") : hw ? " at home" : N.city ? ` in ${N.city}` : " on the road"}${N.note ? ` · ${N.note}` : ""}`;
      const sub = `${W.loc} ${W.nm} ${W.s}, ${L.loc} ${L.nm} ${L.s}${tail}.`;
      if (x.spread != null) { const dogHome = x.spread > 0, won = dogHome ? hw : !hw; if (won && Math.abs(x.spread) >= (lg === "n" ? 8 : 12)) add(md, lg + "bbupset", yy, Math.abs(x.spread), `${rk(W.r)}${Short(W)} ${lg === "n" ? "stun" : "stuns"} ${rk(L.r)}${short(L)} as ${Math.abs(x.spread)}-point underdogs`, sub, sp) }
      if (x.hs + x.as >= (lg === "n" ? 260 : 185) && Math.min(x.hs, x.as) >= (lg === "n" ? 120 : 85)) add(md, lg + "bbpts", yy, x.hs + x.as, `${rk(W.r)}${Short(W)} ${lg === "n" ? "outlast" : "outlasts"} ${rk(L.r)}${short(L)} in a ${x.hs + x.as}-point shootout`, sub, sp) } }
  /* the best of each kind a day */
  let n = 0; for (const md in D) { const by = {}; for (const r of D[md]) (by[r[0]] = by[r[0]] || []).push(r);
    D[md] = Object.values(by).flatMap(L => L.sort((a, b) => b[2] - a[2]).slice(0, KEEP)); n += D[md].length }
  const P = { v: 2, at: Date.now(), cols: ["kind", "year", "score", "headline", "line", "sport"], d: D, src: "nflverse · CFBD (games, AP poll, mascots) · our basketball referee files · sportsdataverse schedules (names)" };
  const r = await putPack("p2000_thisday", P);
  const msg = `This day: ${Object.keys(D).length} days, ${n} moments · from ${out.nflGames} NFL games, ${out.nflLogs} NFL player games, ${out.cfb} college football games, ${out.bb.n} NBA + ${out.bb.c} college basketball games (${out.named} named) · ${calls} CFBD calls, ${files} schedule files${r && r.bytes ? ` · ${Math.round(r.bytes / 1024)} KB` : ""}`;
  log(msg); return { msg, days: Object.keys(D).length, n };
}
