/* "This day in history" — every day of the year, built once (Nov 6 — the owner, 10:46 am: "might as well just run it now. but yea they look
   great"; 3:43 pm: "build away"). The same moments the three sample cards came from (probe thisday), for all 366 days:
     NFL      games (nflverse): big upsets by the closing line, 80+ point games; player game logs 1999 on: 450+ passing yards, 5+ TD
              passes, 200+ rushing or receiving yards, 4+ touchdowns
     college  football (CFBD games + AP poll, 2014 on, via the site's kept CFBD answers): unranked over a top-10 team, top-10 meetings
     NBA and college basketball (our referee files, 2003 on, Eastern dates from p<Y>_cbb-gdate-<lg>): big upsets by the line, huge totals
   Bars lowered after the first run (236 of 366 days had a moment) so spring and summer days get one too: NFL upsets 7+, 75+ points;
   NBA upsets 8+, 260+ points; college basketball upsets 12+, 185+ points. Still the best 14 of each kind a day. A shootout needs both teams scoring (NBA 120+, college 85+ — no 147–39 blowouts).
   Writes p2000_thisday { v, at, cols, d: { "MM-DD": [[kind, year, score, text, sport], …] } } — the 14 best of each kind a day is plenty.
   No reads at ESPN; CFBD's finished seasons come from the proxy's kept answers (x-kept), so a rerun costs next to nothing. The Lab's
   Posts page (/lab/posts.html) picks from it each morning. MODE=thisday (job/build.mjs). */
const KEEP = 14;
export async function buildThisDay({ site, token, getPack, getIndex, putPack, log = console.log, nowYear = new Date().getUTCFullYear() }) {
  const H = { headers: { Authorization: "Bearer " + token } }; let calls = 0;
  const cf = async path => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(path), H); if (r.ok) { if (!r.headers.get("x-kept")) calls++; return r.json() }
    if (r.status === 400 || r.status === 404) return null } catch (e) { } await new Promise(z => setTimeout(z, 2000 * (k + 1))) } return null };
  const D = {}, add = (md, k, y, s, t, sp) => { (D[md] = D[md] || []).push([k, +y, s, t, sp]) };
  const ix = (await getIndex()) || {}, part = p => { let b = null; for (const n in ix) { const m = /^p(\d{4})_nfl-(.+)$/.exec(n); if (m && m[2] === p && (b == null || +m[1] > b)) b = +m[1] } return b == null ? null : `p${b}_nfl-${p}` };
  const obj = P => P && P.cols ? (r => Object.fromEntries(P.cols.map((c, i) => [c, r[i]]))) : null;
  const out = { nflGames: 0, nflLogs: 0, cfb: 0, bb: { n: 0, c: 0 } };
  /* NFL games */
  const GP = await getPack(part("games")); const G = {}, FR = { STL: "LA", SD: "LAC", OAK: "LV" };
  if (GP) { const o = obj(GP); for (const r of GP.g) { const g = o(r); G[g.id] = g; const md = String(g.gameday || g.date || "").slice(5, 10); if (!md || g.homeScore == null) continue; out.nflGames++;
    const y = String(g.gameday || g.date).slice(0, 4), m = g.homeScore - g.awayScore, sp = g.spread, ln = `${g.away} ${g.awayScore} at ${g.home} ${g.homeScore}`;
    if (sp != null) { const dogHome = sp < 0, won = dogHome ? m > 0 : m < 0; if (won && Math.abs(sp) >= 7) add(md, "nflupset", y, Math.abs(sp), `${ln} · ${dogHome ? g.home : g.away} were ${Math.abs(sp)}-point underdogs`, "nfl") }
    if (g.homeScore + g.awayScore >= 75) add(md, "nflpts", y, g.homeScore + g.awayScore, ln, "nfl") } }
  /* NFL player games */
  const PP = await getPack(part("players")), PL = {}; if (PP && PP.p) { const ni = PP.cols.indexOf("name"); for (const g in PP.p) PL[g] = PP.p[g][ni] }
  for (let S = 1999; S < nowYear; S++) { const L = await getPack(part("logs-" + S)).catch(() => null); if (!L || !L.p) continue; const o = obj(L);
    for (const gs in L.p) for (const row of L.p[gs]) { const r = o(row), g = G[r.game]; if (!g) continue; const md = String(g.gameday || g.date || "").slice(5, 10); out.nflLogs++;
      const nm = PL[gs] || gs, ln = `${FR[g.away] || g.away} at ${FR[g.home] || g.home} ${g.awayScore}-${g.homeScore}`;
      if ((r.pyd || 0) >= 450) add(md, "pyd", S, r.pyd, `${nm} ${r.cmp}/${r.att}, ${r.pyd} yds, ${r.ptd} TD · ${ln}`, "nfl");
      if ((r.ptd || 0) >= 5) add(md, "ptd", S, r.ptd, `${nm} ${r.ptd} TD passes, ${r.pyd} yds · ${ln}`, "nfl");
      if ((r.ryd || 0) >= 200) add(md, "ryd", S, r.ryd, `${nm} ${r.car} car, ${r.ryd} yds, ${r.rtd} TD · ${ln}`, "nfl");
      if ((r.yds || 0) >= 200) add(md, "recyd", S, r.yds, `${nm} ${r.rec} rec, ${r.yds} yds, ${r.td} TD · ${ln}`, "nfl");
      if (((r.rtd || 0) + (r.td || 0)) >= 4) add(md, "td", S, r.rtd + r.td, `${nm} ${r.rtd + r.td} TD · ${ln}`, "nfl") } }
  /* college football: games + AP poll, Eastern dates */
  const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", month: "2-digit", day: "2-digit" });
  for (let y = 2014; y < nowYear; y++) { const Gc = (await cf(`/games?year=${y}&seasonType=regular&classification=fbs`)) || [], R = (await cf(`/rankings?year=${y}&seasonType=regular`)) || [], rk = {};
    for (const w of R) for (const p of w.polls || []) if (/AP/i.test(p.poll)) for (const r of p.ranks || []) rk[w.week + "|" + r.school] = r.rank;
    for (const g of Gc) { const hp = g.homePoints ?? g.home_points, ap = g.awayPoints ?? g.away_points, ht = g.homeTeam ?? g.home_team, at = g.awayTeam ?? g.away_team, st = g.startDate ?? g.start_date;
      if (hp == null || ap == null || !st) continue; const md = ET.format(new Date(st)).replace(/(\d\d)\D(\d\d)/, "$1-$2"); out.cfb++;
      const hr = rk[g.week + "|" + ht], ar = rk[g.week + "|" + at], hw = hp > ap, W = hw ? ht : at, Lr = hw ? ar : hr, Wr = hw ? hr : ar, L = hw ? at : ht;
      if (Lr && Lr <= 10 && !Wr) add(md, "cfbupset", y, 11 - Lr, `Unranked ${W} ${Math.max(hp, ap)}, No. ${Lr} ${L} ${Math.min(hp, ap)}`, "cfb");
      if (hr && ar && hr <= 10 && ar <= 10) add(md, "cfbtop10", y, 20 - hr - ar, `No. ${ar} ${at} ${ap} at No. ${hr} ${ht} ${hp}`, "cfb") } }
  /* basketball: referee files, paired with Eastern dates */
  for (const lg of ["n", "c"]) for (let y = 2003; y <= nowYear + 1; y++) { const P = await getPack(`p${y}_cbb-refraw-${lg}`).catch(() => null); if (!P || !P.g) continue;
    const GD = (await getPack(`p${y}_cbb-gdate-${lg}`).catch(() => null)) || { g: {} }, o = obj(P);
    for (const [id, row] of Object.entries(P.g)) { const x = o(row); if (x.hs == null || x.as == null) continue; const dt = GD.g[id] || String(x.date || "").slice(0, 10), md = dt.slice(5, 10), yy = dt.slice(0, 4); if (!md) continue; out.bb[lg]++;
      const m = x.hs - x.as, sp = lg === "n" ? "nba" : "cbb";
      if (x.spread != null) { const dogHome = x.spread > 0, won = dogHome ? m > 0 : m < 0; if (won && Math.abs(x.spread) >= (lg === "n" ? 8 : 12)) add(md, lg + "bbupset", yy, Math.abs(x.spread), `${x.away} ${x.as} at ${x.home} ${x.hs} · ${dogHome ? x.home : x.away} were ${Math.abs(x.spread)}-point underdogs`, sp) }
      if (x.hs + x.as >= (lg === "n" ? 260 : 185) && Math.min(x.hs, x.as) >= (lg === "n" ? 120 : 85)) add(md, lg + "bbpts", yy, x.hs + x.as, `${x.away} ${x.as} at ${x.home} ${x.hs}`, sp) } }
  /* the best of each kind a day */
  let n = 0; for (const md in D) { const by = {}; for (const r of D[md]) (by[r[0]] = by[r[0]] || []).push(r);
    D[md] = Object.values(by).flatMap(L => L.sort((a, b) => b[2] - a[2]).slice(0, KEEP)); n += D[md].length }
  const P = { v: 1, at: Date.now(), cols: ["kind", "year", "score", "text", "sport"], d: D, src: "nflverse · CFBD (games, AP poll) · our basketball referee files" };
  const r = await putPack("p2000_thisday", P);
  const msg = `This day: ${Object.keys(D).length} days, ${n} moments · from ${out.nflGames} NFL games, ${out.nflLogs} NFL player games, ${out.cfb} college football games, ${out.bb.n} NBA + ${out.bb.c} college basketball games · ${calls} CFBD calls${r && r.bytes ? ` · ${Math.round(r.bytes / 1024)} KB` : ""}`;
  log(msg); return { msg, days: Object.keys(D).length, n };
}
