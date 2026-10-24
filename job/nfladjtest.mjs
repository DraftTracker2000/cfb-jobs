/* Opponent-adjusted NFL EPA (Oct 11, #331 — Sam on the audit: opponent-adjusted EPA "seems like this is a miss"). Runs as a probe
   (MODE=probe PROBE=nfladjtest); nothing is written to the site.

   For each regular-season play: the offense's EPA, and the defense's average EPA allowed on that kind of play (dropback or run) in its
   OTHER games that season, minus the league average — how much easier or harder that defense was. A player's adjusted EPA per play is
   his raw EPA per play minus the average of that schedule term over his plays. The question: does adjusted predict next season (raw,
   and adjusted) better than raw? Pearson r over 2021→22 … 2024→25, passers (200+ dropbacks both seasons) and rushers (100+ carries). */
import { get0, rows } from "./nfl.mjs";

const cor = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2 } return +(s / Math.sqrt(sa * sb)).toFixed(3) };

export async function run({ log = console.log, seasons = [2021, 2022, 2023, 2024, 2025] }) {
  const Y = {};
  for (const y of seasons) {
    const t = await get0(`pbp/play_by_play_${y}.csv.gz`, log); if (!t) return { ok: false, error: `pbp ${y} missing` };
    const P = [];
    rows(t, ["game_id", "season_type", "posteam", "defteam", "play_type", "epa", "passer_player_id", "rusher_player_id", "qb_dropback", "qb_spike", "qb_kneel", "two_point_attempt"], o => {
      if (o.season_type !== "REG" || !o.posteam || !o.defteam || o.epa === "NA" || o.epa === "" || o.two_point_attempt === "1" || o.qb_spike === "1" || o.qb_kneel === "1") return;
      const db = o.qb_dropback === "1", run = o.play_type === "run" && !db; if (!db && !run) return;
      const who = db ? o.passer_player_id : o.rusher_player_id; P.push({ g: o.game_id, d: o.defteam, k: db ? "p" : "r", e: +o.epa, who: who && who !== "NA" ? who : null }) });
    /* defense totals by game, so a play's schedule term leaves out its own game */
    const D = {}, L = { p: [0, 0], r: [0, 0] };
    for (const p of P) { const x = D[p.d] = D[p.d] || { p: [0, 0], r: [0, 0], g: {} }, gx = x.g[p.g] = x.g[p.g] || { p: [0, 0], r: [0, 0] }; x[p.k][0] += p.e; x[p.k][1]++; gx[p.k][0] += p.e; gx[p.k][1]++; L[p.k][0] += p.e; L[p.k][1]++ }
    const lg = { p: L.p[0] / L.p[1], r: L.r[0] / L.r[1] }, ease = {};
    for (const [d, x] of Object.entries(D)) for (const [g, gx] of Object.entries(x.g)) for (const k of ["p", "r"]) { const n = x[k][1] - gx[k][1]; (ease[d + "|" + g] = ease[d + "|" + g] || {})[k] = n > 0 ? (x[k][0] - gx[k][0]) / n - lg[k] : 0 }
    const M = {};
    for (const p of P) { if (!p.who) continue; const m = (M[p.k + "|" + p.who] = M[p.k + "|" + p.who] || [0, 0, 0]); m[0]++; m[1] += p.e; m[2] += ease[p.d + "|" + p.g][p.k] }
    Y[y] = M; log(`nfladjtest: ${y} · ${P.length} plays`);
  }
  const res = {};
  for (const [k, min, lbl] of [["p", 200, "passers (dropbacks)"], ["r", 100, "rushers (carries)"]]) { const A = [], B = [], C = [], D = [];
    for (const y of seasons.slice(0, -1)) for (const [key, m] of Object.entries(Y[y])) { if (!key.startsWith(k + "|") || m[0] < min) continue; const n = Y[y + 1][key]; if (!n || n[0] < min) continue;
      A.push(m[1] / m[0]); B.push((m[1] - m[2]) / m[0]); C.push(n[1] / n[0]); D.push((n[1] - n[2]) / n[0]) }
    res[lbl] = { n: A.length, rawToNextRaw: cor(A, C), adjToNextRaw: cor(B, C), rawToNextAdj: cor(A, D), adjToNextAdj: cor(B, D), sameYear: cor(A, B) } }
  return { ok: true, res };
}
