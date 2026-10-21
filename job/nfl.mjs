/* The NFL side (Sam, Sept 28–29): built straight from nflverse's own files (CC BY 4.0) — no Pro Football Reference,
   OverTheCap, FTN or Next Gen Stats. Runs in the data job (modes "nfl" = this season and last, "nflhistory" = 1999 on)
   and writes packs the board reads:

     p<Y>_nfl-games        every game 1999 on: teams, score, site, rest, closing spread/total/moneylines, coaches, roof,
                           surface, weather, stadium, starting QBs
     p<Y>_nfl-players      every QB/RB/WR/TE who played 1999 on: bio, college, draft, years, headshot
     p<Y>_nfl-logs-<S>     one season of game logs for those players (regular season and playoffs)
     p<Y>_nfl-pbp-<S>      one season of play-by-play boiled down: passing zones (air yards × direction) for every passer,
                           receiver and defense; late-and-close, third down and red zone lines; runs by direction;
                           each game's score at the half, after three quarters, and its low and high point
     p<Y>_nfl-picks        who owns each pick of the next three drafts (trades read from ESPN's transaction feed)
     p<Y>_nfl-teams        each season's defense: yards allowed a game (pass, run), points, and FBS-style ranks
     p<Y>_nfl-depth        this week's depth charts (offense, OL and defense), the injury report, who's on reserve, and rookies
     p<Y>_nfl-dplayers     every defender 1999 on (DL, LB, DB): bio, college, draft
     p<Y>_nfl-def-<S>      one season of defensive game logs (tackles, TFL, sacks, QB hits, INT, passes defended, forced fumbles)
                           The pbp pack also carries each defender's plays by zone and side (df), each game's runs by gap (team.gapG)
                           and each game's starting line from the depth chart (ol) — Sam, Sept 30

   Every line is a plain array to keep the files small; the column lists sit at the top of each pack ("cols"). */

import { gunzipSync, gzipSync } from "node:zlib";
import { fixCoaches } from "./staff.mjs";
import { pickPack } from "./picks.mjs";
import { contractPack } from "./contracts.mjs";
import { classify, notHurt } from "./avail.mjs";
import { dynFeatures } from "./dyn.mjs";

const NF = "https://github.com/nflverse/nflverse-data/releases/download/";
const SKILL = new Set(["QB", "RB", "FB", "WR", "TE", "HB"]);
const FIRST = 1999;
/* defense (Sam, Sept 30: defensive profiles from the depth chart page, DROY/DPOY, defensive leaders) */
const DGRP = p => { p = (p || "").toUpperCase(); return /^(DE|DT|NT|DL|EDGE)$/.test(p) ? "DL" : /^(LB|OLB|ILB|MLB)$/.test(p) ? "LB" : /^(CB|DB|S|FS|SS|SAF)$/.test(p) ? "DB" : null };

/* a season's depth-chart and weekly-stats files are each read by more than one builder in a row (logs, starting line, starts, this week's
   chart): keep the last one of each */
const MEMO = {};
async function get(path, log) {
  const k = (path.match(/^(depth_charts|stats_player|pbp)\//) || [])[1];
  if (k) { if (MEMO[k] && MEMO[k].path === path) return MEMO[k].txt; let txt = await get0(path, log); if (k === "depth_charts") txt = await depthIdFix(path, txt, log); MEMO[k] = { path, txt }; return txt }
  return get0(path, log);
}
/* a dated depth chart (2025 on) can carry the wrong player's id: nflverse joins ESPN's chart to its players file by ESPN id, and a few
   ESPN ids sit on a long-retired namesake (Oct 6 audit: the Lions' rookie RT Blake Miller came through as a Blake Miller born in 1968; also
   James Thompson Jr., Anthony Lucas, Gary Smith III, Fred Davis II, Marlon Jones). An id whose player started 20+ years before this
   season, or one that isn't a gsis id at all, is swapped for the only recent player (rookie season in the last 4) with that exact name. */
const nkJ = x => String(x || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
async function depthIdFix(path, txt, log) {
  const S = +((path.match(/_(\d{4})\.csv/) || [])[1]); if (!txt || !S || !/^dt,/.test(txt)) return txt;
  const pt = await get0("players/players.csv", log); if (!pt) return txt;
  const P = {}, recent = {}; rows(pt, ["gsis_id", "display_name", "rookie_season"], o => { if (!o.gsis_id) return; const r = num(o.rookie_season); P[o.gsis_id] = r;
    if (r != null && r >= S - 4) { const k = nkJ(o.display_name); (recent[k] = recent[k] || new Set()).add(o.gsis_id) } });
  const fix = {}; rows(txt, ["gsis_id", "player_name"], o => { const id = o.gsis_id; if (!id || id in fix) return;
    const bad = !/^00-\d{7}$/.test(id) || (P[id] != null && P[id] < S - 20); if (!bad) { fix[id] = null; return }
    const c = recent[nkJ(o.player_name)]; fix[id] = c && c.size === 1 ? [...c][0] : null });
  const sw = Object.entries(fix).filter(([a, v]) => v && v !== a); if (!sw.length) return txt;
  log && log(`nfl: depth ${S}: ${sw.length} wrong ids fixed (${sw.map(([a, b]) => a + "→" + b).join(", ")})`);
  for (const [a, b] of sw) txt = txt.split("," + a + ",").join("," + b + ",");
  return txt;
}
export async function get0(path, log) {
  if (process.env.NFL_LOCAL) {   /* testing: the files from a local folder, by name */
    const fs = await import("node:fs"), f = process.env.NFL_LOCAL + "/" + path.split("/").pop();
    if (!fs.existsSync(f)) { log && log("nfl: no local " + f); return null }
    const b = fs.readFileSync(f); return path.endsWith(".gz") ? gunzipSync(b).toString("utf8") : b.toString("utf8");
  }
  const r = await fetch(NF + path, { redirect: "follow" });
  if (!r.ok) { log && log(`nfl: ${path} → ${r.status}`); return null }
  const b = Buffer.from(await r.arrayBuffer());
  return path.endsWith(".gz") ? gunzipSync(b).toString("utf8") : b.toString("utf8");
}

/* CSV, one row at a time, keeping only the columns asked for (the play-by-play file has 370+ columns) */
export function rows(txt, want, cb) {
  if (!txt) return;
  let i = 0, n = txt.length, head = null, idx = null;
  const line = () => {
    const out = []; let f = "", q = false;
    for (; i < n; i++) {
      const c = txt.charCodeAt(i);
      if (q) { if (c === 34) { if (txt.charCodeAt(i + 1) === 34) { f += '"'; i++ } else q = false } else f += txt[i] }
      else if (c === 34) q = true;
      else if (c === 44) { out.push(f); f = "" }
      else if (c === 10 || c === 13) { if (c === 13 && txt.charCodeAt(i + 1) === 10) i++; i++; break }
      else f += txt[i];
    }
    out.push(f); return out;
  };
  head = line(); idx = {}; head.forEach((h, j) => idx[h] = j);
  const cols = want.map(w => idx[w]);
  while (i < n) {
    const a = line(); if (a.length < 2) continue;
    const o = {}; want.forEach((w, j) => { const v = cols[j] == null ? "" : a[cols[j]]; o[w] = v }); cb(o);
  }
}
const num = v => { if (v === "" || v == null || v === "NA") return null; const x = +v; return isFinite(x) ? x : null };
const r1 = v => v == null ? null : Math.round(v * 10) / 10, r2 = v => v == null ? null : Math.round(v * 100) / 100;

/* ── games ── */
const GAME_COLS = ["id", "season", "type", "week", "date", "time", "away", "awayScore", "home", "homeScore", "neutral", "awayRest", "homeRest",
  "awayML", "homeML", "spread", "total", "div", "roof", "surface", "temp", "wind", "awayCoach", "homeCoach", "stadium", "awayQB", "homeQB"];
export async function games(log) {
  /* nflverse moved the schedule to games.csv.gz (Oct 6: the plain .csv started answering 404, and a run wrote an empty schedule) */
  const t = (await get("schedules/games.csv.gz", log)) || (await get("schedules/games.csv", log)); const out = [];
  rows(t, ["game_id", "season", "game_type", "week", "gameday", "gametime", "away_team", "away_score", "home_team", "home_score", "location", "away_rest", "home_rest",
    "away_moneyline", "home_moneyline", "spread_line", "total_line", "div_game", "roof", "surface", "temp", "wind", "away_coach", "home_coach", "stadium", "away_qb_id", "home_qb_id"], o => {
    const s = +o.season; if (!(s >= FIRST)) return;
    out.push([o.game_id, s, o.game_type, +o.week, o.gameday, o.gametime, o.away_team, num(o.away_score), o.home_team, num(o.home_score), o.location === "Neutral" ? 1 : 0,
      num(o.away_rest), num(o.home_rest), num(o.away_moneyline), num(o.home_moneyline), num(o.spread_line), num(o.total_line), num(o.div_game) ? 1 : 0,
      o.roof || null, o.surface || null, num(o.temp), num(o.wind), o.away_coach || null, o.home_coach || null, o.stadium || null, o.away_qb_id || null, o.home_qb_id || null]);
  });
  return { cols: GAME_COLS, g: out };
}

/* ── players ── */
const PLAYER_COLS = ["gsis", "name", "pos", "college", "born", "ht", "wt", "draftYear", "round", "pick", "draftTeam", "rookie", "last", "team", "status", "espn", "headshot"];
export async function players(log) {
  const t = await get("players/players.csv", log); const out = {}, def = {}, drafted = [], espn = {}, kp = {}, ol = {};
  rows(t, ["gsis_id", "display_name", "position", "college_name", "birth_date", "height", "weight", "draft_year", "draft_round", "draft_pick", "draft_team", "rookie_season",
    "last_season", "latest_team", "status", "espn_id", "headshot"], o => {
    if (!o.gsis_id) return; const last = num(o.last_season);
    if (o.espn_id && last != null && last >= new Date().getFullYear() - 3) espn[String(Math.round(+o.espn_id))] = o.gsis_id;
    /* for matching Sleeper's snaps to our ids: every ESPN id, and name + position */
    SNAP_ALL.add(o.gsis_id); if (o.espn_id) SNAP_ESPN[String(Math.round(+o.espn_id))] = o.gsis_id;
    if (o.display_name && last != null && last >= 2020) { const k = snapKey(o.display_name, o.position); (SNAP_NAME[k] = SNAP_NAME[k] || []).push(o.gsis_id) }
    if (/^(K|P|PK)$/i.test(o.position || "") && (last == null || last >= FIRST)) kp[o.gsis_id] = [o.display_name, (o.position || "").toUpperCase(), o.birth_date || null, o.college_name || null, last, o.latest_team || null];
    /* every drafted player at every position, linemen and kickers included (Sam, Sept 30: the GM's draft classes, graded) */
    if (num(o.draft_year) >= FIRST && num(o.draft_pick)) drafted.push([o.gsis_id, o.display_name, (o.position || "").toUpperCase() === "HB" ? "RB" : o.position || null,
      num(o.draft_year), num(o.draft_round), num(o.draft_pick), o.draft_team || null, last, o.latest_team || null, o.status || null, o.college_name || null,
      o.espn_id ? String(Math.round(+o.espn_id)) : null, o.birth_date || null]);
    if (last != null && last < FIRST) return;
    if (DGRP(o.position)) { def[o.gsis_id] = [o.display_name, o.position, o.college_name || null, o.birth_date || null, num(o.height), num(o.weight),
      num(o.draft_year), num(o.draft_round), num(o.draft_pick), o.draft_team || null, num(o.rookie_season), last, o.latest_team || null, o.status || null,
      o.espn_id ? String(Math.round(+o.espn_id)) : null, last != null && last >= new Date().getFullYear() - 2 ? o.headshot || null : null]; return }   // photos only for current players (keeps the file small)
    /* current offensive linemen: birthday and draft slot (Oct 1: the NFL trade machine ages every player) */
    if (/^(OL|OT|OG|C|G|T|LT|LG|RG|RT|IOL)$/i.test(o.position || "") && last != null && last >= new Date().getFullYear() - 1) { ol[o.gsis_id] = [o.birth_date || null, num(o.draft_year), num(o.draft_round), num(o.draft_pick), o.display_name || null, last, (o.position || "").toUpperCase()]; return }   // name/last/pos added Oct 7 (free-agent linemen in Be the GM)
    if (!SKILL.has((o.position || "").toUpperCase())) return;
    out[o.gsis_id] = [o.display_name, o.position === "HB" ? "RB" : o.position, o.college_name || null, o.birth_date || null, num(o.height), num(o.weight),
      num(o.draft_year), num(o.draft_round), num(o.draft_pick), o.draft_team || null, num(o.rookie_season), last, o.latest_team || null, o.status || null,
      o.espn_id ? String(Math.round(+o.espn_id)) : null, o.headshot || null];
  });
  return { cols: PLAYER_COLS.slice(1), p: out, def, drafted, espn, kp, ol, olCols: ["born", "draftYear", "round", "pick", "name", "last", "pos"] };
}

/* ── one season of game logs ── */
const DEF_COLS = ["week", "type", "game", "team", "opp", "solo", "ast", "tfl", "sk", "qbh", "int", "pd", "ff", "td"];
const LOG_COLS = ["week", "type", "game", "team", "opp", "cmp", "att", "pyd", "ptd", "int", "sk", "car", "ryd", "rtd", "tgt", "rec", "yds", "td", "fl", "tgtShare", "airShare", "epa", "fp", "snp", "tsnp",
  /* scoring bonuses (Sam, Oct 4: "Sleeper also has bonuses for all positions, they both do, full lists"): every fumble (lost or not), two-point
     conversions, first downs — from the weekly stats; long touchdowns (40+/50+), pick-sixes thrown and 40+ yard plays — from the play-by-play */
  "fum", "p2", "r2", "c2", "pfd", "rfd", "cfd", "ptd40", "ptd50", "rtd40", "rtd50", "ctd40", "ctd50", "pi6", "cmp40", "car40", "rec40"];
const BON_N = 10;   // the play-by-play ones: ptd40 … rec40
/* offensive snaps, game by game (Sam, Oct 3: "so many sites have that and we don't"): Sleeper's public weekly stats (the same free API the
   fantasy pages read) — off_snp and tm_off_snp for every player, 2020 on. Not Pro Football Reference (nflverse's snap file comes from there,
   so it isn't used). Matched to nflverse ids through Sleeper's player list (gsis_id). */
const OPQ_COLS = ["rush in 5", "rush 6-10", "rush 11-20", "rush 21-50", "rush 51+", "tgt behind LOS", "tgt 0-9 air", "tgt 10-19 air", "tgt 20+ air", "tgt red zone", "tgt end zone", "rush competitive", "tgt competitive", "opp 3rd/4th down"];
let SLP_IDS = null;const SNAP_ESPN = {}, SNAP_NAME = {}, SNAP_ALL = new Set();
const snapKey = (n, p) => String(n || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "") + "|" + ({ FB: "RB", HB: "RB" }[String(p || "").toUpperCase()] || String(p || "").toUpperCase());
async function sleeperSnaps(S, log) {
  if (S < 2020) return null;
  try {
    /* Sleeper's player list comes from the site's own copy (/api/slp-players, refreshed by the worker's one read a day), not from Sleeper
       (Oct 11 audit: this run was a second daily read of the 5 MB list, against Sleeper's "once a day at most") */
    if (!SLP_IDS) { const r = await fetch((process.env.SITE_URL || "https://mycfbbigboard.com") + "/api/slp-players", { headers: { Authorization: "Bearer " + (process.env.JOB_TOKEN || "") } }); if (!r.ok) { log(`nfl: site sleeper directory ${r.status}`); return null } const J = await r.json(), P = {};
      for (const [k, x] of Object.entries((J && J.p) || {})) P[k] = { full_name: x[0], position: x[1], espn_id: x[4], gsis_id: x[5] || "" }; SLP_IDS = {};
      /* Sleeper's gsis id when it has one, else its ESPN id, else a unique name + position (newer players often lack the gsis id) */
      for (const k in P) { const p = P[k]; if (!p) continue; let g = p.gsis_id && SNAP_ALL.has(String(p.gsis_id).trim()) ? String(p.gsis_id).trim() : null;   // only a gsis id we know
        if (!g && p.espn_id) g = SNAP_ESPN[String(p.espn_id)] || null;
        if (!g) { const L = SNAP_NAME[snapKey(p.full_name, p.position)] || []; if (L.length === 1) g = L[0] }
        if (g) SLP_IDS[k] = g } }
    const out = {}; let n = 0;
    for (let w = 1; w <= 18; w++) {
      const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${S}/${w}`); if (!r.ok) continue; const J = await r.json();
      for (const k in J) { const x = J[k], g = SLP_IDS[k]; if (!g || x.off_snp == null) continue; (out[g] = out[g] || {})[w] = [x.off_snp, x.tm_off_snp ?? null]; n++ }
      await new Promise(z => setTimeout(z, 250));   // gentle on Sleeper's API
    }
    log(`nfl: snaps ${S}: ${n} player-games (${Object.keys(SLP_IDS).length} Sleeper players matched)`); return out;
  } catch (e) { log(`nfl: snaps ${S}: ${e.message}`); return null }
}
async function logs(S, log) {
  const t = await get(`stats_player/stats_player_week_${S}.csv`, log); if (!t) return null; const out = {}, D = {};
  rows(t, ["player_id", "position", "week", "season_type", "game_id", "team", "opponent_team", "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
    "sacks_suffered", "carries", "rushing_yards", "rushing_tds", "targets", "receptions", "receiving_yards", "receiving_tds", "rushing_fumbles_lost", "receiving_fumbles_lost",
    "sack_fumbles_lost", "rushing_fumbles", "receiving_fumbles", "sack_fumbles", "passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions",
    "passing_first_downs", "rushing_first_downs", "receiving_first_downs", "target_share", "air_yards_share", "passing_epa", "rushing_epa", "receiving_epa", "fantasy_points_ppr",
    "def_tackles_solo", "def_tackles_with_assist", "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_qb_hits", "def_interceptions", "def_pass_defended", "def_fumbles_forced", "def_tds"], o => {
    if (!o.player_id) return;
    if (DGRP(o.position)) { const n = k => num(o[k]) || 0;
      (D[o.player_id] = D[o.player_id] || []).push([+o.week, o.season_type === "POST" ? "P" : "R", o.game_id || null, o.team || null, o.opponent_team || null,
        n("def_tackles_solo"), n("def_tackle_assists") + n("def_tackles_with_assist"), n("def_tackles_for_loss"),   /* Oct 8: shared tackles where he had first credit ("with assist") were left out — 3–5 a season for a starter; they're assisted tackles */ n("def_sacks"), n("def_qb_hits"), n("def_interceptions"), n("def_pass_defended"),
        n("def_fumbles_forced"), n("def_tds")]); return }
    if (!SKILL.has((o.position || "").toUpperCase())) return;
    const n = k => num(o[k]) || 0;
    const epa = (num(o.passing_epa) || 0) + (num(o.rushing_epa) || 0) + (num(o.receiving_epa) || 0);
    (out[o.player_id] = out[o.player_id] || []).push([+o.week, o.season_type === "POST" ? "P" : "R", o.game_id || null, o.team || null, o.opponent_team || null,
      n("completions"), n("attempts"), n("passing_yards"), n("passing_tds"), n("passing_interceptions"), n("sacks_suffered"), n("carries"), n("rushing_yards"), n("rushing_tds"),
      n("targets"), n("receptions"), n("receiving_yards"), n("receiving_tds"), n("rushing_fumbles_lost") + n("receiving_fumbles_lost") + n("sack_fumbles_lost"),
      r2(num(o.target_share)), r2(num(o.air_yards_share)), r2(epa), r1(num(o.fantasy_points_ppr)), null, null,
      n("rushing_fumbles") + n("receiving_fumbles") + n("sack_fumbles"), n("passing_2pt_conversions"), n("rushing_2pt_conversions"), n("receiving_2pt_conversions"),
      n("passing_first_downs"), n("rushing_first_downs"), n("receiving_first_downs"), ...new Array(BON_N).fill(0)]);
  });
  /* snaps from Sleeper, regular season (2020 on) */
  const SN = await sleeperSnaps(S, log); if (SN) for (const id in out) { const m = SN[id]; if (!m) continue; for (const row of out[id]) { if (row[1] !== "R") continue; const x = m[row[0]]; if (x) { row[23] = x[0]; row[24] = x[1] } } }
  return { cols: LOG_COLS, s: S, p: out, def: { cols: DEF_COLS, s: S, p: D } };
}

/* ── one season of play-by-play, boiled down ── */
const ZONE = ay => ay == null ? null : ay < 0 ? "B" : ay < 10 ? "S" : ay < 20 ? "I" : "D";
const LOC = { left: "L", middle: "M", right: "R" };
/* a passing line: attempts, completions, yards, TD, INT, sacks, fumbles lost, EPA sum, first downs */
const line = () => [0, 0, 0, 0, 0, 0, 0, 0, 0];
function addPass(L, o) { if (o.sack) { L[5]++; L[2] += o.yds; if (o.fl) L[6]++; L[7] += o.epa; return } L[0]++; if (o.cmp) { L[1]++; L[2] += o.yds } if (o.td) L[3]++; if (o.int) L[4]++; if (o.fl) L[6]++; L[7] += o.epa; if (o.fd) L[8]++ }
async function pbp(S, log) {
  const t = await get(`pbp/play_by_play_${S}.csv.gz`, log); if (!t) return null;
  const LGD = {}, LYH = {};
  const P = {}, R = {}, U = {}, T = {}, G = {}, WX = {}, DRV = {}, FS = {}, DF = {}, OPQ = {}, INJ = {}, BON = {};
  /* who was thrown at on each side (Sam, Sept 30: "Detroit's best side" means nothing if Detroit gets torn apart everywhere): each
     receiver's targets and yards by side, and against each defense by side — so a side can be judged against who was thrown at */
  const RS = {}, DS = {}, LG = { L: [0, 0], M: [0, 0], R: [0, 0] }, RZ = {}, DZ = {}, LZ = {};   // the same by zone (depth × side)
  /* each defender's plays, like the college chart but named outright by nflverse: pass plays near him by zone × side (catches he
     tackled, passes defended, picks), run tackles by side (stops = 2 yards or less), sacks, QB hits, forced fumbles, TFLs.
     Sides are the offense's left / middle / right, as the play-by-play gives them. */
  /* where a tackle happens (Sam, Oct 1): a "stop" holds the play short of a successful gain — under 45% of the yards needed on 1st down,
     60% on 2nd, all of them on 3rd/4th. Tested 2016–25: a defender's stop share and his average tackle depth repeat year to year (LB 0.43–0.52,
     DB 0.49–0.51, DL 0.25–0.39 — far more than tackle counts tell you), and for DL/LB they predict next year's starts beyond this year's starts
     and tackles (0.11–0.13). More tackles went with a lower stop rate for linebackers (−0.32): volume isn't quality. */
  const STOPN = o => { const dn = num(o.down) || 1, tg = num(o.ydstogo) || 10; return (dn === 1 ? .45 : dn === 2 ? .6 : 1) * tg };
  const df = (id, t) => { const d = DF[id] = DF[id] || { t, P: {}, R: { L: [0, 0], M: [0, 0], R: [0, 0] }, Q: [0, 0, 0, 0, 0, 0], sk: 0, qbh: 0, ff: 0, tfl: 0, g: new Set() }; d.t = t; return d };
  const ids = (o, ks) => { const out = []; for (const k of ks) if (o[k] && o[k] !== "NA" && !out.includes(o[k])) out.push(o[k]); return out };
  const hsF = o => num(o.total_home_score) != null && num(o.total_away_score) != null;
  const WPS = {}, YACS = [];
  const pl = (M, id) => M[id] = M[id] || { Z: {}, all: line(), late: line(), third: [0, 0], rz: line(), two: line() };
  const zc = (Z, k) => Z[k] = Z[k] || [0, 0, 0, 0, 0, 0];   // att, cmp, yds, td, int, epa
  rows(t, ["game_id", "season_type", "home_team", "away_team", "posteam", "defteam", "qtr", "down", "ydstogo", "yardline_100", "play_type", "yards_gained", "pass_location",
    "air_yards", "run_location", "epa", "score_differential", "total_home_score", "total_away_score", "complete_pass", "interception", "touchdown", "sack", "fumble_lost",
    "passer_player_id", "receiver_player_id", "rusher_player_id", "qb_spike", "qb_kneel", "two_point_attempt", "first_down", "third_down_converted", "aborted_play", "weather", "roof",
    "fixed_drive", "half_seconds_remaining", "posteam_score", "defteam_score", "posteam_score_post", "defteam_score_post", "run_gap", "success",
    "solo_tackle_1_player_id", "solo_tackle_2_player_id", "assist_tackle_1_player_id", "assist_tackle_2_player_id", "tackle_with_assist_1_player_id", "tackle_with_assist_2_player_id",
    "pass_defense_1_player_id", "pass_defense_2_player_id", "interception_player_id", "sack_player_id", "half_sack_1_player_id", "half_sack_2_player_id",
    "qb_hit_1_player_id", "qb_hit_2_player_id", "forced_fumble_player_1_player_id", "forced_fumble_player_2_player_id", "tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id", "desc", "wp", "pass_touchdown", "rush_touchdown", "return_touchdown", "td_player_id", "receiving_yards", "rushing_yards",
    "lateral_receiver_player_id", "lateral_receiving_yards", "lateral_rusher_player_id", "lateral_rushing_yards", "cpoe", "comp_air_epa", "comp_yac_epa", "qb_scramble", "pass_oe", "qb_dropback", "game_seconds_remaining", "spread_line", "yards_after_catch"], o => {
    const g = o.game_id; if (!g) return;
    /* fantasy bonuses by player and game: [pass TD 40+, 50+, rush TD 40+, 50+, catch TD 40+, 50+, pick-six thrown, completion 40+, run 40+, catch 40+] */
    if (o.two_point_attempt !== "1") { const yg = num(o.yards_gained), id = x => x && x !== "NA" ? x : null;
      const b = (pid, i) => { if (!pid) return; const m = BON[pid] = BON[pid] || {}; (m[g] = m[g] || new Array(BON_N).fill(0))[i]++ };
      const ps = id(o.passer_player_id), rc = id(o.receiver_player_id), ru = id(o.rusher_player_id), td = id(o.td_player_id);
      /* laterals (Sam, Oct 4 — Evans caught it for 2 and pitched to Deebo Samuel, who went 80 for the score): the passer gets the whole play;
         each ball carrier gets his own yards, and the touchdown bonus goes to whoever scored */
      const lrc = id(o.lateral_receiver_player_id), lru = id(o.lateral_rusher_player_id), lry = num(o.lateral_receiving_yards) || 0, lrr = num(o.lateral_rushing_yards) || 0;
      const rcY = lrc ? num(o.receiving_yards) ?? (yg - lry) : yg, ruY = lru ? num(o.rushing_yards) ?? (yg - lrr) : yg;
      if (o.pass_touchdown === "1" && yg != null) { if (yg >= 40) b(ps, 0); if (yg >= 50) b(ps, 1);
        const [who, y] = lrc && td === lrc ? [lrc, lry] : [rc, rcY]; if (y >= 40) b(who, 4); if (y >= 50) b(who, 5) }
      if (o.rush_touchdown === "1" && yg != null) { const [who, y] = lru && td === lru ? [lru, lrr] : [ru, ruY]; if (y >= 40) b(who, 2); if (y >= 50) b(who, 3) }
      if (o.interception === "1" && o.return_touchdown === "1") b(ps, 6);
      if (o.complete_pass === "1" && yg != null) { if (yg >= 40) b(ps, 7); if (rcY >= 40) b(rc, 9); if (lrc && lry >= 40) b(lrc, 9) }
      if (o.play_type === "run" && yg != null) { if (ruY >= 40) b(ru, 8); if (lru && lrr >= 40) b(lru, 8) } }
    /* hurt during a game (Sam, Oct 3: "why don't you see it when it says a player was injured during the play?"): the play-by-play's own line,
       "L.McConkey was injured during the play." — kept by game with the quarter; matched to players after the logs are built */
    if (o.desc && o.desc.includes("injured")) { const re = /((?:[A-Z][a-z]?\.){1,2}\s?(?:St\.\s?)?[A-Z][A-Za-z'\-]+(?:\s(?:Jr|Sr|II|III|IV|V)\.?)?) was injured/g; let mm;
      while ((mm = re.exec(o.desc))) (INJ[g] = INJ[g] || []).push([mm[1], num(o.qtr) || null, o.posteam || null, o.defteam || null]) }
    /* each ball-carrier's and target's opportunities, by where they came (Sam, Oct 3: "where his usage is on the field, middle, redzone,
       what down"): carries by field position, targets by depth, red-zone and end-zone targets, how many came while the game was still
       competitive (win probability 10–90%), and on 3rd/4th down. Values come later, fitted on the past. */
    if (o.season_type !== "POST" && !(o.two_point_attempt === "1" || o.qb_kneel === "1" || o.qb_spike === "1" || o.aborted_play === "1")) {
      const yl = num(o.yardline_100), wp = num(o.wp), comp = wp != null && wp >= .1 && wp <= .9, d34 = num(o.down) >= 3;
      const op = id => { const m = OPQ[id] = OPQ[id] || {}; return m[g] = m[g] || new Array(OPQ_COLS.length).fill(0) };
      if (o.play_type === "run" && o.rusher_player_id && o.rusher_player_id !== "NA" && yl != null) { const x = op(o.rusher_player_id);
        x[yl <= 5 ? 0 : yl <= 10 ? 1 : yl <= 20 ? 2 : yl <= 50 ? 3 : 4]++; if (comp) x[11]++; if (d34) x[13]++ }
      else if (o.play_type === "pass" && o.receiver_player_id && o.receiver_player_id !== "NA" && yl != null) { const x = op(o.receiver_player_id), ay = num(o.air_yards);
        x[ay == null ? 6 : ay < 0 ? 5 : ay < 10 ? 6 : ay < 20 ? 7 : 8]++; if (yl <= 20) x[9]++; if (ay != null && ay >= yl) x[10]++; if (comp) x[12]++; if (d34) x[13]++ } }
    /* drives, for comebacks and game-winning drives (Sam, Sept 29: clutch in depth) */
    if (o.posteam && o.fixed_drive) { const k = g + "|" + o.fixed_drive, ps = num(o.posteam_score), ds = num(o.defteam_score);
      const dv = DRV[k] = DRV[k] || { g, t: o.posteam, q: num(o.qtr), d0: ps != null && ds != null ? ps - ds : null, d1: null, P: {} };
      const pp = num(o.posteam_score_post), dp = num(o.defteam_score_post); if (pp != null && dp != null) dv.d1 = pp - dp;
      if (o.play_type === "pass" && o.passer_player_id) dv.P[o.passer_player_id] = (dv.P[o.passer_player_id] || 0) + 1;
      else if (o.play_type === "run" && o.rusher_player_id && o.passer_player_id) dv.P[o.passer_player_id] = (dv.P[o.passer_player_id] || 0) + 1 }
    if (hsF(o)) FS[g] = [o.home_team, o.away_team, num(o.total_home_score), num(o.total_away_score)];
    if (!(g in WX)) WX[g] = precipOf(o.weather, o.roof);
    /* the score as the game went: home margin at the half, after three quarters, low and high */
    const hs = num(o.total_home_score), as = num(o.total_away_score), q = num(o.qtr);
    if (hs != null && as != null) { const m = hs - as, x = G[g] = G[g] || [null, null, 0, 0, o.home_team, o.away_team];
      if (q <= 2) x[0] = m; if (q <= 3) x[1] = m; if (m < x[2]) x[2] = m; if (m > x[3]) x[3] = m }
    if (o.two_point_attempt === "1" || o.qb_spike === "1" || o.qb_kneel === "1" || o.aborted_play === "1") return;
    /* pass protection (Sam, Oct 1: the best offensive lines): dropbacks, sacks and QB hits, for the offense (prO, and game by game prG)
       and the defense (prD) — so a line's sack rate can be read against the pass rushes it faced */
    if (o.play_type === "pass" && o.posteam && o.defteam) { const hit = !!o.qb_hit_1_player_id || o.sack === "1";
      const pr = (k, tm) => { const x = T[tm] = T[tm] || { off: {}, def: {} }; return x[k] = x[k] || [0, 0, 0] };
      for (const v of [pr("prO", o.posteam), pr("prD", o.defteam)]) { v[0]++; if (o.sack === "1") v[1]++; if (hit) v[2]++ }
      const gq = (T[o.posteam].prG = T[o.posteam].prG || {})[g] = T[o.posteam].prG[g] || [0, 0, 0]; gq[0]++; if (o.sack === "1") gq[1]++; if (hit) gq[2]++ }
    if (o.defteam && (o.play_type === "pass" || o.play_type === "run")) {
      const t = o.defteam, tk = ids(o, ["solo_tackle_1_player_id", "solo_tackle_2_player_id", "assist_tackle_1_player_id", "assist_tackle_2_player_id", "tackle_with_assist_1_player_id", "tackle_with_assist_2_player_id"]);
      for (const id of ids(o, ["sack_player_id"])) df(id, t).sk += 1;
      for (const id of ids(o, ["half_sack_1_player_id", "half_sack_2_player_id"])) df(id, t).sk += .5;
      for (const id of ids(o, ["qb_hit_1_player_id", "qb_hit_2_player_id"])) df(id, t).qbh++;
      for (const id of ids(o, ["forced_fumble_player_1_player_id", "forced_fumble_player_2_player_id"])) df(id, t).ff++;
      for (const id of ids(o, ["tackle_for_loss_1_player_id", "tackle_for_loss_2_player_id"])) df(id, t).tfl++;
      const side = LOC[o.play_type === "pass" ? o.pass_location : o.run_location];
      if (o.play_type === "pass" && o.sack !== "1" && side) { const z = ZONE(num(o.air_yards)), k = (z || "S") + side;
        const hit = (id, i) => { const d = df(id, t); d.g.add(g); const a = d.P[k] = d.P[k] || [0, 0, 0]; a[i]++ };
        if (o.complete_pass === "1") for (const id of tk) { hit(id, 0); const q = df(id, t).Q, y = num(o.yards_gained) || 0; q[3]++; q[4] += y; if (y < STOPN(o)) q[5]++ }
        for (const id of ids(o, ["pass_defense_1_player_id", "pass_defense_2_player_id"])) hit(id, 1);
        for (const id of ids(o, ["interception_player_id"])) hit(id, 2) }
      else if (o.play_type === "run" && side) { const y = num(o.yards_gained) || 0; for (const id of tk) { const d = df(id, t); d.g.add(g); d.R[side][0]++; if (y <= 2) d.R[side][1]++; d.Q[0]++; d.Q[1] += y; if (y < STOPN(o)) d.Q[2]++ } } }
    const pt = o.play_type, epa = num(o.epa) || 0, yds = num(o.yards_gained) || 0, late = q >= 4 && Math.abs(num(o.score_differential) || 0) <= 8,
      third = num(o.down) === 3, rz = (num(o.yardline_100) || 99) <= 20, td = o.touchdown === "1", fl = o.fumble_lost === "1",
      two = (num(o.half_seconds_remaining) ?? 999) <= 120 && q !== 5;   // the two-minute drill: last 2:00 of either half
    /* Oct 11 (#334 — Sam on nflverse's unused columns: "i don't get why all this stuff is available and we arent using it"): per QB
       adv = [CPOE sum, plays with CPOE, completed air EPA, completed YAC EPA, attempts, scrambles, dropbacks]; per team proe = [pass rate over
       expected sum (points), plays with it] — nflverse's own models (completion probability, expected pass rate), not ours */
    if (o.qb_dropback === "1" && o.two_point_attempt !== "1") { const qid = o.qb_scramble === "1" ? o.rusher_player_id : o.passer_player_id;
      if (qid && qid !== "NA") { const a = pl(P, qid).adv = pl(P, qid).adv || [0, 0, 0, 0, 0, 0, 0]; a[6]++; if (o.qb_scramble === "1") a[5]++;
        const c = num(o.cpoe); if (c != null) { a[0] += c; a[1]++ } const ae = num(o.comp_air_epa), ye = num(o.comp_yac_epa);   /* completions only (nflverse: 0 on an incompletion); air_epa/yac_epa would charge every incompletion to YAC */ if (ae != null && ye != null && o.sack !== "1") { a[2] += ae; a[3] += ye; a[4]++ } } }
    /* Oct 12 (Sam: NFL team situational lines "yes, obviously" — approved in the first audit): each team's offense and defense on third
       down (conversions), late and close (4th/OT within 8), the two-minute drill (EPA per play) and red-zone trips (drives that reached
       the 20, and how many ended in a touchdown) → team.sit = { o, d } with third [att, conv], late [plays, epa], two [plays, epa], rz [trips, td] */
    if ((pt === "pass" || pt === "run") && o.posteam && o.defteam && o.two_point_attempt !== "1") {
      /* per game, each side's plays, EPA and successes → team.gm[game] = [off plays, off epa, off success, def plays, def epa, def success] (Oct 12) */
      { const ep0 = num(o.epa) || 0, sc = o.success === "1" ? 1 : 0; for (const [t, k] of [[o.posteam, 0], [o.defteam, 3]]) { const x = T[t] = T[t] || { off: {}, def: {} }, gm = (x.gm = x.gm || {})[g] = (x.gm || {})[g] || [0, 0, 0, 0, 0, 0]; gm[k]++; gm[k + 1] += ep0; gm[k + 2] += sc } }
      const S2 = t => { const x = T[t] = T[t] || { off: {}, def: {} }; return x.sit = x.sit || { o: { third: [0, 0], late: [0, 0], two: [0, 0], rzd: {} }, d: { third: [0, 0], late: [0, 0], two: [0, 0], rzd: {} } } };
      const ep = num(o.epa) || 0, k = g + "|" + o.fixed_drive, otd = o.pass_touchdown === "1" || o.rush_touchdown === "1";
      for (const z of [S2(o.posteam).o, S2(o.defteam).d]) {
        if (third) { z.third[0]++; if (o.third_down_converted === "1") z.third[1]++ }
        if (late) { z.late[0]++; z.late[1] += ep } if (two) { z.two[0]++; z.two[1] += ep }
        if ((num(o.yardline_100) ?? 99) <= 20 || (otd && k in z.rzd)) { if (!(k in z.rzd)) z.rzd[k] = 0; if (otd) z.rzd[k] = 1 } } }
    /* special teams (Oct 12 — first audit: "special teams people … hmm. ok"): each team's EPA on its own punts, kickoffs and field goals
       (and extra points), and on the punts and kickoffs it returned → team.st = { pu, ko, fg, pr, kr: [plays, epa] } */
    if (/^(punt|kickoff|field_goal|extra_point)$/.test(o.play_type || "") && o.posteam && o.defteam && num(o.epa) != null) { const ep = num(o.epa);
      const ST = t => { const x = T[t] = T[t] || { off: {}, def: {} }; return x.st = x.st || { pu: [0, 0], ko: [0, 0], fg: [0, 0], pr: [0, 0], kr: [0, 0] } };
      /* nflverse puts the kicking team in posteam on punts and field goals, and the RECEIVING team on kickoffs */
      if (o.play_type === "punt") { const a = ST(o.posteam).pu, b = ST(o.defteam).pr; a[0]++; a[1] += ep; b[0]++; b[1] -= ep }
      else if (o.play_type === "kickoff") { const a = ST(o.defteam).ko, b = ST(o.posteam).kr; a[0]++; a[1] -= ep; b[0]++; b[1] += ep }
      else { const a = ST(o.posteam).fg; a[0]++; a[1] += ep } }
    /* Oct 12 (round 2, on nflverse's win probability added — Sam: "who comes up with this?"): the play's state for OUR win model (the one
       on the game pages), kept in order per game so each play's win probability added can be worked out after the loop; and each
       completion's air yards, side and yards after the catch for our own expected-YAC */
    if (o.posteam && o.defteam && num(o.down) >= 1 && num(o.game_seconds_remaining) != null && num(o.score_differential) != null) {
      const home = o.posteam === o.home_team, sp0 = num(o.spread_line) || 0;
      (WPS[g] = WPS[g] || []).push({ off: o.posteam, m: num(o.score_differential), sec: num(o.game_seconds_remaining), sp: home ? sp0 : -sp0, ytg: num(o.yardline_100) ?? 75, dn: num(o.down), ds: num(o.ydstogo) || 10, home,
        pt, ps: o.passer_player_id && o.passer_player_id !== "NA" ? o.passer_player_id : null, ru: o.rusher_player_id && o.rusher_player_id !== "NA" ? o.rusher_player_id : null, rc: o.receiver_player_id && o.receiver_player_id !== "NA" ? o.receiver_player_id : null,
        /* round 3 (Sam ticked "defensive win probability"): the defenders who made the play — sack (halves split), interception, forced fumble */
        dfx: [...ids(o, ["sack_player_id"]).map(id => [id, 1]), ...ids(o, ["half_sack_1_player_id", "half_sack_2_player_id"]).map(id => [id, .5]), ...ids(o, ["interception_player_id"]).map(id => [id, 1]), ...ids(o, ["forced_fumble_player_1_player_id", "forced_fumble_player_2_player_id"]).map(id => [id, 1])], dft: o.defteam }) }
    if (o.passer_player_id && o.complete_pass === "1" && o.receiver_player_id && o.receiver_player_id !== "NA" && num(o.yards_after_catch) != null && num(o.air_yards) != null)
      YACS.push([o.receiver_player_id, Math.max(-5, Math.min(40, Math.round(num(o.air_yards) / 5) * 5)) + "|" + (o.pass_location || "x"), num(o.yards_after_catch)]);
    { const po = num(o.pass_oe); if (po != null && o.defteam && (pt === "pass" || pt === "run") && o.two_point_attempt !== "1") { const td = T[o.defteam] = T[o.defteam] || { off: {}, def: {} }, xd = td.proeD = td.proeD || [0, 0]; xd[0] += po; xd[1]++ } }
    { const po = num(o.pass_oe); if (po != null && o.posteam && (pt === "pass" || pt === "run") && o.two_point_attempt !== "1") { const tt = T[o.posteam] = T[o.posteam] || { off: {}, def: {} }, x = tt.proe = tt.proe || [0, 0]; x[0] += po; x[1]++ } }
    if (pt === "pass" && o.passer_player_id) {
      const ev = { sack: o.sack === "1", cmp: o.complete_pass === "1", int: o.interception === "1", td: td && o.interception !== "1", fl, yds, epa, fd: o.first_down === "1" };
      const p = pl(P, o.passer_player_id); addPass(p.all, ev); if (late) addPass(p.late, ev); if (rz) addPass(p.rz, ev); if (two) addPass(p.two, ev);
      if (third && !ev.sack) { p.third[0]++; if (o.third_down_converted === "1") p.third[1]++ }
      const z = ZONE(num(o.air_yards)), d = LOC[o.pass_location];
      if (!ev.sack && z && d) { const k = z + d, add = A => { A[0]++; if (ev.cmp) { A[1]++; A[2] += yds } if (ev.td) A[3]++; if (ev.int) A[4]++; A[5] += epa };
        add(zc(p.Z, k));
        const off = T[o.posteam] = T[o.posteam] || { off: {}, def: {} }, def = T[o.defteam] = T[o.defteam] || { off: {}, def: {} };
        add(zc(off.off, k)); add(zc(def.def, k));
        if (o.receiver_player_id) { const rid = o.receiver_player_id, ry = ev.cmp ? yds : 0;
          const rs = (RS[rid] = RS[rid] || {})[d] = RS[rid][d] || [0, 0]; rs[0]++; rs[1] += ry; LG[d][0]++; LG[d][1] += ry;
          const dsx = ((DS[o.defteam] = DS[o.defteam] || {})[d] = DS[o.defteam][d] || {}), x = dsx[rid] = dsx[rid] || [0, 0]; x[0]++; x[1] += ry;
          const rz = (RZ[rid] = RZ[rid] || {})[k] = RZ[rid][k] || [0, 0]; rz[0]++; rz[1] += ry; const lz = LZ[k] = LZ[k] || [0, 0]; lz[0]++; lz[1] += ry;
          const dzx = ((DZ[o.defteam] = DZ[o.defteam] || {})[k] = DZ[o.defteam][k] || {}), xz = dzx[rid] = dzx[rid] || [0, 0]; xz[0]++; xz[1] += ry;
          const r = pl(R, o.receiver_player_id); add(zc(r.Z, k)); addPass(r.all, ev); if (late) addPass(r.late, ev); if (rz) addPass(r.rz, ev); if (two) addPass(r.two, ev);
          if (third) { r.third[0]++; if (o.third_down_converted === "1") r.third[1]++ } } }
    } else if (pt === "run" && o.rusher_player_id) {
      /* the line by gap (Sam, Sept 30: OL and DL by side): each run's gap — left end / tackle / guard, middle, right guard / tackle / end —
         for the offense running it and the defense stopping it: carries, yards, EPA, successful plays */
      { const loc = o.run_location, gp = o.run_gap, k = loc === "middle" ? "M" : loc === "left" || loc === "right" ? (loc[0].toUpperCase() + ({ end: "E", tackle: "T", guard: "G" }[gp] || "")) : null;
        if (k && k.length === 2 || k === "M") { const tO = T[o.posteam] = T[o.posteam] || { off: {}, def: {} }, tD = T[o.defteam] = T[o.defteam] || { off: {}, def: {} };
          tO.gapO = tO.gapO || {}; tD.gapD = tD.gapD || {}; const x1 = tO.gapO[k] = tO.gapO[k] || [0, 0, 0, 0], x2 = tD.gapD[k] = tD.gapD[k] || [0, 0, 0, 0];
          for (const x of [x1, x2]) { x[0]++; x[1] += yds; x[2] += epa; if (o.success === "1") x[3]++ }
          /* the league at each gap on designed runs only (Oct 16): QB scrambles average far more than a handoff and were lifting the
             league line from 4.1 to 4.4 a carry, so every back's "vs the league" read about 0.3 too low */
          if (o.qb_scramble !== "1") { const lg = LGD[k] = LGD[k] || [0, 0]; lg[0]++; lg[1] += yds }
          /* the same, game by game, for the offense — the line's lift (Sam, Sept 30: this year's starters vs how that spot ran last year) */
          const gg = (tO.gapG = tO.gapG || {})[g] = tO.gapG[g] || {}, x3 = gg[k] = gg[k] || [0, 0, 0, 0]; x3[0]++; x3[1] += yds; x3[2] += epa; if (o.success === "1") x3[3]++
          /* the ball carrier's own gaps (Sam, Sept 30: the run chart — his yards a carry at each gap against his own average) */
          const ur = U[o.rusher_player_id] = U[o.rusher_player_id] || { dir: {}, all: [0, 0, 0, 0], late: [0, 0, 0, 0], rz: [0, 0, 0, 0], third: [0, 0] };
          const xg = (ur.gap = ur.gap || {})[k] = ur.gap[k] || [0, 0, 0]; xg[0]++; xg[1] += yds; if (o.success === "1") xg[2]++ } }
      const u = U[o.rusher_player_id] = U[o.rusher_player_id] || { dir: {}, all: [0, 0, 0, 0], late: [0, 0, 0, 0], rz: [0, 0, 0, 0], third: [0, 0] };   // carries, yards, TD, EPA
      const add = A => { A[0]++; A[1] += yds; if (td) A[2]++; A[3] += epa };
      add(u.all); if (late) add(u.late); if (rz) add(u.rz); const d = LOC[o.run_location] || "M"; add(u.dir[d] = u.dir[d] || [0, 0, 0, 0]);
      if (third) { u.third[0]++; if (o.third_down_converted === "1") u.third[1]++ }
      /* how his carries go (Oct 16 — Sam on Jeanty: "that jeanty one is eye opening"): every designed carry's yards, counted by yard
         (yards → carries), for the back, the offense, the defense facing it and the league, so the site can split carries into stuffed
         (0 or less) / short (1–3) / good (4–9) / big (10+), find the typical carry, and take out his longest runs. Scrambles left out. */
      if (o.qb_scramble !== "1" && o.yards_gained !== "" && o.yards_gained !== "NA") { const yk = String(Math.round(yds)), inc = H => { H[yk] = (H[yk] || 0) + 1 };
        inc(u.yh = u.yh || {}); inc(LYH);
        if (o.posteam && o.defteam) { const tO = T[o.posteam] = T[o.posteam] || { off: {}, def: {} }, tD = T[o.defteam] = T[o.defteam] || { off: {}, def: {} }; inc(tO.yhO = tO.yhO || {}); inc(tD.yhD = tD.yhD || {}) } }
    }
  });
  /* comebacks and game-winning drives, credited to the QB who threw most on the drive (Pro Football Reference's idea, built
     from nflverse's plays): a 4th-quarter or overtime drive that starts tied or down 1–8 and ends with his team ahead, in a game
     it won. 4QC = it started behind. Opportunities = his games with any 4th-quarter drive tied or down 1–8. */
  { const opp = {}, won = {};
    for (const k in DRV) { const d = DRV[k]; if (d.q < 4 || d.d0 == null || d.d0 > 0 || d.d0 < -8) continue; const qb = Object.entries(d.P).sort((a, b) => b[1] - a[1])[0]; if (!qb) continue;
      const id = qb[0], f = FS[d.g]; (opp[id] = opp[id] || new Set()).add(d.g);
      if (!f || d.d1 == null || d.d1 <= 0) continue; const mine = f[0] === d.t ? f[2] - f[3] : f[3] - f[2]; if (mine <= 0) continue;
      const w = won[id] = won[id] || { gwd: new Set(), qc: new Set() }; w.gwd.add(d.g); if (d.d0 < 0) w.qc.add(d.g) }
    for (const id in opp) { const p = pl(P, id), w = won[id]; p.clutch = [opp[id].size, w ? w.qc.size : 0, w ? w.gwd.size : 0] } }
  /* round the EPA sums */
  const fix = o => { for (const k in o) { const v = o[k]; if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (typeof v[i] === "number" && !Number.isInteger(v[i])) v[i] = r2(v[i]) } else if (v && typeof v === "object") fix(v) } };
  /* each defense's sides against who was thrown at: yards allowed vs what those same receivers get on that side against everyone
     else (their other games, shrunk toward the league's number for that side with 20 targets' weight) → [targets, yards, expected yards] */
  for (const def in DS) { const t0 = T[def] = T[def] || { off: {}, def: {} }; t0.sideAdj = {};
    for (const sd of ["L", "M", "R"]) { const M = DS[def][sd]; if (!M) continue; const lg = LG[sd][0] ? LG[sd][1] / LG[sd][0] : 7; let n = 0, a = 0, e = 0;
      for (const rid in M) { const [tt, yy] = M[rid], tot = RS[rid][sd], ot = tot[0] - tt, oy = tot[1] - yy; n += tt; a += yy; e += tt * (oy + 20 * lg) / (ot + 20) }
      t0.sideAdj[sd] = [n, a, Math.round(e)] }
    t0.zoneAdj = {}; for (const zk in DZ[def] || {}) { const M = DZ[def][zk], lg = LZ[zk][0] ? LZ[zk][1] / LZ[zk][0] : 7; let n = 0, a = 0, e = 0;
      for (const rid in M) { const [tt, yy] = M[rid], tot = RZ[rid][zk], ot = tot[0] - tt, oy = tot[1] - yy; n += tt; a += yy; e += tt * (oy + 10 * lg) / (ot + 10) }
      t0.zoneAdj[zk] = [n, a, Math.round(e)] } }
  /* the run defense by gap against who it faced (Sam, Sept 30: use all the data): every carry an offense ran at a gap against this
     defense, against what that offense gets at that gap in its other games (shrunk toward the league's number with 20 carries'
     weight) → team[def].gapAdj[gap] = [carries, yards, expected yards] */
  { const lgG = {}; for (const t in T) for (const k in T[t].gapO || {}) { const a = lgG[k] = lgG[k] || [0, 0]; a[0] += T[t].gapO[k][0]; a[1] += T[t].gapO[k][1] }
    for (const off in T) { const GG = T[off].gapG || {}, tot = T[off].gapO || {};
      for (const g in GG) { const f = FS[g]; if (!f) continue; const def = f[0] === off ? f[1] : f[0]; if (!def || def === off) continue; const tD = T[def] = T[def] || { off: {}, def: {} }; tD.gapAdj = tD.gapAdj || {};
        for (const k in GG[g]) { const [c, y] = GG[g][k], all = tot[k], lg = lgG[k] && lgG[k][0] ? lgG[k][1] / lgG[k][0] : 4.3; if (!all) continue;
          const oc = all[0] - c, oy = all[1] - y, x = tD.gapAdj[k] = tD.gapAdj[k] || [0, 0, 0]; x[0] += c; x[1] += y; x[2] += c * (oy + 20 * lg) / (oc + 20) } } }
    for (const t in T) for (const k in T[t].gapAdj || {}) T[t].gapAdj[k] = T[t].gapAdj[k].map(v => Math.round(v)) }
  for (const id in DF) { DF[id].g = DF[id].g.size; for (const k in DF[id].P) if (!DF[id].P[k].some(Boolean)) delete DF[id].P[k] }
  /* win probability added with our own model (the NFL win chance on the game pages, NWP_W there): each play's chance for the offense
     before the snap against the next snap's (from the same side), the last play against the final result; credited to the passer on
     dropbacks, the rusher on runs and the receiver on targets → pass/rush/rec[id].wpa = [plays, wpa sum] */
  { const W = [0.2708, 0.1931, 0.5836, 1.3304, 0.8243, -0.242, -0.0812, -0.108, -0.4046], wp = x => { const t = Math.max(0, x.sec) / 3600, f = [1, x.m / 7, (x.m / 7) / Math.sqrt(t + 0.02), x.sp / 7 * t, (100 - x.ytg) / 100, x.dn === 3 || x.dn === 4 ? 1 : 0, Math.min(x.ds || 10, 20) / 10, x.home ? 1 : 0, t]; let z = 0; for (let j = 0; j < 9; j++) z += W[j] * f[j]; return 1 / (1 + Math.exp(-z)) };
    const add = (M, id, v) => { if (!id) return; const x = pl(M, id); const a = x.wpa = x.wpa || [0, 0]; a[0]++; a[1] += v };
    for (const [g, L] of Object.entries(WPS)) { const fin = FS[g]; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[i + 1]; let after;
        if (b) { const w = wp(b); after = b.off === a.off ? w : 1 - w } else if (fin && fin[2] != null && fin[3] != null) { const hm = a.home ? fin[2] - fin[3] : fin[3] - fin[2]; after = hm > 0 ? 1 : hm < 0 ? 0 : .5 } else continue;
        const d = after - wp(a); if (a.pt === "pass") { add(P, a.ps, d); add(R, a.rc, d) } else if (a.pt === "run") add(U, a.ru, d);
        /* the defense gains what the offense lost: a defender's share of the play (half a sack is half) → df[id].wpa = [plays, sum] */
        for (const [id, sh] of a.dfx || []) { const x = df(id, a.dft), w = x.wpa = x.wpa || [0, 0]; w[0] += sh; w[1] += -d * sh } } } }
  for (const id in DF) { const d = DF[id]; if (d.g instanceof Set) d.g = d.g.size; if (d.wpa) d.wpa = d.wpa.map(v => Math.round(v * 1000) / 1000) }
  /* our own expected yards after the catch: the league's average YAC this season for the same air-yards band (5-yard steps) and side;
     each receiver's YAC over that, per catch → rec[id].yacx = [catches, yac over expected sum] */
  { const avg = {}; for (const [, k, y] of YACS) { const a = avg[k] = avg[k] || [0, 0]; a[0]++; a[1] += y }
    for (const [id, k, y] of YACS) { const a = avg[k]; if (!a || a[0] < 20) continue; const x = pl(R, id), e = x.yacx = x.yacx || [0, 0]; e[0]++; e[1] += y - a[1] / a[0] } }
  for (const t in T) if (T[t].sit) for (const side of ["o", "d"]) { const z = T[t].sit[side], v = Object.values(z.rzd); z.rz = [v.length, v.filter(Boolean).length]; delete z.rzd }
  fix(P); fix(R); fix(U); fix(T);
  return { s: S, lineCols: ["att", "cmp", "yds", "td", "int", "sk", "fl", "epa", "fd"], zoneCols: ["att", "cmp", "yds", "td", "int", "epa"], runCols: ["car", "yds", "td", "epa"],
    gameCols: ["half", "q3", "low", "high", "home", "away"], sideAdjCols: ["targets", "yards", "expected yards"], clutchCols: ["opp", "4qc", "gwd"], gapCols: ["car", "yds", "epa", "succ"], advCols: ["cpoeSum", "cpoeN", "airEpa", "yacEpa", "attN", "scrambles", "dropbacks"], proeCols: ["passOeSum", "plays"], pass: P, rec: R, rush: U, team: T, lgGap: LGD, lgYh: LYH, yhNote: "yh = { yards gained: designed carries } (QB scrambles left out); lgGap[gap] = [carries, yards] on designed runs", game: G, wx: WX, opq: OPQ, inj: INJ, bon: BON,
    dfCols: { P: "zone+side → [catches he tackled, passes defended, INT]", R: "side → [run tackles, stops ≤2 yds]", Q: "[run tackles, yards on them, run stops, catch tackles, yards on them, catch stops]" }, df: DF };
}
/* rain or snow at kickoff, from the play-by-play's weather line ("Light Rain Temp: 45° F, …"): 0 clear or dry, 1 rain, 2 snow,
   null when there's no weather line. Indoors is always 0. "Chance of rain" is a forecast, not rain. (Sam, Sept 29: temp, wind and
   precipitation each their own toggle) */
function precipOf(w, roof) {
  if (roof === "dome" || roof === "closed") return 0; if (!w) return null;
  const s = String(w).toLowerCase().replace(/(\d+%\s*)?chance of [a-z ]+/g, "").replace(/no (rain|snow)/g, "");
  if (/snow|flurr|sleet|blizzard|wintry/.test(s)) return 2;
  if (/rain|shower|drizzle|thunder|storm/.test(s)) return 1;
  return 0;
}

/* ── each season's defenses, from the games and the logs ── */
function teamsFrom(G, LOGS) {
  const out = {};
  for (const S in LOGS) { const L = LOGS[S]; if (!L) continue; const A = {};
    const gm = {}; for (const g of G.g) if (g[1] === +S && g[2] === "REG" && g[7] != null) for (const t of [g[6], g[8]]) gm[t] = (gm[t] || 0) + 1;
    for (const id in L.p) for (const r of L.p[id]) { if (r[1] !== "R" || !r[4]) continue; const d = A[r[4]] = A[r[4]] || { pass: 0, rush: 0 }; d.pass += r[7]; d.rush += r[12] }
    const pts = {}; for (const g of G.g) if (g[1] === +S && g[2] === "REG" && g[7] != null) { pts[g[6]] = (pts[g[6]] || 0) + g[9]; pts[g[8]] = (pts[g[8]] || 0) + g[7] }
    const T = Object.keys(A).filter(t => gm[t]).map(t => ({ t, pass: A[t].pass / gm[t], rush: A[t].rush / gm[t], pts: (pts[t] || 0) / gm[t] }));
    for (const k of ["pass", "rush", "pts"]) T.sort((a, b) => a[k] - b[k]).forEach((x, i) => x[k + "Rk"] = i + 1);
    out[S] = Object.fromEntries(T.map(x => [x.t, [r1(x.pass), x.passRk, r1(x.rush), x.rushRk, r1(x.pts), x.ptsRk]])) }
  return { cols: ["passAllowed", "passRk", "rushAllowed", "rushRk", "ptsAllowed", "ptsRk"], n: 32, s: out };
}

/* ── what each defense does to the other team's best players (Sam, Sept 30: "this team focuses on your best output players"):
   every team's No. 1 and No. 2 receiver (WR by targets), top TE and top RB for the season; in each game against a defense, what he
   got against what he averages in his other games that season (5+ games) → per defense and role [games, yards, expected yards,
   targets, expected targets]. RB yards are scrimmage yards. ── */
function roleIndex(L, pos) {
  if (!L) return {}; const tm = {};
  for (const id in L.p) for (const r of L.p[id]) { if (r[1] !== "R" || !r[3]) continue; const p = String(pos[id] || "").toUpperCase(), g = p === "FB" || p === "HB" ? "RB" : p;
    if (!["WR", "TE", "RB"].includes(g)) continue; const x = ((tm[r[3]] = tm[r[3]] || {})[id] = tm[r[3]][id] || { g, tgt: 0, tch: 0 }); x.tgt += r[14]; x.tch += r[14] + r[11] }
  const out = {};
  for (const t in tm) { const A = Object.entries(tm[t]), by = g => A.filter(([, x]) => x.g === g), roles = [];
    const wr = by("WR").sort((a, b) => b[1].tgt - a[1].tgt), te = by("TE").sort((a, b) => b[1].tgt - a[1].tgt)[0], rb = by("RB").sort((a, b) => b[1].tch - a[1].tch)[0];
    if (wr[0]) roles.push(["WR1", wr[0][0]]); if (wr[1]) roles.push(["WR2", wr[1][0]]); if (te) roles.push(["TE1", te[0]]); if (rb) roles.push(["RB1", rb[0]]);
    for (const [role, id] of roles) { const G = L.p[id].filter(r => r[3] === t); if (G.length < 5) continue; const yd = r => r[16] + (role === "RB1" ? r[12] : 0), tg = r => r[14] + (role === "RB1" ? r[11] : 0);
      const sy = G.reduce((a, r) => a + yd(r), 0), st = G.reduce((a, r) => a + tg(r), 0);
      for (const r of G) { if (!r[4]) continue; const n = G.length - 1, x = ((out[r[4]] = out[r[4]] || {})[role] = out[r[4]][role] || [0, 0, 0, 0, 0]);
        x[0]++; x[1] += yd(r); x[2] += (sy - yd(r)) / n; x[3] += tg(r); x[4] += (st - tg(r)) / n } } }
  for (const d in out) for (const k in out[d]) out[d][k] = out[d][k].map(v => Math.round(v * 10) / 10);
  return out;
}

/* ── each game's starting line (Sam, Sept 30: the OL position lift): the team's depth chart as it stood before kickoff,
   No. 1 at LT, LG, C, RG, RT. Depth charts are a team's own listing, so a late scratch can slip through. ── */
async function olStarters(S, G, log) {
  const t = await get(`depth_charts/depth_charts_${S}.csv`, log); if (!t) return null;
  /* two layouts: through 2024 one chart per week ("club_code, week, depth_team, depth_position"); from 2025 dated snapshots ("dt, team, pos_abb, pos_rank") */
  const snaps = {}, wk = {}, N = {}, dbS = {}, dbW = {};
  const DBSL = /^(LCB|RCB|CB|NB|NCB|FS|SS|S|SAF|DB)$/;
  rows(t, ["dt", "team", "pos_abb", "pos_rank", "club_code", "week", "game_type", "depth_team", "depth_position", "gsis_id", "player_name", "full_name"], o => {
    if (!o.gsis_id) return;
    if (o.dt) { const p = (o.pos_abb || "").toUpperCase();
      if (DBSL.test(p) && (+o.pos_rank || 9) === 1) { ((dbS[o.team] = dbS[o.team] || {})[o.dt] = dbS[o.team][o.dt] || new Set()).add(o.gsis_id); return }
      if (!/^(LT|LG|C|RG|RT)$/.test(p)) return;
      const r = +o.pos_rank || 9, x = ((snaps[o.team] = snaps[o.team] || {})[o.dt] = snaps[o.team][o.dt] || {}); (x[p] = x[p] || []).push([r, o.gsis_id]); N[o.gsis_id] = o.player_name }
    else { const p = (o.depth_position || "").toUpperCase();
      if (DBSL.test(p) && (+o.depth_team || 9) === 1) { const k = (o.game_type || "REG") + "|" + (+o.week); ((dbW[o.club_code] = dbW[o.club_code] || {})[k] = dbW[o.club_code][k] || new Set()).add(o.gsis_id); return }
      if (!/^(LT|LG|C|RG|RT)$/.test(p)) return;
      const r = +o.depth_team || 9, k = (o.game_type || "REG") + "|" + (+o.week), x = ((wk[o.club_code] = wk[o.club_code] || {})[k] = wk[o.club_code][k] || {}); (x[p] = x[p] || []).push([r, o.gsis_id]); N[o.gsis_id] = o.full_name } });
  /* Oct 8: the first man on the chart at a spot who was active that week (from 2016, the weekly rosters) — a No. 1 who was inactive or on
     reserve didn't start (6% of line "starts" were weeks like that); same for the starting DBs */
  const act = new Set(); if (S >= 2016) { try { rows(await get0(`weekly_rosters/roster_weekly_${S}.csv`, log), ["gsis_id", "week", "game_type", "status"], o => { if (o.gsis_id && (o.game_type || "REG") === "REG" && o.status === "ACT") act.add(o.gsis_id + "|" + +o.week) }) } catch (e) { log("nfl: OL starters rosters " + S + ": " + e.message) } }
  const isAct = (id, w) => !act.size || act.has(id + "|" + w);
  const pick = (L, w) => { if (!L) return null; const s = L.slice().sort((a, b) => a[0] - b[0]); const f = s.find(z => isAct(z[1], w)); return f ? f[1] : null };
  const out = {}, db = {}, SL = ["LT", "LG", "C", "RG", "RT"];
  for (const g of G.g) { if (g[1] !== S || g[7] == null) continue; const day = g[4] + "T" + (g[5] || "12:00");
    for (const tmE of [g[6], g[8]]) { let x = null; const tm = { STL: "LA", SD: "LAC", OAK: "LV" }[tmE] || tmE;   // stored under today's code, like the logs and pbp
      if (snaps[tmE] || snaps[tm]) { const SN = snaps[tmE] || snaps[tm]; const d = Object.keys(SN).filter(d => d.slice(0, 16) < day).sort().pop(); if (d) x = SN[d] }
      else { const W = wk[tmE] || wk[tm]; if (W) x = W[g[2] + "|" + g[3]] || W["REG|" + g[3]] || null }
      if (x) (out[tm] = out[tm] || {})[g[0]] = SL.map(k => pick(x[k], +g[3]));
      /* the starting DBs that day (the avoidance read: a starter with few throws near him) */
      let d = null; const DS1 = dbS[tmE] || dbS[tm], DW1 = dbW[tmE] || dbW[tm]; if (DS1) { const dd = Object.keys(DS1).filter(v => v.slice(0, 16) < day).sort().pop(); if (dd) d = DS1[dd] } else if (DW1) d = DW1[g[2] + "|" + g[3]] || DW1["REG|" + g[3]] || null;
      if (d && d.size) { const dd2 = [...d].filter(id => isAct(id, +g[3])); if (dd2.length) (db[tm] = db[tm] || {})[g[0]] = dd2 } } }
  const names = {}; for (const tm in out) for (const g in out[tm]) for (const id of out[tm][g]) if (id) names[id] = N[id];
  return { cols: SL, g: out, names, db };
}

/* ── games each player started, by season (Sam, Sept 30: grade every GM's draft classes, every position) ──
   A start = listed first at his spot on the team's depth chart for that game (offense, defense, kicker, punter; not returners, holders or
   snappers): through 2024 the week's chart, from 2025 the dated chart as it stood before kickoff — or, for a QB, back, receiver or tight end,
   leading his team at his position in use that game (see below). Depth charts are the team's own listing,
   so a late scratch can slip through — over four seasons that washes out. Regular season only. */
export async function starts(S, G, log) {
  const t = await get(`depth_charts/depth_charts_${S}.csv`, log); if (!t) return null;
  const TG = {}; for (const g of G.g) { if (g[1] !== S || g[2] !== "REG" || g[7] == null) continue; for (const tm of [g[6], g[8]]) (TG[tm] = TG[tm] || []).push([g[3], g[4] + "T" + (g[5] || "12:00"), g[0]]) }
  /* backs, receivers, tight ends and quarterbacks also count as starting a game they led in use — a team's depth chart can list a veteran
     ahead of the back who gets the ball (Jahmyr Gibbs behind David Montgomery): most passes (QB), most carries + targets (RB), the top three
     in targets (WR), most targets (TE) */
  const use = {}, played = new Set();
  { const per = {}; rows(await get(`stats_player/stats_player_week_${S}.csv`, log), ["player_id", "position", "game_id", "team", "season_type", "attempts", "carries", "targets"], o => {
      if (!o.player_id || !o.game_id || o.season_type === "POST") return; played.add(o.game_id + "|" + o.player_id); const p = (o.position || "").toUpperCase(), g = o.game_id + "|" + o.team;
      const k = p === "QB" ? "QB" : p === "RB" || p === "HB" || p === "FB" ? "RB" : p === "WR" ? "WR" : p === "TE" ? "TE" : null; if (!k) return;
      const v = k === "QB" ? +o.attempts || 0 : k === "RB" ? (+o.carries || 0) + (+o.targets || 0) : +o.targets || 0; if (!(v > 0)) return;
      ((per[g] = per[g] || {})[k] = per[g][k] || []).push([o.player_id, v]) });
    const TOP = { QB: 1, RB: 1, WR: 3, TE: 1 };
    for (const g in per) { const gid = g.split("|")[0]; for (const k in per[g]) for (const [id] of per[g][k].sort((a, b) => b[1] - a[1]).slice(0, TOP[k])) (use[gid] = use[gid] || new Set()).add(id) } }
  const snaps = {}, wk = {};
  rows(t, ["dt", "team", "pos_abb", "pos_rank", "club_code", "week", "game_type", "depth_team", "formation", "depth_position", "gsis_id"], o => {
    if (!o.gsis_id) return;
    if (o.dt) { const p = (o.pos_abb || "").toUpperCase(); if (!p || /^(KR|PR|H|LS)$/.test(p) || (+o.pos_rank || 9) !== 1) return;
      ((snaps[o.team] = snaps[o.team] || {})[o.dt] = snaps[o.team][o.dt] || new Set()).add(o.gsis_id) }
    else { if ((o.game_type || "REG") !== "REG" || (+o.depth_team || 9) !== 1) return; const f = o.formation, p = (o.depth_position || "").toUpperCase();
      if (f === "Special Teams" ? !/^(K|PK|P)$/.test(p) : f !== "Offense" && f !== "Defense") return;
      ((wk[o.club_code] = wk[o.club_code] || {})[+o.week] = wk[o.club_code][+o.week] || new Set()).add(o.gsis_id) } });
  /* Oct 8: a depth chart keeps an injured starter at No. 1 (2025: J.J. McCarthy counted 17 starts for 10, Purdy 16 for 9, Lamar Jackson 17
     for 12 — and his missed games then never counted as missed hurt). A No. 1 counts only if he played: a quarterback, back, receiver or
     tight end with a stat line in that game; anyone else on the active roster that week (the weekly rosters: inactive and reserve-list
     players didn't play). Before 2016 (no weekly rosters) the chart stands. */
  const RW = S >= 2016 ? await get0(`weekly_rosters/roster_weekly_${S}.csv`, log) : null, act = new Map();
  if (RW) rows(RW, ["gsis_id", "week", "game_type", "status", "position"], o => { if (o.gsis_id && (o.game_type || "REG") === "REG" && o.status === "ACT") act.set(o.gsis_id + "|" + +o.week, (o.position || "").toUpperCase()) });
  const SKP = /^(QB|RB|HB|FB|WR|TE)$/, didPlay = (id, w, gid) => { if (!RW) return true; if (played.has(gid + "|" + id)) return true; const p = act.get(id + "|" + w); return p != null && !SKP.test(p) };
  const n = {}, MAP = { STL: "LA", SD: "LAC", OAK: "LV" }, BACK = { LA: "STL", LAC: "SD", LV: "OAK" }, byGame = {};
  for (const tmE in TG) { const alt = MAP[tmE] || BACK[tmE], SN = snaps[tmE] || snaps[alt], W = wk[tmE] || wk[alt], keys = SN ? Object.keys(SN).sort() : null;
    for (const [w, day, gid] of TG[tmE]) { let x = null;
      if (SN) { let d = null; for (const k of keys) { if (k.slice(0, 16) < day) d = k; else break } if (d) x = SN[d] } else if (W) x = W[w];
      const u = byGame[gid] = byGame[gid] || new Set(); if (x) for (const id of x) if (didPlay(id, w, gid)) u.add(id) } }
  /* one count per player per game: the depth chart's starters and the usage leaders together */
  for (const gid in byGame) { const u = byGame[gid]; if (use[gid]) for (const id of use[gid]) u.add(id); for (const id of u) n[id] = (n[id] || 0) + 1 }
  const games = Math.max(0, ...Object.values(TG).map(a => a.length));
  if (!Object.keys(n).length) return null;
  /* games missed hurt (Sam, Oct 6: Mahogany started 10 of 17 in 2025 — he was hurt, not benched): a week his team played while he was on
     injured reserve / PUP / non-football injury, or listed Out or Doubtful, and didn't start. From 2016 (the weekly rosters).
     Oct 7: the same rule as the durability pack (avail.mjs classify) so the grade and the Durability card agree — game-day inactive
     injured (I01) counts, and Out/Doubtful only for a real injury (rest, personal, coach's decision and COVID don't count). */
  const h = {}; if (S >= 2016) { try {
    /* Oct 8: a game-day inactive (A01) listed on that week's report with a real injury counts too — the Durability card's rule (avail.mjs),
       so the grade and the card agree (2025: 244 players had a game the card called hurt and the grade didn't) */
    const out = new Set(), listed = new Set(); rows(await get0(`injuries/injuries_${S}.csv`, log), ["gsis_id", "week", "game_type", "report_status", "report_primary_injury"], o => { if (!o.gsis_id || (o.game_type || "REG") !== "REG") return; const inj = o.report_primary_injury || "", k = o.gsis_id + "|" + +o.week; if (inj && !notHurt(inj)) listed.add(k); if (/^(Out|Doubtful)$/.test(o.report_status || "") && !notHurt(inj)) out.add(k) });
    const played = {}; for (const tmE in TG) { const tm = MAP[tmE] || tmE; for (const [w, , gid] of TG[tmE]) (played[tm] = played[tm] || {})[w] = gid }
    const seen = new Set();
    rows(RW || await get0(`weekly_rosters/roster_weekly_${S}.csv`, log), ["gsis_id", "team", "week", "game_type", "status", "status_description_abbr"], o => {
      if (!o.gsis_id || (o.game_type || "REG") !== "REG") return; const w = +o.week, tm = MAP[o.team] || o.team, gid = played[tm] && played[tm][w]; if (!gid) return;
      const k = o.gsis_id + "|" + w; if (seen.has(k)) return; seen.add(k);
      const c = classify(o.status, o.status_description_abbr || ""), hurt = c === 1 || c === 2 || (o.status === "RES" && o.status_description_abbr === "R49") || out.has(k) || (c === 3 && listed.has(k));
      if (hurt && !(byGame[gid] && byGame[gid].has(o.gsis_id))) h[o.gsis_id] = (h[o.gsis_id] || 0) + 1 });
  } catch (e) { log("nfl: hurt games " + S + ": " + e.message) } }
  return { n, games, h };
}
/* ── kickers and punters, one season (Sam, Oct 1: "accuracy in the elements … best from over 50, how many 60+ yarders, longest, power
   on kicks … punts inside the 10, 5 … not predictions, just data") — from the play-by-play: field goals by distance, extra points,
   kicks in wind (15+ mph, outdoors), cold (40° or under) and rain or snow, makes over what the league's kickers make from those
   distances that season, kickoffs (touchbacks, depth); punts: gross and net, inside the 20 / 10 / 5, touchbacks, returns, blocks. ── */
export const K_COLS = ["name", "team", "fgM", "fgA", "u40M", "u40A", "40M", "40A", "50M", "50A", "55M", "55A", "60M", "60A", "long", "xpM", "xpA",
  "windM", "windA", "coldM", "coldA", "wetM", "wetA", "overExp", "ko", "koTB", "koDist", "games", "koRet", "koRetYds", "wideR", "wideL", "short", "blocked", "post",
  "q4M", "q4A", "cluM", "cluA", "gwM", "gwA", "iceM", "iceA",
  "h1M", "h1A", "h2M", "h2A", "inM", "inA", "outM", "outA", "lxpM", "lxpA", "onsA", "onsRec"];
export const P_COLS = ["name", "team", "punts", "gross", "net", "in20", "in10", "in5", "tb", "blocked", "fairCatch", "retYds", "long", "games", "returned",
  "lPunts", "lGross", "lNet", "lIn20", "lTb", "lRet", "lRetYds"];
export async function kicking(S, log) {
  const t = await get(`pbp/play_by_play_${S}.csv.gz`, log); if (!t) return null;
  const FG = [], K = {}, P = {}, DST = {}, KG = {}, PREV = {};
  rows(t, ["game_id", "season_type", "posteam", "yardline_100", "field_goal_attempt", "field_goal_result", "kick_distance", "extra_point_attempt", "extra_point_result",
    "kickoff_attempt", "touchback", "punt_attempt", "punt_blocked", "punt_fair_catch", "return_yards", "kicker_player_id", "kicker_player_name", "punter_player_id",
    "punter_player_name", "weather", "roof", "temp", "wind", "desc", "kickoff_out_of_bounds", "kickoff_fair_catch", "punt_out_of_bounds", "punt_downed",
    "defteam", "play_type", "yards_gained", "sack", "interception", "fumble_lost", "fumble_forced", "fumble_recovery_1_team", "safety", "touchdown", "td_team",
    "tackled_for_loss", "pass_defense_1_player_id", "pass_defense_2_player_id", "two_point_attempt", "qtr", "game_seconds_remaining", "score_differential",
    "timeout", "timeout_team", "own_kickoff_recovery"], o => {
    /* late and pressure kicks (Oct 18 — Sam: "kicking splits like when they make their kicks and if they are clutch in the 4th"): 4th quarter
       and OT; a tying or go-ahead kick there (down 0–3 before it); the final 2:00 of the 4th or OT; and "iced" — the defense called a
       timeout on the play right before the kick */
    const iced = PREV.g === o.game_id && PREV.to && PREV.tt === o.defteam;
    PREV.g = o.game_id; PREV.to = o.timeout === "1"; PREV.tt = o.timeout_team;
    if (o.season_type !== "REG") return;
    const qt = num(o.qtr) || 0, late = qt >= 4, sd = num(o.score_differential), gsr = num(o.game_seconds_remaining);
    const clutch = late && sd != null && sd >= -3 && sd <= 0, gw = clutch && (qt >= 5 || (gsr != null && gsr <= 120));
    /* fantasy D/ST, game by game (Sam, Oct 2: ESPN scores yards allowed, passes defended, TFLs): for each defense — yards allowed, sacks,
       INTs, fumbles recovered and forced, safeties, blocked kicks, defensive TDs, return TDs, TFLs, passes defended */
    { const g = o.game_id, pt = o.play_type, D = o.defteam, box = t => { const x = (DST[g] = DST[g] || {})[t] = DST[g][t] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; return x };
      const scrim = pt === "pass" || pt === "run";
      if (D && scrim && o.two_point_attempt !== "1") { const b = box(D); b[0] += num(o.yards_gained) || 0; if (o.sack === "1") b[1]++; if (o.interception === "1") b[2]++;
        if (o.fumble_forced === "1") b[4]++; if (o.tackled_for_loss === "1" && o.sack !== "1") b[9]++; b[10] += (o.pass_defense_1_player_id && o.pass_defense_1_player_id !== "NA" ? 1 : 0) + (o.pass_defense_2_player_id && o.pass_defense_2_player_id !== "NA" ? 1 : 0) }
      if (o.fumble_lost === "1" && o.fumble_recovery_1_team && o.fumble_recovery_1_team !== "NA") box(o.fumble_recovery_1_team)[3]++;
      if (o.safety === "1" && D) box(D)[5]++;
      if (D && (o.punt_blocked === "1" || o.field_goal_result === "blocked" || o.extra_point_result === "blocked")) box(D)[6]++;
      if (o.touchdown === "1" && o.td_team && o.td_team !== "NA") { const ko = o.kickoff_attempt === "1";
        if (scrim && o.td_team !== o.posteam) box(o.td_team)[7]++;
        /* kickoffs: nflverse's posteam is the receiving team, so either side's TD counts; punts and kicks: the side that didn't kick */
        else if (ko || ((o.punt_attempt === "1" || o.field_goal_attempt === "1") && o.td_team !== o.posteam)) box(o.td_team)[8]++ } }
    /* each kicker's game: field goals by distance and extra points */
    if (o.kicker_player_id && (o.field_goal_attempt === "1" || o.extra_point_attempt === "1")) { const x = (KG[o.kicker_player_id] = KG[o.kicker_player_id] || {})[o.game_id] = KG[o.kicker_player_id][o.game_id] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      if (o.extra_point_attempt === "1") { x[9]++; if (o.extra_point_result === "good") x[8]++ }
      else { const d = num(o.kick_distance); if (d != null) { const i = d < 40 ? 0 : d < 50 ? 2 : d < 60 ? 4 : 6; x[i + 1]++; if (o.field_goal_result === "made") x[i]++ } } }
    const out = o.roof === "outdoors" || o.roof === "open", wind = out && num(o.wind) >= 15, cold = out && num(o.temp) != null && num(o.temp) <= 40,
      wet = out && /rain|snow|sleet|shower|drizzle/i.test(o.weather || "");
    /* how a miss missed (Sam, Oct 1: "do we know if kickers miss right or left?"): the play description says wide right / left, short,
       off the upright or crossbar, or blocked */
    const how = o.field_goal_result === "made" ? null : o.field_goal_result === "blocked" || /blocked/i.test(o.desc || "") ? "blocked" : /upright|cross ?bar|doink/i.test(o.desc || "") ? "post" : /wide right/i.test(o.desc || "") ? "wideR" : /wide left/i.test(o.desc || "") ? "wideL" : /short/i.test(o.desc || "") ? "short" : null;
    if (o.field_goal_attempt === "1" && o.kicker_player_id) { const d = num(o.kick_distance); if (d == null) return; FG.push([o.kicker_player_id, o.kicker_player_name, o.posteam, d, o.field_goal_result === "made" ? 1 : 0, wind, cold, wet, o.game_id, how, late, clutch, gw, iced, qt <= 2, o.roof === "dome" || o.roof === "closed"]); return }
    const k = id => K[id] = K[id] || { name: null, team: {}, xpM: 0, xpA: 0, ko: 0, koTB: 0, koDist: 0, koRet: 0, koRetYds: 0, g: new Set(), lxp: [0, 0], ons: [0, 0] };
    /* (Oct 18 — Sam, "might as well"): extra points in the 4th quarter and OT, and onside kicks tried and recovered (the play
       description says "onside"; nflverse never says "squib", so squib kicks can't be told apart) */
    if (o.extra_point_attempt === "1" && o.kicker_player_id) { const x = k(o.kicker_player_id); x.name = o.kicker_player_name; x.xpA++; if (o.extra_point_result === "good") x.xpM++; x.g.add(o.game_id);
      if (late) { x.lxp[1]++; if (o.extra_point_result === "good") x.lxp[0]++ } return }
    if (o.kickoff_attempt === "1" && o.kicker_player_id) { const x = k(o.kicker_player_id); x.name = x.name || o.kicker_player_name; x.ko++; if (o.touchback === "1") x.koTB++; x.koDist += num(o.kick_distance) || 0;
      if (/onside/i.test(o.desc || "")) { x.ons[0]++; if (o.own_kickoff_recovery === "1") x.ons[1]++ }
      /* returned kickoffs (not touchbacks, fair catches or out of bounds) and the yards they went for */
      if (o.touchback !== "1" && o.kickoff_fair_catch !== "1" && o.kickoff_out_of_bounds !== "1" && num(o.return_yards) != null) { x.koRet++; x.koRetYds += num(o.return_yards) } return }
    if (o.punt_attempt === "1" && o.punter_player_id) { const x = P[o.punter_player_id] = P[o.punter_player_id] || { name: o.punter_player_name, team: {}, n: 0, gross: 0, net: 0, in20: 0, in10: 0, in5: 0, tb: 0, bl: 0, fc: 0, ret: 0, rn: 0, long: 0, g: new Set(), L: [0, 0, 0, 0, 0, 0, 0] };
      x.team[o.posteam] = (x.team[o.posteam] || 0) + 1; x.g.add(o.game_id); x.n++;
      if (o.punt_blocked === "1") { x.bl++; return }
      const d = num(o.kick_distance) || 0, r = num(o.return_yards) || 0, tb = o.touchback === "1", y = num(o.yardline_100);
      x.gross += d; x.long = Math.max(x.long, d); x.ret += r; if (tb) x.tb++; if (o.punt_fair_catch === "1") x.fc++;
      if (!tb && o.punt_fair_catch !== "1" && o.punt_out_of_bounds !== "1" && o.punt_downed !== "1") x.rn++;
      x.net += d - r - (tb ? 20 : 0);
      const rn = !tb && o.punt_fair_catch !== "1" && o.punt_out_of_bounds !== "1" && o.punt_downed !== "1";
      let i20 = false; if (!tb && y != null) { const spot = y - d + r; if (spot <= 20) { x.in20++; i20 = true } if (spot <= 10) x.in10++; if (spot <= 5) x.in5++ }
      /* late punts (4th quarter and OT): count, gross, net, inside the 20, touchbacks, returned ones and their yards */
      if (late) { const Lp = x.L; Lp[0]++; Lp[1] += d; Lp[2] += d - r - (tb ? 20 : 0); if (i20) Lp[3]++; if (tb) Lp[4]++; if (rn) { Lp[5]++; Lp[6] += r } } } });
  /* the league's make rate by distance this season (smoothed over ±2 yards) — what a kick from there is expected to be worth */
  const by = {}; for (const f of FG) { const b = by[f[3]] = by[f[3]] || [0, 0]; b[0] += f[4]; b[1]++ }
  const exp = d => { let m = 0, n = 0; for (let x = d - 2; x <= d + 2; x++) if (by[x]) { m += by[x][0]; n += by[x][1] } return n ? m / n : .5 };
  for (const f of FG) { const [id, nm, tm, d, made, wind, cold, wet, g, how] = f; const x = K[id] = K[id] || { name: null, team: {}, xpM: 0, xpA: 0, ko: 0, koTB: 0, koDist: 0, koRet: 0, koRetYds: 0, g: new Set(), lxp: [0, 0], ons: [0, 0] };
    x.name = x.name || nm; x.team[tm] = (x.team[tm] || 0) + 1; x.g.add(g);
    const B = x.fg = x.fg || { m: 0, a: 0, b: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], long: 0, w: [0, 0], c: [0, 0], r: [0, 0], oe: 0, miss: { wideR: 0, wideL: 0, short: 0, blocked: 0, post: 0 }, q4: [0, 0], cl: [0, 0], gw: [0, 0], ic: [0, 0], h: [0, 0, 0, 0], io: [0, 0, 0, 0] };
    { const [, , , , , , , , , , lt, cl, gw, ic, h1, ind] = f; if (lt) { B.q4[1]++; B.q4[0] += made } if (cl) { B.cl[1]++; B.cl[0] += made } if (gw) { B.gw[1]++; B.gw[0] += made } if (ic) { B.ic[1]++; B.ic[0] += made }
      /* first half vs second half and OT; indoors (dome or closed roof) vs outdoors (open roofs count as outdoors) */
      const hi = h1 ? 0 : 2; B.h[hi + 1]++; B.h[hi] += made; const ii = ind ? 0 : 2; B.io[ii + 1]++; B.io[ii] += made }
    if (how) B.miss[how]++;
    B.a++; B.m += made; const i = d < 40 ? 0 : d < 50 ? 1 : d < 55 ? 2 : d < 60 ? 3 : 4; B.b[i][1]++; B.b[i][0] += made; if (made) B.long = Math.max(B.long, d);
    if (wind) { B.w[1]++; B.w[0] += made } if (cold) { B.c[1]++; B.c[0] += made } if (wet) { B.r[1]++; B.r[0] += made } B.oe += made - exp(d) }
  const team = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const KO = {}; for (const id in K) { const x = K[id], B = x.fg || { m: 0, a: 0, b: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], long: 0, w: [0, 0], c: [0, 0], r: [0, 0], oe: 0 }; if (!B.a && !x.xpA) continue;
    const MS = B.miss || { wideR: 0, wideL: 0, short: 0, blocked: 0, post: 0 };
    KO[id] = [x.name, team(x.team), B.m, B.a, ...B.b.flat(), B.long, x.xpM, x.xpA, ...B.w, ...B.c, ...B.r, Math.round(B.oe * 100) / 100, x.ko, x.koTB, x.ko ? Math.round(x.koDist / x.ko * 10) / 10 : null, x.g.size,
      x.koRet, x.koRetYds, MS.wideR, MS.wideL, MS.short, MS.blocked, MS.post, ...(B.q4 || [0, 0]), ...(B.cl || [0, 0]), ...(B.gw || [0, 0]), ...(B.ic || [0, 0]),
      ...(B.h || [0, 0, 0, 0]), ...(B.io || [0, 0, 0, 0]), ...x.lxp, ...x.ons] }
  const PO = {}; for (const id in P) { const x = P[id]; if (x.n < 5) continue; PO[id] = [x.name, team(x.team), x.n, x.gross, x.net, x.in20, x.in10, x.in5, x.tb, x.bl, x.fc, x.ret, x.long, x.g.size, x.rn, ...x.L] }
  return { K: KO, P: PO, DST, KG };
}
export const DST_COLS = ["yds", "sk", "int", "fr", "ff", "saf", "blk", "dtd", "sttd", "tfl", "pd"], KG_COLS = ["u40M", "u40A", "40M", "40A", "50M", "50A", "60M", "60A", "xpM", "xpA"];

/* each pick against what that draft slot usually becomes: games started in his first four seasons (fewer for recent classes), as a share of
   the games he could have started, against the league's average share at that pick (smoothed over nearby picks, never rising with later
   picks). A class's grade is its starts over expected, ranked A–F among every team's class that year once it's 3+ seasons old — like the
   college recruiting-class grades. Depth charts start in 2001, so classes before that aren't graded. */
const DR_COLS = ["gsis", "name", "pos", "year", "round", "pick", "team", "starts", "expected", "games", "seasons", "last", "now", "status", "college"];
export function draftGrades(drafted, ST, lastDone, lastPlayed) {
  const has = s => ST.s[s] && ST.g[s];
  const win = d => { let st = 0, gm = 0, k = 0; for (let s = d[3]; s <= Math.min(d[3] + 3, lastPlayed); s++) { if (!has(s)) return null; st += ST.s[s][d[0]] || 0; gm += ST.g[s]; k++ } return { st, gm, k } };
  const L = drafted.filter(d => d[3] >= 2001 && d[5] > 0).map(d => ({ d, w: win(d) })).filter(x => x.w && x.w.gm > 0);
  /* the league's share at each pick, for each number of seasons counted (1–4), from classes that have had that many full seasons */
  const curve = {};
  for (let k = 1; k <= 4; k++) { const sum = {}, cnt = {};
    for (const x of L) { if (x.d[3] + k - 1 > lastDone) continue; let st = 0, gm = 0; for (let s = x.d[3]; s < x.d[3] + k; s++) { st += ST.s[s][x.d[0]] || 0; gm += ST.g[s] }
      const p = Math.min(x.d[5], 262); sum[p] = (sum[p] || 0) + st / gm; cnt[p] = (cnt[p] || 0) + 1 }
    const raw = []; for (let p = 1; p <= 262; p++) raw[p] = cnt[p] ? [sum[p], cnt[p]] : [0, 0];
    const sm = []; for (let p = 1; p <= 262; p++) { let a = 0, c = 0; for (let q = Math.max(1, p - 7); q <= Math.min(262, p + 7); q++) { a += raw[q][0]; c += raw[q][1] } sm[p] = c ? a / c : 0 }
    for (let p = 2; p <= 262; p++) sm[p] = Math.min(sm[p], sm[p - 1]);
    curve[k] = sm.map(v => v == null ? null : Math.round(v * 1000) / 1000) }
  const p = [];
  for (const x of L) { const d = x.d, ex = (curve[x.w.k] || curve[4])[Math.min(d[5], 262)] * x.w.gm;
    p.push([d[0], d[1], d[2], d[3], d[4], d[5], d[6], x.w.st, Math.round(ex * 10) / 10, x.w.gm, x.w.k, d[7], d[8], d[9], d[10]]) }
  for (const d of drafted) if (d[3] < 2001 && d[5] > 0) p.push([d[0], d[1], d[2], d[3], d[4], d[5], d[6], null, null, null, 0, d[7], d[8], d[9], d[10]]);
  /* class grades: starts over expected, per team per draft year, ranked within the year (mid-rank percentile, so ties land in the middle) */
  const cls = {};
  for (const r of p) { if (r[7] == null) continue; const c = ((cls[r[3]] = cls[r[3]] || {})[r[6]] = cls[r[3]][r[6]] || { n: 0, st: 0, ex: 0, k: r[10] }); c.n++; c.st += r[7]; c.ex += r[8]; c.k = Math.max(c.k, r[10]) }
  const grades = {};
  for (const y in cls) { const T = Object.entries(cls[y]), ready = +y + 2 <= lastDone, V = T.map(([, c]) => c.st - c.ex);
    for (const [t, c] of T) { const v = c.st - c.ex, q = (V.filter(z => z < v).length + .5 * Math.max(0, V.filter(z => z === v).length - 1)) / Math.max(1, V.length - 1);
      (grades[t] = grades[t] || {})[y] = [c.n, c.st, Math.round(c.ex), ready ? (q >= .8 ? "A" : q >= .6 ? "B" : q >= .4 ? "C" : q >= .2 ? "D" : "F") : null, c.k, ready ? Math.round(q * 100) / 100 : null] } }
  return { cols: DR_COLS, p, gradeCols: ["picks", "starts", "expected", "grade", "seasons", "percentile"], grades, curve, lastDone, at: Date.now() };
}

/* ── next spring's free agents (Sam, Sept 30: "just the list of upcoming free agents", kept current without anyone typing it in) ──
   ESPN's public athlete API lists each player's contract and the last season it covers ("signedThrough"); a player whose deal ends with
   this season is a free agent next spring. Only that year is kept — no money. Where ESPN has nothing, a drafted player's rookie deal is
   worked out from the draft (four seasons; a first-rounder's fifth year is a team option) and marked as such. Restricted / exclusive
   rights are estimated from seasons in the league (ESPN counts this season; 3 → restricted, under 3 → exclusive rights), so they're labeled "likely". */
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]) } catch { out[k] = null } } })); return out }
export async function freeAgents(Y, drafted, log, espnMap = {}) {
  const E = "https://site.api.espn.com/apis/site/v2/sports/football/nfl", C = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/";
  const j = async u => { for (let t = 0; t < 3; t++) { try { const r = await fetch(u); if (r.ok) return await r.json(); if (r.status === 404) return null } catch { } await new Promise(r => setTimeout(r, 800 * (t + 1))) } return null };
  const T = await j(`${E}/teams`); const teams = ((T && T.sports && T.sports[0].leagues[0].teams) || []).map(x => x.team);
  if (teams.length < 30) { log("nfl fa: ESPN team list unavailable"); return null }
  const byEspn = {}; for (const d of drafted) if (d[11]) byEspn[d[11]] = d;
  const people = [];
  for (const t of teams) { const R = await j(`${E}/teams/${t.id}/roster`); if (!R || !R.athletes) continue;
    for (const g of R.athletes) for (const a of g.items || []) people.push({ id: a.id, n: a.fullName, pos: a.position && a.position.abbreviation, tm: t.abbreviation, exp: a.experience ? a.experience.years : null,
      st: a.status && a.status.type, born: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null }) }
  const MAP = { WSH: "WAS", LAR: "LA" };
  const res = await pool(people, 8, async p => { const L = await j(`${C}${p.id}/contracts`); const ys = L && L.items ? L.items.map(i => +((i.$ref.match(/contracts\/(\d+)/) || [])[1])) : [];
    if (!ys.includes(Y)) return { thru: null }; const c = await j(`${C}${p.id}/contracts/${Y}`); return { thru: c && c.signedThrough ? +c.signedThrough : null } });
  const out = []; let espn = 0, rule = 0, none = 0;
  people.forEach((p, i) => { const d = byEspn[p.id]; let thru = res[i] && res[i].thru, src = "espn";
    if (!thru && d && d[3] >= Y - 4) { thru = d[3] + 3; src = d[4] === 1 ? "rookie (option)" : "rookie"; if (d[4] === 1 && Y === d[3] + 4) thru = Y }
    if (!thru) { none++; return } if (src === "espn") espn++; else rule++;
    if (thru !== Y) return;
    const acc = p.exp != null ? p.exp : null, kind = src === "rookie (option)" && Y === d[3] + 3 ? "option" : acc == null ? null : acc >= 4 ? "UFA" : acc === 3 ? "RFA" : "ERFA";
    out.push([p.id, d ? d[0] : espnMap[p.id] || null, p.n, p.pos, MAP[p.tm] || p.tm, acc, p.born, src, kind, p.st === "practice-squad" ? 1 : 0]) });
  log(`nfl fa: ${people.length} players · contract year from ESPN ${espn}, rookie rule ${rule}, unknown ${none} · ${out.length} free agents after ${Y}`);
  return { s: Y, at: Date.now(), cols: ["espn", "gsis", "name", "pos", "team", "seasons", "born", "source", "kind", "ps"], p: out, coverage: { espn, rule, unknown: none, players: people.length } };
}

/* ── this week's depth charts, injuries, reserve lists ── */
export async function depth(S, log) {
  const t = await get(`depth_charts/depth_charts_${S}.csv`, log); const latest = {}, byTeam = {}, dates = {};
  rows(t, ["dt", "team", "gsis_id", "player_name", "pos_abb", "pos_slot", "pos_rank"], o => { if (!latest[o.team] || o.dt > latest[o.team]) latest[o.team] = o.dt; (dates[o.team] = dates[o.team] || new Set()).add(o.dt) });
  /* the chart a week earlier (the newest one at least 6 days older), for "what changed this week" (Sam, Sept 30) */
  const before = {}; for (const tm in latest) { const cut = new Date(new Date(latest[tm]).getTime() - 6 * 864e5).toISOString(); before[tm] = [...dates[tm]].filter(d => d <= cut).sort().pop() || null }
  const top = { now: {}, then: {} }, mem = { now: {}, then: {} };
  rows(t, ["dt", "team", "gsis_id", "player_name", "pos_abb", "pos_slot", "pos_rank"], o => {
    const which = o.dt === latest[o.team] ? "now" : o.dt === before[o.team] ? "then" : null;
    if (which && o.gsis_id) (mem[which][o.team] = mem[which][o.team] || {})[o.gsis_id] = [o.player_name, (o.pos_abb || "").toUpperCase()];
    if (which && (+o.pos_rank || 9) === 1 && o.pos_abb && !/^(KR|PR|H|LS)$/i.test(o.pos_abb)) ((top[which][o.team] = top[which][o.team] || {})[o.pos_abb.toUpperCase() + "|" + (+o.pos_slot || 0)] = [o.gsis_id || null, o.player_name]);
    if (o.dt !== latest[o.team]) return; const p = (o.pos_abb || "").toUpperCase(); const k = p === "QB" ? "QB" : p === "RB" || p === "HB" || p === "FB" ? "RB" : p === "WR" || /^[LRS]?WR$/.test(p) ? "WR" : p === "TE" ? "TE" : /^(LT|LG|C|RG|RT)$/.test(p) ? "OL" : /^(LDE|RDE|LDT|RDT|NT|DE|DT|DL|LOLB|ROLB|EDGE)$/.test(p) ? "DL" : /^(SLB|WLB|MLB|LILB|RILB|ILB|OLB|LB)$/.test(p) ? "LB" : /^(LCB|RCB|CB|NB|FS|SS|S|DB)$/.test(p) ? "DB" : null;
    if (!k) return; const T = byTeam[o.team] = byTeam[o.team] || { QB: [], RB: [], WR: [], TE: [], OL: [], DL: [], LB: [], DB: [] };
    T[k].push([o.gsis_id || null, o.player_name, +o.pos_rank || 9, p, +o.pos_slot || 0]) });
  for (const t in byTeam) for (const k in byTeam[t]) { const seen = new Set(); byTeam[t][k] = byTeam[t][k].sort((a, b) => a[2] - b[2] || a[4] - b[4]).filter(x => { const id = x[0] || x[1]; if (seen.has(id)) return false; seen.add(id); return true }).map(x => [x[0], x[1], x[2], x[3]]) }
  /* the injury report: each player's latest week */
  const inj = {}, wk = {}, injW = {};
  rows(await get(`injuries/injuries_${S}.csv`, log), ["gsis_id", "week", "game_type", "report_status", "report_primary_injury", "practice_status", "full_name", "team", "position"], o => {
    if (!o.gsis_id) return; const w = +o.week; ((injW[w] = injW[w] || {})[o.gsis_id] = [o.report_status || null, o.report_primary_injury || null, o.team || null, o.full_name || null, o.position || null]);
    if (wk[o.gsis_id] != null && w < wk[o.gsis_id]) return; wk[o.gsis_id] = w;
    inj[o.gsis_id] = [w, o.report_status || null, o.report_primary_injury || null, o.practice_status || null, o.team || null] });
  /* reserve lists: the latest week of the weekly rosters */
  const res = {}; let lw = 0; const RR = [];
  rows(await get(`weekly_rosters/roster_weekly_${S}.csv`, log), ["gsis_id", "full_name", "team", "position", "status", "status_description_abbr", "week", "rookie_year", "entry_year", "years_exp", "game_type"], o => {
    if (o.game_type && o.game_type !== "REG") return; RR.push(o); if (+o.week > lw) lw = +o.week });
  const rookie = {};
  /* every position on reserve now (Sam, Sept 30: an Injuries page for every team), with the week this stint on reserve started and
     the week he was designated to return (R48), from the weekly rosters */
  const hist = {};
  for (const o of RR) (hist[o.gsis_id] = hist[o.gsis_id] || []).push([+o.week, o.status, o.status_description_abbr || ""]);
  /* each team's own latest roster week (Oct 9: a team on a bye has no rows for the league's newest week, so Carolina read "nobody on reserve") */
  const tlw = {}; for (const o of RR) if (+o.week > (tlw[o.team] || 0)) tlw[o.team] = +o.week;
  const stint = (id, top = lw) => { const H = (hist[id] || []).sort((a, b) => a[0] - b[0]); let since = null, dtr = null;
    for (let w = top; w >= 1; w--) { const x = H.find(h => h[0] === w); if (!x) continue; if (x[1] !== "RES" && x[1] !== "PUP") break; since = w; if (x[2] === "R48") dtr = w }
    return [since, dtr] };
  for (const o of RR) { if (+o.week !== (tlw[o.team] || lw)) continue; const pos = (o.position || "").toUpperCase();
    if (+o.years_exp === 0 || +o.rookie_year === S) rookie[o.gsis_id] = 1;   // every position (Sam, Sept 30: R on the team page's defense and line too)
    if (o.status === "RES" || o.status === "PUP") { const [since, dtr] = stint(o.gsis_id, tlw[o.team] || lw); (res[o.team] = res[o.team] || []).push([o.gsis_id, o.full_name, pos === "HB" || pos === "FB" ? "RB" : pos, o.status_description_abbr || o.status, since, dtr]) } }
  const dt = Object.values(latest).sort().pop() || null;   // the newest depth chart date (nflverse updates them daily)
  /* what changed this week, by team (Sam, Sept 30: "what changed this week per team on their page"), all from nflverse, so it keeps itself
     current: roster moves (this week's roster vs last week's — signed, claimed or traded in, released or traded away, to and from reserve,
     promoted from or sent to the practice squad; game-day inactives aren't moves), depth-chart starters who changed (the chart now vs a
     week earlier) and players new to (or off) the injury report */
  const chg = {}; let chgInjWeek = null;
  { const W = {}; for (const o of RR) { const w = +o.week; if (w !== lw && w !== lw - 1) continue; ((W[w] = W[w] || {})[o.team] = W[w][o.team] || {})[o.gsis_id] = o }
    const onTeam = (w, id) => { for (const tm in W[w] || {}) if (W[w][tm][id] && W[w][tm][id].status !== "CUT") return tm; return null };
    const C = tm => chg[tm] = chg[tm] || { moves: [], dc: [], inj: [] };
    const nm = o => [o.gsis_id, o.full_name, (o.position || "").toUpperCase()];
    if (W[lw] && W[lw - 1]) for (const tm in W[lw]) { const A = W[lw - 1][tm] || {}, B = W[lw][tm];
      for (const id in B) { const b = B[id], a = A[id];
        if (b.status === "CUT") { if (a && a.status !== "CUT") C(tm).moves.push([...nm(b), "released", null]); continue }
        if (!a || a.status === "CUT") { const from = onTeam(lw - 1, id); C(tm).moves.push([...nm(b), from && from !== tm ? "acquired" : b.status === "DEV" ? "signed to practice squad" : "signed", from && from !== tm ? from : null]); continue }
        const x = a.status, y = b.status; if (x === y || (x === "ACT" && y === "INA") || (x === "INA" && y === "ACT")) continue;
        const k = (y === "RES" || y === "PUP") ? "to reserve" + (b.status_description_abbr ? ` (${b.status_description_abbr})` : "") : (x === "RES" || x === "PUP") && (y === "ACT" || y === "INA") ? "activated from reserve" : x === "DEV" && (y === "ACT" || y === "INA") ? "promoted from practice squad" : (x === "ACT" || x === "INA") && y === "DEV" ? "to practice squad" : null;
        if (k) C(tm).moves.push([...nm(b), k, null]) }
      for (const id in A) { const a = A[id]; if (a.status === "CUT" || B[id]) continue; const to = onTeam(lw, id); C(tm).moves.push([...nm(a), to && to !== tm ? "left for" : "released", to && to !== tm ? to : null]) } }
    /* trades show up on the depth charts (updated daily) before the weekly roster file: a player on this team's chart now who was on another
       team's chart a week ago was acquired from that team (Sam, Oct 1: the Joey Porter Jr. trade) */
    { const was = {}; for (const tm in mem.then) for (const id in mem.then[tm]) was[id] = tm;
      for (const tm in mem.now) for (const id in mem.now[tm]) { const from = was[id]; if (!from || from === tm || (mem.then[tm] || {})[id]) continue;
        const c = C(tm); if (c.moves.some(m => m[0] === id)) { for (const m of c.moves) if (m[0] === id && m[3] !== "acquired") { m[3] = "acquired"; m[4] = from } continue }
        c.moves.push([id, mem.now[tm][id][0], mem.now[tm][id][1], "acquired", from]);
        const c2 = C(from); if (!c2.moves.some(m => m[0] === id)) c2.moves.push([id, mem.now[tm][id][0], mem.now[tm][id][1], "left for", tm]) } }
    for (const tm in top.now) { const N = top.now[tm], P = top.then[tm]; if (!P) continue;
      for (const k in N) { const a = P[k], b = N[k]; if (!a || !b || a[0] === b[0]) continue; C(tm).dc.push([k.split("|")[0], b[0], b[1], a[0], a[1]]) } }
    /* injury report: this week's against last week's — until this week's first report is out (Wednesday), last week's against the one before */
    const iw = Object.keys(injW[lw] || {}).length >= 40 ? lw : lw - 1, I1 = injW[iw] || {}, I0 = injW[iw - 1] || {}, bad = v => /out|doubt|quest/i.test(v || "");
    chgInjWeek = iw;
    for (const id in I1) { const b = I1[id], a = I0[id]; if (bad(b[0]) && (!a || a[0] !== b[0])) C(b[2]).inj.push([id, b[3], (b[4] || "").toUpperCase(), b[0], b[1], a && a[0] || null]) }
    for (const id in I0) { const a = I0[id]; if (bad(a[0]) && !I1[id] && W[lw] && W[lw][a[2]] && W[lw][a[2]][id] && W[lw][a[2]][id].status === "ACT") C(a[2]).inj.push([id, a[3], (a[4] || "").toUpperCase(), "cleared", null, a[0]]) } }
  /* everyone on a team this week, any status but cut/retired (Oct 7: Be the GM's free agents were "not on a depth chart", which listed
     Lane Johnson, hurt and off the Eagles' chart, and practice-squad players as free agents) */
  /* each team's own latest week (Oct 16: teams on a bye in the newest week — DET, CIN, MIN, MIA — were left out, so every one of their
     players read as a free agent, and Tyreek Hill, really released, couldn't be told apart from them) */
  const onRoster = [...new Set(RR.filter(o => +o.week === (tlw[o.team] || lw) && o.gsis_id && !/^(CUT|RET)$/.test(o.status || "")).map(o => o.gsis_id))];
  /* each team's practice squad this week (Oct 16 — Sam: a practice squad dropdown on the depth charts): status DEV on the weekly roster */
  const ps = {}; for (const o of RR) { if (+o.week !== (tlw[o.team] || lw) || o.status !== "DEV" || !o.gsis_id) continue; const pos = (o.position || "").toUpperCase();
    (ps[o.team] = ps[o.team] || []).push([o.gsis_id, o.full_name, pos === "HB" || pos === "FB" ? "RB" : pos]) }
  for (const t in ps) ps[t].sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
  return { s: S, at: Date.now(), week: lw, dt, onRoster, ps, psCols: ["gsis", "name", "pos"], cols: ["gsis", "name", "rank", "slot"], teams: byTeam, injCols: ["week", "status", "injury", "practice", "team"], resCols: ["gsis", "name", "pos", "code", "since", "dtr"], inj, reserve: res, rookie,
    chg, chgCols: { moves: ["gsis", "name", "pos", "move", "team"], dc: ["slot", "in gsis", "in", "out gsis", "out"], inj: ["gsis", "name", "pos", "status", "injury", "was"] }, chgSince: before, chgInjWeek };
}

/* ── who was out each week, this season (Oct 21 — Sam: "a counter for how many total games players have missed on your team for being
   declared out or on IR prior to the game … a season counter"): for every week a player's team played, "IR" = on a reserve list for an
   injury (injured reserve, designated to return, PUP, non-football injury; avail.mjs classify 1) and "O" = ruled Out on the week's injury
   report for a real injury, or a game-day inactive listed as hurt (classify 2). Only players with at least one such week are kept, with
   their ESPN and Sleeper ids so the fantasy page can match its rosters. ── */
async function weeklyOut(S, log) {
  const RW = await get0(`weekly_rosters/roster_weekly_${S}.csv`, log), IJ = await get0(`injuries/injuries_${S}.csv`, log); if (!RW) return null;
  const out = new Set(); if (IJ) rows(IJ, ["gsis_id", "week", "game_type", "report_status", "report_primary_injury"], o => { if (o.gsis_id && (o.game_type || "REG") === "REG" && o.report_status === "Out" && !notHurt(o.report_primary_injury || "")) out.add(o.gsis_id + "|" + +o.week) });
  const w = {}, ids = {}, seen = new Set(); let maxW = 0;
  rows(RW, ["gsis_id", "week", "game_type", "status", "status_description_abbr", "espn_id", "sleeper_id", "full_name", "team"], o => {
    if (!o.gsis_id || (o.game_type || "REG") !== "REG") return; const wk = +o.week, k = o.gsis_id + "|" + wk; if (seen.has(k)) return; seen.add(k); if (wk > maxW) maxW = wk;
    const c = classify(o.status, o.status_description_abbr || ""), code = c === 1 ? "IR" : (c === 2 || out.has(k)) ? "O" : null; if (!code) return;
    (w[wk] = w[wk] || {})[o.gsis_id] = [code, o.team || null]; if (!ids[o.gsis_id]) ids[o.gsis_id] = [o.espn_id || null, o.sleeper_id || null, o.full_name || ""] });
  /* someone ruled Out who isn't on that week's roster file yet (a late report) still counts */
  for (const k of out) { const [g, wk] = k.split("|"); if (!(w[wk] && w[wk][g])) (w[wk] = w[wk] || {})[g] = ["O", null] }
  return { s: S, at: Date.now(), lastWeek: maxW, w, wCols: ["code IR|O", "team that week"], ids, idCols: ["espn", "sleeper", "name"] };
}
/* ── referees (Oct 21 — Sam OK'd it: "just do the espn"): every regular-season and playoff game since 2015 with its referee (the crew chief —
   NFL crews stay together all season, so the referee names the crew), the score, the closing spread and total, and each team's penalties
   and penalty yards. Crews: nflverse's officials file (it fills in after the season starts, so this season is mostly missing), and for a
   finished game of this season it doesn't have yet, ESPN's game summary (its officials list), read once and kept. Penalties: nflverse's
   team-week stats. Finished seasons are built once and kept in the pack; only this season is redone each run. The page adds them up. ── */
const REF_COLS = ["id", "season", "type", "week", "ref", "away", "home", "awayScore", "homeScore", "spread", "total", "awayPen", "homePen", "awayPenYds", "homePenYds"];
export async function refsPack(Y, log, prev) {
  const keep = prev && prev.v === 1 && prev.cols && prev.cols.join() === REF_COLS.join() ? prev : null, done = new Set(keep ? keep.done || [] : []);
  const old = keep ? keep.g.filter(r => done.has(r[1])) : [];
  const OF = await get0("officials/officials.csv", log); if (!OF) return keep;
  const refOld = {}; rows(OF, ["game_id", "position", "official_name"], o => { if (o.position === "Referee" && o.game_id) refOld[o.game_id] = o.official_name });
  const SC = (await get0("schedules/games.csv.gz", log)) || (await get0("schedules/games.csv", log)); if (!SC) return keep;
  const espnCrew = keep && keep.espn ? keep.espn : {}; let espnNew = 0;
  const out = [...old], need = [];
  rows(SC, ["game_id", "old_game_id", "espn", "season", "game_type", "week", "away_team", "home_team", "away_score", "home_score", "spread_line", "total_line"], o => {
    const s = +o.season; if (!(s >= 2015) || s > Y || done.has(s)) return; const r = [o.game_id, s, o.game_type, +o.week, refOld[o.old_game_id] || null, o.away_team, o.home_team, num(o.away_score), num(o.home_score), num(o.spread_line), num(o.total_line), null, null, null, null];
    if (r[7] == null) return; out.push(r); if (!r[4]) need.push([r, o.espn]) });
  /* this season's crews nflverse doesn't have yet: ESPN, once per game */
  for (const [r, e] of need) { if (!e) continue; if (espnCrew[e] === undefined && r[1] === Y && espnNew < 120) { espnNew++;
      try { const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e}`, { headers: { "User-Agent": "mycfbbigboard.com data job" } })).json();
        const o = ((j.gameInfo || {}).officials || []).find(x => /^referee$/i.test((x.position && (x.position.displayName || x.position.name)) || "")); espnCrew[e] = o ? o.displayName || o.fullName : null } catch (x) { } }
    if (espnCrew[e]) r[4] = espnCrew[e] }
  /* penalties: team-week stats, per season (finished seasons only once) */
  const bySeason = {}; for (const r of out) if (r[11] == null) (bySeason[r[1]] = bySeason[r[1]] || []).push(r);
  for (const s of Object.keys(bySeason)) { const T = await get0(`stats_team/stats_team_week_${s}.csv`, log); if (!T) continue; const P = {};
    rows(T, ["game_id", "team", "penalties", "penalty_yards"], o => { if (o.game_id) P[o.game_id + "|" + o.team] = [num(o.penalties), num(o.penalty_yards)] });
    for (const r of bySeason[s]) { const a = P[r[0] + "|" + r[5]], h = P[r[0] + "|" + r[6]]; if (a) { r[11] = a[0]; r[13] = a[1] } if (h) { r[12] = h[0]; r[14] = h[1] } } }
  /* a season counts as done once a later one has started and its games have penalties and (nearly all) crews */
  const seasons = [...new Set(out.map(r => r[1]))]; for (const s of seasons) { const L = out.filter(r => r[1] === s); if (s < Y && L.every(r => r[11] != null) && L.filter(r => r[4]).length >= .97 * L.length) done.add(s) }   /* a handful of old games never had a crew listed */
  log(`nfl: refs ${out.length} games · ${out.filter(r => r[4]).length} with a referee · ESPN read ${espnNew}`);
  return { v: 1, at: Date.now(), cols: REF_COLS, g: out, done: [...done], espn: espnCrew };
}
/* what a good copy of each outside-source pack has to contain; a name not listed passes */
export function packProblem(name, o) {
  if (/_nfl-depth$/.test(name)) {
    const T = o && o.teams || {}, withQB = Object.values(T).filter(t => t.QB && t.QB.length && t.QB[0][1]).length;
    if (withQB < 30) return `only ${withQB} teams with a named QB on the depth chart`;
    if (o.week > 0 && o.week <= 18 && Object.keys(o.inj || {}).length < 50) return `only ${Object.keys(o.inj || {}).length} players on the injury report in week ${o.week}`;
  }
  if (/_nfl-players$/.test(name)) { const n = o && o.p ? Object.keys(o.p).length : 0; if (n < 2000) return `only ${n} players`; }
  return null;
}
/* ── the run ── */
export async function buildNfl({ api, getPack, getIndex, curYear, all = false, startsOnly = false, staff = {}, log = console.log }) {
  const t0 = Date.now(), up = {}, index = {}, held = [];
  /* a pack that comes out under 40% of its last size is held back, not written (Oct 6: nflverse moved the schedule file and a run wrote an
     empty schedule over the good one — every NFL view lost this season's games for ten minutes) */
  const prevIx = (getIndex && await getIndex().catch(() => null)) || {};
  const put = async (name, obj) => {
    const gz = gzipSync(Buffer.from(JSON.stringify(obj)));
    /* content checks (Oct 9): a source that still answers but sends nonsense keeps its size and slips past the 40% rule */
    const bad = packProblem(name, obj); if (bad) { held.push(`${name} (${bad})`); log(`nfl: HELD ${name}: ${bad}`); return }
    const was = prevIx[name] && prevIx[name].bytes; if (was > 4096 && gz.length < .4 * was) { held.push(`${name} (${(gz.length / 1024).toFixed(0)} KB vs ${(was / 1024).toFixed(0)} KB)`); log(`nfl: HELD ${name}: ${gz.length} bytes vs ${was} last time`); return }
    const r = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
    index[name] = { sha: r.sha, bytes: r.bytes, at: Date.now() }; up[name] = gz.length; log(`nfl: ${name} ${(gz.length / 1024).toFixed(0)} KB`);
  };
  const Y = curYear, P = n => `p${Y}_nfl-${n}`;
  const G = await games(log);
  /* never write over good data with an empty schedule: every NFL pack hangs off it */
  if (!G || !G.g || G.g.length < 1000) throw new Error(`NFL schedule missing or short (${G && G.g ? G.g.length : 0} games) — nothing written`);
  /* this season's head coaches where nflverse still has last season's (job/staff.mjs) */
  { const hc = {}; for (const [t, v] of Object.entries(staff || {})) if (v.hc) hc[t] = { hc: v.hc, since: v.hcSince, interim: v.hcInterim }; fixCoaches(G, Y, hc, log) }
  await put(P("games"), G);
  const POS = {}, PLN = {};
  let DRAFTED = [], ESPN = {}, KP = {}, PLP = {};
  { const PL = await players(log), DP = PL.def; DRAFTED = PL.drafted; ESPN = PL.espn; KP = PL.kp; delete PL.def; delete PL.drafted; delete PL.espn; delete PL.kp; PLP = PL.p; for (const id in PL.p) { POS[id] = PL.p[id][1]; PLN[id] = PL.p[id][0] } await put(P("players"), PL); await put(P("dplayers"), { cols: PLAYER_COLS.slice(1), p: DP }) }
  const lastPlayed = Math.max(...G.g.filter(g => g[7] != null).map(g => g[1]));
  /* first run under a new year prefix (the calendar rolls over in March): write every season again so the page's p<Y> set is complete */
  if (!all && getPack) { let have = null; try { have = await getPack(P("logs-" + FIRST)) } catch { } if (!have) { all = true; log(`nfl: no ${P("logs-" + FIRST)} yet: writing every season`) } }
  const seasons = []; for (let s = all ? FIRST : Math.max(FIRST, lastPlayed - 1); s <= lastPlayed; s++) seasons.push(s);
  /* Oct 12 (Sam: "we should never be refreshing and running stats for things that never change again"): a finished season (before the one
     being played) is built once at this version and skipped after — its packs stay as they are. Bump NFL_DONE_V when what a season's
     packs hold changes, and every finished season is rebuilt once. */
  const NFL_DONE_V = 3; let DONE = { s: {} }; try { DONE = (getPack && (await getPack(P("done")))) || DONE } catch { } DONE.s = DONE.s || {};
  if (!all) for (let i = seasons.length - 1; i >= 0; i--) if (seasons[i] < lastPlayed && DONE.s[seasons[i]] === NFL_DONE_V) { log(`nfl: ${seasons[i]} finished, kept`); seasons.splice(i, 1) }
  const LOGS = {}, WXP = {}, STN = {};
  /* starts for every season (mode nfldraft: just the starts and the draft grades, every season — the first fill, or a rebuild) */
  const KICK = {};
  if (startsOnly) { for (let s = 2001; s <= lastPlayed; s++) { try { const x = await starts(s, G, log); if (x) STN[s] = x; log(`nfl: starts ${s} ${x ? Object.keys(x.n).length : 0}`) } catch (e) { log("nfl: starts " + s + ": " + e.message) } }
    for (let s = FIRST; s <= lastPlayed; s++) { try { const k = await kicking(s, log); if (k) KICK[s] = k } catch (e) { log("nfl: kicking " + s + ": " + e.message) } } seasons.length = 0 }
  for (const s of seasons) {
    const L = await logs(s, log); if (L) { const DL = L.def; delete L.def; LOGS[s] = L; await put(P("def-" + s), DL) }
    try { const k = await kicking(s, log); if (k) KICK[s] = k } catch (e) { log("nfl: kicking " + s + ": " + e.message) }
    const B = await pbp(s, log);
    /* the play-by-play bonuses onto each game log, then the logs are written */
    if (L) { const BN = (B && B.bon) || {}, at = LOG_COLS.length - BON_N; let nb = 0; for (const id in L.p) { const m = BN[id]; if (!m) continue; for (const row of L.p[id]) { const x = m[row[2]]; if (x) { for (let i = 0; i < BON_N; i++) row[at + i] = x[i]; nb++ } } }
      if (B) delete B.bon; log(`nfl: logs ${s}: bonuses on ${nb} player-games`); await put(P("logs-" + s), L) }
    if (B) { const RI = roleIndex(LOGS[s], POS); for (const d in RI) { const t0 = B.team[d] = B.team[d] || { off: {}, def: {} }; t0.vsRole = RI[d] } B.vsRoleCols = ["games", "yards", "expected yards", "targets (RB: touches)", "expected"];
      if (s >= 2001) { try { B.ol = await olStarters(s, G, log) } catch (e) { log("nfl: OL starters " + s + ": " + e.message) }
        try { const x = await starts(s, G, log); if (x) STN[s] = x } catch (e) { log("nfl: starts " + s + ": " + e.message) } } for (const g in B.wx) if (B.wx[g] != null) WXP[g] = B.wx[g]; delete B.wx;
      /* opportunity quality and in-game injuries, game by game (private inputs for the fantasy projections) */
      { const O = B.opq, IJ = B.inj; delete B.opq; delete B.inj; const inj = {}; const L = LOGS[s];
        if (L && L.p) { const nk = n => String(n || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
          /* "L.McConkey", "C.J.Stroud", "A.St. Brown" against "Ladd McConkey", "C.J. Stroud", "Amon-Ra St. Brown": first initial + last name */
          const sfx = x => String(x || "").replace(/\s(Jr|Sr|II|III|IV|V)\.?$/, "").trim();
          const abbr = id => { const x = sfx(PLN[id]); if (!x) return null; const parts = x.split(/\s+/); return parts.length < 2 ? null : nk(parts[0][0] + parts.slice(1).join("")) };
          const dkey = nm => { const x = sfx(nm), rest = x.replace(/^(?:[A-Z][a-z]?\.(?!\s))+/, ""); return nk(x[0] + rest) };
          const byGame = {}; for (const id in L.p) for (const r of L.p[id]) if (r[2]) (byGame[r[2]] = byGame[r[2]] || []).push(id);
          for (const g in IJ) for (const [nm, q] of IJ[g]) { const k = dkey(nm), hit = (byGame[g] || []).filter(id => abbr(id) === k); if (hit.length === 1) (inj[hit[0]] = inj[hit[0]] || {})[g] = q || 0 } }
        await put(P("opp-" + s), { s, cols: OPQ_COLS, p: O, inj, injNote: "inj[gsis][game] = quarter he was hurt (play-by-play 'was injured during the play')" }) } await put(P("pbp-" + s), B) }
  }
  for (const s of seasons) if (s < lastPlayed && LOGS[s]) DONE.s[s] = NFL_DONE_V; await put(P("done"), DONE);
  /* dynasty inputs (Oct 20, job/dyn.mjs): each player's last 18 league weeks and the windows before, for the page's dynasty model */
  if (!startsOnly) try { const DY = await dynFeatures({ G, PLp: PLP, log, logsOf: async s => LOGS[s] || (getPack ? await getPack(P("logs-" + s)).catch(() => null) : null) });
    if (DY && Object.keys(DY.p).length >= 300) await put(P("dyn"), DY); else log("nfl: dyn: too few players, not written") } catch (e) { log("nfl: dyn: " + e.message) }
  /* kickers and punters by season (this run's seasons over the last run's) */
  if (Object.keys(KICK).length) { let KX = null; try { KX = getPack ? (await getPack(P("kick"))) || (await getPack(`p${Y - 1}_nfl-kick`)) : null } catch { }
    if (!KX || !KX.s) KX = { s: {} }; for (const s in KICK) KX.s[s] = KICK[s]; KX.kCols = K_COLS; KX.pCols = P_COLS; KX.dstCols = DST_COLS; KX.kgCols = KG_COLS; KX.who = KP; KX.whoCols = ["name", "pos", "born", "college", "last", "team"]; await put(P("kick"), KX) }
  /* starts by season (this run's seasons over the last run's) and every GM's draft classes, graded */
  { let ST = null; try { ST = getPack ? (await getPack(P("starts"))) || (await getPack(`p${Y - 1}_nfl-starts`)) : null } catch { }
    if (!ST || !ST.s) ST = { s: {}, g: {} };
    ST.h = ST.h || {}; for (const s in STN) { ST.s[s] = STN[s].n; ST.g[s] = STN[s].games; if (STN[s].h && Object.keys(STN[s].h).length) ST.h[s] = STN[s].h }
    ST.cols = "s[season][gsis] = regular-season games listed first at his spot on the depth chart; g[season] = games a team played; h[season][gsis] = games he missed hurt (IR/PUP/NFI, or Out/Doubtful) and didn't start";
    if (Object.keys(STN).length) await put(P("starts"), ST);
    const inProg = G.g.some(g => g[1] === lastPlayed && g[2] === "REG" && g[7] == null), lastDone = inProg ? lastPlayed - 1 : lastPlayed;
    const missing = []; for (let s = 2001; s <= lastPlayed; s++) if (!ST.s[s]) missing.push(s);
    if (missing.length) log(`nfl: draft grades wait for starts in ${missing.join(", ")} (run mode nfldraft once)`);
    else await put(P("draft"), draftGrades(DRAFTED, ST, lastDone, lastPlayed)) }
  if (startsOnly) { await api("PUT", "/api/pack-index", { body: index }); const mb = Object.values(up).reduce((a, b) => a + b, 0) / 1048576; return { packs: Object.keys(up).length, mb, seasons: [2001, lastPlayed], held, minutes: (Date.now() - t0) / 6e4 } }
  /* rain/snow by game: this run's seasons over the last run's */
  { let pw = null; try { pw = getPack ? (await getPack(P("precip"))) || (await getPack(`p${Y - 1}_nfl-precip`)) : null } catch { }
    await put(P("precip"), { cols: "0 clear · 1 rain · 2 snow", g: { ...((pw && pw.g) || {}), ...WXP } }) }
  /* the defense table covers every season with logs on file this run (and keeps older ones from the last run) */
  let prev = null; try { const r = getPack ? (await getPack(P("teams"))) || (await getPack(`p${Y - 1}_nfl-teams`)) : null; prev = r && r.s ? r : null } catch { }
  const TT = teamsFrom(G, LOGS); if (prev) TT.s = { ...prev.s, ...TT.s };
  await put(P("teams"), TT);
  try { await put(P("depth"), await depth(Y, log)) } catch (e) { log("nfl: depth charts: " + e.message) }
  try { const WO = await weeklyOut(Y, log); if (WO && Object.keys(WO.w).length) await put(P("wkout"), WO) } catch (e) { log("nfl: weekly out: " + e.message) }
  try { let prev = null; try { prev = getPack ? await getPack(P("refs")) : null } catch { } const RF = await refsPack(Y, log, prev); if (RF && RF.g && RF.g.length > 1000) await put(P("refs"), RF) } catch (e) { log("nfl: refs: " + e.message) }
  try { const FA = await freeAgents(Y, DRAFTED, log, ESPN); if (FA && FA.p.length >= 200) await put(P("fa"), FA) } catch (e) { log("nfl: free agents: " + e.message) }
  /* who owns each of the next three drafts' picks, from the trades in ESPN's transaction feed (Sam, Oct 1) */
  try { const PP = await pickPack(Y, log, getPack ? { get: () => getPack(P("txcache")), put: v => put(P("txcache"), v) } : null); if (PP) await put(P("picks"), PP) } catch (e) { log("nfl: picks: " + e.message) }
  try { let ex = null, base = null; try { const r = await api("GET", "/api/job/condeals?base=1"); ex = r && r.deals || null; base = r && r.base || null } catch (e) { log("nfl: contracts: site deals not read (" + e.message + ")") }
    const CP = await contractPack(Y, log, ex, base); if (CP) await put(P("contracts"), CP) } catch (e) { log("nfl: contracts: " + e.message) }
  await api("PUT", "/api/pack-index", { body: index });
  const mb = Object.values(up).reduce((a, b) => a + b, 0) / 1048576;
  return { packs: Object.keys(up).length, mb, seasons, held, minutes: (Date.now() - t0) / 6e4 };
}
