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
  TB: ["Tampa Bay", "Buccaneers"], TEN: ["Tennessee", "Titans"], WAS: ["Washington", "Commanders"], WSH: ["Washington", "Commanders"] };
const nfl = (t, y) => { const n = NFLN[t] || [t, t]; return (t === "WAS" || t === "WSH") && y < 2022 ? ["Washington", y >= 2020 ? "Football Team" : "Washington"] : n };
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
  /* NFL games — Sam, 5:02 pm: "what was jacksonville's record when they beat the bills. was it actually a big deal?": an upset needs the
     records to back it (the winner's record well below the loser's, both with 3+ games), and the records are in the headline; the Super
     Bowl winner each February */
  const GP = await getPack(part("games")); const G = {}, REC = {};
  const SBN = y => { const n = y - 1966, R = [["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90], ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]]; let o = "", k = n; for (const [l, v] of R) while (k >= v) { o += l; k -= v } return n === 50 ? "50" : o };
  if (GP) { const o = obj(GP), all = GP.g.map(o).sort((a, b) => String(a.date).localeCompare(String(b.date))), rec = {};
    const rs = (S, t) => { const r = rec[S + t] || [0, 0, 0]; return r }, fmt = r => r[2] ? `${r[0]}–${r[1]}–${r[2]}` : `${r[0]}–${r[1]}`, pct = r => (r[0] + r[2] / 2) / Math.max(1, r[0] + r[1] + r[2]);
    const lastPost = {}; for (const g of all) if (g.type !== "REG" && g.homeScore != null && (!lastPost[g.season] || g.date > lastPost[g.season].date)) lastPost[g.season] = g;
    /* how it ended (Sam, 11:29 pm: "nd beat clemson then they both made and lost in the CFP semi-finals"; 11:35 pm: "a good switchup if its a
       good storyline"): each team's playoff finish, added to a moment's line only when one of the two reached its conference title game */
    const FIN = {}, RND = { WC: 1, DIV: 2, CON: 3, SB: 4 };
    for (const g of all) { if (!(g.type in RND) || g.homeScore == null || g.homeScore === g.awayScore) continue; const S = g.season, hw = g.homeScore > g.awayScore, W = hw ? g.home : g.away, L = hw ? g.away : g.home;
      FIN[S + W] = g.type === "SB" ? { r: 5, y: +String(g.date).slice(0, 4) } : (FIN[S + W] && FIN[S + W].r > RND[g.type] ? FIN[S + W] : { r: RND[g.type] }); FIN[S + L] = { r: RND[g.type], lost: 1, y: +String(g.date).slice(0, 4) } }
    const finTxt = (S, t, both) => { const f = FIN[S + t]; if (!f) return null; return f.r === 5 ? `won Super Bowl ${SBN(f.y)}` : f.r === 4 ? `lost Super Bowl ${SBN(f.y)}` : f.r === 3 ? "lost in the conference championship" : f.r === 2 ? "lost in the divisional round" : "lost in the wild-card round" };
    const story = (S, W, L) => { const a = FIN[S + W], b = FIN[S + L]; if (!((a && a.r >= 3) || (b && b.r >= 3))) return "";
      const ta = finTxt(S, W), tb = finTxt(S, L); if (ta && ta === tb) return ` Both went on to ${ta.replace(/^lost/, "lose").replace(/^won/, "win")}.`;
      const p = [ta ? `${Nick(W, S)} went on to ${ta.replace(/^lost/, "lose").replace(/^won/, "win")}` : null, tb ? `${ta ? nick(L, S) : Nick(L, S)} ${ta ? "" : "went on to "}${tb.replace(/^lost/, ta ? "lost" : "lose").replace(/^won/, ta ? "won" : "win")}` : (a && a.r >= 3 ? `${nick(L, S)} missed the playoffs` : null)].filter(Boolean);
      return " " + p.join("; ") + "." };
    for (const g of all) { G[g.id] = g; const md = String(g.date || "").slice(5, 10); if (!md || g.homeScore == null) continue; out.nflGames++;
      const y = +String(g.date).slice(0, 4), S = g.season || y, m = g.homeScore - g.awayScore, sp = g.spread, hw = m > 0, W = hw ? g.home : g.away, L = hw ? g.away : g.home, ws = Math.max(g.homeScore, g.awayScore), ls = Math.min(g.homeScore, g.awayScore);
      const score = `${full(W, S)} ${ws}, ${full(L, S)} ${ls}`, where = g.neutral || g.type === "SB" ? (g.stadium ? `at ${g.stadium}` : "") : hw ? `at home` : `in ${nfl(g.home, S)[0]}`, rw = rs(S, W), rl = rs(S, L);
      if (g.type === "REG" && m !== 0) { const gw = rw[0] + rw[1] + rw[2], gl = rl[0] + rl[1] + rl[2], gap = pct(rl) - pct(rw);
        if (gw >= 3 && gl >= 3 && gap >= .3 && pct(rl) >= .6) add(md, "nflupset", y, Math.round(gap * 20 + Math.abs(sp || 0)), `The ${fmt(rw)} ${nfl(W, S)[1]} beat the ${fmt(rl)} ${nfl(L, S)[1]}`.replace(/the \d+–\d+(–\d+)? Washington\b/g, m => m.replace("the ", "")), `${score}${where ? " " + where : ""}${sp != null && ((sp < 0) === hw) && Math.abs(sp) >= 3 ? `, as ${Math.abs(sp)}-point underdogs` : ""}.${story(S, W, L)}`, "nfl") }
      if (g.homeScore + g.awayScore >= 75 && m !== 0) add(md, "nflpts", y, g.homeScore + g.awayScore, `${Nick(W, S)} outlast ${nick(L, S)} ${ws}–${ls}`, `${score}${where ? " " + where : ""} — ${g.homeScore + g.awayScore} points in all.${g.type === "REG" ? story(S, W, L) : ""}`, "nfl");
      if (lastPost[S] === g && g.type === "SB") add(md, "sb", y, 100, `${Nick(W, S)} win Super Bowl ${SBN(y)}`, `${score}${where ? " " + where : ""}.`, "nfl");
      if (g.type === "REG") { const r1 = rec[S + g.home] = rec[S + g.home] || [0, 0, 0], r2 = rec[S + g.away] = rec[S + g.away] || [0, 0, 0]; if (m > 0) { r1[0]++; r2[1]++ } else if (m < 0) { r2[0]++; r1[1]++ } else { r1[2]++; r2[2]++ } } } }
  /* NFL coaches' milestones (Sam, 11:35 pm: "yes add the coaching milestone data as well"): regular-season wins from nflverse's games
     file (head coach for each side, 1999 on). Only coaches whose whole career is in the file count — anyone on a sideline in 1999 is left
     out, except Andy Reid (first season 1999) — so "his 200th" is never short of the earlier years. */
  try { const r = await fetch("https://github.com/nflverse/nfldata/raw/master/data/games.csv", { redirect: "follow" }); files++;
    if (r.ok) { const R = csv(await r.text()), Hh = R[0], c = n => Hh.indexOf(n), I = { s: c("season"), t: c("game_type"), d: c("gameday"), h: c("home_team"), a: c("away_team"), hs: c("home_score"), as: c("away_score"), hc: c("home_coach"), ac: c("away_coach") };
      const rows = R.slice(1).filter(x => x[I.hs] !== "" && x[I.hs] != null && x[I.d]).sort((x, y) => String(x[I.d]).localeCompare(String(y[I.d])));
      const in99 = new Set(); for (const x of rows) if (+x[I.s] === 1999) { in99.add(x[I.hc]); in99.add(x[I.ac]) } in99.delete("Andy Reid");
      /* head coaches with regular-season wins before 1999 who weren't on a sideline in 1999: their earlier wins added (Belichick, Cleveland
         1991–95: 36; Schottenheimer, Cleveland and Kansas City 1984–98: 145) */
      const W = { "Bill Belichick": 36, "Marty Schottenheimer": 145 }, MS = new Set([100, 150, 200, 250, 300, 350]);
      for (const x of rows) { if (x[I.t] !== "REG") continue; const hs = +x[I.hs], as = +x[I.as]; if (hs === as) continue; const hw = hs > as, co = hw ? x[I.hc] : x[I.ac], tm = hw ? x[I.h] : x[I.a], op = hw ? x[I.a] : x[I.h], S = +x[I.s];
        if (!co || in99.has(co)) continue; W[co] = (W[co] || 0) + 1;
        if (MS.has(W[co])) add(String(x[I.d]).slice(5, 10), "nflcoach", +String(x[I.d]).slice(0, 4), W[co], `${co} wins his ${W[co]}th regular-season game`, `${full(tm, S)} ${Math.max(hs, as)}, ${full(op, S)} ${Math.min(hs, as)}${hw ? " at home" : ` in ${nfl(op, S)[0]}`}.`, "nfl") } } } catch (e) { log("this day: NFL coaches — " + e.message) }
  /* NFL player games */
  const FPS = {};   /* season|name → fantasy points (PPR, regular season) — for the NFL trades below */
  const PP = await getPack(part("players")), PL = {}; if (PP && PP.p) { const ni = PP.cols.indexOf("name"); for (const g in PP.p) PL[g] = PP.p[g][ni] }
  for (let S = 1999; S < nowYear; S++) { const L = await getPack(part("logs-" + S)).catch(() => null); if (!L || !L.p) continue; const o = obj(L);
    for (const gs in L.p) for (const row of L.p[gs]) { const r = o(row), g = G[r.game]; if (!g) continue; if (g.type === "REG" && PL[gs]) FPS[S + "|" + PL[gs]] = (FPS[S + "|" + PL[gs]] || 0) + (+r.fp || 0); const md = String(g.gameday || g.date || "").slice(5, 10); out.nflLogs++;
      const nm = PL[gs] || gs, tm = r.team, home = tm === g.home, op = home ? g.away : g.home, ts = home ? g.homeScore : g.awayScore, os = home ? g.awayScore : g.homeScore, y = +String(g.gameday || g.date).slice(0, 4);
      const res = ts > os ? `in a ${ts}–${os} win over ${nick(op, S)}` : ts < os ? `in a ${os}–${ts} loss to ${nick(op, S)}` : `in a ${ts}–${os} tie with ${nick(op, S)}`, at = home ? "" : ` in ${nfl(op, S)[0]}`;
      if ((r.pyd || 0) >= 450) add(md, "pyd", y, r.pyd, `${nm} throws for ${r.pyd} yards against ${nick(op, S)}`, `${and(`${r.cmp} of ${r.att}`, r.ptd, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.ptd || 0) >= 5) add(md, "ptd", y, r.ptd, `${nm} throws ${r.ptd} touchdown passes against ${nick(op, S)}`, `${r.pyd} yards for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.ryd || 0) >= 200) add(md, "ryd", y, r.ryd, `${nm} runs for ${r.ryd} yards against ${nick(op, S)}`, `${and(`${r.car} carries`, r.rtd, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if ((r.yds || 0) >= 200) add(md, "recyd", y, r.yds, `${nm} piles up ${r.yds} receiving yards against ${nick(op, S)}`, `${and(`${r.rec} catches`, r.td, "touchdown", "touchdowns")} for ${nick(tm, S)} ${res}${at}.`, "nfl");
      if (((r.rtd || 0) + (r.td || 0)) >= 4) add(md, "td", y, r.rtd + r.td, `${nm} scores ${r.rtd + r.td} touchdowns against ${nick(op, S)}`, `For ${nick(tm, S)} ${res}${at}.`, "nfl") } }
  /* college football: games + AP poll + mascots, Eastern dates */
  const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", month: "2-digit", day: "2-digit" });
  const masc = {}; for (const t of (await cf("/teams")) || []) masc[t.school] = t.mascot;
  /* college coaches' milestones (Sam, 11:35 pm): every head coach's seasons from CFBD (one call), so career wins before each season are
     known back to the start; the game that brought the 100th, 150th … win is found in that season's games (2014 on) */
  const CO = (await cf("/coaches?minYear=1950")) || [], CSEA = {};   /* school|year → [{name, before}] */
  for (const co of CO) { const nm = `${co.firstName || co.first_name || ""} ${co.lastName || co.last_name || ""}`.trim(); let w = 0;
    for (const se of (co.seasons || []).slice().sort((a, b) => a.year - b.year)) { (CSEA[se.school + "|" + se.year] = CSEA[se.school + "|" + se.year] || []).push({ nm, before: w, n: se.games || 0 }); w += se.wins || 0 } }
  const CMS = new Set([100, 150, 200, 250, 300, 350, 400]);
  for (let y = 2014; y < nowYear; y++) { const Gc = (await cf(`/games?year=${y}&seasonType=regular&classification=fbs`)) || [], R = (await cf(`/rankings?year=${y}&seasonType=regular`)) || [], rk = {};
    /* how it ended: the College Football Playoff from the postseason games' notes */
    const PO = (await cf(`/games?year=${y}&seasonType=postseason&classification=fbs`)) || [], CFP = {};
    for (const g of PO) { const nt = String(g.notes || ""), hp = g.homePoints ?? g.home_points, ap = g.awayPoints ?? g.away_points, ht = g.homeTeam ?? g.home_team, at = g.awayTeam ?? g.away_team; if (hp == null || ap == null || hp === ap || !/playoff|\bCFP\b|national championship/i.test(nt)) continue;
      const r = /national championship/i.test(nt) ? 4 : /semifinal/i.test(nt) ? 3 : /quarterfinal/i.test(nt) ? 2 : 1, W = hp > ap ? ht : at, L = hp > ap ? at : ht;
      CFP[L] = { r, lost: 1 }; CFP[W] = r === 4 ? { r: 5 } : (CFP[W] && CFP[W].r > r ? CFP[W] : { r }) }
    const cfpTxt = t => { const f = CFP[t]; if (!f) return null; return f.r === 5 ? "won the national championship" : f.r === 4 ? "lost in the national championship game" : f.r === 3 ? "lost in the CFP semifinals" : f.r === 2 ? "lost in the CFP quarterfinals" : "lost in the CFP first round" };
    const cstory = (W, L) => { const ta = cfpTxt(W), tb = cfpTxt(L); if (!ta && !tb) return ""; const go = t => t.replace(/^lost/, "lose").replace(/^won/, "win");
      if (ta && ta === tb) return ` Both went on to ${go(ta)}.`;
      if (ta && tb) return ` ${W} went on to ${go(ta)}; ${L} ${tb}.`;
      return ta ? ` ${W} went on to ${go(ta)}.` : ` ${L} still made the playoff and went on to ${go(tb)}.` };
    /* coach milestones this season: every game (regular and bowls) in date order */
    const WINS = {}; for (const g of [...Gc, ...PO].sort((a, b) => String(a.startDate ?? a.start_date).localeCompare(String(b.startDate ?? b.start_date)))) {
      const hp = g.homePoints ?? g.home_points, ap = g.awayPoints ?? g.away_points, ht = g.homeTeam ?? g.home_team, at = g.awayTeam ?? g.away_team, st = g.startDate ?? g.start_date; if (hp == null || ap == null || hp === ap || !st) continue;
      const W = hp > ap ? ht : at, L = hp > ap ? at : ht, C = (CSEA[W + "|" + y] || []).filter(z => z.n > 0); if (C.length !== 1) continue;   /* one head coach that season (no interim splits) */
      const c = C[0], n = c.before + (WINS[W] = (WINS[W] || 0) + 1);
      if (CMS.has(n)) add(ET.format(new Date(st)).replace(/(\d\d)\D(\d\d)/, "$1-$2"), "cfbcoach", y, n, `${c.nm} wins his ${n}th game as a head coach`, `${W}${masc[W] ? " " + masc[W] : ""} ${Math.max(hp, ap)}, ${L}${masc[L] ? " " + masc[L] : ""} ${Math.min(hp, ap)}.`, "cfb") }
    for (const w of R) for (const p of w.polls || []) if (/AP/i.test(p.poll)) for (const r of p.ranks || []) rk[w.week + "|" + r.school] = r.rank;
    for (const g of Gc) { const hp = g.homePoints ?? g.home_points, ap = g.awayPoints ?? g.away_points, ht = g.homeTeam ?? g.home_team, at = g.awayTeam ?? g.away_team, st = g.startDate ?? g.start_date;
      if (hp == null || ap == null || !st || hp === ap) continue; const md = ET.format(new Date(st)).replace(/(\d\d)\D(\d\d)/, "$1-$2"); out.cfb++;
      const hr = rk[g.week + "|" + ht], ar = rk[g.week + "|" + at], hw = hp > ap, W = hw ? ht : at, Lr = hw ? ar : hr, Wr = hw ? hr : ar, L = hw ? at : ht, ws = Math.max(hp, ap), ls = Math.min(hp, ap);
      const ot = ((g.homeLineScores || g.home_line_scores || []).length > 4) ? " in overtime" : "", ven = g.venue ? ` at ${g.venue}` : "", neu = g.neutralSite || g.neutral_site;
      const sub = `${W}${masc[W] ? " " + masc[W] : ""} ${ws}, ${L}${masc[L] ? " " + masc[L] : ""} ${ls}${ot}${ven}.`;
      if (Lr && Lr <= 10 && !Wr) add(md, "cfbupset", y, 11 - Lr, `Unranked ${W} ${neu || hw ? "knocks off" : "goes on the road and beats"} No. ${Lr} ${L}`, sub + cstory(W, L), "cfb");
      if (hr && ar && hr <= 10 && ar <= 10) add(md, "cfbtop10", y, 20 - hr - ar, `No. ${Wr} ${W} beats No. ${Lr} ${L}${ot}`, sub + cstory(W, L), "cfb") } }
  /* basketball: referee files (scores, lines), Eastern dates, names from the schedule files. Sam, 5:02 pm: NBA upsets by the line are
     "a little sketch … we don't know what players rested that night" — an NBA upset now needs a bad team beating a good one (both 15+ games
     in, .350 or worse over .650 or better) with both records in the headline; shootouts carry the final score; the title clinchers (NBA
     Finals, the national championship) are their own moments. College upsets by the line stay. */
  const ETD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const lg of ["n", "c"]) for (let y = 2003; y <= nowYear + 1; y++) { const P = await getPack(`p${y}_cbb-refraw-${lg}`).catch(() => null); if (!P || !P.g) continue;
    const GD = (await getPack(`p${y}_cbb-gdate-${lg}`).catch(() => null)) || { g: {} }, o = obj(P), NM = {};
    try { const r = await fetch(SCHED(lg, y), { redirect: "follow" }); files++; if (r.ok) { const R = csv(await r.text()), Hh = R[0], c = n => Hh.indexOf(n);
      const I = { id: c("id"), hl: c("home_location"), hn: c("home_name"), al: c("away_location"), an: c("away_name"), city: c("venue_address_city"), hr: c("home_current_rank"), ar: c("away_current_rank"), note: c("notes_headline"), per: c("status_period"), reg: c("format_regulation_periods"), neu: c("neutral_site"), st: c("season_type"), hid: c("home_id"), aid: c("away_id") };
      for (const x of R.slice(1)) if (x[I.id] && P.g[x[I.id]]) NM[x[I.id]] = { hl: x[I.hl], hn: x[I.hn], al: x[I.al], an: x[I.an], city: x[I.city], hr: +x[I.hr] || 0, ar: +x[I.ar] || 0, note: x[I.note] || "", ot: +x[I.per] > (+x[I.reg] || (lg === "n" ? 4 : 2)), neu: /true/i.test(x[I.neu] || ""), st: +x[I.st] || 2, hid: x[I.hid], aid: x[I.aid] } } } catch (e) { }
    const rows = []; for (const [id, row] of Object.entries(P.g)) { const x = o(row); if (x.hs == null || x.as == null || x.hs === x.as) continue; const dt = GD.g[id] || String(x.date || "").slice(0, 10); if (!dt) continue; rows.push([dt, id, x]) }
    rows.sort((a, b) => a[0].localeCompare(b[0])); const rec = {}, fin = {};
    for (const [dt, id, x] of rows) { const md = dt.slice(5, 10), yy = dt.slice(0, 4); out.bb[lg]++;
      const N = NM[id]; if (!N || !N.hl) continue; out.named++;   /* no names, no card: we don't feature abbreviations */
      const sp = lg === "n" ? "nba" : "cbb", hw = x.hs > x.as, rk = r => r > 0 && r <= 25 && lg === "c" ? (/Championship/.test(N.note) && r <= 16 ? `No. ${r} seed ` : `No. ${r} `) : "";   /* NCAA tournament: seeds */
      const T = h => h ? { loc: N.hl, nm: N.hn, r: N.hr, s: x.hs, id: N.hid } : { loc: N.al, nm: N.an, r: N.ar, s: x.as, id: N.aid }, W = T(hw), L = T(!hw);
      const short = t => lg === "n" ? "the " + t.nm : t.loc, Short = t => lg === "n" ? "The " + t.nm : t.loc;
      const tail = `${N.ot ? " in overtime" : ""}${N.neu ? (N.city ? ` in ${N.city}` : "") : hw ? " at home" : N.city ? ` in ${N.city}` : " on the road"}${N.note ? ` · ${N.note}` : ""}`;
      const sub = `${W.loc} ${W.nm} ${W.s}, ${L.loc} ${L.nm} ${L.s}${tail}.`, RW = rec[W.id] || [0, 0], RL = rec[L.id] || [0, 0], pc = r => r[0] / Math.max(1, r[0] + r[1]);
      if (lg === "n") { if (N.st === 2 && RW[0] + RW[1] >= 15 && RL[0] + RL[1] >= 15 && pc(RW) <= .35 && pc(RL) >= .65) add(md, "nbbupset", yy, Math.round((pc(RL) - pc(RW)) * 40), `The ${RW[0]}–${RW[1]} ${W.nm} beat the ${RL[0]}–${RL[1]} ${L.nm}`, sub, sp) }
      else if (x.spread != null) { const dogHome = x.spread > 0, won = dogHome ? hw : !hw; if (won && Math.abs(x.spread) >= 12) add(md, "cbbupset", yy, Math.abs(x.spread), `${rk(W.r)}${W.loc} stuns ${rk(L.r)}${L.loc} as ${Math.abs(x.spread)}-point underdogs`, sub, sp) }
      if (x.hs + x.as >= (lg === "n" ? 260 : 185) && Math.min(x.hs, x.as) >= (lg === "n" ? 120 : 85)) add(md, lg + "bbpts", yy, x.hs + x.as, `${rk(W.r)}${Short(W)} ${lg === "n" ? "outlast" : "outlasts"} ${rk(L.r)}${short(L)} ${W.s}–${L.s}${N.ot ? " in overtime" : ""}`, `${sub.replace(/\.$/, "")} — ${x.hs + x.as} points in all.`, sp);
      /* titles */
      if (lg === "n" && /^NBA FINALS/i.test(N.note)) { const k = [W.id, L.id].sort().join("|"), F = fin[k] = fin[k] || {}; F[W.id] = (F[W.id] || 0) + 1;
        if (F[W.id] === 4) { const lw = F[L.id] || 0, gm = (N.note.match(/GAME (\d)/i) || [])[1]; add(md, "nbatitle", yy, 100, `The ${W.nm} win the NBA championship`, `${W.loc} ${W.nm} ${W.s}, ${L.loc} ${L.nm} ${L.s}${N.ot ? " in overtime" : ""} in Game ${gm || 4 + lw} — the series 4–${lw}.`, sp) } }
      if (lg === "c" && /National Championship/i.test(N.note)) add(md, "cbbtitle", yy, 100, `${W.loc} wins the national championship`, `${W.loc} ${W.nm} ${W.s}, ${L.loc} ${L.nm} ${L.s}${N.ot ? " in overtime" : ""}${N.city ? ` in ${N.city}` : ""}.`, sp);
      if (N.st === 2) { const a = rec[W.id] = rec[W.id] || [0, 0], b = rec[L.id] = rec[L.id] || [0, 0]; a[0]++; b[1]++ } } }
  /* NBA player feats (Sam: "i like player feats"): the open sportsdataverse player box scores, 2003 on — 50+ points, 20+ assists, 25+
     rebounds, 10+ threes, a 30-point triple-double */
  const PPG = {};   /* season|name → [points, games], regular season — for the trades below */
  for (let y = 2003; y <= nowYear; y++) { let R = null; try { const r = await fetch(`https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_player_boxscores/player_box_${y}.csv`, { redirect: "follow" }); files++; if (r.ok) R = csv(await r.text()) } catch (e) { } if (!R) continue;
    const Hh = R[0], c = n => Hh.indexOf(n), I = { d: c("game_date"), nm: c("athlete_display_name"), tm: c("team_name"), tl: c("team_location"), ot: c("opponent_team_name"), ol: c("opponent_team_location"), ts: c("team_score"), os: c("opponent_team_score"), ha: c("home_away"), pts: c("points"), reb: c("rebounds"), ast: c("assists"), fgm: c("field_goals_made"), fga: c("field_goals_attempted"), tpm: c("three_point_field_goals_made"), st: c("season_type") };
    for (const x of R.slice(1)) { const pts = +x[I.pts] || 0, reb = +x[I.reb] || 0, ast = +x[I.ast] || 0, tpm = +x[I.tpm] || 0; if (+x[I.st] === 2 && x[I.nm]) { const k = y + '|' + x[I.nm], o = PPG[k] = PPG[k] || [0, 0]; if (x[I.fga] !== '' || pts) { o[0] += pts; o[1]++ } } if (pts < 50 && ast < 20 && reb < 25 && tpm < 10 && !(pts >= 30 && reb >= 10 && ast >= 10)) continue;
      const dt = String(x[I.d] || "").slice(0, 10); if (!dt) continue; const md = dt.slice(5, 10), yy = dt.slice(0, 4), ts = +x[I.ts], os = +x[I.os], home = x[I.ha] === "home", po = +x[I.st] === 3 ? " in the playoffs" : "";
      const res = ts > os ? `in a ${ts}–${os} win over the ${x[I.ot]}` : `in a ${os}–${ts} loss to the ${x[I.ot]}`, at = home ? "" : ` in ${x[I.ol]}`, line = `${pts} points (${x[I.fgm]} of ${x[I.fga]}${tpm ? `, ${tpm} three${tpm === 1 ? "" : "s"}` : ""}), ${reb} rebounds, ${ast} assists for the ${x[I.tm]} ${res}${at}${po}.`, nm = x[I.nm];
      if (pts >= 50) add(md, "nbapts", yy, pts, `${nm} scores ${pts} points against the ${x[I.ot]}`, line, "nba");
      else if (pts >= 30 && reb >= 10 && ast >= 10) add(md, "nbatd", yy, pts + reb + ast - 40, `${nm}: ${pts} points, ${reb} rebounds, ${ast} assists against the ${x[I.ot]}`, line, "nba");
      else if (ast >= 20) add(md, "nbaast", yy, ast, `${nm} hands out ${ast} assists against the ${x[I.ot]}`, line, "nba");
      else if (reb >= 25) add(md, "nbareb", yy, reb, `${nm} pulls down ${reb} rebounds against the ${x[I.ot]}`, line, "nba");
      else if (tpm >= 10) add(md, "nba3", yy, tpm, `${nm} hits ${tpm} threes against the ${x[I.ot]}`, line, "nba") } }
  /* NFL trades (Sam, 5:37 pm: "we have nfl trade data too"): the trade machine's history in p<Y>_nfl-picks (ESPN's transaction log, every
     trade since 2016, both teams' logs merged). A trade is a moment when a player in it scored 200+ PPR fantasy points the season before,
     or it moved two or more first-round picks. */
  try { const PK = await getPack(part("picks")); if (PK && PK.trades) {
    const pl = a => a.filter(x => !/^20\d\d /.test(x)), nm = x => x.replace(/^\S+\s+/, ""), firsts = a => a.filter(x => /^20\d\d 1st/.test(x)).length;
    const say = a => { const P = pl(a).map(nm), K = a.filter(x => /^20\d\d /.test(x)).map(x => `a ${x.replace(/(\d)(st|nd|rd|th)$/, "$1$2")}-round pick`); const L = [...P, ...K]; return L.length <= 1 ? L.join("") : L.slice(0, -1).join(", ") + " and " + L[L.length - 1] };
    for (const [d, T, o, gave, got] of PK.trades) { if (!d) continue; const y = +d.slice(0, 4), S0 = +d.slice(5, 7) >= 9 ? y : y - 1, prev = +d.slice(5, 7) >= 9 ? S0 - 1 : S0;
      const fp = x => FPS[prev + "|" + nm(x)] || 0, all = [...pl(gave).map(x => [x, T, o]), ...pl(got).map(x => [x, o, T])].map(([x, from, to]) => ({ x, from, to, f: fp(x) })).sort((a, b) => b.f - a.f);
      const star = all[0], f1 = firsts(gave) + firsts(got); if (!(star && star.f >= 200) && f1 < 2) continue;
      const pFor = firsts(gave) >= 2 ? pl(got).map(x => [x, o, T]) : firsts(got) >= 2 ? pl(gave).map(x => [x, T, o]) : [], who = star && star.f >= 100 ? star : pFor.length ? { x: pFor[0][0], from: pFor[0][1], to: pFor[0][2], f: 0 } : null;
      const h = who ? `${Nick(who.from, y)} trade ${nm(who.x)} to ${nick(who.to, y)}${who.f < 100 && f1 >= 2 ? ` for ${f1 === 2 ? "two" : f1 === 3 ? "three" : f1} first-round picks` : ""}` : `${Nick(T, y)} and ${nick(o, y)} swap ${f1} first-round picks`;
      add(d.slice(5, 10), "nfltrade", y, Math.round((star ? star.f : 0) / 10 + f1 * 8), h, `${Nick(T, y)} received ${say(got)}; ${nick(o, y)} received ${say(gave)}.${star && star.f >= 100 ? ` ${nm(star.x)} scored ${Math.round(star.f)} PPR fantasy points the season before.` : ""}`, "nfl") } } } catch (e) { log("this day: NFL trades skipped — " + e.message) }
  /* NBA trades (Sam, 5:16 pm: "we have GM trade data on the site already so i would look there first"): p2000_cbb-nbatrades, NBA.com's
     player movement log since 2015 (the Be the GM data). A trade is a moment when a player in it averaged 18+ points that season or the one
     before (the player box scores above). */
  try { const TR = await getPack("p2000_cbb-nbatrades"); if (TR && TR.r) { const by = {}; for (const r of TR.r) (by[r[1]] = by[r[1]] || []).push(r);
    const ppgS = (nm, y) => { let b = 0, s = 0; for (const yy of [y - 1]) {   /* the season before the trade (a season in progress would count games after it) */ const o = PPG[yy + "|" + nm]; if (o && o[1] >= 10 && o[0] / o[1] > b) { b = o[0] / o[1]; s = yy } } return [b, s] };
    const nick = t => String(t).split(" ").pop(), lst = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
    for (const id in by) { const L = by[id], dt = L[0][0]; if (!dt) continue; const y = +dt.slice(0, 4), sy = +dt.slice(5, 7) >= 8 ? y + 1 : y;
      const P = L.filter(r => r[5]).map(r => { const [p, s] = ppgS(r[4], sy); return { r, p, s } }).sort((a, b) => b.p - a.p); if (!P.length || P[0].p < 18) continue;
      const star = P[0], to = star.r[2], from = star.r[3], teams = [...new Set(L.map(r => r[2]))];
      const got = t => { const A = [...new Set(L.filter(r => r[2] === t).map(r => r[4]))].filter(w => !/^(draft consideration|cash)/i.test(w)).map(w => w.replace(/^(\d{4}) /, "a $1 ")); return A.length ? lst(A) : "draft considerations" };
      add(dt.slice(5, 10), "nbatrade", y, Math.round(star.p), `The ${nick(from)} trade ${star.r[4]} to the ${nick(to)}`, teams.map(t => `The ${nick(t)} received ${got(t)}`).join("; ").replace(/\.$/, "") + `. ${star.r[4]} averaged ${star.p.toFixed(1)} points a game the season before (${star.s - 1}–${String(star.s).slice(2)}).`, "nba") } } } catch (e) { log("this day: trades skipped — " + e.message) }
  /* off days (Sam: "what about other events on those days?"): Pro Football Hall of Famers' birthdays — our Hall of Fame file (Wikipedia)
     matched to nflverse's players file (birth dates), so the summer has a card too */
  try { const HF = await getPack("p1990_nfl-hof"), r = await fetch("https://github.com/nflverse/nflverse-data/releases/download/players/players.csv", { redirect: "follow" }); files++;
    if (HF && HF.p && r.ok) { const R = csv(await r.text()), Hh = R[0], c = n => Hh.indexOf(n), iN = c("display_name"), iB = c("birth_date"), iR = c("rookie_season"), iP = c("position"), by = {};
      for (const x of R.slice(1)) if (x[iB]) (by[x[iN]] = by[x[iN]] || []).push(x);
      for (const [nm, h] of Object.entries(HF.p)) { if (!(h.hof > 0)) continue; const t = h.t || [], y0 = Math.min(...t.map(z => z[1]).filter(Number.isFinite)), L = by[nm] || [];
        const x = L.length === 1 ? L[0] : L.find(z => Math.abs((+z[iR] || 0) - y0) <= 1); if (!x) continue; const bd = x[iB], md = bd.slice(5, 10), age = nowYear - +bd.slice(0, 4);
        const tm = [...new Set(t.map(z => z[0]))].slice(0, 3).map(k => (NFLN[k] || [k, k])[1]).join(", ");
        add(md, "bday", +bd.slice(0, 4), 1, `Born on this day: ${nm}`, `Born ${new Date(bd + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} · Pro Football Hall of Famer${x[iP] ? ` · ${x[iP]}` : ""}${tm ? ` · ${tm}` : ""}.`, "nfl") } } } catch (e) { log("this day: birthdays skipped — " + e.message) }
  /* the best of each kind a day */
  let n = 0; for (const md in D) { const by = {}; for (const r of D[md]) (by[r[0]] = by[r[0]] || []).push(r);
    D[md] = Object.values(by).flatMap(L => L.sort((a, b) => b[2] - a[2]).slice(0, KEEP)); n += D[md].length }
  const P = { v: 2, at: Date.now(), cols: ["kind", "year", "score", "headline", "line", "sport"], d: D, src: "nflverse (games, players) · CFBD (games, AP poll, mascots) · our basketball referee files · sportsdataverse (schedules, NBA player box scores) · our Hall of Fame file" };
  const r = await putPack("p2000_thisday", P);
  const msg = `This day: ${Object.keys(D).length} days, ${n} moments · from ${out.nflGames} NFL games, ${out.nflLogs} NFL player games, ${out.cfb} college football games, ${out.bb.n} NBA + ${out.bb.c} college basketball games (${out.named} named) · ${calls} CFBD calls, ${files} schedule files${r && r.bytes ? ` · ${Math.round(r.bytes / 1024)} KB` : ""}`;
  log(msg); return { msg, days: Object.keys(D).length, n };
}
