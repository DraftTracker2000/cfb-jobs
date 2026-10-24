/* Helpers the data job shares with the site: reading CSV, the trimmed public data files (nflverse, the pro-day lists) and the
   Sleeper player trim. Copied from the site by tools/sync-jobs.mjs — edit them there. */
const SLP_POS = new Set(["QB", "RB", "WR", "TE", "FB", "HB"]);
const SLP_KEEP = ["full_name", "position", "team", "college", "birth_date", "years_exp",
  "number", "status", "height", "weight"];

export function sleeperTrim(all) {
  const out = {};
  for (const id in all) {
    const p = all[id];
    if (!p || !p.full_name || !SLP_POS.has(String(p.position || "").toUpperCase())) continue;
    const o = {}; for (const k of SLP_KEEP) if (p[k] != null) o[k] = p[k];
    out[id] = o;
  }
  return out;
}

const NFLV = "https://github.com/nflverse/nflverse-data/releases/download/";
const PDREPO = "https://raw.githubusercontent.com/array-carpenter/nfl-draft-data/master/data/";
const SKILL = new Set(["QB", "RB", "WR", "TE", "FB", "HB"]);
export const FILES = {
  /* the draft lists are built by the data job (job/draft.mjs: ESPN's draft pages + nflverse's NFL-sourced files + our starts) and served from
     the prepared copy only — nflverse's draft_picks.csv is scraped from Pro Football Reference, which is off limits (Oct 6) */
  draft:   { url: () => "built:draft", pos: "position",
    keep: ["season","round","pick","team","gsis_id","name","position","college","age","to",
      "probowls","allpro","games","pass_yards","pass_tds","pass_ints","rush_yards","rush_tds",
      "receptions","rec_yards","rec_tds"], min: r => +r.season >= 2005 },
  /* LegacyScore's older classes (1997–2004): the same columns as "draft" */
  draftold: { url: () => "built:draft", pos: "position",
    keep: ["season","round","pick","team","gsis_id","name","position","college","age","to",
      "games","pass_yards","pass_tds","pass_ints","rush_yards","rush_tds","receptions","rec_yards","rec_tds"],
    min: r => +r.season >= 1997 && +r.season <= 2004 },
  /* LegacyScore's undrafted players (rookie season 1997 on, still playing in 1999 or later) */
  legud: { url: () => NFLV + "players/players.csv", pos: "position",
    keep: ["gsis_id","display_name","position","college_name","rookie_season","last_season","birth_date","latest_team","draft_year"],
    min: r => (!r.draft_year || r.draft_year === "NA") && +r.rookie_season >= 1997 && +r.last_season >= 1999 },
  /* every position (the coaches tab judges linemen and defenders too) — career, honors, games */
  draftall: { url: () => "built:draft", pos: "position", allPos: true,
    keep: ["season","round","pick","team","gsis_id","name","position","college","to",
      "probowls","allpro","games","seasons_started"], min: r => +r.season >= 2005 },
  players: { url: () => NFLV + "players/players.csv", pos: "position",
    keep: ["gsis_id","display_name","espn_id","birth_date","position","height","weight","college_name",
      "rookie_season","last_season","latest_team","status","years_of_experience","draft_year","draft_round",
      "draft_pick","draft_team","headshot"], min: r => !r.last_season || +r.last_season >= 2008 },
  /* every position, for matching NFL honors to players (Pro Bowl and All-Pro teams name linemen and defenders too) */
  playersall: { url: () => NFLV + "players/players.csv", pos: "position", allPos: true,
    keep: ["gsis_id","display_name","position","rookie_season","last_season","draft_year","draft_pick"], min: r => !r.last_season || +r.last_season >= 1997 },
  stats:   { url: q => NFLV + `stats_player/stats_player_reg_${q.season}.csv`, pos: "position",
    keep: ["player_id","player_display_name","position","season","recent_team","games","completions",
      "attempts","passing_yards","passing_tds","passing_interceptions","carries","rushing_yards",
      "rushing_tds","receptions","targets","receiving_yards","receiving_tds","fantasy_points_ppr"] },
  prodays: { url: () => PDREPO + "combine_pro_day.csv", pos: "POS_GP",
    keep: ["Year","player","College","POS_GP","POS","athlete_id","Height (in)","Weight (lbs)","Arm Length (in)",
      "Hand Size (in)","40 Yard","10-Yard Split","Vert Leap (in)","Broad Jump (in)","3Cone","Shuttle",
      "Bench Press","nfl_person_id"] },
  combineoff: { url: () => PDREPO + "combine_official.csv", pos: "position_group",
    keep: ["year","player","college","position","position_group","forty_yard_dash","person_id","grade",
      "draft_projection","nfl_comparison"] }
};

export function csvRows(txt) {
  const rows = []; let i = 0, f = "", row = [], q = false;
  while (i < txt.length) { const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = "" }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++;
      row.push(f); f = ""; if (row.length > 1 || row[0]) rows.push(row); row = [] }
    else f += c;
    i++ }
  if (f || row.length) { row.push(f); rows.push(row) }
  return rows }
const esc = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;

export async function trimmedFile(kind, q, fetchFn = fetch) {
  const F = FILES[kind];
  const r = await fetchFn(F.url(q), { redirect: "follow" });
  if (!r.ok) return { status: r.status };
  const rows = csvRows(await r.text());
  const H = rows[0], ix = F.keep.map(k => H.indexOf(k)), ip = H.indexOf(F.pos);
  const out = [F.keep.join(",")];
  for (let n = 1; n < rows.length; n++) { const a = rows[n];
    if (!F.allPos && !SKILL.has(String(a[ip] || "").toUpperCase())) continue;
    if (F.min) { const o = {}; F.keep.forEach((k, j) => o[k] = ix[j] < 0 ? "" : a[ix[j]]); if (!F.min(o)) continue }
    out.push(ix.map(j => esc(j < 0 ? "" : (a[j] || ""))).join(",")) }
  return { status: 200, body: out.join("\n") } }

