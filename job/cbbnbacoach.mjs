/* NBA head coaches season by season (Oct 13 — the owner picked "NBA: coach pages", "think malone at UNC falls into this weird category").
   NBA.com's coaches file (nba_stats_coaches) names one coach per team per season and is a snapshot, so a midseason change files the wrong
   man; each coach's Wikipedia page carries his head-coaching record table (team, season, games, wins, losses, playoff result), so that is
   what's kept. Who: every NBA head coach in our coaches list (2010 on) plus college head coaches whose Wikipedia stops include an NBA team.
   A table row is kept only when its team is an NBA franchise and its season is a real season; a page is used only when at least one of
   its rows matches a team our own coaches list has him at (namesakes ruled out). A coach is looked up again only while he is coaching. */
const NBA_TEAMS = { "Atlanta": "ATL", "Boston": "BOS", "Brooklyn": "BKN", "New Jersey": "BKN", "Charlotte": "CHA", "Chicago": "CHI", "Cleveland": "CLE", "Dallas": "DAL", "Denver": "DEN", "Detroit": "DET",
  "Golden State": "GS", "Houston": "HOU", "Indiana": "IND", "LA Clippers": "LAC", "L.A. Clippers": "LAC", "Los Angeles Clippers": "LAC", "San Diego": "LAC", "LA Lakers": "LAL", "L.A. Lakers": "LAL", "Los Angeles Lakers": "LAL",
  "Memphis": "MEM", "Vancouver": "MEM", "Miami": "MIA", "Milwaukee": "MIL", "Minnesota": "MIN", "New Orleans": "NO", "New Orleans/Oklahoma City": "NO", "New York": "NY", "Oklahoma City": "OKC", "Seattle": "OKC",
  "Orlando": "ORL", "Philadelphia": "PHI", "Phoenix": "PHX", "Portland": "POR", "Sacramento": "SAC", "Kansas City": "SAC", "San Antonio": "SA", "Toronto": "TOR", "Utah": "UTAH", "Washington": "WSH" };
const NICK = { Hawks: "ATL", Celtics: "BOS", Nets: "BKN", Hornets: "CHA", Bobcats: "CHA", Bulls: "CHI", Cavaliers: "CLE", Mavericks: "DAL", Nuggets: "DEN", Pistons: "DET", Warriors: "GS", Rockets: "HOU", Pacers: "IND",
  Clippers: "LAC", Lakers: "LAL", Grizzlies: "MEM", Heat: "MIA", Bucks: "MIL", Timberwolves: "MIN", Pelicans: "NO", Knicks: "NY", Thunder: "OKC", SuperSonics: "OKC", Magic: "ORL", "76ers": "PHI", Suns: "PHX",
  "Trail Blazers": "POR", Kings: "SAC", Spurs: "SA", Raptors: "TOR", Jazz: "UTAH", Wizards: "WSH", Bullets: "WSH" };
const kk = v => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
const teamOf = s => { s = String(s || "").trim(); for (const [k, v] of Object.entries(NICK)) if (new RegExp("\\b" + k + "\\b").test(s)) return v; return NBA_TEAMS[s] || null };
/* the record table in the page's wikitext: rows with a team, a season "2013–14", then G W L */
export function parseNbaRecord(w) {
  const out = [], sec = w.match(/==\s*Head coaching record\s*==([\s\S]*?)(\n==[^=]|$)/i); if (!sec) return out;
  const disp = s => String(s || "").replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'{2,3}/g, "").replace(/style="[^"]*"\s*\|/g, "").trim();
  /* some pages write games-wins-losses as one template: {{GP-wins-losses-pct in table|38|44}} → "82 || 38 || 44 || pct" */
  const body = sec[1].replace(/\{\{\s*GP-wins-losses-pct in table\s*\|\s*(\d+)\s*\|\s*(\d+)[^}]*\}\}/gi, (m, a, b) => `${+a + +b} || ${a} || ${b} || pct`);
  for (const row of body.split(/\n\|-/)) {
    let y0 = null, tm = null; const ln = row.match(/\[\[(\d{4})[–-]\d{2,4} ([^|\]]+?) season(?:\|[^\]]*)?\]\]/);
    if (ln) { y0 = +ln[1]; tm = teamOf(ln[2]) }
    if (!y0) { const ny = row.match(/\{\{\s*nbay\s*\|\s*(\d{4})/i); if (ny) y0 = +ny[1] }
    if (!y0) { const s = row.match(/\b(\d{4})[–-](\d{2})\b/); if (s) y0 = +s[1] }
    if (!tm) { const first = row.split("\n").find(l => /^\s*\|/.test(l)); if (first) tm = teamOf(disp(first.replace(/^\s*\|/, ""))) }
    if (!y0 || !tm) continue;
    const numLine = row.split("\n").map(l => l.replace(/\{\{[^{}]*\}\}/g, "")).find(l => /^\s*\|\s*\d+\s*\|\|\s*\d+\s*\|\|\s*\d+/.test(l)); if (!numLine) continue;
    const nums = numLine.replace(/^\s*\|/, "").split("||").map(c => disp(c)).map(c => /^\d+$/.test(c) ? +c : null);
    const [g, wn, l] = nums; if (g == null || wn == null || l == null || wn + l > g || g > 84 || g < 1) continue;
    const pw = nums[6] != null ? nums[6] : 0, pl = nums[7] != null ? nums[7] : 0;
    const resL = row.split("\n").filter(x => /^\s*\|(?![}+])/.test(x)).pop() || "", res = disp(resL.replace(/^\s*\|/, "")).replace(/\s+/g, " ");
    out.push([y0 + 1, tm, wn, l, pw, pl, /^[—–-]$/.test(res) || /^\d/.test(res) ? "" : res.slice(0, 60)]) }
  return out }
/* the coaching stops in his infobox, assistant jobs included (Nov 18, 11:42 pm — the owner: "do 1 & 2", the NBA coaching tree): the record
   table only has his head jobs; the infobox's coach_years / coach_team lines have every NBA stop — "Golden State Warriors (assistant)" is an
   assistant job, no bracket is the head job. Kept: NBA teams only (college and G League stops left out), as [first season's end year, last
   season's end year, team, "a" assistant / "h" head]; "present" runs to the current season. The tree itself (who sat on whose bench) is
   worked out on the site from these and the head coaches' records. */
/* a stop's team by its city first ("New Orleans Hornets / Pelicans" is New Orleans, not Charlotte's Hornets); a nickname alone isn't enough —
   the Birmingham Bullets are a British team, not Washington */
const CITY = Object.keys(NBA_TEAMS).sort((a, b) => b.length - a.length);
const cityTeam = s => { s = String(s || "").trim(); const c = CITY.find(k => s === k || s.startsWith(k + " ")); return c ? NBA_TEAMS[c] : null };
export function parseNbaStops(w, curNba) {
  w = String(w || "").replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "");
  /* {{nbay|2012|start}} is the 2012–13 season, {{nbay|2012|end}} its end (2013), {{nbay|2013|full=y}} that one season: each becomes «season's end year» */
  w = w.replace(/\{\{\s*nbay\s*\|\s*(\d{4})[^{}]*\}\}/gi, (m, y) => `«${+y + 1}»`);
  /* other templates come out line by line — stripped from the whole page they took the infobox itself with them (the first run kept no stops) */
  const clean = s => { s = String(s || ""); for (let k = 0; k < 4; k++) s = s.replace(/\{\{[^{}]*\}\}/g, ""); return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/'{2,3}/g, "").trim() };
  const line = k => { const m = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([^\\n]*)")); return m ? m[1] : "" };
  const out = []; for (let i = 1; i <= 30; i++) { const yrs = clean(line("coach_years" + i)), tm0 = clean(line("coach_team" + i)); if (!tm0) continue;
    const role = (tm0.match(/\(([^)]*)\)\s*$/) || [])[1] || "", tm = cityTeam(tm0.replace(/\s*\([^)]*\)\s*$/, "")); if (!tm) continue;
    if (role && !/assistant|associate|interim|head/i.test(role)) continue;   /* scout, player development, front office: not a bench job */
    const a = /assistant|associate/i.test(role) ? "a" : "h", pres = /present/i.test(yrs); let s0, s1;
    const E = [...yrs.matchAll(/«(\d{4})»/g)].map(m => +m[1]);
    if (E.length) { s0 = E[0]; s1 = E.length > 1 ? E[E.length - 1] : pres ? curNba : E[0] }
    else { const m = yrs.match(/(\d{4})\s*(?:[–-]\s*(\d{4}|\d{2}|present))?/i); if (!m) continue; const y0 = +m[1]; s0 = y0 + 1; s1 = m[2] == null ? y0 + 1 : /present/i.test(m[2]) ? curNba : m[2].length === 2 ? +(String(y0).slice(0, 2) + m[2]) : +m[2] }
    out.push([s0, Math.max(s0, s1), tm, a]) }
  return out }
async function wikiText(title) { for (let k = 0; k < 5; k++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&redirects=1&prop=wikitext&format=json&page=" + encodeURIComponent(title), { headers: { "User-Agent": "mycfbbigboard.com data job (NBA coach records)" } });
      if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 4000 * (k + 1))); continue } const j = await r.json(); return j.parse ? j.parse.wikitext["*"] : "" } catch { await new Promise(z => setTimeout(z, 1500)) } } return null }
/* names: { name: [team abbreviations we have him at] } → K.coh { name: { r: [[seasonEnd, team, W, L, playoff W, playoff L, result]], at } }, K.cohMiss */
export async function buildNbaCoaches(K, names, log, curNba) {
  K.coh = K.coh || {}; K.cohMiss = K.cohMiss || []; if (K.cohV !== 2 && K.cohV !== 3) { K.cohMiss = []; K.cohV = 2 } if (K.cohV === 2) K.cohV = 3;   /* v2: the GP-wins-losses template is read — coaches missed before get another look; v3 (Nov 18): each page read once more for its stops (st) */
  let added = 0, tried = 0, errs = 0;
  for (const [nm, teams] of Object.entries(names)) {
    const have = K.coh[nm]; if (have && have.stv === 2 && !(teams.cur && Math.max(...have.r.map(r => r[0])) < curNba)) continue; if (!have && K.cohMiss.includes(nm)) continue;
    tried++; let got = null, gotSt = null;
    for (const title of [nm, nm + " (basketball)", nm + " (basketball coach)"]) { const w = await wikiText(title); if (w == null) { got = "ERR"; break } if (!w || /may refer to|\{\{\s*(disambiguation|hndis)/i.test(w)) continue;
      const R = parseNbaRecord(w); if (R.length && (!teams.list.length || R.some(r => teams.list.includes(r[1])))) { got = R; gotSt = parseNbaStops(w, curNba); break } }
    if (got === "ERR") { errs++; continue } if (got) { K.coh[nm] = { r: got, st: gotSt || [], stv: 2, at: Date.now() }; added++ } else if (!K.cohMiss.includes(nm)) K.cohMiss.push(nm);
    await new Promise(z => setTimeout(z, 700)) }
  log(`nbastats: NBA coach records — ${tried} looked up, ${added} kept, ${errs} to retry next run (Wikipedia busy), ${Object.keys(K.coh).length} on file`) }
export { teamOf, kk };
