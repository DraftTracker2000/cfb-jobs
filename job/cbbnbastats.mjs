/* NBA play types, hustle and matchup defense (Oct 12 — Sam on the round 2 audit, hoopR NBA Stats: "we have this?", and "the NBA team
   profiles look very thin"). The open sportsdataverse releases carry NBA.com's tracking tables as Parquet (ZSTD), read the same way as
   the combine (job/cbbcombine.mjs):
     nba_stats_synergy/regular-season_{type}_{offensive|defensive}_totals_{season}.parquet — possessions, points, percentile by play type
     nba_stats_hustle/leaguehustlestats{player|team}_regular-season_totals_{season}.parquet — contests, deflections, charges, screens, loose balls, box-outs
     nba_stats_matchups/matchupsrollup_regular-season_totals_{season}.parquet — what the men a defender guarded scored on him
   NBA.com player ids map to ESPN's through nba_crosswalk (else the page matches on name).

   Pack p2000_cbb-nbastats (v2 adds ta/gb, toughest assignments): { v, got: [seasons], ptCols, hCols, mCols, s: { season: { p: { espnId|"n"+nbaId: { nm, tm, o: { type: [poss, pts,
   pctile, freq, ft trips] }, d: { type: [poss, pts, pctile] }, h: [...hCols], m: [...mCols] } }, t: { ESPN abbr: { o: { type: [poss, pts, freq, ft trips] },
   d: { type: [poss, pts] }, h: [...hCols] } } } }. Finished seasons are cached; the current one is re-read each run while it is being played. */
import { REL, readParquet, crosswalk } from "./cbbcombine.mjs";
import { buildNbaCoaches, teamOf } from "./cbbnbacoach.mjs";

export const PT_O = ["transition", "isolation", "prballhandler", "prrollman", "postup", "spotup", "handoff", "cut", "offscreen", "offrebound", "misc"];
export const PT_D = ["isolation", "prballhandler", "prrollman", "postup", "spotup", "handoff", "offscreen"];
export const H_COLS = ["g", "min", "contested", "contested3", "deflections", "charges", "screenAst", "screenAstPts", "looseBalls", "boxOuts"];
export const M_COLS = ["partialPoss", "pts", "fgm", "fga", "fg3m", "fg3a", "ast", "tov", "blk", "sfl"];
/* NBA.com's player tracking and dashboard tables (Oct 12 — Sam: the NBA Scoring and Defense tabs should have as much as the college
   ones): nba_stats_leaguedash/{file}_{season}.parquet, season totals. One row per player — the row with the most games (the files carry
   some players twice: an earlier snapshot, or a stint before a trade). Kept per player as x: [...X_COLS]. */
export const X_SRC = {
  player_tracking_catchshoot: ["catch_shoot_fgm", "catch_shoot_fga", "catch_shoot_fg3_m", "catch_shoot_fg3_a", "catch_shoot_pts"],
  player_tracking_pullupshot: ["pull_up_fgm", "pull_up_fga", "pull_up_fg3_m", "pull_up_fg3_a", "pull_up_pts"],
  player_tracking_drives: ["drives", "drive_fgm", "drive_fga", "drive_fta", "drive_pts", "drive_ast", "drive_tov"],
  player_tracking_possessions: ["touches", "time_of_poss", "avg_sec_per_touch", "avg_drib_per_touch", "elbow_touches", "post_touches", "paint_touches"],
  player_tracking_passing: ["passes_made", "potential_ast", "ast_pts_created", "secondary_ast"],
  player_stats_scoring: ["pct_pts_2_pt_mr", "pct_pts_3_pt", "pct_pts_paint", "pct_pts_ft", "pct_pts_fb", "pct_pts_off_tov", "pct_uast_fgm"],
  player_stats_advanced: ["off_rating", "def_rating", "net_rating", "usg_pct", "ts_pct", "pie", "ast_pct", "poss"],
  player_tracking_defense: ["def_rim_fgm", "def_rim_fga"],
  player_stats_defense: ["pct_stl", "pct_blk", "dreb_pct", "opp_pts_off_tov", "opp_pts_2_nd_chance", "opp_pts_fb", "opp_pts_paint"],
  player_tracking_rebounding: ["dreb_contest", "dreb_chances", "oreb_chances", "oreb"],
  player_tracking_speeddistance: ["dist_miles_off", "dist_miles_def", "avg_speed_off", "avg_speed_def"],
  player_stats_misc: ["pts_paint", "pts_fb", "pts_off_tov", "pts_2_nd_chance", "pfd", "pf"] };
export const X_COLS = ["gp", "min", ...Object.values(X_SRC).flat()];
const ABBR = { GSW: "GS", NYK: "NY", SAS: "SA", NOP: "NO", UTA: "UTAH", WAS: "WSH" }, ab = a => ABBR[a] || a;
const iso = v => v instanceof Date ? v.toISOString() : String(v || "");
const n = v => v == null ? 0 : typeof v === "bigint" ? Number(v) : +v || 0, r3 = v => Math.round(v * 1000) / 1000;

/* one season's files (objects already read) → the season block */
export function seasonBlock({ off = {}, def = {}, hp = [], ht = [], mu = [], lsm = [], xf = {} }, espnOf = {}) {
  const P = {}, T = {}, tmOfId = {}, key = id => espnOf[id] || "n" + id;
  const pl = (r) => { const k = key(n(r.player_id || r.def_player_id)); return P[k] = P[k] || { nm: String(r.player_name || r.def_player_name || ""), tm: r.team_abbreviation ? ab(r.team_abbreviation) : null } };
  for (const [side, files] of [["o", off], ["d", def]]) for (const [type, rows] of Object.entries(files)) for (const r of rows || []) {
    const p = pl(r), x = (p[side] = p[side] || {}), poss = n(r.poss), pts = n(r.pts), prev = x[type];
    if (r.team_id != null && r.team_abbreviation) tmOfId[n(r.team_id)] = ab(r.team_abbreviation);
    /* a traded player has a row per team: possessions and points add up; the percentile is the bigger stint's */
    /* [4] (offense): trips to the line — possessions on that play that ended in free throws (Oct 12, Sam: "we've left free throws out") */
    const ft = side === "o" ? Math.round(n(r.ft_poss_pct) * poss) : 0;
    x[type] = prev ? [prev[0] + poss, prev[1] + pts, poss > prev[0] ? r3(n(r.percentile)) : prev[2], ...(side === "o" ? [0, (prev[4] || 0) + ft] : [])] : [poss, pts, r3(n(r.percentile)), ...(side === "o" ? [0, ft] : [])];
    const t = r.team_abbreviation ? ab(r.team_abbreviation) : null; if (t) { const tt = (T[t] = T[t] || { o: {}, d: {} })[side], y = tt[type] = tt[type] || [0, 0]; y[0] += poss; y[1] += pts; if (side === "o") y[3] = (y[3] || 0) + ft } }
  /* frequency: share of his (the team's) play-type possessions */
  for (const p of Object.values(P)) if (p.o) { const tot = Object.values(p.o).reduce((a, v) => a + v[0], 0); for (const v of Object.values(p.o)) v[3] = tot ? r3(v[0] / tot) : 0 }
  for (const t of Object.values(T)) { const tot = Object.values(t.o).reduce((a, v) => a + v[0], 0); for (const v of Object.values(t.o)) v[2] = tot ? r3(v[0] / tot) : 0 }
  const hRow = r => [n(r.g), Math.round(n(r.min)), n(r.contested_shots), n(r.contested_shots_3_pt), n(r.deflections), n(r.charges_drawn), n(r.screen_assists), n(r.screen_ast_pts), n(r.loose_balls_recovered), n(r.box_outs)];
  for (const r of hp) { const p = pl(r), h = hRow(r); p.h = p.h ? p.h.map((v, i) => v + h[i]) : h; if (r.team_abbreviation && !p.tm) p.tm = ab(r.team_abbreviation) }
  for (const r of ht) { const t = tmOfId[n(r.team_id)]; if (t) (T[t] = T[t] || { o: {}, d: {} }).h = hRow({ ...r, g: 82 }) }
  for (const r of mu) { const p = pl(r), m = [n(r.partial_poss), n(r.player_pts), n(r.matchup_fgm), n(r.matchup_fga), n(r.matchup_fg3_m), n(r.matchup_fg3_a), n(r.matchup_ast), n(r.matchup_tov), n(r.matchup_blk), n(r.sfl)];
    p.m = p.m ? p.m.map((v, i) => Math.round((v + m[i]) * 10) / 10) : m.map(v => Math.round(v * 10) / 10) }
  /* toughest assignments (round 3): from the season matchups — the men each defender guarded longest, and the ones who guarded each
     scorer longest (eight each): [player key, name, seconds, points, fgm, fga, 3pm, 3pa] */
  if (lsm.length) { const TA = {}, GB = {}, push = (M, k, row) => (M[k] = M[k] || []).push(row);
    for (const r of lsm) { const d = key(n(r.def_player_id)), o = key(n(r.off_player_id)), sec = n(r.matchup_time_sec); if (sec < 120) continue;
      const st = [n(r.player_pts), n(r.matchup_fgm), n(r.matchup_fga), n(r.matchup_fg3_m), n(r.matchup_fg3_a)];
      push(TA, d, [o, String(r.off_player_name || ""), sec, ...st]); push(GB, o, [d, String(r.def_player_name || ""), sec, ...st]) }
    for (const [k, L] of Object.entries(TA)) if (P[k]) P[k].ta = L.sort((a, b) => b[2] - a[2]).slice(0, 8);   /* eight (Oct 12, Sam: "their top 8 matched on") */
    for (const [k, L] of Object.entries(GB)) if (P[k]) P[k].gb = L.sort((a, b) => b[2] - a[2]).slice(0, 8) }
  /* tracking and dashboard tables → x (minutes from the tracking files, which are season totals; gp from the same row) */
  const best = {}; for (const [f, rows] of Object.entries(xf)) { const B = best[f] = {}; for (const r of rows || []) { const id = n(r.player_id); if (!B[id] || n(r.gp) > n(B[id].gp)) B[id] = r } }
  const ids = new Set(Object.values(best).flatMap(B => Object.keys(B)));
  for (const id of ids) { const k = key(+id), p = P[k]; if (!p) continue; const tr = (best.player_tracking_drives || {})[id] || (best.player_tracking_possessions || {})[id]; if (!tr) continue;
    const x = [n(tr.gp), Math.round(n(tr.min))]; for (const [f, cols] of Object.entries(X_SRC)) { const r = (best[f] || {})[id]; for (const c of cols) x.push(r && r[c] != null ? Math.round(n(r[c]) * 1000) / 1000 : null) }
    p.x = x }
  return { p: P, t: T };
}

/* NBA.com team ids → ESPN abbreviations (the 30 franchises; ids are fixed) */
export const NBA_TID = { 1610612737: "ATL", 1610612738: "BOS", 1610612739: "CLE", 1610612740: "NO", 1610612741: "CHI", 1610612742: "DAL", 1610612743: "DEN", 1610612744: "GS", 1610612745: "HOU",
  1610612746: "LAC", 1610612747: "LAL", 1610612748: "MIA", 1610612749: "MIL", 1610612750: "MIN", 1610612751: "BKN", 1610612752: "NY", 1610612753: "ORL", 1610612754: "IND", 1610612755: "PHI", 1610612756: "PHX",
  1610612757: "POR", 1610612758: "SAC", 1610612759: "SA", 1610612760: "OKC", 1610612761: "TOR", 1610612762: "UTAH", 1610612763: "MEM", 1610612764: "WSH", 1610612765: "DET", 1610612766: "CHA" };
/* round 3 (Sam ticked "NBA five-man lineups and an NBA head coach line", and injury history):
   five-man units: nba_stats_leaguedash/lineups_advanced_{season} (group_quantity 5), each team's eight most used (30+ minutes):
     [player keys, NBA.com's short names, minutes, net, off. rating, def. rating, possessions, games]
   head coaches: nba_stats_coaches/coaches_{season} since 2010 (coach_type "Head Coach") → { team: [[season, name]] }
   injury reports: espn_nba_injuries/injuries_{season} (ESPN ids; the file starts with this season, so the log grows from here) →
     { espnId: [[date, status, injury, side, expected return]] (ESPN's written notes are left out — they're reporters' words) }, newest first, one row per injury, eight at most */
export function lineupRows(rows, espnOf = {}) { const T = {};
  for (const r of rows || []) { if (Number(r.group_quantity) !== 5 || (r.group_set && r.group_set !== "Lineups") || (r.season_type && !/regular/i.test(String(r.season_type)))) continue;   /* the file also holds the playoffs */ const t = NBA_TID[n(r.team_id)] || ab(String(r.team_abbreviation || "")); if (!t) continue;
    const ids = String(r.group_id || "").split("-").filter(Boolean).map(x => espnOf[+x] || "n" + x), min = Math.round(n(r.min)); if (ids.length !== 5 || min < 30) continue;
    (T[t] = T[t] || []).push([ids, String(r.group_name || "").split(" - "), min, n(r.net_rating), n(r.off_rating), n(r.def_rating), Math.round(n(r.poss)), n(r.gp)]) }
  for (const t in T) T[t] = T[t].sort((a, b) => b[2] - a[2]).slice(0, 8); return T }
export function injuryRows(rows) { const M = {}, seen = {};
  const L = (rows || []).slice().sort((a, b) => iso(b.as_of_date).localeCompare(iso(a.as_of_date)));
  for (const r of L) { const id = String(r.athlete_id || ""), k = String(r.injury_id || ""); if (!id || !k || seen[k]) continue; seen[k] = 1;
    (M[id] = M[id] || []).push([iso(r.injury_date || r.as_of_date).slice(0, 10), String(r.status || ""), String(r.detail_type || ""), String(r.detail_side || "").replace(/^Not Specified$/, ""), iso(r.detail_return_date).slice(0, 10)]) }
  for (const id in M) M[id] = M[id].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8); return M }
export async function buildNbaStats({ getPack, putPack, log, curNba, live, full }) {
  let K = full ? null : await getPack("p2000_cbb-nbastats").catch(() => null);
  if (!K || K.v !== 2) K = { v: 2, got: [], ptO: PT_O, ptD: PT_D, hCols: H_COLS, mCols: M_COLS, s: {} };
  const espnOf = await crosswalk([curNba - 1, curNba]); let files = 0;
  K.fin = K.fin || {};
  if (K.xv !== 2) { for (const y of Object.keys(K.fin)) delete K.fin[y]; K.xv = 2 }   /* (in the preseason the season just finished is curNba itself, so both seasons on hand) */   /* Oct 12: free-throw trips by play type, eight matchups each way, and the tracking tables — last season's files read once more, then kept */
  K.xCols = X_COLS; const want = [curNba - 1, curNba].filter(y => !K.got.includes(y) || (y === curNba && live) || !K.fin[y]);   /* a finished season once more after it ends, then never (Oct 12) */
  for (const y of want) {
    const get = async f => { files++; return readParquet(REL(f)).catch(e => (log(`nbastats ${f}: ${e.message}`), null)) };
    const off = {}, def = {};
    for (const t of PT_O) off[t] = await get(`nba_stats_synergy/regular-season_${t}_offensive_totals_${y}.parquet`);
    for (const t of PT_D) def[t] = await get(`nba_stats_synergy/regular-season_${t}_defensive_totals_${y}.parquet`);
    if (!Object.values(off).some(v => v && v.length)) { log(`nbastats ${y}: no play-type files yet`); continue }
    const hp = await get(`nba_stats_hustle/leaguehustlestatsplayer_regular-season_totals_${y}.parquet`) || [], ht = await get(`nba_stats_hustle/leaguehustlestatsteam_regular-season_totals_${y}.parquet`) || [],
      mu = await get(`nba_stats_matchups/matchupsrollup_regular-season_totals_${y}.parquet`) || [], lsm = await get(`nba_stats_matchups/leagueseasonmatchups_regular-season_totals_${y}.parquet`) || [];
    const xf = {}; for (const f of Object.keys(X_SRC)) xf[f] = await get(`nba_stats_leaguedash/${f}_${y}.parquet`) || [];
    K.s[y] = seasonBlock({ off, def, hp, ht, mu, lsm, xf }, espnOf); if (!K.got.includes(y)) K.got.push(y); if (!(y === curNba && live)) K.fin[y] = 1;
    log(`nbastats ${y}: ${Object.keys(K.s[y].p).length} players (${Object.keys(K.s[y].p).filter(k => !k.startsWith("n")).length} on ESPN ids) · ${Object.keys(K.s[y].t).length} teams`) }
  /* lineups for the seasons on hand; head coaches since 2010 (finished seasons kept); this season's injury reports */
  for (const y of Object.keys(K.s)) if (!K.s[y].lu || !K.luV || (+y === curNba && live)) { const rows = await readParquet(REL(`nba_stats_leaguedash/lineups_advanced_${y}.parquet`)).catch(e => (log(`nbastats lineups ${y}: ${e.message}`), null)); files++; if (rows) K.s[y].lu = lineupRows(rows, espnOf) }
  K.luV = 1; K.coach = K.coach || {}; K.coachGot = K.coachGot || [];
  for (let y = 2010; y <= curNba + 1; y++) { if (K.coachGot.includes(y) && y < curNba) continue; const rows = await readParquet(REL(`nba_stats_coaches/coaches_${y}.parquet`)).catch(() => null); files++; if (!rows || !rows.length) continue;
    for (const r of rows) { if (r.coach_type !== "Head Coach") continue; const t = NBA_TID[n(r.team_id)]; if (!t) continue; const L = K.coach[t] = (K.coach[t] || []).filter(x => x[0] !== y); L.push([y, String(r.coach_name || "")]); L.sort((a, b) => a[0] - b[0]) }
    if (!K.coachGot.includes(y)) K.coachGot.push(y) }
  /* the head coach now (Oct 12 — Sam: "so it doesnt catch coaching changes in the offseason?"; "do what you think is best"): NBA.com's
     coaches file only covers seasons played, so once a week ESPN's team rosters (30 public requests, no key) name each team's current
     head coach; it is filed under the season being played (or the next one before it starts), so a new hire shows right away and a
     coach who stays keeps his run */
  const coSeason = live ? curNba : curNba + 1;
  if (!K.coNowAt || Date.now() - K.coNowAt > 6 * 864e5) { let got = 0;
    for (let id = 1; id <= 30; id++) { try { const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${id}/roster`); if (!r.ok) continue; const d = await r.json();
        const t = d.team && d.team.abbreviation, c = (d.coach || [])[0]; if (!t || !c || !c.lastName) continue; let nm = `${c.firstName || ""} ${c.lastName}`.trim();
        const L = K.coach[t] = (K.coach[t] || []).filter(x => x[0] !== coSeason), kk = v => String(v).toLowerCase().replace(/[^a-z]/g, ""), prev = L[L.length - 1];
        if (prev && kk(prev[1]) === kk(nm)) nm = prev[1];   /* same man, NBA.com's spelling (J.B. / JB) so his run stays one run */ L.push([coSeason, nm]); L.sort((a, b) => a[0] - b[0]); got++ } catch { } }
    if (got >= 25) K.coNowAt = Date.now(); log(`nbastats: current head coaches from ESPN for ${got} teams (season ${coSeason})`) }
  for (const y of [curNba + 1, curNba]) { const rows = await readParquet(REL(`espn_nba_injuries/injuries_${y}.parquet`)).catch(() => null); files++; if (rows && rows.length) { K.inj = injuryRows(rows); K.injSeason = y; K.injAsOf = rows.reduce((a, r) => iso(r.as_of_date) > a ? iso(r.as_of_date) : a, "").slice(0, 10); break } }
  log(`nbastats: lineups for ${Object.keys(K.s).filter(y => K.s[y].lu).join(", ")} · coaches for ${Object.keys(K.coach).length} teams · injury reports for ${K.inj ? Object.keys(K.inj).length : 0} players`);
  /* NBA head coaches season by season from their Wikipedia record tables (job/cbbnbacoach.mjs, Oct 13): everyone in the coaches list,
     plus college head coaches with an NBA stop on their Wikipedia list (Michael Malone, Rick Pitino …) */
  try { const names = {}; for (const [t, L] of Object.entries(K.coach || {})) for (const [y, nm] of L) { const o = names[nm] = names[nm] || { list: [], cur: false }; if (!o.list.includes(t)) o.list.push(t); if (y >= curNba) o.cur = true }
    for (const y of [curNba, curNba - 1, curNba + 1]) { const CP = await getPack(`p${y}_cbb-coaches`).catch(() => null); if (!CP || !CP.coaches) continue;
      for (const c of Object.values(CP.coaches)) { const st = (c.wiki && c.wiki.stops) || []; const nb = st.map(s => teamOf(s[1])).filter(Boolean); if (nb.length && c.nm && !names[c.nm]) names[c.nm] = { list: nb, cur: false } } break }
    await buildNbaCoaches(K, names, log, curNba); files++ } catch (e) { log("nbastats coach records: " + e.message) }
  for (const y of Object.keys(K.s)) if (+y < curNba - 2) delete K.s[y];
  if (files) await putPack("p2000_cbb-nbastats", K);
  return K;
}
