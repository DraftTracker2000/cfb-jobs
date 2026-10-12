/* ── every NFL draft pick since 1997, built without Pro Football Reference (Oct 6, Sam: "i thought we switched to the nflverse data because it
   was safe for the draft?") ──
   nflverse's draft_picks.csv and combine.csv are both scraped from PFR ("courtesy of PFR", nflreadr's own docs), so neither is used any more.
   · the picks: ESPN's draft page, one request a draft year (the same ESPN the site already reads for depth charts and fantasy); a finished
     draft never changes, so past years are fetched once and kept in p<Y>_nfl-espndraft
   · who he is: nflverse's players file (NFL ids) — matched by ESPN id, then by draft year + overall pick, then by name + draft year
   · his career: nflverse's season stats (computed from the NFL play-by-play, 1999 on) and our own starts pack (depth charts, 2001 on).
     Pro Bowls and All-Pros are filled in by the page from our own honors list, as before.
   · the combine: the NFL Combine API's official results (array-carpenter/nfl-draft-data), pro days only for 2021 when there was no combine.
     Its NGS draft grade column is not used (NGS is off limits).
   Output: the same CSV columns the page always read, with name instead of pfr_player_name and no PFR value (AV) columns. */
import { csvRows } from "./lib/files.mjs";
import { gunzipSync } from "node:zlib";

const NF = "https://github.com/nflverse/nflverse-data/releases/download/";
const PD = "https://raw.githubusercontent.com/array-carpenter/nfl-draft-data/master/data/";
const FIRST = 1997;
export const DRAFT_COLS = ["season", "round", "pick", "team", "gsis_id", "name", "position", "college", "age", "to", "games", "seasons_started",
  "pass_yards", "pass_tds", "pass_ints", "rush_yards", "rush_tds", "receptions", "rec_yards", "rec_tds", "probowls", "allpro"];
const nk = x => String(x || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const esc = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v };
/* ESPN's team code → the codes the page has always used for draft teams (era codes for the moved franchises) */
const TEAM = (a, y) => { a = String(a || "").toUpperCase();
  if (a === "GB") return "GNB"; if (a === "KC") return "KAN"; if (a === "NO") return "NOR"; if (a === "NE") return "NWE"; if (a === "SF") return "SFO";
  if (a === "TB") return "TAM"; if (a === "WSH") return "WAS"; if (a === "LV" || a === "OAK") return y <= 2019 ? "OAK" : "LVR";
  if (a === "LAR" || a === "LA" || a === "STL") return y <= 2015 ? "STL" : "LAR"; if (a === "LAC" || a === "SD") return y <= 2016 ? "SDG" : "LAC"; return a };
const POS = p => { p = String(p || "").toUpperCase(); return p === "PK" ? "K" : p === "HB" ? "RB" : p };

async function text(url) { const r = await fetch(url, { redirect: "follow" }); if (!r.ok) throw new Error(url.split("/").slice(-2).join("/") + " → " + r.status); return url.endsWith(".gz") ? gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8") : r.text() }
const table = txt => { const R = csvRows(txt), H = R[0]; return R.slice(1).map(a => Object.fromEntries(H.map((h, i) => [h, a[i]]))) };

/* one draft year from ESPN → [season, round, overall, team, name, position, college, espn id] */
async function espnYear(y) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/draft?season=${y}`);
  if (!r.ok) throw new Error(`ESPN draft ${y} → ${r.status}`);
  const j = await r.json(), pos = {}, tm = {};
  for (const p of j.positions || []) pos[p.id] = p.abbreviation; for (const t of j.teams || []) tm[t.id] = t.abbreviation;
  return (j.picks || []).filter(p => p.athlete && p.overall && /SELECTION_MADE/.test(p.status || "SELECTION_MADE"))
    .map(p => [y, p.round, p.overall, TEAM(tm[p.teamId], y), p.athlete.displayName || "", POS(pos[p.athlete.position && p.athlete.position.id]),
      (p.athlete.team && (p.athlete.team.location || p.athlete.team.shortDisplayName)) || "", String(p.athlete.id || "")]);
}

/* the draft list: kept years from the last run + any year not kept yet + this year's (until its picks are in) */
export async function buildDraft({ getPack, putPack, curYear, log = console.log }) {
  const name = `p${curYear}_nfl-espndraft`; let kept = null; try { kept = getPack ? await getPack(name) : null } catch { }
  const Y = new Date().getUTCMonth() >= 3 ? curYear : curYear - 1;   // a draft is in once late April has passed
  const years = { ...((kept && kept.y) || {}) }; let fetched = 0;
  for (let y = FIRST; y <= Y; y++) { if (years[y] && years[y].length >= 220 && y < Y) continue; try { years[y] = await espnYear(y); fetched++ } catch (e) { log("draft: " + e.message) } }
  if (fetched && putPack) await putPack(name, { y: Object.fromEntries(Object.entries(years).filter(([, v]) => v.length >= 220)), at: Date.now(), src: "ESPN draft, one request a year" });

  /* NFL ids, birthdays, last season */
  const PL = table(await text(NF + "players/players.csv")), byEspn = {}, byPick = {}, byName = {}, bio = {};
  for (const o of PL) { if (!o.gsis_id) continue; bio[o.gsis_id] = o;
    if (o.espn_id && o.espn_id !== "NA") byEspn[String(Math.round(+o.espn_id))] = o.gsis_id;
    if (+o.draft_year && +o.draft_pick) (byPick[+o.draft_year + "|" + +o.draft_pick] = byPick[+o.draft_year + "|" + +o.draft_pick] || []).push(o.gsis_id);   // a list: supplemental picks reuse slot numbers
    if (+o.draft_year) (byName[nk(o.display_name) + "|" + +o.draft_year] = byName[nk(o.display_name) + "|" + +o.draft_year] || []).push(o.gsis_id) }
  /* a year ESPN didn't answer: the players file's own draft fields (complete from 2008 on; earlier years miss picks who never made a roster) */
  const fromPl = {}; for (const o of PL) { const y = +o.draft_year, ov = +o.draft_pick; if (!(y >= FIRST) || !ov) continue;
    (fromPl[y] = fromPl[y] || []).push([y, +o.draft_round || null, ov, TEAM(o.draft_team, y), o.display_name || "", POS(o.position), o.college_name || "", o.espn_id && o.espn_id !== "NA" ? String(Math.round(+o.espn_id)) : ""]) }
  let filled = 0; for (let y = FIRST; y <= Y; y++) if (!(years[y] && years[y].length >= 220) && fromPl[y]) { years[y] = fromPl[y].sort((a, b) => a[2] - b[2]); filled++ }
  log(`draft: ${Object.keys(years).length} drafts (${fetched} fetched from ESPN${filled ? `, ${filled} from the players file` : ""})`);

  /* games: weeks on the active roster in a week his team played (nflverse weekly rosters, 2002 on — tracks the old games column at r .96–.99
     by position, 2002–18 picks); before 2002, games in the season stats. Each finished season is counted once and kept (p<Y>_nfl-actg). */
  const last = new Date().getUTCMonth() >= 8 ? curYear : curYear - 1;
  let AG = null; try { AG = getPack ? await getPack(`p${curYear}_nfl-actg`) : null } catch { }
  const act = { ...((AG && AG.s) || {}) }; let actNew = 0;
  { const FRR = { STL: "LA", SD: "LAC", OAK: "LV", SL: "LA", ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", LAR: "LA" }, fr = t => FRR[t] || t; let tw = null;
    for (let y = 2002; y <= last; y++) { if (act[y] && y < last) continue;   /* a finished season once (Oct 12) */
      if (!tw) { tw = new Set(); for (const o of table(await text(NF + "schedules/games.csv.gz").catch(() => text(NF + "schedules/games.csv")))) if (o.game_type === "REG") for (const t of [o.home_team, o.away_team]) tw.add(o.season + "|" + fr(t) + "|" + o.week) }
      let t; try { t = await text(NF + `weekly_rosters/roster_weekly_${y}.csv`) } catch (e) { log("draft: rosters " + y + ": " + e.message); continue }
      const seen = new Set(), n = {}; for (const o of table(t)) { if (o.status !== "ACT" || !o.gsis_id) continue; const k = o.gsis_id + "|" + o.week; if (seen.has(k)) continue; seen.add(k);
        if (tw.has(y + "|" + fr(o.team) + "|" + o.week)) n[o.gsis_id] = (n[o.gsis_id] || 0) + 1 }
      act[y] = n; actNew++ }
    if (actNew && putPack) await putPack(`p${curYear}_nfl-actg`, { s: act, at: Date.now(), note: "regular-season weeks on the active roster in a week his team played" }) }
  /* career from the season stats (1999 on) */
  const C = {};
  /* each finished season's lines are read once and kept (Oct 12): p<Y>_nfl-statsreg { s: { season: { id: [games, py, ptd, pi, ry, rtd, rec, recy, rectd] } } } */
  let SR = null; try { SR = getPack ? await getPack(`p${curYear}_nfl-statsreg`) : null } catch { } SR = SR && SR.s ? SR : { s: {} }; let srNew = 0;
  for (let y = 1999; y <= last; y++) { let Y1 = y < last ? SR.s[y] : null;
    if (!Y1) { let t = null; try { t = await text(NF + `stats_player/stats_player_reg_${y}.csv`) } catch (e) { log("draft: stats " + y + ": " + e.message); continue }
      Y1 = {}; for (const o of table(t)) { const id = o.player_id; if (!id) continue; const a = Y1[id] = Y1[id] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
        [+o.games, +o.passing_yards, +o.passing_tds, +o.passing_interceptions, +o.rushing_yards, +o.rushing_tds, +o.receptions, +o.receiving_yards, +o.receiving_tds].forEach((v, i) => a[i] += v || 0) }
      if (y < last && Object.keys(Y1).length > 500) { SR.s[y] = Y1; srNew++ } }
    for (const [id, a] of Object.entries(Y1)) { const c = C[id] = C[id] || { to: 0, g: 0, py: 0, ptd: 0, pi: 0, ry: 0, rtd: 0, rec: 0, recy: 0, rectd: 0 };
      const g = a[0]; if (g > 0) c.to = Math.max(c.to, y); if (y < 2002) c.g += g;
      c.py += a[1]; c.ptd += a[2]; c.pi += a[3]; c.ry += a[4]; c.rtd += a[5]; c.rec += a[6]; c.recy += a[7]; c.rectd += a[8] } }
  if (srNew && putPack) await putPack(`p${curYear}_nfl-statsreg`, SR);
  /* starts (our own pack): a season he started half his team's games counts as a starting season; games = the larger of stats and starts */
  let ST = null; try { ST = getPack ? await getPack(`p${curYear}_nfl-starts`) : null } catch { }
  for (const y in act) for (const id in act[y]) { const c = C[id] = C[id] || { to: 0, g: 0, py: 0, ptd: 0, pi: 0, ry: 0, rtd: 0, rec: 0, recy: 0, rectd: 0 }; c.g += act[y][id]; if (act[y][id] >= 6) c.to = Math.max(c.to, +y) }
  const SS = {}, SG = {}; if (ST && ST.s) for (const s in ST.s) { const half = (ST.g[s] || 16) / 2; for (const id in ST.s[s]) { const n = ST.s[s][id]; SG[id] = (SG[id] || 0) + n; if (n >= half) SS[id] = (SS[id] || 0) + 1 } }

  const rows = [], miss = { id: 0 };
  for (const y of Object.keys(years).map(Number).sort((a, b) => a - b)) for (const [s, rd, ov, team, nm, pos, col, eid] of years[y]) {
    /* ESPN's draft-page athlete id is its own prospect id, not the ESPN player id in the players file (Oct 6: matching on it put Alex Smith
       under someone else's id) — so: the players file's own draft year + pick, then name + draft year; the name has to agree either way */
    const nmOk = g => g && bio[g] && (nk(bio[g].display_name) === nk(nm) || nk(bio[g].display_name).slice(-5) === nk(nm).slice(-5));
    const c1 = (byPick[s + "|" + ov] || []).find(nmOk), c2 = (byName[nk(nm) + "|" + s] || []).length === 1 ? byName[nk(nm) + "|" + s][0] : "";
    const id = (nmOk(c1) ? c1 : "") || c2 || "";
    if (!id) miss.id++;
    const b = bio[id] || {}, c = C[id] || {}, bd = b.birth_date && Date.parse(b.birth_date);
    const age = bd ? Math.floor((Date.parse(`${s}-04-25`) - bd) / (365.25 * 864e5)) : "";
    const lastS = c.to || (+b.last_season > 0 && (c.g || SG[id]) ? +b.last_season : 0) || "";
    rows.push([s, rd, ov, team, id, nm, pos, col, age, lastS, Math.max(c.g || 0, SG[id] || 0) || "", SS[id] || 0,
      c.py || 0, c.ptd || 0, c.pi || 0, c.ry || 0, c.rtd || 0, c.rec || 0, c.recy || 0, c.rectd || 0, 0, 0]) }
  log(`draft: ${rows.length} picks, ${miss.id} without an NFL id (mostly picks who never made a roster)`);
  return [DRAFT_COLS.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

/* the combine in the columns the page has always read (player_name, school, pos, season, draft_round, draft_ovr, ht, wt, forty, vertical,
   broad_jump, cone, shuttle, bench): official combine results, plus 2021's pro days (no combine that year) */
export async function buildCombine({ draftCsv, log = console.log }) {
  const off = table(await text(PD + "combine_official.csv")), pro = table(await text(PD + "combine_pro_day.csv"));
  const DR = {}; if (draftCsv) for (const o of table(draftCsv)) DR[nk(o.name) + "|" + o.season] = o;
  const out = ["player_name,school,pos,season,draft_round,draft_ovr,ht,wt,forty,vertical,broad_jump,cone,shuttle,bench"];
  const add = (nm, sch, pos, y, ht, wt, f, v, b, c, s, be) => { const d = DR[nk(nm) + "|" + y] || {}; out.push([nm, sch, pos, y, d.round || "", d.pick || "", ht, wt, f, v, b, c, s, be].map(esc).join(",")) };
  let n = 0; for (const o of off) { if (!o.player || !+o.year) continue; n++;
    add(o.player, o.college, o.position, +o.year, o.height, o.weight, o.forty_yard_dash, o.vertical_jump, o.broad_jump, o.three_cone_drill, o.twenty_yard_shuttle, o.bench_press) }
  let p21 = 0; for (const o of pro) { if (+o.Year !== 2021 || !o.player) continue; p21++;
    add(o.player, o.College, o.POS || o.POS_GP, 2021, o["Height (in)"], o["Weight (lbs)"], o["40 Yard"], o["Vert Leap (in)"], o["Broad Jump (in)"], o["3Cone"], o.Shuttle, o["Bench Press"]) }
  log(`combine: ${n} official results + ${p21} pro days for 2021`);
  return out.join("\n");
}
