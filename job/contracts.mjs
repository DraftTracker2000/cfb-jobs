/* ── the contracts pack (Sam, Oct 2): every player on an NFL roster or practice squad now, and what he counts on the cap this year and the
   next three. Step 1: what the rules decide on their own — drafted rookies (the rookie scale), undrafted rookies and practice-squad players
   (minimums), plus any veteran deal entered from a public report (data/nfl-contracts.json, one record per deal with its source link).
   Everyone else is "terms pending" until his deal is entered. Rosters: nflverse's weekly rosters (the NFL's own roster feed). ── */
import { readFile } from "node:fs/promises";
import { minSalary, psWeekly, rookieDeal, CAP, SRC } from "./caprules.mjs";

const NFLV = "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_";
function csv(t) {
  const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); out.push(row); row = []; f = "" } else f += c }
  if (f || row.length) { row.push(f); out.push(row) } return out;
}
export const CT_COLS = ["name", "team", "pos", "status", "kind", "draftYear", "pick", "yearsExp", "cap", "sb", "est", "src", "srcLabel", "note", "total", "years", "type"];
/* est: 0 reported · 1 later years estimated · 2 every year estimated (only a length + total was reported)
   kind: rookie (drafted, on his scale deal) · udfa (undrafted, first three years) · ps (practice squad) · vet (deal entered from a report)
   · terms (a deal's length and total were reported but not what it counts each year — still counted as pending)
   · option (a first-rounder in year five: option or extension, not entered yet) · pending (a veteran whose deal isn't entered yet)
   · min (terms never reported; practice-squad call-up, in-season signing or checked by hand — counted at the minimum, every year estimated) */
export async function contractPack(Y, log, extra = null, base = null) {
  const r = await fetch(NFLV + Y + ".csv", { redirect: "follow" }); if (!r.ok) { log(`contracts: rosters ${r.status}`); return null }
  const R = csv(await r.text()), H = R[0], ix = k => H.indexOf(k);
  const iW = ix("week"), iG = ix("gsis_id"), iN = ix("full_name"), iT = ix("team"), iP = ix("position"), iS = ix("status"), iE = ix("entry_year"), iR = ix("rookie_year"),
    iD = ix("draft_number"), iX = ix("years_exp"), iGT = ix("game_type");
  let wk = 0; for (let i = 1; i < R.length; i++) { const w = +R[i][iW]; if (w > wk && (!R[i][iGT] || R[i][iGT] === "REG")) wk = w }
  /* the hand-entered deals file: from the site (base, behind the job token) — the public job repo doesn't carry it — else from disk */
  let deals = base && Object.keys(base).length ? { ...base } : {}; if (!Object.keys(deals).length) { try { deals = JSON.parse(await readFile(new URL("../data/nfl-contracts.json", import.meta.url), "utf8")).deals || {} } catch { } }
  if (!Object.keys(deals).length) log("contracts: the deals file wasn't available — veterans show as terms pending");
  /* deals the admin entered on the site (contract upkeep, src/api/condeals.js) win over the file's — they're the newer report */
  if (extra && typeof extra === "object") { const n = Object.keys(extra).length; for (const g in extra) { const { at, by, ...d } = extra[g]; deals[g] = d } if (n) log(`contracts: ${n} deal${n === 1 ? "" : "s"} entered on the site`) }
  /* when each player first shows up on his current team this season, and whether he's been on a practice squad —
     used for the "terms never reported, counted at the minimum" estimate (Sam, Oct 2) */
  const seen = {}; for (let i = 1; i < R.length; i++) { const x = R[i], w = +x[iW]; if (!x[iG] || !w || (x[iGT] && x[iGT] !== "REG")) continue;
    const s = seen[x[iG]] = seen[x[iG]] || { ps: false, first: {} }; if (x[iS] === "DEV") s.ps = true; else if (!(x[iT] in s.first) || w < s.first[x[iT]]) s.first[x[iT]] = w }
  const p = {}, years = [Y, Y + 1, Y + 2, Y + 3], moved = [];
  for (let i = 1; i < R.length; i++) { const x = R[i]; if (+x[iW] !== wk || !x[iG]) continue;
    const g = x[iG], st = x[iS], entry = +x[iE] || +x[iR] || null, pick = +x[iD] || null, exp = +x[iX] || 0, team = x[iT];
    if (!["ACT", "RES", "INA", "PUP", "DEV", "SUS", "NWT", "EXE"].includes(st)) continue;
    let kind, cap = {}, sb = null, est = 1, src = null, lab = null, note = null, total = null, span = null, dt = null;
    /* a deal entered for one team doesn't follow a player who's been traded or released and signed elsewhere —
       he goes back to "terms pending" (and the admin list flags him) until his new deal is entered */
    const d0 = deals[g], d = d0 && !d0.min && (!d0.team || d0.team === team) ? d0 : null;
    if (d0 && !d0.min && !d) moved.push([g, x[iN], d0.team, team]);
    if (d) { kind = d.cap && Object.keys(d.cap).length ? "vet" : "terms"; for (const y of years) if (d.cap && d.cap[y] != null) cap[y] = d.cap[y]; sb = d.sb ?? null; est = d.estAll ? 2 : d.est ? 1 : 0; src = d.src || null; lab = d.srcLabel || null; note = d.note || null; total = d.total ?? null; span = d.years || null; dt = d.type || null }
    else if (st === "DEV") { kind = "ps"; cap[Y] = psWeekly(Y, exp) * 18 }
    else if (pick && entry && entry >= Y - 3) { kind = "rookie"; const rd = rookieDeal(entry, pick); for (const y of years) if (rd.cap[y] != null) cap[y] = rd.cap[y]; sb = rd.sb; est = rd.est ? 1 : 0; src = "scale" }
    else if (pick && entry === Y - 4 && pick <= 32) kind = "option";
    else if (!pick && entry && entry >= Y - 2) { kind = "udfa"; for (let n = 0; Y + n < entry + 3 && n < 4; n++) cap[Y + n] = minSalary(Y + n, exp + n); src = "min" }
    else kind = "pending";
    /* terms never reported: a player who came up from a practice squad or signed during the season, or one checked by hand and
       flagged {min:true} in the deals file, is counted at the league minimum for his experience (the veteran-benefit charge for
       4+ years), for the weeks he's been on the team — an estimate, shown with ≈ */
    if (kind === "pending") { const s = seen[g] || { first: {} }, w0 = s.first[team] || 1, flag = d0 && d0.min && (!d0.team || d0.team === team);
      if (flag || s.ps || w0 > 1) { kind = "min"; est = 2; src = "min"; cap[Y] = Math.round((exp >= 4 ? minSalary(Y, 2) : minSalary(Y, exp)) * (19 - w0) / 18);
        note = "Terms never reported — counted at the league minimum for his experience" + (w0 > 1 ? `, from week ${w0} when he joined` : "") + "." } }
    p[g] = [x[iN], team, x[iP], st, kind, entry, pick, exp, cap, sb, est, src, lab, note, total, span, dt];
  }
  /* each team: what's known for each year, how many players are still pending, and the practice squad on its own */
  const teams = {};
  for (const g in p) { const [, t, , st, kind, , , , cap] = p[g]; const T = teams[t] = teams[t] || { known: {}, pending: 0, option: 0, ps: 0, psN: 0, n: 0 };
    if (kind === "ps") { T.ps += cap[Y] || 0; T.psN++ } else T.n++;
    if (kind === "pending" || kind === "terms") T.pending++; else if (kind === "option") T.option++;
    for (const y in cap) T.known[y] = (T.known[y] || 0) + cap[y] }
  const byKind = {}; for (const g in p) byKind[p[g][4]] = (byKind[p[g][4]] || 0) + 1;
  if (moved.length) log(`contracts: ${moved.length} entered deals no longer match the roster team: ${moved.map(m => m[1] + " " + m[2] + "→" + m[3]).join(", ")}`);
  log(`contracts: week ${wk} rosters, ${Object.keys(p).length} players — ${Object.entries(byKind).map(([k, n]) => k + " " + n).join(", ")}`);
  return { season: Y, week: wk, years, cap: CAP, cols: CT_COLS, p, teams, moved, sources: SRC, at: Date.now() };
}
