/* College coaches' 4th-down calls, this season (Nov 16 — the owner, 7:29 pm: "i was thinking about it for college too"; 7:32 pm: "yes it should
   be on the site"). Seasons 2014 on were counted once into public/data/cfb-team-calls.json (docs/research/patternhunt3/colcalls.mjs); this keeps
   the season in progress current: CFBD's plays week by week through the site's data door, counted the same way, into p<season>_col-calls
   { v, at, season, cols, r: [[team, season, …counts]] }. The page uses this pack's rows for this season in place of the file's.
   Counting, per offense: n4 4th downs where it ran, passed, punted or tried a field goal, leaving out the last 5:00 of the 4th quarter,
   overtime and plays with the score more than 21 apart · go / cv went for it, converted (gained the distance or scored) · sn / sgo / scv the
   same on 4th-and-1–2 from its own 40 on · run / runm, pass / passm by kind (a sack is a pass). Two-point tries aren't counted. */
import { gzipSync } from "node:zlib";
export const COLC_COLS = ["team", "season", "g", "n4", "go", "cv", "sn", "sgo", "scv", "run", "runm", "pass", "passm"];
const RUN = /^(Rush|Rushing Touchdown)$/, PASS = /^(Pass Reception|Pass Incompletion|Passing Touchdown|Sack|Pass Interception Return|Interception|Interception Return Touchdown)$/,
  KICK = /^(Punt|Blocked Punt|Blocked Punt Touchdown|Field Goal Good|Field Goal Missed|Blocked Field Goal|Blocked Field Goal Touchdown|Missed Field Goal Return|Missed Field Goal Return Touchdown)$/;
export function colCallsAdd(X, p, season) {
  const t = p.offense; if (!t) return; const k = t + "|" + season, x = X[k] = X[k] || { gs: new Set(), v: new Array(COLC_COLS.length - 2).fill(0) }, add = n => x.v[COLC_COLS.indexOf(n) - 2]++;
  if (p.gameId) x.gs.add(p.gameId);
  if (p.down !== 4) return; const pt = p.playType || "", run = RUN.test(pt), pass = PASS.test(pt), kick = KICK.test(pt); if (!run && !pass && !kick) return;
  const per = +p.period, clk = p.clock ? (+p.clock.minutes || 0) * 60 + (+p.clock.seconds || 0) : 900, mg = Math.abs((+p.offenseScore || 0) - (+p.defenseScore || 0));
  if (per >= 5 || (per === 4 && clk < 300) || mg > 21) return;
  const go = run || pass, cv = go && (/Touchdown$/.test(pt) || (+p.yardsGained || 0) >= (+p.distance || 99)), short = (+p.distance) <= 2 && (+p.yardsToGoal) <= 60;
  add("n4"); if (go) { add("go"); if (cv) add("cv"); add(run ? "run" : "pass"); if (cv) add(run ? "runm" : "passm") }
  if (short) { add("sn"); if (go) { add("sgo"); if (cv) add("scv") } }
}
export const colCallsRows = X => Object.entries(X).map(([k, x]) => { const [t, s] = k.split("|"); x.v[0] = x.gs.size; return [t, +s, ...x.v] });
export async function colCallsSeason({ site, token, api, season, log = console.log }) {
  const get = async p => { for (let k = 0; k < 3; k++) { try { const r = await fetch(site + "/api/cfbd?path=" + encodeURIComponent(p), { headers: { Authorization: "Bearer " + token } }); if (r.ok) return await r.json() } catch (e) { } await new Promise(r => setTimeout(r, 2000 * (k + 1))) } return null };
  const X = {}; let weeks = 0;
  for (const [st, W] of [["regular", 16], ["postseason", 1]]) for (let w = 1; w <= W; w++) { const P = await get(`/plays?year=${season}&week=${w}&seasonType=${st}`); if (!P || !P.length) continue; weeks++; for (const p of P) colCallsAdd(X, p, season) }
  const r = colCallsRows(X); if (r.length < 100) { log(`college calls: ${season} came out short (${r.length} teams, ${weeks} weeks) — not written`); return null }
  const name = `p${season}_col-calls`, gz = gzipSync(Buffer.from(JSON.stringify({ v: 1, at: Date.now(), season, cols: COLC_COLS, r })));
  const u = await api("PUT", `/api/pack/${name}`, { raw: true, body: gz, headers: { "x-encoding": "gzip", "Content-Type": "application/json" } });
  await api("PUT", "/api/pack-index", { body: { [name]: { sha: u.sha, bytes: u.bytes, at: Date.now() } } });
  return { name, teams: r.length, weeks, bytes: u.bytes };
}
