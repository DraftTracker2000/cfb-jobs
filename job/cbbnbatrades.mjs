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
  const team = v => { const c = clean(v), m = c.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/); if (!m) return c.replace(/[\[\]]/g, "") || null; return m[1].replace(/^\d{4}[–-]\d{2,4}\s+/, "").replace(/\s+season$/, "").trim() };
  const out = [];
  for (const k of Object.keys(P)) { const [r, i] = k.split("|").map(Number); if (i % 2 === 0) continue; const A = P[k], B = P[r + "|" + (i + 1)]; if (!A || !B) continue;
    const ta = team(A.team), tb = team(B.team), sa = parseInt(clean(A.score)), sb = parseInt(clean(B.score)); if (!ta || !tb || isNaN(sa) || isNaN(sb)) continue;
    out.push([r, ta, clean(A.seed), sa, tb, clean(B.seed), sb]) }
  out.sort((a, b) => a[0] - b[0]); return { s: out, rd: names.slice(1) };
}
export async function buildNbaBrackets({ getPack, putPack, log = console.log, upto }) {
  const prev = await getPack("p2000_cbb-nbabrk").catch(() => null), S = (prev && prev.s) || {}, RD = (prev && prev.rd) || {}; let reads = 0, bad = [];
  const now = new Date(), last = upto || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  /* ten seasons a read (Wikipedia returns several pages' text at once), with retries — one read a season was throttled after three */
  const need = []; for (let y = 1970; y <= last; y++) if (!(S[y] && S[y].length && y < last)) need.push(y);
  for (let k = 0; k < need.length; k += 10) { const Y = need.slice(k, k + 10), titles = Y.map(y => y + " NBA playoffs"); let j = null;
    for (let a = 0; a < 4 && !j; a++) { try { const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(titles.join("|"))}`, { headers: WUA }); reads++;
      if (r.ok) j = await r.json(); else { log(`nba brackets: ${r.status}`); await new Promise(z => setTimeout(z, 3000 * (a + 1))) } } catch (e) { await new Promise(z => setTimeout(z, 3000 * (a + 1))) } }
    if (!j) { bad.push(...Y); continue }
    const red = {}; for (const x of (j.query && j.query.redirects) || []) red[x.to] = x.from;
    for (const pg of (j.query && j.query.pages) || []) { const ti = red[pg.title] || pg.title, y = +String(ti).slice(0, 4), w = pg.revisions && pg.revisions[0] && pg.revisions[0].slots.main.content, B = w && parseNbaBracket(w);
      if (B && B.s.length) { S[y] = B.s; RD[y] = B.rd } else bad.push(y) }
    await new Promise(z => setTimeout(z, 1000)) }
  await putPack("p2000_cbb-nbabrk", { v: 1, t: Date.now(), s: S, rd: RD }); log(`nba brackets: ${Object.keys(S).length} seasons, ${reads} Wikipedia reads${bad.length ? `, no bracket: ${bad.join(" ")}` : ""}`); return S;
}
