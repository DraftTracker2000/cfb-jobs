/* CBBD's own lineups against ours (Oct 12 — Sam, first audit: CBBD lineups and substitutions "probe to compare, but ours seem good").
   Runs as a probe (MODE=probe PROBE=cbblineups); nothing is written. Our five-man units come from the play-by-play pack
   (p{S}_cbb-pbp: teams[id].units = [[five ids], minutes, points for, points against], the 12 most used). For six teams of last season:
   CBBD /lineups/team, then for each of our top 5 units whether CBBD has the same five, and how far apart the minutes and margins are. */
import { configure, cb, getPack } from "./cbb.mjs";

export async function run({ site, token, log = console.log }) {
  configure({ site, token: process.env.JOB_TOKEN || token, mode: "cbb" });
  const S = 2026, PB = await getPack(`p${S}_cbb-pbp`); if (!PB || !PB.teams) return { ok: false, error: "no pbp pack" };
  const teams = await cb("/teams", { season: S }); const nm = Object.fromEntries(teams.map(t => [t.id, t.school]));
  const pick = Object.keys(PB.teams).map(Number).filter(id => nm[id]).sort((a, b) => (PB.teams[b].units || []).length - (PB.teams[a].units || []).length).slice(0, 400);
  const sample = [pick[0], pick[50], pick[100], pick[150], pick[200], pick[250]].filter(Boolean), out = {}; let shape = null;
  for (const id of sample) {
    const L = await cb("/lineups/team", { season: S, team: nm[id] }).catch(e => ({ err: e.message })); if (L && L.err) { out[nm[id]] = L.err; continue }
    if (!shape && L[0]) shape = JSON.stringify(L[0]).slice(0, 500);
    const key = A => A.map(Number).sort((x, y) => x - y).join("-");
    const theirs = {}; for (const x of L || []) { const ids = (x.athletes || []).map(a => a.id); if (ids.length === 5) theirs[key(ids)] = x }
    const ours = (PB.teams[id].units || []).slice(0, 5);
    out[nm[id]] = { cbbdUnits: (L || []).length, ours: ours.map(u => { const t = theirs[key(u[0])], mt = t ? (t.totalSeconds != null ? t.totalSeconds / 60 : t.minutes) : null;
      return { min: u[1], margin: u[2] - u[3], cbbd: t ? { min: mt != null ? Math.round(mt * 10) / 10 : null, margin: t.teamStats && t.opponentStats ? (t.teamStats.points?.total ?? t.teamStats.points) - (t.opponentStats.points?.total ?? t.opponentStats.points) : null } : "not found" } }) };
    log(`cbblineups: ${nm[id]} done`) }
  return { ok: true, shape, out };
}
