/* NBA head coaches season by season (Oct 13 — Sam picked "NBA: coach pages", "think malone at UNC falls into this weird category").
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
  for (const row of sec[1].split(/\n\|-/)) {
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
async function wikiText(title) { for (let k = 0; k < 5; k++) { try { const r = await fetch("https://en.wikipedia.org/w/api.php?action=parse&redirects=1&prop=wikitext&format=json&page=" + encodeURIComponent(title), { headers: { "User-Agent": "mycfbbigboard.com data job (NBA coach records)" } });
      if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 4000 * (k + 1))); continue } const j = await r.json(); return j.parse ? j.parse.wikitext["*"] : "" } catch { await new Promise(z => setTimeout(z, 1500)) } } return null }
/* names: { name: [team abbreviations we have him at] } → K.coh { name: { r: [[seasonEnd, team, W, L, playoff W, playoff L, result]], at } }, K.cohMiss */
export async function buildNbaCoaches(K, names, log, curNba) {
  K.coh = K.coh || {}; K.cohMiss = K.cohMiss || []; let added = 0, tried = 0, errs = 0;
  for (const [nm, teams] of Object.entries(names)) {
    const have = K.coh[nm]; if (have && !(teams.cur && Math.max(...have.r.map(r => r[0])) < curNba)) continue; if (!have && K.cohMiss.includes(nm)) continue;
    tried++; let got = null;
    for (const title of [nm, nm + " (basketball)", nm + " (basketball coach)"]) { const w = await wikiText(title); if (w == null) { got = "ERR"; break } if (!w || /may refer to|\{\{\s*(disambiguation|hndis)/i.test(w)) continue;
      const R = parseNbaRecord(w); if (R.length && (!teams.list.length || R.some(r => teams.list.includes(r[1])))) { got = R; break } }
    if (got === "ERR") { errs++; continue } if (got) { K.coh[nm] = { r: got, at: Date.now() }; added++ } else if (!K.cohMiss.includes(nm)) K.cohMiss.push(nm);
    await new Promise(z => setTimeout(z, 700)) }
  log(`nbastats: NBA coach records — ${tried} looked up, ${added} kept, ${errs} to retry next run (Wikipedia busy), ${Object.keys(K.coh).length} on file`) }
export { teamOf, kk };
