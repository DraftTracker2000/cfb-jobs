/* ── who owns each future draft pick (Sam, Oct 1: "if we have transaction data how do we not have the pick data?")
   ESPN's transaction feed (the same source as the injuries) writes every trade out in words: "Acquired DB Joey Porter Jr. from Pittsburgh in
   exchange for a 2027 sixth-round draft pick and a 2028 second-round draft pick." We read every trade since 2024, pull out the future picks that
   moved and which way, and replay them in date order starting from every team holding its own picks. Both teams usually log the same trade,
   so a move logged twice (same pick, same two teams, within 10 days) counts once. A pick handed over is the giver's own of that year and round
   if he still has it, otherwise one he picked up earlier. Conditional picks count as moved. ── */
const PK_ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7 };
export const PK_TEAMS = { ARI: ["Arizona", "Cardinals"], ATL: ["Atlanta", "Falcons"], BAL: ["Baltimore", "Ravens"], BUF: ["Buffalo", "Bills"], CAR: ["Carolina", "Panthers"],
  CHI: ["Chicago", "Bears"], CIN: ["Cincinnati", "Bengals"], CLE: ["Cleveland", "Browns"], DAL: ["Dallas", "Cowboys"], DEN: ["Denver", "Broncos"], DET: ["Detroit", "Lions"],
  GB: ["Green Bay", "Packers"], HOU: ["Houston", "Texans"], IND: ["Indianapolis", "Colts"], JAX: ["Jacksonville", "Jaguars"], KC: ["Kansas City", "Chiefs"],
  LV: ["Las Vegas", "Raiders"], LAC: ["Los Angeles Chargers", "Chargers"], LA: ["Los Angeles Rams", "Rams"], MIA: ["Miami", "Dolphins"], MIN: ["Minnesota", "Vikings"],
  NE: ["New England", "Patriots"], NO: ["New Orleans", "Saints"], NYG: ["New York Giants", "Giants"], NYJ: ["New York Jets", "Jets"], PHI: ["Philadelphia", "Eagles"],
  PIT: ["Pittsburgh", "Steelers"], SF: ["San Francisco", "49ers"], SEA: ["Seattle", "Seahawks"], TB: ["Tampa Bay", "Buccaneers"], TEN: ["Tennessee", "Titans"], WAS: ["Washington", "Commanders"] };
const ESPN_AB = { WSH: "WAS", LAR: "LA" };
export function pkTeam(s) {
  s = String(s || "").replace(/^the\s+/i, "").replace(/N\.Y\./g, "New York").trim();
  for (const [ab, [city, nick]] of Object.entries(PK_TEAMS)) if (new RegExp(`\\b${nick}\\b`, "i").test(s)) return ab;
  for (const [ab, [city]] of Object.entries(PK_TEAMS)) if (!/^(New York|Los Angeles)/.test(city) && new RegExp(`^${city}\\b`, "i").test(s)) return ab;
  return null;
}
function pkList(part, lo, hi) {
  const out = []; const rx = /(20\d\d)\s+(?:conditional\s+)?(first|second|third|fourth|fifth|sixth|seventh|1st|2nd|3rd|4th|5th|6th|7th)[\s-]+round/gi; let m;
  while ((m = rx.exec(part))) { const y = +m[1]; if (y >= lo && y <= hi) out.push([y, PK_ORD[m[2].toLowerCase()]]) }
  return out;
}
/* one transaction → the pick moves in it: [year, round, from, to] */
export function pkMoves(desc, team, lo, hi) {
  const out = [], T = ESPN_AB[team] || team;
  /* "Jr." / "N.Y." / initials like "A.J." would split a sentence in the middle */
  const S = String(desc || "").replace(/\b(Jr|Sr|St|Jan|Feb|Aug|Sept|Oct|Nov|Dec)\./g, "$1").replace(/N\.Y\./g, "New York").replace(/\b([A-Z])\./g, "$1");
  for (const c of S.split(/\.\s+(?=[A-Z])/)) {
    let m;
    if ((m = c.match(/^(?:Acquired|Obtained)\s+(.+?)\s+from\s+(?:the\s+)?(.+?)\s+(?:in exchange for|for)\s+(.+)$/i))) {
      const o = pkTeam(m[2]); if (!o || o === T) continue;
      for (const [y, r] of pkList(m[1], lo, hi)) out.push([y, r, o, T]);
      for (const [y, r] of pkList(m[3], lo, hi)) out.push([y, r, T, o]);
    } else if ((m = c.match(/^Traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)\s+(?:in exchange for|for)\s+(.+)$/i))) {
      const o = pkTeam(m[2]); if (!o || o === T) continue;
      for (const [y, r] of pkList(m[1], lo, hi)) out.push([y, r, T, o]);
      for (const [y, r] of pkList(m[3], lo, hi)) out.push([y, r, o, T]);
    } else if ((m = c.match(/^Traded\s+(.+?)\s+to\s+(?:the\s+)?([A-Z][\w.' ]+?)\s*$/i))) {
      const o = pkTeam(m[2]); if (!o || o === T) continue;
      for (const [y, r] of pkList(m[1], lo, hi)) out.push([y, r, T, o]);
    } else if ((m = c.match(/^Received\s+(.+?)\s+from\s+(?:a trade with\s+)?(?:the\s+)?(.+?)\s*$/i))) {
      const o = pkTeam(m[2]); if (!o || o === T) continue;
      for (const [y, r] of pkList(m[1], lo, hi)) out.push([y, r, o, T]);
    }
  }
  return out;
}
/* replay every move → own[team] = [[year, round, original team], …] and a log of what moved */
export function pkOwners(tx, lo, hi) {
  const own = {}; for (const t in PK_TEAMS) { own[t] = []; for (let y = lo; y <= hi; y++) for (let r = 1; r <= 7; r++) own[t].push([y, r, t]) }
  const mv = []; for (const x of tx) for (const m of pkMoves(x.x, x.tm, lo, hi)) mv.push({ d: Date.parse(x.d) || 0, y: m[0], r: m[1], from: m[2], to: m[3] });
  mv.sort((a, b) => a.d - b.d);
  const seen = [], log = [];
  for (const m of mv) {
    if (seen.some(s => s.y === m.y && s.r === m.r && s.from === m.from && s.to === m.to && Math.abs(s.d - m.d) <= 10 * 864e5)) continue;
    seen.push(m);
    const L = own[m.from]; let i = L.findIndex(p => p[0] === m.y && p[1] === m.r && p[2] === m.from); if (i < 0) i = L.findIndex(p => p[0] === m.y && p[1] === m.r);
    if (i < 0) continue;                                      // he doesn't hold one (a move we can't follow) — skip it
    const p = L.splice(i, 1)[0]; own[m.to].push(p); log.push([new Date(m.d).toISOString().slice(0, 10), m.y, m.r, p[2], m.from, m.to]);
  }
  for (const t in own) own[t].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { own, log };
}

/* every trade, as text, for the trade machine's "this GM's trades" (Oct 2). One line per trade, both teams' logs merged. */
const POSRX = "QB|RB|HB|FB|WR|TE|OT|OG|OL|T|G|C|IOL|DT|DE|DL|NT|EDGE|LB|ILB|OLB|MLB|CB|S|FS|SS|DB|K|PK|P|LS|T/G|G/T|C/G|G/C|DE/LB|LB/DE|S/CB|CB/S|OLB/DE|DE/OLB";
function pkAssets(part) {
  const out = []; let m; const rx = /(20\d\d)\s+(?:conditional\s+)?(first|second|third|fourth|fifth|sixth|seventh|1st|2nd|3rd|4th|5th|6th|7th)[\s-]+round/gi;
  while ((m = rx.exec(part))) out.push(`${m[1]} ${["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"][PK_ORD[m[2].toLowerCase()] - 1]}`);
  const rp = new RegExp(`(?:^|[\\s,(])(${POSRX})\\s+([A-Z][\\w.'’-]+(?:\\s+(?:[A-Z][\\w.'’-]+|Jr|Sr|II|III|IV|V))*)`, "g");
  while ((m = rp.exec(part))) out.unshift(`${m[1]} ${m[2]}`);
  return out;
}
export function pkTrades(tx) {
  const L = [];
  for (const x of tx) { const T = ESPN_AB[x.tm] || x.tm;
    const S = String(x.x || "").replace(/\b(Jr|Sr|St)\./g, "$1").replace(/N\.Y\./g, "New York").replace(/\b([A-Z])\./g, "$1");
    for (const c of S.split(/\.\s+(?=[A-Z])/)) { let m, o, give, get;
      if ((m = c.match(/^(?:Acquired|Obtained)\s+(.+?)\s+from\s+(?:the\s+)?(.+?)\s+(?:in exchange for|for)\s+(.+?)\.?$/i))) { o = pkTeam(m[2]); get = m[1]; give = m[3] }
      else if ((m = c.match(/^Traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)\s+(?:in exchange for|for)\s+(.+?)\.?$/i))) { o = pkTeam(m[2]); give = m[1]; get = m[3] }
      else continue;
      if (!o || o === T) continue; const G = pkAssets(give), R = pkAssets(get); if (!G.length || !R.length) continue;
      const d = String(x.d || "").slice(0, 10), nm = A => A.map(z => z.replace(/^\S+\s+(?=[A-Z][a-z])/, "")).sort().join("|"), key = nm(G) + "#" + nm(R), rkey = nm(R) + "#" + nm(G);
      if (L.some(y => Math.abs(Date.parse(y[0]) - Date.parse(d)) <= 10 * 864e5 && ((y[1] === T && y[2] === o && y.k === key) || (y[1] === o && y[2] === T && y.k === rkey)))) continue;
      const row = [d, T, o, G, R]; row.k = key; L.push(row) } }
  return L.map(r => r.slice(0, 5)).sort((a, b) => a[0] < b[0] ? 1 : -1);
}
/* the data job's pack: ESPN's transactions for the seasons that could have moved these picks (picks trade up to three years out); every trade since 2016 for the GM history */
export async function pickPack(Y, log, cache = null) {
  const lo = Y + 1, hi = Y + 3, tx = [];
  const j = async u => { for (let t = 0; t < 3; t++) { try { const r = await fetch(u); if (r.ok) return await r.json() } catch { } await new Promise(r => setTimeout(r, 800 * (t + 1))) } return null };
  /* Oct 12: a finished season's transactions are read once and kept (cache: { get, put } of { s: { season: [...] } }) */
  let C = { s: {} }; try { C = (cache && (await cache.get())) || C } catch { } C.s = C.s || {}; let fresh = 0;
  for (let s = 2016; s <= Y; s++) { if (s < Y && C.s[s] && C.s[s].length) { tx.push(...C.s[s]); continue } const got = [];
    for (let p = 1; p <= 10; p++) {
      const J = await j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/transactions?season=${s}&limit=1000&page=${p}`); if (!J) break;
      for (const t of J.transactions || []) got.push({ d: t.date, x: t.description, tm: t.team && t.team.abbreviation });
      if (p >= (J.pageCount || 1)) break }
    tx.push(...got); if (s < Y && got.length > 200) { C.s[s] = got; fresh++ } }
  if (fresh && cache) try { await cache.put(C) } catch { }
  if (tx.length < 500) { log(`nfl picks: only ${tx.length} transactions from ESPN — skipped`); return null }
  const { own, log: moved } = pkOwners(tx.filter(t => +String(t.d).slice(0, 4) >= Y - 3), lo, hi);
  const trades = pkTrades(tx);
  log(`nfl picks: ${tx.length} transactions, ${moved.length} pick moves (${lo}–${hi})`);
  return { lo, hi, cols: ["year", "round", "original"], own, moved, movedCols: ["date", "year", "round", "original", "from", "to"], trades, tradeCols: ["date", "team", "partner", "gave", "got"], at: Date.now() };
}
