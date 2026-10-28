/* NFL staffs, kept current by the data job (Sam, Sept 29: "how will it handle in-season firings, and new staffs next season?").

   Every NFL run and every weekly run reads Wikipedia's current lists of offensive and defensive coordinators, which are updated within hours of a hire or firing (interim coaches included), and sends them
   to the site. The site keeps the admin's own edits unless Wikipedia's entry for that team changes afterwards
   (see src/api/staff.js), so a correction by hand is never undone by a stale page, and a new firing still comes through.
   Wikipedia's text is CC BY-SA; only the names are used. */
import { noSR, srSkipped } from "./wikisr.mjs";

const PAGES = { oc: "List_of_current_NFL_offensive_coordinators", dc: "List_of_current_NFL_defensive_coordinators" };
/* head coaches: nflverse's schedule file carried last season's coach into 2026 for some teams (Gannon at Arizona, Morris at
   Atlanta — Sam, Sept 29), so Wikipedia's current head coaches are read too: shown on the depth chart, and used to fix the
   current season's games in the schedule pack (see fixCoaches) */
const HC_PAGE = "List_of_current_NFL_head_coaches";
/* general managers (Sam, Sept 30): the current GM and the season he started, from the table Wikipedia keeps on its general-manager page */
const GM_PAGE = "List_of_current_NFL_general_managers";
const TEAM = { "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB", "Houston Texans": "HOU",
  "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA",
  "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG", "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS" };

/* a person's name from a wikitext cell: {{sortname|First|Last}}, [[Name (disambig)|Name]], [[Name]] or plain text */
export function cellName(c) {
  c = c.replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "").replace(/\{\{(?:efn|refn|sfn)[^}]*\}\}/gi, "").trim();
  let m = c.match(/\{\{\s*sortname\s*\|([^|}]+)\|([^|}]+)/i);
  if (m) return (m[1].trim() + " " + m[2].trim()).replace(/\s+/g, " ");
  m = c.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (m) return (m[2] || m[1].replace(/\s*\([^)]*\)\s*$/, "")).trim();
  return c.replace(/'''?|\{\{[^}]*\}\}/g, "").replace(/\(.*?\)/g, "").trim() || null;
}
/* rows like  | [[Buffalo Bills]] || {{sortname|Pete|Carmichael Jr.}} || … */
export function parseList(wt) {
  const out = {};
  for (const line of wt.split("\n")) {
    if (!/^\|\s*\[\[/.test(line)) continue;
    const cells = line.replace(/^\|\s*/, "").split("||");
    if (cells.length < 2) continue;
    const tm = (cells[0].match(/\[\[([^\]|]+)/) || [])[1];
    const code = TEAM[(tm || "").trim()];
    if (!code) continue;
    const nm = cellName(cells[1]);
    if (nm && !out[code]) out[code] = nm;
  }
  return out;
}

/* the head-coach table: one row per team, "|-" between rows; the name is the row's {{sortname}}, the season its first
   [[YYYY … season|YYYY]] link; "interim" anywhere in the row marks an interim coach */
export function parseHC(wt) {
  const out = {};
  for (const row of wt.split(/\n\|-/)) {
    const tm = (row.match(/List of ([^\]|]+?) head coaches/) || [])[1];
    const code = TEAM[(tm || "").trim()];
    if (!code || out[code]) continue;
    const m = row.match(/\{\{\s*sortname\s*\|([^|}]+)\|([^|}]+)/i);
    const nm = m ? (m[1].trim() + " " + m[2].trim()) : null;
    if (!nm) continue;
    const since = +((row.match(/\[\[(\d{4}) [^\]|]+ season\|/) || [])[1]) || null;
    out[code] = { hc: nm, since, interim: /interim/i.test(row.replace(/<ref[\s\S]*?<\/ref>/g, "")) };
  }
  return out;
}
/* the current season's games: where nflverse still names last season's coach but Wikipedia's current head coach was hired for
   this season (not an interim — an in-season change is left to nflverse, which names the right coach game by game) */
/* edit distance, for spotting a misspelled name */
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] }
export function fixCoaches(G, curYear, hc, log = console.log) {
  const C = G.cols, iS = C.indexOf("season"), iH = C.indexOf("home"), iA = C.indexOf("away"), iHC = C.indexOf("homeCoach"), iAC = C.indexOf("awayCoach"), iW = C.indexOf("week");
  const last = {};   // each team's coach in its last game of the previous season
  for (const g of G.g) if (g[iS] === curYear - 1) { for (const [t, c] of [[g[iH], g[iHC]], [g[iA], g[iAC]]]) if (!last[t] || g[iW] >= last[t].w) last[t] = { c, w: g[iW] } }
  let n = 0; const fixed = new Set(), knows = new Set();   // teams where nflverse already names a new coach this season (e.g. a mid-season change): leave them alone
  for (const g of G.g) if (g[iS] === curYear) for (const [it, ic] of [[iH, iHC], [iA, iAC]]) { const t = g[it], h = hc[t];
    if (h && g[ic] && last[t] && g[ic] !== last[t].c && lev(g[ic], h.hc || "") > 2) knows.add(t) }
  for (const g of G.g) { if (g[iS] !== curYear) continue;
    for (const [it, ic] of [[iH, iHC], [iA, iAC]]) { const t = g[it], h = hc[t];
      if (!h || h.interim || h.since !== curYear || !h.hc || g[ic] === h.hc) continue;
      if (knows.has(t)) continue;   // nflverse already names someone new: trust it (a misspelling of the same name is fixed: "Klint Kubliak")
      g[ic] = h.hc; n++; fixed.add(t) } }
  if (n) log(`staff: ${n} ${curYear} coach entries fixed (${[...fixed].join(", ")})`);
  return n;
}

/* the GM table: one row per team, "|-" between rows: [[Team]] · [[GM name]] · [[YYYY Team season|YYYY]] */
export function parseGM(wt) {
  const out = {};
  for (const row of wt.split(/\n\|-/)) {
    const links = [...row.replace(/<ref[\s\S]*?<\/ref>/g, "").matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
    const tc = m => TEAM[m[1].trim()] || TEAM[(m[2] || "").trim()];   // [[List of Green Bay Packers general managers|Green Bay Packers]]
    const ti = links.findIndex(tc);
    if (ti < 0) continue; const code = tc(links[ti]);
    if (out[code]) continue;
    const nmL = links.slice(ti + 1).find(m => !/season/.test(m[1]) && !tc(m));
    const nm = nmL ? (nmL[2] || nmL[1].replace(/\s*\([^)]*\)\s*$/, "")).trim() : null;
    if (!nm) continue;
    const since = +((row.match(/\[\[(\d{4}) [^\]|]+ season\|/) || [])[1]) || null;
    /* the hire date from the citation (|date=), when it has one: a GM hired after that spring's draft didn't make those picks (Sam, Sept 30).
       Only a fallback: the page's hand-checked list (public/data/nfl-gm-hires.json) wins, because these cites are sometimes the wrong event */
    const dm = row.match(/\|\s*date\s*=\s*([A-Z][a-z]+ \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2} [A-Z][a-z]+ \d{4})/);
    const dt = dm ? new Date(dm[1] + (/^\d{4}-/.test(dm[1]) ? "T12:00:00Z" : " 12:00 UTC")) : null;
    out[code] = { gm: nm, since, hired: dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : null };
  }
  return out;
}
export async function buildStaff({ log = console.log } = {}) {
  const teams = {};
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${HC_PAGE}&prop=wikitext&format=json&formatversion=2`, { headers: { "User-Agent": "mycfbbigboard.com data job (staff names)" } });
    const H = r.ok ? parseHC(noSR(await r.json())?.parse?.wikitext || "") : {};
    log(`staff: hc ${Object.keys(H).length} teams`);
    if (Object.keys(H).length >= 28) for (const [t, h] of Object.entries(H)) Object.assign(teams[t] = teams[t] || {}, { hc: h.hc, hcSince: h.since, hcInterim: h.interim });
  } catch (e) { log("staff: hc " + e.message) }
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${GM_PAGE}&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: { "User-Agent": "mycfbbigboard.com data job (staff names)" } });
    const M = r.ok ? parseGM(noSR(await r.json())?.parse?.wikitext || "") : {};
    log(`staff: gm ${Object.keys(M).length} teams`);
    if (Object.keys(M).length >= 28) for (const [t, g] of Object.entries(M)) Object.assign(teams[t] = teams[t] || {}, { gm: g.gm, gmSince: g.since, gmHired: g.hired });
  } catch (e) { log("staff: gm " + e.message) }
  for (const [k, page] of Object.entries(PAGES)) {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json&formatversion=2`,
      { headers: { "User-Agent": "mycfbbigboard.com data job (staff names)" } });
    if (!r.ok) { log(`staff: ${page} → ${r.status}`); continue }
    const wt = noSR(await r.json())?.parse?.wikitext || "";
    const L = parseList(wt), n = Object.keys(L).length;
    log(`staff: ${k} ${n} teams`);
    if (n < 28) continue;                                   // a page mid-edit or reformatted: don't trust a partial read
    for (const [t, nm] of Object.entries(L)) (teams[t] = teams[t] || {})[k] = nm;
  }
  return teams;
}
